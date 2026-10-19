// Which phylogenies and which SNV matrix ("mutation set") the Compare Trees tab shows, and their URL params.
// Dependency-free (no d3) so the logic is unit-testable in isolation.

export const FULL_SET = "full";
export const CMP_TREE_A_PARAM = "cmpa";
export const CMP_TREE_B_PARAM = "cmpb";
export const CMP_SET_PARAM = "cmpset";

/**
 * snv_sets.json: [{ name, label, file, n_variants }]. The full matrix (snv_matrix.json) is always selectable,
 * also for patients without an index. Entries need a name and a file; names are unique.
 */
export function usableSnvSets(index) {
  const seen = new Set();
  const out = [];
  (Array.isArray(index) ? index : []).forEach((s) => {
    if (!s || !s.name || !s.file || seen.has(s.name) || s.name === FULL_SET) return;
    seen.add(s.name);
    out.push({ name: s.name, label: s.label || s.name, file: s.file, n_variants: Number.isFinite(s.n_variants) ? s.n_variants : null });
  });
  const full = (Array.isArray(index) ? index : []).find((s) => s && s.name === FULL_SET);
  return [{ name: FULL_SET, label: full?.label || "Full matrix (current)", file: "snv_matrix.json", n_variants: Number.isFinite(full?.n_variants) ? full.n_variants : null }, ...out];
}

/** Default: the smallest set with a known size (loads fastest); the full matrix when no other set is listed. */
export function defaultSnvSet(sets) {
  const others = (sets || []).filter((s) => s.name !== FULL_SET && Number.isFinite(s.n_variants) && s.n_variants > 0);
  if (!others.length) return FULL_SET;
  return others.reduce((m, s) => (s.n_variants < m.n_variants ? s : m)).name;
}

/** A name from the URL or state when it is among `names`, else null. */
export function validChoice(value, names) {
  return value && (names || []).includes(value) ? value : null;
}

/** URL value for a choice: null (param left out) when it is the default. */
export function serializeChoice(value, fallback) {
  return value && value !== fallback ? value : null;
}

/** Bootstrap support is shown only for trees with an entry in trees/support.json. */
export function hasTreeSupport(support, name) {
  return Boolean(support?.available === true && support.trees && support.trees[name]);
}

export const NO_BOOTSTRAP_TEXT = "Bootstrap support: not available (no bootstraps for this tree)";

/**
 * Quality note on the pipeline tree from trees/index.json: the "gos" entry's `note` (gos_sc_alt_trees.R TREE_LABEL_NOTE), or
 * the text after "current; " in its label. Null when there is none (the usual case).
 */
export function treeQualityNote(index) {
  const gos = (Array.isArray(index) ? index : []).find((t) => t && t.name === "gos");
  if (!gos) return null;
  if (gos.note) return `${gos.note}`;
  const m = /\(current;\s*([^)]+)\)/.exec(`${gos.label || ""}`);
  return m ? m[1].trim() : null;
}
