import React, { useMemo, useRef, useState } from "react";
import { Button, Checkbox, Space, Switch, Tag, Typography } from "antd";
import { CloseOutlined, DownloadOutlined, LinkOutlined } from "@ant-design/icons";
import { bandPath, clickSelect, defaultToggles, linePath, nearestPoint, plotScales, pointUrl, pointsTsv, shapePath, tumorColors, visiblePoints } from "../../../helpers/singleCell/paperExplorer";

const { Text } = Typography;
const W = 470;
const H = 380;
const BOX = { x: 58, y: 12, w: W - 72, h: H - 56 };
const tickText = (v) => (v >= 1 ? `${v}` : `${v}`.replace(/^0\./, "0."));

/** One shape glyph (legend, cards). */
function Glyph({ shape, color, stroke, size = 14 }) {
  return (
    <svg width={size} height={size} style={{ verticalAlign: "middle", flex: "none" }} aria-hidden>
      <path d={shapePath(shape, size / 2, size / 2 + (shape === "tri-up" ? 1 : shape === "tri-down" ? -1 : 0), size * 0.36)} fill={color} stroke={stroke || "none"} strokeWidth={stroke ? 1 : 0} />
    </svg>
  );
}

/** Histogram of the per-cell copy numbers with the mean as a dashed line. */
function Histogram({ hist, color }) {
  const w = 300;
  const h = 98;
  const pad = { l: 8, r: 8, t: 6, b: 32 };
  const n = hist.counts.length;
  const top = Math.max(1, ...hist.counts);
  const x0 = hist.edges[0];
  const x1 = hist.edges[n];
  const sx = (v) => pad.l + ((v - x0) / (x1 - x0 || 1)) * (w - pad.l - pad.r);
  const sy = (c) => h - pad.b - (c / top) * (h - pad.t - pad.b);
  return (
    <svg width={w} height={h} role="img" aria-label="copy number per cell">
      {hist.counts.map((c, i) => (c > 0 ? <rect key={i} x={sx(hist.edges[i]) + 0.3} y={sy(c)} width={Math.max(0.8, sx(hist.edges[i + 1]) - sx(hist.edges[i]) - 0.6)} height={h - pad.b - sy(c)} fill={color} opacity={0.9} /> : null))}
      <line x1={pad.l} x2={w - pad.r} y1={h - pad.b} y2={h - pad.b} stroke="#444" strokeWidth={0.8} />
      {hist.mean != null && <line x1={sx(hist.mean)} x2={sx(hist.mean)} y1={pad.t} y2={h - pad.b} stroke="#222" strokeDasharray="3 2" strokeWidth={1} />}
      <text x={pad.l} y={h - pad.b + 11} fontSize={10} fill="#444">{x0}</text>
      <text x={w - pad.r} y={h - pad.b + 11} fontSize={10} fill="#444" textAnchor="end">{x1}</text>
      <text x={w / 2} y={h - 3} fontSize={10} fill="#444" textAnchor="middle">{`copy number per cell · max bar ${top} cells · dashed = mean ${hist.mean}`}</text>
    </svg>
  );
}

/** The cells' copy number in tree order (one bar per cell; cells not on the report's tree at the right, grey). */
function TreeStrip({ strip, color }) {
  const w = 300;
  const h = 56;
  const n = strip.cells.length;
  if (!n) return null;
  const top = Math.max(1e-9, ...strip.cn);
  const bw = (w - 8) / n;
  return (
    <svg width={w} height={h} role="img" aria-label="copy number in tree order">
      {strip.cn.map((v, i) => (
        <rect key={i} x={4 + i * bw} y={h - 14 - (v / top) * (h - 20)} width={Math.max(0.6, bw - (bw > 2 ? 0.4 : 0))} height={(v / top) * (h - 20)} fill={i < strip.inTree ? color : "#bbb"}>
          <title>{`${strip.cells[i]} · ${v}`}</title>
        </rect>
      ))}
      <line x1={4} x2={w - 4} y1={h - 14} y2={h - 14} stroke="#444" strokeWidth={0.8} />
      <text x={4} y={h - 2} fontSize={10} fill="#444">{`cells in tree order (${strip.inTree} on the tree${n > strip.inTree ? `, ${n - strip.inTree} off it in grey` : ""}) · bar max ${Math.round(top * 10) / 10}`}</text>
    </svg>
  );
}

