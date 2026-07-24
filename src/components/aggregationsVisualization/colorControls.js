import React, { Component } from "react";
import { Cascader, Select, Input, Button } from "antd";
import * as d3 from "d3";
import { categoricalColumns, getValue, getColumnLabel, MAX_COLOR_CATEGORIES, parseGeneExpression, evaluateGeneExpression } from "./helpers";
import { hasGene, parseDriverGenes } from "../../helpers/geneAggregations";

class ColorControls extends Component {
  expressionInputRef = React.createRef();

  getColorableColumns = () => {
    const { filteredRecords = [] } = this.props;

    return categoricalColumns.filter((col) => {
      if (col.dataIndex === "alteration_type") return false;
      if (col.dataIndex === "driver_gene") return false;
      return filteredRecords.some((record) => {
        const val = getValue(record, col.dataIndex);
        return val != null && (Array.isArray(val) ? val.length > 0 : true);
      });
    });
  };

  getPatientOptions = () => {
    const { filteredRecords = [] } = this.props;
    const patientCounts = new Map();

    filteredRecords.forEach((record) => {
      const patientId = record.patient_id;
      if (!patientId) return;
      patientCounts.set(patientId, (patientCounts.get(patientId) || 0) + 1);
    });

    return Array.from(patientCounts.entries())
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([patientId, count]) => ({ patientId, count }));
  };

  getGeneFrequencies = () => {
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

    return geneFrequencies;
  };

  getGenesForSet = (geneSetKey, geneFrequencies) => {
    const { pathwayMap = {} } = this.props;

    if (!geneSetKey || geneSetKey === "top20") {
      return Object.entries(geneFrequencies)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([gene]) => gene);
    }

    const geneSetGenes = pathwayMap[geneSetKey] || [];
    const geneSetUpper = geneSetGenes.map((g) => g.toUpperCase());

    return Object.entries(geneFrequencies)
      .filter(([gene]) => geneSetUpper.includes(gene.toUpperCase()))
      .sort((a, b) => b[1] - a[1])
      .map(([gene]) => gene);
  };

  getScatterColorConfig = () => {
    const { filteredRecords = [], colorByVariable, selectedGene, selectedGeneSet, appliedGeneExpression } = this.props;

    if (!colorByVariable) {
      return { colorAccessor: null, colorScale: null, colorCategories: [] };
    }

    if (colorByVariable === "patient_id") {
      const { selectedPatientId } = this.props;
      if (!selectedPatientId) {
        return { colorAccessor: null, colorScale: null, colorCategories: [] };
      }
      const categories = ["Selected patient", "Background"];
      const colorScale = d3.scaleOrdinal()
        .domain(categories)
        .range(["#e41a1c", "#999999"]);
      const colorAccessor = (d) =>
        d.patient_id === selectedPatientId ? "Selected patient" : "Background";
      return { colorAccessor, colorScale, colorCategories: categories };
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

    const allValues = filteredRecords
      .map((d) => getValue(d, colorByVariable))
      .filter((v) => v != null)
      .flatMap((v) => Array.isArray(v) ? v : [v]);
    
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
      return Array.isArray(val) ? val[0] : val;
    };

    return { colorAccessor, colorScale, colorCategories: uniqueValues };
  };

  buildCascaderOptions = () => {
    const { pathwayMap = {} } = this.props;
    const colorableColumns = this.getColorableColumns();
    const geneFrequencies = this.getGeneFrequencies();
    const hasGenes = Object.keys(geneFrequencies).length > 0;

    const options = [
      { value: "none", label: "None" },
      ...colorableColumns.map((col) => ({
        value: col.dataIndex,
        label: col.label,
      })),
    ];

    if (hasGenes) {
      const geneSetOptions = [
        { value: "top20", label: "Top 20" },
        ...Object.keys(pathwayMap).map((name) => ({
          value: name,
          label: name.replace(/_/g, " "),
        })),
        { value: "custom", label: "Custom" },
      ];

      const driverGeneOption = {
        value: "driver_gene",
        label: "Driver Genes",
        children: geneSetOptions,
      };

      options.push(driverGeneOption);
    }

    return options;
  };

  getCascaderValue = () => {
    const { colorByVariable, selectedGeneSet } = this.props;

    if (!colorByVariable) {
      return ["none"];
    }

    if (colorByVariable === "driver_gene" && selectedGeneSet) {
      return ["driver_gene", selectedGeneSet];
    }

    if (colorByVariable === "driver_gene") {
      return ["driver_gene", "top20"];
    }

    return [colorByVariable];
  };

  handleCascaderChange = (values) => {
    const {
      onColorChange,
      onGeneChange,
      onGeneSetChange,
      onPatientIdChange,
    } = this.props;

    if (!values || values.length === 0 || values[0] === "none") {
      onColorChange(null);
      onGeneChange(null);
      if (onGeneSetChange) onGeneSetChange(null);
      if (onPatientIdChange) onPatientIdChange(null);
      return;
    }

    if (values[0] === "driver_gene") {
      onColorChange("driver_gene");
      const geneSet = values.length >= 2 ? values[1] : "top20";
      if (onGeneSetChange) onGeneSetChange(geneSet);
      onGeneChange(null);
      if (onPatientIdChange) onPatientIdChange(null);
    } else if (values[0] === "patient_id") {
      onColorChange("patient_id");
      onGeneChange(null);
      if (onGeneSetChange) onGeneSetChange(null);
      if (onPatientIdChange) onPatientIdChange(null);
    } else {
      onColorChange(values[0]);
      onGeneChange(null);
      if (onGeneSetChange) onGeneSetChange(null);
      if (onPatientIdChange) onPatientIdChange(null);
    }
  };

  handleApplyExpression = () => {
    const { onApplyExpression } = this.props;
    if (onApplyExpression && this.expressionInputRef.current) {
      onApplyExpression(this.expressionInputRef.current.resizableTextArea?.textArea?.value || "");
    }
  };

  renderColorBySelector = () => {
    const {
      colorByVariable,
      selectedGene,
      selectedGeneSet,
      selectedPatientId,
      onGeneChange,
      onPatientIdChange,
      appliedGeneExpression,
    } = this.props;
    const options = this.buildCascaderOptions();
    const value = this.getCascaderValue();
    const geneFrequencies = this.getGeneFrequencies();
    const genesInSet = this.getGenesForSet(selectedGeneSet, geneFrequencies);
    const patientOptions = this.getPatientOptions();

    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, color: "#666" }}>Color:</span>
        <Cascader
          options={options}
          value={value}
          onChange={this.handleCascaderChange}
          size="small"
          style={{ width: 200 }}
          popupMatchSelectWidth={false}
          placeholder="Select color..."
        />
        {colorByVariable === "driver_gene" && selectedGeneSet === "custom" && (
          <>
            <Input.TextArea
              ref={this.expressionInputRef}
              size="small"
              defaultValue={appliedGeneExpression || ""}
              style={{ width: 300, minHeight: 32 }}
              autoSize={{ minRows: 1, maxRows: 3 }}
              placeholder="e.g. TP53 AND (BRCA1 OR BRCA2)"
            />
            <Button
              size="small"
              type="primary"
              onClick={this.handleApplyExpression}
            >
              Apply
            </Button>
          </>
        )}
        {colorByVariable === "driver_gene" && selectedGeneSet !== "custom" && (
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
            {genesInSet.map((gene) => (
              <Select.Option key={gene} value={gene}>
                {gene}
              </Select.Option>
            ))}
          </Select>
        )}
        {colorByVariable === "patient_id" && (
          <Select
            size="small"
            value={selectedPatientId}
            onChange={onPatientIdChange}
            style={{ width: 180 }}
            dropdownMatchSelectWidth={false}
            optionFilterProp="label"
            placeholder="Patient..."
            allowClear
            showSearch
          >
            {patientOptions.map(({ patientId, count }) => {
              const label = `${patientId} (${count} ${count === 1 ? "case" : "cases"})`;
              return (
                <Select.Option key={patientId} value={patientId} label={label}>
                  {label}
                </Select.Option>
              );
            })}
          </Select>
        )}
      </div>
    );
  };

  renderColorLegend = (colorConfig) => {
    const { colorByVariable, selectedGene, selectedGeneSet, appliedGeneExpression } = this.props;
    const { colorScale, colorCategories } = colorConfig;

    if (!colorScale || colorCategories.length === 0 || colorCategories.length > MAX_COLOR_CATEGORIES) {
      return null;
    }

    let label;
    if (colorByVariable === "driver_gene") {
      if (selectedGeneSet === "custom") {
        label = appliedGeneExpression || "Custom";
      } else {
        label = selectedGene;
      }
    } else if (colorByVariable === "patient_id") {
      label = this.props.selectedPatientId || "Patient ID";
    } else {
      label = getColumnLabel(colorByVariable);
    }

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
