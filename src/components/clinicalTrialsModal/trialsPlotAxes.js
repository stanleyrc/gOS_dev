import React, { Component } from "react";
import { PLOT_CONFIG, OUTCOME_TYPES } from "./constants";

class TrialsPlotAxes extends Component {
  render() {
    const {
      xScale,
      yScale,
      containerWidth,
      outcomeType,
      availableOutcomes,
      onOutcomeChange,
    } = this.props;
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

    // Button dimensions and positioning
    const buttonWidth = 42;
    const buttonHeight = 24;
    const buttonGap = 6;
    const totalHeight = OUTCOME_TYPES.length * buttonHeight + (OUTCOME_TYPES.length - 1) * buttonGap;
    const startY = (plotHeight / 2) - (totalHeight / 2);

    return (
      <>
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

        {/* Outcome selector buttons - rendered as HTML for better interaction */}
        <div
          style={{
            position: "absolute",
            left: -44,
            top: startY,
            display: "flex",
            flexDirection: "column",
            gap: buttonGap,
            zIndex: 10,
          }}
        >
          {OUTCOME_TYPES.map((type) => {
            const isSelected = type === outcomeType;
            const hasData = availableOutcomes?.[type] ?? true;
            return (
              <button
                key={type}
                onClick={() => hasData && onOutcomeChange?.(type)}
                disabled={!hasData}
                style={{
                  width: buttonWidth,
                  height: buttonHeight,
                  padding: 0,
                  fontSize: 12,
                  fontWeight: isSelected ? 600 : 400,
                  border: isSelected ? "2px solid #1890ff" : "1px solid #d9d9d9",
                  borderRadius: 3,
                  background: isSelected ? "#e6f7ff" : hasData ? "#fff" : "#f5f5f5",
                  color: hasData ? (isSelected ? "#1890ff" : "#000") : "#bfbfbf",
                  cursor: hasData ? "pointer" : "not-allowed",
                }}
              >
                {type}
              </button>
            );
          })}
        </div>
      </>
    );
  }
}

export default TrialsPlotAxes;
