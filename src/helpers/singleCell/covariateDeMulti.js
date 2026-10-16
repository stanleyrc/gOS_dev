// Multi-gene views and covariate filters of the cohort Covariate DE panel (d3-free, jest-tested).
// Selection parsing (?covgenes=EGFR,SOX2), gene stats of a selection, module score, dot-plot aggregation,
// and the covariate-list filters (cell counts, clade F1 across patients).
import { twoSidedP } from "./rnaStats";
import { eventF1ByPatient, f1Summary } from "./cladeF1View";

/* ---------------------------------------------------------------- selection */

/** Gene symbols of a `covgenes` URL value ("EGFR,SOX2"), upper-cased order kept, duplicates and blanks dropped. */
export function parseGenesParam(value) {
  const seen = new Set();
  return `${value || ""}`.split(/[,\s;]+/).map((g) => g.trim()).filter((g) => g && !seen.has(g.toUpperCase()) && seen.add(g.toUpperCase()));
}

export const formatGenesParam = (genes) => (genes || []).join(",");

/** Add `gene` to the selection or remove it when present (case-insensitive). */
export function toggleGene(genes, gene) {
  const has = (genes || []).some((g) => g.toUpperCase() === `${gene}`.toUpperCase());
  return has ? genes.filter((g) => g.toUpperCase() !== `${gene}`.toUpperCase()) : [...(genes || []), gene];
}

/** Genes of a test that have statistics: the gene table plus the volcano genes (symbol -> canonical casing). */
export function testGenePool(test) {
  const pool = new Map();
  (test?.genes || []).forEach((g) => pool.set(g.gene.toUpperCase(), g.gene));
  (test?.volcano?.genes || []).forEach((g) => !pool.has(g.toUpperCase()) && pool.set(g.toUpperCase(), g));
  return pool;
}

/** The selection after a covariate change: genes the new test has statistics for stay, the rest vanish. */
export function reconcileSelection(genes, test) {
  const pool = testGenePool(test);
  const out = [];
  (genes || []).forEach((g) => {
    const canon = pool.get(`${g}`.toUpperCase());
    if (canon && !out.includes(canon)) out.push(canon);
  });
  return out;
}

/** Top `n` genes by the chosen order: direction "up" (highest log2FC in A) | "down" | "sig" (smallest q); only genes with q < maxQ. */
export function topGenes(test, n, direction = "up", { maxQ = 0.05 } = {}) {
  const rows = (test?.genes || []).filter((g) => Number.isFinite(g.avg_log2FC) && (g.q_val == null || g.q_val < maxQ));
  const key = { up: (a, b) => b.avg_log2FC - a.avg_log2FC, down: (a, b) => a.avg_log2FC - b.avg_log2FC, sig: (a, b) => a.q_val - b.q_val }[direction] || (() => 0);
  const keep = direction === "up" ? rows.filter((g) => g.avg_log2FC > 0) : direction === "down" ? rows.filter((g) => g.avg_log2FC < 0) : rows;
  return keep.sort(key).slice(0, n).map((g) => g.gene);
}

/* -------------------------------------------------------------- gene stats */

/**
 * Stats rows of the selected genes in a test: effect, p, q, direction, per-patient fold changes and consistency.
 * Genes known only from the volcano arrays have effect and q but no per-patient detail (fields null).
 */
export function selectedGeneRows(test, genes) {
  const byGene = new Map((test?.genes || []).map((g) => [g.gene.toUpperCase(), g]));
  const vol = test?.volcano;
  const vIdx = new Map((vol?.genes || []).map((g, i) => [g.toUpperCase(), i]));
  return (genes || []).map((gene) => {
    const g = byGene.get(`${gene}`.toUpperCase());
    if (g) {
      return { gene: g.gene, lfc: g.avg_log2FC, z: g.z ?? null, p: g.p_val ?? null, q: g.q_val ?? null, fisher_q: g.fisher_q ?? null, direction: g.avg_log2FC > 0 ? "higher" : g.avg_log2FC < 0 ? "lower" : "none", n_patients: g.n_patients ?? null, n_concordant: g.n_concordant ?? null, per: g.per || null, source: "table" };
    }
    const i = vIdx.get(`${gene}`.toUpperCase());
    if (i != null) {
      return { gene: vol.genes[i], lfc: vol.lfc[i], z: null, p: Number.isFinite(vol.p?.[i]) ? vol.p[i] : null, q: vol.q[i], fisher_q: null, direction: vol.lfc[i] > 0 ? "higher" : vol.lfc[i] < 0 ? "lower" : "none", n_patients: null, n_concordant: null, per: null, source: "volcano" };
    }
    return { gene, lfc: null, z: null, p: null, q: null, fisher_q: null, direction: null, n_patients: null, n_concordant: null, per: null, source: "none" };
  });
}

/** Genes ordered by effect (log2FC high to low); genes without an effect go last. */
export const orderByEffect = (rows) => [...rows].sort((a, b) => (b.lfc ?? -Infinity) - (a.lfc ?? -Infinity));

