// RNA "key findings" of a single-cell patient, for the report and the cohort
// cards: the tumor cells' cell-state mix, clones enriched for a state, for
// cycling cells or for a sampled region (Fisher, clone vs the other tumor
// cells, BH across the tests), expression of copy-number drivers in their
// carrier cells vs the other cells, and each clone's top marker genes.
// Pure functions (the expression part is async: it yields to the browser).

import { benjaminiHochberg, differentialExpression, wilcoxonFromNonzero } from "./rnaStats";
import { chiSquareTable, fisherExact } from "./tests";

export const STATE_FIELDS = ["state", "Cell_State", "cell_state"];
export const REGION_FIELDS = ["Region_Annotation", "Region"];
export const MIN_CLONE_CELLS = 5; // matched RNA cells for a clone to be tested
export const MIN_MARKER_CELLS = 8; // per side, for clone marker genes
export const Q_CUTOFF = 0.05;

/** An amplified driver its carriers do not over-express (enough carriers, no shift). */
export const isSilentAmp = (x) => x.class === "amp" && !x.concordant && x.nA >= 5 && x.p > 0.2 && x.log2FC < 0.5;

const isNormal = (clone) => /^normal$/i.test(`${clone || ""}`);
const present = (v) => v != null && v !== "" && v !== "None" && v !== "NA";
const fieldOf = (rnaCells, names) => names.find((f) => rnaCells.some((c) => present(c[f])));
const isCycling = (phase) => /^(S|G2M|G2\/M)$/i.test(`${phase || ""}`);

/** RNA cells joined to their DNA clone: [{ row, clone, cell }] (tumor clones only). */
export function matchedTumorCells(rnaCells = [], cloneOf = new Map()) {
  const out = [];
  rnaCells.forEach((cell, row) => {
    if (!cell.cell_id || !cloneOf.has(cell.cell_id)) return;
    const clone = cloneOf.get(cell.cell_id);
    if (clone == null || isNormal(clone)) return;
    out.push({ row, clone: `${clone}`, cell });
  });
  return out;
}

/**
 * Composition of a categorical value per clone: chi-square across clones and,
 * per clone x level, Fisher's exact test of the clone vs the other tumor cells.
 * items: [{ clone, value }] (value null = not annotated, left out).
 */
export function cloneComposition(items, { minClone = MIN_CLONE_CELLS } = {}) {
  const kept = items.filter((x) => present(x.value));
  const levels = [...new Set(kept.map((x) => `${x.value}`))].sort();
  const counts = {};
  kept.forEach(({ clone, value }) => {
    counts[clone] = counts[clone] || Object.fromEntries(levels.map((l) => [l, 0]));
    counts[clone][`${value}`] += 1;
  });
  const sizeOf = (c) => levels.reduce((s, l) => s + counts[c][l], 0);
  const clones = Object.keys(counts).filter((c) => sizeOf(c) >= minClone).sort((a, b) => sizeOf(b) - sizeOf(a));
  const total = Object.fromEntries(levels.map((l) => [l, kept.filter((x) => `${x.value}` === l).length]));
  const n = kept.length;
  const tests = [];
  if (clones.length >= 2) {
    clones.forEach((clone) => {
      const size = sizeOf(clone);
      levels.forEach((level) => {
        const a = counts[clone][level];
        const b = size - a;
        const c = total[level] - a;
        const d = n - size - c;
        const { p, oddsRatio } = fisherExact(a, b, c, d);
        tests.push({ clone, level, n: a, size, fraction: size ? a / size : 0, otherFraction: n - size ? c / (n - size) : 0, p, oddsRatio });
      });
    });
    const q = benjaminiHochberg(tests.map((x) => x.p));
    tests.forEach((x, k) => (x.q = q[k]));
  }
  return {
    levels,
    counts,
    clones,
    total,
    n,
    p: clones.length >= 2 ? chiSquareTable(clones.map((c) => levels.map((l) => counts[c][l]))) : NaN,
    // clone x level over-represented in the clone (q < cutoff)
    enriched: tests.filter((x) => x.q < Q_CUTOFF && x.fraction > x.otherFraction).sort((a, b) => a.p - b.p),
    tests,
  };
}

/**
 * Metadata-only findings (no expression matrix needed): cell-state mix of the
 * tumor cells, state / cycling / region composition per DNA clone.
 * rnaCells: rna/cells.json records; cells: DNA cell records ({ cell_id, clone_id }).
 */
