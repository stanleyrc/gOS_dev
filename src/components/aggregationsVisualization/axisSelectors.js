import React, { Component } from "react";
import { Select, Cascader, Input, message } from "antd";

class AxisSelectors extends Component {
  state = {
    customGenesX: "",
    showCustomGeneInputX: false,
    enteringCustomX: false,
    customGenesY: "",
    showCustomGeneInputY: false,
    enteringCustomY: false,
  };

  buildCascaderOptions(forXAxis = false) {
    const { pathwayMap = {}, dynamicColumns = {} } = this.props;
    const { allColumns = [] } = dynamicColumns;
    const pathwayNames = Object.keys(pathwayMap);

    const columnsToUse = forXAxis
      ? allColumns
      : allColumns.filter((col) => col.type !== "pair");

    const options = [];

    // Group columns by type
    const numericCols = columnsToUse.filter((c) => c.type === 'numeric');
    const categoricalCols = columnsToUse.filter((c) => c.type === 'categorical' || c.type === 'object');
    const pairCol = columnsToUse.find((c) => c.type === 'pair');

    // Numeric group
    if (numericCols.length > 0) {
      options.push({
        value: '_numeric_group',
        label: 'Numeric',
        children: numericCols.map((col) => ({
          value: col.dataIndex,
          label: col.label,
        })),
      });
    }

    // Categorical group (includes object types)
    if (categoricalCols.length > 0) {
      options.push({
        value: '_categorical_group',
        label: 'Categorical',
        children: categoricalCols.map((col) => {
          if (col.dataIndex === 'driver_gene') {
            return {
              value: col.dataIndex,
              label: col.label,
              children: [
                { value: "top20", label: "Top 20" },
                ...pathwayNames.map((name) => ({
                  value: name,
                  label: name.replace(/_/g, " "),
                })),
                { value: "custom", label: "Custom" },
              ],
            };
          }
          return { value: col.dataIndex, label: col.label };
        }),
      });
    }

    // Pair as standalone option (X-axis only)
    if (forXAxis && pairCol) {
      options.push({
        value: pairCol.dataIndex,
        label: pairCol.label,
      });
    }

    return options;
  }

  getCascaderValue(variable, forXAxis = false) {
    const enteringCustomKey = forXAxis ? "enteringCustomX" : "enteringCustomY";
    if (this.state[enteringCustomKey]) {
      return [];
    }
    const { selectedGeneSet, dynamicColumns = {} } = this.props;
    const { allColumns = [] } = dynamicColumns;
    
    if (variable === "driver_gene") {
      return ["_categorical_group", "driver_gene", selectedGeneSet || "top20"];
    }
    
    // Determine the group for this variable
    const col = allColumns.find((c) => c.dataIndex === variable);
    if (!col) return variable ? [variable] : [];
    
    // Pair is a standalone option (no group)
    if (col.type === 'pair') {
      return [variable];
    }
    
    // Categorical and object types are grouped under Categorical
    let groupKey = '_numeric_group';
    if (col.type === 'categorical' || col.type === 'object') {
      groupKey = '_categorical_group';
    }
    
    return [groupKey, variable];
  }

  handleCustomGenesChange = (e, isXAxis = false) => {
    const input = e.target.value;
    const stateKey = isXAxis ? "customGenesX" : "customGenesY";
    this.setState({ [stateKey]: input });

    // Parse and validate genes (deduplicate and normalize)
    const genes = [...new Set(
      input
        .split(",")
        .map((g) => g.trim().toUpperCase())
        .filter((g) => g.length > 0)
    )];

    if (genes.length > 100) {
      message.warning(`Maximum 100 genes allowed. You have ${genes.length} genes.`);
    }
  };

