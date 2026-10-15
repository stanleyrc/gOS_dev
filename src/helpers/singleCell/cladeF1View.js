// Clade F1 of an event's carriers on the patient tree, as shown in every cohort events list (d3-free).
// The score is cladeFitScore (best F1 between the carriers and one clade of the tree); the header
// "Clade F1 >=" filter hides events below the threshold in every cohort view, so tooltips say so.
import { cladeFitScore } from "./cladeFit";
import { eventClass, eventLabel } from "./cohortStats";

export const F1_HIGH = 0.8;
export const F1_LOW = 0.5;

/** Colour and weight of a Clade F1 value: red below 0.5, green and bold from 0.8 (the All events table scale). */
export function f1Style(v) {
  if (!Number.isFinite(v)) return {};
  return { color: v < F1_LOW ? "#cf1322" : v >= F1_HIGH ? "#237804" : undefined, fontWeight: v >= F1_HIGH ? 600 : 400 };
}

const idsOf = (event) => `${event?.cell_ids || ""}`.split(",").filter(Boolean);

/** Clade F1 of one event's carriers on a tree layout; null without a tree or carriers. */
export function f1Of(event, tree) {
  if (!tree) return null;
  const s = cladeFitScore(idsOf(event), tree).score;
  return Number.isFinite(s) ? s : null;
}

/** Clade F1 of the union of the carriers of every event of `gene` and class `cls` in one patient; null when none. */
export function geneF1(events, tree, gene, cls) {
  if (!tree) return null;
  const ids = new Set();
  (events || []).forEach((e) => {
    const okCls = !cls || (Array.isArray(cls) ? cls.includes(eventClass(e)) : eventClass(e) === cls);
    if (`${eventLabel(e)}`.toUpperCase() === `${gene}`.toUpperCase() && okCls) idsOf(e).forEach((c) => ids.add(c));
  });
  if (!ids.size) return null;
  const s = cladeFitScore([...ids], tree).score;
  return Number.isFinite(s) ? s : null;
}

/** Per-patient Clade F1 of an event (gene + class) over { patient: { events, tree } }: [{ patient, f1 }] for patients with carriers. */
export function eventF1ByPatient(files, patients, gene, cls) {
  return (patients || [])
    .map((p) => ({ patient: p, f1: geneF1(files?.[p]?.events, files?.[p]?.tree, gene, cls) }))
    .filter((r) => r.f1 != null);
}

/** Median / min / max of the finite values (null when none). */
export function f1Summary(values) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = (v.length - 1) / 2;
  return { n: v.length, median: (v[Math.floor(m)] + v[Math.ceil(m)]) / 2, min: v[0], max: v[v.length - 1] };
}

/** Events of each patient that the Clade F1 filter hides: { perPatient: { id: n }, total }. */
export function hiddenByF1(rawFiles, files) {
  const perPatient = {};
  let total = 0;
  Object.entries(rawFiles || {}).forEach(([id, f]) => {
    const n = (f?.events?.length || 0) - (files?.[id]?.events?.length || 0);
    if (n > 0) {
      perPatient[id] = n;
      total += n;
    }
  });
  return { perPatient, total };
}

/** Tooltip text of a Clade F1 value, with the link to the header filter ({ on, min, hidden } from the cohort header). */
export function f1Tooltip(v, filter = null) {
  const base = Number.isFinite(v) ? `Clade F1 ${v.toFixed(2)}: best F1 between the carrier cells and one clade of the patient's tree (1 = the carriers are exactly one clade)` : "Clade F1 not available (no tree or no carrier cells)";
  if (!filter) return base;
  const rule = filter.on
    ? `The header "Clade F1 >= ${filter.min}" filter is on: events below ${filter.min} are hidden in every cohort view (${filter.hidden || 0} hidden now).`
    : 'The header "Clade F1" filter is off: no event is hidden by it.';
  return `${base}. ${rule}`;
}

const FINDING_CLASSES = { amp: ["amp"], gain: ["amp"], ecdna: ["amp"], homdel: ["homdel"], snv: ["trunc", "splice", "missense"] };

/**
 * Clade F1 of the filtered events behind a Key findings entry (amp / gain / ecDNA / homdel / SNV findings of one gene):
 * carriers of that gene's events of the finding's class on the patient tree. Null for findings that are not one
 * gene's filtered event (complex SVs, RNA, phenotype) or without a matching event: nothing is guessed.
 */
export function findingF1(finding, events, tree) {
  const classes = FINDING_CLASSES[finding?.kind];
  const gene = finding?.genes?.[0] || `${finding?.short || ""}`.split(/\s+/)[0];
  if (!classes || !gene) return null;
  return geneF1(events, tree, gene, classes);
}
