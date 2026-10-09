import React, { useMemo } from "react";
import * as d3 from "d3";
import { Space, Table, Tooltip, Typography } from "antd";
import usePlotTheme from "../usePlotTheme";
import useContainerWidth from "../useContainerWidth";
import { TYPE } from "../../../helpers/singleCell/plotTheme";
import { annotationColors } from "../../../helpers/singleCell/matrix";
import { STORY_SERIES, matrixExtent, stackRows } from "../../../helpers/singleCell/story";

const { Text } = Typography;
const pct = d3.format(".0%");

function Swatch({ color, label }) {
  return (
    <Space size={4} style={{ fontSize: TYPE.tick, marginRight: 10 }}>
      <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: "inline-block" }} />
      <span>{label}</span>
    </Space>
  );
}

/** Horizontal stacked bars, one row per label; categories in fixed order. */
export function StoryBars({ figure }) {
  const theme = usePlotTheme();
  const [ref, width] = useContainerWidth(600);
  const rows = useMemo(() => stackRows(figure), [figure]);
  const cats = figure.categories || [];
  const colors = figure.colorKey === "state" ? annotationColors(cats) : Object.fromEntries(cats.map((c, k) => [c, STORY_SERIES[theme.mode === "dark" ? "dark" : "light"][k % 8]]));
  const left = 96;
  const right = 48;
  const barH = 16;
  const gap = 8;
  const w = Math.max(160, width - left - right);
  const max = figure.normalize ? 1 : d3.max(rows, (r) => r.total) || 1;
  const x = d3.scaleLinear().domain([0, max]).range([0, w]);
  const h = rows.length * (barH + gap) + 22;
  return (
    <div ref={ref}>
      <div style={{ marginBottom: 6 }}>{cats.map((c) => <Swatch key={c} color={colors[c]} label={c} />)}</div>
      <svg width={left + w + right} height={h} role="img" aria-label={figure.xLabel || "stacked bars"}>
        {rows.map((r, i) => (
          <g key={r.label} transform={`translate(0,${i * (barH + gap)})`}>
            <text x={left - 8} y={barH / 2} dy="0.35em" textAnchor="end" fontSize={TYPE.label} fill={theme.textSecondary}>{r.label}</text>
            {r.segments.filter((s) => s.value > 0).map((s) => (
              <Tooltip key={s.category} title={`${r.label} · ${s.category}: ${s.value} (${pct(s.share)})`}>
                <rect x={left + x(s.x0)} y={0} width={Math.max(0.5, x(s.x1) - x(s.x0) - 2)} height={barH} rx={2} fill={colors[s.category]} />
              </Tooltip>
            ))}
            <text x={left + w + 6} y={barH / 2} dy="0.35em" fontSize={TYPE.tick} fill={theme.muted}>{`n=${r.n}`}</text>
          </g>
        ))}
        <g transform={`translate(${left},${rows.length * (barH + gap)})`}>
          {x.ticks(figure.normalize ? 5 : 4).map((tk) => (
            <text key={tk} x={x(tk)} y={10} textAnchor="middle" fontSize={TYPE.tick} fill={theme.muted}>{figure.normalize ? pct(tk) : tk}</text>
          ))}
        </g>
      </svg>
      {figure.xLabel && <Text type="secondary" style={{ fontSize: TYPE.tick }}>{figure.normalize ? `share of ${figure.xLabel}` : figure.xLabel}</Text>}
    </div>
  );
}

