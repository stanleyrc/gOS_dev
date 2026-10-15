// Deep-link parameters that open a single-cell patient on an exact view.
// Each is read once, when the patient named by `report` loads:
//   scsel=<name>[,<name>]   select the cells of these saved groups (scgroups)
//   (an old tab=16 Story link opens the Summary tab, 12)
//   heatmap=cn|snv|junctions|drivers  heatmap shown in the Single-Cell tab
//     (an old tab=17 link opens the Drivers layer; drvpreset / drvadd / drvrm / drvf carry its selection)
//   walk=<label>[,<label>]  ecDNA tab: draw these walks, highlight the first
//   umap=cn:<GENE> | gene:<GENE> | <field>  UMAP colouring
// `tab` and `location` are handled by the settings reducer.

const HEATMAP_TYPES = ["cn", "snv", "junctions", "drivers"];

const list = (value) =>
  (value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export function readDeepLink(search = window.location.search) {
  const params = new URLSearchParams(search);
  // the retired Drivers tab (17) is now the Drivers layer of the Single-Cell tab
  const heatmap = params.get("heatmap") || (params.get("tab") === "17" ? "drivers" : null);
  const umap = params.get("umap");
  let umapColor = null;
  if (umap) {
    const [kind, ...rest] = umap.split(":");
    const gene = rest.join(":").trim();
    if ((kind === "cn" || kind === "gene") && gene) umapColor = { kind, gene };
    else if (!rest.length) umapColor = { kind: "field", field: umap };
  }
  return {
    report: params.get("report"),
    groups: list(params.get("scsel")),
    heatmap: HEATMAP_TYPES.includes(heatmap) ? heatmap : null,
    walks: list(params.get("walk")),
    driverOpen: params.get("drvopen") || null, // key of the driver whose drawer opens (Drivers layer)
    umap: umapColor,
  };
}

/** True when the deep link was written for this patient (no `report` means it applies to any). */
export function linkAppliesTo(link, caseReportId) {
  return Boolean(link) && (!link.report || `${link.report}` === `${caseReportId}`);
}

/** Cell ids of the named saved groups, in tree order, limited to known cells. */
export function cellsOfGroups(groups = [], names = [], order = []) {
  if (!names.length) return [];
  const wanted = new Set(names);
  const ids = new Set();
  groups.filter((g) => wanted.has(g.name)).forEach((g) => g.cells.forEach((id) => ids.add(`${id}`)));
  return order.filter((id) => ids.has(`${id}`));
}

/** Walk ids for labels (exact label, then case-insensitive), in the order the labels were given. */
export function walkIdsForLabels(walks = [], labels = []) {
  const out = [];
  labels.forEach((label) => {
    const lower = label.toLowerCase();
    const hit =
      walks.find((w) => `${w.label}` === label) ||
      walks.find((w) => `${w.label}`.toLowerCase() === lower) ||
      walks.find((w) => `${w.id}` === label);
    if (hit && !out.includes(hit.id)) out.push(hit.id);
  });
  return out;
}

/**
 * Hold the "disabled tab" redirect while a single-cell patient is still loading:
 * RNA / walks tabs count as unavailable until their files arrive, which used to
 * bounce a linked `tab=` back to the Single-Cell tab.
 */
export function singleCellStillLoading(singleCell) {
  if (!singleCell) return false;
  if (singleCell.loading) return true;
  return singleCell.patient == null && !singleCell.missing && singleCell.error == null;
}

// View settings carried by a link (committee / figure links), read once on load:
//   cnpal=<preset>                CN heatmap palette preset (e.g. deck: 0..100+)
//   clonecolors=<clone>:<hex>,..  clone colours (hex with or without #)
//   clonelabels=<clone>:<label>,..  display names in figure panels (e.g. Clone 4:CI)
//   treemark=<group>:<hex>,<group>:<hex>  tree tip dots for saved groups; rings where
//                                 the first vs second group changes state (parsimony)
//   cloneorder=<clone>,<clone>    rotate the tree so these clones come first (top)
//   walkview=bars|heatmap         ecDNA walk copies along the tree
//   yscale=common|individual      y axis of the cell tracks
//   figsel=0                      Paper figures: mark carriers without selecting them
//   figlayout=slide               Paper figures: heatmap and walk copies side by side
//   tracks=total,coverage,..      cell tracks shown for selected cells
//   hets=blocks                   Het SNPs track as allelic-segment blocks (default: SNP points)
//   figpatient / figwalk / figgenes  Paper figures: patient, walk whose
//                                 carriers are marked, gene pair for CN vs CN
//   comp=<field>&compby=<clone|groups|field>&compcount=1  RNA composition card
//   cmpA=<spec>&cmpB=<spec>      Single-Cell tab Clade comparison; spec = clade:<id> | node:<k> | sister:<spec> |
//                                 rest:<spec> | clone:<name> | group:<name> (helpers/singleCell/cladeCompare.js)
//   cngene=<GENE>&exprgenes=<G1,G2>  cohort CN-vs-expression view
const HEX = /^#?([0-9a-f]{6})$/i;

export function readViewLink(search = window.location.search) {
  const params = new URLSearchParams(search);
  const cloneColors = {};
  list(params.get("clonecolors")).forEach((pair) => {
    const at = pair.lastIndexOf(":");
    if (at <= 0) return;
    const m = HEX.exec(pair.slice(at + 1).trim());
    if (m) cloneColors[pair.slice(0, at).trim()] = `#${m[1].toUpperCase()}`;
  });
  const cloneLabels = {};
  list(params.get("clonelabels")).forEach((pair) => {
    const at = pair.lastIndexOf(":");
    if (at > 0 && pair.slice(at + 1).trim()) cloneLabels[pair.slice(0, at).trim()] = pair.slice(at + 1).trim();
  });
  const treeMarks = list(params.get("treemark"))
    .map((pair) => {
      const at = pair.lastIndexOf(":");
      const m = at > 0 ? HEX.exec(pair.slice(at + 1).trim()) : null;
      return m ? { group: pair.slice(0, at).trim(), color: `#${m[1].toUpperCase()}` } : null;
    })
    .filter(Boolean);
  return {
    treeMarks,
    cloneOrder: list(params.get("cloneorder")),
    walkView: ["bars", "heatmap"].includes(params.get("walkview")) ? params.get("walkview") : null,
    figSelect: params.get("figsel") !== "0",
    figLayout: params.get("figlayout") || null,
    yScale: ["common", "individual"].includes(params.get("yscale")) ? params.get("yscale") : null,
    cnPalette: params.get("cnpal") || null,
    cloneColors,
    cloneLabels,
    tracks: list(params.get("tracks")),
    hets: params.get("hets") || null,
    figPatient: params.get("figpatient") || null,
    figWalk: params.get("figwalk") || null,
    figGenes: list(params.get("figgenes")).slice(0, 2),
    composition: params.get("comp") || null,
    compositionBy: params.get("compby") || null,
    compositionCounts: params.get("compcount") === "1",
    compareA: params.get("cmpA") || null,
    compareB: params.get("cmpB") || null,
    cnGene: params.get("cngene") || null,
    exprGenes: list(params.get("exprgenes")),
  };
}

/** Clone colours with link overrides applied (unknown clones ignored). */
export function withCloneOverrides(colors = {}, overrides = {}) {
  const out = { ...colors };
  Object.entries(overrides).forEach(([clone, hex]) => {
    if (clone in out) out[clone] = hex;
  });
  return out;
}
