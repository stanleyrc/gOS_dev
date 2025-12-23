import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { Spin, Segmented, Select } from "antd";
import * as d3 from "d3";
import ContainerDimensions from "react-container-dimensions";
import { measureText, getColorMarker } from "../../helpers/utility";
import { computeGeneStats, hasGene, parseDriverGenes } from "../../helpers/geneAggregations";
import AxisSelectors from "./axisSelectors";
import ColorControls from "./colorControls";
import ScatterPlot from "./scatterPlot";
import StackedBarPlot from "./stackedBarPlot";
import CategoricalScatterPlot from "./categoricalScatterPlot";
import DensityPlot from "./densityPlot";
import OncoPrintPlot from "./oncoPrintPlot";
import PlotTooltip from "./plotTooltip";
import {
  margins,
  calculateDynamicMargins,
  MIN_BAR_WIDTH,
  MIN_CATEGORY_WIDTH,
  parseGeneExpression,
  evaluateGeneExpression,
  getValue,
  getColumnLabel,
  numericColumns,
  categoricalColumns,
  allColumns,
  openCaseInNewTab,
  discoverAttributes,
} from "./helpers";

class AggregationsVisualization extends Component {
  plotContainer = null;
  cachedConfig = null;
  cachedConfigKey = null;
  colorControlsRef = null;
  _cachedRecords = null;
  _cachedDynamicColumns = null;

  constructor(props) {
    super(props);
    
    // Initialize with dynamic columns
    const dynamicColumns = discoverAttributes(props.filteredRecords || []);
    const xVarDefault = dynamicColumns.numericColumns.length > 0 
      ? dynamicColumns.numericColumns[0].dataIndex 
      : numericColumns[0].dataIndex;
    const yVarDefault = dynamicColumns.numericColumns.length > 1 
      ? dynamicColumns.numericColumns[1].dataIndex 
      : numericColumns[1].dataIndex;
    const colorVarDefault = dynamicColumns.categoricalColumns.length > 0 
      ? dynamicColumns.categoricalColumns[0].dataIndex 
      : categoricalColumns[0].dataIndex;

    this.state = {
      xVariable: xVarDefault,
      yVariable: yVarDefault,
      colorVariable: colorVarDefault,
      colorByVariable: null,
      selectedGene: null,
      selectedGeneSet: "top20",
      appliedGeneExpression: "",
      tooltip: {
        visible: false,
        x: -1000,
        y: -1000,
        text: [],
      },
      computingAlterations: false,
      selectedPairs: [],
      scatterPlotType: "scatter",
      oncoPrintSortMethod: "memo",
    };
  }

  getDynamicColumns() {
    const { filteredRecords = [] } = this.props;
    // Simple memoization to avoid re-computation on every render
    if (this._cachedRecords === filteredRecords && this._cachedDynamicColumns) {
      return this._cachedDynamicColumns;
    }
    this._cachedRecords = filteredRecords;
    this._cachedDynamicColumns = discoverAttributes(filteredRecords);
    return this._cachedDynamicColumns;
  }

  scatterIdAccessor = (d) => d.pair;

