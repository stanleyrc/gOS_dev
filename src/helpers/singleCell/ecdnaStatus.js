// d3-free: ecDNA status from single-cell CN dispersion (data/<P>/ecdna_status.json, skilift gos_sc_ecdna_status.py).
// The status is a call on segregation behaviour (variance of per-cell CN within tree clades), shown beside the
// gGnome DM / Cpxdm label (a junction-pattern call). They answer different questions and can disagree:
// a cyclic amplicon that integrated (HSR) keeps its DM junctions but is inherited stably.
import { parseFootprint } from "./complexZoom";

export const STATUS_FILE = "ecdna_status.json";

/** Chip text per exporter verdict. "nested" (unstable clade containing a stable sub-clade) reads as mixed. */
export const VERDICT_TEXT = {
  "ecDNA-like": "ecDNA-like",
  "chromosomal / integrated": "stable (chromosomal/integrated)",
  mixed: "mixed",
  nested: "mixed",
  indeterminate: "indeterminate",
  "not enough": "not enough",
};
export const VERDICT_COLOR = { "ecDNA-like": "magenta", "chromosomal / integrated": "blue", mixed: "gold", nested: "gold", indeterminate: "default", "not enough": "default" };
export const CALL_COLOR = { unstable: "#c41d7f", "unstable (sister untested)": "#eb7bb5", stable: "#1d39c4", indeterminate: "#8c8c8c", "not enough": "#bfbfbf" };
const DECISIVE = new Set(["ecDNA-like", "chromosomal / integrated", "mixed", "nested"]);

export const RULE_TEXT =
  "ecDNA status (CN dispersion): D = per-cell CN variance beyond measurement noise / mean, within SNV-tree clades (S-phase cells excluded). " +
  "Unstable (ecDNA-like): D 95% CI > 1; stable (chromosomal / integrated): D CI < 0.5, i.e. tighter than one round of random segregation; " +
  "not enough: < 10 carrier cells or CN < 5. gGnome DM is a junction-pattern call and can coexist with stable inheritance (integrated ecDNA).";

export const isEcdnaKind = (k) => /^(dm|cpxdm)$/i.test(`${k || ""}`);

/** True when the event or its family is a gGnome DM / Cpxdm call. */
export function isEcdnaEvent(entryOrEvent) {
  if (!entryOrEvent) return false;
  const e = entryOrEvent.event || entryOrEvent;
  return isEcdnaKind(entryOrEvent.family?.dominant?.vartype) || isEcdnaKind(e.vartype);
}

/** Footprint string of a driver entry (family union first) or a raw event. */
export function footprintOf(entryOrEvent) {
  if (!entryOrEvent) return "";
  const f = entryOrEvent.family;
  return f?.footprint || f?.dominant?.Genome_Location || entryOrEvent.event?.Genome_Location || entryOrEvent.Genome_Location || "";
}

/** Combine several amplicon verdicts into one chip verdict. */
export function combineVerdicts(verdicts = []) {
  const v = verdicts.filter(Boolean);
  if (!v.length) return null;
  const dec = v.filter((x) => DECISIVE.has(x));
  if (!dec.length) return v.includes("indeterminate") ? "indeterminate" : "not enough";
  const kinds = new Set(dec.map((x) => (x === "nested" ? "mixed" : x)));
  if (kinds.size === 1) return [...kinds][0];
  return "mixed";
}

/**
 * Status of the amplicons (kind "amplicon") overlapping a footprint.
 * doc: parsed ecdna_status.json or null. Returns null when doc is missing or nothing overlaps.
 * { verdict, text, color, amplicons: [amplicon objects] }
 */
export function statusForFootprint(doc, location) {
  if (!doc || !Array.isArray(doc.amplicons)) return null;
  const fp = parseFootprint(location);
  if (!fp.length) return null;
  const amps = doc.amplicons.filter((a) => a.kind === "amplicon" && fp.some((f) => `${f.chromosome}` === `${a.chrom}` && f.start <= a.end && f.end >= a.start));
  if (!amps.length) return null;
  const verdict = combineVerdicts(amps.map((a) => a.verdict));
  return { verdict, text: VERDICT_TEXT[verdict] || verdict, color: VERDICT_COLOR[verdict] || "default", amplicons: amps };
}

