// Point explorers of paper-figure panels (sidecar data.explorers.<panel>, written by the figure's sidecar script, e.g.
// srctools fig3c_explore.py): one record per printed point (an amplicon, a gained arm, a clade unit ...) with its tooltip
// rows, per-cell copy numbers (histogram + tree-order strip), carriers and links into the patient reports; legend, point
// types to toggle, reference lines and bands. d3-free and unit tested; the component is paper/pointExplorer.js.

import { encodeGroups } from "./savedGroups";

const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const num = (v) => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

function axisOf(a) {
  const r = arr(a?.range).map(Number);
  const log = !!a?.log && r[0] > 0 && r[1] > 0;
  return { label: a?.label ? `${a.label}` : "", log, lo: r[0], hi: r[1], ticks: arr(a?.ticks).map(Number).filter(Number.isFinite) };
}

function pointOf(p) {
  if (!p || p.id == null) return null;
  const x = num(p.mean_cn ?? p.x);
  const y = num(p.var_mean ?? p.y);
  if (x == null || y == null) return null;
  const h = p.hist && typeof p.hist === "object" ? { edges: arr(p.hist.edges).map(Number), counts: arr(p.hist.counts).map(Number), mean: num(p.hist.mean) } : null;
  const s = p.strip && typeof p.strip === "object" ? { cells: arr(p.strip.cells).map(String), cn: arr(p.strip.cn).map(Number), inTree: num(p.strip.in_tree) ?? 0 } : null;
  return {
    ...p,
    id: `${p.id}`,
    kind: `${p.kind || "point"}`,
    tumor: p.tumor == null ? "" : `${p.tumor}`,
    name: p.name == null ? `${p.id}` : `${p.name}`,
    x,
    y,
    shape: `${p.shape || "circle"}`,
    color: p.color ? `${p.color}` : "#888888",
    tooltip: arr(p.tooltip).filter((t) => Array.isArray(t) && t.length >= 2).map(([k, v]) => [`${k}`, v == null ? "not available" : `${v}`]),
    hist: h && h.edges.length === h.counts.length + 1 ? h : null,
    strip: s && s.cells.length === s.cn.length ? s : null,
    carriers: arr(p.carriers).map(String),
    walks: arr(p.walks).filter((w) => w && w.label != null).map((w) => ({ label: `${w.label}`, ncells: num(w.ncells), circular: !!w.circular })),
  };
}

/** Explorer of one panel from a parsed sidecar (sidecar.data.explorers[panel]), normalized; null when absent. */
export function parseExplorer(sidecar, panel) {
  const all = sidecar?.data?.explorers;
  if (!all || typeof all !== "object") return null;
  const want = `${panel}`.toLowerCase();
  const key = Object.keys(all).find((k) => k.toLowerCase() === want);
  const e = key == null ? null : all[key];
  if (!e || typeof e !== "object") return null;
  const points = arr(e.points).map(pointOf).filter(Boolean);
  if (!points.length) return null;
  return {
    panel: key,
    region: e.region == null ? null : `${e.region}`,
    title: e.title ? `${e.title}` : `panel ${key}`,
    x: axisOf(e.x),
    y: axisOf(e.y),
    kinds: arr(e.kinds).filter((k) => k && k.key != null).map((k) => ({ key: `${k.key}`, label: `${k.label ?? k.key}`, default: k.default !== false })),
    legend: arr(e.legend).filter((l) => l && l.label).map((l) => ({ shape: `${l.shape || "circle"}`, color: `${l.color || "#888"}`, stroke: l.stroke ? `${l.stroke}` : null, label: `${l.label}` })),
    lines: arr(e.lines).filter((l) => l && l.id != null).map((l) => ({ id: `${l.id}`, label: `${l.label ?? l.id}`, color: `${l.color || "#777"}`, dash: l.dash ? `${l.dash}` : null, default: l.default !== false, points: arr(l.points).filter((q) => Array.isArray(q) && q.length === 2).map((q) => q.map(Number)) })),
    bands: arr(e.bands).filter((b) => b && b.id != null).map((b) => ({ id: `${b.id}`, label: `${b.label ?? b.id}`, color: `${b.color || "#999"}`, default: !!b.default, x: arr(b.x).map(Number), lo: arr(b.lo).map(Number), hi: arr(b.hi).map(Number) })),
    notes: arr(e.notes).map(String),
    source: e.source ? `${e.source}` : "",
    points,
    byId: new Map(points.map((p) => [p.id, p])),
  };
}

/** Panels of a sidecar that have an explorer (lowercase letters). */
export const explorerPanels = (sidecar) => Object.keys(sidecar?.data?.explorers || {}).map((k) => k.toLowerCase());

/** Default toggle state: { kinds: { key: bool }, lines: { id: bool }, bands: { id: bool }, byTumor: false }. */
export function defaultToggles(ex) {
  return {
    kinds: Object.fromEntries((ex?.kinds || []).map((k) => [k.key, k.default])),
    lines: Object.fromEntries((ex?.lines || []).map((l) => [l.id, l.default])),
    bands: Object.fromEntries((ex?.bands || []).map((b) => [b.id, b.default])),
    byTumor: false,
  };
}

/** Points shown under the toggles (a kind missing from the toggles is shown). */
export const visiblePoints = (ex, toggles) => (ex?.points || []).filter((p) => toggles?.kinds?.[p.kind] !== false);

/** Data value -> fraction 0..1 along an explorer axis (log axes in log10). */
export function axisFrac(ax, v) {
  if (ax.log) return v > 0 ? (Math.log10(v) - Math.log10(ax.lo)) / (Math.log10(ax.hi) - Math.log10(ax.lo)) : NaN;
  return (v - ax.lo) / (ax.hi - ax.lo);
}

