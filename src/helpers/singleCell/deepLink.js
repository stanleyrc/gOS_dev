// Deep-link parameters that open a single-cell patient on an exact view.
// Each is read once, when the patient named by `report` loads:
//   scsel=<name>[,<name>]   select the cells of these saved groups (scgroups)
//   heatmap=cn|snv|junctions  heatmap shown in the Single-Cell tab
//   walk=<label>[,<label>]  ecDNA tab: draw these walks, highlight the first
//   umap=cn:<GENE> | gene:<GENE> | <field>  UMAP colouring
// `tab` and `location` are handled by the settings reducer.

const HEATMAP_TYPES = ["cn", "snv", "junctions"];

const list = (value) =>
  (value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export function readDeepLink(search = window.location.search) {
  const params = new URLSearchParams(search);
  const heatmap = params.get("heatmap");
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