/** Status for a driver entry / event, only for gGnome DM / Cpxdm calls (null otherwise). */
export function statusForEvent(doc, entryOrEvent) {
  if (!isEcdnaEvent(entryOrEvent)) return null;
  return statusForFootprint(doc, footprintOf(entryOrEvent));
}

const short = (g) => `${g}`.replace(/^[A-Za-z0-9]+_(n\d+)$/, "$1");
const fmt = (x, d = 2) => (Number.isFinite(x) ? Number(x).toPrecision(d) : "n/a");

/** Groups with a call other than "not enough", ALL first, then decisive calls, then by carriers. */
export function cladeRows(amplicon) {
  const order = { unstable: 0, "unstable (sister untested)": 1, stable: 0, indeterminate: 2, "not enough": 3 };
  return (amplicon?.groups || [])
    .filter((g) => g.call && g.call !== "not enough")
    .map((g) => ({
      key: g.group,
      clade: g.group === "ALL" ? "all tumour cells" : short(g.group),
      call: g.call,
      n: g.n_carriers,
      nGroup: g.n_group,
      median: g.median,
      cv: g.cv,
      D: g.D,
      ci: [g.D_lo, g.D_hi],
      dSib: g.D_sib,
      loss: g.loss_frac,
      ggDm: g.gg_dm_cells,
      text: `${g.group === "ALL" ? "all" : short(g.group)}: ${g.call}, ${g.n_carriers} cells, CN ${fmt(g.median, 3)}, CV ${fmt(g.cv)}, D ${fmt(g.D)} (${fmt(g.D_lo)} to ${fmt(g.D_hi)})`,
    }))
    .sort((a, b) => (a.key === "ALL" ? -1 : b.key === "ALL" ? 1 : (order[a.call] ?? 4) - (order[b.call] ?? 4) || (b.n || 0) - (a.n || 0)));
}

/** One-line summary: which clades are stable / unstable. */
export function cladeSummary(amplicon) {
  const g = amplicon?.groups || [];
  const st = g.filter((x) => x.call === "stable" && x.group !== "ALL").map((x) => short(x.group));
  const un = g.filter((x) => `${x.call}`.startsWith("unstable") && x.group !== "ALL").map((x) => short(x.group));
  const parts = [];
  if (un.length) parts.push(`ecDNA-like in ${un.slice(0, 4).join(", ")}${un.length > 4 ? ` +${un.length - 4}` : ""}`);
  if (st.length) parts.push(`stable in ${st.slice(0, 4).join(", ")}${st.length > 4 ? ` +${st.length - 4}` : ""}`);
  return parts.join("; ");
}

/** Tooltip lines for a status (per amplicon: label, verdict, clade summary, all-cell D). */
export function statusLines(status, { maxAmplicons = 4 } = {}) {
  if (!status) return [];
  const lines = [`ecDNA status (CN dispersion): ${status.text}`];
  status.amplicons.slice(0, maxAmplicons).forEach((a) => {
    const all = (a.groups || []).find((g) => g.group === "ALL");
    const where = `chr${a.chrom}:${(a.start / 1e6).toFixed(1)}-${(a.end / 1e6).toFixed(1)} Mb${a.label ? ` (${a.label})` : ""}`;
    const cs = cladeSummary(a);
    lines.push(`${where}: ${VERDICT_TEXT[a.verdict] || a.verdict}${cs ? `; ${cs}` : ""}${all && Number.isFinite(all.D) ? `; all cells D ${fmt(all.D)} (${fmt(all.D_lo)} to ${fmt(all.D_hi)})` : ""}`);
  });
  if (status.amplicons.length > maxAmplicons) lines.push(`+${status.amplicons.length - maxAmplicons} more amplicons`);
  return lines;
}

