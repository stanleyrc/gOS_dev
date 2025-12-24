import React, { Component } from "react";
import { Typography } from "antd";
import { TREATMENT_COLORS, SOC_CLASSES } from "./constants";

const { Text } = Typography;

class TrialsPlotLegend extends Component {
  groupByTreatmentClass = (points) => {
    const groups = {};
    points.forEach((p) => {
      if (!groups[p.treatmentClass]) {
        groups[p.treatmentClass] = [];
      }
      groups[p.treatmentClass].push(p);
    });
    return groups;
  };

  render() {
    const { points } = this.props;
    const groups = this.groupByTreatmentClass(points);

    return (
      <div style={{ width: 200, flexShrink: 0 }}>
        <Text strong style={{ marginBottom: 8, display: "block" }}>
          Legend
        </Text>
        {Object.keys(groups).sort().map((className) => {
          const isSoC = SOC_CLASSES.includes(className);
          const color = TREATMENT_COLORS[className] || "#7F8C8D";
          return (
            <div key={className} style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
              <div
                style={{
                  width: 12,
                  height: 12,
                  backgroundColor: isSoC ? "transparent" : color,
                  marginRight: 8,
                  borderRadius: "50%",
                  border: isSoC ? `2px solid ${color}` : "none",
                }}
              />
              <Text style={{ fontSize: 12 }}>{className}{isSoC ? " (SoC)" : ""}</Text>
            </div>
          );
        })}
      </div>
    );
  }
}

export default TrialsPlotLegend;
