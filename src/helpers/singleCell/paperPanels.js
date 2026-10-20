// Data shaping for the Paper figures panels that read precomputed exports:
// the state quadrant (_cohort/rna/state_scores.json) and the phylogenetic-signal panel
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
export function phyloSignalColumns(signals, { controls = ["Seq. depth", "Mean somatic VAF"], geneSets = null, curatedOnly = false, amplifiedOnly = false } = {}) {
  // amplifiedOnly: only patients with a walk of the shown gene sets (the paper: EGFR patients)
  if (amplifiedOnly && geneSets) {
    const has = new Set(signals.filter(({ data }) => (data?.rows || []).some((r) => r.kind === "walk" && geneSets.includes(r.gene_set) && !(curatedOnly && r.curated === false))).map((x) => x.patient));
    signals = signals.filter((x) => has.has(x.patient)); // eslint-disable-line no-param-reassign
  }
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
        add(key, CONTROL_LABEL[r.key] || r.key, "control", { patient, z, p: r.p, n: r.n, label: r.key, source: r.source === "depth table" ? r.field : null });
      } else if (r.kind === "walk") {
        const gs = `${r.gene_set || ""}`;
        if (!gs || (geneSets && !geneSets.includes(gs)) || !Number.isFinite(z) || (curatedOnly && r.curated === false)) return;
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

// ---- Fig 3A/B: amplicon classes and graph-level structures (_cohort/amplicon_structures.json)

export const AMPLICON_STRUCTURES_FILE = "amplicon_structures.json";
// row order of the paper: single driver genes in this order, then combinations by size
export const CLASS_ORDER = ["MYCN", "EGFR", "CDK4", "MDM2", "PDGFRA", "MAP3K1", "RRAS2", "FOXO1", "SOX5", "BRAF+EZH2+KMT2C"];
export const classRank = (cls) => {
  const k = CLASS_ORDER.indexOf(`${cls}`);
  return k >= 0 ? k : 100 + `${cls}`.split("+").length;
};

/**
 * gos-sc-amplicon-structures/1 -> { patients: [{ patient, nTumour, classes: [{ cls, nCells, nStructures, cells, cn, structure }] }], notAvailable }
 * Classes sorted as in the paper; patients in `order` (else as in the file).
 */
export function parseAmpliconStructures(json, order = null) {
  if (!json || typeof json !== "object" || !json.patients) return null;
  const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
  const names = Object.keys(json.patients);
  const ordered = order ? [...order.filter((p) => names.includes(p)), ...names.filter((p) => !order.includes(p))] : names;
  const patients = ordered.map((patient) => {
    const p = json.patients[patient] || {};
    const classes = arr(p.classes)
      .map((c) => ({
        cls: `${c.cls}`,
        nCells: Number(c.n_cells) || arr(c.cells).length,
        nStructures: c.n_structures == null ? null : Number(c.n_structures),
        cells: arr(c.cells).map(String),
        cn: arr(c.cn).map((v) => (v == null ? NaN : Number(v))),
        structure: arr(c.structure).map((v) => (v == null ? null : Number(v))),
      }))
      .sort((a, b) => classRank(a.cls) - classRank(b.cls) || a.cls.localeCompare(b.cls));
    return { patient, nTumour: p.n_tumour_cells == null ? null : Number(p.n_tumour_cells), classes };
  });
  const na = json.not_available && typeof json.not_available === "object" ? Object.entries(json.not_available).map(([patient, why]) => ({ patient, why: `${why}` })) : [];
  return { patients: patients.filter((p) => p.classes.length), notAvailable: na, method: json.method || "" };
}

/** Gaussian KDE on a linear grid [lo, hi] (n points), bandwidth by Silverman's rule; values outside are ignored. */
export function linearKde(values, lo, hi, n = 64) {
  const v = values.filter((x) => Number.isFinite(x) && x >= lo && x <= hi);
  const grid = Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));
  if (v.length < 2) return grid.map((x) => ({ x, d: 0 }));
  const mean = v.reduce((s, x) => s + x, 0) / v.length;
  const sd = Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / (v.length - 1)) || (hi - lo) / 50;
  const bw = Math.max((hi - lo) / 200, 1.06 * sd * v.length ** -0.2);
  const dens = grid.map((x) => v.reduce((s, y) => s + Math.exp(-0.5 * ((x - y) / bw) ** 2), 0));
  const max = Math.max(...dens) || 1;
  return grid.map((x, i) => ({ x, d: dens[i] / max }));
}

