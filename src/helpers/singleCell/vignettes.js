// Per-patient vignettes: ranked one-sentence findings with their numbers and
// evidence links, a clone-structure line and a caveat line. Precomputed by
// analysis/story/scripts/vignettes.py into <dataPath>_cohort/vignettes.json
// (format gos-sc-vignettes/1). Pure helpers (no d3, no React) so jest can
// test them; the components map the action descriptors to redux dispatches.

export const VIGNETTES_FORMAT = "gos-sc-vignettes/1";

export const EVIDENCE_KINDS = ["cn", "cells", "walk", "igv", "driver", "event", "expr", "splice", "tab"];
export const CATEGORIES = ["truncal", "subclonal", "rna", "phenotype"];

const asArray = (v) => (Array.isArray(v) ? v : []);
const num = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

function normalizeEvidence(e) {
  if (!e || typeof e !== "object" || !EVIDENCE_KINDS.includes(e.kind)) return null;
  const out = { ...e, label: `${e.label || e.kind}` };
  if (e.kind === "cn" && !(e.chromosome && num(e.start) != null && num(e.end) != null)) return null;
  if (e.kind === "igv" && !(e.chromosome && num(e.position) != null && e.cells)) return null;
  if (e.kind === "walk" && !asArray(e.walks).length) return null;
  if ((e.kind === "driver" || e.kind === "event") && !e.key) return null;
  if (e.kind === "tab" && !e.tab) return null;
  return out;
}

function normalizeFinding(f, i) {
  if (!f || typeof f.text !== "string" || !f.text) return null;
  return {
    id: `${f.id || i + 1}`,
    rank: num(f.rank) ?? i + 1,
    kind: `${f.kind || ""}`,
    category: CATEGORIES.includes(f.category) ? f.category : "truncal",
    short: `${f.short || ""}`,
    text: f.text,
    score: num(f.score),
    genes: asArray(f.genes).map(String),
    stats: f.stats && typeof f.stats === "object" ? f.stats : {},
    plot: f.plot && typeof f.plot === "object" ? f.plot : null,
    evidence: asArray(f.evidence).map(normalizeEvidence).filter(Boolean),
  };
}

/** Validated vignettes file: { generated, patients: { id: vignette } }, null when not a vignettes file. */
export function normalizeVignettes(raw) {
  if (!raw || typeof raw !== "object" || raw.format !== VIGNETTES_FORMAT) return null;
  const patients = {};
  Object.entries(raw.patients || {}).forEach(([id, v]) => {
    if (!v || typeof v !== "object") return;
    const findings = asArray(v.findings).map(normalizeFinding).filter(Boolean).sort((a, b) => a.rank - b.rank);
    const groups = {};
    Object.entries(v.groups || {}).forEach(([k, cells]) => (groups[k] = asArray(cells).map(String)));
    patients[id] = {
      patient: `${v.patient || id}`,
      nCells: num(v.n_cells),
      nTumor: num(v.n_tumor),
      nNormal: num(v.n_normal),
      nRnaLinked: num(v.n_rna_linked),
      tree: v.tree === "snv" ? "snv" : "cn",
      hasClones: Boolean(v.has_clones),
      findings,
      clones: {
        text: `${v.clones?.text || ""}`,
        list: asArray(v.clones?.clones).map((c) => ({ clone: `${c.clone}`, n: num(c.n) ?? 0, defining: asArray(c.defining).map(String), cells: c.cells || null })),
      },
      caveat: `${v.caveat || ""}`,
      groups,
    };
  });
  return { generated: raw.generated || null, patients };
}

/** Cells of a group id (or an explicit list), [] when unknown. */
export function groupCells(vignette, ref) {
  if (Array.isArray(ref)) return ref.map(String);
  return (ref && vignette?.groups?.[ref]) || [];
}

