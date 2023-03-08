import React, { Component } from "react";
import { PropTypes } from "prop-types";
import * as d3 from "d3";
import { connect } from "react-redux";
import { withTranslation } from "react-i18next";
import Wrapper from "./index.style";

const margins = {
  gap: 0,
  gapX: 34,
  gapY: 12,
  yTicksCount: 10,
};

class HistogramPlot extends Component {
  plotContainer = null;

  componentDidMount() {
    this.renderYAxis();
    this.renderXAxis();
  }

  componentDidUpdate() {
    this.renderYAxis();
    this.renderXAxis();
  }

  getPlotConfiguration() {
    const { width, height, data, markValue } = this.props;

    let stageWidth = width - 2 * margins.gapX;
    let stageHeight = height - 3 * margins.gapY;

    let panelWidth = stageWidth;
    let panelHeight = stageHeight;
    // Create a scale for the x-axis
    const xScale = d3
      .scaleLinear()
      .domain(d3.extent(data))
      .range([0, panelWidth])
      .nice();

    const n = data.length;
    const x = d3
      .scaleLinear()
      .domain([d3.min(data), d3.max(data)])
      .range([0, width]);
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
    };
  }

  renderXAxis() {
    const { xScale } = this.getPlotConfiguration();

    let xAxisContainer = d3
      .select(this.plotContainer)
      .select(".x-axis-container");

    const axisX = d3.axisBottom(xScale).tickSize(6);
    xAxisContainer.call(axisX);
  }

  renderYAxis() {
    const { yScale } = this.getPlotConfiguration();

    let yAxisContainer = d3
      .select(this.plotContainer)
      .select(".y-axis-container");

    let yAxis = d3.axisLeft(yScale).tickSize(6).tickFormat(d3.format("~s"));
    yAxisContainer.call(yAxis);
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
    } = this.getPlotConfiguration();

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
            <clipPath key="cuttOffViewPane" id="cuttOffViewPane">
              <rect x={0} y={0} width={panelWidth} height={panelHeight} />
            </clipPath>
            <linearGradient
              id="area-gradient"
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1={panelHeight}
              x2="0"
              y2="0"
            >
              <stop offset="0%" stopColor="white"></stop>
              <stop offset="100%" stopColor="rgba(70, 130, 180, 0.33)"></stop>
            </linearGradient>
          </defs>
          <g transform={`translate(${[margins.gapX, margins.gapY]})`}>
            <g key={`panel`} id={`panel`} transform={`translate(${[0, 0]})`}>
              <g clipPath="url(#1cuttOffViewPane)">
                <path
                  transform={`translate(${[0, 0]})`}
                  fill="url(#area-gradient)"
                  stroke="steelblue"
                  strokeWidth="0"
                  d={d3
                    .area()
                    .x((d) => xScale((d.x0 + d.x1) / 2))
                    .y1((d) => yScale(d.length))
                    .y0(yScale(0))
                    .curve(d3.curveBasis)(bins)}
                />
                <path
                  transform={`translate(${[0, 0]})`}
                  fill="none"
                  stroke="steelblue"
                  strokeWidth="2"
                  d={d3
                    .line()
                    .x((d) => xScale((d.x0 + d.x1) / 2))
                    .y((d) => yScale(d.length))
                    .curve(d3.curveBasis)(bins)}
                />
                <g transform={`translate(${[xScale(markValue), 0]})`}>
                  <line y2={panelHeight} stroke="#ff7f0e" strokeWidth={2} />
                  <text
                    textAnchor={"middle"}
                    dy="-3"
                    fill="currentColor"
                    className="marker"
                  >
                    {markValue}
                  </text>
                </g>
              </g>
              <g
                className="axis--y y-axis-container"
                transform={`translate(${[margins.gap, 0]})`}
              ></g>
              <g
                clipPath=""
                className="axis--x x-axis-container"
                transform={`translate(${[margins.gap, panelHeight]})`}
              ></g>
              <rect
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
