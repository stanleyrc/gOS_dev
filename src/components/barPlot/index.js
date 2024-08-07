import React, { Component } from "react";
import { PropTypes } from "prop-types";
import * as d3 from "d3";
import { connect } from "react-redux";
import { withTranslation } from "react-i18next";
import {
  Legend,
  measureText,
  mutationCatalogMetadata,
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
    this.getPlotConfiguration();
    this.renderYAxis();
    this.renderXAxis();
  }

  componentDidUpdate() {
    this.getPlotConfiguration();
    this.renderYAxis();
    this.renderXAxis();
  }

  getPlotConfiguration() {
    const {
      width,
      height,
      dataPoints,
      referenceDataPoints,
      legendTitle,
      xVariable,
      yVariable,
      xFormat,
      yFormat,
      xTitle,
      yTitle,
      colorVariable,
      colorPalette,
      legendTitles,
    } = this.props;

    let stageWidth = width - 2 * margins.gapX;
    let stageHeight = height - 3 * margins.gapY;

    let panelWidth = stageWidth;
    let panelHeight = stageHeight - margins.gapLegend;

    let rectangleBars = dataPoints.sort((a, b) =>
      d3.ascending(legendTitles[a.mutationType], legendTitles[b.mutationType])
    );

    let rectangleBarsReference = referenceDataPoints.sort((a, b) =>
      d3.ascending(legendTitles[a.mutationType], legendTitles[b.mutationType])
    );

    let xScale = d3
      .scaleBand()
      .domain(dataPoints.map((d) => d[xVariable]))
      .range([0, panelWidth])
      .padding(0.1);

    let yScale = d3
      .scaleLinear()
      .domain([
        0,
        d3.max([...dataPoints, ...referenceDataPoints], (d) => d[yVariable]),
      ])
      .range([panelHeight, 0])
      .nice();

    let legend, color, colorLegendTitles;

    color = d3.scaleOrdinal(
      Object.keys(colorPalette)
        .map((d) => legendTitles[d])
        .sort((a, b) => d3.ascending(a, b)),
      Object.values(colorPalette)
    );

    colorLegendTitles = d3.scaleOrdinal(
      Object.keys(colorPalette)
        .map((d) => legendTitles[d])
        .sort((a, b) => d3.ascending(a, b)),
      Object.values(colorPalette)
    );

    legend = Legend(colorLegendTitles, {
      width: Object.keys(colorPalette).length * 86,
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
      rectangleBars,
      rectangleBarsReference,
      xVariable,
      yVariable,
      colorVariable,
      legendTitles,
      colorLegendTitles,
    };
  }

  renderXAxis() {
    const { xScale, xFormat, dataPoints, colorLegendTitles } =
      this.getPlotConfiguration();

    let xAxisContainer = d3
      .select(this.plotContainer)
      .select(".x-axis-container");

    const axisX = d3.axisBottom(xScale).tickSize(3);

    if (xFormat) {
      axisX.tickFormat(d3.format(xFormat));
    }
    axisX.tickFormat(function (d, i) {
      return dataPoints[i].label;
    });

    xAxisContainer
      .call(axisX)
      .selectAll("text")
      .attr("y", -4)
      .attr("x", 0)
      .attr("dx", "-3.2em")
      .attr("transform", "rotate(-90)")
      .style("text-anchor", "middle")
      .call(function (text) {
        text.each(function (d, i) {
          var text = d3.select(this),
            words = text.text().split("").reverse(),
            word,
            line = [],
            lineNumber = 0,
            lineHeight = 0.8, // ems
            dx = parseFloat(text.attr("dx")),
            tspan = text
              .text(null)
              .append("tspan")
              .attr("x", 0)
              .attr("dx", dx + "em");
          let index = 0;
          while ((word = words.pop())) {
            line.push(word);
            tspan.text(line.join(" "));
            line.pop();
            tspan.text(line.join(" "));
            line = [word];
            tspan = text
              .append("tspan")
              .attr(
                "fill",
                index === 1
                  ? colorLegendTitles(dataPoints[i].mutationType)
                  : "gray"
              )
              .attr("font-weight", index === 1 ? "bold" : "normal")
              .attr("x", 0)
              .attr("dx", ++lineNumber * lineHeight + dx + "em")
              .text(word);
            index += 1;
          }
        });
      });
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
        y: yScale(0) - mutationCatalogMetadata().length * 20,
        text: mutationCatalogMetadata().map((e) => {
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
      rectangleBars,
      rectangleBarsReference,
      xVariable,
      yVariable,
      colorVariable,
      legendTitles,
      colorLegendTitles,
    } = this.getPlotConfiguration();

    const { tooltip } = this.state;
    const { visible, id } = tooltip;
    const svgString = new XMLSerializer().serializeToString(legend);

    let variantLegendPositions = d3
      .groups(dataPoints, (d) => d.mutationType)
      .map((d) => {
        return {
          key: legendTitles[d[0]],
          pos: xScale(d[1][0][xVariable]) + xScale.bandwidth() / 2,
          distance:
            xScale(d[1][d[1].length - 1][xVariable]) -
            xScale(d[1][0][xVariable]),
        };
      });
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
                {rectangleBars.map((d, i) => (
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
                    dataKey={d.mutationType}
                    dataColorKey={d[colorVariable]}
                    dataFillKey={color(d[colorVariable])}
                    onMouseEnter={(e) => this.handleMouseEnter(d)}
                    onMouseOut={(e) => this.handleMouseOut(d)}
                  />
                ))}
              </g>
              <g className="x-distribution-reference-container">
                {rectangleBarsReference.map((d, i) => (
                  <rect
                    id={`bar-reference-${d.id}`}
                    x={xScale(d[xVariable]) + xScale.bandwidth() / 4}
                    y={yScale(d[yVariable])}
                    width={xScale.bandwidth() / 2}
                    height={yScale(0) - yScale(d[yVariable])}
                    fill={visible && id === d.id ? "#ff7f0e" : "#EDEDED"}
                    stroke={d3.rgb(color(d[colorVariable])).darker()}
                    strokeWidth={1}
                    dataKey={d.mutationType}
                    dataColorKey={d[colorVariable]}
                    dataFillKey={color(d[colorVariable])}
                    onMouseEnter={(e) => this.handleMouseEnter(d)}
                    onMouseOut={(e) => this.handleMouseOut(d)}
                  />
                ))}
              </g>
              <g>
                {variantLegendPositions.map((d) => (
                  <g
                    transform={`translate(${[
                      d.pos,
                      panelHeight + 1.66 * margins.gapY,
                    ]})`}
                  >
                    {d.distance > 0 && (
                      <polyline
                        points={`${[0, 0]} ${[0, 5]} ${[d.distance, 5]} ${[
                          d.distance,
                          0,
                        ]}`}
                        fill="none"
                        stroke="black"
                      />
                    )}
                    <text
                      textAnchor="middle"
                      x={d.distance / 2}
                      className="variant-legend"
                      fill={colorLegendTitles(d.key)}
                      stroke={d3.rgb(colorLegendTitles(d.key)).darker()}
                      strokeWidth={0.3}
                      transform={`rotate(${d.distance > 0 ? 0 : -45})`}
                    >
                      {d.key}
                    </text>
                  </g>
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
BarPlot.propTypes = {
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  dataPoints: PropTypes.array,
};
BarPlot.defaultProps = {
  dataPoints: [],
  referenceDataPoints: [],
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
