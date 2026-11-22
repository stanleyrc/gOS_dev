// gos-track-spec (docs/track_spec.md): build, validate and resolve the JSON view spec shared with gCells / gTrack.
import { formatLocus, parseLocus } from "./locus";

export const SPEC_NAME = "gos-track-spec";
export const SPEC_VERSION = "0.5";
export const KNOWN_TYPES = ["coverage", "graph", "reads", "genes", "junctions", "snv_reads", "signature", "events", "cn_heatmap", "atac", "cn_diff", "atac_residual", "atac_cn"];
export const RESERVED_TYPES = ["junction_support", "walks", "cn_correlation_1d", "cn_correlation_2d", "hic", "segments", "peaks"];
/** Types computed in the browser from other tracks (no url). */
export const DERIVED_TYPES = ["cn_diff"];

/** The default M1 tracks over the interim gOS per-cell files (coverage.arrow, complex.json, pooled junction slices). */
export function interimTracks() {
  return [
    { id: "genes", type: "genes", title: "Genes", url: "genes/{genome}.arrow", format: "gos-genes-arrow", height: 34 },
    { id: "jx", type: "junctions", title: "Junctions (cells)", url: "{dataPath}{patient}/junctions_table.json", format: "gos-sc-junctions-table", y: { field: "n_cells_tumour" }, min: { n_cells_tumour: 10 }, height: 60 },
    { id: "graph", type: "graph", title: "Genome graph", per_unit: true, url: "{dataPath}{unit}/complex.json", format: "gggnome-json", y: { field: "cn", max: "auto" }, height: 34 },
    { id: "cov", type: "coverage", title: "Coverage", per_unit: true, url: "{dataPath}{unit}/coverage.arrow", format: "arrow", value: "cn", y: { max: "auto" }, axes: { left: "cn", right: "expected_depth" }, height: 34 },
    { id: "reads", type: "reads", title: "Reads", url: "{dataPath}{patient}/slices/junctions.dna.bam", format: "bam", read_group: "unit", fallback_url: "{dataPath}{unit}/reads.bam", window: 300, max_units: 6, target: "junction", group_by: "unit" },
  ];
}

/** The patient-level v0.4 tracks gOS adds when a dataset has the files (a missing file is a "not available" row). */
export function v04Tracks() {
  return [
    { id: "events", type: "events", title: "Events", url: "{dataPath}{patient}/events.json", format: "gos-events-json", height: 44 },
    { id: "cnhm", type: "cn_heatmap", title: "CN heat map", url: "{dataPath}{patient}/cn_heatmap/index.json", format: "gos-cn-heatmap-u16", row_px: 3, strips: ["clade", "plate", "time_point", "s_phase", "qc_mapd", "depth", "ecdna_call", "cin_wc_changes", "cin_events_carried"] },
    { id: "cndiff", type: "cn_diff", title: "CN difference", by: "clade", a: [], b: [], height: 60, visible: false },
    { id: "atac", type: "atac", title: "ATAC", url: "{dataPath}{patient}/atac/index.json", format: "gos-atac-index", per_unit: false, per_copy: false, cell_url: "{dataPath}{unit}/atac.arrow", height: 40 },
  ];
}

/** Depth of a cell record: good B fragments when present, else B unique fragments, else null. */
const cellDepth = (c) => {
  const v = c.b_frag_good ?? c.B_unique_fragments;
  return Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : null;
};

/** Units of a patient from the gOS cell records (state.SingleCell.cells), in row order (tree leaf order first). */
export function unitsFromCells(cells, order = [], cloneColors = {}) {
  const byId = new Map((cells || []).map((c) => [c.cell_id, c]));
  const ids = (order && order.length ? order : (cells || []).map((c) => c.cell_id)).filter((id) => byId.has(id));
  const list = ids.map((id) => {
    const c = byId.get(id);
    const purity = Number(c.qc_purity);
    return {
      id,
      label: c.label || id,
      group: c.clone_id ?? null,
      purity: purity > 0 && purity <= 1 ? purity : 1,
      ploidy: Number(c.ploidy) > 0 ? Number(c.ploidy) : null,
      mean_depth: Number(c.qc_depth) > 0 ? Number(c.qc_depth) : null,
      normal: c.normal === true || c.clone_id === "Normal",
      // v0.4 attributes (dATAC contract): heat-map strips and the depth / S-phase filters
      plate: c.plate ?? null,
      time_point: c.time_point ?? null,
      replicate: c.replicate ?? null,
      s_phase: c.s_phase ?? null,
      qc_mapd: Number.isFinite(Number(c.qc_mapd)) && c.qc_mapd !== null && c.qc_mapd !== "" ? Number(c.qc_mapd) : null,
      depth: cellDepth(c),
      depth_class: c.depth_class ?? null,
      ecdna_call: c.ecdna_call ?? null,
      // v0.5 (JW-07) heat-map strips
      cin_wc_changes: c.cin_wc_changes ?? null,
      cin_events_carried: c.cin_events_carried ?? null,
    };
  });
  const groups = {};
  list.forEach((u) => {
    if (u.group != null && !groups[u.group]) groups[u.group] = { color: cloneColors[u.group] || null };
  });
  return { kind: "cell", tree: "tree.nwk", order: "tree", list, groups };
}