const fmtNum = (v, digits = 3) => (Number.isFinite(v) ? Number(v.toPrecision(digits)) : "NA");

/** TSV text of the selected genes' stats (one row per gene, per-patient log2FC columns). */
export function statsTsv(test, rows) {
  const patients = (test?.patients || []).map((p) => p.patient);
  const head = ["test", "gene", "log2FC", "z", "p", "q", "fisher_q", "direction", "n_patients", "n_concordant", ...patients.map((p) => `log2FC_${p}`)];
  const lines = (rows || []).map((r) => [test?.id, r.gene, fmtNum(r.lfc), fmtNum(r.z), fmtNum(r.p), fmtNum(r.q), fmtNum(r.fisher_q), r.direction ?? "NA", r.n_patients ?? "NA", r.n_concordant ?? "NA", ...patients.map((p) => fmtNum(r.per?.[p]))].join("\t"));
  return [head.join("\t"), ...lines].join("\n") + "\n";
}

/* ------------------------------------------------- expression aggregation */

const finite = (v) => Number.isFinite(v);

/** z-score `values` at `idx` (mean 0, sd 1 over those cells, clipped at +-10); constant genes give zeros. */
export function zScoreAt(values, idx) {
  const n = idx.length;
  let mean = 0;
  idx.forEach((i) => (mean += values[i]));
  mean /= n || 1;
  let ss = 0;
  idx.forEach((i) => (ss += (values[i] - mean) ** 2));
  const sd = Math.sqrt(ss / Math.max(1, n - 1));
  const out = new Map();
  idx.forEach((i) => out.set(i, sd > 0 ? Math.max(-10, Math.min(10, (values[i] - mean) / sd)) : 0));
  return out;
}

/**
 * Per patient and group, scaled expression of each gene and the module score.
 * perPatient: [{ patient, a: idx[], b: idx[], genes: { GENE: values[] (indexed by cell row) } }].
 * Scaling is per patient and gene over the cells of the test (A + B), so patients with different baselines are comparable.
 * @returns [{ patient, genes: { G: { a: number[], b: number[] } }, module: { a, b }, raw: { G: { a, b } } }]
 */
export function scaledPerPatient(perPatient) {
  return (perPatient || []).map((p) => {
    const idx = [...p.a, ...p.b];
    const genes = {};
    const raw = {};
    Object.entries(p.genes || {}).forEach(([g, values]) => {
      const z = zScoreAt(values, idx);
      genes[g] = { a: p.a.map((i) => z.get(i)), b: p.b.map((i) => z.get(i)) };
      raw[g] = { a: p.a.map((i) => values[i]), b: p.b.map((i) => values[i]) };
    });
    const names = Object.keys(genes);
    const mod = (side) => (names.length ? p[side].map((_, k) => names.reduce((s, g) => s + genes[g][side][k], 0) / names.length) : []);
    return { patient: p.patient, genes, raw, module: { a: mod("a"), b: mod("b") } };
  });
}

const mean = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);

/**
 * Dot-plot cells: per gene and column (A / B, pooled over patients or split by patient), mean scaled expression and
 * share of cells with raw expression > 0. Genes follow `order`.
 * @returns { columns: [{ key, patient, side }], cells: [{ gene, col, mean, pct, n }] }
 */
export function dotPlotAggregate(scaled, genes, { split = false } = {}) {
  const sides = ["a", "b"];
  const columns = [];
  const cells = [];
  const add = (key, patient, side, parts) => {
    columns.push({ key, patient, side: side.toUpperCase() });
    genes.forEach((gene) => {
      const z = [];
      let det = 0;
      let n = 0;
      parts.forEach((p) => {
        const zs = p.genes[gene]?.[side];
        if (!zs) return;
        z.push(...zs);
        const rs = p.raw[gene][side];
        n += rs.length;
        det += rs.filter((x) => x > 0).length;
      });
      cells.push({ gene, col: key, mean: mean(z), pct: n ? det / n : null, n });
    });
  };
  if (split) scaled.forEach((p) => sides.forEach((s) => add(`${p.patient} ${s.toUpperCase()}`, p.patient, s, [p])));
  else sides.forEach((s) => add(s.toUpperCase(), null, s, scaled));
  return { columns, cells };
}

/* ------------------------------------------------------------ module score */

/** Wilcoxon rank-sum z of group a vs b (normal approximation, tie and continuity correction); null if a side is empty. Positive: a higher. */
export function rankSumZ(a, b) {
  const nA = a.length;
  const nB = b.length;
  if (!nA || !nB) return null;
  const all = [...a.map((v) => [v, 1]), ...b.map((v) => [v, 0])].filter((x) => finite(x[0])).sort((x, y) => x[0] - y[0]);
  const N = all.length;
  let rankA = 0;
  let ties = 0;
  for (let i = 0; i < N; ) {
    let j = i;
    while (j + 1 < N && all[j + 1][0] === all[i][0]) j += 1;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) if (all[k][1]) rankA += avg;
    ties += (j - i + 1) ** 3 - (j - i + 1);
    i = j + 1;
  }
  const U = rankA - (nA * (nA + 1)) / 2;
  const sigma = Math.sqrt(((nA * nB) / 12) * (N + 1 - ties / (N * (N - 1))));
  if (!(sigma > 0)) return 0;
  const d = U - (nA * nB) / 2;
  return (d - 0.5 * Math.sign(d)) / sigma;
}

