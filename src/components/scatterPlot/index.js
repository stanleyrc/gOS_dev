import React, { Component } from "react";
import { PropTypes } from "prop-types";
import * as d3 from "d3";
import { connect } from "react-redux";
import { withTranslation } from "react-i18next";
import { throttle } from "lodash";
import { findMaxInRanges } from "../../helpers/utility";
import Grid from "../grid/index";
import Points from "./points";
import Wrapper from "./index.style";
import settingsActions from "../../redux/settings/actions";
import { store } from "../../redux/store";

const { updateDomains, updateHoveredLocation } = settingsActions;

const margins = {
  gapX: 50,
  gapY: 24,
};

class ScatterPlot extends Component {
  regl = null;
  container = null;
  plotContainer = null;
  zoom = null;
  extentDataPointsY1 = null;
  extentDataPointsY2 = null;
  maxY1Values = null;
  maxY2Values = null;

  // Debounced percentile computation
  _maxYComputeTimer = null;
  _cachedMaxYDomains = null;

  constructor(props) {
    super(props);

    this.rafId = null;
    this.updateDomains = (newDomains) => {
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

  componentDidMount() {
    this.regl = require("regl")({
      extensions: ["ANGLE_instanced_arrays", "OES_texture_float", "OES_texture_float_linear"],
      container: this.container,
      pixelRatio: 2.0,
      attributes: {
        antialias: true,
        depth: true,
        stencil: false,
        preserveDrawingBuffer: false,
      },
    });

    this.regl.on("lost", () => {
      console.log("lost webgl context");
    });

    this.regl.on("restore", () => {
      console.log("webgl context restored");
      this.points = new Points(this.regl, margins.gapX, 0);
      this.updateStage(true);
    });

    this.points = new Points(this.regl, margins.gapX, 0);

    const { domains, zoomedByCmd } = this.props;
    this.panels.forEach((panel, index) => {
      let domain = domains[index];
      var s = [
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

    this.updateStage(true);

    this.unsubscribeHover = store.subscribe(() => {
      const state = store.getState();
      const { hoveredLocation, hoveredLocationPanelIndex } = state.Settings;
      this.updateHoverLine(hoveredLocation, hoveredLocationPanelIndex);
    });
  }

  shouldComponentUpdate(nextProps, nextState) {
    const dataPointsColorChanged = nextProps.dataPointsColor.length !== this.props.dataPointsColor.length;
    const domainsChanged = nextProps.domains.toString() !== this.props.domains.toString();
    const widthChanged = nextProps.width !== this.props.width;
    const heightChanged = nextProps.height !== this.props.height;
    const commonRangeYChanged = nextProps.commonRangeY !== this.props.commonRangeY;

    return (
      dataPointsColorChanged ||
      domainsChanged ||
      widthChanged ||
      heightChanged ||
      commonRangeYChanged
    );
  }

  componentDidUpdate(prevProps, prevState) {
    const { domains, zoomedByCmd } = this.props;

    const domainsChanged = prevProps.domains.toString() !== domains.toString();
    if (domainsChanged) {
      this.pendingDomains = null;
      this.panels.forEach((panel, index) => {
        let domain = domains[index];
        var s = [
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

    if (
      prevProps?.width !== this.props.width ||
      prevProps?.height !== this.props.height
    ) {
      this.componentWillUnmount();
      this.componentDidMount();
    } else {
      this.updateStage(
        prevProps.dataPointsColor.length !==
          this.props.dataPointsColor.length ||
          (prevProps.commonRangeY === null &&
            this.props.commonRangeY !== null) ||
          (prevProps.commonRangeY !== null && this.props.commonRangeY === null)
      );
    }
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
              -10000,
            0,
          ]})`
        );
      d3.select(this.plotContainer)
        .select(`#hovered-location-text-${hoveredLocationPanelIndex}`)
        .attr(
          "x",
          this.panels[hoveredLocationPanelIndex].xScale(hoveredLocation) ||
            -10000
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
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
    }

    if (this._maxYComputeTimer) {
      clearTimeout(this._maxYComputeTimer);
    }

    if (this.unsubscribeHover) {
      this.unsubscribeHover();
    }

    try {
      if (this.regl) {
        this.regl.destroy();
        this.regl._gl.clear(this.regl._gl.COLOR_BUFFER_BIT);
        this.regl._gl.clear(this.regl._gl.DEPTH_BUFFER_BIT);
        this.regl._gl.clear(this.regl._gl.STENCIL_BUFFER_BIT);
      }
    } catch (err) {
      console.log(`Scatterplot webgl failed with error: ${err}`);
    }
  }

  getPointsData() {
    const {
      dataPointsXHigh,
      dataPointsXLow,
      dataPointsY1,
      dataPointsY2,
      dataPointsColor,
      commonRangeY,
    } = this.props;

    const dataY = commonRangeY ? dataPointsY1 : dataPointsY2;

    return {
      xHigh: dataPointsXHigh,
      xLow: dataPointsXLow,
      y: dataY,
      color: dataPointsColor,
    };
  }

  updateStage(reloadData = false) {
    const {
      domains,
      width,
      height,
      commonRangeY,
    } = this.props;

    const stageWidth = width - 2 * margins.gapX;
    const stageHeight = height - 3 * margins.gapY;

    if (reloadData) {
      const pointsData = this.getPointsData();
      this.points.setData(
        pointsData.xHigh,
        pointsData.xLow,
        pointsData.y,
        pointsData.color
      );
    }

    this.points.updateDomains(
      stageWidth,
      stageHeight,
      domains,
      commonRangeY ? domains.map((d) => commonRangeY[1]) : this.maxY2Values.map(v => Math.ceil(v))
    );

    this.points.render();
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
      this.updateDomains(newDomains);
    }
  }

  zoomEnded(event, index) {
    this.zooming(event, index);
  }

  handleMouseMove = throttle((e, panelIndex) => {
    this.props.updateHoveredLocation(
      this.panels[panelIndex].xScale.invert(d3.pointer(e)[0]),
      panelIndex
    );
  }, 16, { leading: true, trailing: false });

  handleMouseOut = (e, panelIndex) => {
    this.props.updateHoveredLocation(null, panelIndex);
  };

  render() {
    const {
      width,
      height,
      domains,
      chromoBins,
      defaultDomain,
      yAxisTitle,
      yAxis2Title,
      dataPointsY1,
      dataPointsY2,
      dataPointsX,
      commonRangeY,
    } = this.props;

    let stageWidth = width - 2 * margins.gapX;
    let stageHeight = height - 3 * margins.gapY;
    let panelWidth =
      (stageWidth - (domains.length - 1) * margins.gapX) / domains.length;
    let panelHeight = stageHeight;
    this.panels = [];

    this.extentDataPointsY1 =
      this.extentDataPointsY1 || d3.extent(dataPointsY1);
    this.extentDataPointsY2 =
      this.extentDataPointsY2 || d3.extent(dataPointsY2);

    if (!commonRangeY) {
      const domainsKey = domains.map((d) => `${d[0]}-${d[1]}`).join("|");

      // Need sync compute if: no values, wrong length, or no cached domains (fresh start/mode switch)
      const needsSyncCompute =
        !this.maxY1Values ||
        !this.maxY2Values ||
        this.maxY2Values.length !== domains.length ||
        !this._cachedMaxYDomains;

      // Only debounce if we have a valid cache AND domains actually changed
      const domainsChanged =
        this._cachedMaxYDomains && this._cachedMaxYDomains !== domainsKey;

      if (needsSyncCompute) {
        this.maxY1Values = findMaxInRanges(domains, dataPointsX, dataPointsY1);
        this.maxY2Values = findMaxInRanges(domains, dataPointsX, dataPointsY2);
        this._cachedMaxYDomains = domainsKey;
      } else if (domainsChanged) {
        // During zoom/pan: keep using cached values, schedule debounced update
        if (this._maxYComputeTimer) {
          clearTimeout(this._maxYComputeTimer);
        }

        this._maxYComputeTimer = setTimeout(() => {
          this._maxYComputeTimer = null;
          this.maxY1Values = findMaxInRanges(domains, dataPointsX, dataPointsY1);
          this.maxY2Values = findMaxInRanges(domains, dataPointsX, dataPointsY2);
          this._cachedMaxYDomains = domainsKey;
          this.forceUpdate(); // Trigger React re-render to update Y-axis
        }, 50);
      }
    } else {
      // In common mode: reset cache so we recompute when switching back to individual
      this._cachedMaxYDomains = null;
    }

    domains.forEach((xDomain, index) => {
      let offset = index * (panelWidth + margins.gapX);
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

      let panelGenomeScale = d3
        .scaleLinear()
        .domain(defaultDomain)
        .range([0, panelWidth]);

      let yScale1, yScale2;
      if (commonRangeY) {
        d3.scaleLinear().domain(commonRangeY).ticks();
        let yExtent1 = commonRangeY;
        let yExtent2 = yExtent1.map((d) =>
          d3
            .scaleLinear()
            .domain(this.extentDataPointsY1)
            .range(this.extentDataPointsY2)(d)
        );

        yScale1 = d3.scaleLinear().domain(yExtent1).range([panelHeight, 0]);
        yScale2 = d3.scaleLinear().domain(yExtent2).range([panelHeight, 0]);
      } else {
        let yExtent1 = [0, Math.ceil(this.maxY1Values[index])];
        let yExtent2 = [0, Math.ceil(this.maxY2Values[index])];

        yScale1 = d3.scaleLinear().domain(yExtent1).range([panelHeight, 0]);
        yScale2 = d3.scaleLinear().domain(yExtent2).range([panelHeight, 0]);
      }

      let xScale = d3.scaleLinear().domain(xDomain).range([0, panelWidth]);

      this.panels.push({
        index,
        xScale,
        yScale1,
        yScale2,
        zoom,
        panelWidth,
        panelHeight,
        offset,
        panelGenomeScale,
      });
    });
    const result = (
      <Wrapper className="ant-wrapper" margins={margins} height={height}>
        <div
          className="scatterplot"
          style={{ width: stageWidth, height: stageHeight }}
          ref={(elem) => (this.container = elem)}
        />
        <svg
          width={width}
          height={height}
          className="plot-container"
          ref={(elem) => (this.plotContainer = elem)}
        >
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
          <g transform={`translate(${[margins.gapX, margins.gapY]})`}>
            {this.panels.map((panel, i) => (
              <g
                key={`panel-${panel.index}`}
                id={`panel-${panel.index}`}
                transform={`translate(${[panel.offset, 0]})`}
              >
                <Grid
                  gap={0}
                  scaleX={panel.xScale}
                  scaleY={panel.yScale1}
                  scaleY2={panel.yScale2}
                  axisWidth={panelWidth}
                  axisHeight={panelHeight}
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
                  x={-1000}
                  dx={5}
                  dy={10}
                ></text>
                <rect
                  className="zoom-background"
                  id={`panel-rect-${panel.index}`}
                  x={0.5}
                  width={panelWidth}
                  height={panelHeight}
                  onMouseMove={(e) => this.handleMouseMove(e, i)}
                  onMouseOut={(e) => this.handleMouseOut(e, i)}
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
        </svg>
      </Wrapper>
    );
    return result;
  }
}
ScatterPlot.propTypes = {
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  data: PropTypes.object,
  chromoBins: PropTypes.object,
};
ScatterPlot.defaultProps = {
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
  hoveredLocation: state.Settings.hoveredLocation,
  hoveredLocationPanelIndex: state.Settings.hoveredLocationPanelIndex,
  zoomedByCmd: state.Settings.zoomedByCmd,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(ScatterPlot));