  handlePointClick = (dataPoint) => {
    const { dataset } = this.props;
    if (dataPoint?.pair) {
      openCaseInNewTab(dataPoint.pair, dataset);
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

  getColumnTypeForVariable(dataIndex) {
    const dynamicColumns = this.getDynamicColumns();
    const col = dynamicColumns.allColumns.find((c) => c.dataIndex === dataIndex);
    return col?.type || "numeric";
  }

  getOncoPrintConfig() {
    const { xVariable, yVariable } = this.state;
    const dynamicColumns = this.getDynamicColumns();
    
    const xCol = dynamicColumns.allColumns.find((c) => c.dataIndex === xVariable);
    const yCol = dynamicColumns.allColumns.find((c) => c.dataIndex === yVariable);
    
    // Numeric mode for object attributes (paired with pair axis)
    if (xCol?.type === 'object') {
      return { mode: 'numeric', objectAttribute: xVariable };
    }
    if (yCol?.type === 'object') {
      return { mode: 'numeric', objectAttribute: yVariable };
    }
    
    // Categorical mode for driver_gene
    return { mode: 'categorical', objectAttribute: null };
  }

  getPlotType() {
    const { xVariable, yVariable, selectedGeneSet } = this.state;
    const dynamicColumns = this.getDynamicColumns();

    const xCol = dynamicColumns.allColumns.find((c) => c.dataIndex === xVariable);
    const yCol = dynamicColumns.allColumns.find((c) => c.dataIndex === yVariable);
    
    // OncoPrint for object × pair (numeric mode heatmap)
    if ((xCol?.type === 'object' && yVariable === 'pair') || 
        (yCol?.type === 'object' && xVariable === 'pair')) {
      return "oncoprint";
    }

    // OncoPrint: Pair × Driver Gene (with gene set selected) - check BEFORE generic pair check
    if (xVariable === "driver_gene" && yVariable === "pair" && selectedGeneSet) {
      return "oncoprint";
    }
    if (yVariable === "driver_gene" && xVariable === "pair" && selectedGeneSet) {
      return "oncoprint";
    }

    if (xVariable === "pair") {
      return "density";
    }

    // For object types paired with non-pair variables, treat as categorical
    // (getValue will flatten object to boolean categories: keys where value > 0)
    const xType = xCol?.type === 'object' ? 'categorical' : this.getColumnTypeForVariable(xVariable);
    const yType = yCol?.type === 'object' ? 'categorical' : this.getColumnTypeForVariable(yVariable);

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
      const { xIsCategorical } = config;
      if (xIsCategorical) {
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
    const dynamicColumns = this.getDynamicColumns();
    const col = dynamicColumns.allColumns.find((c) => c.dataIndex === variable);
    
    const expandableCategories = ["alteration_type", "driver_gene"];
    const isExpandable = expandableCategories.includes(variable) || col?.type === 'object';
    
    if (!isExpandable) {
      return records;
    }

    const expandedRecords = [];
    records.forEach((record) => {
      const categories = getValue(record, variable, dynamicColumns);
      if (categories && Array.isArray(categories) && categories.length > 0) {
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
    const dynamicColumns = this.getDynamicColumns();
    const col = dynamicColumns.allColumns.find((c) => c.dataIndex === variable);
    
    const expandableCategories = ["alteration_type", "driver_gene"];
    const isExpandable = expandableCategories.includes(variable) || col?.type === 'object';
    
    if (isExpandable && record._expandedVariable === variable) {
      return record._expandedCategory;
    }
    return getValue(record, variable, dynamicColumns);
  }

  getGenesForSelectedSet(allGeneFrequencies) {
    const { selectedGeneSet } = this.state;
    const { pathwayMap = {} } = this.props;

    // Handle custom gene sets
    if (selectedGeneSet && selectedGeneSet.startsWith("custom:")) {
      const customGeneString = selectedGeneSet.substring(7); // Remove "custom:" prefix
      if (!customGeneString) {
        return [];
      }
      return customGeneString.split(",").map((g) => g.trim()).filter((g) => g.length > 0);
    }

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

  computeGeneFrequencies(records) {
    const frequencies = {};
    records.forEach((record) => {
      const genes = parseDriverGenes(record.summary);
      genes.forEach(({ gene }) => {
        frequencies[gene] = (frequencies[gene] || 0) + 1;
      });
    });
    return frequencies;
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

    let stageWidth = containerWidth - 2 * margins.gapX;
    let stageHeight = height - 2 * margins.gapY - margins.gapYBottom;
    let panelHeight = stageHeight - margins.gapLegend;
    let currentMargins = { ...margins };

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

      // Calculate dynamic margins for stacked-bar (categorical X, rotated labels)
      currentMargins = calculateDynamicMargins(xCategories, true, false);
      stageWidth = containerWidth - 2 * currentMargins.gapX;
      stageHeight = height - 2 * currentMargins.gapY - currentMargins.gapYBottom;
      panelHeight = stageHeight - currentMargins.gapLegend;

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
        containerWidth, width: panelWidth + 2 * currentMargins.gapX, height, panelWidth, panelHeight,
        xScale, yScale, color, legend, scrollable,
        xVariable, yVariable, colorVariable, plotType, stackedData, yCategories: yCategories,
        margins: currentMargins,
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

      const dataset = filteredRecords
        .map((d) => ({ pair: d.pair, value: getValue(d, yVariable) }))
        .filter((d) => d.value != null && !isNaN(d.value))
        .sort((a, b) => d3.ascending(a.value, b.value));

      const config = {
        containerWidth,
        width: panelWidth + 2 * currentMargins.gapX,
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
        margins: currentMargins,
        dataset,
        id: yVariable,
      };
      this.cachedConfig = config;
      this.cachedConfigKey = cacheKey;
      return config;
    } else if (plotType === "categorical-scatter") {
      const xType = this.getColumnTypeForVariable(xVariable);
      // Treat 'object' type as categorical (object keys are categories)
      const xIsCategorical = xType === "categorical" || xType === "object";
      const catVar = xIsCategorical ? xVariable : yVariable;
      const numVar = xIsCategorical ? yVariable : xVariable;

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

      // Calculate dynamic margins for categorical-scatter
      const isXRotated = xIsCategorical;
      const isYCategorical = !xIsCategorical;
      currentMargins = calculateDynamicMargins(categories, isXRotated, isYCategorical);
      stageWidth = containerWidth - 2 * currentMargins.gapX;
      stageHeight = height - 2 * currentMargins.gapY - currentMargins.gapYBottom;
      panelHeight = stageHeight - currentMargins.gapLegend;

      const minRequiredWidth = categories.length * MIN_CATEGORY_WIDTH;
      if (xIsCategorical && minRequiredWidth > stageWidth) {
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

      if (xIsCategorical) {
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
        containerWidth, width: panelWidth + 2 * currentMargins.gapX, height, panelWidth, panelHeight,
        xScale, yScale, plotType, categoryData,
        catVar, numVar, xVariable, yVariable, xIsCategorical,
        margins: currentMargins,
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
        containerWidth, width: panelWidth + 2 * currentMargins.gapX, height, panelWidth, panelHeight,
        xScale, yScale, scrollable,
        xFormat: ",.2f", yFormat: ",.2f", xVariable, yVariable, plotType,
        margins: currentMargins,
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
      const { xIsCategorical } = config;
      if (xIsCategorical) {
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
      const currentYType = this.getColumnTypeForVariable(this.state.yVariable);
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
            const { width, height, panelWidth, panelHeight, margins: configMargins } = config;
            const plotMargins = configMargins || margins;

            return (
              <div style={{ position: "relative" }}>
                <div style={{ textAlign: "center", marginBottom: 8, fontSize: 14, fontWeight: "500", color: "#333" }}>
                  {this.getTitleText()}
                </div>
                {plotType === "scatter" && (
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
                    <Segmented
                      size="small"
                      options={[
                        { value: "scatter", label: "Scatter" },
                        { value: "contour", label: "Contour" },
                      ]}
                      value={this.state.scatterPlotType}
                      onChange={(value) => this.setState({ scatterPlotType: value })}
                    />
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {/* Y-axis dropdown only */}
                    <AxisSelectors
                      yVariable={this.state.yVariable}
                      selectedPairs={this.state.selectedPairs}
                      filteredRecords={filteredRecords}
                      plotType={plotType}
                      pathwayMap={this.props.pathwayMap}
                      selectedGeneSet={this.state.selectedGeneSet}
                      dynamicColumns={this.getDynamicColumns()}
                      onYChange={(val) => this.handleVariableChange("yVariable", val)}
                      onPairsChange={(vals) => this.setState({ selectedPairs: vals })}
                      onGeneSetChange={(val) => this.setState({ selectedGeneSet: val })}
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
                      appliedGeneExpression={this.state.appliedGeneExpression}
                      pathwayMap={this.props.pathwayMap}
                      onColorChange={(val) => this.setState({ colorByVariable: val })}
                      onGeneChange={(val) => this.setState({ selectedGene: val })}
                      onGeneSetChange={(val) => this.setState({ selectedGeneSet: val })}
                      onApplyExpression={(val) => this.setState({ appliedGeneExpression: val })}
                    />
                  )}
                  {plotType === "oncoprint" && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 12, color: "#666" }}>Sort:</span>
                      <Select
                        size="small"
                        value={this.state.oncoPrintSortMethod}
                        onChange={(val) => this.setState({ oncoPrintSortMethod: val })}
                        style={{ width: 100 }}
                      >
                        <Select.Option value="none">None</Select.Option>
                        <Select.Option value="memo">Memo</Select.Option>
                      </Select>
                    </div>
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
                   {plotType === "oncoprint" ? (
                      <OncoPrintPlot
                        width={width}
                        height={height}
                        filteredRecords={filteredRecords}
                        geneSet={this.getOncoPrintConfig().mode === 'numeric' 
                          ? [] 
                          : this.getGenesForSelectedSet(this.computeGeneFrequencies(filteredRecords))}
                        mode={this.getOncoPrintConfig().mode}
                        objectAttribute={this.getOncoPrintConfig().objectAttribute}
                        onPairClick={this.handlePointClick}
                        enableMemoSort={this.state.oncoPrintSortMethod === "memo"}
                      />
                   ) : (
                     <svg
                       width={width}
                       height={height}
                       className="plot-container"
                       ref={(elem) => (this.plotContainer = elem)}
                       style={{ display: "block" }}
                     >
                       <g transform={`translate(${plotMargins.gapX}, ${plotMargins.gapY + plotMargins.gapLegend})`}>
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
                   )}

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
                        scatterPlotType={this.state.scatterPlotType}
                      />
                    )}
                 </div>

                {plotType === "scatter" && this.renderColorLegend()}
                {plotType === "oncoprint" && this.renderOncoPrintLegend()}

                <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
                  <AxisSelectors
                    xVariable={this.state.xVariable}
                    yVariable={this.state.yVariable}
                    filteredRecords={filteredRecords}
                    plotType={plotType}
                    pathwayMap={this.props.pathwayMap}
                    selectedGeneSet={this.state.selectedGeneSet}
                    dynamicColumns={this.getDynamicColumns()}
                    onXChange={(val) => this.handleVariableChange("xVariable", val)}
                    onYChange={(val) => this.handleVariableChange("yVariable", val)}
                    onGeneSetChange={(val) => this.setState({ selectedGeneSet: val })}
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
    const { colorByVariable, selectedGene, selectedGeneSet, appliedGeneExpression } = this.state;

    if (!colorByVariable) {
      return { colorAccessor: null, colorScale: null, colorCategories: [] };
    }

    if (colorByVariable === "driver_gene") {
      if (selectedGeneSet === "custom") {
        if (!appliedGeneExpression) {
          return { colorAccessor: null, colorScale: null, colorCategories: [] };
        }
        let ast;
        try {
          ast = parseGeneExpression(appliedGeneExpression);
        } catch (e) {
          return { colorAccessor: null, colorScale: null, colorCategories: [], error: e.message };
        }
        if (!ast) {
          return { colorAccessor: null, colorScale: null, colorCategories: [] };
        }
        const categories = ["True", "False"];
        const colorScale = d3.scaleOrdinal()
          .domain(categories)
          .range(["#e41a1c", "#999999"]);
        const colorAccessor = (d) => {
          const genes = parseDriverGenes(d.summary).map(g => g.gene);
          return evaluateGeneExpression(ast, genes) ? "True" : "False";
        };
        return { colorAccessor, colorScale, colorCategories: categories };
      }

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
    const { colorByVariable, selectedGene, selectedGeneSet, appliedGeneExpression } = this.state;
    const colorConfig = this.getColorConfigForScatter();
    const { colorScale, colorCategories } = colorConfig;

    if (!colorScale || colorCategories.length === 0 || colorCategories.length > 10) {
      return null;
    }

    let label;
    if (colorByVariable === "driver_gene") {
      if (selectedGeneSet === "custom") {
        label = appliedGeneExpression || "Custom";
      } else {
        label = selectedGene;
      }
    } else {
      label = getColumnLabel(colorByVariable);
    }

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

  renderOncoPrintLegend() {
    const ALTERATION_COLORS = {
      missense: "#3498db",
      trunc: "#2ecc71",
      splice: "#9b59b6",
      homdel: "#e74c3c",
      amp: "#e67e22",
      fusion: "#1abc9c",
    };

    const legendItems = [
      { type: "missense", label: "Missense", color: ALTERATION_COLORS.missense },
      { type: "trunc", label: "Truncating", color: ALTERATION_COLORS.trunc },
      { type: "splice", label: "Splice", color: ALTERATION_COLORS.splice },
      { type: "homdel", label: "Homozygous Deletion", color: ALTERATION_COLORS.homdel },
      { type: "amp", label: "Amplification", color: ALTERATION_COLORS.amp },
      { type: "fusion", label: "Fusion", color: ALTERATION_COLORS.fusion },
    ];

    return (
      <div style={{ display: "flex", gap: 12, marginTop: 8, marginLeft: margins.gapX, flexWrap: "wrap" }}>
        {legendItems.map(({ type, label, color }) => (
          <div key={type} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 12, height: 12, backgroundColor: color, borderRadius: 2 }} />
            <span style={{ fontSize: 11, color: "#666" }}>{label}</span>
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