/** Single line for SVG <title> hovers (oncoprint). */
export const statusHoverText = (status) => (status ? statusLines(status, { maxAmplicons: 2 }).join("\n") : "");

const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
};

/**
 * Per-clade CN dot plot of one amplicon. Needs doc.cells, doc.clade_cells and amplicon.values
 * (older exports lack them: returns { available: false, reason }).
 * Groups: all tumour cells, then decisive clades (stable, unstable) by size, up to maxGroups. S-phase cells dropped.
 * Returns { available, groups: [{ key, label, call, x, points: [{ x, y, cell, value }] }], yTicks: [{ y, label }], width, height }.
 */
export function dotPlotLayout(doc, amplicon, { width = 520, height = 220, maxGroups = 6, margin = { l: 44, r: 8, t: 8, b: 40 } } = {}) {
  if (!doc?.cells || !doc?.clade_cells || !Array.isArray(amplicon?.values)) return { available: false, reason: "per-cell values not in this ecdna_status.json export" };
  const sph = doc.sphase || [];
  const rows = cladeRows(amplicon);
  const pick = [rows.find((r) => r.key === "ALL"), ...rows.filter((r) => r.key !== "ALL" && (r.call === "stable" || r.call.startsWith("unstable")))].filter(Boolean);
  const seen = new Set();
  const groups = [];
  pick.forEach((r) => {
    if (groups.length >= maxGroups || seen.has(r.key)) return;
    seen.add(r.key);
    const idx = r.key === "ALL" ? doc.cells.map((_, i) => i) : doc.clade_cells[r.key] || [];
    const vals = idx.filter((i) => !sph[i] && Number.isFinite(amplicon.values[i]) && amplicon.values[i] > 0).map((i) => ({ i, v: amplicon.values[i] }));
    groups.push({ key: r.key, label: r.clade, call: r.call, n: vals.length, D: r.D, vals });
  });
  const all = groups.flatMap((g) => g.vals.map((p) => p.v));
  if (!all.length) return { available: false, reason: "no measured cells" };
  const lo = Math.log10(Math.max(0.5, Math.min(...all) * 0.9));
  const hi = Math.log10(Math.max(...all) * 1.1);
  const ih = height - margin.t - margin.b;
  const y = (v) => margin.t + ih - ((Math.log10(Math.max(v, 0.5)) - lo) / Math.max(hi - lo, 1e-9)) * ih;
  const bw = (width - margin.l - margin.r) / Math.max(groups.length, 1);
  const out = groups.map((g, k) => {
    const cx = margin.l + bw * (k + 0.5);
    return {
      key: g.key,
      label: g.label,
      call: g.call,
      n: g.n,
      D: g.D,
      x: cx,
      points: g.vals.map((p) => ({ x: cx + (hash(`${doc.cells[p.i]}|${g.key}`) - 0.5) * bw * 0.6, y: y(p.v), cell: doc.cells[p.i], value: p.v })),
    };
  });
  const ticks = [];
  for (let e = Math.floor(lo); e <= Math.ceil(hi); e += 1) {
    [1, 2, 5].forEach((m) => {
      const v = m * 10 ** e;
      if (Math.log10(v) >= lo && Math.log10(v) <= hi) ticks.push({ y: y(v), label: `${v}` });
    });
  }
  return { available: true, groups: out, yTicks: ticks, width, height, margin };
}

/** Hover lines for a list of oncoprint items ({ event } or entries): one status per distinct gGnome DM footprint. */
export function ecdnaHoverLines(items = [], doc = null) {
  if (!doc) return [];
  const seen = new Set();
  const out = [];
  items.forEach((it) => {
    const s = statusForEvent(doc, it);
    if (!s) return;
    const key = s.amplicons.map((a) => a.id).join("|");
    if (seen.has(key)) return;
    seen.add(key);
    out.push(statusHoverText(s));
  });
  return out;
}
