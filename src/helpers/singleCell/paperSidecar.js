// Interactive-paper sidecars (gos-paper-sidecar/1, written by the figure scripts' figlib.R write_sidecars): the plot
// areas of a figure page in pt (origin top-left) and what they show (rows = cell ids top to bottom, per-row values,
// a genome axis), so the exact SVG can carry hover, click and brushing. d3-free; reusable for any paper.

const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

function scaleOf(sc) {
  if (!sc || typeof sc !== "object") return null;
  const r = arr(sc.range).map(Number);
  if (r.length < 2 || !(r[1] !== r[0])) return null;
  return { discrete: !!sc.discrete, lo: r[0], hi: r[1], labels: sc.labels == null ? null : arr(sc.labels).map(String) };
}

function fieldsOf(f) {
  if (!f || typeof f !== "object") return {};
  return Object.fromEntries(Object.entries(f).map(([k, v]) => [k, arr(v)]));
}

/** Sidecar `controls`: [{ panel, type: "patient" | "gene" | "clade" | "patient-view", field?, options?, default?, source?, label? }] (invalid entries dropped). */
export function parseControls(list) {
  return arr(list)
    .filter((c) => c && typeof c === "object" && c.panel != null && ["patient", "gene", "clade", "patient-view"].includes(`${c.type}`))
    .map((c) => ({
      panel: `${c.panel}`,
      type: `${c.type}`,
      field: c.field == null ? `${c.type}` : `${c.field}`,
      options: c.options == null ? null : arr(c.options).map(String),
      default: c.default == null ? null : `${arr(c.default)[0]}`,
      source: c.source == null ? null : `${c.source}`,
      label: c.label == null ? null : `${arr(c.label)[0]}`,
    }));
}

function markOf(m) {
  if (!m || typeof m !== "object") return null;
  if (m.type === "points") return { type: "points", x: arr(m.x).map(Number), y: arr(m.y).map(Number), fields: fieldsOf(m.fields) };
  if (m.type === "rects") return { type: "rects", xmin: arr(m.xmin).map(Number), xmax: arr(m.xmax).map(Number), ymin: arr(m.ymin).map(Number), ymax: arr(m.ymax).map(Number), fields: fieldsOf(m.fields) };
  return null;
}

/** Sidecar JSON -> { page: { w, h }, regions: [{ id, panel, kind, x, y, w, h, rows, rowset, values, valueLabel, axis, patient, label }] } | null. */
export function parseSidecar(json) {
  if (!json || !Array.isArray(json.regions)) return null;
  const regions = json.regions
    .map((r) => ({
      id: `${r.id}`,
      panel: r.panel == null ? null : `${r.panel}`,
      kind: r.kind || "rows",
      x: Number(r.x),
      y: Number(r.y),
      w: Number(r.w),
      h: Number(r.h),
      rows: arr(r.rows).map((x) => (x == null ? null : `${x}`)),
      rowset: r.rowset == null ? null : `${r.rowset}`,
      values: r.values == null ? null : arr(r.values),
      valueLabel: r.value_label || null,
      axis: r.axis && typeof r.axis === "object" ? r.axis : null,
      patient: r.patient == null ? null : `${r.patient}`,
      label: r.label || "",
      xscale: scaleOf(r.xscale),
      yscale: scaleOf(r.yscale),
      marks: arr(r.marks).map(markOf).filter(Boolean),
      table: r.table && typeof r.table === "object" ? r.table : null,
      zoom: ["x", "y", "xy", "none"].includes(`${r.zoom}`) ? `${r.zoom}` : null,
      cols: r.cols && typeof r.cols === "object" ? { ...r.cols, ids: r.cols.ids == null ? null : arr(r.cols.ids).map(String) } : null,
    }))
    .filter((r) => [r.x, r.y, r.w, r.h].every(Number.isFinite) && r.w > 0 && r.h > 0);
  return { page: { w: Number(json.page?.w) || null, h: Number(json.page?.h) || null }, regions, data: json.data && typeof json.data === "object" ? json.data : {}, controls: parseControls(json.controls) };
}

/** Row index of a page y inside a rows region, or -1. */
export function rowIndexAt(region, y) {
  const n = region.rows.length;
  if (!n || y < region.y || y >= region.y + region.h) return -1;
  return Math.min(n - 1, Math.floor(((y - region.y) / region.h) * n));
}

