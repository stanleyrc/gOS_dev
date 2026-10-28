// Original (15 Oct) manuscript figures as PDFs, for comparison with the rebuilt interactive figures. Pure helpers.
export const ORIGINAL_DIR = "paper_figures_original";
export const ORIGINAL_MANIFEST_FILE = `${ORIGINAL_DIR}/manifest.json`;

/** "2026-10-15" -> "15 Oct" (no time-zone shifting). */
export function originalDateLabel(iso) {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(`${iso ?? ""}`);
  if (!m) return iso ? `${iso}` : "";
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m[1]) - 1];
  return mon ? `${Number(m[2])} ${mon}` : `${iso}`;
}

/**
 * Manifest { figures: [{ id: "1", label: "Fig 1", date, file }] } -> { byLabel: { "Fig 1": { label, date, dateLabel, url } } }.
 * base is the folder URL (with trailing slash). Null when the manifest is missing or has no usable entry.
 */
export function parseOriginalManifest(json, base) {
  const list = Array.isArray(json?.figures) ? json.figures : [];
  const byLabel = {};
  list.forEach((f) => {
    if (!f || !f.file) return;
    const label = f.label || (f.id != null ? `Fig ${f.id}` : null);
    if (!label) return;
    byLabel[label] = { label, date: f.date || "", dateLabel: originalDateLabel(f.date), url: `${base || ""}${f.file}` };
  });
  return Object.keys(byLabel).length ? { byLabel } : null;
}

/** True when a figure label has an original PDF but no rebuilt interactive figure (Figures 2 and 7). */
export const isOriginalOnly = (label, figures, original) => !!(original?.byLabel?.[label] && !(figures || []).some((f) => f.label === label));