/** A spec for the current view (export, or the default view of a patient). */
export function buildSpec({ id, title, genome = "hg38", patient, windows, units, tracks = interimTracks(), selection = null, provenance = {} }) {
  return {
    spec: SPEC_NAME,
    version: SPEC_VERSION,
    id: id || `${patient}_view`,
    title: title || `${patient} track view`,
    genome,
    patient,
    loci: formatLocus(windows).split(" | "),
    units,
    tracks,
    ...(selection ? { selection } : {}),
    provenance: { tool: "gOS track browser", created: new Date().toISOString().slice(0, 19), ...provenance },
  };
}

/** Problems with a spec: [] when it can be drawn. Unknown fields are ignored; unknown track types are reported. */
export function validateSpec(spec) {
  const errors = [];
  if (!spec || typeof spec !== "object") return ["not a JSON object"];
  if (spec.spec !== SPEC_NAME) errors.push(`spec must be "${SPEC_NAME}"`);
  const major = `${spec.version || ""}`.split(".")[0];
  if (major !== SPEC_VERSION.split(".")[0]) errors.push(`version ${spec.version} is not readable by ${SPEC_VERSION}`);
  if (!Array.isArray(spec.loci) || !spec.loci.length) errors.push("loci must be a non-empty array");
  else {
    // v0.5: "genome" is the genome-wide view (drawn by the genome-wide tracks; windows fall back to the first preset)
    const { errors: bad } = parseLocus(spec.loci.filter((l) => `${l}`.trim().toLowerCase() !== "genome").join("|") || "chr1:1-1000");
    if (bad.length) errors.push(`unparseable loci: ${bad.join(", ")}`);
  }
  if (!Array.isArray(spec.tracks)) errors.push("tracks must be an array");
  else
    spec.tracks.forEach((t, i) => {
      if (!t || !t.id) errors.push(`track ${i} has no id`);
      else if (!KNOWN_TYPES.includes(t.type) && !RESERVED_TYPES.includes(t.type)) errors.push(`track ${t.id}: unknown type ${t.type}`);
      if (t && t.per_unit && !`${t.url || ""}`.includes("{unit}")) errors.push(`track ${t.id}: per_unit url needs {unit}`);
      if (t && t.type === "cn_diff" && t.by && !["clade", "time_point"].includes(t.by)) errors.push(`track ${t.id}: cn_diff.by must be clade or time_point`);
    });
  if (spec.tracks?.some((t) => t?.per_unit) && !Array.isArray(spec.units?.list)) errors.push("per-unit tracks need units.list");
  return errors;
}

/** Fill {dataPath} {patient} {unit} {genome} in a track url; relative urls resolve against base (the spec's own URL). */
export function resolveUrl(template, { dataPath = "", patient = "", unit = "", genome = "hg38", base = null } = {}) {
  const u = `${template || ""}`
    .replace(/\{dataPath\}/g, dataPath)
    .replace(/\{patient\}/g, patient)
    .replace(/\{unit\}/g, unit)
    .replace(/\{genome\}/g, genome);
  if (!base || /^([a-z]+:)?\/\//i.test(u) || u.startsWith("/") || `${template || ""}`.startsWith("{dataPath}")) return u;
  return `${base.replace(/[^/]*$/, "")}${u}`;
}

/** Units kept by a selection (ids or groups); all units when the selection is empty. */
export function selectUnits(list, selection) {
  const ids = new Set(selection?.units || []);
  const groups = new Set(selection?.clades || []);
  if (!ids.size && !groups.size) return list;
  return list.filter((u) => ids.has(u.id) || (u.group != null && groups.has(u.group)));
}
