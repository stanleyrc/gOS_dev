// Spec v0.5 (JW-07): process-caller events lane (`events` track with url cin_events.json) and the clade x plate
// whole-chromosome change rates (`units.clade_rates` -> clade_rates.json). d3-free (jest).
import { normalizeEvents } from "./events";

const num = (v) => (v === null || v === "" || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
const isNa = (v) => v == null || v === "" || v === "NA";

/** by_group as text: { c1: 3 } -> "c1:3"; { by, measure, values: { T0_A: 3 } } -> "carriers by plate: T0_A:3" ("" when empty). */
export function byGroupText(v) {
  if (isNa(v)) return "";
  if (typeof v !== "object") return `${v}`;
  if (v.values && typeof v.values === "object") {
    const vals = Object.entries(v.values).map(([k, x]) => `${k}:${x}`).join(", ");
    return vals ? `${v.measure || "values"} by ${v.by || "group"}: ${vals}` : "";
  }
  return Object.entries(v).filter(([, x]) => typeof x !== "object").map(([k, x]) => `${k}:${x}`).join(", ");
}

/** Status key of a JW-07 call: "fixed" | "fixed subclonal" | "unresolved" | "other". */
export function cinStatusKey(status) {
  const s = `${status || ""}`.toLowerCase();
  if (!s) return "other";
  if (s.includes("unresolved") || s.includes("ongoing")) return "unresolved";
  if (s.includes("subclonal")) return "fixed subclonal";
  if (s.startsWith("fixed") || s.includes("clonal")) return "fixed";
  return "other";
}

export const CIN_STATUS_COLORS = { fixed: "#1b7837", "fixed subclonal": "#7fbf7b", unresolved: "#e08214", other: "#999999" };
export const CIN_STATUS_LEGEND = ["fixed", "fixed subclonal", "unresolved"].map((k) => [k, CIN_STATUS_COLORS[k]]);
export const cinStatusColor = (status) => CIN_STATUS_COLORS[cinStatusKey(status)];

/** An events track drawn as a JW-07 process-caller lane (colored by status): `color_by: "status"` or a cin_events url. */
export const isCinEventsTrack = (t) => Boolean(t) && (t.color_by === "status" || /cin_events\.json$/.test(`${t.url || ""}`));

/**
 * cin_events.json `{ source, caveat, events: [...] }` (contract v0.5) -> { source, caveat, events } with each event
 * normalized as the events lane (normalizeEvents) plus JW-07 fields: statusKey, statusRule, carrierFrac, byGroup,
 * evidence, arm, direction. An `unavailable` / `not_available` string is kept as `notAvailable`.
 */
export function normalizeCinEvents(json) {
  const raw = Array.isArray(json) ? json : Array.isArray(json?.events) ? json.events : [];
  const base = normalizeEvents(raw);
  const byId = new Map(raw.map((e) => [`${e.id ?? ""}`, e]));
  const events = base.map((e) => {
    const r = byId.get(e.id) || {};
    return {
      ...e,
      statusKey: cinStatusKey(e.status),
      statusRule: r.status_rule || "",
      carrierFrac: num(r.carrier_frac),
      byGroup: byGroupText(r.by_group),
      evidence: isNa(r.evidence) ? "" : `${r.evidence}`,
      arm: isNa(r.arm) ? "" : `${r.arm}`,
      direction: isNa(r.direction) ? "" : `${r.direction}`,
    };
  });
  const na = json && !Array.isArray(json) ? json.not_available || json.unavailable || null : null;
  return { source: json?.source ?? null, caveat: json?.caveat || "", events, notAvailable: na ? `${na}` : null };
}

/** Bar label of a JW-07 event: "<arm or id> <direction> · <status>". */
export function cinEventLabel(ev) {
  const where = ev.kind === "arm" && ev.arm ? ev.arm : ev.id;
  return `${where}${ev.direction ? ` ${ev.direction}` : ""} · ${ev.statusKey === "other" ? ev.status || "n/a" : ev.statusKey}`;
}

/** Tooltip lines of a JW-07 event (class, status, rule, confidence, carrier fraction, by group, evidence). */
export function cinEventLines(ev) {
  const lines = [
    `JW-07 ${ev.kind} ${ev.id}${ev.arm ? ` (${ev.arm}${ev.direction ? ` ${ev.direction}` : ""})` : ""} · chr${ev.chrom}:${ev.start.toLocaleString()}-${ev.end.toLocaleString()}`,
    `class: ${ev.cls || "not available"}`,
    `status: ${ev.status || "not available"}${ev.statusRule && ev.statusRule !== ev.status ? ` (rule: ${ev.statusRule})` : ""}`,
    `confidence: ${ev.confidence || "not available"} · carrier fraction: ${ev.carrierFrac != null ? ev.carrierFrac.toFixed(2) : "not available"}`,
  ];
  if (ev.byGroup) lines.push(`by group: ${ev.byGroup}`);
  if (ev.evidence) {
    // wrap long evidence strings for the tooltip
    const words = ev.evidence.split(/\s+/);
    let cur = "evidence:";
    words.forEach((w) => {
      if (cur.length + w.length > 70) {
        lines.push(cur);
        cur = `  ${w}`;
      } else cur = `${cur} ${w}`;
    });
    lines.push(cur);
  }
  return lines;
}

/**
 * clade_rates.json (contract v0.5) -> { unit, source, notAvailable, rows: [{ clade, plate, n_cells, rate, lo, hi, p }],
 * byDataset, contrast }. `plate`: keep only that plate's rows (per-plate datasets; the file may already be filtered).
 */
export function normalizeCladeRates(json, plate = null) {
  if (!json || typeof json !== "object") return { unit: "", source: null, notAvailable: "no clade_rates.json", rows: [], byDataset: [], contrast: [] };
  const rows = (Array.isArray(json.by_clade_plate) ? json.by_clade_plate : [])
    .map((r) => ({ clade: `${r.clade ?? ""}`, plate: `${r.plate ?? r.sample ?? ""}`, n_cells: num(r.n_cells), rate: num(r.rate), lo: num(r.lo), hi: num(r.hi), p: num(r.p_per_chrom) }))
    .filter((r) => r.clade && (!plate || r.plate === `${plate}`));
  const na = json.not_available || json.unavailable || null;
  return {
    unit: json.unit || "",
    source: json.source ?? null,
    notAvailable: na ? `${na}` : rows.length ? null : "no clade x plate rates for this dataset",
    rows,
    byDataset: Array.isArray(json.by_dataset) ? json.by_dataset : [],
    contrast: Array.isArray(json.contrast) ? json.contrast : [],
  };
}

/** Rate rows of one clade (plates in time-course order). */
export function ratesOfClade(rates, clade) {
  const order = (p) => {
    const m = `${p}`.match(/T(\d+)/);
    return m ? Number(m[1]) * 10 + (`${p}`.endsWith("B") ? 1 : 0) : 999;
  };
  return (rates?.rows || []).filter((r) => r.clade === `${clade}`).sort((a, b) => order(a.plate) - order(b.plate));
}

/** "0.27 [0.12, 0.47] (n 96)" for a rate row; "not available" when the rate is missing. */
export function formatRate(r) {
  if (!r || r.rate == null) return "not available";
  const f = (v) => (v == null ? "?" : v < 0.01 ? v.toExponential(1) : v.toFixed(2));
  return `${f(r.rate)} [${f(r.lo)}, ${f(r.hi)}]${r.n_cells != null ? ` (n ${r.n_cells})` : ""}`;
}

/** The plate of a per-plate dataset id (datac_sw620_t0_a -> T0_A); null for H1299 / joint / MCF7. */
export function plateOfDataset(id) {
  const m = `${id || ""}`.match(/_t(\d+)_([ab])$/i);
  return m ? `T${m[1]}_${m[2].toUpperCase()}` : null;
}
