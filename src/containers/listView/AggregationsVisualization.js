import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { Select } from "antd";
import * as d3 from "d3";
import ContainerDimensions from "react-container-dimensions";
import { Legend, measureText } from "../../helpers/utility";

const margins = {
  gapX: 34,
  gapY: 24,
  gapLegend: 0,
  tooltipGap: 5,
};

const MIN_BAR_WIDTH = 30;
const MIN_CATEGORY_WIDTH = 40;

const numericColumns = [
  { key: "sv_count", dataIndex: "sv_count", label: "SV Count", type: "numeric" },
  { key: "tmb", dataIndex: "tmb", label: "TMB", type: "numeric" },
  { key: "tumor_median_coverage", dataIndex: "tumor_median_coverage", label: "Tumor Coverage", type: "numeric" },
  { key: "normal_median_coverage", dataIndex: "normal_median_coverage", label: "Normal Coverage", type: "numeric" },
  { key: "purity", dataIndex: "purity", label: "Purity", type: "numeric" },
  { key: "ploidy", dataIndex: "ploidy", label: "Ploidy", type: "numeric" },
  { key: "hrd.hrd_score", dataIndex: "hrd.hrd_score", label: "HRDetect", type: "numeric" },
  { key: "hrd.b1_2_score", dataIndex: "hrd.b1_2_score", label: "B1+2", type: "numeric" },
  { key: "hrd.b1_score", dataIndex: "hrd.b1_score", label: "B1", type: "numeric" },
  { key: "hrd.b2_score", dataIndex: "hrd.b2_score", label: "B2", type: "numeric" },
];

const categoricalColumns = [
  { key: "disease", dataIndex: "disease", label: "Disease", type: "categorical" },
  { key: "primary_site", dataIndex: "primary_site", label: "Primary Site", type: "categorical" },
  { key: "tumor_type", dataIndex: "tumor_type", label: "Tumor Type", type: "categorical" },
  { key: "inferred_sex", dataIndex: "inferred_sex", label: "Inferred Sex", type: "categorical" },
  { key: "qcEvaluation", dataIndex: "qcEvaluation", label: "QC Evaluation", type: "categorical" },
];

const allColumns = [...numericColumns, ...categoricalColumns];

const getColumnType = (dataIndex) => {
  const col = allColumns.find((c) => c.dataIndex === dataIndex);
  return col?.type || "numeric";
};

const getColumnLabel = (dataIndex) => {
  const col = allColumns.find((c) => c.dataIndex === dataIndex);
  return col?.label || dataIndex;
};

const getValue = (record, path) => {
  return path.split(".").reduce((obj, key) => obj?.[key], record);
};

class AggregationsVisualization extends Component {
  plotContainer = null;

