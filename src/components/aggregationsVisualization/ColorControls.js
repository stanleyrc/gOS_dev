import React, { Component } from "react";
import { Select } from "antd";
import * as d3 from "d3";
import { categoricalColumns, getValue, getColumnLabel, MAX_COLOR_CATEGORIES, margins } from "./helpers";
import { hasGene } from "../../helpers/geneAggregations";

class ColorControls extends Component {
  getColorableColumns = () => {
    const { filteredRecords = [] } = this.props;

    return categoricalColumns.filter((col) => {
      return filteredRecords.some((record) => {
        const val = getValue(record, col.dataIndex);
        return val != null && (Array.isArray(val) ? val.length > 0 : true);
      });
    });
  };

  getTopGenes = () => {
    const { filteredRecords = [] } = this.props;
    const geneFrequencies = {};

    filteredRecords.forEach((record) => {
      const genes = getValue(record, "driver_gene");
      if (Array.isArray(genes)) {
        genes.forEach((gene) => {
          geneFrequencies[gene] = (geneFrequencies[gene] || 0) + 1;
        });
      }
    });

    return Object.entries(geneFrequencies)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([gene]) => gene);
  };

  getScatterColorConfig = () => {
    const { filteredRecords = [], colorByVariable, selectedGene } = this.props;

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

    const colorScheme = uniqueValues.length <= 10
      ? d3.schemeTableau10
      : d3.schemeCategory10.concat(d3.schemeSet3);
    const colorScale = d3.scaleOrdinal(colorScheme).domain(uniqueValues);
    const colorAccessor = (d) => getValue(d, colorByVariable);

    return { colorAccessor, colorScale, colorCategories: uniqueValues };
  };

  renderColorBySelector = () => {
    const { colorByVariable, selectedGene, onColorChange, onGeneChange } = this.props;
    const colorableColumns = this.getColorableColumns();
    const topGenes = this.getTopGenes();
    
    // Filter out driver_gene from colorableColumns if we have topGenes to avoid duplication
    const filteredColumns = topGenes.length > 0
      ? colorableColumns.filter((col) => col.dataIndex !== "driver_gene")
      : colorableColumns;

    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, color: "#666" }}>Color:</span>
        <Select
          size="small"
          value={colorByVariable || "none"}
          onChange={(val) => {
            if (val === "none") {
              onColorChange(null);
              onGeneChange(null);
            } else if (val === "driver_gene") {
              onColorChange("driver_gene");
              onGeneChange(null);
            } else {
              onColorChange(val);
              onGeneChange(null);
            }
          }}
          style={{ width: 160 }}
          dropdownMatchSelectWidth={false}
        >
          <Select.Option value="none">None</Select.Option>
          {filteredColumns.map((col) => (
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
            onChange={onGeneChange}
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
  };

  renderColorLegend = (colorConfig) => {
    const { colorByVariable, selectedGene } = this.props;
    const { colorScale, colorCategories } = colorConfig;

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
        marginLeft: 8,
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
  };

  render() {
    const { showLegend = false } = this.props;
    const colorConfig = this.getScatterColorConfig();

    return (
      <>
        {this.renderColorBySelector()}
        {showLegend && this.renderColorLegend(colorConfig)}
      </>
    );
  }
}

export default ColorControls;
