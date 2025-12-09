import React, { Component } from "react";
import { PropTypes } from "prop-types";
import * as d3 from "d3";
import { connect } from "react-redux";
import { withTranslation } from "react-i18next";
import { legendColors, kde, epanechnikov } from "../../helpers/utility";
import Wrapper from "./index.style";
import caseReportsActions from "../../redux/caseReports/actions";
import settingsActions from "../../redux/settings/actions";
import { update } from "immutable";

const { updateHighlightedCaseReport } = caseReportsActions;
const { updateCaseReport } = settingsActions;

const margins = {
  gap: 0,
  gapX: 34,
  gapY: 12,
  yTicksCount: 10,
};

class HistogramPlot extends Component {
  plotContainer = null;

  constructor(props) {
    super(props);

    this.zoom = d3
      .zoom()
      .scaleExtent([1, 38])
      .translateExtent([
        [0, 0],
        [
          this.props.width - 2 * margins.gapX,
          this.props.height - 3 * margins.gapY,
        ],
      ])
      .extent([
        [0, 0],
        [
          this.props.width - 2 * margins.gapX,
          this.props.height - 3 * margins.gapY,
        ],
      ])
      .on("zoom", (e) => this.zoomed(e));
    this.state = {
      zoomTransform: d3.zoomIdentity,
    };
  }

  componentDidMount() {
    const { showAxisY } = this.props;
    showAxisY && this.renderYAxis();
    this.renderXAxis();
    d3.select(this.zoomContainer).call(this.zoom);
  }

  componentDidUpdate() {
    const { showAxisY } = this.props;
    showAxisY && this.renderYAxis();
    this.renderXAxis();
    d3.select(this.zoomContainer).call(this.zoom);
  }

  getPlotConfiguration() {
    const {
      width,
      height,
      data,
      markValue,
      colorMarker,
      markValueText,
      q1,
      q3,
      range,
      scaleX,
      bandwidth,
      format,
      dataset,
      id,
      highlightedCaseReport,
      updateHighlightedCaseReport,
      updateCaseReport,
    } = this.props;

    let stageWidth = width - 2 * margins.gapX;
    let stageHeight = height - 3 * margins.gapY;

    let panelWidth = stageWidth;
    let panelHeight = stageHeight;

    let thresholds = d3.ticks(...d3.nice(...d3.extent(data), 10), 140);
    let density = kde(epanechnikov(bandwidth), thresholds, data);
    if (scaleX === "log" && density.length > 0) {
      density[0][0] = 0.1;
    }

    let extentToQ99 = [
      d3.min([range[0], markValue]),
      d3.max([range[1], markValue]),
    ];

    let plotScale = d3.scaleLinear();
    if (scaleX === "log") {
      plotScale = d3.scaleLog();
      extentToQ99[0] = d3.max([extentToQ99[0], markValue, 1]);
    }

    const xScale = this.state.zoomTransform.rescaleX(
      plotScale.domain(extentToQ99).range([0, panelWidth]).nice()
    );

    // Create a scale for the y-axis
    const yScale = d3
      .scaleLinear()
      .domain([0, d3.max(density, (d) => d[1])])
      .range([panelHeight, 0])
      .nice();

    let highlightedMarkValue = highlightedCaseReport?.report[id];
    let highlightedMarkValueText = highlightedMarkValue
      ? d3.format(format)(highlightedMarkValue)
      : null;
    let highlightedPair = highlightedCaseReport?.pair;

    return {
      width,
      height,
      panelWidth,
      panelHeight,
      xScale,
      yScale,
      markValue,
      colorMarker,
      markValueText,
      q1,
      q3,
      scaleX,
      density,
      format,
      dataset,
      data,
      id,
      highlightedCaseReport,
      updateHighlightedCaseReport,
      highlightedMarkValue,
      highlightedMarkValueText,
      highlightedPair,
      updateCaseReport,
    };
  }

  renderXAxis() {
    const { xScale, q1, q3, scaleX, format } = this.getPlotConfiguration();

    let xAxisContainer = d3
      .select(this.plotContainer)
      .select(".x-axis-container");

    const axisX = d3
      .axisBottom(xScale)
      .tickSize(4)
      .tickFormat(d3.format(format));

    xAxisContainer.call(axisX);

    xAxisContainer.selectAll("text").style("fill", (x) => {
      return x < q1
        ? legendColors()[0]
        : x > q3
        ? legendColors()[2]
        : legendColors()[1];
    });

    xAxisContainer.selectAll("line").style("stroke", (x) => {
      return x < q1
        ? legendColors()[0]
        : x > q3
        ? legendColors()[2]
        : legendColors()[1];
    });

    if (scaleX === "log") {
      xAxisContainer
        .selectAll(".tick > text")
        .attr("transform", "rotate(45)")
        .attr("dy", "5")
        .style("text-anchor", "start");
    }
  }

  renderYAxis() {
    const { yScale } = this.getPlotConfiguration();

    let yAxisContainer = d3
      .select(this.plotContainer)
      .select(".y-axis-container");

    let yAxis = d3.axisLeft(yScale).tickFormat(d3.format("~s"));
    yAxisContainer.call(yAxis);
  }

  zoomed(currentEvent) {
    this.setState({ zoomTransform: currentEvent.transform });
  }

  handleMouseMove(event) {
    const {
      xScale,
      dataset,
      updateHighlightedCaseReport,
      highlightedCaseReport,
    } = this.getPlotConfiguration();

    const mouseX = event.nativeEvent.offsetX - margins.gapX;
    const invertedX = xScale.invert(mouseX);

    if (invertedX >= xScale.domain()[0] && invertedX <= xScale.domain()[1]) {
      // Find the closest actual data point using binary search
      const bisect = d3.bisectCenter(
        dataset.map((d) => +d.value),
        invertedX
      );
      const closestDataPoint = dataset[bisect];
      if (closestDataPoint?.pair !== highlightedCaseReport?.pair) {
        updateHighlightedCaseReport(closestDataPoint);
      }
    }
  }

