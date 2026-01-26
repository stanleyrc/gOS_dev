import React, { Component } from "react";
import { PropTypes } from "prop-types";
import { connect } from "react-redux";
import { withTranslation } from "react-i18next";
import { throttle } from "lodash";
import isEqual from "lodash/isEqual";
import * as d3 from "d3";
import Wrapper from "./index.style";
import { measureText } from "../../helpers/utility";
import Grid from "../grid/index";
import MutationPoints from "./mutationPoints.js";
import settingsActions from "../../redux/settings/actions";
import { store } from "../../redux/store";
import {
  MARGINS,
  WEBGL_CONFIG,
  INTERACTION,
  CLICK_PADDING,
  TOOLTIP,
} from "./constants";
import { prepareIntervalData } from "./dataTransformer";

const { updateDomains, updateHoveredLocation } = settingsActions;

class MutationsPlotWebGL extends Component {
  regl = null;
  container = null;
  plotContainer = null;
  mutationPoints = null;
  panels = [];
  instanceId = Math.random().toString(36).substr(2, 9);

  constructor(props) {
    super(props);

    this.state = {};

    this.tooltipShapeId = null;
    this.tooltipElement = null;

    this.rafId = null;
    this.syncDomainsToRedux = (newDomains) => {
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
      }
      this.rafId = requestAnimationFrame(() => {
        this.rafId = null;
        this.props.updateDomains(newDomains);
      });
    };

