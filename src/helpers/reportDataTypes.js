// Home page: data type of each dataset / report ("Data type" facet, card
// badges) and the "One per patient" grouping of versioned report copies.
// d3-free so it can be unit tested.

/** Known data types, in facet order. `value` is what datasets.json / datafiles store. */
export const DATA_TYPES = [
  { value: "sc_dna_pta", label: "single-cell DNA (high-coverage PTA)", short: "scDNA PTA" },
  { value: "sc_dna_lowpass", label: "single-cell DNA (low-pass)", short: "scDNA low-pass" },
  { value: "sc_dna_spatial", label: "spatial single-nucleus DNA (slide-tag)", short: "slide-tag" },
  { value: "bulk_wgs", label: "bulk WGS", short: "bulk WGS" },
  { value: "sc_rna", label: "single-cell RNA only", short: "scRNA only" },
  { value: "sc_dna_rna", label: "same-cell DNA + RNA", short: "DNA + RNA" },
  { value: "datac", label: "dATAC", short: "dATAC" },
  { value: "droplet_hic", label: "droplet Hi-C", short: "droplet Hi-C" },
  { value: "dlp_plus", label: "DLP+", short: "DLP+" },
  { value: "other", label: "other", short: "other" },
  { value: "unknown", label: "unknown (not annotated)", short: "type unknown" },
];

export const DATA_TYPE_FIELD = "data_type";
const BY_VALUE = Object.fromEntries(DATA_TYPES.map((d) => [d.value, d]));

const ALIASES = {
  pta: "sc_dna_pta",
  "high-coverage pta": "sc_dna_pta",
  "sc dna": "sc_dna_pta",
  "low-pass": "sc_dna_lowpass",
  lowpass: "sc_dna_lowpass",
  "low pass": "sc_dna_lowpass",
  "slide-tag": "sc_dna_spatial",
  slidetag: "sc_dna_spatial",
  "slide-tags": "sc_dna_spatial",
  bulk: "bulk_wgs",
  wgs: "bulk_wgs",
  "bulk wgs": "bulk_wgs",
  rna: "sc_rna",
  scrna: "sc_rna",
  "rna only": "sc_rna",
  "dna+rna": "sc_dna_rna",
  "dna + rna": "sc_dna_rna",
  atac: "datac",
  hic: "droplet_hic",
  "hi-c": "droplet_hic",
  dlp: "dlp_plus",
  "dlp+": "dlp_plus",
};
DATA_TYPES.forEach((d) => {
  ALIASES[d.value] = d.value;
  ALIASES[d.label.toLowerCase()] = d.value;
  ALIASES[d.short.toLowerCase()] = d.value;
});

/** Any data_type value (array, "a,b" string, label, alias) -> known codes; empty -> ["unknown"]; unrecognised -> "other". */
export function normalizeDataTypes(value) {
  const raw = Array.isArray(value) ? value : value == null ? [] : `${value}`.split(/[,;|]/);
  const out = [];
  raw.forEach((v) => {
    const key = `${v ?? ""}`.trim().toLowerCase();
    if (!key) return;
    const code = ALIASES[key] || "other";
    if (!out.includes(code)) out.push(code);
  });
  if (out.length > 1 && out.includes("unknown")) out.splice(out.indexOf("unknown"), 1);
  return out.length ? out.sort((a, b) => DATA_TYPES.findIndex((d) => d.value === a) - DATA_TYPES.findIndex((d) => d.value === b)) : ["unknown"];
}

/** Data types of a report: its own data_type field, else its dataset's, else ["unknown"]. */
export const recordDataTypes = (record = {}, dataset = {}) =>
  normalizeDataTypes(record?.[DATA_TYPE_FIELD] != null && record[DATA_TYPE_FIELD] !== "" ? record[DATA_TYPE_FIELD] : dataset?.[DATA_TYPE_FIELD]);

export const dataTypeLabel = (value) => BY_VALUE[value]?.label || `${value}`;
export const dataTypeShort = (value) => BY_VALUE[value]?.short || `${value}`;

/**
 * Select options for the facet: every known type in facet order with its
 * count; types with no report are listed but disabled; unknown codes last.
 */
export function dataTypeOptions(frequencies = {}) {
  const known = DATA_TYPES.map((d) => ({ value: d.value, label: d.label, count: frequencies[d.value] || 0, disabled: !frequencies[d.value], searchText: `${d.label} ${d.short} ${d.value}` }));
  const extra = Object.keys(frequencies)
    .filter((v) => !BY_VALUE[v] && v !== "null" && v !== "undefined")
    .map((v) => ({ value: v, label: v, count: frequencies[v], searchText: v }));
  return [...known, ...extra];
}

