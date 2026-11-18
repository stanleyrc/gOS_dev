// Display labels of SNV tree-site categories (variant.category).
//
// By default each category key is labelled by its translation
// (components.single-cell.snv.category-<key>). A report can override the
// labels with an optional top-level map in snv_matrix.json (or a columnar
// site table):
//   "categoryLabels": { "truncal": "Shared trunk (primary + recurrence)", ... }
// e.g. a combined primary + recurrence report whose classes are not the usual
// truncal / subclonal / private. Only non-empty string labels are kept.

/** Clean { key: label } map from the file field, or null when there is none. */
export function normalizeCategoryLabels(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out = {};
  Object.entries(raw).forEach(([key, label]) => {
    if (typeof label === "string" && label.trim()) out[key] = label.trim();
  });
  return Object.keys(out).length ? out : null;
}

/** Label of one category key: the report's override when present, else the translation (t) or the key itself. */
export function snvCategoryLabel(key, t = null, labels = null) {
  if (key == null || key === "") return "";
  const own = labels && Object.prototype.hasOwnProperty.call(labels, key) ? labels[key] : null;
  if (typeof own === "string" && own) return own;
  return typeof t === "function" ? t(`components.single-cell.snv.category-${key}`) : `${key}`;
}

/** Legend entries [{ value, label, ... }] with report overrides applied to their labels (others unchanged). */
export function applyCategoryLabels(entries, labels = null) {
  if (!labels || !Array.isArray(entries)) return entries;
  return entries.map((e) => (labels[e.value] ? { ...e, label: labels[e.value] } : e));
}
