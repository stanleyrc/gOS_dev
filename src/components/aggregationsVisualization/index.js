import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { Spin } from "antd";
import * as d3 from "d3";
import ContainerDimensions from "react-container-dimensions";
import { measureText, getColorMarker } from "../../helpers/utility";
import { computeGeneStats, hasGene } from "../../helpers/geneAggregations";
import AxisSelectors from "./AxisSelectors";
import ColorControls from "./ColorControls";
import ScatterPlot from "./ScatterPlot";
import StackedBarPlot from "./StackedBarPlot";
import CategoricalScatterPlot from "./CategoricalScatterPlot";
import DensityPlot from "./DensityPlot";
import PlotTooltip from "./PlotTooltip";
import {
  margins,
  MIN_BAR_WIDTH,
  MIN_CATEGORY_WIDTH,
  getValue,
  getColumnType,
  getColumnLabel,
  numericColumns,
  categoricalColumns,
  allColumns,
} from "./helpers";

class AggregationsVisualization extends Component {
  plotContainer = null;
  cachedConfig = null;
  cachedConfigKey = null;
  colorControlsRef = null;

  state = {
    xVariable: numericColumns[0].dataIndex,
    yVariable: numericColumns[1].dataIndex,
    colorVariable: categoricalColumns[0].dataIndex,
    colorByVariable: null,
    selectedGene: null,
    selectedGeneSet: "top20",
    tooltip: {
      visible: false,
      x: -1000,
      y: -1000,
      text: [],
    },
    computingAlterations: false,
    selectedPairs: [],
  };

  scatterIdAccessor = (d) => d.pair;

  handlePointClick = (dataPoint) => {
    const { handleCardClick } = this.props;
    if (handleCardClick && dataPoint?.pair) {
      const syntheticEvent = { stopPropagation: () => {}, metaKey: false };
      handleCardClick(syntheticEvent, dataPoint.pair);
    }
  };

  componentDidMount() {
    this.renderAxes();
    if (!this.currentWidth) {
      this.forceUpdate();
    }
  }

  componentDidUpdate() {
    this.renderAxes();
  }

  getPlotType() {
    const { xVariable, yVariable } = this.state;

    if (xVariable === "pair") {
      return "density";
    }

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

    if (plotType === "density") return;

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

  expandRecordsByCategory(records, variable) {
    const expandableCategories = ["alteration_type", "driver_gene"];
    if (!expandableCategories.includes(variable)) {
      return records;
    }

    const expandedRecords = [];
    records.forEach((record) => {
      const categories = getValue(record, variable);
      if (categories && categories.length > 0) {
        categories.forEach((cat) => {
          expandedRecords.push({
            ...record,
            _expandedCategory: cat,
            _expandedVariable: variable,
          });
        });
      }
    });
    return expandedRecords;
  }

  getEffectiveValue(record, variable) {
    const expandableCategories = ["alteration_type", "driver_gene"];
    if (expandableCategories.includes(variable) && record._expandedVariable === variable) {
      return record._expandedCategory;
    }
    return getValue(record, variable);
  }

  getGenesForSelectedSet(allGeneFrequencies) {
    const { selectedGeneSet } = this.state;
    const { pathwayMap = {} } = this.props;

    if (selectedGeneSet === "top20") {
      return Object.entries(allGeneFrequencies)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([gene]) => gene);
    }

    const geneSetGenes = pathwayMap[selectedGeneSet] || [];
    const geneSetUpper = geneSetGenes.map((g) => g.toUpperCase());

    return Object.entries(allGeneFrequencies)
      .filter(([gene]) => geneSetUpper.includes(gene.toUpperCase()))
      .sort((a, b) => b[1] - a[1])
      .map(([gene]) => gene);
  }

