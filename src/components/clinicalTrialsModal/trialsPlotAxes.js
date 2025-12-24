import React, { Component } from "react";
import { PLOT_CONFIG } from "./constants";

class TrialsPlotAxes extends Component {
  render() {
    const { xScale, yScale, containerWidth, outcomeType } = this.props;
    const { HEIGHT: plotHeight, MARGINS: margins } = PLOT_CONFIG;

    // Generate only integer year ticks
    const [xMin, xMax] = xScale.domain();
    const xTicks = [];
    const startYear = Math.ceil(xMin);
    const endYear = Math.floor(xMax);
    for (let year = startYear; year <= endYear; year++) {
      xTicks.push(year);
    }

    const yTicks = yScale.ticks(8);
    const isORR = outcomeType === "ORR";
    const yLabel = isORR ? `${outcomeType} (%)` : `${outcomeType} (months)`;

    return (
      <svg
        width={containerWidth}
        height={plotHeight}
        style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
      >
        {xTicks.map((tick) => (
          <g key={`x-${tick}`} transform={`translate(${xScale(tick)}, ${plotHeight - margins.bottom})`}>
            <line y2="6" stroke="#000" />
            <text y="20" textAnchor="middle" style={{ fontSize: 11 }}>
              {tick}
            </text>
          </g>
        ))}
        <text
          x={containerWidth / 2}
          y={plotHeight - 5}
          textAnchor="middle"
          style={{ fontSize: 12 }}
        >
          Completion Year
        </text>

        {yTicks.map((tick) => (
          <g key={`y-${tick}`} transform={`translate(${margins.left}, ${yScale(tick)})`}>
            <line x2="-6" stroke="#000" />
            <text x="-10" dy="0.32em" textAnchor="end" style={{ fontSize: 11 }}>
              {tick}
            </text>
          </g>
        ))}
        <text
          transform={`translate(15, ${plotHeight / 2}) rotate(-90)`}
          textAnchor="middle"
          style={{ fontSize: 12 }}
        >
          {yLabel}
        </text>

        <line
          x1={margins.left}
          y1={plotHeight - margins.bottom}
          x2={containerWidth - margins.right}
          y2={plotHeight - margins.bottom}
          stroke="#000"
        />
        <line
          x1={margins.left}
          y1={margins.top}
          x2={margins.left}
          y2={plotHeight - margins.bottom}
          stroke="#000"
        />
      </svg>
    );
  }
}

export default TrialsPlotAxes;
