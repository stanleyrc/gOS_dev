import React, { Component } from "react";
import { Select, Cascader } from "antd";
import { allColumns } from "./helpers";

class AxisSelectors extends Component {
  renderDropdown = (variable, onChange, style = {}) => {
    const cascaderOptions = allColumns
      .filter((col) => col.type !== "pair")
      .map((col) => ({
        value: col.dataIndex,
        label: col.label,
      }));

    const cascaderValue = variable ? [variable] : [];
    const handleCascaderChange = (values) => {
      if (values.length > 0) {
        onChange(values[0]);
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
