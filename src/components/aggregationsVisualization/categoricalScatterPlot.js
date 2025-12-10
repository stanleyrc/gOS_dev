import React, { Component } from "react";
import { getColumnType } from "./helpers";

class CategoricalScatterPlot extends Component {
  render() {
    const { config, xVariable, onMouseEnter, onMouseOut } = this.props;
    const { xScale, yScale, categoryData } = config;
    const xType = getColumnType(xVariable);

    return categoryData.map((d, i) => {
      if (xType === "categorical") {
        const cx = xScale(d.category) + xScale.bandwidth() / 2;
        const cy = yScale(d.mean);
        const errorTop = yScale(d.mean + d.stdErr);
        const errorBottom = yScale(d.mean - d.stdErr);

        return (
          <g key={d.category}>
            <line
              x1={cx}
              x2={cx}
              y1={errorTop}
              y2={errorBottom}
              stroke="#666"
              strokeWidth={1.5}
            />
            <line x1={cx - 4} x2={cx + 4} y1={errorTop} y2={errorTop} stroke="#666" strokeWidth={1.5} />
            <line x1={cx - 4} x2={cx + 4} y1={errorBottom} y2={errorBottom} stroke="#666" strokeWidth={1.5} />
            <circle
              cx={cx}
              cy={cy}
              r={6}
              fill="#1890ff"
              stroke="white"
              strokeWidth={1}
              onMouseEnter={(e) => onMouseEnter(e, d, i)}
              onMouseOut={onMouseOut}
              style={{ cursor: "pointer" }}
            />
          </g>
        );
      } else {
        const cx = xScale(d.mean);
        const cy = yScale(d.category) + yScale.bandwidth() / 2;
        const errorLeft = xScale(d.mean - d.stdErr);
        const errorRight = xScale(d.mean + d.stdErr);

        return (
          <g key={d.category}>
            <line
              x1={errorLeft}
              x2={errorRight}
              y1={cy}
              y2={cy}
              stroke="#666"
              strokeWidth={1.5}
            />
            <line x1={errorLeft} x2={errorLeft} y1={cy - 4} y2={cy + 4} stroke="#666" strokeWidth={1.5} />
            <line x1={errorRight} x2={errorRight} y1={cy - 4} y2={cy + 4} stroke="#666" strokeWidth={1.5} />
            <circle
              cx={cx}
              cy={cy}
              r={6}
              fill="#1890ff"
              stroke="white"
              strokeWidth={1}
              onMouseEnter={(e) => onMouseEnter(e, d, i)}
              onMouseOut={onMouseOut}
              style={{ cursor: "pointer" }}
            />
          </g>
        );
      }
    });
  }
}

export default CategoricalScatterPlot;
