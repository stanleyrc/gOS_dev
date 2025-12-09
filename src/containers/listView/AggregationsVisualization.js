import React, { Component } from "react";
import { withTranslation } from "react-i18next";
import { Select, Spin } from "antd";
import * as d3 from "d3";
import ContainerDimensions from "react-container-dimensions";
import { measureText, getColorMarker } from "../../helpers/utility";
import { parseDriverGenes, computeGeneStats, hasGene } from "../../helpers/geneAggregations";
import HistogramPlot from "../../components/histogramPlot";
import KonvaScatter from "../../components/konvaScatter";

const margins = {
  gapX: 34,
  gapY: 24,
  gapYBottom: 60,
  gapLegend: 0,
  tooltipGap: 5,
};

const MIN_BAR_WIDTH = 30;
const MIN_CATEGORY_WIDTH = 40;
const MAX_COLOR_CATEGORIES = 10;

const parseAlterationSummary = (summary) => {
  if (!summary || typeof summary !== "string") {
    return [];
  }
  const lines = summary.split("\n");
  const types = [];
  lines.forEach((line) => {
    const match = line.match(/^([^:]+):/);
    if (match) {
      const typeNormalized = match[1].toLowerCase().replace(/\s+/g, "_");
      if (!types.includes(typeNormalized)) {
        types.push(typeNormalized);
      }
    }
  });
  return types;
};

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
  { key: "alteration_type", dataIndex: "alteration_type", label: "Alteration Type", type: "categorical" },
  { key: "driver_gene", dataIndex: "driver_gene", label: "Driver Genes (Top 20)", type: "categorical" },
];

const pairColumn = { key: "pair", dataIndex: "pair", label: "Pair (Density Plot)", type: "pair" };

const allColumns = [...numericColumns, ...categoricalColumns, pairColumn];

const getColumnType = (dataIndex) => {
  const col = allColumns.find((c) => c.dataIndex === dataIndex);
  return col?.type || "numeric";
};

const getColumnLabel = (dataIndex) => {
  const col = allColumns.find((c) => c.dataIndex === dataIndex);
  return col?.label || dataIndex;
};

const getValue = (record, path) => {
  if (path === "alteration_type") {
    return parseAlterationSummary(record.summary);
  }
  if (path === "driver_gene") {
    return parseDriverGenes(record.summary).map((g) => g.gene);
  }
  return path.split(".").reduce((obj, key) => obj?.[key], record);
};

class AggregationsVisualization extends Component {
  plotContainer = null;
  cachedConfig = null;
  cachedConfigKey = null;