  getPlotConfiguration() {
    const { filteredRecords = [] } = this.props;
    const { xVariable, yVariable, colorVariable, selectedGeneSet } = this.state;
    const containerWidth = this.currentWidth || 600;
    const height = 600;
    const plotType = this.getPlotType();

    const { pathwayMap } = this.props;
    const pathwayHash = Object.keys(pathwayMap || {}).length;
    const cacheKey = `${xVariable}-${yVariable}-${colorVariable}-${selectedGeneSet}-${containerWidth}-${filteredRecords.length}-${pathwayHash}`;
    if (this.cachedConfig && this.cachedConfigKey === cacheKey) {
      return this.cachedConfig;
    }

    const stageWidth = containerWidth - 2 * margins.gapX;
    const stageHeight = height - 2 * margins.gapY - margins.gapYBottom;
    const panelHeight = stageHeight - margins.gapLegend;

    let xScale, yScale, color, legend, categoryData, stackedData;
    let panelWidth = stageWidth;
    let scrollable = false;

    if (plotType === "stacked-bar") {
      const countMap = {};
      const xCategoryCounts = {};
      const allYValues = new Set();

      const isGeneByAlteration =
        (xVariable === "driver_gene" && yVariable === "alteration_type") ||
        (xVariable === "alteration_type" && yVariable === "driver_gene");

      if (isGeneByAlteration) {
        const geneStats = computeGeneStats(filteredRecords);
        const isGeneOnX = xVariable === "driver_gene";

        Object.entries(geneStats.geneByType).forEach(([gene, typeMap]) => {
          Object.entries(typeMap).forEach(([type, count]) => {
            const xVal = isGeneOnX ? gene : type;
            const yVal = isGeneOnX ? type : gene;

            if (!countMap[xVal]) countMap[xVal] = {};
            countMap[xVal][yVal] = (countMap[xVal][yVal] || 0) + count;
            xCategoryCounts[xVal] = (xCategoryCounts[xVal] || 0) + count;
            allYValues.add(yVal);
          });
        });
      } else {
        const xRecords = this.expandRecordsByCategory(filteredRecords, xVariable);

        xRecords.forEach((d) => {
          const xVal = this.getEffectiveValue(d, xVariable);
          let yVals = this.getEffectiveValue(d, yVariable);

          if (!Array.isArray(yVals)) {
            yVals = yVals ? [yVals] : [];
          }

          yVals.forEach((yVal) => {
            if (xVal && yVal) {
              if (!countMap[xVal]) countMap[xVal] = {};
              countMap[xVal][yVal] = (countMap[xVal][yVal] || 0) + 1;
              xCategoryCounts[xVal] = (xCategoryCounts[xVal] || 0) + 1;
              allYValues.add(yVal);
            }
          });
        });
      }

      let xCategories = Object.keys(countMap).sort();
      const yCategories = [...allYValues].sort();

      if (xVariable === "driver_gene") {
        xCategories = this.getGenesForSelectedSet(xCategoryCounts);
      }

      const minRequiredWidth = xCategories.length * MIN_BAR_WIDTH;
      if (minRequiredWidth > stageWidth) {
        panelWidth = minRequiredWidth;
        scrollable = true;
      }

      categoryData = xCategories.map((xCat) => {
        const row = { category: xCat };
        yCategories.forEach((yCat) => {
          row[yCat] = countMap[xCat]?.[yCat] || 0;
        });
        return row;
      });

      const stack = d3.stack().keys(yCategories);
      stackedData = stack(categoryData);

      xScale = d3.scaleBand()
        .domain(xCategories)
        .range([0, panelWidth])
        .padding(0.2);

      const maxY = d3.max(stackedData, (layer) => d3.max(layer, (d) => d[1])) || 1;
      yScale = d3.scaleLinear()
        .domain([0, Math.ceil(maxY)])
        .range([panelHeight, 0]);

      color = d3.scaleOrdinal(d3.schemeTableau10).domain(yCategories);
      legend = null;

      const config = {
        containerWidth, width: panelWidth + 2 * margins.gapX, height, panelWidth, panelHeight,
        xScale, yScale, color, legend, scrollable,
        xVariable, yVariable, colorVariable, plotType, stackedData, yCategories: yCategories,
      };
      this.cachedConfig = config;
      this.cachedConfigKey = cacheKey;
      return config;
    } else if (plotType === "density") {
      const { yVariable } = this.state;

      const values = filteredRecords
        .map((d) => getValue(d, yVariable))
        .filter((v) => v != null && !isNaN(v));

      const sortedValues = [...values].sort(d3.ascending);
      const q1 = d3.quantile(sortedValues, 0.25) || 0;
      const q3 = d3.quantile(sortedValues, 0.75) || 1;
      const q99 = d3.quantile(sortedValues, 0.99) || 1;
      const range = [d3.min(values) || 0, q99];

      const stdDev = d3.deviation(values) || 1;
      const bandwidth = 1.06 * stdDev * Math.pow(values.length, -0.2);

      const config = {
        containerWidth,
        width: panelWidth + 2 * margins.gapX,
        height,
        panelWidth,
        panelHeight,
        plotType,
        densityData: values,
        yVariable,
        q1,
        q3,
        q99,
        range,
        bandwidth,
        format: ",.2f",
      };
      this.cachedConfig = config;
      this.cachedConfigKey = cacheKey;
      return config;
    } else if (plotType === "categorical-scatter") {
      const xType = getColumnType(xVariable);
      const catVar = xType === "categorical" ? xVariable : yVariable;
      const numVar = xType === "categorical" ? yVariable : xVariable;

      const catRecords = this.expandRecordsByCategory(filteredRecords, catVar);

      const valuesByCategory = {};
      catRecords.forEach((d) => {
        const cat = this.getEffectiveValue(d, catVar);
        const numVal = getValue(d, numVar);
        if (cat && numVal != null && !isNaN(numVal)) {
          if (!valuesByCategory[cat]) {
            valuesByCategory[cat] = [];
          }
          valuesByCategory[cat].push(numVal);
        }
      });

      let categories = Object.keys(valuesByCategory).sort();

      if (catVar === "driver_gene") {
        const geneFrequencies = {};
        categories.forEach((cat) => {
          geneFrequencies[cat] = valuesByCategory[cat].length;
        });
        categories = this.getGenesForSelectedSet(geneFrequencies);
      }

      const minRequiredWidth = categories.length * MIN_CATEGORY_WIDTH;
      if (xType === "categorical" && minRequiredWidth > stageWidth) {
        panelWidth = minRequiredWidth;
        scrollable = true;
      }

      categoryData = categories.map((cat) => {
        const values = valuesByCategory[cat] || [];

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

      if (xType === "categorical") {
        xScale = d3.scaleBand()
          .domain(categories)
          .range([0, panelWidth])
          .padding(0.3);

        const allMeans = categoryData.map((d) => d.mean + d.stdErr);
        const maxY = d3.max(allMeans) || 1;
        yScale = d3.scaleLinear()
          .domain([0, Math.ceil(maxY * 1.1)])
          .range([panelHeight, 0]);
      } else {
        yScale = d3.scaleBand()
          .domain(categories)
          .range([panelHeight, 0])
          .padding(0.3);

        const allMeans = categoryData.map((d) => d.mean + d.stdErr);
        const maxX = d3.max(allMeans) || 1;
        xScale = d3.scaleLinear()
          .domain([0, Math.ceil(maxX * 1.1)])
          .range([0, panelWidth]);
      }

      const config = {
        containerWidth, width: panelWidth + 2 * margins.gapX, height, panelWidth, panelHeight,
        xScale, yScale, plotType, categoryData,
        catVar, numVar, xVariable, yVariable,
      };
      this.cachedConfig = config;
      this.cachedConfigKey = cacheKey;
      return config;
    } else {
      const xValues = filteredRecords.map((d) => getValue(d, xVariable)).filter((v) => v != null && !isNaN(v));
      const yValues = filteredRecords.map((d) => getValue(d, yVariable)).filter((v) => v != null && !isNaN(v));

      xScale = d3.scaleLinear()
        .domain([0, Math.ceil(d3.quantile(xValues, 0.99) || 1)])
        .range([0, panelWidth])
        .clamp(true);

      yScale = d3.scaleLinear()
        .domain([0, Math.ceil(d3.quantile(yValues, 0.99) || 1)])
        .range([panelHeight, 0])
        .clamp(true);

      const config = {
        containerWidth, width: panelWidth + 2 * margins.gapX, height, panelWidth, panelHeight,
        xScale, yScale, scrollable,
        xFormat: ",.2f", yFormat: ",.2f", xVariable, yVariable, plotType,
      };
      this.cachedConfig = config;
      this.cachedConfigKey = cacheKey;
      return config;
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
    const { panelWidth, xScale, yScale, xVariable, yVariable } = config;
    const category = d.data.category;
    const stackCategory = layer.key;
    const count = d.data[stackCategory];

    const tooltipContent = [
      { label: getColumnLabel(xVariable), value: category },
      { label: getColumnLabel(yVariable), value: stackCategory },
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
    if (variable === "xVariable" && value === "pair") {
      const currentYType = getColumnType(this.state.yVariable);
      if (currentYType === "categorical" || currentYType === "pair") {
        this.setState({
          xVariable: value,
          yVariable: numericColumns[0].dataIndex,
        });
        return;
      }
    }

    const isExpandableChange =
      (variable === "xVariable" && (value === "alteration_type" || value === "driver_gene")) ||
      (variable === "yVariable" && (value === "alteration_type" || value === "driver_gene"));

    if (isExpandableChange) {
      this.setState({ [variable]: value, computingAlterations: true });
      setTimeout(() => {
        this.setState({ computingAlterations: false });
      }, 0);
    } else {
      this.setState({ [variable]: value });
    }
  };

  getColumnsForVariable(variable) {
    const { xVariable } = this.state;

    if (variable === "yVariable") {
      if (xVariable === "pair") {
        return numericColumns;
      }
      return allColumns;
    }
    if (variable === "colorVariable") {
      return categoricalColumns;
    }
    return allColumns;
  }

  getTitleText() {
    const { xVariable, yVariable, selectedGeneSet } = this.state;
    const xLabel = xVariable === "driver_gene"
      ? this.getGeneSetLabelForKey(selectedGeneSet)
      : getColumnLabel(xVariable);
    const yLabel = yVariable === "driver_gene"
      ? this.getGeneSetLabelForKey(selectedGeneSet)
      : getColumnLabel(yVariable);
    return `${xLabel} vs. ${yLabel}`;
  }

  getGeneSetOptions() {
    const { pathwayMap = {} } = this.props;
    const pathwayNames = Object.keys(pathwayMap);
    return [
      { key: "top20", label: "Top 20" },
      ...pathwayNames.map((name) => ({
        key: name,
        label: name.replace(/_/g, " "),
      })),
    ];
  }

  getGeneSetLabelForKey(key) {
    const geneSetOptions = this.getGeneSetOptions();
    const option = geneSetOptions.find((opt) => opt.key === key);
    return option ? `Driver Genes (${option.label})` : "Driver Genes";
  }

  getMarkersForSelectedPairs(config) {
    const { filteredRecords = [] } = this.props;
    const { selectedPairs, yVariable } = this.state;
    const { q1, q3, format } = config;

    return selectedPairs
      .map((pair) => {
        const record = filteredRecords.find((d) => d.pair === pair);
        if (!record) return null;
        const value = getValue(record, yVariable);
        if (value == null || isNaN(value)) return null;
        const formattedValue = d3.format(format || ",.2f")(value);
        return {
          value,
          label: `${pair}: ${formattedValue}`,
          color: getColorMarker(value, q1, q3),
        };
      })
      .filter(Boolean);
  }

  render() {
    const { tooltip, computingAlterations } = this.state;
    const { filteredRecords = [] } = this.props;
    const plotType = this.getPlotType();

    return (
      <div className="aggregation-visualization-container">
        <ContainerDimensions>
          {({ width: containerWidth }) => {
            this.currentWidth = containerWidth;
            const config = this.getPlotConfiguration();
            const { width, height, panelWidth, panelHeight } = config;

            return (
              <div style={{ position: "relative" }}>
                <div style={{ textAlign: "center", marginBottom: 12, fontSize: 14, fontWeight: "500", color: "#333" }}>
                  {this.getTitleText()}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {/* Y-axis dropdown only */}
                    <AxisSelectors
                      yVariable={this.state.yVariable}
                      selectedPairs={this.state.selectedPairs}
                      filteredRecords={filteredRecords}
                      plotType={plotType}
                      onYChange={(val) => this.handleVariableChange("yVariable", val)}
                      onPairsChange={(vals) => this.setState({ selectedPairs: vals })}
                    />
                    {computingAlterations && <Spin size="small" />}
                  </div>
                  {plotType === "scatter" && (
                    <ColorControls
                      ref={(elem) => (this.colorControlsRef = elem)}
                      filteredRecords={filteredRecords}
                      colorByVariable={this.state.colorByVariable}
                      selectedGene={this.state.selectedGene}
                      selectedGeneSet={this.state.selectedGeneSet}
                      pathwayMap={this.props.pathwayMap}
                      onColorChange={(val) => this.setState({ colorByVariable: val })}
                      onGeneChange={(val) => this.setState({ selectedGene: val })}
                      onGeneSetChange={(val) => this.setState({ selectedGeneSet: val })}
                    />
                  )}
                </div>

                <div
                  style={{
                    position: "relative",
                    overflow: "auto",
                    maxWidth: containerWidth,
                    maxHeight: 700,
                  }}
                >
                  <svg
                    width={width}
                    height={height}
                    className="plot-container"
                    ref={(elem) => (this.plotContainer = elem)}
                    style={{ display: "block" }}
                  >
                    <g transform={`translate(${margins.gapX}, ${margins.gapY + margins.gapLegend})`}>
                      {plotType !== "density" && (
                        <rect
                          width={panelWidth}
                          height={panelHeight}
                          fill="transparent"
                          stroke="lightgray"
                          strokeWidth={0.33}
                        />
                      )}

                      {plotType === "categorical-scatter" && (
                        <CategoricalScatterPlot
                          config={config}
                          xVariable={this.state.xVariable}
                          onMouseEnter={this.handleMouseEnter}
                          onMouseOut={this.handleMouseOut}
                        />
                      )}
                      {plotType === "stacked-bar" && (
                        <StackedBarPlot
                          config={config}
                          onBarMouseEnter={this.handleBarMouseEnter}
                          onMouseOut={this.handleMouseOut}
                        />
                      )}
                      {plotType === "density" && (
                        <DensityPlot
                          config={config}
                          markers={this.getMarkersForSelectedPairs(config)}
                        />
                      )}

                      {plotType !== "density" && (
                        <>
                          <g className="y-axis-container" />
                          <g className="x-axis-container" transform={`translate(0, ${panelHeight})`} />
                        </>
                      )}

                      {plotType !== "scatter" && (
                        <PlotTooltip
                          visible={tooltip.visible}
                          x={tooltip.x}
                          y={tooltip.y}
                          text={tooltip.text}
                        />
                      )}
                    </g>
                  </svg>

                  {plotType === "scatter" && (
                    <ScatterPlot
                      data={filteredRecords}
                      config={config}
                      colorConfig={this.getColorConfigForScatter()}
                      xVariable={this.state.xVariable}
                      yVariable={this.state.yVariable}
                      colorByVariable={this.state.colorByVariable}
                      selectedGene={this.state.selectedGene}
                      onPointClick={this.handlePointClick}
                    />
                  )}
                </div>

                {plotType === "scatter" && this.renderColorLegend()}

                <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
                  <AxisSelectors
                    xVariable={this.state.xVariable}
                    yVariable={this.state.yVariable}
                    filteredRecords={filteredRecords}
                    plotType={plotType}
                    onXChange={(val) => this.handleVariableChange("xVariable", val)}
                    onYChange={(val) => this.handleVariableChange("yVariable", val)}
                  />
                </div>
              </div>
            );
          }}
        </ContainerDimensions>
      </div>
    );
  }

  getColorConfigForScatter() {
    const { filteredRecords = [] } = this.props;
    const { colorByVariable, selectedGene } = this.state;

    if (!colorByVariable) {
      return { colorAccessor: null, colorScale: null, colorCategories: [] };
    }

    if (colorByVariable === "driver_gene") {
      if (!selectedGene) {
        return { colorAccessor: null, colorScale: null, colorCategories: [] };
      }
      const categories = ["Mutated", "Wild-type"];
      const colorScale = d3.scaleOrdinal()
        .domain(categories)
        .range(["#e41a1c", "#999999"]);
      const colorAccessor = (d) => hasGene(d, selectedGene) ? "Mutated" : "Wild-type";
      return { colorAccessor, colorScale, colorCategories: categories };
    }

    const expandableCategories = ["alteration_type", "driver_gene"];
    const isExpandable = expandableCategories.includes(colorByVariable);

    const allValues = filteredRecords.flatMap((d) => {
      const val = getValue(d, colorByVariable);
      if (isExpandable && Array.isArray(val)) {
        return val;
      }
      return val != null ? [val] : [];
    });
    const uniqueValues = [...new Set(allValues)].sort();

    if (uniqueValues.length === 0) {
      return { colorAccessor: null, colorScale: null, colorCategories: [] };
    }

    const colorScheme = uniqueValues.length <= 10
      ? d3.schemeTableau10
      : d3.schemeCategory10.concat(d3.schemeSet3);
    const colorScale = d3.scaleOrdinal(colorScheme).domain(uniqueValues);
    const colorAccessor = (d) => {
      const val = getValue(d, colorByVariable);
      if (isExpandable && Array.isArray(val)) {
        return val[0];
      }
      return val;
    };

    return { colorAccessor, colorScale, colorCategories: uniqueValues };
  }

  renderColorLegend() {
    const { colorByVariable, selectedGene } = this.state;
    const colorConfig = this.getColorConfigForScatter();
    const { colorScale, colorCategories } = colorConfig;

    if (!colorScale || colorCategories.length === 0 || colorCategories.length > 10) {
      return null;
    }

    const label = colorByVariable === "driver_gene"
      ? selectedGene
      : getColumnLabel(colorByVariable);

    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        marginTop: 8,
        marginLeft: margins.gapX,
        flexWrap: "wrap",
      }}>
        <span style={{ fontSize: 11, color: "#666", fontWeight: 500 }}>{label}:</span>
        {colorCategories.map((cat) => (
          <div key={cat} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              backgroundColor: colorScale(cat),
            }} />
            <span style={{ fontSize: 11, color: "#333" }}>{cat}</span>
          </div>
        ))}
      </div>
    );
  }


  getColorableColumns() {
    const { filteredRecords = [] } = this.props;
    return categoricalColumns.filter((col) => {
      return filteredRecords.some((record) => {
        const val = getValue(record, col.dataIndex);
        return val != null && (Array.isArray(val) ? val.length > 0 : true);
      });
    });
  }
}

export default withTranslation("common")(AggregationsVisualization);
