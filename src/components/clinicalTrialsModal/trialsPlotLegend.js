import React, { Component } from "react";
import { Typography, Select } from "antd";
import { COLOR_BY_OPTIONS, SOC_CLASSES } from "./constants";

const { Text } = Typography;

class TrialsPlotLegend extends Component {
  groupByColorValue = (points) => {
    const { getColorValue } = this.props;
    const groups = {};
    points.forEach((p) => {
      const value = getColorValue(p);
      if (!groups[value]) {
        groups[value] = [];
      }
      groups[value].push(p);
    });
    return groups;
  };

  renderLegendItem = (value, colorScale, showSocIndicator, compact = false) => {
    const isSoC = showSocIndicator && SOC_CLASSES.includes(value);
    const color = colorScale(value);
    return (
      <div key={value} style={{ display: "flex", alignItems: "center", marginBottom: 3 }}>
        <div
          style={{
            width: compact ? 8 : 10,
            height: compact ? 8 : 10,
            backgroundColor: isSoC ? "transparent" : color,
            marginRight: compact ? 4 : 6,
            borderRadius: "50%",
            border: isSoC ? `2px solid ${color}` : "none",
            flexShrink: 0,
          }}
        />
        <Text
          style={{ fontSize: compact ? 10 : 11, lineHeight: 1.2 }}
          ellipsis={{ tooltip: value }}
        >
          {value}{isSoC ? " (SoC)" : ""}
        </Text>
      </div>
    );
  };

  render() {
    const { points, colorBy, onColorByChange, colorScale } = this.props;
    const groups = this.groupByColorValue(points);
    const sortedKeys = Object.keys(groups).sort();

    // Only show SoC indicator for treatment class view
    const showSocIndicator = colorBy === 'treatmentClass';

    // Use two columns for cancer type (typically many values)
    const useTwoColumns = colorBy === 'cancerType' && sortedKeys.length > 6;

    return (
      <div style={{ width: 160, flexShrink: 0 }}>
        <div style={{ marginBottom: 12 }}>
          <Text strong style={{ marginBottom: 4, display: "block", fontSize: 12 }}>
            Color by
          </Text>
          <Select
            value={colorBy}
            options={COLOR_BY_OPTIONS}
            onChange={onColorByChange}
            size="small"
            style={{ width: 140 }}
          />
        </div>
        <Text strong style={{ marginBottom: 8, display: "block" }}>
          Legend
        </Text>
        {useTwoColumns ? (
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {sortedKeys.slice(0, Math.ceil(sortedKeys.length / 2)).map((value) =>
                this.renderLegendItem(value, colorScale, showSocIndicator, true)
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {sortedKeys.slice(Math.ceil(sortedKeys.length / 2)).map((value) =>
                this.renderLegendItem(value, colorScale, showSocIndicator, true)
              )}
            </div>
          </div>
        ) : (
          sortedKeys.map((value) => this.renderLegendItem(value, colorScale, showSocIndicator))
        )}
      </div>
    );
  }
}

export default TrialsPlotLegend;
