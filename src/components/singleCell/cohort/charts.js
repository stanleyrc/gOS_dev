import React from "react";
import * as d3 from "d3";
import { INK, TYPE } from "../../../helpers/singleCell/plotTheme";
import { styleFontSize, styleFontWeight } from "../../../helpers/singleCell/figureStyle";
import { XBaseline, YAxis } from "../chartAxes";
import { boxPointLines, boxSummaryLines, fmtPct } from "../../../helpers/singleCell/plotHover";
import { useFigureStyle } from "../figures/figureCanvas";

// Small SVG building blocks shared by the cohort panels; they follow the
// chart style (helpers/singleCell/figureStyle) chosen in the layout.

export { PATIENT_PALETTE, patientColor } from "../../../helpers/singleCell/patientColors";

export const FONT = { axis: TYPE.tick, label: TYPE.label, title: TYPE.title - 1 };

export { ChartTooltip, RefLine, XAxis, XBaseline, YAxis, useChartStyle, useChartText } from "../chartAxes";

/** Category labels under a band scale; rotated when crowded. */
export function XBandLabels({ scale, y, rotate = false, onClick, labels = null, fontSize }) {
  const st = useFigureStyle();
  const fs = fontSize ?? styleFontSize(st, "label");
  // narrow bands slant steeper so neighbouring names do not overlap (line gap = band x sin(angle))
  const bw = scale.bandwidth();
  const angle = bw < fs * 1.1 ? -90 : bw < fs * 2.2 ? -65 : -40;
  return (
    <g>
      {scale.domain().map((k) => (
        <text
          key={k}
          x={scale(k) + scale.bandwidth() / 2}
          y={y}
          textAnchor={rotate ? "end" : "middle"}
          transform={rotate ? `rotate(${angle} ${scale(k) + scale.bandwidth() / 2} ${y})` : undefined}
          fontSize={fs}
          fontWeight={styleFontWeight(st, "label")}
          fill={INK.textSecondary}
          style={{ cursor: onClick ? "pointer" : undefined }}
          onClick={onClick ? () => onClick(k) : undefined}
        >
          {labels?.[k] ?? k}
        </text>
      ))}
    </g>
  );
}

/** Legend row of swatches. */
export function Swatches({ items, style }) {
  return (
    <div className="sc-fig-legend" style={style}>
      {items.map(({ key, color, label }) => (
        <span key={key} className="sc-fig-legend-item">
          <span style={{ width: 10, height: 10, background: color, borderRadius: 2, display: "inline-block", flex: "none" }} />
          {label}
        </span>
      ))}
    </div>
  );
}

/**
 * Box-and-strip plot of numeric values per group.
 * groups: [{ key, label, color, values: number[] , ids?: string[], bar?: { fraction, title? } }]
 * Hover cards: point = id, group, value with unit, group median and n,
 * outlier flag, click hint (when onPoint is given); box = n of total, median,
 * IQR. `bar` per group draws a share-of-cells bar row aligned under each box.
 * `metric` / `unit` / `noun` / `clickHint` shape the hover text.
 */
