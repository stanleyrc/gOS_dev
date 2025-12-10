import React, { Component } from "react";
import { Select, Cascader, Input, message } from "antd";
import { allColumns } from "./helpers";

class AxisSelectors extends Component {
  state = {
    customGenes: "",
    showCustomGeneInput: false,
  };

  buildCascaderOptions(forXAxis = false) {
    const { pathwayMap = {} } = this.props;
    const pathwayNames = Object.keys(pathwayMap);

    const columnsToUse = forXAxis
      ? allColumns
      : allColumns.filter((col) => col.type !== "pair");

    return columnsToUse.map((col) => {
        if (col.dataIndex === "driver_gene") {
          const children = [
            { value: "top20", label: "Top 20" },
            ...pathwayNames.map((name) => ({
              value: name,
              label: name.replace(/_/g, " "),
            })),
          ];
          
          // Only add Custom option for x/y axis selectors
          if (forXAxis) {
            children.push({ value: "custom", label: "Custom" });
          }
          
          return {
            value: col.dataIndex,
            label: col.label,
            children,
          };
        }
        return {
          value: col.dataIndex,
          label: col.label,
        };
      });
  }

  getCascaderValue(variable) {
    const { selectedGeneSet } = this.props;
    if (variable === "driver_gene") {
      return ["driver_gene", selectedGeneSet || "top20"];
    }
    return variable ? [variable] : [];
  }

  handleCustomGenesChange = (e) => {
    const input = e.target.value;
    this.setState({ customGenes: input });

    // Parse and validate genes (deduplicate and normalize)
    const genes = [...new Set(
      input
        .split(",")
        .map((g) => g.trim().toUpperCase())
        .filter((g) => g.length > 0)
    )];

    if (genes.length > 20) {
      message.warning(`Maximum 20 genes allowed. You have ${genes.length} genes.`);
    }
  };

  handleCustomGenesSubmit = () => {
    const { customGenes } = this.state;
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

    if (genes.length > 20) {
      message.error(`Maximum 20 genes allowed. You have ${genes.length} genes.`);
      return;
    }

    // Pass custom genes as JSON string to identify it as custom
    if (onGeneSetChange) {
      onGeneSetChange(`custom:${genes.join(",")}`);
      message.success(`Custom gene set applied with ${genes.length} genes.`);
    }
  };

  renderDropdown = (variable, onChange, style = {}, forXAxis = false) => {
    const { onGeneSetChange } = this.props;
    const { customGenes, showCustomGeneInput } = this.state;
    const cascaderOptions = this.buildCascaderOptions(forXAxis);
    const cascaderValue = this.getCascaderValue(variable);

    const handleCascaderChange = (values) => {
      if (values.length === 0) return;
      const selectedColumn = values[0];
      if (selectedColumn === "driver_gene" && values.length > 1) {
        onChange(selectedColumn);
        if (values[1] === "custom") {
          this.setState({ showCustomGeneInput: true, customGenes: "" });
        } else if (onGeneSetChange) {
          onGeneSetChange(values[1]);
          this.setState({ showCustomGeneInput: false });
        }
      } else {
        onChange(selectedColumn);
        this.setState({ showCustomGeneInput: false });
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
              placeholder="Enter genes separated by commas (max 20). Example: TP53, BRCA1, EGFR"
              value={customGenes}
              onChange={this.handleCustomGenesChange}
              rows={3}
              size="small"
              style={{ width: 240 }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={this.handleCustomGenesSubmit}
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
                onClick={() => this.setState({ showCustomGeneInput: false, customGenes: "" })}
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
