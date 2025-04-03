import React, { Component } from "react";
import { PropTypes } from "prop-types";
import * as d3 from "d3";
import { connect } from "react-redux";
import { withTranslation } from "react-i18next";
import { legendColors, kde, epanechnikov } from "../../helpers/utility";
import Wrapper from "./index.style";

const margins = {
  gap: 0,
  gapX: 34,
  gapY: 22,
  yTicksCount: 10,
};

class ViolinPlot extends Component {
  plotContainer = null;

  componentDidMount() {
    this.renderXAxis();
    this.renderYAxis();
  }

  componentDidUpdate() {
    this.renderXAxis();
    this.renderYAxis();
  }

  getPlotConfiguration() {
    const { t, width, height, plots, markers } = this.props;
    let stageWidth = width - 2 * margins.gapX;
    let stageHeight = height - 3 * margins.gapY;

    let panelWidth = stageWidth;
    let panelHeight = stageHeight;

    let xScale = d3
      .scaleBand()
      .domain(plots.map((d) => d.id))
      .range([0, panelWidth]);

    let histograms = plots.map((plot) => {
      let thresholds = d3.ticks(...d3.nice(...d3.extent(plot.data), 10), 140);
      let density = kde(epanechnikov(plot.bandwidth), thresholds, plot.data);

      let markValue = markers[plot.id];

      let extent = [
        d3.min([plot.range[0], markValue]),
        d3.max([plot.range[1], markValue]),
      ];

      let plotScale = d3.scaleLinear();
      if (plot.scaleX === "log" && density.length > 0) {
        plotScale = d3.scaleLog();
        density[0][0] = 0.1;
        extent[0] = d3.max([extent[0], markValue, 1]);
      }

      const scaleY = plotScale.domain(extent).range([panelHeight, 0]).nice();

      // Create a scale for the y-axis
      const scaleX = d3
        .scaleLinear()
        .domain([0, d3.max(density, (d) => d[1])])
        .range([xScale.step(), 0.5 * xScale.step()]);

      return { t, plot, scaleX, scaleY, density };
    });

    return {
      width,
      height,
      panelWidth,
      panelHeight,
      xScale,
      histograms,
      markers,
    };
  }

  renderXAxis() {
    const { xScale, panelHeight } = this.getPlotConfiguration();

    let xAxisContainer = d3
      .select(this.plotContainer)
      .select(".x-axis-container");

    const axisX = d3.axisBottom(xScale).tickSize(-panelHeight);

    xAxisContainer.call(axisX);

    let t = this.props.t;
    xAxisContainer
      .selectAll("text")
      .attr("text-anchor", "middle")
      .attr("dy", 20)
      .text((x) => t(`metadata.${x}.short`));
  }