export function BoxStrips({ groups, width, height = 220, yTitle, onPoint, log = false, flagged = null, metric, unit = "", noun = "cells", clickHint = "Click to open the cell", barTitle = "Share of cells" }) {
  const M = { top: 12, right: 12, bottom: 30, left: 70 };
  const all = groups.flatMap((g) => g.values).filter(Number.isFinite);
  if (!all.length) return null;
  const lo = log ? Math.max(1e-3, d3.min(all)) : Math.min(0, d3.min(all));
  const x = d3.scaleBand().domain(groups.map((g) => g.key)).range([M.left, width - M.right]).padding(0.3);
  const rotate = groups.length > 8 || x.bandwidth() < 72;
  // slanted group names hang below the axis: grow the svg by their drop instead of squeezing the plot
  const longest = Math.max(0, ...groups.map((g) => `${g.label ?? g.key}`.length));
  const drop = rotate ? Math.min(90, Math.round(longest * 12 * 0.58 * 0.92 + 6)) : 0;
  const hasBars = groups.some((g) => g.bar);
  const BAR_H = 56;
  const svgHeight = height + Math.max(0, drop - (M.bottom - 18)) + (hasBars ? BAR_H + 8 : 0);
  const barTop = svgHeight - BAR_H;
  const y = (log ? d3.scaleLog() : d3.scaleLinear()).domain([lo, d3.max(all) || 1]).nice().range([height - M.bottom, M.top]);
  const half = Math.min(28, x.bandwidth() / 2);
  const jitter = (k) => ((((Math.sin(k * 12.9898) * 43758.5453) % 1) + 1) % 1) - 0.5;
  return (
    <svg width={width} height={svgHeight}>
      <YAxis scale={y} x0={M.left} x1={width - M.right} title={yTitle} />
      <XBaseline x0={M.left} x1={width - M.right} y={height - M.bottom} />
      {groups.map((g) => {
        const v = g.values.filter(Number.isFinite).sort(d3.ascending);
        if (!v.length) return null;
        const cx = x(g.key) + x.bandwidth() / 2;
        const q1 = d3.quantile(v, 0.25);
        const med = d3.quantile(v, 0.5);
        const q3 = d3.quantile(v, 0.75);
        return (
          <g key={g.key}>
            <rect x={cx - half} y={y(q3)} width={half * 2} height={Math.max(1, y(q1) - y(q3))} fill={g.color} fillOpacity={0.14} stroke={g.color} strokeOpacity={0.9} rx={2} />
            <line x1={cx - half} x2={cx + half} y1={y(med)} y2={y(med)} stroke={INK.text} strokeWidth={1.6} />
            {g.values.map((val, k) =>
              Number.isFinite(val) && (log ? val > 0 : true) ? (
                <circle
                  key={k}
                  cx={cx + jitter(k + 1) * half * 1.6}
                  cy={y(val)}
                  r={flagged && flagged.has(g.ids?.[k]) ? 3.4 : 2.2}
                  fill={flagged && flagged.has(g.ids?.[k]) ? INK.danger : g.color}
                  fillOpacity={flagged && flagged.has(g.ids?.[k]) ? 0.85 : 0.72}
                  stroke={flagged && flagged.has(g.ids?.[k]) ? INK.panel : "none"}
                  style={{ cursor: onPoint ? "pointer" : undefined }}
                  onClick={onPoint ? () => onPoint(g, k) : undefined}
                >
                  <title>{boxPointLines({ id: g.ids?.[k], group: g.label ?? g.key, metric: metric || yTitle, value: val, unit, flagged: Boolean(flagged && flagged.has(g.ids?.[k])), median: med, n: v.length, clickHint: onPoint ? clickHint : "" }).join("\n")}</title>
                </circle>
              ) : null
            )}
            <title>{boxSummaryLines({ group: g.label ?? g.key, metric: metric || yTitle, n: v.length, total: g.total, median: med, q1, q3, unit, noun }).join("\n")}</title>
            {g.bar && (
              <g>
                <rect x={cx - half} y={barTop + 18 + (1 - g.bar.fraction) * 34} width={half * 2} height={g.bar.fraction * 34} fill={INK.faint} />
                <text x={cx} y={barTop + 14 + (1 - g.bar.fraction) * 34} textAnchor="middle" fontSize={FONT.axis} fill={INK.text}>{fmtPct(g.bar.fraction)}</text>
                {g.bar.title && <title>{g.bar.title}</title>}
              </g>
            )}
          </g>
        );
      })}
      <XBandLabels scale={x} y={height - M.bottom + 18} rotate={rotate} labels={Object.fromEntries(groups.map((g) => [g.key, g.label ?? g.key]))} />
      <text x={width - M.right} y={M.top - 2} textAnchor="end" fontSize={FONT.axis} fill={INK.muted}>{`box = IQR, line = median${flagged ? ", red = outlier" : ""}`}</text>
      {hasBars && (
        <text x={M.left - 8} y={barTop + 40} textAnchor="end" fontSize={FONT.axis} fill={INK.textSecondary}>{barTitle}</text>
      )}
    </svg>
  );
}
