// Named cell groups saved per patient (layout.savedGroups = { [patient]: [{ name, cells }] }),
// shareable through the "scgroups" URL parameter and exposed to the RNA views
// as a categorical field so they can be compared in DE.

export const SAVED_GROUP_FIELD = "saved_group";
export const URL_PARAM = "scgroups";

const toBase64 = (text) => window.btoa(unescape(encodeURIComponent(text)));
const fromBase64 = (b64) => decodeURIComponent(escape(window.atob(b64)));

/** URL-safe encoding of { patient: [{ name, cells }] }. */
export function encodeGroups(groupsByPatient) {
  return toBase64(JSON.stringify(groupsByPatient)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeGroups(param) {
  if (!param) return null;
  try {
    const b64 = param.replace(/-/g, "+").replace(/_/g, "/");
    const parsed = JSON.parse(fromBase64(b64 + "=".repeat((4 - (b64.length % 4)) % 4)));
    if (!parsed || typeof parsed !== "object") return null;
    const out = {};
    Object.entries(parsed).forEach(([patient, groups]) => {
      if (!Array.isArray(groups)) return;
      out[patient] = groups
        .filter((g) => g && typeof g.name === "string" && Array.isArray(g.cells))
        .map((g) => ({ name: g.name, cells: g.cells.map(String) }));
    });
    return out;
  } catch (error) {
    return null;
  }
}

/** Saved groups from the URL merged over stored ones (same name: URL wins). */
export function mergeGroups(stored = {}, incoming = {}) {
  const out = { ...stored };
  Object.entries(incoming || {}).forEach(([patient, groups]) => {
    const names = new Set(groups.map((g) => g.name));
    out[patient] = [...(out[patient] || []).filter((g) => !names.has(g.name)), ...groups];
  });
  return out;
}

export function groupsFromUrl(search = window.location.search) {
  return decodeGroups(new URLSearchParams(search).get(URL_PARAM));
}

/** Current URL with one patient's groups in it. */
export function shareUrl(patient, groups, href = window.location.href) {
  const url = new URL(href);
  if (groups?.length) url.searchParams.set(URL_PARAM, encodeGroups({ [patient]: groups }));
  else url.searchParams.delete(URL_PARAM);
  return url.toString();
}

/**
 * displayId -> group name for the RNA cells (a cell in several groups takes
 * the last saved one). Cells match on DNA cell id or RNA display id.
 */
export function groupValues(rnaCells, groups) {
  const groupOf = new Map();
  (groups || []).forEach((g) => g.cells.forEach((id) => groupOf.set(id, g.name)));
  const out = {};
  rnaCells.forEach((c) => {
    const name = (c.cell_id && groupOf.get(c.cell_id)) || groupOf.get(c.displayId) || null;
    out[c.displayId] = name;
  });
  return out;
}
