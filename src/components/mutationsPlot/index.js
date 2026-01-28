import React, { Component } from "react";
import { PropTypes } from "prop-types";
import { connect } from "react-redux";
import { withTranslation } from "react-i18next";
import { throttle } from "lodash";
import * as d3 from "d3";
import { Stage, Layer, Path, Group } from "react-konva";
import Wrapper from "./index.style";
import { measureText, merge } from "../../helpers/utility";
import Grid from "../grid/index";
import settingsActions from "../../redux/settings/actions";

const { updateDomains, updateHoveredLocation } = settingsActions;

const margins = {
  gap: 24,
  gapX: 50,
  bar: 10,
  gapY: 24,
  yTicksCount: 10,
};

class MutationsPlot extends Component {
  constructor(props) {
    super(props);
    this.zoom = null;
    this.container = null;
    this.grid = null;
    this.konvaStage = null;
    this.konvaLayer = null;

    this.state = {
      showGrid: true,
    };

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
    let stageWidth = width - 2 * margins.gapX;
    let stageHeight = height - 3 * margins.gap;
    let panelWidth =
      (stageWidth - (domains.length - 1) * margins.gapX) / domains.length;
    let panelHeight = stageHeight;
    this.connections = [];
    this.panels = domains.map((domain, index) => {
      let filteredIntervals = intervals.filter(
        (d) => d.startPlace <= domain[1] && d.endPlace >= domain[0]
      );
      const xScale = d3.scaleLinear().domain(domain).range([0, panelWidth]);
      let offset = index * (panelWidth + margins.gapX);

      let domainWidth = domain[1] - domain[0];
      let range = [
        index * (panelWidth + margins.gapX),
        (index + 1) * panelWidth + index * margins.gapX,
      ];
      let scale = d3.scaleLinear().domain(domain).range(range);
      let innerScale = d3.scaleLinear().domain(domain).range([0, panelWidth]);
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
      let panel = {
        index,
        zoom,
        domain,
        panelWidth,
        panelHeight,
        xScale,
        yScale,
        panelGenomeScale,
        offset,
        intervals: filteredIntervals.sort((a, b) =>
          d3.ascending(a.weight, b.weight)
        ),
        domainWidth,
        range,
        scale,
        innerScale,
      };
      return panel;
    });

    if (commonYScale) {
      let extent = d3.extent(this.panels.map((d) => d.yScale.domain()).flat());
      let commonYScale = d3
        .scaleLinear()
        .domain(extent)
        .range([panelHeight, 0])
        .clamp(true)
        .nice();
      this.panels.forEach((d) => {
        d.yScale = commonYScale;
      });
    }
  }

  shouldComponentUpdate(nextProps, nextState) {
    return (
      nextProps.genome.toString() !== this.props.genome.toString() ||
      nextProps.domains.toString() !== this.props.domains.toString() ||
      nextProps.width !== this.props.width ||
      nextProps.height !== this.props.height ||
      nextProps.commonYScale !== this.props.commonYScale ||
      nextProps.commonRangeY !== this.props.commonRangeY
    );
  }

