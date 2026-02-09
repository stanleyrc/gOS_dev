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

  _globalOutlierThresholdY1 = null;
  _globalOutlierThresholdY2 = null;
  _outlierThresholdDataY1 = null;
  _outlierThresholdDataY2 = null;

  computeGlobalOutlierThreshold(
    dataPointsY,
    cachedData,
    cachedThreshold,
    p = 0.99
  ) {
    if (cachedData === dataPointsY && cachedThreshold !== null) {
      return cachedThreshold;
    }

    const sorted = [...dataPointsY].sort((a, b) => a - b);
    const n = sorted.length;
    const i = (n - 1) * p;
    const iLow = Math.floor(i);
    const iHigh = Math.ceil(i);

    if (iLow === iHigh) {
      return sorted[iLow];
    }
    const fraction = i - iLow;
    return sorted[iLow] * (1 - fraction) + sorted[iHigh] * fraction;
  }

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
      extensions: [
        "ANGLE_instanced_arrays",
        "OES_texture_float",
        "OES_texture_float_linear",
      ],
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
  }

  shouldComponentUpdate(nextProps, nextState) {
    const dataPointsColorChanged =
      nextProps.dataPointsColor.length !== this.props.dataPointsColor.length;
    const domainsChanged =
      nextProps.domains.toString() !== this.props.domains.toString();
    const widthChanged = nextProps.width !== this.props.width;
    const heightChanged = nextProps.height !== this.props.height;
    const commonRangeYChanged =
      nextProps.commonRangeY !== this.props.commonRangeY;

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

  componentWillUnmount() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
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
      dataPointsColor,
    } = this.props;

    // Always use Y1 (Est. CN) data for consistent point rendering
    // The second Y-axis (Base Coverage) is just for reference
    return {
      xHigh: dataPointsXHigh,
      xLow: dataPointsXLow,
      y: dataPointsY1,
      color: dataPointsColor,
    };
  }

  updateStage(reloadData = false) {
    const { domains, width, height, commonRangeY } = this.props;

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
      commonRangeY
        ? domains.map((d) => commonRangeY[1])
        : this.maxY1Values.map((v) => Math.ceil(v))
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

    if (
      newDomainsStr !== propsDomainsStr &&
      newDomainsStr !== pendingDomainsStr
    ) {
      this.pendingDomains = newDomains;
      this.updateDomains(newDomains);
    }
  }

  zoomEnded(event, index) {
    this.zooming(event, index);
  }

  handleMouseMove = throttle(
    (e, panelIndex) => {
      this.props.updateHoveredLocation(
        this.panels[panelIndex].xScale.invert(d3.pointer(e)[0]),
        panelIndex
      );
    },
    16,
    { leading: true, trailing: false }
  );

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
      if (this._outlierThresholdDataY1 !== dataPointsY1) {
        this._globalOutlierThresholdY1 = this.computeGlobalOutlierThreshold(
          dataPointsY1,
          this._outlierThresholdDataY1,
          this._globalOutlierThresholdY1
        );
        this._outlierThresholdDataY1 = dataPointsY1;
      }
      if (this._outlierThresholdDataY2 !== dataPointsY2) {
        this._globalOutlierThresholdY2 = this.computeGlobalOutlierThreshold(
          dataPointsY2,
          this._outlierThresholdDataY2,
          this._globalOutlierThresholdY2
        );
        this._outlierThresholdDataY2 = dataPointsY2;
      }

      const rawMaxY1 = findMaxInRanges(
        domains,
        dataPointsX,
        dataPointsY1,
        false
      );
      const rawMaxY2 = findMaxInRanges(
        domains,
        dataPointsX,
        dataPointsY2,
        false
      );

      this.maxY1Values = rawMaxY1.map((v) =>
        Math.min(v, this._globalOutlierThresholdY1)
      );
      this.maxY2Values = rawMaxY2.map((v) =>
        Math.min(v, this._globalOutlierThresholdY2)
      );
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
        // Map Y1 extent to Y2 using [0, max] ranges so both axes start from 0
        let maxY2 = d3
          .scaleLinear()
          .domain([0, this.extentDataPointsY1[1]])
          .range([0, this.extentDataPointsY2[1]])(commonRangeY[1]);
        let yExtent2 = [0, maxY2];

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
  zoomedByCmd: state.Settings.zoomedByCmd,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(ScatterPlot));
