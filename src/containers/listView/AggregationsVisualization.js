import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { Select } from "antd";
import * as d3 from "d3";
import ContainerDimensions from "react-container-dimensions";
import { Legend, measureText } from "../../helpers/utility";

const margins = {
  gapX: 34,
  gapY: 24,
  gapLegend: 50,
  tooltipGap: 5,
};

const numericColumns = [
  { key: "sv_count", dataIndex: "sv_count", label: "SV Count" },
  { key: "tmb", dataIndex: "tmb", label: "TMB" },
  { key: "tumor_median_coverage", dataIndex: "tumor_median_coverage", label: "Tumor Coverage" },
  { key: "normal_median_coverage", dataIndex: "normal_median_coverage", label: "Normal Coverage" },
  { key: "purity", dataIndex: "purity", label: "Purity" },
  { key: "ploidy", dataIndex: "ploidy", label: "Ploidy" },
  { key: "hrd.hrd_score", dataIndex: "hrd.hrd_score", label: "HRDetect" },
  { key: "hrd.b1_2_score", dataIndex: "hrd.b1_2_score", label: "B1+2" },
  { key: "hrd.b1_score", dataIndex: "hrd.b1_score", label: "B1" },
  { key: "hrd.b2_score", dataIndex: "hrd.b2_score", label: "B2" },
];

const getValue = (record, path) => {
  return path.split(".").reduce((obj, key) => obj?.[key], record);
};

class AggregationsVisualization extends Component {
  plotContainer = null;

  state = {
    xVariable: numericColumns[0].dataIndex,
    yVariable: numericColumns[1].dataIndex,
    colorVariable: numericColumns[2].dataIndex,
    tooltip: {
      visible: false,
      x: -1000,
      y: -1000,
      text: [],
    },
  };

  componentDidMount() {
    this.renderAxes();
  }

  componentDidUpdate() {
    this.renderAxes();
  }

  renderAxes() {
    if (!this.plotContainer) return;
    const { xScale, yScale, xFormat, yFormat } = this.getPlotConfiguration();

    const xAxisContainer = d3.select(this.plotContainer).select(".x-axis-container");
    const yAxisContainer = d3.select(this.plotContainer).select(".y-axis-container");

    xAxisContainer.call(d3.axisBottom(xScale).tickFormat(d3.format(xFormat)));
    yAxisContainer.call(d3.axisLeft(yScale).tickFormat(d3.format(yFormat)));
  }

  getPlotConfiguration() {
    const { filteredRecords = [] } = this.props;
    const { xVariable, yVariable, colorVariable } = this.state;
    const width = this.currentWidth || 600;
    const height = 400;

    const stageWidth = width - 2 * margins.gapX;
    const stageHeight = height - 3 * margins.gapY;
    const panelWidth = stageWidth - 120;
    const panelHeight = stageHeight - margins.gapLegend;

    const xValues = filteredRecords.map((d) => getValue(d, xVariable)).filter((v) => v != null && !isNaN(v));
    const yValues = filteredRecords.map((d) => getValue(d, yVariable)).filter((v) => v != null && !isNaN(v));
    const colorValues = filteredRecords.map((d) => getValue(d, colorVariable)).filter((v) => v != null && !isNaN(v));

    const xScale = d3
      .scaleLinear()
      .domain([0, d3.quantile(xValues, 0.99) || 1])
      .range([0, panelWidth])
      .clamp(true)
      .nice();

    const yScale = d3
      .scaleLinear()
      .domain([0, d3.quantile(yValues, 0.99) || 1])
      .range([panelHeight, 0])
      .clamp(true)
      .nice();

    const color = d3
      .scaleSequential(d3.interpolateBlues)
      .domain([0, d3.quantile(colorValues, 0.99) || 1])
      .clamp(true);

    const colorLabel = numericColumns.find((c) => c.dataIndex === colorVariable)?.label || colorVariable;
    const legend = Legend(color, {
      title: colorLabel,
      tickFormat: ",.2f",
    });

    return {
      width,
      height,
      panelWidth,
      panelHeight,
      xScale,
      yScale,
      color,
      legend,
      xFormat: ",.2f",
      yFormat: ",.2f",
      xVariable,
      yVariable,
      colorVariable,
    };
  }

  handleMouseEnter = (e, d, i) => {
    const { panelHeight, panelWidth, xScale, yScale, xVariable, yVariable } = this.getPlotConfiguration();
    const xVal = getValue(d, xVariable);
    const yVal = getValue(d, yVariable);

    const tooltipContent = [
      { label: "Case", value: d.pair },
      { label: numericColumns.find((c) => c.dataIndex === xVariable)?.label || xVariable, value: d3.format(",.2f")(xVal) },
      { label: numericColumns.find((c) => c.dataIndex === yVariable)?.label || yVariable, value: d3.format(",.2f")(yVal) },
    ];

    const diffY = Math.min(5, panelHeight - yScale(yVal) - tooltipContent.length * 16 - 10);
    const diffX = Math.min(5, panelWidth - xScale(xVal) - d3.max(tooltipContent, (t) => measureText(`${t.label}: ${t.value}`, 12)) - 35);

    this.setState({
      tooltip: {
        visible: true,
        x: xScale(xVal) + diffX,
        y: yScale(yVal) + diffY,
        text: tooltipContent,
      },
    });
  };