/**
 * Fig 3B rows: per patient, the combinations of classes carried by each cell,
 * kept when >= minPct % of the tumour cells and >= minCells cells, top maxRows
 * by share. pct uses nTumour (else the cells with any class).
 */
export function classCombinations(patients, { minPct = 1, minCells = 2, maxRows = 5 } = {}) {
  return patients.map((p) => {
    const by = new Map();
    p.classes.forEach((c) =>
      c.cells.forEach((id) => {
        if (!by.has(id)) by.set(id, []);
        if (!by.get(id).includes(c.cls)) by.get(id).push(c.cls);
      })
    );
    const denom = p.nTumour || by.size || 1;
    const sets = new Map();
    by.forEach((cls, id) => {
      const key = [...cls].sort().join("|");
      if (!sets.has(key)) sets.set(key, []);
      sets.get(key).push(id);
    });
    const rows = [...sets.entries()]
      .map(([key, cells]) => ({ key, classes: key.split("|"), cells, n: cells.length, pct: (100 * cells.length) / denom }))
      .filter((r) => r.pct >= minPct && r.n >= minCells)
      .sort((a, b) => b.pct - a.pct || a.key.localeCompare(b.key))
      .slice(0, maxRows);
    return { patient: p.patient, rows };
  });
}

/** Upset column order of the paper: combinations left (largest first), single genes right (reverse paper order). */
export function upsetColumns(blocks) {
  const all = [...new Set(blocks.flatMap((b) => b.rows.flatMap((r) => r.classes)))];
  return all.sort((a, b) => classRank(b) - classRank(a) || a.localeCompare(b));
}

// ---- Fig 4B: whole-genome SNV columns in tree-mapped blocks (srctools paper_figures fig4.R snv_hm)

export const SNV_BLOCKS = ["Truncal", "Subclonal", "Private", "Unmapped"];

/**
 * Column order of the whole-genome SNV heatmap: truncal | subclonal (by the
 * mapped clade, in tree order: top row of the clade, larger clades first, then
 * more carriers) | private | unmapped. Every variant of the matrix is a column.
 * variants: [{ category }]; nodes: per variant { firstLeaf, lastLeaf } | null
 * (mapped node in the displayed tree, rows from the top); cladeOfRow(r): clade of
 * that row; carriers: per-variant carrier count (optional).
 * Returns { cols: [variant index], blocks: [{ block, x0, x1, clades: [{ clade, x0, x1 }] }] } (x in column units).
 */
export function snvBlockOrder(variants, nodes, cladeOfRow, carriers = null) {
  const rec = variants.map((v, i) => {
    const nd = nodes[i];
    if (!nd) return { i, b: 3 };
    const size = nd.lastLeaf - nd.firstLeaf + 1;
    const cat = `${v?.category || ""}`;
    const b = cat === "truncal" ? 0 : cat === "private" || size === 1 ? 2 : 1;
    let clade = null;
    if (b === 1 || b === 2) {
      const count = new Map();
      for (let r = nd.firstLeaf; r <= nd.lastLeaf; r += 1) {
        const k = cladeOfRow(r) ?? "Normal";
        count.set(k, (count.get(k) || 0) + 1);
      }
      clade = [...count.entries()].sort((x, y) => y[1] - x[1] || `${x[0]}`.localeCompare(`${y[0]}`))[0][0];
    }
    return { i, b, top: nd.firstLeaf, size, clade, n: carriers ? carriers[i] || 0 : 0 };
  });
  rec.sort((x, y) => x.b - y.b || (x.top ?? 0) - (y.top ?? 0) || (y.size ?? 0) - (x.size ?? 0) || y.n - x.n || x.i - y.i);
  const blocks = [];
  rec.forEach((r, x) => {
    const name = SNV_BLOCKS[r.b];
    let blk = blocks[blocks.length - 1];
    if (!blk || blk.block !== name) {
      blk = { block: name, x0: x, x1: x + 1, clades: [] };
      blocks.push(blk);
    }
    blk.x1 = x + 1;
    if (r.b === 1 || r.b === 2) {
      const last = blk.clades[blk.clades.length - 1];
      if (last && last.clade === r.clade) last.x1 = x + 1;
      else blk.clades.push({ clade: r.clade, x0: x, x1: x + 1 });
    }
  });
  return { cols: rec.map((r) => r.i), blocks };
}