  state = {
    xVariable: numericColumns[0].dataIndex,
    yVariable: numericColumns[1].dataIndex,
    colorVariable: categoricalColumns[0].dataIndex,
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

  getPlotType() {
    const { xVariable, yVariable } = this.state;
    const xType = getColumnType(xVariable);
    const yType = getColumnType(yVariable);
    
    if (xType === "categorical" && yType === "categorical") {
      return "stacked-bar";
    } else if (xType === "categorical" || yType === "categorical") {
      return "categorical-scatter";
    }
    return "scatter";
  }

  renderAxes() {
    if (!this.plotContainer) return;
    const plotType = this.getPlotType();
    const config = this.getPlotConfiguration();
    const { xScale, yScale } = config;

    const xAxisContainer = d3.select(this.plotContainer).select(".x-axis-container");
    const yAxisContainer = d3.select(this.plotContainer).select(".y-axis-container");

    if (plotType === "stacked-bar") {
      xAxisContainer.call(d3.axisBottom(xScale))
        .selectAll("text")
        .attr("transform", "rotate(-45)")
        .style("text-anchor", "end");
      yAxisContainer.call(d3.axisLeft(yScale));
    } else if (plotType === "categorical-scatter") {
      const xType = getColumnType(this.state.xVariable);
      if (xType === "categorical") {
        xAxisContainer.call(d3.axisBottom(xScale))
          .selectAll("text")
          .attr("transform", "rotate(-45)")
          .style("text-anchor", "end");
        yAxisContainer.call(d3.axisLeft(yScale).tickFormat(d3.format(",.2f")));
      } else {
        xAxisContainer.call(d3.axisBottom(xScale).tickFormat(d3.format(",.2f")));
        yAxisContainer.call(d3.axisLeft(yScale));
      }
    } else {
      xAxisContainer.call(d3.axisBottom(xScale).tickFormat(d3.format(",.2f")));
      yAxisContainer.call(d3.axisLeft(yScale).tickFormat(d3.format(",.2f")));
    }
  }

  getPlotConfiguration() {
    const { filteredRecords = [] } = this.props;
    const { xVariable, yVariable, colorVariable } = this.state;
    const containerWidth = this.currentWidth || 600;
    const height = 400;
    const plotType = this.getPlotType();

    const stageWidth = containerWidth - 2 * margins.gapX;
    const stageHeight = height - 3 * margins.gapY;
    const panelHeight = stageHeight - margins.gapLegend;

    let xScale, yScale, color, legend, categoryData, stackedData;
    let panelWidth = stageWidth;
    let scrollable = false;

    if (plotType === "stacked-bar") {
      const xCategories = [...new Set(filteredRecords.map((d) => getValue(d, xVariable)).filter(Boolean))].sort();
      const colorCategories = [...new Set(filteredRecords.map((d) => getValue(d, colorVariable)).filter(Boolean))].sort();
      
      const minRequiredWidth = xCategories.length * MIN_BAR_WIDTH;
      if (minRequiredWidth > stageWidth) {
        panelWidth = minRequiredWidth;
        scrollable = true;
      }

      categoryData = xCategories.map((xCat) => {
        const row = { category: xCat };
        colorCategories.forEach((colorCat) => {
          row[colorCat] = filteredRecords.filter(
            (d) => getValue(d, xVariable) === xCat && getValue(d, colorVariable) === colorCat
          ).length;
        });
        return row;
      });

      const stack = d3.stack().keys(colorCategories);
      stackedData = stack(categoryData);

      xScale = d3.scaleBand()
        .domain(xCategories)
        .range([0, panelWidth])
        .padding(0.2);

      const maxY = d3.max(stackedData, (layer) => d3.max(layer, (d) => d[1])) || 1;
      yScale = d3.scaleLinear()
        .domain([0, maxY])
        .range([panelHeight, 0])
        .nice();

      color = d3.scaleOrdinal(d3.schemeTableau10).domain(colorCategories);
      legend = null;

      return {
        containerWidth, width: panelWidth + 2 * margins.gapX, height, panelWidth, panelHeight, 
        xScale, yScale, color, legend, scrollable,
        xVariable, yVariable, colorVariable, plotType, stackedData, colorCategories: colorCategories,
      };
    } else if (plotType === "categorical-scatter") {
      const xType = getColumnType(xVariable);
      const catVar = xType === "categorical" ? xVariable : yVariable;
      const numVar = xType === "categorical" ? yVariable : xVariable;

      const categories = [...new Set(filteredRecords.map((d) => getValue(d, catVar)).filter(Boolean))].sort();
      
      const minRequiredWidth = categories.length * MIN_CATEGORY_WIDTH;
      if (xType === "categorical" && minRequiredWidth > stageWidth) {
        panelWidth = minRequiredWidth;
        scrollable = true;
      }

      categoryData = categories.map((cat) => {
        const values = filteredRecords
          .filter((d) => getValue(d, catVar) === cat)
          .map((d) => getValue(d, numVar))
          .filter((v) => v != null && !isNaN(v));
        
        const mean = d3.mean(values) || 0;
        const stdDev = d3.deviation(values) || 0;
        const stdErr = values.length > 1 ? stdDev / Math.sqrt(values.length) : 0;
        
        return {
          category: cat,
          mean,
          stdErr,
          values,
          count: values.length,
        };
      });

      const colorCategories = [...new Set(filteredRecords.map((d) => getValue(d, colorVariable)).filter(Boolean))].sort();
      color = d3.scaleOrdinal(d3.schemeTableau10).domain(colorCategories);

      if (xType === "categorical") {
        xScale = d3.scaleBand()
          .domain(categories)
          .range([0, panelWidth])
          .padding(0.3);

        const allMeans = categoryData.map((d) => d.mean + d.stdErr);
        const maxY = d3.max(allMeans) || 1;
        yScale = d3.scaleLinear()
          .domain([0, maxY * 1.1])
          .range([panelHeight, 0])
          .nice();
      } else {
        yScale = d3.scaleBand()
          .domain(categories)
          .range([panelHeight, 0])
          .padding(0.3);

        const allMeans = categoryData.map((d) => d.mean + d.stdErr);
        const maxX = d3.max(allMeans) || 1;
        xScale = d3.scaleLinear()
          .domain([0, maxX * 1.1])
          .range([0, panelWidth])
          .nice();
      }

      legend = null;

      return {
        containerWidth, width: panelWidth + 2 * margins.gapX, height, panelWidth, panelHeight, 
        xScale, yScale, color, legend, scrollable,
        xVariable, yVariable, colorVariable, plotType, categoryData,
        catVar, numVar, colorCategories,
      };
    } else {
      const xValues = filteredRecords.map((d) => getValue(d, xVariable)).filter((v) => v != null && !isNaN(v));
      const yValues = filteredRecords.map((d) => getValue(d, yVariable)).filter((v) => v != null && !isNaN(v));

      xScale = d3.scaleLinear()
        .domain([0, d3.quantile(xValues, 0.99) || 1])
        .range([0, panelWidth])
        .clamp(true)
        .nice();

      yScale = d3.scaleLinear()
        .domain([0, d3.quantile(yValues, 0.99) || 1])
        .range([panelHeight, 0])
        .clamp(true)
        .nice();

      const colorType = getColumnType(colorVariable);
      if (colorType === "categorical") {
        const colorCategories = [...new Set(filteredRecords.map((d) => getValue(d, colorVariable)).filter(Boolean))].sort();
        color = d3.scaleOrdinal(d3.schemeTableau10).domain(colorCategories);
        legend = null;
        return {
          containerWidth, width: panelWidth + 2 * margins.gapX, height, panelWidth, panelHeight, 
          xScale, yScale, color, legend, scrollable,
          xFormat: ",.2f", yFormat: ",.2f", xVariable, yVariable, colorVariable, plotType,
          colorCategories,
        };
      } else {
        const colorValues = filteredRecords.map((d) => getValue(d, colorVariable)).filter((v) => v != null && !isNaN(v));
        color = d3.scaleSequential(d3.interpolateBlues)
          .domain([0, d3.quantile(colorValues, 0.99) || 1])
          .clamp(true);

        const colorLabel = getColumnLabel(colorVariable);
        legend = Legend(color, { title: colorLabel, tickFormat: ",.2f" });

        return {
          containerWidth, width: panelWidth + 2 * margins.gapX, height, panelWidth, panelHeight, 
          xScale, yScale, color, legend, scrollable,
          xFormat: ",.2f", yFormat: ",.2f", xVariable, yVariable, colorVariable, plotType,
        };
      }
    }
  }

  handleMouseEnter = (e, d, i) => {
    const config = this.getPlotConfiguration();
    const { panelHeight, panelWidth, xScale, yScale, xVariable, yVariable, plotType } = config;

    let tooltipContent = [];
    let tooltipX = 0;
    let tooltipY = 0;

    if (plotType === "scatter") {
      const xVal = getValue(d, xVariable);
      const yVal = getValue(d, yVariable);
      tooltipContent = [
        { label: "Case", value: d.pair },
        { label: getColumnLabel(xVariable), value: d3.format(",.2f")(xVal) },
        { label: getColumnLabel(yVariable), value: d3.format(",.2f")(yVal) },
      ];
      tooltipX = xScale(xVal);
      tooltipY = yScale(yVal);
    } else if (plotType === "categorical-scatter") {
      tooltipContent = [
        { label: "Category", value: d.category },
        { label: "Mean", value: d3.format(",.2f")(d.mean) },
        { label: "Std Error", value: d3.format(",.3f")(d.stdErr) },
        { label: "Count", value: d.count },
      ];
      const xType = getColumnType(xVariable);
      if (xType === "categorical") {
        tooltipX = xScale(d.category) + xScale.bandwidth() / 2;
        tooltipY = yScale(d.mean);
      } else {
        tooltipX = xScale(d.mean);
        tooltipY = yScale(d.category) + yScale.bandwidth() / 2;
      }
    }

    const diffY = Math.min(5, panelHeight - tooltipY - tooltipContent.length * 16 - 10);
    const diffX = Math.min(5, panelWidth - tooltipX - d3.max(tooltipContent, (t) => measureText(`${t.label}: ${t.value}`, 12)) - 35);

    this.setState({
      tooltip: {
        visible: true,
        x: tooltipX + diffX,
        y: tooltipY + diffY,
        text: tooltipContent,
      },
    });
  };

  handleBarMouseEnter = (e, layer, d) => {
    const config = this.getPlotConfiguration();
    const { panelWidth, xScale, yScale } = config;
    const category = d.data.category;
    const colorCategory = layer.key;
    const count = d.data[colorCategory];

    const tooltipContent = [
      { label: "X Category", value: category },
      { label: "Color Category", value: colorCategory },
      { label: "Count", value: count },
    ];

    const barX = xScale(category) + xScale.bandwidth() / 2;
    const barY = yScale(d[1]);

    const diffX = Math.min(5, panelWidth - barX - d3.max(tooltipContent, (t) => measureText(`${t.label}: ${t.value}`, 12)) - 35);

    this.setState({
      tooltip: {
        visible: true,
        x: barX + diffX,
        y: barY + 5,
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

  getColumnsForVariable(variable) {
    if (variable === "yVariable") {
      return numericColumns;
    }
    if (variable === "colorVariable") {
      return categoricalColumns;
    }
    return allColumns;
  }

  renderDropdown(variable, style = {}, columns = null) {
    const value = this.state[variable];
    const availableColumns = columns || this.getColumnsForVariable(variable);

    return (
      <Select
        size="small"
        value={value}
        onChange={(val) => this.handleVariableChange(variable, val)}
        style={{ width: 140, ...style }}
        dropdownMatchSelectWidth={false}
      >
        {availableColumns.map((col) => (
          <Select.Option key={col.dataIndex} value={col.dataIndex}>
            {col.label}
          </Select.Option>
        ))}
      </Select>
    );
  }

  renderColorLegend(config) {
    const { colorCategories, color } = config;
    if (!colorCategories) return null;

    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, maxWidth: 200 }}>
        {colorCategories.map((cat) => (
          <div key={cat} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 12, height: 12, backgroundColor: color(cat), borderRadius: 2 }} />
            <span style={{ fontSize: 11 }}>{cat}</span>
          </div>
        ))}
      </div>
    );
  }

