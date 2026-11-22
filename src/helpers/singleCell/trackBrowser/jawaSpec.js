// Spec v0.6 JaWA track types: state of the track browser sections <-> gos-track-spec tracks. d3-free.
import { WALK_LAYERS } from "./walkTracks";

export const JAWA_TYPES = ["cn_heatmap", "cn_correlation_1d", "cn_correlation_2d", "walks", "atac"];
export const ATAC_URL = "{dataPath}{unit}/atac/signal.json";

/** Default state of the JaWA sections (spec tracks of these types switch them on; see jawaStateFromTracks). */
export const defaultJawaState = () => ({
  on: { cn_heatmap: false, cn_correlation_1d: false, cn_correlation_2d: false, walks: false, atac: false },
  log: true, tumorOnly: true, anchor: null, corrHeight: 320, heatHeight: 240, walkLayer: "curated", walkMinCells: 0, perCopy: false,
});

/** State from spec tracks (v0.6 types); unknown fields ignored. */
export function jawaStateFromTracks(tracks, base = defaultJawaState()) {
  const s = { ...base, on: { ...base.on } };
  (tracks || []).forEach((t) => {
    if (!JAWA_TYPES.includes(t?.type)) return;
    s.on[t.type] = t.visible !== false;
    if (t.type === "cn_correlation_1d" && t.anchor) s.anchor = t.anchor;
    if (t.type.startsWith("cn_") && t.log != null) s.log = Boolean(t.log);
    if (t.type === "cn_correlation_2d" && Number(t.height) > 0) s.corrHeight = Number(t.height);
    if (t.type === "cn_heatmap" && Number(t.height) > 0) s.heatHeight = Number(t.height);
    if (t.type === "walks" && t.layer) s.walkLayer = t.layer;
    if (t.type === "atac" && t.per_copy != null) s.perCopy = Boolean(t.per_copy);
  });
  return s;
}

/** Spec tracks (v0.6) for the switched-on sections. */
export function jawaTracks(s) {
  const out = [];
  const cn = { url: "{dataPath}{patient}/cn_binned.json", format: "gos-sc-cn-binned/1", level: "100kb", log: s.log, units: s.tumorOnly ? "tumor" : "all" };
  if (s.on.cn_heatmap) out.push({ id: "cnheat", type: "cn_heatmap", title: "CN heat map", ...cn, height: s.heatHeight, annotations: ["group", "ecdna"] });
  if (s.on.cn_correlation_1d) out.push({ id: "cncor1", type: "cn_correlation_1d", title: "CN correlation with anchor", ...cn, anchor: s.anchor, height: 70 });
  if (s.on.cn_correlation_2d) out.push({ id: "cncor2", type: "cn_correlation_2d", title: "CN correlation map", ...cn, mode: "triangle", height: s.corrHeight });
  if (s.on.walks) out.push({ id: "walks", type: "walks", title: "Walks", url: `{dataPath}{patient}/${(WALK_LAYERS.find((l) => l.id === s.walkLayer) || WALK_LAYERS[0]).file}`, format: "gos-sc-walks/1", layer: s.walkLayer, min_cells: s.walkMinCells });
  if (s.on.atac) out.push({ id: "atac", type: "atac", title: "ATAC", per_unit: true, url: ATAC_URL, format: "gos-atac-bins/1", per_copy: s.perCopy, group_by: "group" });
  return out;
}

