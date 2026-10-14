// Cross-patient associations of driver / copy-number events with cell state and RNA programs
// (_cohort/event_associations.json from srctools gos_sc_cohort_event_assoc.py). d3-free.
//
// Each result row = one event x one outcome: per-patient effects (carriers vs non-carriers of the event
// inside the patient) and their random-effects / Stouffer combination.

export const OUTCOME_KINDS = {
  state: (o) => /state$/.test(o),
  cycling: (o) => /cycling|score$|genes$/i.test(o),
  program: (o) => /-like$|^Hypoxia$|^Interferon$/.test(o),
};

/** Short measure name for display. */
export const measureOf = (row) => (row.measure === "log odds ratio" ? "log OR" : "Hedges g");

/** Rows with a combined estimate (at least minK patients), sorted by the best combined q. */
export function summaryRows(data, { minK = 2, maxQ = 1, events = null, outcomes = null, classes = null, direction = "any" } = {}) {
  const evSet = events && events.length ? new Set(events) : null;
  const outSet = outcomes && outcomes.length ? new Set(outcomes) : null;
  const clsSet = classes && classes.length ? new Set(classes) : null;
  return (data?.results || [])
    .filter((r) => r.k >= minK && Number.isFinite(r.p))
    .filter((r) => (evSet ? evSet.has(r.event) : true) && (outSet ? outSet.has(r.outcome) : true) && (clsSet ? clsSet.has(r.cls) : true))
    .filter((r) => Math.min(r.q ?? 1, r.stouffer_q ?? 1) <= maxQ)
    .filter((r) => (direction === "up" ? r.effect > 0 : direction === "down" ? r.effect < 0 : true))
    .map((r) => ({ ...r, key: `${r.event}|${r.outcome}`, bestQ: Math.min(r.q ?? 1, r.stouffer_q ?? 1), concordant: r.k_up === r.k || r.k_up === 0 }))
    .sort((a, b) => a.bestQ - b.bestQ || a.p - b.p);
}

/** Distinct outcomes and events in the data, for the pickers. */
export function pickers(data) {
  const outcomes = [...new Set((data?.results || []).map((r) => r.outcome))];
  const events = (data?.events || []).map((e) => ({ event: e.event, label: e.label, cls: e.cls, nPatients: e.patients.length }));
  return { outcomes, events };
}

/**
 * Forest-plot rows of one result: one per patient, then the combined random-effects estimate.
 * Interval = effect +- 1.96 se.
 */
export function forestOf(row) {
  if (!row) return [];
  const per = (row.per_patient || []).map((p) => ({ label: p.patient, effect: p.effect, lo: p.effect - 1.96 * p.se, hi: p.effect + 1.96 * p.se, p: p.p, n: p.n_carriers, kind: "patient" }));
  if (row.k >= 2 && Number.isFinite(row.effect)) per.push({ label: "Combined (random effects)", effect: row.effect, lo: row.lo, hi: row.hi, p: row.p, n: per.reduce((s, r) => s + r.n, 0), kind: "pooled" });
  return per;
}

/** Symmetric-ish x domain covering every interval and zero, padded; clipped at +-clip. */
export function forestDomain(rows, clip = 8) {
  const vals = rows.flatMap((r) => [r.lo, r.hi, r.effect]).filter(Number.isFinite);
  const lo = Math.max(-clip, Math.min(0, ...vals));
  const hi = Math.min(clip, Math.max(0, ...vals));
  const pad = (hi - lo) * 0.05 || 0.5;
  return [lo - pad, hi + pad];
}

/** One-sentence reading of a result. */
export function describeRow(row) {
  if (!row) return "";
  const dir = row.effect > 0 ? "higher" : "lower";
  const name = /score$/i.test(row.outcome) ? row.outcome : `${row.outcome} score`;
  const what = row.measure === "log odds ratio" ? `${row.outcome} is ${row.effect > 0 ? "more" : "less"} likely` : `the ${name} is ${dir}`;
  const kk = `${row.k_up} of ${row.k} patients point up`;
  return `${what} in carriers of ${row.label} than in non-carriers of the same patient (${measureOf(row)} ${row.effect >= 0 ? "+" : ""}${row.effect.toFixed(2)}, random-effects p ${fmtP(row.p)}; Stouffer z ${Number.isFinite(row.stouffer_z) ? row.stouffer_z.toFixed(1) : "n/a"}, best q ${fmtP(row.bestQ ?? row.q)}; ${kk}).`;
}

export function fmtP(p) {
  if (!Number.isFinite(p)) return "n/a";
  if (p >= 0.01) return p.toFixed(2);
  return p.toExponential(1).replace("e-", "e-").replace("e+", "e");
}

/** Event x outcome matrix of the combined Stouffer z (heatmap): events ranked by their best q, capped. */
export function zMatrix(data, { maxEvents = 25, minK = 2 } = {}) {
  const rows = summaryRows(data, { minK });
  const bestByEvent = new Map();
  rows.forEach((r) => {
    if (!bestByEvent.has(r.event) || r.bestQ < bestByEvent.get(r.event)) bestByEvent.set(r.event, r.bestQ);
  });
  const events = [...bestByEvent.entries()].sort((a, b) => a[1] - b[1]).slice(0, maxEvents).map(([e]) => e);
  const outcomes = [...new Set(rows.map((r) => r.outcome))];
  const cell = new Map(rows.map((r) => [`${r.event}|${r.outcome}`, r]));
  const labelOf = new Map(rows.map((r) => [r.event, r.label]));
  return { events: events.map((e) => ({ event: e, label: labelOf.get(e) })), outcomes, cell };
}
