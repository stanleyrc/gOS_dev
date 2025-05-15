import React, { Component } from "react";
import { PropTypes } from "prop-types";
import * as d3 from "d3";
import { connect } from "react-redux";
import { withTranslation } from "react-i18next";
import { measureText } from "../../helpers/utility";
import Wrapper from "./index.style";

const margins = {
  gap: 0,
  gapX: 34,
  gapY: 24,
  yTicksCount: 10,
  tooltipGap: 10,
  minBarHeight: 2,
  minBarWidth: 4,
};

class SnvplicityPlot extends Component {
  plotContainer = null;

  state = {
    currentTransform: d3.zoomIdentity,
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

  getPlotConfiguration() {
    const {
      width,
      height,
      data,
      xTitle,
      yTitle,
      chromoBins,
      title,
      colorScale,
      selectedCopyNumber,
    } = this.props;

    let series = d3.groups(data, (d) => d.jabba_cn);

    let stageWidth = width - 2 * margins.gapX;
    let stageHeight = height - 3 * margins.gapY;

    let panelWidth = stageWidth;
    let panelHeight = stageHeight;

    let extent = d3.extent(data.map((d) => d.mult_cn_bin).flat());
    const xScale = d3
      .scaleLinear()
      .domain([Math.floor(extent[0]), d3.min([10, Math.ceil(extent[1])])])
      .range([0, panelWidth]);

    let yScale = d3
      .scaleLinear()
      .domain([0, d3.max(data, (d) => d.count)])
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
      title,
      colorScale,
      selectedCopyNumber,
    };
  }

  renderXAxis(xScale) {
    let xAxisContainer = d3
      .select(this.plotContainer)
      .select(".x-axis-container");

    const axisX = d3.axisBottom(xScale);

    xAxisContainer.call(axisX);
  }

  renderZoom() {
    d3.select(this.plotContainer)
      .select(`#panel-rect`)
      .attr("preserveAspectRatio", "xMinYMin meet")
      .call(this.zoom);
  }

  renderYAxis(yScale) {
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

  render() {
    let {
      title,
      width,
      panelWidth,
      panelHeight,
      xScale,
      series,
      xTitle,
      yTitle,
      yScale,
      colorScale,
      selectedCopyNumber,
    } = this.getPlotConfiguration();

    const { tooltip } = this.state;

    this.renderYAxis(yScale);
    this.renderXAxis(xScale);

    let height = panelHeight + 3 * margins.gapY;

    return (
      <Wrapper className="ant-wrapper" margins={margins}>
        <div className="title">{title}</div>
        <div className="histogram-plot">
          <svg
            width={width}
            height={height}
            className="plot-container"
            ref={(elem) => (this.plotContainer = elem)}
          >
            <defs>
              <clipPath key="cuttOffViewPane1" id="cuttOffViewPane1">
                <rect
                  x={0}
                  y={-margins.gapY}
                  width={panelWidth + margins.gapX}
                  height={panelHeight + 3 * margins.gapY}
                />
              </clipPath>
              <clipPath key="cuttOffViewPane2" id="cuttOffViewPane2">
                <rect x={0} y={0} width={panelWidth} height={panelHeight} />
              </clipPath>
            </defs>
            <g transform={`translate(${[margins.gapX, margins.gapY]})`}>
              <g key={`panel`} id={`panel`} transform={`translate(${[0, 0]})`}>
                <g clipPath="url(#cuttOffViewPane2)">
                  {series
                    .filter(
                      (d) =>
                        selectedCopyNumber === "All" ||
                        selectedCopyNumber === d[0]
                    )
                    .map((d, i) => (
                      <g key={`cn-${d[0]}`}>
                        {d[1].map((dd, ii) => (
                          <rect
                            key={dd.index}
                            fill={colorScale(dd.jabba_cn)}
                            x={xScale(dd.mult_cn_bin[0])}
                            width={
                              xScale(dd.mult_cn_bin[1]) -
                              xScale(dd.mult_cn_bin[0])
                            }
                            y={yScale(dd.count)}
                            height={panelHeight - yScale(dd.count)}
                          />
                        ))}
                      </g>
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
SnvplicityPlot.propTypes = {
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  data: PropTypes.object,
};
SnvplicityPlot.defaultProps = {
  data: {},
};
const mapDispatchToProps = () => ({});
const mapStateToProps = (state) => ({});
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(withTranslation("common")(SnvplicityPlot));
