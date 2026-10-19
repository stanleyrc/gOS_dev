// Cell annotation: clone fits remain explicitly separate from per-cell fits.
export const SIGNATURE_FIELD = "$signature";
export const DEFAULT_SIGNATURE_TRACK = true;
export const DEFAULT_ANNOTATION_WIDTH = 14;
export const ANNOTATION_WIDTHS = [8, 12, 14, 16, 24, 40];
export const ANNOTATION_PARAMS = ["annw", "annsig", "annsigmode"];
const number = (v) => v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);
export const annotationWidth = (v) => Math.max(4, Math.min(60, Math.round(number(v) ?? DEFAULT_ANNOTATION_WIDTH)));
const normal = (c) => c?.normal_cell === true || c?.normal_for_pon === true || /^normal$/i.test(c?.clone_id || "");

export function normaliseActivities(activities = []) {
  const totals = new Map();
  activities.forEach((a) => {
    const value = number(a.activity ?? a.fraction);
    if (a.signature && value > 0) totals.set(a.signature, (totals.get(a.signature) || 0) + value);
  });
  const total = [...totals.values()].reduce((s, n) => s + n, 0);
  return [...totals].map(([signature, activity]) => ({ signature, activity, fraction: activity / total }))
    .sort((a, b) => b.fraction - a.fraction || a.signature.localeCompare(b.signature, undefined, { numeric: true }));
}

export function cellSignatureFit(cell, signatures, perCell = null) {
  if (!cell || normal(cell)) return null;
  if (perCell) {
    const fit = (perCell.cells || []).find((x) => x.cell_id === cell.cell_id);
    if (!fit || fit.too_few || fit.n < 100) return null;
    const activities = normaliseActivities(Object.entries(fit.exposures || {}).map(([signature, fraction]) => ({ signature, fraction })));
    return activities.length ? { name: "Per-cell fit", n: number(fit.n), cosine: number(fit.cosine), activities, perCell: true } : null;
  }
  const sets = signatures?.sets || [];
  const cloneName = cell.clone_id == null ? null : `clone: ${cell.clone_id}`.toLowerCase();
  const set = (cloneName && sets.find((x) => x.name?.toLowerCase() === cloneName)) || sets.find((x) => x.name === "subclonal");
  if (!set) return null;
  const activities = normaliseActivities(set.activities);
  const name = set.name.startsWith("clone: ") ? `${set.name.slice(7)} fit` : "Subclonal fallback fit";
  return activities.length ? { name, n: number(set.n), cosine: number(set.stats?.cosine), activities, perCell: false } : null;
}

export const dominantSignature = (fit) => fit?.activities?.[0]?.signature || null;

/** Top four exposures keep their fractions; the tail is an explicit Other segment. */
export function signatureSegments(fit, width, top = 4) {
  const activities = fit?.activities || [];
  const shown = activities.slice(0, top);
  const rest = activities.slice(top).reduce((s, a) => s + a.fraction, 0);
  const parts = [...shown, ...(rest > 1e-9 ? [{ signature: "Other", fraction: rest }] : [])];
  let end = 0;
  return parts.map((a, i) => {
    const start = end;
    end = i === parts.length - 1 ? width : Math.round(width * parts.slice(0, i + 1).reduce((s, p) => s + p.fraction, 0));
    return { ...a, x: start, width: Math.max(0, end - start) };
  });
}

export function signatureTooltip(fit) {
  if (!fit) return [["Signature", "not available (normal cell, too few mutations, or no fitted set)"]];
  return [[fit.name, fit.activities.map((a) => `${a.signature} ${(100 * a.fraction).toFixed(0)}%`).join(", ")],
    ["Fit quality", `n = ${fit.n == null ? "not available" : fit.n.toLocaleString()} mutations; cosine ${fit.cosine == null ? "not available" : fit.cosine.toFixed(2)}`],
    ["Signature method", fit.perCell ? "fitted per cell on its root-to-tip mutation set" : "fitted per clone, not per cell (subclonal fallback when no clone fit exists)"]];
}

export function annotationFromSearch(search) {
  const p = new URLSearchParams(search); const patch = {};
  if (p.has("annw") && number(p.get("annw")) != null) patch.stripWidth = annotationWidth(p.get("annw"));
  if (["0", "1"].includes(p.get("annsig"))) patch.signatureTrack = p.get("annsig") === "1";
  if (["auto", "dominant", "stacked", "cell"].includes(p.get("annsigmode"))) patch.cellSignatureMode = p.get("annsigmode");
  return patch;
}

export function annotationToSearch(layout) {
  const p = { annw: String(annotationWidth(layout.stripWidth)) };
  if (layout.signatureTrack === false) p.annsig = "0";
  if (["dominant", "stacked", "cell"].includes(layout.cellSignatureMode)) p.annsigmode = layout.cellSignatureMode;
  return p;
}