/** Band (page y0, y1) of row i of a region. */
export const rowBand = (region, i) => ({ y0: region.y + (i * region.h) / region.rows.length, y1: region.y + ((i + 1) * region.h) / region.rows.length });

/** Genome position (bp) of a page x in a region with a genome axis, else null. */
export function axisPosition(region, x) {
  const a = region.axis;
  if (!a || a.type !== "genome" || !Number.isFinite(Number(a.from)) || !Number.isFinite(Number(a.to))) return null;
  const t = (x - region.x) / region.w;
  if (t < 0 || t > 1) return null;
  return { chr: `${a.chr}`, pos: Math.round(Number(a.from) + t * (Number(a.to) - Number(a.from))) };
}

/**
 * What is under a page point: { region, index, id, value, extras: [{ label, value }], position } with the values of
 * every region in the same rowset for that row (clade, state, copies ...); null outside every rows region.
 */
export function hitAt(sidecar, x, y) {
  if (!sidecar) return null;
  const region = sidecar.regions.find((r) => r.kind === "rows" && r.rows.length && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  if (!region) return null;
  const index = rowIndexAt(region, y);
  if (index < 0) return null;
  const id = region.rows[index];
  const extras = sidecar.regions
    .filter((r) => r.values && (r.rowset ? r.rowset === region.rowset : r.id === region.id))
    .map((r) => {
      const k = r.rows.indexOf(id);
      return { label: r.valueLabel || r.label, value: k >= 0 ? r.values[k] : null };
    })
    .filter((e) => e.value != null && e.value !== "");
  return { region, index, id, value: region.values ? region.values[index] : null, extras, position: axisPosition(region, x) };
}

/** Row ids of a region between two page ys (inclusive, any order). */
export function rowsBetween(region, ya, yb) {
  const n = region.rows.length;
  const i0 = Math.max(0, rowIndexAt(region, Math.max(region.y, Math.min(ya, yb))));
  const i1 = Math.min(n - 1, rowIndexAt(region, Math.min(region.y + region.h - 1e-6, Math.max(ya, yb))));
  return i0 <= i1 && i1 >= 0 ? region.rows.slice(i0, i1 + 1).filter(Boolean) : [];
}

/**
 * Highlight rectangles (page pt) for a set of row ids: in every region of the rowset (or the region itself), one
 * rectangle per contiguous run of selected rows. [{ x, y, w, h }]
 */
export function highlightRects(sidecar, rowset, regionId, ids) {
  if (!sidecar || !ids?.size) return [];
  const out = [];
  sidecar.regions
    .filter((r) => r.kind === "rows" && (rowset ? r.rowset === rowset : r.id === regionId))
    .forEach((r) => {
      let start = -1;
      r.rows.forEach((id, i) => {
        const on = ids.has(id);
        if (on && start < 0) start = i;
        if ((!on || i === r.rows.length - 1) && start >= 0) {
          const end = on ? i : i - 1;
          const a = rowBand(r, start);
          const b = rowBand(r, end);
          out.push({ x: r.x, y: a.y0, w: r.w, h: b.y1 - a.y0 });
          start = -1;
        }
      });
    });
  return out;
}

// ---- ggplot plot areas (kind "plot": scales + point / rect marks with their identifying fields)

/** Data -> page coordinates in a plot region (y up in data, down on the page). */
export function toPage(region, dx, dy) {
  const xs = region.xscale;
  const ys = region.yscale;
  return [region.x + ((dx - xs.lo) / (xs.hi - xs.lo)) * region.w, region.y + (1 - (dy - ys.lo) / (ys.hi - ys.lo)) * region.h];
}

/** Page -> data coordinates in a plot region. */
export function toData(region, px, py) {
  const xs = region.xscale;
  const ys = region.yscale;
  return [xs.lo + ((px - region.x) / region.w) * (xs.hi - xs.lo), ys.lo + (1 - (py - region.y) / region.h) * (ys.hi - ys.lo)];
}

const fieldsAt = (m, i) => Object.fromEntries(Object.entries(m.fields).map(([k, v]) => [k, v.length === 1 && m.x?.length !== 1 && m.xmin?.length !== 1 ? v[0] : v[i]]).filter(([, v]) => v != null && v !== ""));

/** Axis readout of a page point: { x, y } as category labels (discrete) or numbers. */
export function axisReadout(region, px, py) {
  const [dx, dy] = toData(region, px, py);
  const read = (sc, v) => (sc.discrete && sc.labels ? sc.labels[Math.round(v) - 1] ?? null : v);
  return { x: read(region.xscale, dx), y: read(region.yscale, dy) };
}

/**
 * What is under a page point in a plot region: the nearest point mark within `tol` pt, else a rect mark that
 * contains it: { region, mark, index, fields, page: [x, y] }, or { region, axis } when only the axes apply; null outside.
 */
export function plotHitAt(sidecar, px, py, { tol = 3 } = {}) {
  if (!sidecar) return null;
  const region = sidecar.regions.find((r) => r.kind === "plot" && r.xscale && r.yscale && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h);
  if (!region) return null;
  let best = null;
  region.marks.forEach((m) => {
    if (m.type !== "points") return;
    m.x.forEach((dx, i) => {
      const [qx, qy] = toPage(region, dx, m.y[i]);
      const d = Math.hypot(qx - px, qy - py);
      if (d <= tol && (!best || d < best.d)) best = { d, mark: m, index: i, page: [qx, qy] };
    });
  });
  if (best) return { region, mark: best.mark, index: best.index, fields: fieldsAt(best.mark, best.index), page: best.page };
  const [dx, dy] = toData(region, px, py);
  for (let k = region.marks.length - 1; k >= 0; k -= 1) {
    const m = region.marks[k];
    if (m.type !== "rects") continue;
    for (let i = 0; i < m.xmin.length; i += 1) {
      const [x0, x1] = [Math.min(m.xmin[i], m.xmax[i]), Math.max(m.xmin[i], m.xmax[i])];
      const [y0, y1] = [Math.min(m.ymin[i], m.ymax[i]), Math.max(m.ymin[i], m.ymax[i])];
      if (dx >= x0 && dx <= x1 && dy >= y0 && dy <= y1) {
        const [a, b] = toPage(region, x0, y1);
        const [c, d] = toPage(region, x1, y0);
        return { region, mark: m, index: i, fields: fieldsAt(m, i), rect: { x: a, y: b, w: c - a, h: d - b } };
      }
    }
  }
  return { region, axis: axisReadout(region, px, py) };
}

/** Page positions of point marks whose `field` value is in `ids`, across every plot region (linked highlighting). */
export function markPositions(sidecar, field, ids, limit = 4000) {
  const out = [];
  if (!sidecar || !ids?.size) return out;
  sidecar.regions.forEach((r) => {
    if (r.kind !== "plot" || !r.xscale || !r.yscale) return;
    r.marks.forEach((m) => {
      const f = m.fields[field];
      if (m.type !== "points" || !f) return;
      m.x.forEach((dx, i) => {
        if (out.length < limit && ids.has(`${f[i]}`)) out.push(toPage(r, dx, m.y[i]));
      });
    });
  });
  return out;
}

/** Figure-context extras of a sidecar for one patient: { walkNames: { walk label: display name }, walkColors, ecdnaSnvs: [site] } */
export function sidecarExtras(sidecar, patient) {
  const d = sidecar?.data || {};
  const out = { walkNames: null, walkColors: null, ecdnaSnvs: null };
  const wn = d.walk_names;
  if (wn && (!wn.patient || `${wn.patient}` === `${patient}`) && wn.names && typeof wn.names === "object") {
    out.walkNames = Object.fromEntries(Object.entries(wn.names).map(([k, v]) => [k, `${arr(v)[0]}`]));
    if (wn.colors && typeof wn.colors === "object") out.walkColors = Object.fromEntries(Object.entries(wn.colors).map(([k, v]) => [k, `${arr(v)[0]}`]));
  }
  const e = d.ecdna_snvs;
  if (e && (!e.patient || `${e.patient}` === `${patient}`)) {
    const sites = arr(e.sites).map(String);
    const pos = arr(e.pos).map(Number);
    const cls = arr(e.class);
    const by = new Map(sites.map((id) => [id, new Map()]));
    const cells = arr(e.cell);
    const ss = arr(e.site);
    const fr = arr(e.frac);
    cells.forEach((c, i) => by.get(`${ss[i]}`)?.set(`${c}`, Number(fr[i])));
    out.ecdnaSnvs = sites.map((id, i) => ({ id: `${e.chromosome || ""}${e.chromosome ? "_" : ""}${id}`, pos: pos[i], cls: cls[i] ?? null, frac: by.get(id), gene: `${cls[i] ?? ""} · fraction of copies mutated`.trim() }));
  }
  return out;
}

// ---- panel data tables (the data behind a panel, for sortable / filterable / downloadable views)

/**
 * Tables of one panel: for ggplot areas the plot's data frame (sidecar `table`), for row areas one table of the rows
 * with every per-row value of the rowset. [{ title, columns: [name], rows: [[...]] }]
 */
export function panelTables(sidecar, letter) {
  if (!sidecar) return [];
  const want = `${letter}`.toLowerCase();
  const mine = sidecar.regions.filter((r) => `${r.panel ?? ""}`.toLowerCase() === want);
  const out = [];
  mine.forEach((r) => {
    const t = r.table;
    if (!t || !Array.isArray(t.columns) || !t.data) return;
    const cols = t.columns.map(String);
    const data = cols.map((c) => arr(t.data[c]));
    const n = Math.max(0, ...data.map((d) => d.length));
    out.push({ title: r.label || r.id, columns: cols, rows: Array.from({ length: n }, (_, i) => data.map((d) => (d.length === 1 && n > 1 ? d[0] : d[i]))) });
  });
  const rowsets = [...new Set(mine.filter((r) => r.kind === "rows").map((r) => r.rowset || r.id))];
  rowsets.forEach((rs) => {
    const regs = sidecar.regions.filter((r) => r.kind === "rows" && (r.rowset || r.id) === rs);
    const ids = regs[0]?.rows || [];
    const withVals = regs.filter((r) => r.values);
    const cols = ["row", "cell", ...withVals.map((r) => r.valueLabel || r.label)];
    const rows = ids.map((id, i) => [i + 1, id, ...withVals.map((r) => r.values[r.rows.indexOf(id)] ?? null)]);
    out.push({ title: `${regs[0]?.patient ? `${regs[0].patient} · ` : ""}rows (top to bottom)`, columns: cols, rows });
  });
  return out;
}

/** Tab-separated text of a table (header + rows). */
export function tableTsv(table) {
  const esc = (v) => (v == null ? "" : `${v}`.replace(/[\t\n\r]/g, " "));
  return [table.columns.map(esc).join("\t"), ...table.rows.map((r) => r.map(esc).join("\t"))].join("\n");
}

/**
 * Table of selected cells with what the figure shows about them: clade / state (from the cell records) and every
 * per-row value of the rows regions and per-mark field of point marks that carry the cell. recordOf(id) -> cell record.
 */
export function selectionTable(sidecar, ids, recordOf = () => null, cladeOf = (c) => c?.clone_id ?? null) {
  const cols = ["cell", "clade", "state"];
  const extra = new Map(); // column -> Map(id -> value)
  const put = (col, id, v) => {
    if (v == null || v === "") return;
    if (!extra.has(col)) extra.set(col, new Map());
    if (!extra.get(col).has(id)) extra.get(col).set(id, v);
  };
  const want = new Set(ids.map(String));
  (sidecar?.regions || []).forEach((r) => {
    if (r.kind === "rows" && r.values) r.rows.forEach((id, i) => want.has(id) && put(r.valueLabel || r.label, id, r.values[i]));
    if (r.kind === "plot")
      r.marks.forEach((m) => {
        const f = m.fields.cell || m.fields.cell_id;
        if (m.type !== "points" || !f) return;
        f.forEach((id, i) => {
          if (!want.has(`${id}`)) return;
          Object.entries(m.fields).forEach(([k, v]) => k !== "cell" && k !== "cell_id" && put(`${r.panel || ""}:${k}`, `${id}`, v.length === 1 ? v[0] : v[i]));
        });
      });
  });
  const extraCols = [...extra.keys()];
  const rows = ids.map((id) => {
    const rec = recordOf(id);
    return [`${id}`, rec ? cladeOf(rec) : null, rec?.state ?? null, ...extraCols.map((c) => extra.get(c).get(`${id}`) ?? null)];
  });
  return { title: "selected cells", columns: [...cols, ...extraCols], rows };
}
