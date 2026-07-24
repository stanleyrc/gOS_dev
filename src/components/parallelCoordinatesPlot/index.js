import React, { Component } from "react";
import { PropTypes } from "prop-types";
import * as d3 from "d3";
import { connect } from "react-redux";
import { withTranslation } from "react-i18next";
import { legendColors } from "../../helpers/utility";
import {
  getSourceCaseIdentity,
  sourceCaseIdentityKey,
} from "../../helpers/browseScope";
import Wrapper from "./index.style";

export class ParallelCoordinatesPlot extends Component {
  plotContainer = null;

  getAxisLabel = (axis = {}) =>
    axis?.metadata?.shortTitle ||
    axis?.metadata?.title ||
    axis?.title ||
    axis?.id ||
    "";

  componentDidMount() {
    this.renderXAxis();
  }

  componentDidUpdate() {
    this.renderXAxis();
  }

  getPlotConfiguration() {
    const { width, data, margins, style, comparisonGroups, t } = this.props;

    const keys = data.map((axis) => axis.id);
    const height = keys.length * margins.vSpace + margins.gapY * 2;
    const panelWidth = width - 2 * margins.gapX;
    const panelHeight = height - 2 * margins.gapY;
    const yScale = d3.scalePoint().domain(keys).range([0, panelHeight]);

    const plotData = data.map((axis) => {
      const comparisonAxes = (comparisonGroups || [])
        .map((group) => group.data?.find((candidate) => candidate.id === axis.id))
        .filter(Boolean);
      const domainCandidates = [
        ...(Array.isArray(axis.range) ? axis.range : []),
        ...comparisonAxes
          .map((candidate) =>
            Array.isArray(candidate.range) ? candidate.range : [],
          )
          .flat(),
        ...(axis.dataset || []).map((item) => item.value),
        ...comparisonAxes
          .map((candidate) => candidate.dataset || [])
          .flat()
          .map((item) => item.value),
      ].filter((value) => value != null && Number.isFinite(+value));
      let domain = d3.extent(domainCandidates);
      const plotScale =
        axis.scaleX === "log" ? d3.scaleLog() : d3.scaleLinear();

      if (axis.scaleX === "log") {
        const positiveDomain = d3.extent(
          domainCandidates.filter((value) => +value > 0),
        );
        domain =
          positiveDomain[0] == null || positiveDomain[1] == null
            ? [1, 10]
            : positiveDomain;
        if (domain[0] === domain[1]) domain = [domain[0], domain[0] * 10];
      } else if (domain[0] == null || domain[1] == null) {
        domain = [0, 1];
      } else if (domain[0] === domain[1]) {
        domain = [domain[0] - 1, domain[1] + 1];
      }

      return {
        ...axis,
        xScale: plotScale
          .domain(domain)
          .range([0, panelWidth])
          .nice()
          .clamp(true),
        yScale,
      };
    });
    const plotDataMap = Object.fromEntries(
      plotData.map((axis) => [axis.id, axis]),
    );
    const mergedStyle = {
      ...(ParallelCoordinatesPlot.defaultProps.style || {}),
      ...(style || {}),
    };

    const buildLineData = ({
      groupId,
      label,
      color,
      hoverStroke,
      axes,
      lineWidth,
      strokeOpacity,
    }) => {
      const recordsByIdentity = new Map();

      (axes || []).forEach((axis) => {
        (axis.dataset || []).forEach((item) => {
          const identityKey = sourceCaseIdentityKey(item) || `${item.pair}`;
          if (!recordsByIdentity.has(identityKey)) {
            recordsByIdentity.set(identityKey, {
              identity: getSourceCaseIdentity(item),
              pair: item.pair,
              values: {},
            });
          }
          recordsByIdentity.get(identityKey).values[axis.id] = item.value;
        });
      });

      return Array.from(recordsByIdentity.entries()).map(
        ([identityKey, record]) => {
          const segments = keys
            .map((key) => {
              const value = record.values[key];
              return {
                axis: key,
                value,
                x:
                  value !== undefined
                    ? plotDataMap[key].xScale(value)
                    : null,
                y: yScale(key),
              };
            })
            .filter((segment) => segment.x !== null);

          return {
            ...record.identity,
            id: `${groupId}-${identityKey}`,
            groupId,
            identityKey,
            label,
            pair: record.pair,
            color,
            hoverStroke,
            lineWidth,
            strokeOpacity,
            segments,
          };
        },
      );
    };

    const lineData = [
      ...buildLineData({
        groupId: "current",
        label: t("containers.list-view.cohorts.current-query"),
        color: mergedStyle.defaultLineStroke,
        hoverStroke: mergedStyle.highlightStroke,
        axes: plotData,
        lineWidth: mergedStyle.defaultLineWidth,
        strokeOpacity: mergedStyle.defaultLineOpacity,
      }),
      ...(comparisonGroups || []).flatMap((group) =>
        buildLineData({
          groupId: group.id,
          label: group.label,
          color: group.color,
          hoverStroke: group.color,
          axes: group.data,
          lineWidth: mergedStyle.comparisonLineWidth,
          strokeOpacity: mergedStyle.comparisonLineOpacity,
        }),
      ),
    ];

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
        .attr("stroke", (line) => line.color || defaultLineStroke)
        .attr(
          "stroke-width",
          (line) => line.lineWidth ?? defaultLineWidth,
        )
        .attr("stroke-opacity", (line) => line.strokeOpacity ?? 1);
    const showTooltip = (event, d) => {
      const [x, y] = d3.pointer(event, this.plotContainer);
      tooltip
        .attr("x", x + tooltipOffsetX)
        .attr("y", y)
        .text(d.label ? `${d.label}: ${d.pair}` : d.pair)
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
        .attr("fill", d.hoverStroke || d.color || highlightStroke)
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
      .data(lineData, (d) => d.id);

    lines
      .enter()
      .append("path")
      .attr("class", "data-line")
      .attr("fill", "none")
      .attr("stroke", (d) => d.color || defaultLineStroke)
      .attr("stroke-width", (d) => d.lineWidth ?? defaultLineWidth)
      .attr("stroke-opacity", (d) => d.strokeOpacity ?? 1)
      .style("cursor", "pointer")
      .attr("d", (d) => lineGenerator(d.segments))
      .on("click", (event, d) => {
        handleCardClick(event, d);
      })
      .on("mouseover", function (event, d) {
        resetLines();
        d3.select(this)
          .raise()
          .attr("stroke", d.hoverStroke || d.color || highlightStroke)
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
      .attr("stroke", (d) => d.color || defaultLineStroke)
      .attr("stroke-width", (d) => d.lineWidth ?? defaultLineWidth)
      .attr("stroke-opacity", (d) => d.strokeOpacity ?? 1)
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        handleCardClick(event, d);
      })
      .on("mouseover", function (event, d) {
        resetLines();
        d3.select(this)
          .raise()
          .attr("stroke", d.hoverStroke || d.color || highlightStroke)
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
      .text((d) => this.getAxisLabel(d));

    axisLegend.text((d) => this.getAxisLabel(d));

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
  comparisonGroups: PropTypes.array,
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  data: PropTypes.array,
  handleCardClick: PropTypes.func,
  style: PropTypes.shape({
    defaultLineStroke: PropTypes.string,
    defaultLineWidth: PropTypes.number,
    defaultLineOpacity: PropTypes.number,
    comparisonLineWidth: PropTypes.number,
    comparisonLineOpacity: PropTypes.number,
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
  comparisonGroups: [],
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
    defaultLineOpacity: 0.22,
    comparisonLineWidth: 1.25,
    comparisonLineOpacity: 0.6,
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
