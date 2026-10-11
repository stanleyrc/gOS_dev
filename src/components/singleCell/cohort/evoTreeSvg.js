import React, { useMemo } from "react";
import { TRUNK, eventClassColor, eventMarks, parseTree, treeGeometry } from "../../../helpers/singleCell/alignedTrees";
import { TYPE } from "../../../helpers/singleCell/plotTheme";
import usePlotTheme from "../usePlotTheme";

/**
 * One patient's tumour tree on the cohort's relative evolutionary time axis
 * (x: trunk at the left, single cells at the right; y: tumour cells), with
 * the patient's placed events as marks on their branches. `focus` (a Set of
 * event ids) enlarges and labels those events and fades the rest;
 * `highlights` ([{ node, color }]) shades clades; `strips` ([{ label,
 * values: per leaf, colorOf(value) }]) are per-cell columns right of the tips.
 */
export default function EvoTreeSvg({
  tree,
  events = [],
  width = 260,
  height = 140,
  minSize = 1,
  focus = null,
  highlights = [],
  strips = [],
  stripWidth = 12,
  showAxis = false,
  showLabels = true,
  onEvent,
  title,
}) {
  const theme = usePlotTheme();
  const t = useMemo(() => parseTree(tree), [tree]);
  const geom = useMemo(() => treeGeometry(t, { minSize }), [t, minSize]);
  const marks = useMemo(() => eventMarks(t, events), [t, events]);
  if (!t) return null;
  const stripsW = strips.length ? strips.length * (stripWidth + 2) + 4 : 0;
  const padL = 6;
  const padR = 8 + stripsW;
  const padT = 4;
  const padB = showAxis ? 18 : 4;
  const plotW = Math.max(40, width - padL - padR);
  const plotH = Math.max(20, height - padT - padB);
  const x = (v) => padL + ((v + TRUNK) / (1 + TRUNK)) * plotW;
  const y = (r) => padT + (r / Math.max(1, t.n)) * plotH;
  const hasFocus = focus && focus.size > 0;
  const branch = theme.branch;
  // stack labels of focused truncal events so they do not overprint on the trunk
  const focusRank = new Map();
  if (hasFocus) marks.filter((m) => m.truncal && focus.has(m.id)).forEach((m, k) => focusRank.set(m.id, k));
  const sorted = hasFocus ? [...marks].sort((a, b) => Number(focus.has(a.id)) - Number(focus.has(b.id))) : marks;
  return (
    <svg width={width} height={height} role="img" style={{ display: "block" }}>
      {title && <title>{title}</title>}
      {highlights.map((h) => {
        const n = t.nodes[h.node];
        if (!n) return null;
        const x0 = h.node === 0 ? x(-TRUNK) : x(t.nodes[n.parent].time);
        return <rect key={`h${h.node}-${h.color}`} x={x0} y={y(n.first)} width={x(1) - x0} height={y(n.last + 1) - y(n.first)} fill={h.color} opacity={0.14} />;
      })}
      <g stroke={branch} strokeWidth={1} fill="none">
        {geom.edges.map((e) => (
          <line key={`e${e.node}`} x1={x(e.x0)} x2={x(e.x1)} y1={y(e.y)} y2={y(e.y)} strokeWidth={e.node === 0 ? 2 : 1} />
        ))}
        {geom.connectors.map((c, k) => (
          <line key={`c${k}`} x1={x(c.x)} x2={x(c.x)} y1={y(c.y0)} y2={y(c.y1)} />
        ))}
      </g>
      <g fill={theme.empty} stroke={branch} strokeWidth={0.5}>
        {geom.wedges.map((w) => (
          <polygon key={`w${w.node}`} points={`${x(w.x)},${y(w.y)} ${x(1)},${y(w.y0)} ${x(1)},${y(w.y1)}`} />
        ))}
      </g>
      {sorted.map((m) => {
        const on = hasFocus && focus.has(m.id);
        const faded = hasFocus && !on;
        const r = on ? 5 : 3.2;
        const color = eventClassColor(m.cls, theme.mode);
        const cx = x(m.x);
        const cy = y(m.y);
        return (
          <g key={`m${m.id}`} opacity={faded ? 0.22 : 1} style={{ cursor: onEvent ? "pointer" : "default" }} onClick={onEvent ? () => onEvent(m.id) : undefined}>
            <rect x={cx - r} y={cy - r} width={2 * r} height={2 * r} rx={m.truncal ? 0 : r} fill={color} stroke={theme.panel} strokeWidth={1} />
            {on && showLabels && (
              <text x={cx} y={cy - r - 3 - (m.truncal ? 11 * (focusRank.get(m.id) || 0) : 0)} textAnchor="middle" fontSize={TYPE.tick} fontWeight={600} fill={theme.text} stroke={theme.panel} strokeWidth={3} paintOrder="stroke">
                {m.label}
              </text>
            )}
            <title>{`${m.label}${m.truncal ? " (truncal)" : ""}`}</title>
          </g>
        );
      })}
      {strips.map((s, k) => {
        const sx = padL + plotW + 6 + k * (stripWidth + 2);
        const rowH = plotH / Math.max(1, t.n);
        return (
          <g key={`s${s.label}`}>
            <rect x={sx} y={padT} width={stripWidth} height={plotH} fill={theme.empty} />
            {s.values.map((v, i) =>
              v == null ? null : <rect key={i} x={sx} y={y(i)} width={stripWidth} height={Math.max(rowH, 0.6)} fill={s.colorOf(v)} />
            )}
            <title>{s.label}</title>
          </g>
        );
      })}
      {showAxis && (
        <g fontSize={TYPE.tick} fill={theme.muted}>
          <line x1={x(-TRUNK)} x2={x(1)} y1={height - 14} y2={height - 14} stroke={theme.axis} />
          <text x={x(-TRUNK / 2)} y={height - 3} textAnchor="middle">trunk</text>
          <text x={x(0.5)} y={height - 3} textAnchor="middle">relative time</text>
          <text x={x(1)} y={height - 3} textAnchor="end">tips</text>
        </g>
      )}
      {hasFocus &&
        marks
          .filter((m) => focus.has(m.id))
          .map((m) => {
            const n = t.nodes[m.node];
            return n ? <line key={`f${m.id}`} x1={x(m.x)} x2={x(m.x)} y1={y(n.first)} y2={y(n.last + 1)} stroke={eventClassColor(m.cls, theme.mode)} strokeWidth={1} strokeDasharray="2 2" opacity={0.7} /> : null;
          })}
    </svg>
  );
}
