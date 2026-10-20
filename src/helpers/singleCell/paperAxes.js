// Zoom axes and in-figure controls of the paper-figure tabs (d3-free; logic only).
//
// Zoom: each sidecar region has a zoom axis, "x" | "y" | "xy" | "none": the sidecar's own `zoom` field, else a default
// from the kind of panel. Matrices next to a phylogeny (SNV columns, CN / genome heatmaps) and genome tracks zoom along
// the columns only, so rows (and the tree) stay fixed, as on the single-cell page; scatter / UMAP / spatial plots are free.
//
// Controls: where a panel is a choice of patient / gene / clade, the tab renders the live control in the figure.
// Controls come from the sidecar (`controls`), from a built-in registry for panels whose R code does not declare one yet,
// and from the identifying fields of the marks (patient, gene, clade): then the control highlights those marks.
import { toPage } from "./paperSidecar";

export const ZOOM_LABEL = { x: "horizontal zoom (columns / genome)", y: "vertical zoom", xy: "free zoom", none: "no zoom" };

/** The zoom axis of a region: sidecar `zoom`, else by panel type. */
export function regionZoom(region) {
  if (!region) return "xy";
  if (region.zoom) return region.zoom;
  if (region.kind === "rows") {
    if (region.cols?.ids?.length) return "x"; // SNV matrix: columns = mutations
    if (region.axis?.type === "genome") return "x"; // CN heatmap / genome tracks
    return "none"; // categorical strip beside a tree: follows its rows, nothing to zoom
  }
  return "xy"; // scatter, UMAP, spatial and other plots
}

