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
  gapY: 22,
  yTicksCount: 10,
};

class Ridgeline extends Component {
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
    const { t, width, height, plots, markers } = this.props;

    let stageWidth = width - 2 * margins.gapX;
    let stageHeight = height - 3 * margins.gapY;

    let panelWidth = stageWidth;
    let panelHeight = stageHeight;

    let yScale = d3
      .scaleBand()
      .domain(plots.map((d) => d.id))
      .range([0, panelHeight]);

    let histograms = plots.map((plot) => {
      let markValue = markers[plot.id];

      let extent0 = [
        d3.min([...plot.data, markValue]),
        d3.max([...plot.data, markValue]),
      ];

      let normalisedScale = d3.scaleLinear().domain(extent0).range([0, 1]);
      let data = plot.data.map((d) => normalisedScale(d));

      let extent = [0, 1];

      let scaleX = d3.scaleLinear().domain(extent).range([0, panelWidth]);
      const n = data.length;
      const x = d3.scaleLinear().domain(extent).range([0, panelWidth]);
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
      const scaleY = d3
        .scaleLinear()
        .domain([0, d3.max(bins, (d) => d.length)])
        .range([yScale.step(), 5])
        .nice();
      return { t, plot, scaleX, scaleY, bins, normalisedScale };
    });

    const xScale = d3.scaleLinear().domain([0, 1]).range([0, panelWidth]);

    return {
      width,
      height,
      panelWidth,
      panelHeight,
      xScale,
      yScale,
      histograms,
      markers,
    };
  }

  renderXAxis() {
    const { xScale, panelHeight } = this.getPlotConfiguration();

    let xAxisContainer = d3
      .select(this.plotContainer)
      .select(".x-axis-container");

    const axisX = d3
      .axisBottom(xScale)
      .tickSize(-panelHeight)
      .tickFormat(d3.format(".0%"));

    xAxisContainer.call(axisX);
  }

  renderYAxis() {
    const { yScale, panelWidth } = this.getPlotConfiguration();

    let yAxisContainer = d3
      .select(this.plotContainer)
      .select(".y-axis-container");

    let yAxis = d3.axisLeft(yScale).tickSize(-panelWidth);

    yAxisContainer.call(yAxis);

    let t = this.props.t;
    yAxisContainer
      .selectAll("text")
      .attr("x", -margins.gapX)
      .attr("dy", -3)
      .attr("text-anchor", "start")
      .text((x) => t(`metadata.${x}.full`));
  }

  render() {
    const {
      width,
      height,
      panelWidth,
      panelHeight,
      yScale,
      histograms,
      markers,
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
              <g
                className="axis--y y-axis-container"
                transform={`translate(${[margins.gap, 0]})`}
              ></g>
              <g
                clipPath=""
                className="axis--x x-axis-container"
                transform={`translate(${[margins.gap, panelHeight]})`}
              ></g>
              {histograms.map((hist) => (
                <g
                  clipPath="url(#cuttOffViewPane0)"
                  transform={`translate(${[
                    0,
                    yScale(hist.plot.id) - yScale.step() / 2,
                  ]})`}
                >
                  <path
                    fill="#CCC"
                    fillOpacity={1}
                    stroke="lightgray"
                    strokeWidth="0"
                    d={d3
                      .area()
                      .x((d) => hist.scaleX((d.x0 + d.x1) / 2))
                      .y1((d) => hist.scaleY(d.length))
                      .y0(hist.scaleY(0))
                      .curve(d3.curveBasis)(hist.bins)}
                  />
                  <path
                    fill="#999999"
                    fillOpacity={1}
                    stroke="gray"
                    strokeWidth="0.33"
                    d={d3
                      .area()
                      .x((d) => hist.scaleX((d.x0 + d.x1) / 2))
                      .y1((d) => hist.scaleY(d.length))
                      .y0((d) => hist.scaleY(d.length))
                      .curve(d3.curveBasis)(hist.bins)}
                  />
                  <g
                    transform={`translate(${[
                      hist.scaleX(hist.normalisedScale(markers[hist.plot.id])),
                      0,
                    ]})`}
                  >
                    <line
                      y1={yScale.step()}
                      y2={yScale.step() / 2}
                      stroke="red"
                      strokeWidth={3}
                    />
                  </g>
                </g>
              ))}
            </g>
          </g>
        </svg>
      </Wrapper>
    );
  }
}
Ridgeline.propTypes = {
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  data: PropTypes.array,
  markValue: PropTypes.number,
};
Ridgeline.defaultProps = {
  data: [],
};
const mapDispatchToProps = () => ({});
const mapStateToProps = () => ({});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(Ridgeline));
