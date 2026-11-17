// Sub-views of the Single-Cell Cohort tab, in order of importance, grouped,
// labels and one-line purposes live in translations
// (cohort.view-<key>, cohort.purpose-<key>, cohort.group-<group>). Pure data + helpers.

export const COHORT_VIEW_GROUPS = ["paper", "findings", "genome", "evolution", "rna", "explore", "guide"];

// one tab per manuscript figure, in the paper's order (paperFigureId maps a key to the manifest's figure label)
// outline v7 (2026-11-17): main figures 1-7 and supplements S8-S16; the 11-09 set (S1, S3, S6, S7, V1-V6) stays reachable
// as "previous" builds through each figure's version menu and through old links (LEGACY_PAPER_TABS)
export const PAPER_FIGURE_TABS = ["1", "2", "3", "4", "5", "6", "7", "S8", "S9", "S10", "S11", "S12", "S13", "S14", "S15", "S16c"];
export const LEGACY_PAPER_TABS = ["S1", "S3", "S6", "S7", "V1", "V2", "V3", "V4", "V5", "V6"];

export const COHORT_VIEWS = [
  ...PAPER_FIGURE_TABS.map((n) => ({ key: `paperfig${n}`, group: "paper" })),
  ...LEGACY_PAPER_TABS.map((n) => ({ key: `paperfig${n}`, group: "paper", legacy: true })),
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
  { key: "bulk", group: "genome" },
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

const PAPER_KEY = /^paperfig([A-Z]?\d+[a-z]?)$/;

/** The view to open: a known key or any paper-figure key (tabs come from the manifest), else the overview. */
export function resolveCohortView(key) {
  return KEYS.has(key) || PAPER_KEY.test(`${key ?? ""}`) ? key : "overview";
}

/** View record by key (overview for unknown keys; paper-figure keys not in the static list belong to "paper"). */
export function cohortView(key) {
  const k = resolveCohortView(key);
  return COHORT_VIEWS.find((v) => v.key === k) || { key: k, group: "paper" };
}

/**
 * Figure tab numbers ("1" ... "7", "S8" ... "S16c") from the paper-figure manifest: the labels "Fig <n>" of the current
 * (non-previous) figures in manifest order; variants ("Fig S10 method") are reached from their main figure. Falls back to
 * the static list while the manifest loads.
 */
export function paperTabsOf(figures) {
  const out = [];
  (figures || []).forEach((f) => {
    if (!f || f.group === "previous") return;
    const m = /^Fig ([A-Z]?\d+[a-z]?)$/.exec(`${f.label ?? ""}`.trim());
    if (m && !out.includes(m[1])) out.push(m[1]);
  });
  return out.length ? out : PAPER_FIGURE_TABS;
}

/** Whether a view starts a new group in the tab bar (gets a divider before it). */
export function startsGroup(key) {
  const k = COHORT_VIEWS.findIndex((v) => v.key === key);
  return k > 0 && COHORT_VIEWS[k - 1].group !== COHORT_VIEWS[k].group;
}

/** Views of one group, in tab order. */
export const viewsInGroup = (group) => COHORT_VIEWS.filter((v) => v.group === group && !v.legacy); // legacy views: links only, no tab

/** Figure label ("Fig 4") of a paper-figure tab key ("paperfig4"), else null. */
export function paperFigureLabel(key) {
  const m = PAPER_KEY.exec(`${key ?? ""}`);
  return m ? `Fig ${m[1]}` : null;
}