  renderYAxis() {
    const { xScale, histograms } = this.getPlotConfiguration();
    let yAxisContainer = d3
      .select(this.plotContainer)
      .select(".y-axis-container")
      .selectAll(".distribution-axis")
      .data(histograms, (d) => d.plot.id);

    yAxisContainer
      .enter()
      .append("g")
      .attr("class", "distribution-axis")
      .attr(
        "transform",
        (d, i) => `translate(${[xScale(d.plot.id) + xScale.step() / 2, 0]})`
      )
      .each(function (d, i) {
        let yAxis = d3
          .axisLeft(d.scaleY)
          .tickSize(3)
          .tickFormat(d3.format(d.plot.format));

        d3.select(this).call(yAxis);

        d3.select(this)
          .selectAll("text")
          .style("fill", (x) => {
            return x < d.plot.q1
              ? legendColors()[0]
              : x > d.plot.q3
              ? legendColors()[2]
              : legendColors()[1];
          })
          .text(function (e) {
            let tickText = d3.select(this).text();
            if (d.plot.scaleX === "log") {
              tickText = tickText === "" ? "" : d3.format("~s")(e);
            } else {
              tickText = tickText === "" ? "" : d3.format(d.plot.format)(e);
            }

            return tickText;
          });

        d3.select(this)
          .selectAll("line")
          .style("stroke", (x) => {
            return x < d.plot.q1
              ? legendColors()[0]
              : x > d.plot.q3
              ? legendColors()[2]
              : legendColors()[1];
          });

        if (d.plot.scaleX === "log") {
          d3.select(this)
            .selectAll(".tick > text")
            .attr("transform", "rotate(-45)")
            .attr("dy", "-4")
            .attr("dx", "7")
            .style("text-anchor", "end");
        }
      });

    yAxisContainer.each(function (d, i) {
      let yAxis = d3.axisLeft(d.scaleY).tickSize(3);

      d3.select(this).call(yAxis);

      d3.select(this)
        .selectAll("text")
        .style("fill", (x) => {
          return x < d.plot.q1
            ? legendColors()[0]
            : x > d.plot.q3
            ? legendColors()[2]
            : legendColors()[1];
        })
        .text(function (e) {
          let tickText = d3.select(this).text();
          if (d.plot.scaleX === "log") {
            tickText = tickText === "" ? "" : d3.format("~s")(e);
          } else {
            tickText = tickText === "" ? "" : d3.format(d.plot.format)(e);
          }
          return tickText;
        });

      d3.select(this)
        .selectAll("line")
        .style("stroke", (x) => {
          return x < d.plot.q1
            ? legendColors()[0]
            : x > d.plot.q3
            ? legendColors()[2]
            : legendColors()[1];
        });

      if (d.plot.scaleX === "log") {
        d3.select(this)
          .selectAll(".tick > text")
          .attr("transform", "rotate(-45)")
          .attr("dy", "-4")
          .attr("dx", "7")
          .style("text-anchor", "end");
      }
    });
  }

  render() {
    const {
      width,
      height,
      panelWidth,
      panelHeight,
      xScale,
      histograms,
      markers,
    } = this.getPlotConfiguration();

    let cutOffid = `cuttOffViewPane-${Math.random()}`;
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
            <clipPath key="cuttOffViewPane" id={cutOffid}>
              <rect
                x={0}
                y={0}
                width={2 * panelWidth}
                height={1 * panelHeight}
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
              <g clipPath={`url(#${cutOffid})`}>
                {histograms.map((hist, i) => (
                  <g
                    key={`hist-${hist.plot.id}-${i}`}
                    transform={`translate(${[
                      xScale(hist.plot.id) + 1.5 * xScale.step(),
                      0,
                    ]})`}
                  >
                    <path
                      fill="#CCC"
                      fillOpacity={1}
                      stroke="lightgray"
                      strokeWidth="0"
                      d={d3
                        .area()
                        .y((d) => hist.scaleY(d[0]))
                        .x0((d) => -hist.scaleX(d[1]))
                        .x1(-hist.scaleX(0))
                        .curve(d3.curveBasis)(hist.density)}
                    />
                    <path
                      fill="#999999"
                      fillOpacity={0}
                      stroke="gray"
                      strokeWidth="0.33"
                      d={d3
                        .area()
                        .y((d) => hist.scaleY(d[0]))
                        .x0((d) => -hist.scaleX(d[1]))
                        .x1(-hist.scaleX(0))
                        .curve(d3.curveBasis)(hist.density)}
                    />
                    {markers[hist.plot.id] != null && (
                      <g
                        transform={`translate(${[
                          -1.5 * xScale.step(),
                          hist.scaleY(markers[hist.plot.id]),
                        ]})`}
                      >
                        <line
                          x1={xScale.step()}
                          x2={xScale.step() / 2}
                          stroke="red"
                          strokeWidth={1}
                        />
                      </g>
                    )}
                  </g>
                ))}
              </g>
            </g>
          </g>
        </svg>
      </Wrapper>
    );
  }
}
ViolinPlot.propTypes = {
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  data: PropTypes.array,
  markValue: PropTypes.number,
};
ViolinPlot.defaultProps = {
  data: [],
};
const mapDispatchToProps = () => ({});
const mapStateToProps = () => ({});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(ViolinPlot));