/**
 * Module score test: the module score (mean z of the selected genes per cell) is compared A vs B inside every patient with a
 * rank-sum test and the patient z scores are combined (Stouffer), as the per-gene tests of the panel.
 * Cells are not independent samples, so p is optimistic; the patient-level agreement is the safer evidence.
 * @returns { z, p, perPatient: [{ patient, z, delta, nA, nB }], nPatients, nConcordant, used: [...] } or null with no usable patient
 */
export function moduleTest(scaled, { minCells = 3 } = {}) {
  const per = [];
  (scaled || []).forEach((p) => {
    if (p.module.a.length < minCells || p.module.b.length < minCells) return;
    const z = rankSumZ(p.module.a, p.module.b);
    if (z == null) return;
    per.push({ patient: p.patient, z, delta: mean(p.module.a) - mean(p.module.b), nA: p.module.a.length, nB: p.module.b.length });
  });
  if (!per.length) return null;
  const z = per.reduce((s, x) => s + x.z, 0) / Math.sqrt(per.length);
  const sign = Math.sign(z);
  return { z, p: twoSidedP(z), perPatient: per, nPatients: per.length, nConcordant: per.filter((x) => Math.sign(x.delta) === sign && sign !== 0).length };
}

/* ----------------------------------------------------------- covariate filters */

/** Carriers (group A) and others (group B) summed over patients, number of patients, and the smallest per-patient group. */
export function covariateCounts(test) {
  const ps = test?.patients || [];
  const a = ps.reduce((s, p) => s + (p.n_a || 0), 0);
  const b = ps.reduce((s, p) => s + (p.n_b || 0), 0);
  return { a, b, k: ps.length, minA: ps.length ? Math.min(...ps.map((p) => p.n_a || 0)) : 0, minB: ps.length ? Math.min(...ps.map((p) => p.n_b || 0)) : 0 };
}

const SNV_CLASSES = ["trunc", "splice", "missense"];

/** Event (gene + classes) behind a driver test, or null for copy-number, clade and DM tests (no single event to fit to a tree). */
export function testEvent(test) {
  if (test?.family !== "driver" || !test.gene) return null;
  const cls = `${test.id}`.split(" ").pop();
  if (cls === "amp" || cls === "homdel") return { gene: test.gene, cls };
  if (cls === "snv") return { gene: test.gene, cls: SNV_CLASSES };
  return null;
}

/**
 * Clade F1 of a driver test's carriers on every tested patient's tree: [{ patient, f1 }] for patients with carriers on a tree,
 * and the summary { n, median, min, max }. `files` = { patient: { events, tree } } (unfiltered). Returns null when the test
 * has no event (copy number, clade, DM); `perPatient` is empty when no tested patient has a tree or carriers.
 */
export function testCladeF1(test, files) {
  const ev = testEvent(test);
  if (!ev) return null;
  const perPatient = eventF1ByPatient(files, (test.patients || []).map((p) => p.patient), ev.gene, ev.cls);
  return { perPatient, summary: f1Summary(perPatient.map((x) => x.f1)) };
}

/** Number of patients with F1 >= min among a testCladeF1 result. */
export const nF1AtLeast = (f1, min) => (f1?.perPatient || []).filter((x) => x.f1 >= min).length;

/**
 * Whether a test passes the covariate filters.
 * cfg: { minCarriers, minGroup, f1: { on, min, mode: "all" | "atleast", k } }
 * minCarriers: carriers summed over patients; minGroup: each of carriers and others summed over patients.
 * F1 filter on: tests without an event F1 (copy number, clade, DM, no tree) are hidden; "all" = every patient with the
 * event has F1 >= min; "atleast" = at least k patients do.
 */
export function passesCovariateFilters(test, f1, cfg = {}) {
  const c = covariateCounts(test);
  if (c.a < (cfg.minCarriers || 0)) return false;
  if (Math.min(c.a, c.b) < (cfg.minGroup || 0)) return false;
  const F = cfg.f1;
  if (F?.on) {
    if (!f1 || !f1.perPatient.length) return false;
    if (F.mode === "atleast") return nF1AtLeast(f1, F.min) >= (F.k || 1);
    return f1.perPatient.every((x) => x.f1 >= F.min);
  }
  return true;
}

/** Sort keys of the covariate list (descending unless noted). */
export const COVARIATE_SORTS = {
  robust: { label: "Robust genes", value: (t) => t.n_robust },
  carriers: { label: "Carrier cells", value: (t) => covariateCounts(t).a },
  others: { label: "Other cells", value: (t) => covariateCounts(t).b },
  f1: { label: "Median clade F1", value: (t, f1) => f1?.summary?.median ?? -1 },
};
