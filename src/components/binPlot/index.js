import React, { Component } from "react";
import { PropTypes } from "prop-types";
import * as d3 from "d3";
import { connect } from "react-redux";
import { withTranslation } from "react-i18next";
import { measureText, segmentAttributes } from "../../helpers/utility";
import Wrapper from "./index.style";

const margins = {
  gap: 0,
  gapX: 34,
  gapY: 24,
  yTicksCount: 10,
  tooltipGap: 10,
  minBarHeight: 5,
};

class BinPlot extends Component {
  plotContainer = null;

  state = {
    segmentId: null,
    tooltip: {
      id: -1,
      visible: false,
      shapeId: -1,
      x: -1000,
      y: -1000,
      text: [],
    },
  };

  componentDidMount() {
    this.renderYAxis();
    this.renderXAxis();
  }

  componentDidUpdate() {
    this.renderYAxis();
    this.renderXAxis();
  }

  getPlotConfiguration() {
    const { width, height, data, xTitle, yTitle, chromoBins, selectSegment } =
      this.props;

    const { minBarHeight } = margins;

    let stageWidth = width - 2 * margins.gapX;
    let stageHeight = height - 3 * margins.gapY;

    let panelWidth = stageWidth;
    let panelHeight = stageHeight;

    let filteredData = data.filter((d) => d.metadata.mean);

    let series = d3.groups(
      filteredData,
      (d) => +d3.format(".2f")(d.metadata.mean)
    );

    series.forEach((d, i) => {
      let values = d[1];
      let acc = 0;
      values
        .sort((a, b) =>
          d3.ascending(
            Object.keys(chromoBins).indexOf(a.chromosome),
            Object.keys(chromoBins).indexOf(b.chromosome)
          )
        )
        .forEach((e, j) => {
          e.xPos = d[0];
          e.pos = acc;
          e.cumulativeWidth = e.pos + e.metadata.width;
          e.width = e.metadata.width;
          e.mean = d[0];
          acc = e.cumulativeWidth;
        });
    });

    let maxWidth = d3.max(
      series.map((d) => d3.sum(d[1], (e) => e.metadata.width))
    );
    let maxInstance = series.find(
      (d) => d3.sum(d[1], (e) => e.metadata.width) === maxWidth
    );

    let smallest = maxInstance[1].filter(
      (d) => (d.metadata.width * panelHeight) / maxWidth < minBarHeight
    );
    let remainderWidth = maxWidth - d3.sum(smallest, (d) => d.metadata.width);

    let coefficient =
      (panelHeight - smallest.length * minBarHeight) / remainderWidth;

    series.forEach((d, i) => {
      let values = d[1];
      let acc = panelHeight;
      values.forEach((e, j) => {
        e.posPixels = acc;
        e.widthPixels = d3.max([coefficient * e.metadata.width, minBarHeight]);
        e.cumulativeWidthPixels = e.posPixels - e.widthPixels;
        acc = e.cumulativeWidthPixels;
      });
    });

    series = series.map((d) => d[1]).flat();

    let xVals = [...new Set(series.map((d) => d.xPos))].sort((a, b) =>
      d3.ascending(a, b)
    );

    const xScale = d3
      .scaleBand()
      .domain(xVals)
      .range([0, panelWidth])
      .paddingInner(0.33)
      .paddingOuter(0)
      .align(0.5)
      .round(true);

    let yScale = d3
      .scaleLinear()
      .domain([0, d3.max(series, (d) => d.cumulativeWidth)])
      .range([panelHeight, 0])
      .nice();

    return {
      width,
      height,
      panelWidth,
      panelHeight,
      xScale,
      yScale,
      xTitle,
      yTitle,
      series,
      chromoBins,
      selectSegment,
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
      .tickValues(
        xScale.domain().filter(function (d, i) {
          return !(i % 2);
        })
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
      .ticks(10)
      .tickSize(3)
      .tickFormat(d3.format("~s"));
    yAxisContainer.call(yAxis);
  }

  handleMouseEnter = (d, i) => {
    const { t } = this.props;
    const { xScale, height } = this.getPlotConfiguration();
    let diffY = d3.min([
      10,
      height -
        d.cumulativeWidthPixels -
        Object.keys(segmentAttributes()).length * 16 -
        40,
    ]);
    this.setState({
      segmentId: d.iid,
      tooltip: {
        id: i,
        visible: true,
        x: xScale(d.xPos) + margins.tooltipGap,
        y: d.cumulativeWidthPixels + diffY,
        text: Object.keys(segmentAttributes()).map((e) => {
          return {
            label: t(`metadata.aggregate-ppfit.${e}`),
            value: d3.format(segmentAttributes()[e])(d[e]),
          };
        }),
      },
    });
  };

  handleMouseOut = (d) => {
    this.setState({
      segmentId: null,
      tooltip: {
        id: -1,
        visible: false,
        shapeId: -1,
        x: -1000,
        y: -1000,
        text: [],
      },
    });
  };

  render() {
    const {
      width,
      height,
      panelWidth,
      panelHeight,
      xScale,
      series,
      xTitle,
      yTitle,
      chromoBins,
      selectSegment,
    } = this.getPlotConfiguration();

    const { tooltip, segmentId } = this.state;
    const { visible, id } = tooltip;

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
                {series.map((d, i) => (
                  <rect
                    fill={chromoBins[d.chromosome]?.color}
                    x={xScale(d.xPos)}
                    width={xScale.bandwidth()}
                    y={d.cumulativeWidthPixels}
                    height={d.widthPixels}
                    onMouseEnter={(e) => this.handleMouseEnter(d, i)}
                    onMouseOut={(e) => this.handleMouseOut(d)}
                    onClick={(e) => selectSegment(d)}
                    stroke="#FFF"
                    strokeWidth={0.5}
                    rx={1}
                    opacity={!segmentId || d.iid === segmentId ? 1 : 0.13}
                  />
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
            {tooltip.visible && (
              <g
                className="tooltip"
                transform={`translate(${[tooltip.x, tooltip.y]})`}
                pointerEvents="none"
              >
                <rect
                  x="0"
                  y="0"
                  width={d3.max(
                    tooltip.text,
                    (d) => measureText(`${d.label}: ${d.value}`, 12) + 30
                  )}
                  height={tooltip.text.length * 16 + 12}
                  rx="5"
                  ry="5"
                  fill="rgb(97, 97, 97)"
                  fillOpacity="0.97"
                />
                <text x="10" y="28" fontSize="12" fill="#FFF">
                  {tooltip.text.map((d, i) => (
                    <tspan key={i} x={10} y={18 + i * 16}>
                      <tspan fontWeight="bold">{d.label}</tspan>: {d.value}
                    </tspan>
                  ))}
                </text>
              </g>
            )}
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
const mapStateToProps = (state) => ({
  chromoBins: state.App.chromoBins,
});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(BinPlot));