  renderScatterPlot(config) {
    const { filteredRecords = [] } = this.props;
    const { xScale, yScale, color, xVariable, yVariable, colorVariable, colorCategories } = config;

    return filteredRecords.map((d, i) => {
      const xVal = getValue(d, xVariable);
      const yVal = getValue(d, yVariable);
      const colorVal = getValue(d, colorVariable);

      if (xVal == null || yVal == null || isNaN(xVal) || isNaN(yVal)) {
        return null;
      }

      const fillColor = colorCategories ? color(colorVal) : color(colorVal || 0);

      return (
        <circle
          key={d.pair || i}
          cx={xScale(xVal)}
          cy={yScale(yVal)}
          r={5}
          fill={fillColor}
          stroke="white"
          strokeWidth={0.5}
          opacity={0.8}
          onMouseEnter={(e) => this.handleMouseEnter(e, d, i)}
          onMouseOut={this.handleMouseOut}
          style={{ cursor: "pointer" }}
        />
      );
    });
  }

  renderCategoricalScatter(config) {
    const { xScale, yScale, categoryData } = config;
    const xType = getColumnType(this.state.xVariable);

    return categoryData.map((d, i) => {
      if (xType === "categorical") {
        const cx = xScale(d.category) + xScale.bandwidth() / 2;
        const cy = yScale(d.mean);
        const errorTop = yScale(d.mean + d.stdErr);
        const errorBottom = yScale(d.mean - d.stdErr);

        return (
          <g key={d.category}>
            <line
              x1={cx}
              x2={cx}
              y1={errorTop}
              y2={errorBottom}
              stroke="#666"
              strokeWidth={1.5}
            />
            <line x1={cx - 4} x2={cx + 4} y1={errorTop} y2={errorTop} stroke="#666" strokeWidth={1.5} />
            <line x1={cx - 4} x2={cx + 4} y1={errorBottom} y2={errorBottom} stroke="#666" strokeWidth={1.5} />
            <circle
              cx={cx}
              cy={cy}
              r={6}
              fill="#1890ff"
              stroke="white"
              strokeWidth={1}
              onMouseEnter={(e) => this.handleMouseEnter(e, d, i)}
              onMouseOut={this.handleMouseOut}
              style={{ cursor: "pointer" }}
            />
          </g>
        );
      } else {
        const cx = xScale(d.mean);
        const cy = yScale(d.category) + yScale.bandwidth() / 2;
        const errorLeft = xScale(d.mean - d.stdErr);
        const errorRight = xScale(d.mean + d.stdErr);

        return (
          <g key={d.category}>
            <line
              x1={errorLeft}
              x2={errorRight}
              y1={cy}
              y2={cy}
              stroke="#666"
              strokeWidth={1.5}
            />
            <line x1={errorLeft} x2={errorLeft} y1={cy - 4} y2={cy + 4} stroke="#666" strokeWidth={1.5} />
            <line x1={errorRight} x2={errorRight} y1={cy - 4} y2={cy + 4} stroke="#666" strokeWidth={1.5} />
            <circle
              cx={cx}
              cy={cy}
              r={6}
              fill="#1890ff"
              stroke="white"
              strokeWidth={1}
              onMouseEnter={(e) => this.handleMouseEnter(e, d, i)}
              onMouseOut={this.handleMouseOut}
              style={{ cursor: "pointer" }}
            />
          </g>
        );
      }
    });
  }

