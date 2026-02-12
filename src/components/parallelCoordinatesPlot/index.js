import React, { Component } from "react";
import { PropTypes } from "prop-types";
import * as d3 from "d3";
import { connect } from "react-redux";
import { withTranslation } from "react-i18next";
import { legendColors } from "../../helpers/utility";
import Wrapper from "./index.style";

class ParallelCoordinatesPlot extends Component {
  plotContainer = null;

  componentDidMount() {
    this.renderXAxis();
  }

  componentDidUpdate() {
    this.renderXAxis();
  }

  getPlotConfiguration() {
    const { width, data, margins, style } = this.props;

    let keys = data.map((d) => d.id);
    let height = keys.length * margins.vSpace + margins.gapY * 2;
    let stageWidth = width - 2 * margins.gapX;
    let stageHeight = height - 2 * margins.gapY;

    let panelWidth = stageWidth;
    let panelHeight = stageHeight;
    let yScale = d3.scalePoint().domain(keys).range([0, panelHeight]);

    let dataMap = {};
    let plotData = data.map((d) => {
      let plotScale = d.scaleX === "log" ? d3.scaleLog() : d3.scaleLinear();
      let xScale = plotScale
        .domain(d.range)
        .range([0, panelWidth])
        .nice()
        .clamp(true);

      d.dataset.forEach((item) => {
        dataMap[item.pair] = dataMap[item.pair] || {};
        dataMap[item.pair][d.id] = item.value;
      });

      return {
        ...d,
        xScale,
        yScale,
      };
    });
    let plotDataMap = {};
    plotData.forEach((d) => {
      plotDataMap[d.id] = d;
    });
    let lineData = Object.keys(dataMap).map((pair, i) => {
      let pairData = dataMap[pair];
      let segments = keys
        .map((key, i) => {
          const value = pairData[key];
          return {
            axis: key,
            value,
            x: value !== undefined ? plotDataMap[key].xScale(value) : null,
            y: yScale(key),
          };
        })
        .filter((d) => d.x !== null);

      return {
        pair,
        segments,
      };
    });
    const mergedStyle = {
      ...(ParallelCoordinatesPlot.defaultProps.style || {}),
      ...(style || {}),
    };

    return {
      width,
      height,
      panelWidth,
      panelHeight,
      margins,
      style: mergedStyle,
      yScale,
      keys,
      data: plotData,
      lineData,
    };
  }

