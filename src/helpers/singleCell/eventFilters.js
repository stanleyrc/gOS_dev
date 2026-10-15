// Column filters for the cohort "All events" table. d3-free.
//
// A filter state is { cat: { col: [values] }, num: { col: [min, max] }, text: { col: "substring" } }.
// Numeric ranges accept null for an open end. Categorical rows with no value match the NONE label.
// The URL form is one compact string (param `evf`), e.g.
//   patient:MGH1,MGH2_fraction@0.1,0.5_variant!del
// where ":" is a value list, "@" a numeric range (lo,hi) and "!" a contains-search; items are joined by "_".

export const NONE = "(none)";
export const emptyFilters = () => ({ cat: {}, num: {}, text: {} });

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const catValue = (v) => (v == null || v === "" ? NONE : `${v}`);

/** Distinct values of a column in the rows, natural order. */
export function distinctValues(rows, col, accessor = (r) => r[col]) {
  const s = new Set(rows.map((r) => catValue(accessor(r))));
  return [...s].sort((a, b) => (a === NONE ? 1 : b === NONE ? -1 : a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })));
}

/** True when a row passes every active column filter (AND across columns, OR within a categorical list). */
export function rowPasses(row, f = emptyFilters(), accessors = {}) {
  const get = (col) => (accessors[col] ? accessors[col](row) : row[col]);
  for (const [col, vals] of Object.entries(f.cat || {})) {
    if (vals && vals.length && !vals.includes(catValue(get(col)))) return false;
  }
  for (const [col, [lo, hi]] of Object.entries(f.num || {})) {
    if (!isNum(lo) && !isNum(hi)) continue;
    const v = Number(get(col));
    if (!Number.isFinite(v)) return false;
    if (isNum(lo) && v < lo) return false;
    if (isNum(hi) && v > hi) return false;
  }
  for (const [col, q] of Object.entries(f.text || {})) {
    const needle = `${q || ""}`.trim().toUpperCase();
    if (needle && !`${get(col) ?? ""}`.toUpperCase().includes(needle)) return false;
  }
  return true;
}

export const filterRows = (rows, f, accessors) => rows.filter((r) => rowPasses(r, f, accessors));

/** Number of columns with an active filter. */
export function activeCount(f = emptyFilters()) {
  const c = Object.values(f.cat || {}).filter((v) => v && v.length).length;
  const n = Object.values(f.num || {}).filter(([lo, hi]) => isNum(lo) || isNum(hi)).length;
  const t = Object.values(f.text || {}).filter((q) => `${q || ""}`.trim()).length;
  return c + n + t;
}

/** Set or clear one filter; returns a new state. kind is "cat" | "num" | "text"; an empty value clears. */
export function setColumnFilter(f, kind, col, value) {
  const next = { cat: { ...f.cat }, num: { ...f.num }, text: { ...f.text } };
  const empty = kind === "num" ? !value || (!isNum(value[0]) && !isNum(value[1])) : !value || !value.length || !`${value}`.trim();
  if (empty) delete next[kind][col];
  else next[kind][col] = kind === "text" ? `${value}`.trim() : value;
  return next;
}

// Escaping: every character outside [A-Za-z0-9] becomes "~" + two hex digits per UTF-8 byte, so values can never
// contain the separators and survive the app's own query-string handling (which mangles ";", "#", "&" and "=").
const enc = (s) => `${s}`.replace(/[^A-Za-z0-9]/g, (ch) => encodeURIComponent(ch).replace(/%/g, "~").replace(/^([^~])$/, (c) => `~${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`));
const dec = (s) => {
  try {
    return decodeURIComponent(`${s}`.replace(/%/g, "%25").replace(/~([0-9A-Fa-f]{2})/g, "%$1"));
  } catch (e) {
    return s;
  }
};

/** Filter state to the compact URL string ("" when no filter is active). */
export function encodeFilters(f = emptyFilters()) {
  const out = [];
  Object.entries(f.cat || {}).forEach(([c, v]) => v && v.length && out.push(`${enc(c)}:${v.map(enc).join(",")}`));
  Object.entries(f.num || {}).forEach(([c, [lo, hi]]) => (isNum(lo) || isNum(hi)) && out.push(`${enc(c)}@${isNum(lo) ? lo : ""},${isNum(hi) ? hi : ""}`));
  Object.entries(f.text || {}).forEach(([c, q]) => `${q || ""}`.trim() && out.push(`${enc(c)}!${enc(`${q}`.trim())}`));
  return out.join("_");
}

/** Parse the URL string; malformed items are skipped. */
export function decodeFilters(str) {
  const f = emptyFilters();
  `${str || ""}`.split("_").filter(Boolean).forEach((item) => {
    const m = item.match(/^([A-Za-z0-9~]+)([:@!])(.*)$/);
    if (!m) return;
    const col = dec(m[1]);
    if (m[2] === ":") {
      const vals = m[3].split(",").filter(Boolean).map(dec);
      if (vals.length) f.cat[col] = vals;
    } else if (m[2] === "@") {
      const r = m[3].split(",");
      if (r.length !== 2) return;
      const lo = r[0] === "" ? null : Number(r[0]);
      const hi = r[1] === "" ? null : Number(r[1]);
      if ((lo !== null && !Number.isFinite(lo)) || (hi !== null && !Number.isFinite(hi))) return;
      if (lo !== null || hi !== null) f.num[col] = [lo, hi];
    } else if (m[2] === "!") {
      const q = dec(m[3]).trim();
      if (q) f.text[col] = q;
    }
  });
  return f;
}