/**
 * What an evidence chip does, as a plain descriptor the component dispatches:
 *   { type: "zoom", tab: "7", location, select }     CN heatmap on the region, carriers selected
 *   { type: "select", tab: "7", select }            tree / heatmap with the cells selected
 *   { type: "walks", tab: "14", walks }             ecDNA tab with these walks drawn, first highlighted
 *   { type: "igv", view }                           in-place IGV of carrier reads (drawer)
 *   { type: "driver", tab: "17", key }              Drivers tab on this driver
 *   { type: "event", key }                          the event's detail popup (filtered-event modal)
 *   { type: "plot", plot }                          in-place expression plot (drawer)
 *   { type: "splice", findingId, gene }             in-place IGV of RNA reads at the junction (drawer)
 *   { type: "tab", tab }                            open a tab
 * null when the evidence cannot be shown (e.g. a plot chip without a plot).
 */
export function evidenceAction(evidence, finding, vignette) {
  if (!evidence) return null;
  switch (evidence.kind) {
    case "cn":
      return { type: "zoom", tab: "7", location: `${evidence.chromosome}:${Math.round(evidence.start)}-${Math.round(evidence.end)}`, select: groupCells(vignette, evidence.cells) };
    case "cells":
      return { type: "select", tab: "7", select: groupCells(vignette, evidence.cells) };
    case "walk":
      return { type: "walks", tab: "14", walks: asArray(evidence.walks).map(String) };
    case "igv": {
      const cellIds = groupCells(vignette, evidence.cells).slice(0, 6);
      if (!cellIds.length) return null;
      const loci = asArray(evidence.loci)
        .map((l) => ({ chromosome: `${l.chromosome}`, position: Number(l.position) }))
        .filter((l) => Number.isFinite(l.position));
      return { type: "igv", view: { cellIds, chromosome: `${evidence.chromosome}`, position: Number(evidence.position), loci: loci.length > 1 ? loci : undefined, label: finding?.short || evidence.label } };
    }
    case "driver":
      return { type: "driver", tab: "17", key: evidence.key };
    case "event":
      return { type: "event", key: evidence.key };
    case "expr":
      return finding?.plot ? { type: "plot", plot: finding.plot } : null;
    case "splice":
      return evidence.finding ? { type: "splice", findingId: `${evidence.finding}`, gene: evidence.gene || "" } : null;
    case "tab":
      return { type: "tab", tab: `${evidence.tab}` };
    default:
      return null;
  }
}

/** Five-number summary for a box: { n, min, q1, median, q3, max }. */
export function boxStats(values) {
  const v = asArray(values).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const q = (p) => {
    const i = (v.length - 1) * p;
    const lo = Math.floor(i);
    const hi = Math.ceil(i);
    return v[lo] + (v[hi] - v[lo]) * (i - lo);
  };
  return { n: v.length, min: v[0], q1: q(0.25), median: q(0.5), q3: q(0.75), max: v[v.length - 1] };
}

/** [min, max] over numbers (padded when flat). */
export function extent(values) {
  const v = asArray(values).map(Number).filter(Number.isFinite);
  if (!v.length) return [0, 1];
  let lo = Math.min(...v);
  let hi = Math.max(...v);
  if (lo === hi) {
    lo -= 0.5;
    hi += 0.5;
  }
  return [lo, hi];
}

/** Linear map of a domain onto a range. */
export const linear = ([d0, d1], [r0, r1]) => (x) => r0 + ((x - d0) / (d1 - d0 || 1)) * (r1 - r0);

/** Deterministic jitter in [-1, 1] for the k-th point (strip plots without randomness). */
export const jitter = (k) => (((k * 2654435761) % 1000) / 1000) * 2 - 1;

/** Cohort rows for the Key findings list: one per patient in `order` that has a vignette. */
export function cohortVignetteRows(vignettes, order = null) {
  if (!vignettes) return [];
  const ids = order && order.length ? order.filter((id) => vignettes.patients[id]) : Object.keys(vignettes.patients).sort();
  return ids.map((id) => ({ id, vignette: vignettes.patients[id] }));
}

/** Split a finding text into a lead (up to the first colon / semicolon, max ~70 chars) and the rest, for a bold lead. */
export function splitLead(text) {
  const s = `${text || ""}`;
  const m = s.match(/^(.{8,90}?)([:;])\s/);
  if (!m) return { lead: "", rest: s };
  return { lead: m[1], rest: s.slice(m[0].length) };
}