/** Scales of a plot box: { sx(v), sy(v) } in px (y down), clamped to the box. */
export function plotScales(ex, box) {
  const clamp = (t) => Math.max(0, Math.min(1, t));
  return {
    sx: (v) => box.x + clamp(axisFrac(ex.x, v)) * box.w,
    sy: (v) => box.y + (1 - clamp(axisFrac(ex.y, v))) * box.h,
  };
}

/** Nearest visible point within tol px of (px, py), else null. */
export function nearestPoint(points, sc, px, py, tol = 8) {
  let best = null;
  points.forEach((p) => {
    const d = Math.hypot(sc.sx(p.x) - px, sc.sy(p.y) - py);
    if (d <= tol && (!best || d < best.d)) best = { d, p };
  });
  return best ? best.p : null;
}

/** Selection after a click on point id: plain click selects only it (or clears it when it is the only one), shift toggles it. */
export function clickSelect(cur, id, shift) {
  const s = arr(cur);
  if (id == null) return shift ? s : [];
  if (shift) return s.includes(id) ? s.filter((x) => x !== id) : [...s, id];
  return s.length === 1 && s[0] === id ? [] : [id];
}

const TUMOR_COLORS = ["#4E79A7", "#F28E2B", "#59A14F", "#E15759", "#76B7B2", "#EDC948", "#B07AA1", "#FF9DA7", "#9C755F", "#BAB0AC"];
/** Stable tumor -> color map (sorted tumor names). */
export function tumorColors(points) {
  const ts = [...new Set((points || []).map((p) => p.tumor).filter(Boolean))].sort();
  return Object.fromEntries(ts.map((t, i) => [t, TUMOR_COLORS[i % TUMOR_COLORS.length]]));
}

/** SVG path of a band (upper edge left to right, lower edge back) under the scales. */
export function bandPath(band, sc) {
  const n = Math.min(band.x.length, band.lo.length, band.hi.length);
  if (n < 2) return "";
  const up = Array.from({ length: n }, (_, i) => `${sc.sx(band.x[i]).toFixed(2)},${sc.sy(band.hi[i]).toFixed(2)}`);
  const dn = Array.from({ length: n }, (_, k) => n - 1 - k).map((i) => `${sc.sx(band.x[i]).toFixed(2)},${sc.sy(band.lo[i]).toFixed(2)}`);
  return `M${up.join("L")}L${dn.join("L")}Z`;
}

/** SVG path of a polyline (data points) under the scales. */
export const linePath = (pts, sc) => (pts.length < 2 ? "" : `M${pts.map(([x, y]) => `${sc.sx(x).toFixed(2)},${sc.sy(y).toFixed(2)}`).join("L")}`);

/** SVG path of a marker shape centred at (x, y) with radius r. */
export function shapePath(shape, x, y, r) {
  const f = (v) => v.toFixed(2);
  if (shape === "tri-up") return `M${f(x)},${f(y - r * 1.15)}L${f(x + r)},${f(y + r * 0.6)}L${f(x - r)},${f(y + r * 0.6)}Z`;
  if (shape === "tri-down") return `M${f(x)},${f(y + r * 1.15)}L${f(x + r)},${f(y - r * 0.6)}L${f(x - r)},${f(y - r * 0.6)}Z`;
  if (shape === "diamond") return `M${f(x)},${f(y - r)}L${f(x + r)},${f(y)}L${f(x)},${f(y + r)}L${f(x - r)},${f(y)}Z`;
  const rr = shape === "dot" ? r * 0.7 : r;
  return `M${f(x - rr)},${f(y)}a${f(rr)},${f(rr)} 0 1,0 ${f(2 * rr)},0a${f(rr)},${f(rr)} 0 1,0 ${f(-2 * rr)},0Z`;
}

/**
 * gOS URL of a point's report: the Single-Cell tab (7) at the point's location with its carrier cells as a saved, selected
 * group (or the ecDNA tab 14 at a walk when `walk` is given). The point's dataset (e.g. the clean one-report-per-patient
 * instance) replaces the current one; other current parameters are dropped.
 */
export function pointUrl(point, { search = "", pathname = "/", walk = null, groupName = null } = {}) {
  if (!point?.report) return null;
  const cur = new URLSearchParams(search);
  const p = new URLSearchParams();
  const ds = point.dataset || cur.get("dataset");
  if (ds) p.set("dataset", ds);
  p.set("report", point.report);
  if (walk) {
    p.set("tab", "14");
    p.set("walk", walk);
  } else {
    p.set("tab", "7");
    if (point.carriers?.length) {
      const name = groupName || `${point.name} carriers (${point.tumor})`;
      p.set("scgroups", encodeGroups({ [point.report]: [{ name, cells: point.carriers }] }));
      p.set("scsel", name);
    }
  }
  if (point.location) p.set("location", point.location);
  return `${pathname}?${p.toString()}`;
}

/** Tab-separated table of the selected points' tooltip rows (one row per point). */
export function pointsTsv(points) {
  if (!points.length) return "";
  const cols = ["id", ...points[0].tooltip.map(([k]) => k)];
  const esc = (v) => (v == null ? "" : `${v}`.replace(/[\t\n\r]/g, " "));
  return [cols.join("\t"), ...points.map((p) => [p.id, ...cols.slice(1).map((c) => p.tooltip.find(([k]) => k === c)?.[1])].map(esc).join("\t"))].join("\n");
}
