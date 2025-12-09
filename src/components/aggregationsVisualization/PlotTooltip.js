import React, { Component } from "react";
import * as d3 from "d3";
import { measureText } from "../../helpers/utility";

class PlotTooltip extends Component {
  render() {
    const { visible, x, y, text } = this.props;

    if (!visible || !text || text.length === 0) {
      return null;
    }

    return (
      <g transform={`translate(${x}, ${y})`} pointerEvents="none">
        <rect
          x={0}
          y={0}
          width={d3.max(text, (d) => measureText(`${d.label}: ${d.value}`, 12) + 30)}
          height={text.length * 16 + 12}
          rx={5}
          ry={5}
          fill="rgb(97, 97, 97)"
          fillOpacity={0.9}
        />
        <text x={10} y={18} fontSize={12} fill="#FFF">
          {text.map((d, i) => (
            <tspan key={i} x={10} y={18 + i * 16}>
              <tspan fontWeight="bold">{d.label}</tspan>: {d.value}
            </tspan>
          ))}
        </text>
      </g>
    );
  }
}

export default PlotTooltip;
