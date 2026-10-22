import React, { useContext, useEffect, useState } from "react";
import { ReactReduxContext } from "react-redux";
import { INK } from "../../helpers/singleCell/plotTheme";
import { figureStyle, formatTick, linearTicks, styleFontSize, styleFontWeight } from "../../helpers/singleCell/figureStyle";
import { useTooltipGuard } from "./useTooltipGuard";

// Axis and text primitives for the single-cell SVG charts, following the chart
// style (helpers/singleCell/figureStyle) chosen in the layout. Kept free of d3
// and usable outside a redux Provider (falls back to the default style), so
// light components and their tests can use them; cohort/charts.js re-exports
// them next to the d3-based building blocks.

/** The chart style from the layout preferences; the default style without a redux store. */
export function useChartStyle() {
  const ctx = useContext(ReactReduxContext);
  const store = ctx && ctx.store;
  const read = () => store?.getState()?.SingleCell?.layout?.figureStyle;
  const [name, setName] = useState(read);
  useEffect(() => {
    if (!store) return undefined;
    setName(read());
    return store.subscribe(() => setName(read()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);
  return figureStyle(name);
}

/**
 * Minimal linear scale (d3-like: call, domain(), range(), ticks(n)) for
 * charts that avoid d3; `clamp` keeps values inside the domain.
 */
export function linearScale([d0, d1], [r0, r1], { clamp = false } = {}) {
  const span = d1 - d0 || 1;
  const scale = (v) => {
    const t = (v - d0) / span;
    return r0 + (clamp ? Math.min(1, Math.max(0, t)) : t) * (r1 - r0);
  };
  scale.domain = () => [d0, d1];
  scale.range = () => [r0, r1];
  scale.ticks = (n = 5) => linearTicks(Math.min(d0, d1), Math.max(d0, d1), n);
  return scale;
}

/** Linear (or log) y axis: grid lines / axis line / ticks per the chart style, and a title. */
export function YAxis({ scale, x0, x1, title, ticks = 5, format = (v) => formatTick(v) }) {
  const st = useChartStyle();
  // log scales: only powers of ten (and 2x / 5x when few decades)
  const isLog = typeof scale.base === "function";
  const [r0, r1] = scale.range();
  // no more ticks than fit at ~22 px apart (small multiples are only ~70 px tall)
  const fit = Math.max(2, Math.floor(Math.abs(r0 - r1) / 22));
  let values = scale.ticks(Math.min(ticks, fit));
  if (isLog) {
    const [lo, hi] = scale.domain();
    const decades = Math.log10(hi) - Math.log10(lo);
    values = scale.ticks().filter((v) => {
      const m = v / 10 ** Math.floor(Math.log10(v) + 1e-9);
      return Math.abs(m - 1) < 1e-6 || (decades < 2.5 && decades * 3 <= fit && (Math.abs(m - 2) < 1e-6 || Math.abs(m - 5) < 1e-6));
    });
    // still crowded: every other power of ten
    if (values.length > fit) values = values.filter((v, i) => (values.length - 1 - i) % 2 === 0);
  }
  const tickFs = styleFontSize(st, "tick");
  const labels = values.map((v) => `${format(v)}`);
  const labelW = Math.max(0, ...labels.map((l) => l.length)) * tickFs * 0.58;
  const axisInk = INK[st.axisInk] || INK.axis;
  return (
    <g>
      {values.map((v, k) => (
        <g key={v} transform={`translate(0,${scale(v)})`}>
          {st.grid !== "none" && <line x1={x0} x2={x1} stroke={INK.grid} strokeDasharray={st.gridDash ? st.gridDash.join(" ") : undefined} />}
          {st.tickLen > 0 && st.axisLine && <line x1={x0 - st.tickLen} x2={x0} stroke={axisInk} />}
          <text x={x0 - st.tickLen - 4} dy="0.35em" textAnchor="end" fontSize={tickFs} fontWeight={styleFontWeight(st, "tick")} fill={INK[st.tickInk] || INK.muted}>
            {labels[k]}
          </text>
        </g>
      ))}
      {st.axisLine && st.grid === "none" && <line x1={x0 + 0.5} x2={x0 + 0.5} y1={r0} y2={r1} stroke={axisInk} strokeWidth={st.axisWidth} />}
      {title && (
        <text transform={`translate(${x0 - st.tickLen - labelW - 14},${(r0 + r1) / 2}) rotate(-90)`} textAnchor="middle" fontSize={styleFontSize(st, "head")} fontWeight={styleFontWeight(st, "head")} fill={INK.textSecondary}>
          {title}
        </text>
      )}
    </g>
  );
}

/** Baseline under a plot area (x axis line), drawn when the chart style has axis lines. */
export function XBaseline({ x0, x1, y }) {
  const st = useChartStyle();
  if (!st.axisLine) return null;
  return <line x1={x0} x2={x1} y1={Math.round(y) + 0.5} y2={Math.round(y) + 0.5} stroke={INK[st.axisInk] || INK.axis} strokeWidth={st.axisWidth} />;
}

/**
 * Linear x axis under a plot (the x twin of YAxis): vertical grid lines up to
 * y1 (omit y1 for none), baseline, tick marks, labels and a title per the
 * chart style. `values` overrides the ticks.
 */
export function XAxis({ scale, y0, y1 = null, title, ticks = 6, values = null, format = (v) => formatTick(v) }) {
  const st = useChartStyle();
  const [r0, r1] = scale.range();
  // no more ticks than fit at ~48 px apart
  const fit = Math.max(2, Math.floor(Math.abs(r1 - r0) / 48));
  const vals = values || scale.ticks(Math.min(ticks, fit));
  const tickFs = styleFontSize(st, "tick");
  const axisInk = INK[st.axisInk] || INK.axis;
  const by = Math.round(y0) + 0.5;
  const labelY = y0 + st.tickLen + 3;
  return (
    <g>
      {vals.map((v) => (
        <g key={v} transform={`translate(${scale(v)},0)`}>
          {st.grid !== "none" && y1 != null && <line y1={y1} y2={y0} stroke={INK.grid} strokeDasharray={st.gridDash ? st.gridDash.join(" ") : undefined} />}
          {st.tickLen > 0 && st.axisLine && <line y1={by} y2={by + st.tickLen} stroke={axisInk} strokeWidth={st.axisWidth} />}
          <text y={labelY} dy="0.8em" textAnchor="middle" fontSize={tickFs} fontWeight={styleFontWeight(st, "tick")} fill={INK[st.tickInk] || INK.muted}>
            {format(v)}
          </text>
        </g>
      ))}
      {st.axisLine && <line x1={Math.min(r0, r1)} x2={Math.max(r0, r1)} y1={by} y2={by} stroke={axisInk} strokeWidth={st.axisWidth} />}
      {title && (
        <text x={(r0 + r1) / 2} y={labelY + tickFs + 8} dy="0.8em" textAnchor="middle" fontSize={styleFontSize(st, "head")} fontWeight={styleFontWeight(st, "head")} fill={INK.textSecondary}>
          {title}
        </text>
      )}
    </g>
  );
}

/** Dashed reference line (thresholds, 50 %, fits) per the chart style, with an optional caption at its end. */
export function RefLine({ x1, x2, y1, y2, label, labelAnchor = "end", opacity = 1 }) {
  const st = useChartStyle();
  const ink = INK[st.refInk] || INK.muted;
  return (
    <g pointerEvents="none">
      <line x1={x1} x2={x2} y1={y1} y2={y2} stroke={ink} strokeOpacity={opacity} strokeDasharray={st.refDash ? st.refDash.join(" ") : undefined} />
      {label && (
        <text x={labelAnchor === "end" ? Math.max(x1, x2) - 4 : Math.min(x1, x2) + 4} y={Math.min(y1, y2) - 4} textAnchor={labelAnchor} fontSize={styleFontSize(st, "caption")} fill={INK.muted}>
          {label}
        </text>
      )}
    </g>
  );
}

/**
 * SVG text attributes per role in the chart style, for text a chart places
 * itself (panel titles, group names, captions): <text {...txt.label}>.
 */
export function useChartText() {
  const st = useChartStyle();
  const role = (r, fill) => ({ fontSize: styleFontSize(st, r), fontWeight: styleFontWeight(st, r), fill });
  return {
    st,
    tick: role("tick", INK[st.tickInk] || INK.muted),
    label: role("label", INK.textSecondary),
    group: role("group", INK.text),
    head: role("head", INK.textSecondary),
    title: role("title", INK.text),
    caption: role("caption", INK.muted),
  };
}

/** Hover card over an SVG chart in the shared tooltip look (.sc-tooltip), at container coordinates. */
export function ChartTooltip({ x, y, children, onDismiss }) {
  const [gone, setGone] = useState(null); // "x,y" at which Escape / scroll hid it; moving the pointer shows it again
  const key = `${x},${y}`;
  const tipRef = useTooltipGuard(gone !== key, () => {
    setGone(key);
    if (onDismiss) onDismiss();
  });
  if (gone === key) return null;
  return (
    <div
      ref={tipRef}
      className="sc-tooltip"
      style={{
        position: "absolute",
        left: x,
        top: y,
        zIndex: 10,
        pointerEvents: "none",
        background: "var(--sc-raised, #fff)",
        color: "var(--sc-text, #1f1f1f)",
        border: "1px solid var(--sc-border, #d9d9d9)",
        borderRadius: 4,
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.18)",
        padding: "6px 9px",
        fontSize: "var(--sc-fs-tick, 11.5px)",
        lineHeight: 1.5,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </div>
  );
}
