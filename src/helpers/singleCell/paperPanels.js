// Data shaping for the Paper figures panels that read precomputed exports:
// Fig 1e (state quadrant, _cohort/rna/state_scores.json) and Fig 3E
// (phylogenetic signal, <patient>/phylo_signal.json). d3-free.

import { pointInPolygon } from "./figureMath";

export const STATE_SCORES_FILE = "rna/state_scores.json";
export const PHYLO_SIGNAL_FILE = "phylo_signal.json";

/**
 * Cells of gos-sc-state-scores/1: [{ patient, cell, x, y, state, scores }]
 * (x = relative meta-module score (log2), y = D = stem-like vs differentiated).
 * Rows without finite x / D are dropped. Accepts row objects or column arrays.
 */
const toNum = (v) => (v === null || v === undefined || v === "" ? NaN : Number(v));

export function parseStateScores(json) {
  if (!json || typeof json !== "object") return null;
  let rows = Array.isArray(json.cells) ? json.cells : null;
  if (!rows && json.cells && typeof json.cells === "object") {
    const cols = json.cells;
    const n = (cols.cell_id || cols.rna_id || []).length;
    rows = Array.from({ length: n }, (_, i) => Object.fromEntries(Object.keys(cols).map((k) => [k, cols[k][i]])));
  }
  if (!rows) return null;
  return rows
    .map((r) => ({
      patient: `${r.patient ?? ""}`,
      cell: `${r.cell_id ?? r.rna_id ?? ""}`,
      x: toNum(r.x),
      y: toNum(r.D),
      state: r.state == null ? "" : `${r.state}`,
      scores: { MES: toNum(r.MES), AC: toNum(r.AC), OPC: toNum(r.OPC), NPC: toNum(r.NPC) },
    }))
    .filter((r) => r.cell && Number.isFinite(r.x) && Number.isFinite(r.y));
}

/** Symmetric padded extent of a set of values, at least ±min. */
export function symmetricExtent(values, { pad = 0.06, min = 0.5 } = {}) {
  let m = min;
  values.forEach((v) => {
    if (Number.isFinite(v) && Math.abs(v) > m) m = Math.abs(v);
  });
  return [-m * (1 + pad), m * (1 + pad)];
}

/** Quadrant of a point, as the Neftel plot labels it. */
export const quadrantOf = (x, y) => (y >= 0 ? (x >= 0 ? "NPC" : "OPC") : x >= 0 ? "MES" : "AC");

/**
 * Cells inside a lasso (polygon in data coordinates), grouped by patient,
 * largest group first: [{ patient, cells: [id] }].
 */
export function cellsInLasso(points, polygon) {
  const by = new Map();
  points.forEach((p) => {
    if (!pointInPolygon(p.x, p.y, polygon)) return;
    if (!by.has(p.patient)) by.set(p.patient, []);
    by.get(p.patient).push(p.cell);
  });
  return [...by.entries()].map(([patient, cells]) => ({ patient, cells })).sort((a, b) => b.cells.length - a.cells.length || a.patient.localeCompare(b.patient));
}

// ---- Fig 3E

/** Pseudo-log transform for z-scores (0, 2, 5, 10, 100 spread evenly enough): sign(z) * log10(1 + |z|). */
export const zTransform = (z) => Math.sign(z) * Math.log10(1 + Math.abs(z));
export const Z_TICKS = [-2, 0, 2, 5, 10, 20, 50, 100];
export const Z_ONE_SIDED = 1.645;

const median = (xs) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return NaN;
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
};

const CONTROL_LABEL = { "Seq. depth": "Seq. depth", Ploidy: "Ploidy", "SNVs / cell": "SNVs / cell", "Mean somatic VAF": "Somatic VAF" };

/**
 * Columns of the Fig 3E strip plot from per-patient phylo_signal.json:
 * controls (sequencing depth, somatic VAF, ...) and one column per amplicon
 * gene set (each walk a point). Missing z (control not recorded) is listed
 * in `missing` instead of plotted.
 * signals: [{ patient, data }]; opts.controls / opts.geneSets restrict and order the columns.
 */
export function phyloSignalColumns(signals, { controls = ["Seq. depth", "Mean somatic VAF"], geneSets = null } = {}) {
  const cols = new Map();
  const missing = new Map();
  const add = (key, label, kind, point) => {
    if (!cols.has(key)) cols.set(key, { key, label, kind, points: [] });
    cols.get(key).points.push(point);
  };
  signals.forEach(({ patient, data }) =>
    (data?.rows || []).forEach((r) => {
      const z = r.z == null ? NaN : Number(r.z);
      if (r.kind === "control") {
        if (controls && !controls.includes(r.key)) return;
        const key = `c:${r.key}`;
        if (!Number.isFinite(z)) {
          if (!missing.has(key)) missing.set(key, []);
          missing.get(key).push(patient);
          return;
        }
        add(key, CONTROL_LABEL[r.key] || r.key, "control", { patient, z, p: r.p, n: r.n, label: r.key });
      } else if (r.kind === "walk") {
        const gs = `${r.gene_set || ""}`;
        if (!gs || (geneSets && !geneSets.includes(gs)) || !Number.isFinite(z)) return;
        add(`g:${gs}`, `${gs} ecDNA`, "walk", { patient, z, p: r.p, n: r.n, label: r.key, walkId: r.walk_id == null ? null : `${r.walk_id}`, geneSet: gs, curated: r.curated });
      }
    })
  );
  const order = (c) => {
    if (c.kind === "walk") return 1 + (geneSets ? geneSets.indexOf(c.key.slice(2)) : 0) / 100;
    const k = controls ? controls.indexOf(c.key.slice(2)) : 0;
    return k === 0 ? 0 : 2 + k / 100; // first control left, the rest after the amplicons (paper: depth | EGFR | VAF)
  };
  const out = [...cols.values()].map((c) => ({ ...c, median: median(c.points.map((p) => p.z)) }));
  out.sort((a, b) => order(a) - order(b) || a.label.localeCompare(b.label));
  return { columns: out, missing: [...missing.entries()].map(([key, patients]) => ({ key: key.slice(2), patients })) };
}

/** Gene sets with walks in the signals, most patients first. */
export function phyloSignalGeneSets(signals) {
  const by = new Map();
  signals.forEach(({ patient, data }) =>
    (data?.rows || []).forEach((r) => {
      if (r.kind !== "walk" || !r.gene_set) return;
      if (!by.has(r.gene_set)) by.set(r.gene_set, new Set());
      by.get(r.gene_set).add(patient);
    })
  );
  return [...by.entries()].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0])).map(([g, s]) => ({ geneSet: g, patients: s.size }));
}