const area = (r) => r.w * r.h;
/** The region under a page point, rows regions first, then the smallest. */
export function regionAtPoint(sidecar, x, y) {
  const hit = (sidecar?.regions || []).filter((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  hit.sort((a, b) => (a.kind === "rows" ? 0 : 1) - (b.kind === "rows" ? 0 : 1) || area(a) - area(b));
  return hit[0] || null;
}

/**
 * What a wheel / pinch at a page point zooms: { mode, rect, region } with the rectangle the zoom is clipped to.
 * One-axis zooms clip to the region (labels, rows and the tree outside it stay fixed); free zoom keeps the whole panel
 * (axes included). Points outside every region fall back to the panel rectangle with free zoom. null: nothing zooms there.
 */
export function zoomTarget(sidecar, x, y, panelRect) {
  const region = regionAtPoint(sidecar, x, y);
  const mode = region ? regionZoom(region) : "xy";
  if (mode === "none") return null;
  if (!region || mode === "xy") return panelRect ? { mode, rect: panelRect, region } : null;
  return { mode, rect: { x: region.x, y: region.y, w: region.w, h: region.h }, region };
}

/** Zoom axis of every region of a panel letter: [{ id, kind, zoom }] (for the audit). */
export function panelZooms(sidecar, letter) {
  const want = `${letter}`.toLowerCase();
  return (sidecar?.regions || []).filter((r) => `${r.panel ?? ""}`.toLowerCase() === want).map((r) => ({ id: r.id, kind: r.kind, zoom: regionZoom(r) }));
}

// ---- controls

const FIELD_CONTROLS = [
  ["patient", "patient"],
  ["gene", "gene"],
  ["clade", "clade"],
];
const MAX_OPTIONS = 60;

function distinct(values) {
  return [...new Set(values.filter((v) => v != null && `${v}` !== "").map(String))];
}

/** Controls the sidecar's marks support on their own: one per panel and id field (patient, gene, clade) with 2..60 values. */
export function fieldControls(sidecar) {
  const byPanel = new Map();
  (sidecar?.regions || []).forEach((r) => {
    if (r.kind !== "plot" || !r.panel) return;
    r.marks.forEach((m) => {
      FIELD_CONTROLS.forEach(([field, type]) => {
        const f = m.fields[field];
        if (!f) return;
        const key = `${r.panel}|${type}`;
        byPanel.set(key, [...(byPanel.get(key) || []), ...f]);
      });
    });
  });
  const out = [];
  byPanel.forEach((vals, key) => {
    const [panel, type] = key.split("|");
    const options = distinct(vals).sort();
    if (options.length >= 2 && options.length <= MAX_OPTIONS) out.push({ panel, type, field: type, options, default: null, source: null, label: null });
  });
  return out;
}

/** Controls for panels whose figure script does not declare any yet: figure id -> [control]. */
export const BUILTIN_CONTROLS = {
  // Fig 1e: every RNA cell in the state quadrant; pick a patient to see its cells (live from rna/state_scores.json)
  Figure1: [{ panel: "e", type: "patient", field: "patient", options: null, default: null, source: "state_scores", label: "Patient" }],
};

/**
 * Patient-view controls: panels built from one patient's rows (tree, SNV / CN matrices, strips) get a live switcher
 * that opens any patient in the gOS patient figure (the same components), since the PDF shows only the one patient.
 */
export function patientViewControls(sidecar) {
  const byPanel = new Map();
  (sidecar?.regions || []).forEach((r) => {
    if (r.kind === "rows" && r.panel && r.patient && !byPanel.has(r.panel)) byPanel.set(r.panel, r.patient);
  });
  return [...byPanel.entries()].map(([panel, patient]) => ({ panel, type: "patient-view", field: "patient", options: null, default: patient, source: null, label: "Open patient" }));
}

/**
 * Every control of a figure: declared by the sidecar, else built in, else derived from mark fields; at most one control
 * of a type per panel (declared wins). figId: "Figure1".
 */
export function figureControls(sidecar, figId) {
  const seen = new Set();
  const out = [];
  const add = (c) => {
    const k = `${c.panel}|${c.type}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(c);
  };
  (sidecar?.controls || []).forEach(add);
  (BUILTIN_CONTROLS[figId] || []).forEach(add);
  fieldControls(sidecar).forEach(add);
  patientViewControls(sidecar).forEach(add);
  return out;
}

/** Control key for state. */
export const controlKey = (c) => `${c.panel}|${c.type}`;

/** Options of a control: its own list, else the values it can take (state-scores patients come from the data). */
export function controlOptions(c, fallback = []) {
  return c.options && c.options.length ? c.options : fallback;
}

/**
 * Page positions of the marks whose id field equals `value` in the plot regions of a panel: { points: [[x, y]], rects: [{x, y, w, h}] }.
 * The rest of the panel is dimmed by the caller.
 */
export function highlightFieldMarks(sidecar, panel, field, value, limit = 6000) {
  const out = { points: [], rects: [] };
  if (!sidecar || value == null || value === "") return out;
  const want = `${panel}`.toLowerCase();
  sidecar.regions.forEach((r) => {
    if (r.kind !== "plot" || !r.xscale || !r.yscale || `${r.panel ?? ""}`.toLowerCase() !== want) return;
    r.marks.forEach((m) => {
      const f = m.fields[field];
      if (!f) return;
      const n = m.type === "points" ? m.x.length : m.xmin.length;
      for (let i = 0; i < n && out.points.length + out.rects.length < limit; i += 1) {
        if (`${f.length === 1 ? f[0] : f[i]}` !== `${value}`) continue;
        if (m.type === "points") out.points.push(toPage(r, m.x[i], m.y[i]));
        else {
          const [x0, y0] = toPage(r, m.xmin[i], m.ymax[i]);
          const [x1, y1] = toPage(r, m.xmax[i], m.ymin[i]);
          out.rects.push({ x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) });
        }
      }
    });
  });
  return out;
}

/** Plot regions of a panel that carry the mark field (the area the dimming wash covers). */
export function fieldRegions(sidecar, panel, field) {
  const want = `${panel}`.toLowerCase();
  return (sidecar?.regions || []).filter((r) => r.kind === "plot" && `${r.panel ?? ""}`.toLowerCase() === want && r.marks.some((m) => m.fields[field]));
}

// ---- live data on top of a static plot (Fig 1e: RNA cells by patient)

const key4 = (x, y) => `${Math.round(x * 1e4) / 1e4},${Math.round(y * 1e4) / 1e4}`;

/**
 * Cells of live data (rows { cell, patient, x, y, state }) whose coordinates are the plot's point marks in `region`:
 * returns the cells of one patient with their page position, plus how many of the plot's points were matched
 * (a low match means the live table is not the one the figure was drawn from).
 */
export function liveCellsOnPlot(region, cells, patient) {
  const pts = new Set();
  region.marks.filter((m) => m.type === "points").forEach((m) => m.x.forEach((x, i) => pts.add(key4(x, m.y[i]))));
  const matched = cells.filter((c) => pts.has(key4(c.x, c.y)));
  const mine = patient == null || patient === "" || patient === "all" ? matched : matched.filter((c) => c.patient === patient);
  return { total: pts.size, matched: matched.length, cells: mine.map((c) => ({ ...c, page: toPage(region, c.x, c.y) })) };
}

/** Patients of live rows, most cells first. */
export function livePatients(cells) {
  const n = new Map();
  cells.forEach((c) => n.set(c.patient, (n.get(c.patient) || 0) + 1));
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([patient, count]) => ({ patient, count }));
}
