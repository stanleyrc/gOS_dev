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
  tooltipGap: 5,
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

    let stageWidth = width - 2 * margins.gapX;
    let stageHeight = height - 3 * margins.gapY;

    let panelWidth = stageWidth;
    let panelHeight = stageHeight;

    let filteredData0 = data.filter((d) => d.metadata.mean);
    let nestedData0 = d3.group(
      filteredData0,
      (d) => +d3.format(".2f")(d.metadata.mean),
      (d) => d.chromosome
    );

    let dats = [];
    // Calculate cumulative sum for each group
    nestedData0.forEach((group0, xVal) => {
      group0.forEach((group, chromosome) => {
        dats.push({
          id: `${xVal}-${chromosome}`,
          mean: xVal,
          chromosome: chromosome,
          count: Array.from(group.values()).flat().length,
          width: d3.sum(
            Array.from(group.values()).flat(),
            (e) => e.metadata.width
          ),
          iids: Array.from(group.values()).flat(),
        });
      });
    });

    let filteredData = dats;
    let nestedData = d3.group(
      filteredData,
      (d) => d.mean,
      (d) => d.chromosome
    );

    let extent = d3.extent(Array.from(nestedData.keys()));
    let xVals = Array.from(nestedData.keys()).sort((a, b) =>
      d3.ascending(a, b)
    ); // d3.range(extent[0], extent[1], 0.1);

    // Calculate cumulative sum for each group
    nestedData.forEach((group0, xVal) => {
      group0.forEach((group, chromosome) => {
        group.forEach((d, i) => {
          d.cumulativeWidth =
            i === 0 ? d.width : d.width + group[i - 1].cumulativeWidth;
        });
      });
    });

    const xScale = d3
      .scaleBand(xVals, [0, panelWidth])
      .round(true)
      .padding(0.2);

    let yScale = d3
      .scaleLinear()
      .domain([0, d3.max(filteredData, (d) => d.cumulativeWidth)])
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
      data: filteredData,
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
          return !(i % 20);
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
      .ticks(6, "~s")
      .tickSize(3)
      .tickFormat(d3.format("~s"));
    yAxisContainer.call(yAxis);
  }

  handleMouseEnter = (d, i) => {
    const { t } = this.props;
    const { xScale, yScale, height } = this.getPlotConfiguration();
    let diffY = d3.min([
      0,
      height - yScale(d.cumulativeWidth) - segmentAttributes().length * 16 - 40,
    ]);
    this.setState({
      segmentId: d.id,
      tooltip: {
        id: i,
        visible: true,
        x: xScale(d.mean) + margins.tooltipGap,
        y: yScale(d.cumulativeWidth) + diffY,
        text: segmentAttributes().map((e) => {
          return { label: t(`metadata.aggregate-ppfit.${e}`), value: d[e] };
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
      yScale,
      data,
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
                {data.map((d, i) => (
                  <rect
                    fill={chromoBins[d.chromosome]?.color}
                    x={xScale(d.mean)}
                    width={xScale.bandwidth()}
                    y={yScale(d.cumulativeWidth)}
                    height={yScale(0) - yScale(d.width)}
                    onMouseEnter={(e) => this.handleMouseEnter(d, i)}
                    onMouseOut={(e) => this.handleMouseOut(d)}
                    onClick={(e) => selectSegment(d)}
                    opacity={!segmentId || d.id === segmentId ? 1 : 0.13}
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
