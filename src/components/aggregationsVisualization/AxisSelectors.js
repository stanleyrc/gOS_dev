import React, { Component } from "react";
import { Select, Cascader } from "antd";
import { allColumns } from "./helpers";

class AxisSelectors extends Component {
  buildCascaderOptions() {
    const { pathwayMap = {} } = this.props;
    const pathwayNames = Object.keys(pathwayMap);

    return allColumns
      .filter((col) => col.type !== "pair")
      .map((col) => {
        if (col.dataIndex === "driver_gene") {
          const children = [
            { value: "top20", label: "Top 20" },
            ...pathwayNames.map((name) => ({
              value: name,
              label: name.replace(/_/g, " "),
            })),
          ];
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

  renderDropdown = (variable, onChange, style = {}) => {
    const { onGeneSetChange } = this.props;
    const cascaderOptions = this.buildCascaderOptions();
    const cascaderValue = this.getCascaderValue(variable);

    const handleCascaderChange = (values) => {
      if (values.length === 0) return;
      const selectedColumn = values[0];
      if (selectedColumn === "driver_gene" && values.length > 1) {
        onChange(selectedColumn);
        if (onGeneSetChange) {
          onGeneSetChange(values[1]);
        }
      } else {
        onChange(selectedColumn);
      }
    };

    return (
      <Cascader
        options={cascaderOptions}
        value={cascaderValue}
        onChange={handleCascaderChange}
        size="small"
        style={{ width: 200, ...style }}
        popupMatchSelectWidth={false}
        placeholder="Select axis"
      />
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
          {this.renderDropdown(xVariable, onXChange)}
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
