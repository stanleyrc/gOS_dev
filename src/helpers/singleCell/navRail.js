// Navigation rail of the single-cell pages: which group / entry is current, what each entry says.
// d3-free pure data and helpers (the rail component is components/singleCell/guide/navRail.js).
// Patient tabs follow containers/detailView (tabsOrder 7, 12, 18, 14, 8, 10, 9, 11, 19, 15, 13; 16 is merged into 12,
// 17 into the Single-Cell tab's Drivers layer).

export const PHONE_MAX_WIDTH = 768;
export const RAIL_WIDTH = 48;
/** Hover intent of the rail panel (ms): open after resting on the rail, close after leaving it. */
export const HOVER_OPEN_MS = 200;
export const HOVER_CLOSE_MS = 250;

/** First item of a rail group that can be opened (group icons navigate to it). */
export const firstEnabledItem = (items) => (items || []).find((it) => it && !it.disabled) || null;

/** Patient page groups: icon is an @ant-design/icons name; tabs carry the one-line description shown on hover. */
export const PATIENT_RAIL = [
  { key: "tree", label: "Tree & cells", icon: "ApartmentOutlined", tabs: [
    { tab: 7, desc: "Phylogeny with copy-number, SNV and junction heatmaps, drivers layer, per-cell tracks, UMAP, spatial and IGV." },
    { tab: 18, desc: "The current tree against alternative trees (CellPhy, Jake's trees) with shared clades." },
  ] },
  { key: "report", label: "Report", icon: "FileTextOutlined", tabs: [
    { tab: 12, desc: "Patient vignette, driver report, clone history, amplicon timing and branch rates." },
  ] },
  { key: "genome", label: "Genome", icon: "RadarChartOutlined", tabs: [
    { tab: 14, desc: "ecDNA / amplicon walks with per-cell copy number, containment and co-occurrence." },
    { tab: 13, desc: "Circos of one cell's genome graph (select the cell on the Single-Cell tab)." },
  ] },
  { key: "rna", label: "RNA", icon: "DotChartOutlined", tabs: [
    { tab: 8, desc: "Cell states, markers, gene expression, group comparison and DE, fusions and splicing." },
    { tab: 10, desc: "Gene dosage against expression in the same cells; allele-specific expression." },
  ] },
  { key: "muts", label: "Mutations", icon: "ExperimentOutlined", tabs: [
    { tab: 9, desc: "SBS mutational signatures per site set and along the tree." },
    { tab: 15, desc: "Read-level evidence: mutation sites, read browser, cell cycle, telomeres, clonal dynamics, controls." },
  ] },
  { key: "qc", label: "QC", icon: "SafetyCertificateOutlined", tabs: [
    { tab: 11, desc: "Per-cell library and copy-number quality metrics." },
    { tab: 19, desc: "Purity and ploidy fit of a cell, clade or selection: bin plot with draggable copy-state lines, allelic support, ploidy by clade." },
  ] },
];

/** Group of a patient tab (the retired tabs 16 and 17 map to Report and Tree & cells). */
export function patientGroupOfTab(tab) {
  const n = Number(tab) === 16 ? 12 : Number(tab) === 17 ? 7 : Number(tab);
  return PATIENT_RAIL.find((g) => g.tabs.some((x) => x.tab === n))?.key || null;
}

/** Group of a cohort view given the COHORT_VIEWS list ([{ key, group }]). */
export function cohortGroupOfView(views, view) {
  return (views || []).find((v) => v.key === view)?.group || null;
}

/** Cohort rail groups from COHORT_VIEW_GROUPS / COHORT_VIEWS with labels and purposes from `text(kind, key)`. */
export function cohortRail(groups, views, text) {
  return groups.map((g) => ({
    key: g,
    label: text("group", g),
    items: views.filter((v) => v.group === g).map((v) => ({ view: v.key, label: text("view", v.key), desc: text("purpose", v.key) })),
  }));
}

export const isPhoneWidth = (w) => Number.isFinite(w) && w <= PHONE_MAX_WIDTH;

/** Rail context: "patient" when a single-cell patient is open, "cohort" when the cohort exists, else null (rail hidden). */
export function railContext({ report, singleCellTabAvailable, hasCohort }) {
  if (report && singleCellTabAvailable) return "patient";
  if (!report && hasCohort) return "cohort";
  return null;
}