/** Field spec of the "Data type" facet. */
export const DATA_TYPE_FIELD_SPEC = { id: DATA_TYPE_FIELD, title: "Data type", type: "string" };

/**
 * Dataset fields with the "Data type" facet added (right after "Dataset",
 * else after "Pair") unless the dataset already defines it.
 */
export function withDataTypeField(fields = [], makeField = (spec) => spec) {
  if (fields.some((f) => (f.id || f.name) === DATA_TYPE_FIELD)) return fields;
  const out = [...fields];
  let at = out.findIndex((f) => (f.id || f.name) === "sourceDatasetTitle");
  if (at < 0) at = out.findIndex((f) => (f.id || f.name) === "pair");
  out.splice(at < 0 ? out.length : at + 1, 0, makeField(DATA_TYPE_FIELD_SPEC));
  return out;
}

/** Union of two data_type lists (records merged across datasets). */
export const mergeDataTypes = (a, b) => normalizeDataTypes([...(a ? normalizeDataTypes(a) : []), ...(b ? normalizeDataTypes(b) : [])]);

/* ---- URL / localStorage persistence of the home filters (dtype=, dedupe=) ---- */

export const HOME_PREFS_STORAGE_KEY = "gos-home-filters";

export const parseDtypeParam = (s) => (s == null || `${s}`.trim() === "" ? [] : normalizeDataTypes(`${s}`).filter((v) => v !== "unknown" || /unknown/i.test(s)));

/** { data_type?, dedupe? } from the URL query (wins) or localStorage. */
export function readHomeFilterPrefs(search = typeof window !== "undefined" ? window.location.search : "", storage = safeStorage()) {
  const out = {};
  let stored = {};
  try {
    stored = JSON.parse(storage?.getItem(HOME_PREFS_STORAGE_KEY) || "{}") || {};
  } catch (e) {
    stored = {};
  }
  const params = new URLSearchParams(search || "");
  if (params.has("dtype")) {
    const v = parseDtypeParam(params.get("dtype"));
    if (v.length) out[DATA_TYPE_FIELD] = v;
  } else if (Array.isArray(stored.dtype) && stored.dtype.length) {
    out[DATA_TYPE_FIELD] = normalizeDataTypes(stored.dtype);
  }
  if (params.has("dedupe")) out.dedupe = params.get("dedupe") === "0" ? 0 : 1;
  else if (stored.dedupe === 0 || stored.dedupe === 1) out.dedupe = stored.dedupe;
  return out;
}

