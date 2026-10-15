// Sub-views of the Single-Cell Cohort tab, in order of importance, grouped,
// labels and one-line purposes live in translations
// (cohort.view-<key>, cohort.purpose-<key>, cohort.group-<group>). Pure data + helpers.

export const COHORT_VIEW_GROUPS = ["findings", "genome", "rna", "explore"];

export const COHORT_VIEWS = [
  { key: "overview", group: "findings" },
  { key: "reports", group: "findings" },
  { key: "story", group: "findings" },
  { key: "figures", group: "findings" },
  { key: "drivers", group: "genome" },
  { key: "oncoprint", group: "genome" },
  { key: "amplicons", group: "genome" },
  { key: "ecplast", group: "genome" },
  { key: "treeshape", group: "genome" },
  { key: "aligned", group: "genome" },
  { key: "associations", group: "genome" },
  { key: "eventassoc", group: "genome" },
  { key: "mutations", group: "genome" },
  { key: "clades", group: "genome" },
  { key: "rna", group: "rna" },
  { key: "rnacovde", group: "rna" },
  { key: "cnexpr", group: "rna" },
  { key: "events", group: "explore" },
  { key: "scatter", group: "explore" },
  { key: "qc", group: "explore" },
];

const KEYS = new Set(COHORT_VIEWS.map((v) => v.key));

/** The view to open: a known key, else the overview. */
export function resolveCohortView(key) {
  return KEYS.has(key) ? key : "overview";
}

/** View record by key (overview for unknown keys). */
export function cohortView(key) {
  return COHORT_VIEWS.find((v) => v.key === resolveCohortView(key));
}

/** Whether a view starts a new group in the tab bar (gets a divider before it). */
export function startsGroup(key) {
  const k = COHORT_VIEWS.findIndex((v) => v.key === key);
  return k > 0 && COHORT_VIEWS[k - 1].group !== COHORT_VIEWS[k].group;
}
