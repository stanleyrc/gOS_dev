// ecDNA plasticity (_cohort/ecdna_plasticity.json and <patient>/ecdna_plasticity.json
// from srctools gos_sc_ecdna_plasticity.py). Pure helpers, d3-free.
//
// A row is one patient x oncogene with, per copy-number source ("walk" = ecDNA
// walk copies, "total" = the gene's total CN from the per-cell CN calls):
// CV, heritability on the DNA tree (nearest-relative rho, permutation null
// within clone), the CN-state effect and the effect of the CN residual after
// the clade mean (the plasticity test).

export const SOURCES = ["total", "walk"];
export const HERITABLE_RHO = 0.3;
export const Q_CUT = 0.1;

/** Heritable on the tree: nearest-relative rho high AND beats the within-clone permutation null. */
export function isHeritable(src) {
  const h = src?.heritability;
  return !!h && h.rho >= HERITABLE_RHO && h.p_within_clone < 0.05;
}

/** Residual (clade-corrected) CN explains some state/program at q < Q_CUT. */
export function residualLinked(src) {
  const r = src?.top_resid;
  return !!r && Number.isFinite(r.q_resid) && r.q_resid < Q_CUT;
}

/** "plastic" = state-linked CN variation that the tree does not explain. */
export function quadrant(src) {
  if (!src) return "none";
  const her = isHeritable(src);
  const link = residualLinked(src);
  if (link && !her) return "plastic";
  if (link && her) return "lineage-bound";
  if (!link && her) return "heritable";
  return "unlinked";
}

/** Flat table rows for one source; rows lacking that source are dropped. */
export function plasticityRows(data, source) {
  if (!data?.rows) return [];
  return data.rows
    .filter((r) => r.sources?.[source])
    .map((r) => {
      const s = r.sources[source];
      return {
        key: `${r.patient}|${r.gene}|${source}`,
        patient: r.patient,
        gene: r.gene,
        source,
        nCells: r.n_cells,
        nRna: r.n_rna,
        mean: s.mean,
        cv: s.cv,
        cvWithinClone: s.cv_within_clone,
        fracHigh: s.frac_high,
        herRho: s.heritability?.rho ?? null,
        herP: s.heritability?.p_within_clone ?? null,
        stateOutcome: s.top_state?.label ?? null,
        stateBeta: s.top_state?.beta ?? null,
        stateQ: s.top_state?.q ?? null,
        residOutcome: s.top_resid?.label ?? null,
        residBeta: s.top_resid?.beta_resid ?? null,
        residQ: s.top_resid?.q_resid ?? null,
        exprRho: s.expr?.rho ?? null,
        quadrant: quadrant(s),
      };
    });
}

/** Scatter points: x = tree heritability, y = |residual-state effect| (outcome SD per CN SD). */
export function scatterPoints(rows) {
  return rows
    .filter((r) => Number.isFinite(r.herRho) && Number.isFinite(r.residBeta))
    .map((r) => ({ ...r, x: r.herRho, y: Math.abs(r.residBeta), sig: Number.isFinite(r.residQ) && r.residQ < Q_CUT }));
}

/** Where the plastic quadrant starts on the scatter: low heritability, a residual effect that is significant. */
export function plasticBounds(points) {
  const sig = points.filter((p) => p.sig).map((p) => p.y);
  return { xMax: HERITABLE_RHO, yMin: sig.length ? Math.min(...sig) : null };
}

/** Pearson-free helper: min / max of finite numbers. */
export function extent(values) {
  const v = values.filter(Number.isFinite);
  return v.length ? [Math.min(...v), Math.max(...v)] : [0, 1];
}

/** Genes available in a patient detail file, plasticity-ranked (plastic first, then by residual q). */
export function detailGenes(detail) {
  const rows = detail?.rows || [];
  const rank = (r) => {
    const qs = Object.values(r.sources).map((s) => s.top_resid?.q_resid).filter(Number.isFinite);
    return qs.length ? Math.min(...qs) : 1;
  };
  return rows.slice().sort((a, b) => rank(a) - rank(b)).map((r) => r.gene);
}

/** Sources present for a gene in a patient detail file. */
export function detailSources(detail, gene) {
  const row = (detail?.rows || []).find((r) => r.gene === gene);
  return SOURCES.filter((s) => row?.sources?.[s]);
}

/** Outcomes (programs, states, cycling) with a test for this gene+source, best residual p first. */
export function detailOutcomes(detail, gene, source) {
  const row = (detail?.rows || []).find((r) => r.gene === gene);
  const tests = row?.sources?.[source]?.tests || [];
  return tests.slice().sort((a, b) => a.p_resid - b.p_resid);
}

/**
 * Points for the patient card: CN (walk or total) or its clade residual against one outcome,
 * one per cell with RNA. Returns [] when the gene/source/outcome is not in the file.
 */
export function cardPoints(detail, gene, source, outcome, useResidual = false) {
  const g = detail?.genes?.[gene];
  const o = detail?.outcomes?.[outcome];
  if (!g || !o || !g[source]) return [];
  const cn = useResidual ? g[`${source}_resid`] : g[source];
  const out = [];
  g.ids.forEach((id, i) => {
    const y = o.values[i];
    const x = cn?.[i];
    if (y == null || x == null || !Number.isFinite(x) || !Number.isFinite(y)) return;
    out.push({ id, x, y, clone: g.clone[i], clade: g.clade[i] });
  });
  return out;
}

/** "beta 0.27 (q 0.07)" style text. */
export function fmtEffect(beta, q) {
  if (!Number.isFinite(beta)) return "n/a";
  const b = `${beta >= 0 ? "+" : ""}${beta.toFixed(2)}`;
  if (!Number.isFinite(q)) return b;
  return `${b} (q ${q < 0.001 ? "<0.001" : q.toFixed(3)})`;
}

export const QUADRANT_LABEL = {
  plastic: "Plastic: state-linked CN variation the tree does not explain",
  "lineage-bound": "Lineage-bound: CN tracks the tree and the state",
  heritable: "Heritable CN, no state link",
  unlinked: "No heritable or state-linked CN signal",
  none: "No data",
};