/** Scatter of cells (x vs y), coloured by group (clone colours when given). */
export function StoryScatter({ figure, groupColors = {} }) {
  const theme = usePlotTheme();
  const [ref, width] = useContainerWidth(500);
  const pts = figure.points || [];
  const groups = [...new Set(pts.map((p) => p.group))].sort();
  const series = STORY_SERIES[theme.mode === "dark" ? "dark" : "light"];
  const color = (g) => groupColors[g] || series[groups.indexOf(g) % 8];
  const m = { l: 44, r: 12, t: 8, b: 34 };
  const W = Math.min(560, Math.max(260, width));
  const H = 260;
  const x = d3.scaleLinear().domain(d3.extent(pts, (p) => p.x)).nice().range([m.l, W - m.r]);
  const y = d3.scaleLinear().domain(d3.extent(pts, (p) => p.y)).nice().range([H - m.b, m.t]);
  return (
    <div ref={ref}>
      <div style={{ marginBottom: 4 }}>{groups.map((g) => <Swatch key={g} color={color(g)} label={g} />)}</div>
      <svg width={W} height={H} role="img" aria-label={`${figure.yLabel} vs ${figure.xLabel}`}>
        {y.ticks(4).map((tk) => (
          <g key={`y${tk}`}>
            <line x1={m.l} x2={W - m.r} y1={y(tk)} y2={y(tk)} stroke={theme.grid} />
            <text x={m.l - 6} y={y(tk)} dy="0.35em" textAnchor="end" fontSize={TYPE.tick} fill={theme.muted}>{tk}</text>
          </g>
        ))}
        {x.ticks(5).map((tk) => (
          <text key={`x${tk}`} x={x(tk)} y={H - m.b + 14} textAnchor="middle" fontSize={TYPE.tick} fill={theme.muted}>{tk}</text>
        ))}
        {pts.map((p, i) => (
          <circle key={i} cx={x(p.x)} cy={y(p.y)} r={4} fill={color(p.group)} fillOpacity={0.85} stroke={theme.panel} strokeWidth={1.5}>
            <title>{`${p.group}: x ${p.x}, y ${d3.format(".2f")(p.y)}`}</title>
          </circle>
        ))}
        <text x={(m.l + W - m.r) / 2} y={H - 4} textAnchor="middle" fontSize={TYPE.label} fill={theme.textSecondary}>{figure.xLabel}</text>
        <text transform={`translate(11,${(m.t + H - m.b) / 2}) rotate(-90)`} textAnchor="middle" fontSize={TYPE.label} fill={theme.textSecondary}>{figure.yLabel}</text>
      </svg>
    </div>
  );
}

/** Observed statistic vs its permutation null, per row; filled dot = significant. */
export function StoryDots({ figure }) {
  const theme = usePlotTheme();
  const [ref, width] = useContainerWidth(600);
  const rows = figure.rows || [];
  const left = 260;
  const w = Math.max(160, Math.min(420, width - left - 70));
  const x = d3.scaleLinear().domain([Math.min(-0.2, d3.min(rows, (r) => r.null) ?? 0), Math.max(0.8, d3.max(rows, (r) => r.observed) ?? 1)]).nice().range([0, w]);
  const rowH = 18;
  const accent = STORY_SERIES[theme.mode === "dark" ? "dark" : "light"][0];
  return (
    <div ref={ref}>
      <div style={{ marginBottom: 4 }}>
        <Swatch color={accent} label={`p < ${figure.alpha ?? 0.05} (controlled null)`} />
        <Swatch color={theme.empty} label="not significant" />
        <Swatch color={theme.axis} label="null mean" />
      </div>
      <svg width={left + w + 70} height={rows.length * rowH + 24} role="img" aria-label={figure.xLabel}>
        <line x1={left + x(0)} x2={left + x(0)} y1={0} y2={rows.length * rowH} stroke={theme.grid} />
        {rows.map((r, i) => {
          const sig = r.p < (figure.alpha ?? 0.05) && r.observed > r.null;
          return (
            <g key={r.label} transform={`translate(0,${i * rowH})`}>
              <text x={left - 8} y={rowH / 2} dy="0.35em" textAnchor="end" fontSize={TYPE.tick} fill={theme.textSecondary}>{r.label.length > 44 ? `${r.label.slice(0, 43)}…` : r.label}</text>
              <line x1={left + x(r.null)} x2={left + x(r.observed)} y1={rowH / 2} y2={rowH / 2} stroke={theme.axis} strokeWidth={2} />
              <rect x={left + x(r.null) - 1} y={rowH / 2 - 5} width={2} height={10} fill={theme.axis} />
              <circle cx={left + x(r.observed)} cy={rowH / 2} r={5} fill={sig ? accent : theme.empty} stroke={theme.panel} strokeWidth={2}>
                <title>{`${r.label}: observed ${r.observed.toFixed(2)}, null ${r.null.toFixed(2)}, p = ${r.p.toPrecision(2)}`}</title>
              </circle>
              <text x={left + w + 6} y={rowH / 2} dy="0.35em" fontSize={TYPE.tick} fill={theme.muted}>{r.p < 0.001 ? "p<0.001" : `p=${r.p.toFixed(3)}`}</text>
            </g>
          );
        })}
        <g transform={`translate(${left},${rows.length * rowH + 12})`}>
          {x.ticks(5).map((tk) => <text key={tk} x={x(tk)} textAnchor="middle" fontSize={TYPE.tick} fill={theme.muted}>{tk}</text>)}
        </g>
      </svg>
      <Text type="secondary" style={{ fontSize: TYPE.tick }}>{figure.xLabel}</Text>
    </div>
  );
}