  renderStackedBar(config) {
    const { xScale, yScale, color, stackedData } = config;

    return stackedData.map((layer) => (
      <g key={layer.key}>
        {layer.map((d, i) => (
          <rect
            key={`${layer.key}-${i}`}
            x={xScale(d.data.category)}
            y={yScale(d[1])}
            width={xScale.bandwidth()}
            height={yScale(d[0]) - yScale(d[1])}
            fill={color(layer.key)}
            stroke="white"
            strokeWidth={0.5}
            onMouseEnter={(e) => this.handleBarMouseEnter(e, layer, d)}
            onMouseOut={this.handleMouseOut}
            style={{ cursor: "pointer" }}
          />
        ))}
      </g>
    ));
  }

  render() {
    const { tooltip } = this.state;
    const plotType = this.getPlotType();

    return (
      <div className="aggregation-visualization-container">
        <ContainerDimensions>
          {({ width: containerWidth }) => {
            this.currentWidth = containerWidth;
            const config = this.getPlotConfiguration();
            const { width, height, panelWidth, panelHeight, legend, colorCategories, scrollable } = config;
            const svgString = legend ? new XMLSerializer().serializeToString(legend) : null;

            return (
              <div style={{ position: "relative" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                  <div>
                    {this.renderDropdown("yVariable")}
                  </div>
                  <div style={{ display: "flex", flexDirection: "row", alignItems: "center", marginRight: 64 }}>
                    {this.renderDropdown("colorVariable")}
                    {svgString && (
                      <div
                        style={{ marginLeft: 12 }}
                        dangerouslySetInnerHTML={{ __html: svgString }}
                      />
                    )}
                    {colorCategories && (
                      <div style={{ marginLeft: 12 }}>
                        {this.renderColorLegend(config)}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ 
                  overflowX: scrollable ? "auto" : "hidden",
                  overflowY: "hidden",
                  maxWidth: containerWidth,
                }}>
                  <svg
                    width={width}
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

                      {plotType === "scatter" && this.renderScatterPlot(config)}
                      {plotType === "categorical-scatter" && this.renderCategoricalScatter(config)}
                      {plotType === "stacked-bar" && this.renderStackedBar(config)}

                      <g className="y-axis-container" />
                      <g className="x-axis-container" transform={`translate(0, ${panelHeight})`} />

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
                </div>

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