function PointCard({ p, onClose }) {
  const search = typeof window !== "undefined" ? window.location.search : "";
  const pathname = typeof window !== "undefined" ? window.location.pathname : "/";
  const url = pointUrl(p, { search, pathname });
  return (
    <div className="sc-ptexp-card" data-testid="point-card">
      <div className="sc-ptexp-cardhead">
        <Glyph shape={p.shape} color={p.color} stroke={p.shape.startsWith("tri") ? "#222" : null} />
        <b>{p.name}</b>
        <Tag style={{ marginInlineEnd: 0 }}>{p.tumor}</Tag>
        <span style={{ flex: 1 }} />
        <Button size="small" type="text" icon={<CloseOutlined />} aria-label="Remove from the selection" onClick={onClose} />
      </div>
      <table className="sc-ptexp-table">
        <tbody>
          {p.tooltip.map(([k, v]) => (
            <tr key={k}>
              <td>{k}</td>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {p.hist ? <Histogram hist={p.hist} color={p.color} /> : <Text type="secondary">histogram not available (no per-cell values)</Text>}
      {p.strip ? <TreeStrip strip={p.strip} color={p.color} /> : null}
      {p.n_not_in_report > 0 && <div className="sc-ptexp-note">{`${p.n_not_in_report} of these cells are in the caller's input but not in the ${p.report} report (kept in the histogram, not in the link).`}</div>}
      <div className="sc-ptexp-links">
        {url && (
          <Button size="small" type="primary" icon={<LinkOutlined />} href={url} target="_blank" rel="noopener noreferrer">
            {`${p.report}: Single-Cell tab at the segment, ${p.carriers.length} ${p.kind === "arm" ? "cells" : "carriers"} selected`}
          </Button>
        )}
        {p.walks.map((w) => (
          <Button key={w.label} size="small" icon={<LinkOutlined />} href={pointUrl(p, { search, pathname, walk: w.label })} target="_blank" rel="noopener noreferrer">
            {`walk ${w.label}${w.ncells != null ? ` (${w.ncells} cells)` : ""}${w.circular ? " · circular" : ""}`}
          </Button>
        ))}
        {p.kind === "amplicon" && !p.walks.length && <Text type="secondary">no curated walk over this segment in the report</Text>}
      </div>
    </div>
  );
}

/**
 * Interactive re-draw of a paper scatter panel from its sidecar explorer (paperExplorer.parseExplorer): every point hoverable
 * (tooltip with the panel's numbers), click / shift-click to select, a side panel per selected point (per-cell histogram,
 * tree-order strip, links into the report and its walks), an always-visible legend, toggles for point types, color by tumor,
 * and the reference lines / bands. selected / onSelect: point ids (shared with the printed panel's clicks).
 */
export default function PointExplorer({ explorer: ex, selected, onSelect, onClose, label }) {
  const [toggles, setToggles] = useState(() => defaultToggles(ex));
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);
  const sc = useMemo(() => plotScales(ex, BOX), [ex]);
  const shown = visiblePoints(ex, toggles);
  const tcol = useMemo(() => tumorColors(ex.points), [ex]);
  const fill = (p) => (toggles.byTumor ? tcol[p.tumor] || "#888" : p.color);
  const sel = new Set(selected);
  const at = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const order = [...shown].sort((a, b) => Number(sel.has(a.id)) - Number(sel.has(b.id)) || Number(a.kind === "amplicon") - Number(b.kind === "amplicon"));
  const cards = selected.map((id) => ex.byId.get(id)).filter(Boolean);
  const download = () => {
    const blob = new Blob([pointsTsv(cards.length ? cards : shown)], { type: "text/tab-separated-values;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${label || "panel"}_points.tsv`.replace(/\s+/g, "_");
    a.click();
  };
  return (
    <div className="sc-ptexp" data-testid="point-explorer">
      <div className="sc-paperlive-head">
        <b>{`${ex.title} · explore`}</b>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {" hover a point for its numbers · click selects · shift-click adds · the side panel shows each selected point's cells and links"}
        </Text>
        <span style={{ flex: 1 }} />
        <Button size="small" icon={<DownloadOutlined />} onClick={download}>
          {cards.length ? `TSV (${cards.length} selected)` : `TSV (${shown.length} shown)`}
        </Button>
        {cards.length > 0 && (
          <Button size="small" onClick={() => onSelect([])}>
            Clear selection
          </Button>
        )}
        <Button size="small" onClick={onClose}>
          Back to the printed panel
        </Button>
      </div>
      <div className="sc-ptexp-controls">
        <Text strong style={{ fontSize: 12 }}>Show</Text>
        {ex.kinds.map((k) => (
          <Checkbox key={k.key} checked={toggles.kinds[k.key] !== false} onChange={(e) => setToggles((t) => ({ ...t, kinds: { ...t.kinds, [k.key]: e.target.checked } }))}>
            {`${k.label} (${ex.points.filter((p) => p.kind === k.key).length})`}
          </Checkbox>
        ))}
        <span className="sc-ptexp-sep" />
        <Space size={4}>
          <Switch size="small" checked={toggles.byTumor} onChange={(v) => setToggles((t) => ({ ...t, byTumor: v }))} />
          <Text style={{ fontSize: 12 }}>Color by tumor</Text>
        </Space>
        <span className="sc-ptexp-sep" />
        {ex.lines.map((l) => (
          <Checkbox key={l.id} checked={!!toggles.lines[l.id]} onChange={(e) => setToggles((t) => ({ ...t, lines: { ...t.lines, [l.id]: e.target.checked } }))}>
            <span style={{ fontSize: 12 }}>{l.label}</span>
          </Checkbox>
        ))}
        {ex.bands.map((b) => (
          <Checkbox key={b.id} checked={!!toggles.bands[b.id]} onChange={(e) => setToggles((t) => ({ ...t, bands: { ...t.bands, [b.id]: e.target.checked } }))}>
            <span style={{ fontSize: 12 }}>{b.label}</span>
          </Checkbox>
        ))}
      </div>
      <div className="sc-ptexp-body">
        <div className="sc-ptexp-plot" style={{ position: "relative", width: W }}>
          <svg
            ref={svgRef}
            width={W}
            height={H}
            style={{ display: "block", cursor: hover ? "pointer" : "default", background: "#fff" }}
            onMouseMove={(e) => {
              const [x, y] = at(e);
              const p = nearestPoint(shown, sc, x, y, 8);
              setHover(p ? { p, x, y } : null);
            }}
            onMouseLeave={() => setHover(null)}
            onClick={(e) => {
              const [x, y] = at(e);
              const p = nearestPoint(shown, sc, x, y, 8);
              onSelect(clickSelect(selected, p ? p.id : null, e.shiftKey));
            }}
          >
            <rect x={BOX.x} y={BOX.y} width={BOX.w} height={BOX.h} fill="none" stroke="#444" strokeWidth={0.8} />
            {ex.x.ticks.map((t) => (
              <g key={`x${t}`}>
                <line x1={sc.sx(t)} x2={sc.sx(t)} y1={BOX.y + BOX.h} y2={BOX.y + BOX.h + 4} stroke="#444" />
                <line x1={sc.sx(t)} x2={sc.sx(t)} y1={BOX.y} y2={BOX.y + BOX.h} stroke="#eee" />
                <text x={sc.sx(t)} y={BOX.y + BOX.h + 16} fontSize={11} textAnchor="middle" fill="#333">{tickText(t)}</text>
              </g>
            ))}
            {ex.y.ticks.map((t) => (
              <g key={`y${t}`}>
                <line x1={BOX.x - 4} x2={BOX.x} y1={sc.sy(t)} y2={sc.sy(t)} stroke="#444" />
                <line x1={BOX.x} x2={BOX.x + BOX.w} y1={sc.sy(t)} y2={sc.sy(t)} stroke="#eee" />
                <text x={BOX.x - 6} y={sc.sy(t) + 4} fontSize={11} textAnchor="end" fill="#333">{tickText(t)}</text>
              </g>
            ))}
            <text x={BOX.x + BOX.w / 2} y={H - 6} fontSize={12} textAnchor="middle" fill="#222">{ex.x.label}</text>
            <text transform={`translate(14,${BOX.y + BOX.h / 2}) rotate(-90)`} fontSize={12} textAnchor="middle" fill="#222">{ex.y.label}</text>
            <clipPath id="sc-ptexp-clip">
              <rect x={BOX.x} y={BOX.y} width={BOX.w} height={BOX.h} />
            </clipPath>
            <g clipPath="url(#sc-ptexp-clip)">
              {ex.bands.filter((b) => toggles.bands[b.id]).map((b) => (
                <path key={b.id} d={bandPath(b, sc)} fill={b.color} opacity={0.25} stroke={b.color} strokeWidth={0.6}>
                  <title>{b.label}</title>
                </path>
              ))}
              {ex.lines.filter((l) => toggles.lines[l.id]).map((l) => (
                <path key={l.id} d={linePath(l.points, sc)} fill="none" stroke={l.color} strokeWidth={1.2} strokeDasharray={l.dash || undefined} />
              ))}
              {order.map((p) => {
                const on = sel.has(p.id);
                const hov = hover?.p.id === p.id;
                const r = p.kind === "amplicon" ? 5.2 : p.kind === "unit" ? 4.6 : 3.8;
                const tri = p.shape.startsWith("tri");
                return (
                  <g key={p.id}>
                    <path d={shapePath(p.shape, sc.sx(p.x), sc.sy(p.y), r)} fill={fill(p)} stroke={tri ? "#222" : "#fff"} strokeWidth={tri ? 0.9 : 0.6} />
                    {(on || hov) && <circle cx={sc.sx(p.x)} cy={sc.sy(p.y)} r={r + 3.5} fill="none" stroke={on ? "#1677ff" : "#222"} strokeWidth={on ? 2 : 1} />}
                  </g>
                );
              })}
            </g>
          </svg>
          {hover && (
            <div className="sc-tooltip" style={{ position: "absolute", left: Math.min(hover.x + 14, W - 250), top: hover.y + 14, maxWidth: 320, pointerEvents: "none", zIndex: 8 }}>
              <div style={{ fontWeight: 600 }}>{hover.p.name}</div>
              {hover.p.tooltip.map(([k, v]) => (
                <div key={k}>{`${k}: ${v}`}</div>
              ))}
              <div style={{ opacity: 0.8 }}>{sel.has(hover.p.id) ? "click to unselect · shift-click keeps the others" : "click to select · shift-click adds"}</div>
            </div>
          )}
          <div className="sc-ptexp-legend" data-testid="point-legend">
            {ex.legend.map((l) => (
              <div key={l.label} className="sc-ptexp-legrow">
                <Glyph shape={l.shape} color={l.color} stroke={l.stroke} />
                <span>{l.label}</span>
              </div>
            ))}
            {toggles.byTumor && (
              <div className="sc-ptexp-legrow" style={{ flexWrap: "wrap", gap: 6 }}>
                {Object.entries(tcol).map(([t, c]) => (
                  <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 5, background: c, display: "inline-block" }} />
                    {t}
                  </span>
                ))}
                <span style={{ opacity: 0.8 }}>(shapes as above; fill = tumor)</span>
              </div>
            )}
            {ex.notes.map((n) => (
              <div key={n} className="sc-ptexp-note">{n}</div>
            ))}
          </div>
        </div>
        <div className="sc-ptexp-side" data-testid="point-side-panel">
          {cards.length ? (
            cards.map((p) => <PointCard key={p.id} p={p} onClose={() => onSelect(selected.filter((x) => x !== p.id))} />)
          ) : (
            <Text type="secondary">Click a point (here or on the printed panel) to see its cells: the per-cell copy-number histogram, the copy number along the tree, and links into the tumor's report at the segment with the carriers selected. Shift-click adds points.</Text>
          )}
        </div>
      </div>
    </div>
  );
}
