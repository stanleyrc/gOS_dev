// Copy-number source of a single-cell patient (d3-free; tested in cnSource.test.js).
//  regular: the per-cell JaBbA graphs, data/<cell>/complex.json.
//  joint:   the joint junction balance, data/<patient>/sc_cn_joint/ (srctools joint balance v3, exported by skilift
//           sc_export_joint_cn): manifest.json + cells/<cell>/complex.json in the same schema as the regular file.
// The joint view is offered only when the manifest exists; it is the default only when the manifest says so
// (default_source = "joint", set from predefined verdict criteria by the exporter).

export const CN_SOURCES = ["regular", "joint"];
export const JOINT_DIR = "sc_cn_joint";
export const JOINT_MANIFEST = `${JOINT_DIR}/manifest.json`;
export const JOINT_FORMAT = "gos-sc-cn-joint/1";

export function jointCellFile(cellId) {
  return `${JOINT_DIR}/cells/${cellId}/complex.json`;
}

const asArray = (x) => (Array.isArray(x) ? x : x == null ? [] : [x]);

/** Normalised manifest, or null when absent / not this format. */
export function parseJointManifest(raw) {
  if (!raw || typeof raw !== "object" || raw.format !== JOINT_FORMAT) return null;
  const cells = asArray(raw.cells).map(String);
  if (!cells.length) return null;
  const criteria = asArray(raw.verdict?.criteria).map((c) => ({
    key: String(c.key ?? ""),
    label: String(c.label ?? c.key ?? ""),
    pass: c.pass === true,
    detail: c.detail == null ? "" : String(c.detail),
  }));
  return {
    patient: raw.patient == null ? null : String(raw.patient),
    cells,
    cellSet: new Set(cells),
    cellsMissing: asArray(raw.cells_missing).map((m) => ({ cell: String(m.cell ?? m), reason: String(m.reason ?? "not available") })),
    chromosomes: asArray(raw.chromosomes).map(String),
    outside: raw.outside_chromosomes == null ? "" : String(raw.outside_chromosomes),
    method: raw.method == null ? "" : String(raw.method),
    muchBetter: raw.verdict?.much_better === true,
    defaultSource: raw.default_source === "joint" ? "joint" : "regular",
    criteria,
    summary: raw.verdict?.summary == null ? "" : String(raw.verdict.summary),
  };
}

/** The source to open with: the manifest's default when joint is available, else regular. */
export function defaultCnSource(manifest) {
  return manifest && manifest.defaultSource === "joint" ? "joint" : "regular";
}

/** Labels of the criteria the joint view passed. */
export function betterOn(manifest) {
  return manifest ? manifest.criteria.filter((c) => c.pass).map((c) => c.label) : [];
}

/** Toggle options; [] when the patient has no joint export (the toggle is then hidden). */
export function cnSourceOptions(manifest) {
  if (!manifest) return [];
  const tag = (s) => (manifest.defaultSource === s ? " (default)" : "");
  return [
    { value: "regular", label: `Regular${tag("regular")}` },
    { value: "joint", label: `Joint junction balance${tag("joint")}` },
  ];
}

/** One-line description for the toggle tooltip / note. */
export function cnSourceNote(manifest) {
  if (!manifest) return "Joint junction balance: not available (no sc_cn_joint export for this patient)";
  const chr = manifest.chromosomes.length ? `chr ${manifest.chromosomes.join(", ")}` : "no chromosomes";
  const why = manifest.defaultSource === "joint"
    ? `joint is the default: better on ${betterOn(manifest).join(", ") || "all criteria"}`
    : `regular is the default: joint did not pass ${manifest.criteria.filter((c) => !c.pass).map((c) => c.label).join(", ") || "the criteria"}`;
  const outside = manifest.outside ? `; other chromosomes: ${manifest.outside}` : "";
  return `Joint junction balance on ${chr} (${manifest.cells.length} cells)${outside}. ${why}.`;
}

/** Requested source if usable, else regular. */
export function resolveCnSource(requested, manifest) {
  return requested === "joint" && manifest ? "joint" : "regular";
}

/**
 * cellFiles with each cell's genome taken from `genomes` (the joint complex.json files). Cells without a joint file get
 * genome null (shown as not available), never the regular graph under the joint label. Mutations are kept.
 */
export function cellFilesWithGenomes(cellFiles, genomes) {
  const out = {};
  Object.keys(cellFiles || {}).forEach((id) => {
    out[id] = { ...cellFiles[id], genome: genomes && genomes[id] ? genomes[id] : null };
  });
  return out;
}

/**
 * Reducer helper: the SingleCell state showing `source`. Needs state.cnRegular ({ cn, junctions, cellFiles } saved at
 * load). joint applies only once state.cnJoint.data ({ cn, junctions, genomes }) is loaded; until then the state keeps
 * showing regular (cnSource) while cnSourceRequested records the request.
 */
export function withCnSource(state, source) {
  const reg = state.cnRegular;
  if (!reg) return { ...state, cnSourceRequested: source };
  if (source === "joint" && state.cnJoint?.status === "ok" && state.cnJoint.data) {
    const d = state.cnJoint.data;
    return { ...state, cnSource: "joint", cnSourceRequested: "joint", cn: d.cn, junctions: d.junctions, cellFiles: cellFilesWithGenomes(reg.cellFiles, d.genomes) };
  }
  if (source === "joint") return { ...state, cnSourceRequested: "joint" };
  return { ...state, cnSource: "regular", cnSourceRequested: "regular", cn: reg.cn, junctions: reg.junctions, cellFiles: reg.cellFiles };
}
