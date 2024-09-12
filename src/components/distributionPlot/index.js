import React, { Component } from "react";
import { PropTypes } from "prop-types";
import * as d3 from "d3";
import { connect } from "react-redux";
import { withTranslation } from "react-i18next";
import {
  Legend,
  measureText,
  calculateOptimalBins,
} from "../../helpers/utility";
import Wrapper from "./index.style";

const margins = {
  gap: 0,
  gapX: 34,
  gapY: 24,
  yTicksCount: 10,
  tooltipGap: 5,
  gapLegend: 50,
  gapDistribution: 30,
  xDistributionHeight: 100,
  yDistributionWidth: 130,
};

class DistributionPlot extends Component {
  plotContainer = null;

  state = {
    tooltip: {
      id: -1,
      visible: false,
      shapeId: -1,
      x: -1000,
      y: -1000,
      xSelectionRange: [-1, -1],
      ySelectionRange: [-1, -1],
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
      xVariable,
      yVariable,
      xFormat,
      yFormat,
      xTitle,
      yTitle,
      t,
      colorVariable,
      colorDomain,
      colorSchemeSeq,
      yDomainRange,
    } = this.props;

    let stageWidth = width - 2 * margins.gapX;
    let stageHeight = height - 3 * margins.gapY;

    let panelWidth =
      stageWidth - margins.yDistributionWidth - margins.gapDistribution;
    let panelHeight =
      stageHeight -
      margins.gapLegend -
      margins.xDistributionHeight -
      margins.gapDistribution;

    let xScale = d3.scaleLinear().domain(xRange).range([0, panelWidth]).nice();
    let yScale = d3
      .scaleLinear()
      .domain([0, d3.max(dataPoints, (d) => d[yVariable])])
      .range([panelHeight, 0])
      .nice();

    let legend, color;

    color = d3.scaleSequential(colorSchemeSeq).domain(colorDomain).nice();

    legend = Legend(color, {
      title: t(`metadata.${colorVariable}`),
      tickFormat: "0.0f",
    });

    let xDistribution = this.calculateBins(
      dataPoints,
      xVariable,
      [margins.xDistributionHeight, 0],
      calculateOptimalBins(dataPoints.map((d) => d[xVariable]))
    );

    let yDistribution = this.calculateBins(
      dataPoints,
      yVariable,
      [0, margins.yDistributionWidth],
      calculateOptimalBins(dataPoints.map((d) => d[yVariable]))
    );

    xScale.domain([
      d3.min([xScale.domain()[0], xDistribution.bins[0].x0]),
      d3.max([
        xScale.domain()[1],
        xDistribution.bins[xDistribution.bins.length - 1].x1,
      ]),
    ]);

    yScale.domain([
      d3.min([yScale.domain()[0], yDistribution.bins[0].x0]),
      d3.max([
        yScale.domain()[1],
        yDistribution.bins[yDistribution.bins.length - 1].x1,
      ]),
    ]);

    yScale.domain(yDomainRange);
    yScale.clamp(true);

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
      xDistribution,
      yDistribution,
    };
  }

  calculateBins(data, variable, yRange, thresholds = 40) {
    // Bin the data.
    const bins = d3
      .bin()
      .thresholds(thresholds)
      .value((d) => d[variable])(data);

    // Declare the y (vertical position) scale.
    const y = d3
      .scaleLinear()
      .domain([0, d3.max(bins, (d) => d.length)])
      .range(yRange);

    return { bins, y };
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

  handleXDistributionMouseEnter = (d, i) => {
    const { t } = this.props;
    const { xScale, xDistribution } = this.getPlotConfiguration();
    this.setState({
      tooltip: {
        id: i,
        visible: true,
        xSelectionRange: [d.x0, d.x1],
        x: xScale((d.x0 + d.x1) / 2) + margins.tooltipGap,
        y: xDistribution.y(0) - margins.tooltipGap,
        text: ["x0", "x1", "length"].map((e) => {
          return { label: t(`metadata.distribution.${e}`), value: d[e] };
        }),
      },
    });
  };

  handleYDistributionMouseEnter = (d, i) => {
    const { t } = this.props;
    const { yScale, yDistribution, panelWidth } = this.getPlotConfiguration();
    this.setState({
      tooltip: {
        id: i,
        visible: true,
        ySelectionRange: [d.x0, d.x1],
        x:
          yDistribution.y(0) +
          margins.tooltipGap +
          panelWidth +
          margins.gapDistribution,
        y:
          yScale((d.x0 + d.x1) / 2) -
          margins.tooltipGap +
          margins.gapDistribution +
          margins.xDistributionHeight,
        text: ["x0", "x1", "length"].map((e) => {
          return { label: t(`metadata.distribution.${e}`), value: d[e] };
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
        xSelectionRange: [-1, -1],
        ySelectionRange: [-1, -1],
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
      xDistribution,
      yDistribution,
    } = this.getPlotConfiguration();

    const { tooltip } = this.state;
    const { visible, id, xSelectionRange, ySelectionRange } = tooltip;
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
                transform={`translate(${[
                  0,
                  margins.xDistributionHeight + margins.gapDistribution,
                ]})`}
              >
                <g clipPath="url(#cuttOffViewPane)">
                  <rect
                    width={panelWidth}
                    height={panelHeight}
                    fill="whitesmoke"
                  />
                  {dataPoints
                    .sort((a, b) =>
                      d3.ascending(a[colorVariable], b[colorVariable])
                    )
                    .map((d, i) => (
                      <circle
                        key={`circle${i}`}
                        className={
                          (xSelectionRange &&
                            d[xVariable] < xSelectionRange[1] &&
                            d[xVariable] >= xSelectionRange[0]) ||
                          (ySelectionRange &&
                            d[yVariable] < ySelectionRange[1] &&
                            d[yVariable] >= ySelectionRange[0])
                            ? "highlighted"
                            : ""
                        }
                        id={`circle${i}`}
                        cx={xScale(d[xVariable])}
                        cy={yScale(d[yVariable])}
                        r={visible && id === `circle${i}` ? 5 : 1.618}
                        opacity={visible && id === `circle${i}` ? 1 : 1}
                        fill={color(d[colorVariable])}
                        stroke={
                          visible && id === `circle${i}`
                            ? "#ff7f0e"
                            : "transparent"
                        }
                        strokeWidth={visible && id === `circle${i}` ? 3 : 0}
                        onMouseEnter={(e) =>
                          this.handleMouseEnter(d, `circle${i}`)
                        }
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
              <g className="x-distribution-container">
                {xDistribution.bins.map((d, i) => (
                  <rect
                    key={`xdistribution${i}`}
                    id={`xdistribution${i}`}
                    x={xScale(d.x0) + 1}
                    y={xDistribution.y(d.length)}
                    width={xScale(d.x1) - xScale(d.x0) - 1}
                    height={xDistribution.y(0) - xDistribution.y(d.length)}
                    fill={
                      visible && id === `xdistribution${i}`
                        ? "#ff7f0e"
                        : "steelblue"
                    }
                    onMouseEnter={(e) =>
                      this.handleXDistributionMouseEnter(d, `xdistribution${i}`)
                    }
                    onMouseOut={(e) => this.handleMouseOut(d)}
                  />
                ))}
                <line
                  x1={0}
                  y1={margins.xDistributionHeight + 1}
                  x2={panelWidth}
                  y2={margins.xDistributionHeight + 1}
                  stroke="whitesmoke"
                  strokeWidth={1}
                />
              </g>
              <g
                className="x-distribution-container"
                transform={`translate(${[
                  panelWidth + margins.gapDistribution,
                  margins.gapDistribution + margins.xDistributionHeight,
                ]})`}
              >
                {yDistribution.bins.map((d, i) => (
                  <rect
                    key={`ydistribution${i}`}
                    id={`ydistribution${i}`}
                    y={yScale(d.x1) + 1}
                    x={yDistribution.y(0)}
                    height={yScale(d.x0) - yScale(d.x1) - 1}
                    width={yDistribution.y(d.length)}
                    fill={
                      visible && id === `ydistribution${i}`
                        ? "#ff7f0e"
                        : "steelblue"
                    }
                    onMouseEnter={(e) =>
                      this.handleYDistributionMouseEnter(d, `ydistribution${i}`)
                    }
                    onMouseOut={(e) => this.handleMouseOut(d)}
                  />
                ))}
                <line
                  x1={-1}
                  y1={0}
                  x2={-1}
                  y2={panelHeight}
                  stroke="whitesmoke"
                  strokeWidth={1}
                />
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
DistributionPlot.propTypes = {
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  data: PropTypes.array,
};
DistributionPlot.defaultProps = {
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
)(withTranslation("common")(DistributionPlot));