export function rnaMetaFindings({ rnaCells = [], cells = [] }) {
  const cloneOf = new Map(cells.map((c) => [c.cell_id, c.clone_id]));
  const matched = matchedTumorCells(rnaCells, cloneOf);
  // tumor RNA cells: linked to a tumor clone, or (RNA only) typed malignant
  const tumor = rnaCells.filter((c) => {
    if (c.cell_id && cloneOf.has(c.cell_id)) return !isNormal(cloneOf.get(c.cell_id));
    return /malignant|tumou?r/i.test(`${c.Cell_Type || ""}`);
  });
  const stateField = fieldOf(rnaCells, STATE_FIELDS);
  const regionField = fieldOf(rnaCells, REGION_FIELDS);
  const hasPhase = rnaCells.some((c) => present(c.Phase));

  let states = null;
  if (stateField) {
    const annotated = tumor.filter((c) => present(c[stateField]));
    const mix = {};
    annotated.forEach((c) => (mix[c[stateField]] = (mix[c[stateField]] || 0) + 1));
    const ranked = Object.entries(mix).sort((a, b) => b[1] - a[1]).map(([state, count]) => ({ state, count, share: count / annotated.length }));
    states = { field: stateField, n: annotated.length, mix: ranked, byClone: cloneComposition(matched.map((m) => ({ clone: m.clone, value: m.cell[stateField] }))) };
  }

  let cycling = null;
  if (hasPhase) {
    const phased = tumor.filter((c) => present(c.Phase));
    const byClone = cloneComposition(matched.filter((m) => present(m.cell.Phase)).map((m) => ({ clone: m.clone, value: isCycling(m.cell.Phase) ? "cycling" : "G1" })));
    const fractionOf = Object.fromEntries(byClone.clones.map((c) => [c, byClone.counts[c].cycling / ((byClone.counts[c].cycling || 0) + (byClone.counts[c].G1 || 0))]));
    const tests = byClone.tests.filter((x) => x.level === "cycling");
    cycling = {
      n: phased.length,
      fraction: phased.length ? phased.filter((c) => isCycling(c.Phase)).length / phased.length : NaN,
      byClone: fractionOf,
      p: byClone.p,
      // clones more / less proliferative than the rest (q < cutoff)
      high: tests.filter((x) => x.q < Q_CUTOFF && x.fraction > x.otherFraction),
      low: tests.filter((x) => x.q < Q_CUTOFF && x.fraction < x.otherFraction),
    };
  }

  let regions = null;
  if (regionField) {
    const byClone = cloneComposition(matched.map((m) => ({ clone: m.clone, value: m.cell[regionField] })));
    if (byClone.levels.length >= 2) regions = { field: regionField, byClone };
  }

  const tumorClones = new Set(cells.filter((c) => c.clone_id != null && !isNormal(c.clone_id)).map((c) => c.cell_id));
  return {
    nRna: rnaCells.length,
    nMatched: rnaCells.filter((c) => c.cell_id && cloneOf.has(c.cell_id)).length,
    nTumorMatched: matched.length,
    nTumorDna: tumorClones.size,
    nTumorRna: tumor.length,
    states,
    cycling,
    regions,
  };
}

const geneRow = (summary, gene) => summary.geneIndex.get(gene) ?? summary.geneIndex.get(`${gene}`.toUpperCase());

/** Expression of one gene in two sets of matrix rows: means, detection, log2FC (Seurat style), Wilcoxon p. */
export function compareGene(matrix, g, rowsA, rowsB) {
  const group = new Map();
  rowsA.forEach((r) => group.set(r, 1));
  rowsB.forEach((r) => group.set(r, 2));
  const a = [];
  const b = [];
  for (let k = matrix.indptr[g]; k < matrix.indptr[g + 1]; k += 1) {
    const which = group.get(matrix.indices[k]);
    if (which === 1) a.push(matrix.data[k]);
    else if (which === 2) b.push(matrix.data[k]);
  }
  const nA = rowsA.length;
  const nB = rowsB.length;
  const sum = (v) => v.reduce((s, x) => s + x, 0);
  const sumExp = (v) => v.reduce((s, x) => s + Math.expm1(x), 0);
  return {
    nA,
    nB,
    meanA: nA ? sum(a) / nA : NaN,
    meanB: nB ? sum(b) / nB : NaN,
    pctA: nA ? a.length / nA : NaN,
    pctB: nB ? b.length / nB : NaN,
    log2FC: Math.log2((sumExp(a) + 1) / Math.max(1, nA)) - Math.log2((sumExp(b) + 1) / Math.max(1, nB)),
    p: nA && nB ? wilcoxonFromNonzero(a, b, nA, nB).p : NaN,
  };
}

