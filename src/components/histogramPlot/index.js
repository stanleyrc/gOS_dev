import React, { Component } from "react";
import { PropTypes } from "prop-types";
import * as d3 from "d3";
import { connect } from "react-redux";
import { withTranslation } from "react-i18next";
import { legendColors } from "../../helpers/utility";
import Wrapper from "./index.style";

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
    this.renderYAxis();
    this.renderXAxis();
    d3.select(this.zoomContainer).call(this.zoom);
  }

  componentDidUpdate() {
    this.renderYAxis();
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
      q99,
      scaleX,
    } = this.props;

    let stageWidth = width - 2 * margins.gapX;
    let stageHeight = height - 3 * margins.gapY;

    let panelWidth = stageWidth;
    let panelHeight = stageHeight;

    let extent = [
      d3.min([d3.min(data), markValue]),
      d3.max([d3.max(data), markValue]),
    ];

    let extentToQ99 = [
      d3.min([d3.min(data), markValue]),
      d3.max([q99, markValue]),
    ];

    let plotScale = d3.scaleLinear();
    if (scaleX === "log") {
      plotScale = d3.scaleLog();
      extentToQ99[0] = d3.max([extentToQ99[0], markValue, 1]);
    }

    const xScale = this.state.zoomTransform.rescaleX(
      plotScale.domain(extentToQ99).range([0, panelWidth]).nice()
    );

    const n = data.length;
    const x = d3.scaleLinear().domain(extent).range([0, panelWidth]).nice();
    const bins = d3
      .bin()
      .domain(x.domain())
      .thresholds(
        x.ticks(
          Math.ceil(
            (Math.pow(n, 1 / 3) * (d3.max(data) - d3.min(data))) /
              (3.5 * d3.deviation(data))
          )
        )
      )(data);

    // Create a scale for the y-axis
    const yScale = d3
      .scaleLinear()
      .domain([0, d3.max(bins, (d) => d.length)])
      .range([panelHeight, 0])
      .nice();

    return {
      width,
      height,
      panelWidth,
      panelHeight,
      xScale,
      yScale,
      bins,
      markValue,
      colorMarker,
      markValueText,
      q1,
      q3,
      scaleX,
    };
  }

  renderXAxis() {
    const { xScale, q1, q3, scaleX } = this.getPlotConfiguration();

    let xAxisContainer = d3
      .select(this.plotContainer)
      .select(".x-axis-container");

    const axisX = d3
      .axisBottom(xScale)
      .tickSize(4)
      .tickFormat(scaleX === "log" ? d3.format("~s") : d3.format(".2f"));

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

  render() {
    const {
      width,
      height,
      panelWidth,
      panelHeight,
      xScale,
      yScale,
      bins,
      markValue,
      markValueText,
      colorMarker,
      q1,
      q3,
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
              <g clipPath={`url(#${clipId})`}>
                <path
                  fill="#CCC"
                  fillOpacity={1}
                  stroke="lightgray"
                  strokeWidth="0"
                  d={d3
                    .area()
                    .x((d) => xScale((d.x0 + d.x1) / 2))
                    .y1((d) => yScale(d.length))
                    .y0(yScale(0))
                    .curve(d3.curveBasis)(bins)}
                />
                <path
                  fill="#999999"
                  fillOpacity={0}
                  stroke="gray"
                  strokeWidth="0.33"
                  d={d3
                    .area()
                    .x((d) => xScale((d.x0 + d.x1) / 2))
                    .y1((d) => yScale(d.length))
                    .y0(yScale(0))
                    .curve(d3.curveBasis)(bins)}
                />
                <g transform={`translate(${[xScale(markValue), 0]})`}>
                  <line y2={panelHeight} stroke="red" strokeWidth={3} />
                  <text
                    textAnchor={"middle"}
                    dy="-3"
                    fill={colorMarker}
                    className="marker"
                  >
                    {markValueText}
                  </text>
                </g>
              </g>
              <g
                className="axis--y y-axis-container"
                transform={`translate(${[margins.gap, 0]})`}
              ></g>
              <g
                clipPath={`url(#${clipId})`}
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
                style={{
                  stroke: "#777",
                  fill: "transparent",
                  strokeWidth: 0.5,
                  opacity: 0.19,
                  pointerEvents: "all",
                }}
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
};
const mapDispatchToProps = () => ({});
const mapStateToProps = () => ({});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(HistogramPlot));