  handleMouseOut = () => {
    this.setState({
      tooltip: {
        visible: false,
        x: -1000,
        y: -1000,
        text: [],
      },
    });
  };

  handleVariableChange = (variable, value) => {
    this.setState({ [variable]: value });
  };

  renderDropdown(variable, style = {}) {
    const value = this.state[variable];

    return (
      <Select
        size="small"
        value={value}
        onChange={(val) => this.handleVariableChange(variable, val)}
        style={{ width: 140, ...style }}
        dropdownMatchSelectWidth={false}
      >
        {numericColumns.map((col) => (
          <Select.Option key={col.dataIndex} value={col.dataIndex}>
            {col.label}
          </Select.Option>
        ))}
      </Select>
    );
  }

  render() {
    const { filteredRecords = [] } = this.props;
    const { tooltip, xVariable, yVariable, colorVariable } = this.state;

    return (
      <div className="aggregation-visualization-container">
        <ContainerDimensions>
          {({ width }) => {
            this.currentWidth = width;
            const { height, panelWidth, panelHeight, xScale, yScale, color, legend } = this.getPlotConfiguration();
            const svgString = new XMLSerializer().serializeToString(legend);

            return (
              <div style={{ position: "relative" }}>
                {/* Y-axis dropdown - positioned at top left */}
                <div style={{ position: "absolute", top: 0, left: 0, zIndex: 10 }}>
                  {this.renderDropdown("yVariable")}
                </div>

                {/* Main plot area */}
                <div style={{ display: "flex", alignItems: "flex-start" }}>
                  <svg
                    width={width - 150}
                    height={height}
                    className="plot-container"
                    ref={(elem) => (this.plotContainer = elem)}
                  >
                    <g transform={`translate(${margins.gapX}, ${margins.gapY + margins.gapLegend})`}>
                      <rect
                        width={panelWidth}
                        height={panelHeight}
                        fill="transparent"
                        stroke="lightgray"
                        strokeWidth={0.33}
                      />

                      {filteredRecords.map((d, i) => {
                        const xVal = getValue(d, xVariable);
                        const yVal = getValue(d, yVariable);
                        const colorVal = getValue(d, colorVariable);

                        if (xVal == null || yVal == null || isNaN(xVal) || isNaN(yVal)) {
                          return null;
                        }

                        return (
                          <circle
                            key={d.pair || i}
                            cx={xScale(xVal)}
                            cy={yScale(yVal)}
                            r={5}
                            fill={color(colorVal || 0)}
                            stroke="white"
                            strokeWidth={0.5}
                            opacity={0.8}
                            onMouseEnter={(e) => this.handleMouseEnter(e, d, i)}
                            onMouseOut={this.handleMouseOut}
                            style={{ cursor: "pointer" }}
                          />
                        );
                      })}

                      <g className="y-axis-container" />
                      <g className="x-axis-container" transform={`translate(0, ${panelHeight})`} />

                      {/* Y-axis label */}
                      <text
                        x={-margins.gapX + 5}
                        y={-10}
                        fontSize={12}
                        textAnchor="start"
                      >
                        {numericColumns.find((c) => c.dataIndex === yVariable)?.label}
                      </text>

                      {/* X-axis label */}
                      <text
                        x={panelWidth}
                        y={panelHeight + margins.gapY + 15}
                        fontSize={12}
                        textAnchor="end"
                      >
                        {numericColumns.find((c) => c.dataIndex === xVariable)?.label}
                      </text>

                      {/* Tooltip */}
                      {tooltip.visible && (
                        <g transform={`translate(${tooltip.x}, ${tooltip.y})`} pointerEvents="none">
                          <rect
                            x={0}
                            y={0}
                            width={d3.max(tooltip.text, (d) => measureText(`${d.label}: ${d.value}`, 12) + 30)}
                            height={tooltip.text.length * 16 + 12}
                            rx={5}
                            ry={5}
                            fill="rgb(97, 97, 97)"
                            fillOpacity={0.9}
                          />
                          <text x={10} y={18} fontSize={12} fill="#FFF">
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

                  {/* Right side: Color dropdown + Legend */}
                  <div style={{ marginLeft: 8, marginTop: margins.gapY }}>
                    {this.renderDropdown("colorVariable")}
                    <div
                      style={{ marginTop: 8 }}
                      dangerouslySetInnerHTML={{ __html: svgString }}
                    />
                  </div>
                </div>

                {/* X-axis dropdown - positioned at bottom center */}
                <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
                  {this.renderDropdown("xVariable")}
                </div>
              </div>
            );
          }}
        </ContainerDimensions>
      </div>
    );
  }
}

export default withTranslation("common")(AggregationsVisualization);
