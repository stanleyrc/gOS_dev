import React, { Component } from "react";
import { PropTypes } from "prop-types";
import * as d3 from "d3";
import { connect } from "react-redux";
import { withTranslation } from "react-i18next";
import { Legend, measureText } from "../../helpers/utility";
import { ckmeans } from "simple-statistics";
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
      t,
      plotType,
      colorVariable,
      thresholdBreaks,
      colorScheme,
      colorSchemeSeq,
      contourBandwidth,
      contourThresholdCount,
    } = this.props;

    let stageWidth = width - 2 * margins.gapX;
    let stageHeight = height - 3 * margins.gapY;

    let panelWidth = stageWidth;
    let panelHeight = stageHeight - margins.gapLegend;

    let xScale = d3.scaleLinear().domain(xRange).range([0, panelWidth]).nice();
    let yScale = d3.scaleLinear().domain(yRange).range([panelHeight, 0]).nice();

    // Compute the density contours.
    const contours = d3
      .contourDensity()
      .x((d) => xScale(d[xVariable]))
      .y((d) => yScale(d[yVariable]))
      .thresholds(contourThresholdCount)
      .bandwidth(contourBandwidth)
      .size([width, height])(dataPoints);

    let legend, color;

    if (plotType === "scatterplot") {
      let ckmeansThresholds = ckmeans(
        dataPoints.map((d) => d[colorVariable]),
        thresholdBreaks
      ).map((v) => v.pop());
      color = d3
        .scaleThreshold()
        .domain(ckmeansThresholds.slice(0, thresholdBreaks - 1))
        .range(colorScheme[thresholdBreaks]);
      legend = Legend(color, {
        title: t(`metadata.${colorVariable}`),
        tickFormat: "0.0f",
      });
    } else {
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

  handleMouseEnter = (d, i) => {
    const { t } = this.props;
    const { xScale, yScale, xVariable, yVariable } =
      this.getPlotConfiguration();
    this.setState({
      tooltip: {
        id: i,
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
                  <rect width={panelWidth} height={panelHeight} fill="#FFF" />
                  {plotType === "contourplot" && (
                    <g stroke-linejoin="round">
                      {contours.map((d, i) => (
                        <path
                          d={d3.geoPath()(d)}
                          strokeWidth={i % 5 ? 0.25 : 1}
                          stroke={d3.rgb(color(d.value)).darker(0.3)}
                          fill={color(d.value)}
                        />
                      ))}
                    </g>
                  )}
                  {plotType === "scatterplot" &&
                    dataPoints.map((d, i) => (
                      <circle
                        cx={xScale(d[xVariable])}
                        cy={yScale(d[yVariable])}
                        r={visible && id === i ? 5 : 1.618}
                        opacity={visible && id === i ? 1 : 1}
                        fill={color(d.T_DP)}
                        stroke={visible && id === i ? "#FFF" : "transparent"}
                        strokeWidth={visible && id === i ? 3 : 0}
                        onMouseEnter={(e) => this.handleMouseEnter(d, i)}
                        onMouseOut={(e) => this.handleMouseOut(d)}
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
  contourBandwidth: 10,
  contourThresholdCount: 1000,
};
const mapDispatchToProps = () => ({});
const mapStateToProps = () => ({});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(DensityPlot));
