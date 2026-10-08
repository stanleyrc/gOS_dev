import React from "react";
import * as d3 from "d3";

// Small SVG building blocks shared by the cohort panels.

export const PATIENT_PALETTE = ["#4E79A7", "#A0CBE8", "#F28E2B", "#FFBE7D", "#59A14F", "#8CD17D", "#B6992D", "#F1CE63", "#499894", "#86BCB6"];
export const patientColor = (k) => PATIENT_PALETTE[k % PATIENT_PALETTE.length];

export const FONT = { axis: 12, label: 13, title: 14 };

/** Linear y axis with grid lines and a title. */
export function YAxis({ scale, x0, x1, title, ticks = 5, format = d3.format("~s") }) {
  // log scales: only powers of ten (and 2x / 5x when few decades)
  const isLog = typeof scale.base === "function";
  let values = scale.ticks(ticks);
  if (isLog) {
    const [lo, hi] = scale.domain();
    const decades = Math.log10(hi) - Math.log10(lo);
    values = scale.ticks().filter((v) => {
      const m = v / 10 ** Math.floor(Math.log10(v) + 1e-9);
      return Math.abs(m - 1) < 1e-6 || (decades < 2.5 && (Math.abs(m - 2) < 1e-6 || Math.abs(m - 5) < 1e-6));
    });
  }
  return (
    <g>
      {values.map((v) => (
        <g key={v} transform={`translate(0,${scale(v)})`}>
          <line x1={x0} x2={x1} stroke="#f0f0f0" />
          <text x={x0 - 6} dy="0.35em" textAnchor="end" fontSize={FONT.axis} fill="#595959">
            {format(v)}
          </text>
        </g>
      ))}
      {title && (
        <text transform={`translate(${x0 - 44},${(scale.range()[0] + scale.range()[1]) / 2}) rotate(-90)`} textAnchor="middle" fontSize={FONT.label} fill="#262626">
          {title}
        </text>
      )}
    </g>
  );
}

/** Category labels under a band scale; rotated when crowded. */
export function XBandLabels({ scale, y, rotate = false, onClick }) {
  return (
    <g>
      {scale.domain().map((k) => (
        <text
          key={k}
          x={scale(k) + scale.bandwidth() / 2}
          y={y}
          textAnchor={rotate ? "end" : "middle"}
          transform={rotate ? `rotate(-40 ${scale(k) + scale.bandwidth() / 2} ${y})` : undefined}
          fontSize={FONT.label}
          fill="#262626"
          style={{ cursor: onClick ? "pointer" : undefined }}
          onClick={onClick ? () => onClick(k) : undefined}
        >
          {k}
        </text>
      ))}
    </g>
  );
}

/** Legend row of swatches. */
export function Swatches({ items, style }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", fontSize: 12, ...style }}>
      {items.map(({ key, color, label }) => (
        <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 12, height: 12, background: color, borderRadius: 2, display: "inline-block" }} />
          {label}
        </span>
      ))}
    </div>
  );
}

/**
 * Box-and-strip plot of numeric values per group.
 * groups: [{ key, label, color, values: number[] , ids?: string[] }]
 */
export function BoxStrips({ groups, width, height = 220, yTitle, onPoint, log = false, flagged = null }) {
  const M = { top: 12, right: 12, bottom: 56, left: 64 };
  const all = groups.flatMap((g) => g.values).filter(Number.isFinite);
  if (!all.length) return null;
  const lo = log ? Math.max(1e-3, d3.min(all)) : Math.min(0, d3.min(all));
  const y = (log ? d3.scaleLog() : d3.scaleLinear()).domain([lo, d3.max(all) || 1]).nice().range([height - M.bottom, M.top]);
  const x = d3.scaleBand().domain(groups.map((g) => g.key)).range([M.left, width - M.right]).padding(0.3);
  const half = Math.min(28, x.bandwidth() / 2);
  const jitter = (k) => ((((Math.sin(k * 12.9898) * 43758.5453) % 1) + 1) % 1) - 0.5;
  return (
    <svg width={width} height={height}>
      <YAxis scale={y} x0={M.left} x1={width - M.right} title={yTitle} format={d3.format("~g")} />
      {groups.map((g) => {
        const v = g.values.filter(Number.isFinite).sort(d3.ascending);
        if (!v.length) return null;
        const cx = x(g.key) + x.bandwidth() / 2;
        const q1 = d3.quantile(v, 0.25);
        const med = d3.quantile(v, 0.5);
        const q3 = d3.quantile(v, 0.75);
        return (
          <g key={g.key}>
            <rect x={cx - half} y={y(q3)} width={half * 2} height={Math.max(1, y(q1) - y(q3))} fill={g.color} fillOpacity={0.18} stroke={g.color} rx={3} />
            <line x1={cx - half} x2={cx + half} y1={y(med)} y2={y(med)} stroke="#262626" strokeWidth={2} />
            {g.values.map((val, k) =>
              Number.isFinite(val) && (log ? val > 0 : true) ? (
                <circle
                  key={k}
                  cx={cx + jitter(k + 1) * half * 1.6}
                  cy={y(val)}
                  r={flagged && flagged.has(g.ids?.[k]) ? 3.6 : 2.4}
                  fill={flagged && flagged.has(g.ids?.[k]) ? "#cf1322" : g.color}
                  fillOpacity={0.8}
                  stroke={flagged && flagged.has(g.ids?.[k]) ? "#000" : "none"}
                  style={{ cursor: onPoint ? "pointer" : undefined }}
                  onClick={onPoint ? () => onPoint(g, k) : undefined}
                >
                  <title>{`${g.ids?.[k] ?? g.label}: ${d3.format("~g")(val)}`}</title>
                </circle>
              ) : null
            )}
            <title>{`${g.label}: n=${v.length}, median ${d3.format("~g")(med)}, IQR ${d3.format("~g")(q1)}–${d3.format("~g")(q3)}`}</title>
          </g>
        );
      })}
      <XBandLabels scale={x} y={height - M.bottom + 18} rotate={groups.length > 8 || x.bandwidth() < 72} />
    </svg>
  );
}