/**
 * Expression findings (needs the matrix): each amplified / deleted driver's
 * gene in its carrier cells vs the other DNA-linked cells, and each clone's
 * top up-regulated genes vs the other tumor cells.
 * drivers: patient report drivers ({ label, gene, class, event }).
 */
export async function rnaExpressionFindings({ summary, matrix, cells = [], drivers = [], onProgress = null, maxMarkers = 5 }) {
  const cloneOf = new Map(cells.map((c) => [c.cell_id, c.clone_id]));
  const linked = [];
  summary.cells.forEach((c, row) => c.cell_id && cloneOf.has(c.cell_id) && linked.push({ row, id: c.cell_id, clone: cloneOf.get(c.cell_id) }));

  const seen = new Set();
  const dosage = drivers
    .filter((d) => d.class === "amp" || d.class === "homdel")
    .map((d) => {
      const gene = `${d.gene || ""}`.split("::")[0];
      const g = geneRow(summary, gene);
      if (g == null || seen.has(gene)) return null;
      seen.add(gene);
      const carriers = new Set(`${d.event?.cell_ids || ""}`.split(",").filter(Boolean));
      const inRows = linked.filter((x) => carriers.has(x.id)).map((x) => x.row);
      const outRows = linked.filter((x) => !carriers.has(x.id)).map((x) => x.row);
      if (inRows.length < 3 || outRows.length < 3) return null;
      return { label: d.label, gene, class: d.class, clonality: d.clonality, ...compareGene(matrix, g, inRows, outRows) };
    })
    .filter(Boolean);
  const qd = benjaminiHochberg(dosage.map((x) => x.p));
  dosage.forEach((x, k) => {
    x.q = qd[k];
    // expressed with dosage: up in amplified carriers / down in deleted carriers
    x.concordant = x.q < Q_CUTOFF && (x.class === "amp" ? x.log2FC > 0 : x.log2FC < 0);
  });

  const tumorLinked = linked.filter((x) => x.clone != null && !isNormal(x.clone));
  const clones = [...new Set(tumorLinked.map((x) => `${x.clone}`))];
  const markers = [];
  for (let k = 0; k < clones.length; k += 1) {
    const clone = clones[k];
    const idxA = tumorLinked.filter((x) => `${x.clone}` === clone).map((x) => x.row);
    const idxB = tumorLinked.filter((x) => `${x.clone}` !== clone).map((x) => x.row);
    if (idxA.length >= MIN_MARKER_CELLS && idxB.length >= MIN_MARKER_CELLS) {
      // eslint-disable-next-line no-await-in-loop
      const rows = await differentialExpression(matrix, summary.genes, summary.cells.length, idxA, idxB, { minPct: 0.1 });
      const up = rows.filter((r) => r.p_val_adj < Q_CUTOFF && r.avg_log2FC >= 1 && r.pct_1 >= 0.25).slice(0, maxMarkers);
      const down = rows.filter((r) => r.p_val_adj < Q_CUTOFF && r.avg_log2FC <= -1 && r.pct_2 >= 0.25).slice(0, maxMarkers);
      markers.push({ clone, n: idxA.length, nOther: idxB.length, up, down, nSignificant: rows.filter((r) => r.p_val_adj < Q_CUTOFF).length });
    }
    if (onProgress) onProgress((k + 1) / Math.max(1, clones.length));
  }
  return { dosage, markers };
}

/**
 * Ranked one-line findings for the report summary and the cohort cards:
 * [{ kind, ...params }], strongest first. expr may be null (matrix not loaded).
 */
