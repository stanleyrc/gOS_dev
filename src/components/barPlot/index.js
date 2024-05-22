import React, { Component } from "react";
import { PropTypes } from "prop-types";
import * as d3 from "d3";
import { connect } from "react-redux";
import { withTranslation } from "react-i18next";
import { Legend, measureText } from "../../helpers/utility";
import Wrapper from "./index.style";

const margins = {
  gap: 0,
  gapX: 34,
  gapY: 24,
  yTicksCount: 10,
  tooltipGap: 5,
  gapLegend: 50,
};

class BarPlot extends Component {
  plotContainer = null;

  state = {
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
    const {
      width,
      height,
      dataPoints,
      legendTitle,
      xVariable,
      yVariable,
      xFormat,
      yFormat,
      xTitle,
      yTitle,
      colorVariable,
      colorPalette,
    } = this.props;

    let stageWidth = width - 2 * margins.gapX;
    let stageHeight = height - 3 * margins.gapY;

    let panelWidth = stageWidth;
    let panelHeight = stageHeight - margins.gapLegend;

    let xScale = d3
      .scaleBand()
      .domain(dataPoints.map((d) => d[xVariable]))
      .range([0, panelWidth])
      .padding(0.1);

    let yScale = d3
      .scaleLinear()
      .domain([0, d3.max(dataPoints, (d) => d[yVariable])])
      .range([panelHeight, 0])
      .nice();

    let legend, color;

    color = d3.scaleOrdinal(
      Object.keys(colorPalette),
      Object.values(colorPalette)
    );

    legend = Legend(color, {
      width: Object.keys(colorPalette).length * 66,
      title: legendTitle,
      tickFormat: "0.0f",
    });

    return {
      width,
      height,
      panelWidth,
      panelHeight,
      xScale,
      yScale,
      xFormat,
      yFormat,
      color,
      legend,
      xTitle,
      yTitle,
      dataPoints,
      xVariable,
      yVariable,
      colorVariable,
    };
  }

  renderXAxis() {
    const { xScale, xFormat } = this.getPlotConfiguration();

    let xAxisContainer = d3
      .select(this.plotContainer)
      .select(".x-axis-container");

    const axisX = d3.axisBottom(xScale).tickSizeOuter(0);

    if (xFormat) {
      axisX.tickFormat(d3.format(xFormat));
    }

    xAxisContainer
      .call(axisX)
      .selectAll("text")
      .attr("y", 0)
      .attr("x", -49)
      .attr("dy", ".35em")
      .attr("transform", "rotate(-90)")
      .style("text-anchor", "start");
  }

  renderYAxis() {
    const { yScale, yFormat } = this.getPlotConfiguration();

    let yAxisContainer = d3
      .select(this.plotContainer)
      .select(".y-axis-container");

    let yAxis = d3.axisLeft(yScale).tickFormat(d3.format(yFormat));
    yAxisContainer.call(yAxis);
  }

  handleMouseEnter = (d, i) => {
    const { t } = this.props;
    const { xScale, yScale, xVariable, yVariable } =
      this.getPlotConfiguration();
    this.setState({
      tooltip: {
        id: d.id,
        visible: true,
        x: xScale(d[xVariable]) + margins.tooltipGap,
        y: yScale(d[yVariable]) - margins.tooltipGap,
        text: Object.keys(d).map((e) => {
          return { label: t(`metadata.${e}`), value: d[e] };
        }),
      },
    });
  };

  handleMouseOut = (d) => {
    this.setState({
      tooltip: {
        id: null,
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
      color,
      legend,
      xTitle,
      yTitle,
      xScale,
      yScale,
      dataPoints,
      xVariable,
      yVariable,
      colorVariable,
    } = this.getPlotConfiguration();

    const { tooltip } = this.state;
    const { visible, id } = tooltip;
    const svgString = new XMLSerializer().serializeToString(legend);
    return (
      <Wrapper className="ant-wrapper" margins={margins}>
        <div
          style={{
            width: panelWidth,
            height: margins.gapLegend,
            marginLeft: margins.gapX,
          }}
          dangerouslySetInnerHTML={{
            __html: svgString,
          }}
        />

        <div
          className="histogram-plot"
          style={{ width: width, height: height }}
          ref={(elem) => (this.container = elem)}
        >
          <svg
            width={width}
            height={height}
            className="plot-container"
            ref={(elem) => (this.plotContainer = elem)}
          >
            <g transform={`translate(${[margins.gapX, margins.gapY]})`}>
              <g
                key={`panel`}
                id={`panel`}
                transform={`translate(${[0, margins.xDistributionHeight]})`}
              >
                <g
                  className="axis--y y-axis-container"
                  transform={`translate(${[margins.gap, 0]})`}
                ></g>
                <g className="axis--y-text">
                  <text
                    className="x-axis-title"
                    x={-margins.gapX}
                    y={-0.5 * margins.gapY}
                    textAnchor="start"
                  >
                    {yTitle}
                  </text>
                </g>
                <g
                  className="axis--x x-axis-container"
                  transform={`translate(${[margins.gap, panelHeight]})`}
                ></g>
                <g className="axis--x-text">
                  <text
                    x={panelWidth}
                    y={panelHeight + 1.5 * margins.gapY}
                    className="x-axis-title"
                    textAnchor="end"
                  >
                    {xTitle}
                  </text>
                </g>
              </g>
              <g className="x-distribution-container">
                {dataPoints.map((d, i) => (
                  <rect
                    id={`bar-${d.id}`}
                    x={xScale(d[xVariable])}
                    y={yScale(d[yVariable])}
                    width={xScale.bandwidth()}
                    height={yScale(0) - yScale(d[yVariable])}
                    fill={
                      visible && id === d.id
                        ? "#ff7f0e"
                        : color(d[colorVariable])
                    }
                    onMouseEnter={(e) => this.handleMouseEnter(d)}
                    onMouseOut={(e) => this.handleMouseOut(d)}
                  />
                ))}
              </g>
              {visible && (
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
        </div>
      </Wrapper>
    );
  }
}
BarPlot.propTypes = {
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  data: PropTypes.array,
};
BarPlot.defaultProps = {
  data: [],
  radius: 3.33,
  yDomainRange: [0, 50],
  colorDomain: [0, 40],
  colorSchemeSeq: d3.interpolateYlGnBu,
};
const mapDispatchToProps = () => ({});
const mapStateToProps = () => ({});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(BarPlot));
