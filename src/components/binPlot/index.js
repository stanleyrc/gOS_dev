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
  gapY: 24,
  yTicksCount: 10,
};

class BinPlot extends Component {
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
    const { width, height, data, xTitle, yTitle } = this.props;

    let stageWidth = width - 2 * margins.gapX;
    let stageHeight = height - 3 * margins.gapY;

    let panelWidth = stageWidth;
    let panelHeight = stageHeight;

    let extent = [d3.min([d3.min(data)]), d3.max([d3.max(data)])];

    const xScale = d3
      .scaleLinear()
      .domain(extent)
      .range([0, panelWidth])
      .nice();

    const x = d3.scaleLinear().domain(extent).range([0, panelWidth]).nice();
    const bins = d3
      .bin()
      .domain(x.domain())
      .thresholds(d3.thresholdFreedmanDiaconis)(data);

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
      xTitle,
      yTitle,
    };
  }

  renderXAxis() {
    const { xScale } = this.getPlotConfiguration();

    let xAxisContainer = d3
      .select(this.plotContainer)
      .select(".x-axis-container");

    const axisX = d3
      .axisBottom(xScale)
      .tickSize(6)
      .tickFormat(
        xScale.domain()[1] < 100 ? d3.format(".2f") : d3.format("~s")
      );

    xAxisContainer.call(axisX);
  }

  renderYAxis() {
    const { yScale } = this.getPlotConfiguration();

    let yAxisContainer = d3
      .select(this.plotContainer)
      .select(".y-axis-container");

    let yAxis = d3
      .axisLeft(yScale)
      .ticks(6, "~s")
      .tickSize(3)
      .tickFormat(d3.format("~s"));
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
      xTitle,
      yTitle,
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
              <g clipPath="url(#cuttOffViewPane)">
                {bins.map((d) => (
                  <rect
                    fill="steelblue"
                    x={xScale(d.x0) + 1}
                    width={xScale(d.x1) - xScale(d.x0) - 1}
                    y={yScale(d.length)}
                    height={yScale(0) - yScale(d.length)}
                  ></rect>
                ))}
              </g>
              <g
                className="axis--y y-axis-container"
                transform={`translate(${[margins.gap, 0]})`}
              >
                <text
                  className="y-axis-title"
                  x={-margins.gapX}
                  y={-0.5 * margins.gapY}
                  fill="currentColor"
                  textAnchor="start"
                >
                  {yTitle}
                </text>
              </g>
              <g
                clipPath=""
                className="axis--x x-axis-container"
                transform={`translate(${[margins.gap, panelHeight]})`}
              >
                <text
                  className="x-axis-title"
                  x={panelWidth}
                  y={1.5 * margins.gapY}
                  fill="currentColor"
                  textAnchor="end"
                >
                  {xTitle}
                </text>
              </g>
            </g>
          </g>
        </svg>
      </Wrapper>
    );
  }
}
BinPlot.propTypes = {
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  data: PropTypes.array,
  markValue: PropTypes.number,
};
BinPlot.defaultProps = {
  data: [],
};
const mapDispatchToProps = () => ({});
const mapStateToProps = () => ({});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(BinPlot));