/** Rows x columns heatmap; diverging (blue - neutral - red) when figure.diverging. */
export function StoryMatrix({ figure }) {
  const theme = usePlotTheme();
  const rows = figure.rows || [];
  const cols = figure.cols || [];
  const vals = figure.values || [];
  const ext = matrixExtent(vals);
  const pal = STORY_SERIES[theme.mode === "dark" ? "dark" : "light"];
  const color = (v) => {
    if (!Number.isFinite(v)) return theme.panelAlt;
    const t = Math.max(-1, Math.min(1, v / ext));
    return t < 0 ? d3.interpolateLab(theme.empty, pal[0])(-t) : d3.interpolateLab(theme.empty, pal[7])(t);
  };
  const left = 200;
  const cw = 62;
  const ch = 22;
  return (
    <div>
      <svg width={left + cols.length * cw + 8} height={rows.length * ch + 24} role="img" aria-label={figure.valueLabel}>
        {cols.map((c, j) => (
          <text key={c} x={left + j * cw + cw / 2} y={12} textAnchor="middle" fontSize={TYPE.tick} fill={theme.textSecondary}>{c}</text>
        ))}
        {rows.map((r, i) => (
          <g key={r} transform={`translate(0,${20 + i * ch})`}>
            <text x={left - 8} y={ch / 2} dy="0.35em" textAnchor="end" fontSize={TYPE.tick} fill={theme.textSecondary}>{r}</text>
            {cols.map((c, j) => (
              <rect key={c} x={left + j * cw + 1} y={1} width={cw - 2} height={ch - 2} rx={2} fill={color(vals[i]?.[j])}>
                <title>{`${r} · ${c}: ${Number.isFinite(vals[i]?.[j]) ? vals[i][j].toFixed(2) : "not scored"}`}</title>
              </rect>
            ))}
          </g>
        ))}
      </svg>
      <Space size={6} style={{ fontSize: TYPE.tick }}>
        <Text type="secondary" style={{ fontSize: TYPE.tick }}>{`${figure.valueLabel}:`}</Text>
        <Swatch color={color(-ext)} label={`low (${(-ext).toFixed(2)})`} />
        <Swatch color={color(0)} label="0" />
        <Swatch color={color(ext)} label={`high (${ext.toFixed(2)})`} />
      </Space>
    </div>
  );
}

export function StoryTable({ figure }) {
  const columns = (figure.columns || []).map((c, k) => ({ title: c, dataIndex: k, key: k, render: (v) => (typeof v === "number" && !Number.isInteger(v) ? v.toFixed(2) : v) }));
  const data = (figure.rows || []).map((r, i) => ({ key: i, ...Object.fromEntries(r.map((v, k) => [k, v])) }));
  return <Table size="small" columns={columns} dataSource={data} pagination={data.length > 12 ? { pageSize: 12, size: "small" } : false} />;
}

/** The figure of a chapter / vignette, by type. */
export default function StoryFigure({ figure, groupColors }) {
  if (!figure) return null;
  switch (figure.type) {
    case "bars":
      return <StoryBars figure={figure} />;
    case "scatter":
      return <StoryScatter figure={figure} groupColors={groupColors} />;
    case "dots":
      return <StoryDots figure={figure} />;
    case "matrix":
      return <StoryMatrix figure={figure} />;
    case "table":
      return <StoryTable figure={figure} />;
    default:
      return null;
  }
}