  handleCustomGenesSubmit = (isXAxis = false) => {
    const customGenesKey = isXAxis ? "customGenesX" : "customGenesY";
    const enteringCustomKey = isXAxis ? "enteringCustomX" : "enteringCustomY";
    const customGenes = this.state[customGenesKey];
    const { onGeneSetChange } = this.props;

    // Parse, deduplicate, and normalize genes
    const genes = [...new Set(
      customGenes
        .split(",")
        .map((g) => g.trim().toUpperCase())
        .filter((g) => g.length > 0)
    )];

    if (genes.length === 0) {
      message.error("Please enter at least one gene.");
      return;
    }

    if (genes.length > 100) {
      message.error(`Maximum 100 genes allowed. You have ${genes.length} genes.`);
      return;
    }

    // Pass custom genes as JSON string to identify it as custom
    if (onGeneSetChange) {
      onGeneSetChange(`custom:${genes.join(",")}`);
      message.success(`Custom gene set applied with ${genes.length} genes.`);
      this.setState({ [enteringCustomKey]: false });
    }
  };

  renderDropdown = (variable, onChange, style = {}, forXAxis = false) => {
    const { onGeneSetChange } = this.props;
    const customGenesKey = forXAxis ? "customGenesX" : "customGenesY";
    const showInputKey = forXAxis ? "showCustomGeneInputX" : "showCustomGeneInputY";
    const enteringCustomKey = forXAxis ? "enteringCustomX" : "enteringCustomY";
    const customGenes = this.state[customGenesKey];
    const showCustomGeneInput = this.state[showInputKey];
    
    const cascaderOptions = this.buildCascaderOptions(forXAxis);
    const cascaderValue = this.getCascaderValue(variable, forXAxis);

    const handleCascaderChange = (values) => {
      if (values.length === 0) return;
      
      // Skip the group level (first value is group key like '_numeric_group')
      const isGroupedSelection = values[0]?.startsWith('_') && values[0]?.endsWith('_group');
      const relevantValues = isGroupedSelection ? values.slice(1) : values;
      
      if (relevantValues.length === 0) return;
      
      const selectedColumn = relevantValues[0];
      
      if (selectedColumn === "driver_gene" && relevantValues.length > 1) {
        if (relevantValues[1] === "custom") {
          onChange(selectedColumn);
          onGeneSetChange("custom:");
          this.setState({ [showInputKey]: true, [customGenesKey]: "", [enteringCustomKey]: true });
        } else {
          onChange(selectedColumn);
          onGeneSetChange(relevantValues[1]);
          this.setState({ [showInputKey]: false, [enteringCustomKey]: false });
        }
      } else {
        onChange(selectedColumn);
        this.setState({ [showInputKey]: false, [enteringCustomKey]: false });
      }
    };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Cascader
          options={cascaderOptions}
          value={cascaderValue}
          onChange={handleCascaderChange}
          size="small"
          style={{ width: 200, ...style }}
          popupMatchSelectWidth={false}
          placeholder="Select axis"
        />
        {showCustomGeneInput && variable === "driver_gene" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 4 }}>
            <Input.TextArea
              placeholder="Enter genes separated by commas (max 100). Example: TP53, BRCA1, EGFR"
              value={customGenes}
              onChange={(e) => this.handleCustomGenesChange(e, forXAxis)}
              rows={3}
              size="small"
              style={{ width: 240 }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => this.handleCustomGenesSubmit(forXAxis)}
                style={{
                  padding: "4px 12px",
                  backgroundColor: "#1890ff",
                  color: "white",
                  border: "none",
                  borderRadius: 2,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 500,
                }}
              >
                Apply
              </button>
              <button
                onClick={() => {
                  this.setState({ [customGenesKey]: "" });
                  onGeneSetChange("custom:");
                }}
                style={{
                  padding: "4px 12px",
                  backgroundColor: "#f0f0f0",
                  color: "#333",
                  border: "1px solid #d9d9d9",
                  borderRadius: 2,
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  renderPairSelector = () => {
    const { filteredRecords = [], selectedPairs, onPairsChange } = this.props;

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
        onChange={onPairsChange}
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
  };

  render() {
    const { xVariable, yVariable, onXChange, onYChange, plotType } = this.props;

    // When onXChange is provided, render x-axis only (for bottom section)
    if (onXChange !== undefined) {
      return (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
          {this.renderDropdown(xVariable, onXChange, {}, true)}
        </div>
      );
    }

    // Top section: just y-axis and pair selector
    return (
      <>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {this.renderDropdown(yVariable, onYChange)}
        </div>

        {plotType === "density" && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {this.renderPairSelector()}
          </div>
        )}
      </>
    );
  }
}

export default AxisSelectors;