  componentDidMount() {
    const { domains, zoomedByCmd } = this.props;
    this.panels.forEach((panel, index) => {
      let domain = domains[index];
      var s = [
        panel.panelGenomeScale(domain[0]),
        panel.panelGenomeScale(domain[1]),
      ];
      d3.select(this.container)
        .select(`#panel-rect-${index}`)
        .attr("preserveAspectRatio", "xMinYMin meet")
        .call(
          panel.zoom.filter(
            (event) => !zoomedByCmd || (!event.button && event.metaKey)
          )
        );
      d3.select(this.container)
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

  componentDidUpdate(prevProps) {
    const { domains, zoomedByCmd } = this.props;

    const domainsChanged = prevProps.domains.toString() !== domains.toString();
    if (domainsChanged) {
      this.panels.forEach((panel, index) => {
        const domain = domains[index];
        const s = [
          panel.panelGenomeScale(domain[0]),
          panel.panelGenomeScale(domain[1]),
        ];
        d3.select(this.container)
          .select(`#panel-rect-${index}`)
          .attr("preserveAspectRatio", "xMinYMin meet")
          .call(
            panel.zoom.filter(
              (event) => !zoomedByCmd || (!event.button && event.metaKey)
            )
          );
        d3.select(this.container)
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
  }

  componentWillUnmount() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
    }
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
    const pendingDomainsStr = this.pendingDomains?.toString();
    if (newDomainsStr !== pendingDomainsStr) {
      this.pendingDomains = newDomains;
      this.syncDomainsToRedux(newDomains);
    }
  }

  zoomEnded(event, index) {
    this.zooming(event, index);
  }

  handleIntervalClick(panelIndex, shape, padding = 1000) {
    let newDomains = JSON.parse(JSON.stringify(this.props.domains));
    newDomains[panelIndex] = [
      shape.startPlace - padding,
      shape.endPlace + padding,
    ];
    this.syncDomainsToRedux(newDomains);
  }

  handleMutationClick(panelIndex, shape, padding = 30) {
    let newDomains = JSON.parse(JSON.stringify(this.props.domains));
    let midPoint = Math.floor((shape.startPlace + shape.endPlace) / 2);
    newDomains[panelIndex] = [midPoint - padding - 2, midPoint + padding];
    this.syncDomainsToRedux(newDomains);
  }

  throttledUpdateHoveredLocation = throttle((location, panelIndex) => {
    this.props.updateHoveredLocation(location, panelIndex);
  }, 16, { leading: true, trailing: false });

  getKonvaCoords(e, panelIndex) {
    const panel = this.panels[panelIndex];
    const pointerPos = d3.pointer(e);

    const konvaX = margins.gapX + panel.offset + pointerPos[0];
    const konvaY = margins.gap + pointerPos[1];

    return { konvaX, konvaY };
  }

  updateTooltip(visible, x, y, text, shapeId) {
    if (!this.tooltipElement) return;

    if (visible && text) {
      const tooltipWidth = d3.max(text, (d) => measureText(`${d.label}: ${d.value}`, 12) + 30);
      const tooltipHeight = text.length * 16 + 12;

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
          .attr("y", 18 + i * 16)
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
      this.throttledUpdateHoveredLocation(
        this.panels[panelIndex].xScale.invert(d3.pointer(e)[0]),
        panelIndex
      );

      if (this.konvaStage) {
        const { konvaX, konvaY } = this.getKonvaCoords(e, panelIndex);

        const shape = this.konvaStage.getIntersection({ x: konvaX, y: konvaY });

        if (shape && shape.attrs.id && shape.attrs.type === "interval") {
          const interval = this.props.genome.intervals.find(
            (interval) => interval.primaryKey === shape.attrs.id
          );
          if (interval) {
            const diffY = d3.min([
              0,
              this.props.height -
                e.nativeEvent.offsetY -
                interval.tooltipContent.length * 16 -
                12,
            ]);
            const diffX = d3.min([
              0,
              this.props.width -
                e.nativeEvent.offsetX -
                d3.max(interval.tooltipContent, (d) =>
                  measureText(`${d.label}: ${d.value}`, 12)
                ) -
                30,
            ]);

            if (this.tooltipShapeId !== interval.primaryKey) {
              this.updateTooltip(
                true,
                e.nativeEvent.offsetX + diffX,
                e.nativeEvent.offsetY + diffY,
                interval.tooltipContent,
                interval.primaryKey
              );
            }
            return;
          }
        }
      }

      if (this.tooltipShapeId) {
        this.updateTooltip(false);
      }
    }
  };

  handlePanelMouseOut = (e, panelIndex) => {
    if (panelIndex > -1) {
      this.props.updateHoveredLocation(null, panelIndex);
      if (this.tooltipShapeId) {
        this.updateTooltip(false);
      }
    }
  };

  handlePanelClick = (e, panelIndex) => {
    if (panelIndex > -1 && this.konvaStage) {
      const { konvaX, konvaY } = this.getKonvaCoords(e, panelIndex);

      const shape = this.konvaStage.getIntersection({ x: konvaX, y: konvaY });
      if (shape && shape.attrs.id && shape.attrs.type === "interval") {
        const interval = this.props.genome.intervals.find(
          (interval) => interval.primaryKey === shape.attrs.id
        );
        if (interval) {
          this.handleMutationClick(panelIndex, interval);
        }
      }
    }
  };

  render() {
    const { width, height, annotation, yAxisTitle, yAxis2Title, chromoBins } =
      this.props;
    this.updatePanels();
    let randID = Math.random();

    const stageWidth = width - 2 * margins.gapX;
    const stageHeight = height - 3 * margins.gap;

    return (
      <Wrapper className="ant-wrapper">
        <div style={{ position: "relative" }}>
          <svg
            width={width}
            height={height}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              pointerEvents: "none",
            }}
            ref={(elem) => (this.container = elem)}
          >
            <defs>
              <clipPath
                key={`cuttOffViewPane-${randID}`}
                id={`cuttOffViewPane-${randID}`}
              >
                <rect x={0} y={0} width={stageWidth} height={stageHeight} />
              </clipPath>
              {this.panels.map((panel, i) => (
                <clipPath
                  key={`cuttOffViewPane-${randID}-${panel.index}`}
                  id={`cuttOffViewPane-${randID}-${panel.index}`}
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
              transform={`translate(${[margins.gapX / 2, margins.gapY / 3]})`}
            >
              {yAxisTitle}
            </text>
            <text
              className="y-axis-title"
              transform={`translate(${[width, margins.gapY / 3]})`}
              textAnchor="end"
            >
              {yAxis2Title}
            </text>
            <g transform={`translate(${[margins.gapX, margins.gap]})`}>
              {this.panels.map((panel, i) => (
                <g
                  key={`panel-${panel.index}`}
                  id={`panel-${panel.index}`}
                  transform={`translate(${[panel.offset, 0]})`}
                >
                  <g ref={(elem) => (this.grid = elem)}>
                    <Grid
                      scaleX={panel.xScale}
                    scaleY={panel.yScale}
                    axisWidth={panel.panelWidth}
                    axisHeight={panel.panelHeight}
                    chromoBins={chromoBins}
                  />
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

          <Stage
            width={width}
            height={height}
            className="konva-stage"
            ref={(elem) => (this.konvaStage = elem)}
          >
            <Layer ref={(elem) => (this.konvaLayer = elem)}>
              {this.panels.map((panel, panelIdx) => (
                <Group
                  key={`konva-panel-${panel.index}`}
                  x={margins.gapX + panel.offset}
                  y={margins.gap}
                >
                  {panel.intervals.map((d, idx) => (
                    <Path
                      key={d.primaryKey || idx}
                      id={d.primaryKey}
                      type="interval"
                      data={d.mutationSymbol}
                      x={panel.xScale(
                        Math.floor((d.startPlace + d.endPlace) / 2) - 1
                      )}
                      y={panel.yScale(d.y)}
                      fill={d.fill || d.color}
                      stroke={d.stroke}
                      strokeWidth={1}
                      opacity={d.isProteinCoded ? 1 : 0.33}
                    />
                  ))}
                </Group>
              ))}
            </Layer>
          </Stage>
        </div>
      </Wrapper>
    );
  }
}
MutationsPlot.propTypes = {
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  xDomain: PropTypes.array,
  defaultDomain: PropTypes.array,
  genome: PropTypes.object,
  title: PropTypes.string,
  chromoBins: PropTypes.object,
  updateDomain: PropTypes.func,
  annotation: PropTypes.string,
};
MutationsPlot.defaultProps = {
  xDomain: [],
  defaultDomain: [],
  commonYScale: false,
  yAxisTitle: "",
  yAxis2Title: "",
  commonRangeY: null,
  mutationsPlot: true,
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
)(withTranslation("common")(MutationsPlot));