/** gos-sc-ecdna-snvs/1 -> [{ id, pos, ref, alt, normalAlt, normalDepth, reads: Map(cell -> [ref, alt]) }] ordered by position. */
export function parseEcdnaSnvs(json) {
  if (!json || !Array.isArray(json.sites)) return null;
  const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
  return json.sites
    .map((s) => {
      const cells = arr(s.cells);
      const ref = arr(s.ref_count);
      const alt = arr(s.alt_count);
      return { id: `${s.id}`, pos: Number(s.pos), ref: s.ref, alt: s.alt, normalAlt: s.normal_alt, normalDepth: s.normal_depth, reads: new Map(cells.map((c, k) => [`${c}`, [Number(ref[k]) || 0, Number(alt[k]) || 0]])) };
    })
    .sort((a, b) => a.pos - b.pos);
}

// ---- subclonal SNVs per cell, mutation burden by cell state (_cohort/tmb.json, snv_matrix.json, cell states)

const quant = (xs, p) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return NaN;
  const h = (s.length - 1) * p;
  const lo = Math.floor(h);
  return s[lo] + (h - lo) * ((s[Math.min(s.length - 1, lo + 1)] ?? s[lo]) - s[lo]);
};

/**
 * subclonal-per-cell: per patient, subclonal SNVs carried per tumour cell (sites of category
 * "subclonal" with genotype 1), median and IQR; truncal = the patient's truncal
 * site count (tmb.json). packed: packSnvCells output (with gt); tumourCells: ids.
 */
export function subclonalPerCell(variants, packed, tumourCells) {
  const sub = new Uint8Array(variants.length);
  variants.forEach((v, i) => (sub[i] = v?.category === "subclonal" ? 1 : 0));
  const counts = tumourCells
    .filter((id) => packed[id])
    .map((id) => {
      const p = packed[id];
      let n = 0;
      for (let k = 0; k < p.idx.length; k += 1) if (p.gt?.[k] === 1 && sub[p.idx[k]]) n += 1;
      return n;
    });
  return { k: counts.length, med: quant(counts, 0.5), lo: quant(counts, 0.25), hi: quant(counts, 0.75) };
}

/**
 * burden-by-state / above-mes rows: tumour cells with a malignant state and a corrected TMB, in
 * patients with >= 3 MES-like cells; rel = TMB / the patient's MES-like median.
 * tmb: _cohort/tmb.json; stateOf(patient, cellId) -> "MES" | "AC" | "NPC" | "OPC" | other.
 */
export const BURDEN_STATES = ["MES", "AC", "NPC", "OPC"];
export function burdenByState(tmb, stateOf) {
  const out = [];
  (tmb?.patients || []).forEach((p) => {
    const rows = (p.cells || [])
      .map((c) => ({ patient: p.patient, cell: `${c.cell_id}`, tmb: c.tmb_corrected == null ? NaN : Number(c.tmb_corrected), state: stateOf(p.patient, `${c.cell_id}`) }))
      .filter((r) => BURDEN_STATES.includes(r.state) && Number.isFinite(r.tmb));
    const mes = rows.filter((r) => r.state === "MES").map((r) => r.tmb);
    if (mes.length < 3) return;
    const m = quant(mes, 0.5);
    rows.forEach((r) => out.push({ ...r, rel: r.tmb / m }));
  });
  return out;
}

/** above-mes: per patient and state (>= minCells cells), the fraction of cells above the patient's MES-like median. */
export function fractionAboveMes(rows, minCells = 3) {
  const by = new Map();
  rows.forEach((r) => {
    const k = `${r.patient}\t${r.state}`;
    if (!by.has(k)) by.set(k, { patient: r.patient, state: r.state, n: 0, above: 0 });
    const g = by.get(k);
    g.n += 1;
    if (r.rel > 1) g.above += 1;
  });
  return [...by.values()].filter((g) => g.n >= minCells).map((g) => ({ ...g, frac: g.above / g.n }));
}