export function rnaHeadlines(meta, expr = null) {
  if (!meta || !meta.nRna) return [];
  const out = [];
  if (meta.states?.mix.length) out.push({ kind: "state-mix", field: meta.states.field, mix: meta.states.mix.slice(0, 3), n: meta.states.n });
  (meta.states?.byClone.enriched || []).slice(0, 3).forEach((x) => out.push({ kind: "clone-state", clone: x.clone, state: x.level, fraction: x.fraction, otherFraction: x.otherFraction, p: x.p, q: x.q }));
  (meta.cycling?.high || []).forEach((x) => out.push({ kind: "clone-cycling", clone: x.clone, fraction: x.fraction, otherFraction: x.otherFraction, p: x.p, q: x.q }));
  // with two clones the less-cycling clone just mirrors the other one
  if (!meta.cycling?.high.length) (meta.cycling?.low || []).forEach((x) => out.push({ kind: "clone-quiescent", clone: x.clone, fraction: x.fraction, otherFraction: x.otherFraction, p: x.p, q: x.q }));
  (meta.regions?.byClone.enriched || []).slice(0, 2).forEach((x) => out.push({ kind: "clone-region", clone: x.clone, region: x.level, fraction: x.fraction, otherFraction: x.otherFraction, p: x.p, q: x.q }));
  if (expr) {
    expr.dosage.filter((x) => x.concordant).forEach((x) => out.push({ kind: "dosage", gene: x.gene, class: x.class, log2FC: x.log2FC, pctA: x.pctA, pctB: x.pctB, nA: x.nA, nB: x.nB, p: x.p, q: x.q }));
    expr.dosage.filter(isSilentAmp).forEach((x) => out.push({ kind: "silent-amp", gene: x.gene, log2FC: x.log2FC, nA: x.nA, nB: x.nB, p: x.p }));
    expr.markers.filter((m) => m.up.length).forEach((m) => out.push({ kind: "clone-markers", clone: m.clone, genes: m.up.map((r) => r.gene), n: m.n, nSignificant: m.nSignificant, p: m.up[0].p_val_adj }));
  }
  return out;
}

/**
 * Cohort-level RNA highlights from each patient's findings:
 * { patient: { meta, expr } } -> dominant states, clone-state associations,
 * drivers expressed with dosage (gene -> patients), recurrent clone markers.
 */
export function cohortRnaHighlights(byPatient = {}) {
  const patients = Object.entries(byPatient).filter(([, v]) => v?.meta?.nRna);
  const dominant = patients
    .filter(([, v]) => v.meta.states?.mix.length)
    .map(([patient, v]) => ({ patient, state: v.meta.states.mix[0].state, share: v.meta.states.mix[0].share }));
  const stateCounts = {};
  dominant.forEach((d) => (stateCounts[d.state] = (stateCounts[d.state] || 0) + 1));
  const cloneState = patients
    .flatMap(([patient, v]) => (v.meta.states?.byClone.enriched || []).map((x) => ({ patient, clone: x.clone, state: x.level, fraction: x.fraction, q: x.q })));
  const cloneStatePatients = new Set(cloneState.map((x) => x.patient));
  const testedStatePatients = patients.filter(([, v]) => (v.meta.states?.byClone.clones.length || 0) >= 2).map(([p]) => p);
  const cycling = patients
    .filter(([, v]) => Number.isFinite(v.meta.cycling?.fraction))
    .map(([patient, v]) => ({ patient, fraction: v.meta.cycling.fraction, high: v.meta.cycling.high.map((x) => x.clone) }))
    .sort((a, b) => b.fraction - a.fraction);
  const dosage = {};
  const silent = {};
  patients.forEach(([patient, v]) => {
    (v.expr?.dosage || []).forEach((x) => {
      if (x.concordant) (dosage[x.gene] = dosage[x.gene] || []).push({ patient, log2FC: x.log2FC, class: x.class });
      else if (isSilentAmp(x)) (silent[x.gene] = silent[x.gene] || []).push({ patient });
    });
  });
  const markerPatients = {};
  patients.forEach(([patient, v]) => (v.expr?.markers || []).forEach((m) => m.up.forEach((r) => {
    markerPatients[r.gene] = markerPatients[r.gene] || new Set();
    markerPatients[r.gene].add(patient);
  })));
  const recurrentMarkers = Object.entries(markerPatients)
    .filter(([, s]) => s.size >= 2)
    .map(([gene, s]) => ({ gene, patients: [...s].sort() }))
    .sort((a, b) => b.patients.length - a.patients.length || a.gene.localeCompare(b.gene));
  return {
    nPatients: patients.length,
    nExpr: patients.filter(([, v]) => v.expr).length,
    dominant,
    stateCounts: Object.entries(stateCounts).sort((a, b) => b[1] - a[1]).map(([state, count]) => ({ state, count })),
    cloneState,
    cloneStatePatients: [...cloneStatePatients].sort(),
    testedStatePatients,
    cycling,
    dosage: Object.entries(dosage).map(([gene, list]) => ({ gene, patients: list })).sort((a, b) => b.patients.length - a.patients.length || a.gene.localeCompare(b.gene)),
    silent: Object.entries(silent).map(([gene, list]) => ({ gene, patients: list.map((x) => x.patient) })),
    recurrentMarkers,
  };
}
