// Branch-length versions of the patient's tree (Single-Cell tab toggle).
//
// trees/index.json may list re-scalings of the pipeline tree ("gos", the
// patient's tree.nwk): entries with `topology_of: "gos"` have the same cells
// and splits, only the branch lengths differ (e.g. mutation counts instead of
// substitutions per site). The entry with `default: true` is drawn when the
// page opens; ?treebl=<name> picks another one. Without such entries the page
// draws tree.nwk as before. Entries with `drawable: true` are other trees (other
// topology, e.g. an adopted collaborator tree) that may also be drawn and be the
// default; their cells missing from the tree are listed below it ("not in tree"),
// and branch SNVs (anchored on the pipeline tree) are not drawn on them.
// `short_label` overrides the toggle text. d3-free so it can be unit tested.

export const BASE_TREE = "gos";
export const TREE_VARIANT_PARAM = "treebl";

const UNIT_LABELS = {
  mutations: "Mutations",
  "substitutions per site": "Substitutions per site",
};

/** Index entries that are branch-length versions of the pipeline tree (the "gos" entry first); [] when there is no alternative. */
export function treeVariants(index) {
  const list = Array.isArray(index) ? index.filter((t) => t && t.name) : [];
  const base = list.find((t) => t.name === BASE_TREE) || { name: BASE_TREE, label: "Pipeline tree" };
  const others = list.filter((t) => t.name !== BASE_TREE && (t.topology_of === BASE_TREE || t.drawable === true));
  return others.length ? [withPreviousDefault(base, list), ...others] : [];
}

const PREV = " (previous default)";
/** The pipeline-tree entry marked "(previous default)" once a re-scaling of it is the default; other entries unchanged. */
export function withPreviousDefault(entry, index) {
  if (!entry || entry.name !== BASE_TREE) return entry;
  const list = Array.isArray(index) ? index : [];
  const replaced = list.some((t) => t && t.name !== BASE_TREE && (t.topology_of === BASE_TREE || t.drawable === true) && t.default === true);
  if (!replaced) return entry;
  const label = `${entry.label ?? ""}`;
  return { ...entry, previous_default: true, label: label.endsWith(PREV) ? label : `${label}${PREV}` };
}

/** Name of the variant drawn by default: the entry with `default: true`, else the pipeline tree. */
export function defaultTreeVariant(index) {
  const v = treeVariants(index);
  const hit = v.find((t) => t.default === true);
  return hit ? hit.name : BASE_TREE;
}

/** Variant to draw: a valid URL choice, else the default. */
export function activeTreeVariant(index, urlChoice = null) {
  const names = treeVariants(index).map((t) => t.name);
  if (urlChoice && names.includes(urlChoice)) return urlChoice;
  return defaultTreeVariant(index);
}

/** True when the index lists a drawable tree with another topology than the pipeline tree. */
export function hasOtherTopologies(index) {
  return (Array.isArray(index) ? index : []).some((t) => t && t.name !== BASE_TREE && t.drawable === true && t.topology_of !== BASE_TREE);
}

/** True when `name` is the pipeline tree or one of its re-scalings (same splits: SNV anchors of the pipeline tree apply). */
export function sameTopologyAsBase(name, index) {
  if (!name || name === BASE_TREE) return true;
  const entry = (Array.isArray(index) ? index : []).find((t) => t && t.name === name);
  return Boolean(entry) && entry.topology_of === BASE_TREE;
}

/**
 * Short toggle label: `short_label`, else "Mutations" / "Substitutions per site" (from `branch_units`), else the entry label.
 * With `index` listing trees of other topologies, the pipeline tree and its re-scalings read "Our tree" / "Our tree · Mutations".
 */
export function variantShortLabel(entry, index = null) {
  if (!entry) return "";
  const u = `${entry.branch_units ?? ""}`;
  const units = UNIT_LABELS[u] || (u ? u[0].toUpperCase() + u.slice(1) : "");
  let base;
  if (entry.short_label) base = `${entry.short_label}`;
  else if (hasOtherTopologies(index) && (entry.name === BASE_TREE || entry.topology_of === BASE_TREE)) base = entry.name === BASE_TREE ? "Our tree" : `Our tree · ${units || entry.label || entry.name}`;
  else base = units || entry.label || entry.name;
  return entry.previous_default ? `${base}${PREV}` : base;
}

/** File holding a variant, relative to the patient folder. */
export function variantFile(name) {
  return !name || name === BASE_TREE ? "tree.nwk" : `trees/${name}.nwk`;
}

/** URL value for a choice: null (left out of the URL) when it is the default. */
export function serializeVariant(name, index) {
  return name && name !== defaultTreeVariant(index) ? name : null;
}

/** Name a support.json entry can be looked up under: the tree itself, else the tree whose topology it shares. */
export function supportKeys(name, index) {
  const entry = (Array.isArray(index) ? index : []).find((t) => t && t.name === name);
  return entry?.topology_of && entry.topology_of !== name ? [name, entry.topology_of] : [name];
}

/** Read ?treebl= from the page URL (null without a window). */
export function readTreeVariantParam() {
  try {
    return new URL(window.location.href).searchParams.get(TREE_VARIANT_PARAM);
  } catch (error) {
    return null;
  }
}

/** Write ?treebl= (removed for the default). */
export function writeTreeVariantParam(name, index) {
  try {
    const url = new URL(window.location.href);
    const v = serializeVariant(name, index);
    if (v) url.searchParams.set(TREE_VARIANT_PARAM, v);
    else url.searchParams.delete(TREE_VARIANT_PARAM);
    if (url.toString() !== window.location.href) window.history.replaceState(window.history.state, "", url.toString());
  } catch (error) {
    // no window / history
  }
}