/** Query string with dtype / dedupe set from the filters (others untouched). */
export function homeFilterQuery(search, filters = {}) {
  const params = new URLSearchParams(search || "");
  const types = Array.isArray(filters[DATA_TYPE_FIELD]) ? filters[DATA_TYPE_FIELD] : [];
  if (types.length) params.set("dtype", types.join(","));
  else params.delete("dtype");
  if (filters.dedupe === 0 || filters.dedupe === 1) params.set("dedupe", `${filters.dedupe}`);
  else params.delete("dedupe");
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function writeHomeFilterPrefs(filters = {}, storage = safeStorage()) {
  try {
    storage?.setItem(HOME_PREFS_STORAGE_KEY, JSON.stringify({ dtype: filters[DATA_TYPE_FIELD] || [], dedupe: filters.dedupe === 0 ? 0 : 1 }));
  } catch (e) {
    // storage unavailable
  }
  if (typeof window === "undefined" || !window.history?.replaceState) return;
  const next = homeFilterQuery(window.location.search, filters);
  if (next !== (window.location.search || "")) {
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${next}${window.location.hash}`);
  }
}

function safeStorage() {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch (e) {
    return null;
  }
}

/* ---- "One per patient": group versioned copies of the same patient's data ---- */

/** Dedupe is on unless explicitly turned off (dedupe: 0 / "0" / false). */
export const isDedupeOn = (filters = {}) => !(filters.dedupe === 0 || filters.dedupe === "0" || filters.dedupe === false);

const reportName = (r) => `${r?.caseReportId ?? r?.pair ?? ""}`;

/**
 * Patient of a report: the `patient` field when present, else the report name
 * up to its first "_" (rule: BWH75_ST -> BWH75, MGH303_PRI_REC_clean_rr3 -> MGH303).
 */
export function reportPatient(record = {}) {
  if (record.patient != null && `${record.patient}`.trim() !== "") return { patient: `${record.patient}`.trim(), source: "field" };
  return { patient: reportName(record).split("_")[0], source: "name" };
}

/** Assay family: copies are only grouped within a family (slide-tag is not a copy of the plate PTA data). */
export function assayFamily(types = []) {
  const t = normalizeDataTypes(types);
  if (t.includes("sc_dna_spatial")) return "spatial";
  if (t.some((v) => ["sc_dna_pta", "sc_dna_lowpass", "sc_dna_rna"].includes(v))) return "scdna";
  return t.join("+");
}

const isSingleCellFamily = (types) => normalizeDataTypes(types).some((v) => v.startsWith("sc_") || ["datac", "droplet_hic", "dlp_plus"].includes(v));
const truthy = (v) => v === true || v === 1 || v === "true" || v === "TRUE" || v === "1";
export const isExplicitCanonical = (r = {}) => truthy(r.canonical) || truthy(r.primary_report);

/**
 * Group key of a report or null when it is never grouped: an explicit
 * `report_group`, else patient + assay family for single-cell types and
 * for any report carrying an explicit `patient` field; bulk reports without
 * one stay ungrouped.
 */
export function reportGroupKey(record = {}) {
  if (record.report_group != null && `${record.report_group}` !== "") return `${record.report_group}`;
  const types = recordDataTypes(record);
  const { patient, source } = reportPatient(record);
  if (!patient) return null;
  if (source !== "field" && !isSingleCellFamily(types)) return null;
  return `${patient}|${assayFamily(types)}`;
}

const suffixDepth = (r) => reportName(r).split("_").length;

/**
 * Canonical report of a group, by rule:
 * 1. an explicit canonical / primary_report flag;
 * 2. the report named exactly like the patient (un-suffixed);
 * 3. the fewest "_" suffixes;
 * 4. the newest `exported` stamp;
 * 5. the first in list order.
 */
export function chooseCanonical(group = []) {
  const ranked = group.map((r, i) => ({ r, i })).sort((a, b) => {
    const ea = isExplicitCanonical(a.r) ? 0 : 1;
    const eb = isExplicitCanonical(b.r) ? 0 : 1;
    if (ea !== eb) return ea - eb;
    const pa = reportName(a.r) === reportPatient(a.r).patient ? 0 : 1;
    const pb = reportName(b.r) === reportPatient(b.r).patient ? 0 : 1;
    if (pa !== pb) return pa - pb;
    const sa = suffixDepth(a.r);
    const sb = suffixDepth(b.r);
    if (sa !== sb) return sa - sb;
    const xa = `${a.r.exported || ""}`;
    const xb = `${b.r.exported || ""}`;
    if (xa !== xb) return xa < xb ? 1 : -1;
    return a.i - b.i;
  });
  return ranked[0]?.r || null;
}

/** Why the canonical was chosen (for the README / tooltip). */
export function canonicalReason(record, group = []) {
  if (isExplicitCanonical(record)) return "explicit canonical flag";
  if (reportName(record) === reportPatient(record).patient) return "un-suffixed name";
  const depth = suffixDepth(record);
  if (group.filter((r) => suffixDepth(r) === depth).length === 1) return "fewest name suffixes";
  return "newest export among the shortest names";
}

/** Groups (in first-seen order): [{ key, patient, canonical, members }]. */
export function groupReports(records = []) {
  const groups = new Map();
  const order = [];
  records.forEach((r) => {
    const key = reportGroupKey(r);
    if (key == null) return;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key).push(r);
  });
  return order.map((key) => {
    const members = groups.get(key);
    return { key, patient: key.split("|")[0], canonical: chooseCanonical(members), members };
  });
}

/**
 * One report per patient: keeps the list order, replaces each group by its
 * canonical report (a shallow copy carrying `_versions`, the other members).
 */
export function dedupeReports(records = []) {
  const byKey = new Map(groupReports(records).map((g) => [g.key, g]));
  const out = [];
  records.forEach((r) => {
    const key = reportGroupKey(r);
    const g = key == null ? null : byKey.get(key);
    if (!g) {
      out.push(r);
      return;
    }
    if (g.canonical !== r) return;
    const versions = g.members.filter((m) => m !== r);
    out.push(versions.length ? { ...r, _versions: versions, _groupKey: key } : r);
  });
  return out;
}