  renderXAxis() {
    const {
      margins,
      style = {},
      yScale,
      data,
      lineData,
    } = this.getPlotConfiguration();
    const { xTicksCount, tickSize } = margins;
    const {
      defaultLineStroke,
      defaultLineWidth,
      highlightStroke,
      highlightWidth,
      tooltipOffsetX = 10,
      hoverPointRadius,
      hoverPointStroke,
      hoverPointStrokeWidth,
    } = style;
    const { handleCardClick } = this.props;

    const plotGroup = d3.select(this.plotContainer).select(".plot-group");
    const linesGroup = plotGroup.selectAll(".lines-group").data([null]);
    linesGroup.enter().append("g").attr("class", "lines-group");
    const linesLayer = plotGroup.select(".lines-group");

    const axesGroup = plotGroup.selectAll(".axes-group").data([null]);
    axesGroup.enter().append("g").attr("class", "axes-group");
    const axesLayer = plotGroup.select(".axes-group");

    const overlayGroup = plotGroup.selectAll(".overlay-group").data([null]);
    overlayGroup.enter().append("g").attr("class", "overlay-group");
    const overlayLayer = plotGroup.select(".overlay-group");
    const hoverPointsLayer = overlayLayer
      .selectAll(".hover-points")
      .data([null])
      .join("g")
      .attr("class", "hover-points");
    const tooltip = overlayLayer
      .selectAll(".line-tooltip")
      .data([null])
      .join("text")
      .attr("class", "line-tooltip")
      .attr("fill", "#333")
      .attr("font-size", 11)
      .attr("font-weight", "700")
      .attr("pointer-events", "none")
      .attr("opacity", 0);

    const lineGenerator = d3
      .line()
      .x((s) => s.x)
      .y((s) => s.y);

    const formatterMap = {};
    data.forEach((axis) => {
      formatterMap[axis.id] = d3.format(axis.format);
    });
    const resetLines = () =>
      linesLayer
        .selectAll(".data-line")
        .attr("stroke", defaultLineStroke)
        .attr("stroke-width", defaultLineWidth)
        .attr("stroke-opacity", 1);
    const showTooltip = (event, d) => {
      const [x, y] = d3.pointer(event, this.plotContainer);
      tooltip
        .attr("x", x + tooltipOffsetX)
        .attr("y", y)
        .text(d.pair)
        .attr("opacity", 1);
    };
    const hideTooltip = () => tooltip.attr("opacity", 0);
    const showPoints = (d) => {
      hoverPointsLayer
        .selectAll("circle")
        .data(d.segments, (s) => s.axis)
        .join("circle")
        .attr("class", "hover-point")
        .attr("cx", (s) => s.x)
        .attr("cy", (s) => s.y)
        .attr("r", hoverPointRadius)
        .attr("fill", highlightStroke)
        .attr("stroke", hoverPointStroke)
        .attr("stroke-width", hoverPointStrokeWidth)
        .attr("pointer-events", "none");

      hoverPointsLayer
        .selectAll("text")
        .data(d.segments, (s) => s.axis)
        .join("text")
        .attr("class", "hover-point-label")
        .attr("x", (s) => s.x + 8)
        .attr("y", (s) => s.y - 8)
        .attr("fill", "#333")
        .attr("font-size", 11)
        .attr("font-weight", "700")
        .attr("pointer-events", "none")
        .text((s) =>
          formatterMap[s.axis] ? formatterMap[s.axis](s.value) : s.value,
        );
    };
    const hidePoints = () => {
      hoverPointsLayer.selectAll("circle").remove();
      hoverPointsLayer.selectAll("text").remove();
    };

    let lines = linesLayer
      .selectAll(".data-line")
      .data(lineData, (d) => d.pair);

    lines
      .enter()
      .append("path")
      .attr("class", "data-line")
      .attr("fill", "none")
      .attr("stroke", defaultLineStroke)
      .attr("stroke-width", defaultLineWidth)
      .attr("stroke-opacity", 1)
      .style("cursor", "pointer")
      .attr("d", (d) => lineGenerator(d.segments))
      .on("click", (event, d) => {
        handleCardClick(event, d.pair);
      })
      .on("mouseover", function (event, d) {
        resetLines();
        d3.select(this)
          .raise()
          .attr("stroke", highlightStroke)
          .attr("stroke-width", highlightWidth);
        showTooltip(event, d);
        showPoints(d);
      })
      .on("mousemove", function (event, d) {
        showTooltip(event, d);
        showPoints(d);
      })
      .on("mouseout", function () {
        resetLines();
        hideTooltip();
        hidePoints();
      });

    lines
      .attr("d", (d) => lineGenerator(d.segments))
      .attr("stroke", defaultLineStroke)
      .attr("stroke-width", defaultLineWidth)
      .attr("stroke-opacity", 1)
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        handleCardClick(event, d.pair);
      })
      .on("mouseover", function (event, d) {
        resetLines();
        d3.select(this)
          .raise()
          .attr("stroke", highlightStroke)
          .attr("stroke-width", highlightWidth);
        showTooltip(event, d);
        showPoints(d);
      })
      .on("mousemove", function (event, d) {
        showTooltip(event, d);
        showPoints(d);
      })
      .on("mouseout", function () {
        resetLines();
        hideTooltip();
        hidePoints();
      });

    lines.exit().remove();

    let xAxisContainer = axesLayer
      .selectAll(".x-axis-container")
      .data(data, (d) => d.id);

    xAxisContainer
      .enter()
      .append("g")
      .attr("class", "x-axis-container")
      .attr("transform", (d) => `translate(0, ${yScale(d.id)})`);

    xAxisContainer.attr("transform", (d) => `translate(0, ${yScale(d.id)})`);

    xAxisContainer.exit().remove();

    xAxisContainer.each((d, i, nodes) => {
      let node = nodes[i];

      let xAxis = d3
        .axisBottom(d.xScale)
        .ticks(xTicksCount)
        .tickSize(tickSize)
        .tickFormat(d3.format(d.format));

      d3.select(node).call(xAxis);

      d3.select(node).select(".domain").remove();

      d3.select(node)
        .selectAll(".tick text")
        .style("fill", (x) => {
          return x < d.q1
            ? legendColors()[0]
            : x > d.q3
              ? legendColors()[2]
              : legendColors()[1];
        });

      d3.select(node)
        .selectAll(".tick line")
        .style("stroke", (x) => {
          return x < d.q1
            ? legendColors()[0]
            : x > d.q3
              ? legendColors()[2]
              : legendColors()[1];
        });

      d3.select(node)
        .selectAll(".axis-segment")
        .data([
          {
            cls: "axis-line-q1",
            x1: d.xScale.range()[0],
            x2: d.xScale(d.q1),
            color: legendColors()[0],
          },
          {
            cls: "axis-line-q2",
            x1: d.xScale(d.q1),
            x2: d.xScale(d.q3),
            color: legendColors()[1],
          },
          {
            cls: "axis-line-q3",
            x1: d.xScale(d.q3),
            x2: d.xScale.range()[1],
            color: legendColors()[2],
          },
        ])
        .join("line")
        .attr("class", (segment) => `axis-segment ${segment.cls}`)
        .attr("x1", (segment) => segment.x1)
        .attr("x2", (segment) => segment.x2)
        .attr("stroke", (segment) => segment.color)
        .attr("stroke-width", style.lineStrokeWidth);
    });

    let axisLegend = axesLayer
      .selectAll(".x-axis-container")
      .selectAll(".legend")
      .data(
        (d) => [d],
        (d) => d.id,
      );

    axisLegend
      .enter()
      .append("text")
      .attr("class", "legend")
      .attr("text-anchor", "start")
      .attr("dy", -5)
      .text((d) => d.metadata.shortTitle);

    axisLegend.text((d) => d.metadata.shortTitle);

    axisLegend.exit().remove();
  }

  render() {
    const { width, height, margins } = this.getPlotConfiguration();

    return (
      <Wrapper className="ant-wrapper" margins={margins}>
        <div
          className="histogram-plot"
          style={{ width, height }}
          ref={(elem) => (this.container = elem)}
        />
        <svg
          width={width}
          height={height}
          className="plot-container"
          ref={(elem) => (this.plotContainer = elem)}
        >
          <g
            className="plot-group"
            transform={`translate(${[margins.gapX, margins.gapY]})`}
          ></g>
        </svg>
      </Wrapper>
    );
  }
}
ParallelCoordinatesPlot.propTypes = {
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  data: PropTypes.array,
  handleCardClick: PropTypes.func,
  style: PropTypes.shape({
    defaultLineStroke: PropTypes.string,
    defaultLineWidth: PropTypes.number,
    highlightStroke: PropTypes.string,
    highlightWidth: PropTypes.number,
    tooltipOffsetX: PropTypes.number,
    lineStrokeWidth: PropTypes.number,
    hoverPointRadius: PropTypes.number,
    hoverPointStroke: PropTypes.string,
    hoverPointStrokeWidth: PropTypes.number,
  }),
};
ParallelCoordinatesPlot.defaultProps = {
  data: [],
  margins: {
    gap: 0,
    gapX: 34,
    gapY: 30,
    vSpace: 120,
    xTicksCount: 10,
    tickSize: 4,
  },
  style: {
    defaultLineStroke: "lightgray",
    defaultLineWidth: 1,
    highlightStroke: "#ff7f0e",
    highlightWidth: 3,
    tooltipOffsetX: 10,
    lineStrokeWidth: 2,
    hoverPointRadius: 5,
    hoverPointStroke: "#fff",
    hoverPointStrokeWidth: 3,
  },
};
const mapDispatchToProps = (dispatch) => ({});
const mapStateToProps = (state) => ({});
export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(withTranslation("common")(ParallelCoordinatesPlot));
