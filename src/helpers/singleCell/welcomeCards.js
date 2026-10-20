// "Where to find X" cards of the Welcome view and the screenshot list. d3-free.
// Screenshots live in public/welcome/ (taken from the live app with code/tools/playwright/shot.sh at 1700 px).

/** Annotated screenshots: file under public/welcome, what to look at, numbered callouts. */
export const WELCOME_SHOTS = [
  { file: "cohort_overview.png", title: "Cohort overview", text: "Start here: headline results and one row per patient, clone or cell. Click a patient to open it.", notes: ["Group tabs along the top (Findings, Genome, Evolution, RNA, Explore, Guide)", "Views of the active group below them", "Clade F1 filter and Help (?) top right"] },
  { file: "cohort_drivers.png", title: "Driver alterations", text: "Every filtered driver per patient, truncal or subclonal, with the oncoprint and recurrence.", notes: ["Gene and tier filters", "Click a cell of the oncoprint to open the event"] },
  { file: "patient_tree.png", title: "A patient: tree and cell heatmap", text: "The phylogeny on the left and a per-cell heatmap (copy number, SNVs or junctions) on the right; select cells to follow them in other tabs.", notes: ["Tab bar: one tab per analysis", "Heatmap type and layers", "Select cells here, they carry over to RNA, ecDNA and IGV"] },
  { file: "patient_report.png", title: "A patient: report", text: "A ranked, evidence-linked brief of the findings for this patient.", notes: ["Findings link to the cells and sites behind them"] },
];

/** Where to find X: label, what it answers, and the link target ({ scope: "cohort", view } or { scope: "patient", tab }). */
export const WELCOME_FINDERS = [
  { label: "Driver mutations and copy-number events", scope: "cohort", view: "drivers", desc: "Cohort table and oncoprint of driver alterations." },
  { label: "Subclonal drivers", scope: "cohort", view: "subclonal", desc: "Drivers present in part of the tree, with read-QC and signature of the SNV." },
  { label: "ecDNA / amplicons", scope: "cohort", view: "amplicons", desc: "Circular amplicons, copies per cell and oncogenes carried." },
  { label: "Tree shape and instability", scope: "cohort", view: "treeshape", desc: "Tree shape and chromosomal instability per patient." },
  { label: "Mutational signatures and burden", scope: "cohort", view: "mutations", desc: "SNV burden on the tree and SBS signatures." },
  { label: "Clinical assay agreement", scope: "cohort", view: "clinical", desc: "Which clinical-report alterations the single-cell data recovers." },
  { label: "RNA states, fusions and splicing", scope: "cohort", view: "rna", desc: "Cell states and cross-patient splicing / fusion findings." },
  { label: "Cell quality control", scope: "cohort", view: "qc", desc: "Per-cell QC metrics and outliers." },
  { label: "One patient's tree and cells", scope: "patient", tab: 7, desc: "Open any patient, then the Single-Cell tab." },
  { label: "Reads behind a variant", scope: "patient", tab: 15, desc: "Evidence tab: read browser and per-site evidence." },
  { label: "Concepts (interactive explainers)", scope: "cohort", view: "concepts", desc: "Junction balance, joint balance across cells and PATH heritability, explained on toy examples." },
  { label: "Methods", scope: "cohort", view: "methods", desc: "How each result is produced (sequencing, calling, trees, signatures, statistics)." },
];

/** Query string for a cohort deep link (the cohort panel reads ?scview=). */
export function finderHref(card, base = "") {
  if (card.scope === "cohort") return `${base}?scview=${encodeURIComponent(card.view)}`;
  return null; // patient targets need a patient: the component opens one
}
