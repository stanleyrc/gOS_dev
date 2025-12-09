import React, { Component } from "react";

class StackedBarPlot extends Component {
  render() {
    const { config, onBarMouseEnter, onMouseOut } = this.props;
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
            onMouseEnter={(e) => onBarMouseEnter(e, layer, d)}
            onMouseOut={onMouseOut}
            style={{ cursor: "pointer" }}
          />
        ))}
      </g>
    ));
  }
}

export default StackedBarPlot;
