// "Hi-C with each graph" (paired) layout of the track browser: every Hi-C unit gets its own row group with its contact
// map and its genome graph / coverage / junction lane in a per-unit order, instead of the separate stacked Hi-C
// section ("stacked", the other mode). Spec v0.5 `layout.hic_mode`, `layout.unit_order`, `layout.group_by`,
// `layout.interleave`; also kept in localStorage. d3-free (jest).

export const UNIT_TRACKS = ["hic", "graph", "coverage", "junctions"];
export const TRACK_LABELS = { hic: "Hi-C map", graph: "genome graph", coverage: "coverage", junctions: "junctions / EagleC" };
export const HIC_MODES = ["stacked", "paired"];
const STORE_KEY = "gos.trackBrowser.hicLayout.v1";

/** A complete order: the known tracks of `order` (duplicates and unknown names dropped), then any missing ones. */
export function normalizeOrder(order) {
  const seen = new Set();
  const out = [];
  (Array.isArray(order) ? order : []).forEach((t) => {
    if (UNIT_TRACKS.includes(t) && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  });
  UNIT_TRACKS.forEach((t) => !seen.has(t) && out.push(t));
  return out;
}

/** The order with `track` moved up (dir -1) or down (+1); unchanged at the ends. */
export function moveTrack(order, track, dir) {
  const o = normalizeOrder(order);
  const i = o.indexOf(track);
  const j = i + (dir < 0 ? -1 : 1);
  if (i < 0 || j < 0 || j >= o.length) return o;
  [o[i], o[j]] = [o[j], o[i]];
  return o;
}

/** The order of one unit: its override when there is one, else the default ("same order for all units"). */
export const orderFor = (unitOrder, unit) => normalizeOrder(unitOrder?.per_unit?.[unit] || unitOrder?.default);

/** Set (order) or clear (null) a unit's override; returns a new unit_order. */
export function setUnitOrder(unitOrder, unit, order) {
  const per = { ...(unitOrder?.per_unit || {}) };
  if (order == null) delete per[unit];
  else per[unit] = normalizeOrder(order);
  return { default: normalizeOrder(unitOrder?.default), per_unit: per };
}

/** Default layout state. */
export const defaultHicLayout = () => ({ hicMode: "stacked", unitOrder: { default: [...UNIT_TRACKS], per_unit: {} }, groupBy: "sample", interleave: false });

/** Spec v0.5 `layout` fields from the state. */
export function hicLayoutToSpec(st) {
  const s = { ...defaultHicLayout(), ...(st || {}) };
  return {
    hic_mode: HIC_MODES.includes(s.hicMode) ? s.hicMode : "stacked",
    unit_order: { default: normalizeOrder(s.unitOrder?.default), per_unit: Object.fromEntries(Object.entries(s.unitOrder?.per_unit || {}).map(([k, v]) => [k, normalizeOrder(v)])) },
    group_by: s.groupBy === "none" ? "none" : "sample",
    interleave: Boolean(s.interleave),
  };
}

/** State from a spec `layout` (v0.4 specs without these fields give the defaults). */
export function hicLayoutFromSpec(layout) {
  const d = defaultHicLayout();
  if (!layout || typeof layout !== "object") return d;
  return {
    hicMode: HIC_MODES.includes(layout.hic_mode) ? layout.hic_mode : d.hicMode,
    unitOrder: {
      default: normalizeOrder(layout.unit_order?.default),
      per_unit: Object.fromEntries(Object.entries(layout.unit_order?.per_unit || {}).map(([k, v]) => [k, normalizeOrder(v)])),
    },
    groupBy: layout.group_by === "none" ? "none" : "sample",
    interleave: Boolean(layout.interleave),
  };
}

/** Stored layout (or null); never throws (private windows, blocked storage). */
export function loadHicLayout(storage = typeof window !== "undefined" ? window.localStorage : null) {
  try {
    const raw = storage?.getItem(STORE_KEY);
    return raw ? hicLayoutFromSpec(JSON.parse(raw)) : null;
  } catch (e) {
    return null;
  }
}
export function saveHicLayout(st, storage = typeof window !== "undefined" ? window.localStorage : null) {
  try {
    storage?.setItem(STORE_KEY, JSON.stringify(hicLayoutToSpec(st)));
    return true;
  } catch (e) {
    return false;
  }
}
