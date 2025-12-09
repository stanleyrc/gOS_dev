import React, { Component } from "react";
import HistogramPlot from "../histogramPlot";

class DensityPlot extends Component {
  render() {
    const { config, markers } = this.props;
    const { panelWidth, panelHeight, densityData, q1, q3, q99, range, bandwidth, format } = config;

    if (!densityData || densityData.length === 0) {
      return (
        <text x={panelWidth / 2} y={panelHeight / 2} textAnchor="middle" fill="#999">
          No data available
        </text>
      );
    }

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
}

export default DensityPlot;
