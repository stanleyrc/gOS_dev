import React, { Component } from "react";
import { Select } from "antd";
import { PLOT_CONFIG, AXIS_OPTIONS, AXIS_TYPE_TIME, isOutcomeAxis } from "./constants";

class TrialsPlotAxes extends Component {
  getAxisOptions = () => {
    const { axis, otherAxisType, availableOutcomes } = this.props;

    return AXIS_OPTIONS.filter((opt) => {
      // Y-axis cannot be TIME
      if (axis === 'y' && opt.value === AXIS_TYPE_TIME) return false;
      // Exclude the other axis's current value
      if (opt.value === otherAxisType) return false;
      // Check if outcome type has data
      if (isOutcomeAxis(opt.value)) {
        return availableOutcomes?.[opt.value] ?? true;
      }
      return true;
    });
  };

  renderDropdown = () => {
    const { axis, axisType, onAxisChange } = this.props;

    return (
      <Select
        size="small"
        value={axisType}
        onChange={onAxisChange}
        options={this.getAxisOptions()}
        style={{ width: axis === 'y' ? 130 : 120 }}
        dropdownMatchSelectWidth={false}
      />
    );
  };

  renderPlotAxes = () => {
    const { xScale, yScale, containerWidth, xAxisType } = this.props;
    const { HEIGHT: plotHeight, MARGINS: margins } = PLOT_CONFIG;

    const [xMin, xMax] = xScale.domain();
    let xTicks;
    if (xAxisType === AXIS_TYPE_TIME) {
      xTicks = [];
      for (let year = Math.ceil(xMin); year <= Math.floor(xMax); year++) {
        xTicks.push(year);
      }
    } else {
      xTicks = xScale.ticks(8);
    }

    const yTicks = yScale.ticks(8);

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
              {xAxisType === AXIS_TYPE_TIME ? tick : tick.toFixed(0)}
            </text>
          </g>
        ))}

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
    );
  };

  render() {
    const { axis } = this.props;

    if (axis === 'x' || axis === 'y') {
      return this.renderDropdown();
    }

    if (axis === 'plot') {
      return this.renderPlotAxes();
    }

    return null;
  }
}

export default TrialsPlotAxes;