  state = {
    xVariable: numericColumns[0].dataIndex,
    yVariable: numericColumns[1].dataIndex,
    colorVariable: categoricalColumns[0].dataIndex,
    colorByVariable: null,
    selectedGene: null,
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
    if (variable !== "alteration_type" && variable !== "driver_gene") {
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
    if ((variable === "alteration_type" || variable === "driver_gene") && 
        record._expandedVariable === variable) {
      return record._expandedCategory;
    }
    return getValue(record, variable);
  }

  getPlotConfiguration() {
    const { filteredRecords = [] } = this.props;
    const { xVariable, yVariable, colorVariable } = this.state;
    const containerWidth = this.currentWidth || 600;
    const height = 600;
    const plotType = this.getPlotType();

    const cacheKey = `${xVariable}-${yVariable}-${colorVariable}-${containerWidth}-${filteredRecords.length}`;
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
      
      // Special case: driver_gene × alteration_type uses actual gene-type pairs
      // (alteration type is tied to specific gene, not independent)
      const isGeneByAlteration = 
        (xVariable === "driver_gene" && yVariable === "alteration_type") ||
        (xVariable === "alteration_type" && yVariable === "driver_gene");
      
      if (isGeneByAlteration) {
        // Use computeGeneStats which correctly tracks gene-type pairs
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
        // Standard expansion for other categorical combinations
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
        xCategories = Object.entries(xCategoryCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([gene]) => gene);
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
        categories = categories
          .sort((a, b) => valuesByCategory[b].length - valuesByCategory[a].length)
          .slice(0, 20);
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
          yVariable: numericColumns[0].dataIndex 
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

  getColorableColumns() {
    // Return all categorical columns except alteration_type and driver_gene
    // (driver_gene is handled separately with gene selector)
    // High-cardinality fields are still included - legend will be hidden for them
    return categoricalColumns.filter(
      (col) => col.dataIndex !== "alteration_type" && col.dataIndex !== "driver_gene"
    );
  }

  getTopGenes() {
    const { filteredRecords = [] } = this.props;
    const geneStats = computeGeneStats(filteredRecords);
    return geneStats.topGenes.slice(0, 20);
  }

  renderDropdown(variable, style = {}, columns = null) {
    const value = this.state[variable];
    const { xVariable } = this.state;
    const availableColumns = columns || this.getColumnsForVariable(variable);
    
    const isPairMode = xVariable === "pair";
    const isYDropdown = variable === "yVariable";

    return (
      <Select
        size="small"
        value={value}
        onChange={(val) => this.handleVariableChange(variable, val)}
        style={{ width: 140, ...style }}
        dropdownMatchSelectWidth={false}
      >
        {availableColumns.map((col) => {
          const isDisabled = isPairMode && isYDropdown && col.type === "categorical";
          return (
            <Select.Option 
              key={col.dataIndex} 
              value={col.dataIndex}
              disabled={isDisabled}
              style={isDisabled ? { color: '#bfbfbf' } : {}}
            >
              {col.label}
            </Select.Option>
          );
        })}
      </Select>
    );
  }

  renderPairSelector() {
    const { filteredRecords = [] } = this.props;
    const { selectedPairs } = this.state;

    const pairOptions = filteredRecords.map((d) => ({
      value: d.pair,
      label: d.pair,
    }));

    return (
      <Select
        mode="multiple"
        size="small"
        placeholder="Select cases to highlight..."
        value={selectedPairs}
        onChange={(values) => this.setState({ selectedPairs: values })}
        style={{ width: 300 }}
        showSearch
        optionFilterProp="label"
        popupMatchSelectWidth={false}
        maxTagCount={2}
        maxTagPlaceholder={(omittedValues) => `+${omittedValues.length} more`}
        allowClear
      >
        {pairOptions.map((opt) => (
          <Select.Option key={opt.value} value={opt.value} label={opt.label}>
            {opt.label}
          </Select.Option>
        ))}
      </Select>
    );
  }

  renderColorBySelector() {
    const { colorByVariable, selectedGene } = this.state;
    const colorableColumns = this.getColorableColumns();
    const topGenes = this.getTopGenes();

    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, color: "#666" }}>Color:</span>
        <Select
          size="small"
          value={colorByVariable || "none"}
          onChange={(val) => {
            if (val === "none") {
              this.setState({ colorByVariable: null, selectedGene: null });
            } else if (val === "driver_gene") {
              this.setState({ colorByVariable: "driver_gene", selectedGene: null });
            } else {
              this.setState({ colorByVariable: val, selectedGene: null });
            }
          }}
          style={{ width: 160 }}
          dropdownMatchSelectWidth={false}
        >
          <Select.Option value="none">None</Select.Option>
          {colorableColumns.map((col) => (
            <Select.Option key={col.dataIndex} value={col.dataIndex}>
              {col.label}
            </Select.Option>
          ))}
          {topGenes.length > 0 && (
            <Select.Option value="driver_gene">Driver Genes (Top 20)</Select.Option>
          )}
        </Select>
        {colorByVariable === "driver_gene" && (
          <Select
            size="small"
            value={selectedGene}
            onChange={(val) => this.setState({ selectedGene: val })}
            style={{ width: 100 }}
            dropdownMatchSelectWidth={false}
            placeholder="Gene..."
            allowClear
            showSearch
          >
            {topGenes.map((gene) => (
              <Select.Option key={gene} value={gene}>
                {gene}
              </Select.Option>
            ))}
          </Select>
        )}
      </div>
    );
  }

  getScatterColorConfig() {
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

    const uniqueValues = [...new Set(
      filteredRecords
        .map((d) => getValue(d, colorByVariable))
        .filter((v) => v != null)
    )].sort();

    if (uniqueValues.length === 0) {
      return { colorAccessor: null, colorScale: null, colorCategories: [] };
    }

    // Use extended color scheme for high-cardinality fields
    const colorScheme = uniqueValues.length <= 10 
      ? d3.schemeTableau10 
      : d3.schemeCategory10.concat(d3.schemeSet3);
    const colorScale = d3.scaleOrdinal(colorScheme).domain(uniqueValues);
    const colorAccessor = (d) => getValue(d, colorByVariable);
    
    // Return all categories - legend visibility is handled by renderColorLegend
    return { colorAccessor, colorScale, colorCategories: uniqueValues };
  }