  render() {
    const {
      width,
      height,
      panelWidth,
      panelHeight,
      xScale,
      yScale,
      markValue,
      markValueText,
      colorMarker,
      q1,
      q3,
      density,
      highlightedMarkValue,
      highlightedMarkValueText,
      highlightedPair,
      updateCaseReport,
    } = this.getPlotConfiguration();

    let clipId = `cuttOffViewPane-${Math.random()}`;
    return (
      <Wrapper className="ant-wrapper" margins={margins}>
        <div
          className="histogram-plot"
          style={{ width: panelWidth, height: panelHeight }}
          ref={(elem) => (this.container = elem)}
        />
        <svg
          width={width}
          height={height}
          className="plot-container"
          ref={(elem) => (this.plotContainer = elem)}
        >
          <defs>
            <clipPath key="cuttOffViewPane" id={clipId}>
              <rect
                x={0}
                y={-panelHeight}
                width={panelWidth}
                height={2 * panelHeight}
              />
            </clipPath>
          </defs>
          <g transform={`translate(${[margins.gapX, margins.gapY]})`}>
            <g key={`panel`} id={`panel`} transform={`translate(${[0, 0]})`}>
              <g>
                <path
                  clipPath={`url(#${clipId})`}
                  fill="#CCC"
                  fillOpacity={1}
                  stroke="lightgray"
                  strokeWidth="0"
                  d={d3
                    .area()
                    .x((d) => xScale(d[0]))
                    .y1((d) => yScale(d[1]))
                    .y0(yScale(0))
                    .curve(d3.curveBasis)(density)}
                />
                <path
                  clipPath={`url(#${clipId})`}
                  fill="#999999"
                  fillOpacity={0}
                  stroke="gray"
                  strokeWidth="0.33"
                  d={d3
                    .area()
                    .x((d) => xScale(d[0]))
                    .y1((d) => yScale(d[1]))
                    .y0(yScale(0))
                    .curve(d3.curveBasis)(density)}
                />
                {markValue >= 0 &&
                  xScale(markValue) >= 0 &&
                  xScale(markValue) <= panelWidth && (
                    <g
                      className="marker"
                      transform={`translate(${[xScale(markValue), 0]})`}
                    >
                      <line
                        y2={panelHeight}
                        y1={0.33 * panelHeight}
                        stroke="red"
                        strokeWidth={3}
                      />
                      <text
                        textAnchor={"middle"}
                        dy="-3"
                        y={0.33 * panelHeight}
                        fill={colorMarker}
                        className="marker"
                      >
                        {markValueText}
                      </text>
                    </g>
                  )}
                {highlightedMarkValue >= 0 &&
                  xScale(highlightedMarkValue) >= 0 &&
                  xScale(highlightedMarkValue) <= panelWidth && (
                    <g
                      className="marker"
                      transform={`translate(${[
                        xScale(highlightedMarkValue),
                        0,
                      ]})`}
                    >
                      <line
                        y2={panelHeight}
                        y1={0.33 * panelHeight}
                        stroke="#333"
                        strokeWidth={3}
                      />
                      <text
                        textAnchor={"middle"}
                        dy="-3"
                        y={0.33 * panelHeight}
                        fill="#333"
                        className="marker"
                      >
                        {highlightedMarkValueText}
                      </text>
                      <text
                        textAnchor={"middle"}
                        className="clickable-marker"
                        onClick={(e) => updateCaseReport(highlightedPair)}
                      >
                        {highlightedPair}
                      </text>
                    </g>
                  )}
              </g>
              <g
                className="axis--y y-axis-container"
                transform={`translate(${[margins.gap, 0]})`}
              ></g>
              <g
                className="axis--x x-axis-container"
                transform={`translate(${[margins.gap, panelHeight]})`}
              ></g>
              <g
                clipPath={`url(#${clipId})`}
                className="axis-conditional-container"
                transform={`translate(${[margins.gap, panelHeight]})`}
              >
                <line
                  x2={xScale(q1)}
                  stroke={legendColors()[0]}
                  strokeWidth="2"
                />
                <line
                  x1={xScale(q1)}
                  x2={xScale(q3)}
                  stroke={legendColors()[1]}
                  strokeWidth="2"
                />
                <line
                  x1={xScale(q3)}
                  x2={panelWidth}
                  stroke={legendColors()[2]}
                  strokeWidth="2"
                />
              </g>
              <rect
                ref={(elem) => (this.zoomContainer = elem)}
                className="zoom-background"
                id={`panel-rect`}
                x={0.5}
                y={0.5}
                width={panelWidth}
                height={panelHeight}
                onMouseMove={(e) => this.handleMouseMove(e)}
              />
            </g>
          </g>
        </svg>
      </Wrapper>
    );
  }
}
HistogramPlot.propTypes = {
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  data: PropTypes.array,
  markValue: PropTypes.number,
};
HistogramPlot.defaultProps = {
  data: [],
  showAxisY: false,
  format: "0.3f",
};
const mapDispatchToProps = (dispatch) => ({
  updateCaseReport: (report) => dispatch(updateCaseReport(report)),
  updateHighlightedCaseReport: (report) =>
    dispatch(updateHighlightedCaseReport(report)),
});
const mapStateToProps = (state) => ({
  highlightedCaseReport: state.CaseReports.highlightedCaseReport,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(HistogramPlot));
