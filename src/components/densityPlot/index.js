import React, { Component } from "react";
import { PropTypes } from "prop-types";
import * as d3 from "d3";
import { connect } from "react-redux";
import { withTranslation } from "react-i18next";
import {
  Legend,
  measureText,
  snakeCaseToHumanReadable,
} from "../../helpers/utility";
import Wrapper from "./index.style";

const margins = {
  gap: 0,
  gapX: 34,
  gapY: 24,
  yTicksCount: 10,
  tooltipGap: 5,
  gapLegend: 50,
};

class DensityPlot extends Component {
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
      t,
      width,
      height,
      dataPoints,
      xRange,
      yRange,
      xVariable,
      yVariable,
      xFormat,
      yFormat,
      xTitle,
      yTitle,
      plotType,
      colorVariable,
      colorSchemeSeq,
      colorSchemeOrdinal,
      contourBandwidth,
      contourThresholdCount,
      colorFormat,
      colorVariableType,
    } = this.props;

    let stageWidth = width - 2 * margins.gapX;
    let stageHeight = height - 3 * margins.gapY;

    let panelWidth = stageWidth;
    let panelHeight = stageHeight - margins.gapLegend;

    let xScale = d3
      .scaleLinear()
      .domain(
        xRange || [
          0,
          d3.quantile(
            dataPoints.map((d) => d[xVariable]),
            0.99
          ),
        ]
      )
      .range([0, panelWidth])
      .clamp(true)
      .nice();
    let yScale = d3
      .scaleLinear()
      .domain(
        yRange || [
          0,
          d3.quantile(
            dataPoints.map((d) => d[yVariable]),
            0.99
          ),
        ]
      )
      .clamp(true)
      .range([panelHeight, 0])
      .nice();

    let contours, legend, color;

    if (plotType === "scatterplot") {
      color =
        colorVariableType === "enum"
          ? d3
              .scaleOrdinal()
              .domain(
                [...new Set(dataPoints.map((d) => d[colorVariable]))].sort(
                  (a, b) => d3.ascending(a, b)
                )
              )
              .range(colorSchemeOrdinal)
          : d3
              .scaleSequential(colorSchemeSeq)
              .domain([
                0,
                d3.quantile(
                  dataPoints.map((d) => d[colorVariable]),
                  0.99
                ),
              ])
              .clamp(true)
              .nice();
      legend = Legend(color, {
        title: snakeCaseToHumanReadable(colorVariable),
        tickFormat: colorFormat,
      });
    } else {
      contours = d3
        .contourDensity()
        .x((d) => xScale(d[xVariable]))
        .y((d) => yScale(d[yVariable]))
        .thresholds(contourThresholdCount)
        .bandwidth(contourBandwidth)
        .size([width, height])(dataPoints);
      color = d3
        .scaleSequential(colorSchemeSeq)
        .domain(d3.extent(contours, (d) => d.value))
        .nice();
      legend = Legend(color, {
        title: t("general.density"),
        tickFormat: "0.2f",
      });
    }

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
      contours,
      plotType,
      colorVariable,
    };
  }

  renderXAxis() {
    const { xScale, xFormat } = this.getPlotConfiguration();

    let xAxisContainer = d3
      .select(this.plotContainer)
      .select(".x-axis-container");

    const axisX = d3.axisBottom(xScale).tickFormat(d3.format(xFormat));

    xAxisContainer.call(axisX);
  }

  renderYAxis() {
    const { yScale, yFormat } = this.getPlotConfiguration();

    let yAxisContainer = d3
      .select(this.plotContainer)
      .select(".y-axis-container");

    let yAxis = d3.axisLeft(yScale).tickFormat(d3.format(yFormat));
    yAxisContainer.call(yAxis);
  }

  handleMouseEnter = (e, d, i) => {
    const { panelHeight, panelWidth, xScale, yScale, xVariable, yVariable } =
      this.getPlotConfiguration();
    let tooltipContent = Object.keys(d).map((key) => {
      return { label: snakeCaseToHumanReadable(key), value: d[key] };
    });
    let diffY = d3.min([
      5,
      panelHeight - yScale(d[yVariable]) - tooltipContent.length * 16 - 10,
    ]);
    let diffX = d3.min([
      5,
      panelWidth -
        xScale(d[xVariable]) -
        d3.max(tooltipContent, (d) =>
          measureText(`${d.label}: ${d.value}`, 12)
        ) -
        35,
    ]);
    this.setState({
      tooltip: {
        id: i,
        visible: true,
        x: xScale(d[xVariable]) + diffX,
        y: yScale(d[yVariable]) + diffY,
        text: tooltipContent,
      },
    });
  };

  handleMouseOut = (e, d) => {
    this.setState({
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
      color,
      legend,
      xTitle,
      yTitle,
      xScale,
      yScale,
      dataPoints,
      xVariable,
      yVariable,
      contours,
      plotType,
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
              <g key={`panel`} id={`panel`} transform={`translate(${[0, 0]})`}>
                <g clipPath="url(#cuttOffViewPane)">
                  <rect
                    width={panelWidth}
                    height={panelHeight}
                    fill="transparent"
                    stroke="lightgray"
                    strokeWidth={0.33}
                  />
                  {plotType === "contourplot" && (
                    <g strokeLinejoin="round">
                      {contours.map((d, i) => (
                        <path
                          key={i}
                          d={d3.geoPath()(d)}
                          strokeWidth={i % 5 ? 0.25 : 1}
                          stroke={d3.rgb(color(d.value)).darker(0.3)}
                          fill={color(d.value)}
                        />
                      ))}
                    </g>
                  )}
                  {plotType === "scatterplot" &&
                    dataPoints
                      .sort((a, b) => {
                        // Sort by oncogenicity first (false first, true last/top)
                        const oncogenicityOrder = d3.ascending(
                          a.oncogenicity || false,
                          b.oncogenicity || false
                        );
                        // If oncogenicity is different, use that order
                        return (
                          oncogenicityOrder ||
                          d3.ascending(a[colorVariable], b[colorVariable])
                        );
                      })
                      .map((d, i) => (
                        <path
                          key={d.id}
                          transform={`translate(${[
                            xScale(d[xVariable]),
                            yScale(d[yVariable]),
                          ]})`}
                          d={
                            d.oncogenicity
                              ? d3.symbol(d3.symbolStar, 100)()
                              : d3.symbol(d3.symbolCircle, 50)()
                          }
                          opacity={visible && id === i ? 1 : 1}
                          fill={color(d[colorVariable])}
                          stroke={visible && id === i ? "#ff7f0e" : "lightgray"}
                          strokeWidth={
                            visible && id === i ? 3 : d.oncogenicity ? 1 : 0.5
                          }
                          onMouseEnter={(e) => this.handleMouseEnter(e, d, i)}
                          onMouseOut={(e) => this.handleMouseOut(e, d)}
                        />
                      ))}
                </g>
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
                    fillOpacity="0.67"
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
DensityPlot.propTypes = {
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  data: PropTypes.array,
};
DensityPlot.defaultProps = {
  data: [],
  radius: 3.33,
  thresholdBreaks: 3,
  colorScheme: d3.schemeBlues,
  colorSchemeSeq: d3.interpolateBlues,
  colorSchemeOrdinal: d3.schemeTableau10,
  contourBandwidth: 15,
  contourThresholdCount: 100,
};
const mapDispatchToProps = () => ({});
const mapStateToProps = () => ({});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(DensityPlot));