    this.pendingDomains = null;
    this.cachedIntervalData = null;
  }

  getIntervalData() {
    const { genome } = this.props;
    const { intervals } = genome;

    if (this.cachedIntervalData && this.cachedIntervals === intervals) {
      return this.cachedIntervalData;
    }

    this.cachedIntervalData = prepareIntervalData(intervals);
    this.cachedIntervals = intervals;

    return this.cachedIntervalData;
  }

  updatePanels() {
    let {
      domains,
      width,
      height,
      commonYScale,
      defaultDomain,
      genome,
      commonRangeY,
    } = this.props;
    const { intervals } = genome;
    let stageWidth = width - 2 * MARGINS.gapX;
    let stageHeight = height - 3 * MARGINS.gap;
    let panelWidth =
      (stageWidth - (domains.length - 1) * MARGINS.gapX) / domains.length;
    let panelHeight = stageHeight;

    this.panels = domains.map((domain, index) => {
      let filteredIntervals = intervals.filter(
        (d) => d.startPlace <= domain[1] && d.endPlace >= domain[0]
      );
      const xScale = d3.scaleLinear().domain(domain).range([0, panelWidth]);
      let offset = index * (panelWidth + MARGINS.gapX);

      let panelGenomeScale = d3
        .scaleLinear()
        .domain(defaultDomain)
        .range([0, panelWidth]);

      let zoom = d3
        .zoom()
        .scaleExtent([1, Infinity])
        .translateExtent([
          [0, 0],
          [panelWidth, panelHeight],
        ])
        .extent([
          [0, 0],
          [panelWidth, panelHeight],
        ])
        .on("zoom", (event) => this.zooming(event, index))
        .on("end", (event) => this.zoomEnded(event, index));

      let intervalMax = d3.max(filteredIntervals, (d) => d.y);
      let offsetPerc = 2;
      let yScale = commonRangeY
        ? d3
            .scaleLinear()
            .domain(commonRangeY)
            .range([panelHeight, 0])
            .clamp(true)
        : d3
            .scaleLinear()
            .domain([0, intervalMax + offsetPerc])
            .range([panelHeight, 0])
            .nice();

      return {
        index,
        zoom,
        domain,
        panelWidth,
        panelHeight,
        xScale,
        yScale,
        panelGenomeScale,
        offset,
        intervals: filteredIntervals,
      };
    });

    if (commonYScale) {
      let extent = d3.extent(this.panels.map((d) => d.yScale.domain()).flat());
      let commonYScaleValue = d3
        .scaleLinear()
        .domain(extent)
        .range([panelHeight, 0])
        .clamp(true)
        .nice();
      this.panels.forEach((d) => {
        d.yScale = commonYScaleValue;
      });
    }
  }

  componentDidMount() {
    this.updatePanels();
    this.initializeWebGL();
    this.updateStage(true);
    this.initializePanelZooms();
    // Direct store subscription for real-time hover sync (bypasses React render cycle)
    this.unsubscribeHover = store.subscribe(() => {
      const state = store.getState();
      const { hoveredLocation, hoveredLocationPanelIndex } = state.Settings;
      this.updateHoverLine(hoveredLocation, hoveredLocationPanelIndex);
    });
    // Force re-render now that panels are initialized
    this.forceUpdate();
  }

  shouldComponentUpdate(nextProps, nextState) {
    return (
      nextProps.genome !== this.props.genome ||
      !isEqual(nextProps.domains, this.props.domains) ||
      nextProps.width !== this.props.width ||
      nextProps.height !== this.props.height ||
      nextProps.commonYScale !== this.props.commonYScale ||
      !isEqual(nextProps.commonRangeY, this.props.commonRangeY)
    );
  }

  componentDidUpdate(prevProps) {
    const { domains, zoomedByCmd, width, height } = this.props;

    const domainsChanged = !isEqual(prevProps.domains, domains);
    const dataChanged = prevProps.genome !== this.props.genome;
    const sizeChanged = prevProps.width !== width || prevProps.height !== height;

    if (sizeChanged) {
      this.cleanupWebGL();
      this.initializeWebGL();
      this.updateStage(true);
      this.initializePanelZooms();
      return;
    }

    // Handle domain changes - use existing panels for zoom transform calculation
    // (panels get updated in render via updatePanels call)
    if (domainsChanged) {
      this.pendingDomains = null;
      // Apply zoom transform using existing panels' panelGenomeScale
      this.panels.forEach((panel, index) => {
        const domain = domains[index];
        if (!domain) return;
        const s = [
          panel.panelGenomeScale(domain[0]),
          panel.panelGenomeScale(domain[1]),
        ];
        d3.select(this.plotContainer)
          .select(`#panel-rect-${index}`)
          .attr("preserveAspectRatio", "xMinYMin meet")
          .call(
            panel.zoom.filter(
              (event) => !zoomedByCmd || (!event.button && event.metaKey)
            )
          );
        d3.select(this.plotContainer)
          .select(`#panel-rect-${index}`)
          .call(
            panel.zoom.filter(
              (event) => !zoomedByCmd || (!event.button && event.metaKey)
            ).transform,
            d3.zoomIdentity
              .scale(panel.panelWidth / (s[1] - s[0]))
              .translate(-s[0], 0)
          );
      });
    }

    // Update panels and stage for data changes
    this.updatePanels();
    this.updateStage(dataChanged);
  }

  updateStage(reloadData = false) {
    const { domains, width, height, commonRangeY } = this.props;

    const stageWidth = width - 2 * MARGINS.gapX;
    const stageHeight = height - 3 * MARGINS.gap;

    if (reloadData) {
      const data = this.getIntervalData();
      this.mutationPoints.setData(
        data.dataXHigh,
        data.dataXLow,
        data.dataY,
        data.dataColor,
        data.dataShape,
        data.dataOpacity,
        data.dataSize
      );
    }

    const yDomain = this.panels[0]?.yScale.domain() || [0, 10];

    this.mutationPoints.updateDomains(stageWidth, stageHeight, domains, yDomain);
    this.mutationPoints.render();
  }

  updateHoverLine(hoveredLocation, hoveredLocationPanelIndex) {
    const { chromoBins } = this.props;

    if (this.panels[hoveredLocationPanelIndex]) {
      d3.select(this.plotContainer)
        .select(`#hovered-location-line-${hoveredLocationPanelIndex}`)
        .classed("hidden", !hoveredLocation)
        .attr(
          "transform",
          `translate(${[
            this.panels[hoveredLocationPanelIndex].xScale(hoveredLocation) ||
              INTERACTION.OFFSCREEN_POSITION,
            0,
          ]})`
        );
      d3.select(this.plotContainer)
        .select(`#hovered-location-text-${hoveredLocationPanelIndex}`)
        .attr(
          "x",
          this.panels[hoveredLocationPanelIndex].xScale(hoveredLocation) ||
            INTERACTION.OFFSCREEN_POSITION
        )
        .text(
          Object.values(chromoBins)
            .filter(
              (chromo) =>
                hoveredLocation < chromo.endPlace &&
                hoveredLocation >= chromo.startPlace
            )
            .map((chromo) =>
              d3.format(",")(
                Math.floor(chromo.scaleToGenome.invert(hoveredLocation))
              )
            )
        );
    }
  }

  componentWillUnmount() {
    if (this.unsubscribeHover) {
      this.unsubscribeHover();
    }
    this.cleanupWebGL();
  }

  /**
   * Initializes WebGL context and mutation points renderer.
   * Called on mount and when component size changes.
   */
  initializeWebGL() {
    this.regl = require("regl")({
      extensions: ["ANGLE_instanced_arrays"],
      container: this.container,
      pixelRatio: WEBGL_CONFIG.PIXEL_RATIO,
      attributes: {
        antialias: true,
        depth: true,
        stencil: false,
        preserveDrawingBuffer: false,
      },
    });

    this.regl.on("lost", () => {
      console.log("MutationsPlot: lost webgl context");
    });

    this.regl.on("restore", () => {
      console.log("MutationsPlot: webgl context restored");
      this.mutationPoints = new MutationPoints(this.regl, MARGINS.gapX, 0);
      this.updateStage(true);
    });

    this.mutationPoints = new MutationPoints(this.regl, MARGINS.gapX, 0);
  }

  /**
   * Cleans up WebGL resources to prevent memory leaks.
   * Called on unmount and before reinitializing on size change.
   */
  cleanupWebGL() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.mutationPoints) {
      this.mutationPoints.destroy();
      this.mutationPoints = null;
    }
    try {
      if (this.regl) {
        this.regl.destroy();
        this.regl = null;
      }
    } catch (err) {
      console.log(`MutationsPlot webgl cleanup failed: ${err}`);
    }
  }

  /**
   * Sets up D3 zoom behavior for all panels.
   * Handles zoom filtering based on zoomedByCmd prop.
   */
  initializePanelZooms() {
    const { domains, zoomedByCmd } = this.props;
    
    this.panels.forEach((panel, index) => {
      const domain = domains[index];
      const s = [
        panel.panelGenomeScale(domain[0]),
        panel.panelGenomeScale(domain[1]),
      ];
      d3.select(this.plotContainer)
        .select(`#panel-rect-${index}`)
        .attr("preserveAspectRatio", "xMinYMin meet")
        .call(
          panel.zoom.filter(
            (event) => !zoomedByCmd || (!event.button && event.metaKey)
          )
        );
      d3.select(this.plotContainer)
        .select(`#panel-rect-${index}`)
        .call(
          panel.zoom.filter(
            (event) => !zoomedByCmd || (!event.button && event.metaKey)
          ).transform,
          d3.zoomIdentity
            .scale(panel.panelWidth / (s[1] - s[0]))
            .translate(-s[0], 0)
        );
    });
  }

  zooming(event, index) {
    let panel = this.panels[index];
    let newDomain = event.transform
      .rescaleX(panel.panelGenomeScale)
      .domain()
      .map(Math.round);
    let newDomains = [...this.props.domains];
    let selection = Object.assign([], newDomain);

    let otherSelections = this.props.domains.filter((d, i) => i !== index);
    let lowerEdge = d3.max(
      otherSelections
        .filter(
          (d, i) => selection && d[0] <= selection[0] && selection[0] <= d[1]
        )
        .map((d, i) => d[1])
    );

    let upperEdge = d3.min(
      otherSelections
        .filter(
          (d, i) => selection && d[1] >= selection[0] && selection[1] <= d[1]
        )
        .map((d, i) => d[0])
    );

    if (upperEdge !== undefined && selection[1] >= upperEdge) {
      selection[1] = upperEdge;
      selection[0] = d3.min([selection[0], upperEdge - 1]);
    }

    if (lowerEdge !== undefined && selection[0] <= lowerEdge) {
      selection[0] = lowerEdge;
      selection[1] = d3.max([selection[1], lowerEdge + 1]);
    }

    newDomains[index] = selection;

    const newDomainsStr = newDomains.toString();
    const propsDomainsStr = this.props.domains.toString();
    const pendingDomainsStr = this.pendingDomains?.toString();
    if (newDomainsStr !== propsDomainsStr && newDomainsStr !== pendingDomainsStr) {
      this.pendingDomains = newDomains;
      this.syncDomainsToRedux(newDomains);
    }
  }

  zoomEnded(event, index) {
    this.zooming(event, index);
  }

  throttledUpdateHoveredLocation = throttle((location, panelIndex) => {
    this.props.updateHoveredLocation(location, panelIndex);
  }, INTERACTION.THROTTLE_DELAY, { leading: true, trailing: false });

  findNearestInterval(panelIndex, mouseX, mouseY) {
    const panel = this.panels[panelIndex];
    if (!panel || !panel.intervals) return null;

    const { genome } = this.props;
    const allIntervals = genome.intervals;

    const hitRadius = INTERACTION.HIT_RADIUS;
    let nearest = null;
    let nearestIndex = -1;
    let minDist = hitRadius;

    panel.intervals.forEach((interval) => {
      // -1 offset to match WebGL rendering alignment (see dataTransformer.js)
      const x = panel.xScale(Math.floor((interval.startPlace + interval.endPlace) / 2) - 1);
      const y = panel.yScale(interval.y);
      const dist = Math.sqrt((x - mouseX) ** 2 + (y - mouseY) ** 2);

      if (dist < minDist) {
        minDist = dist;
        nearest = interval;
        // Find index in the original intervals array (used by WebGL buffer)
        nearestIndex = allIntervals.indexOf(interval);
      }
    });

    return { interval: nearest, index: nearestIndex };
  }

  updateTooltip(visible, x, y, text, shapeId) {
    if (!this.tooltipElement) return;

    if (visible && text) {
      const tooltipWidth = d3.max(text, (d) => measureText(`${d.label}: ${d.value}`, TOOLTIP.FONT_SIZE) + TOOLTIP.PADDING_X);
      const tooltipHeight = text.length * TOOLTIP.LINE_HEIGHT + TOOLTIP.PADDING_Y;

      d3.select(this.tooltipElement)
        .attr("transform", `translate(${x}, ${y})`)
        .style("display", "block");

      d3.select(this.tooltipElement).select("rect")
        .attr("width", tooltipWidth)
        .attr("height", tooltipHeight);

      const textEl = d3.select(this.tooltipElement).select("text");
      textEl.selectAll("tspan").remove();
      text.forEach((d, i) => {
        textEl.append("tspan")
          .attr("x", 10)
          .attr("y", 18 + i * TOOLTIP.LINE_HEIGHT)
          .html(`<tspan style="font-weight:bold">${d.label}</tspan>: ${d.value}`);
      });

      this.tooltipShapeId = shapeId;
    } else {
      d3.select(this.tooltipElement).style("display", "none");
      this.tooltipShapeId = null;
    }
  }

  handlePanelMouseMove = (e, panelIndex) => {
    if (panelIndex > -1) {
      const panel = this.panels[panelIndex];
      const pointerPos = d3.pointer(e);

      this.throttledUpdateHoveredLocation(
        panel.xScale.invert(pointerPos[0]),
        panelIndex
      );

      const result = this.findNearestInterval(panelIndex, pointerPos[0], pointerPos[1]);
      const interval = result?.interval;
      const intervalIndex = result?.index;

      if (interval && interval.tooltipContent) {
        const { width, height } = this.props;
        const offsetX = e.nativeEvent.offsetX;
        const offsetY = e.nativeEvent.offsetY;

        const diffY = d3.min([
          0,
          height - offsetY - interval.tooltipContent.length * TOOLTIP.LINE_HEIGHT - TOOLTIP.PADDING_Y,
        ]);
        const diffX = d3.min([
          0,
          width - offsetX - d3.max(interval.tooltipContent, (d) =>
            measureText(`${d.label}: ${d.value}`, TOOLTIP.FONT_SIZE)
          ) - TOOLTIP.PADDING_X,
        ]);

        if (this.tooltipShapeId !== interval.primaryKey) {
          this.updateTooltip(
            true,
            offsetX + diffX,
            offsetY + diffY,
            interval.tooltipContent,
            interval.primaryKey
          );
          // Update WebGL highlight
          if (this.mutationPoints && intervalIndex >= 0) {
            this.mutationPoints.setHighlight(intervalIndex);
            this.mutationPoints.render();
          }
        }
      } else if (this.tooltipShapeId) {
        this.updateTooltip(false);
        // Clear WebGL highlight
        if (this.mutationPoints) {
          this.mutationPoints.clearHighlight();
          this.mutationPoints.render();
        }
      }
    }
  };

  handlePanelMouseOut = (e, panelIndex) => {
    if (panelIndex > -1) {
      this.props.updateHoveredLocation(null, panelIndex);
      if (this.tooltipShapeId) {
        this.updateTooltip(false);
        // Clear WebGL highlight
        if (this.mutationPoints) {
          this.mutationPoints.clearHighlight();
          this.mutationPoints.render();
        }
      }
    }
  };

  handleIntervalClick(panelIndex, shape, padding = CLICK_PADDING.INTERVAL) {
    let newDomains = JSON.parse(JSON.stringify(this.props.domains));
    newDomains[panelIndex] = [
      shape.startPlace - padding,
      shape.endPlace + padding,
    ];
    this.syncDomainsToRedux(newDomains);
  }

  handleMutationClick(panelIndex, shape, padding = CLICK_PADDING.MUTATION) {
    let newDomains = JSON.parse(JSON.stringify(this.props.domains));
    let midPoint = Math.floor((shape.startPlace + shape.endPlace) / 2);
    newDomains[panelIndex] = [midPoint - padding - 2, midPoint + padding];
    this.syncDomainsToRedux(newDomains);
  }

  handlePanelClick = (e, panelIndex) => {
    if (panelIndex > -1) {
      const pointerPos = d3.pointer(e);
      const result = this.findNearestInterval(panelIndex, pointerPos[0], pointerPos[1]);
      const interval = result?.interval;

      if (interval) {
        if (e.shiftKey) {
          this.handleIntervalClick(panelIndex, interval);
        } else {
          this.handleMutationClick(panelIndex, interval);
        }
      }
    }
  };

  render() {
    const { width, height, yAxisTitle, yAxis2Title, chromoBins } = this.props;
    // Recompute panels with current props to keep Grid scales in sync during zoom/pan
    this.updatePanels();
    const clipId = this.instanceId;

    const stageWidth = width - 2 * MARGINS.gapX;
    const stageHeight = height - 3 * MARGINS.gap;

    return (
      <Wrapper className="ant-wrapper" margins={MARGINS} height={height}>
        {/* WebGL canvas for mutations */}
        <div
          className="mutations-webgl"
          style={{ width: stageWidth, height: stageHeight }}
          ref={(elem) => (this.container = elem)}
        />

        {/* SVG overlay for axes, grid, hover line */}
        <svg
          width={width}
          height={height}
          className="plot-container"
          ref={(elem) => (this.plotContainer = elem)}
        >
          <defs>
            <clipPath
              key={`cuttOffViewPane-${clipId}`}
              id={`cuttOffViewPane-${clipId}`}
            >
              <rect x={0} y={0} width={stageWidth} height={stageHeight} />
            </clipPath>
            {this.panels.map((panel, i) => (
              <clipPath
                key={`cuttOffViewPane-${clipId}-${panel.index}`}
                id={`cuttOffViewPane-${clipId}-${panel.index}`}
              >
                <rect
                  x={0}
                  y={0}
                  width={panel.panelWidth}
                  height={2 * panel.panelHeight}
                />
              </clipPath>
            ))}
          </defs>
          <text
            className="y-axis-title"
            transform={`translate(${[MARGINS.gapX / 2, MARGINS.gapY / 3]})`}
          >
            {yAxisTitle}
          </text>
          <text
            className="y-axis-title"
            transform={`translate(${[width, MARGINS.gapY / 3]})`}
            textAnchor="end"
          >
            {yAxis2Title}
          </text>
          <g transform={`translate(${[MARGINS.gapX, MARGINS.gap]})`}>
            {this.panels.map((panel, i) => (
              <g
                key={`panel-${panel.index}`}
                id={`panel-${panel.index}`}
                transform={`translate(${[panel.offset, 0]})`}
              >
                <g>
                  <Grid
                    scaleX={panel.xScale}
                    scaleY={panel.yScale}
                    axisWidth={panel.panelWidth}
                    axisHeight={panel.panelHeight}
                    chromoBins={chromoBins}
                  />
                  <line
                    className="hovered-location-line hidden"
                    id={`hovered-location-line-${panel.index}`}
                    y1={0}
                    y2={panel.panelHeight}
                  />
                  <text
                    className="hovered-location-text"
                    id={`hovered-location-text-${panel.index}`}
                    x={INTERACTION.OFFSCREEN_POSITION}
                    dx={5}
                    dy={10}
                  ></text>
                </g>
                <rect
                  className="zoom-background"
                  id={`panel-rect-${panel.index}`}
                  x={0.5}
                  width={panel.panelWidth}
                  height={panel.panelHeight}
                  onMouseMove={(e) => this.handlePanelMouseMove(e, i)}
                  onMouseOut={(e) => this.handlePanelMouseOut(e, i)}
                  onClick={(e) => this.handlePanelClick(e, i)}
                  style={{
                    stroke: "steelblue",
                    fill: "transparent",
                    strokeWidth: 0,
                    opacity: 0.375,
                    pointerEvents: "all",
                  }}
                />
              </g>
            ))}
          </g>
          {/* Tooltip */}
          <g
            className="tooltip"
            ref={(elem) => (this.tooltipElement = elem)}
            style={{ display: "none" }}
            pointerEvents="none"
          >
            <rect
              x="0"
              y="0"
              width={100}
              height={50}
              rx="5"
              ry="5"
              fill="rgb(97, 97, 97)"
              fillOpacity="0.67"
            />
            <text x="10" y="28" fontSize="12" fill="#FFF"></text>
          </g>
        </svg>
      </Wrapper>
    );
  }
}

MutationsPlotWebGL.propTypes = {
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  genome: PropTypes.object,
  chromoBins: PropTypes.object,
  defaultDomain: PropTypes.array,
};

MutationsPlotWebGL.defaultProps = {
  commonYScale: false,
  yAxisTitle: "",
  yAxis2Title: "",
  commonRangeY: null,
};

const mapDispatchToProps = (dispatch) => ({
  updateDomains: (domains) => dispatch(updateDomains(domains)),
  updateHoveredLocation: (hoveredLocation, panelIndex) =>
    dispatch(updateHoveredLocation(hoveredLocation, panelIndex)),
});

const mapStateToProps = (state) => ({
  chromoBins: state.Settings.chromoBins,
  defaultDomain: state.Settings.defaultDomain,
  domains: state.Settings.domains,
  zoomedByCmd: state.Settings.zoomedByCmd,
  hoveredLocation: state.Settings.hoveredLocation,
  hoveredLocationPanelIndex: state.Settings.hoveredLocationPanelIndex,
});

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(MutationsPlotWebGL));