  renderColorLegend(colorConfig) {
    const { colorScale, colorCategories } = colorConfig;
    const { colorByVariable, selectedGene } = this.state;

    // Hide legend for high-cardinality fields (user can still see values in tooltip)
    if (!colorScale || colorCategories.length === 0 || colorCategories.length > MAX_COLOR_CATEGORIES) {
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

  renderScatterPlotOverlay(config, colorConfig) {
    const { filteredRecords = [] } = this.props;
    const { xVariable, yVariable, colorByVariable, selectedGene } = this.state;
    const { xScale, yScale, panelWidth, panelHeight } = config;
    const { colorAccessor, colorScale } = colorConfig;

    const xAccessor = (d) => getValue(d, xVariable);
    const yAccessor = (d) => getValue(d, yVariable);
    
    const tooltipAccessor = (d) => {
      const items = [
        { label: "Case", value: d.pair },
        { label: getColumnLabel(xVariable), value: d3.format(",.2f")(getValue(d, xVariable)) },
        { label: getColumnLabel(yVariable), value: d3.format(",.2f")(getValue(d, yVariable)) },
      ];
      
      if (colorByVariable === "driver_gene" && selectedGene) {
        items.push({
          label: selectedGene,
          value: hasGene(d, selectedGene) ? "Mutated" : "Wild-type",
        });
      } else if (colorByVariable && colorAccessor) {
        const colorVal = colorAccessor(d);
        if (colorVal != null) {
          items.push({
            label: getColumnLabel(colorByVariable),
            value: colorVal,
          });
        }
      }
      
      return items;
    };

    return (
      <div
        style={{
          position: "absolute",
          top: margins.gapY + margins.gapLegend,
          left: margins.gapX,
          width: panelWidth,
          height: panelHeight,
          pointerEvents: "auto",
        }}
      >
        <KonvaScatter
          data={filteredRecords}
          width={panelWidth}
          height={panelHeight}
          xAccessor={xAccessor}
          yAccessor={yAccessor}
          xScale={xScale}
          yScale={yScale}
          idAccessor={this.scatterIdAccessor}
          tooltipAccessor={tooltipAccessor}
          radiusAccessor={5}
          colorAccessor={colorAccessor}
          colorScale={colorScale}
          onPointClick={this.handlePointClick}
        />
      </div>
    );
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

  renderDensityPlot(config) {
    const { panelWidth, panelHeight, densityData, q1, q3, q99, range, bandwidth, format } = config;
    
    if (!densityData || densityData.length === 0) {
      return (
        <text x={panelWidth / 2} y={panelHeight / 2} textAnchor="middle" fill="#999">
          No data available
        </text>
      );
    }

    const markers = this.getMarkersForSelectedPairs(config);
    
    return (
      <foreignObject x={0} y={0} width={panelWidth} height={panelHeight}>
        <HistogramPlot
          width={panelWidth}
          height={panelHeight}
          data={densityData}
          q1={q1}
          q3={q3}
          q99={q99}
          range={range}
          bandwidth={bandwidth}
          format={format}
          scaleX="linear"
          markers={markers}
        />
      </foreignObject>
    );
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
    const { tooltip, computingAlterations } = this.state;
    const plotType = this.getPlotType();
    const colorConfig = this.getScatterColorConfig();

    return (
      <div className="aggregation-visualization-container">
        <ContainerDimensions>
          {({ width: containerWidth }) => {
            this.currentWidth = containerWidth;
            const config = this.getPlotConfiguration();
            const { width, height, panelWidth, panelHeight, legend, scrollable } = config;
            const svgString = legend ? new XMLSerializer().serializeToString(legend) : null;

            return (
              <div style={{ position: "relative" }}>
                <div style={{ textAlign: "center", marginBottom: 12, fontSize: 14, fontWeight: "500", color: "#333" }}>
                  {getColumnLabel(this.state.xVariable)} vs. {getColumnLabel(this.state.yVariable)}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                   <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {this.renderDropdown("yVariable")}
                      {computingAlterations && <Spin size="small" />}
                    </div>
                    {plotType === "density" && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {this.renderPairSelector()}
                      </div>
                    )}
                    {plotType === "scatter" && this.renderColorBySelector()}
                  </div>

                <div style={{ 
                  position: "relative",
                  overflow: "auto",
                  maxWidth: containerWidth,
                  maxHeight: 700,
                }}>
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

                      {plotType === "categorical-scatter" && this.renderCategoricalScatter(config)}
                      {plotType === "stacked-bar" && this.renderStackedBar(config)}
                      {plotType === "density" && this.renderDensityPlot(config)}

                      {plotType !== "density" && (
                        <>
                          <g className="y-axis-container" />
                          <g className="x-axis-container" transform={`translate(0, ${panelHeight})`} />
                        </>
                      )}

                      {tooltip.visible && plotType !== "scatter" && (
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
                  {plotType === "scatter" && this.renderScatterPlotOverlay(config, colorConfig)}
                </div>
                
                {plotType === "scatter" && this.renderColorLegend(colorConfig)}

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
