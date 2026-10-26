// Sub-views of the Single-Cell Cohort tab, in order of importance, grouped,
// labels and one-line purposes live in translations
// (cohort.view-<key>, cohort.purpose-<key>, cohort.group-<group>). Pure data + helpers.

export const COHORT_VIEW_GROUPS = ["paper", "findings", "genome", "evolution", "rna", "explore", "guide"];

// one tab per manuscript figure, in the paper's order (paperFigureId maps a key to the manifest's figure label)
export const PAPER_FIGURE_TABS = ["1", "3", "4", "5", "6", "S1", "S3", "S6", "S7", "V1", "V2", "V3", "V4", "V5", "V6"];

export const COHORT_VIEWS = [
  ...PAPER_FIGURE_TABS.map((n) => ({ key: `paperfig${n}`, group: "paper" })),
  { key: "overview", group: "findings" },
  { key: "portrait", group: "findings" },
  { key: "reports", group: "findings" },
  { key: "story", group: "findings" },
  { key: "drivers", group: "genome" },
  { key: "subclonal", group: "genome" },
  { key: "oncoprint", group: "genome" },
  { key: "tsghits", group: "genome" },
  { key: "clinical", group: "genome" },
  { key: "amplicons", group: "genome" },
  { key: "ecplast", group: "genome" },
  { key: "mutations", group: "genome" },
  { key: "treeshape", group: "evolution" },
  { key: "aligned", group: "evolution" },
  { key: "associations", group: "evolution" },
  { key: "eventassoc", group: "evolution" },
  { key: "clades", group: "evolution" },
  { key: "rna", group: "rna" },
  { key: "rnacovde", group: "rna" },
  { key: "cnexpr", group: "rna" },
  { key: "events", group: "explore" },
  { key: "catalog", group: "explore" },
  { key: "scatter", group: "explore" },
  { key: "qc", group: "explore" },
  { key: "figures", group: "explore" },
  { key: "welcome", group: "guide" },
  { key: "methods", group: "guide" },
  { key: "concepts", group: "guide" },
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

/** Views of one group, in tab order. */
export const viewsInGroup = (group) => COHORT_VIEWS.filter((v) => v.group === group);

/** Figure label ("Fig 4") of a paper-figure tab key ("paperfig4"), else null. */
export function paperFigureLabel(key) {
  const m = /^paperfig([A-Z]?\d+)$/.exec(`${key ?? ""}`);
  return m ? `Fig ${m[1]}` : null;
}
