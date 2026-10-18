// d3-free helpers for complex SV labels (every chromosome involved), twin groups and ecDNA (DM) footprint overlap.
import { parseFootprint } from "./complexZoom";

const splitIds = (s) => `${s || ""}`.split(",").map((x) => x.trim()).filter(Boolean);
const NAMES = { cpxdm: "complex DM", tyfonas: "tyfonas", pyrgo: "pyrgo", rigma: "rigma", qrp: "QRP", chromoplexy: "chromoplexy", chromothripsis: "chromothripsis" };
export const kindName = (v) => (v ? NAMES[`${v}`.toLowerCase()] || `${v}` : "complex");

/** Chromosomes of a footprint, unique, in footprint order. */
export function complexChromosomes(location) {
  return [...new Set(parseFootprint(location).map((iv) => iv.chromosome))];
}

/** "chr1↔chr7" (every chromosome in footprint order); "chr1" for a single one; "" when unreadable. */
export function chromosomeSpan(location) {
  return complexChromosomes(location).map((c) => `chr${c}`).join("↔");
}

/** Old short form: the first chromosome only ("rDelDup chr1"), kept as secondary text / for links and tests. */
export function legacyComplexLabel(event) {
  const first = complexChromosomes(event?.Genome_Location)[0];
  return `${kindName(event?.vartype)}${event?.gene ? ` ${event.gene}` : ""}${first ? ` chr${first}` : ""}`.trim();
}

/** twin_names of a row as an array (it may arrive as an array or a JSON / python-style list string). */
export function twinNamesOf(event) {
  const t = event?.twin_names;
  if (Array.isArray(t)) return t.map(String);
  if (typeof t === "string" && t.trim()) return [...t.matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
  return [];
}

/** "TIC / rDelDup" from twin row names like "TIC (6,8)", "rDelDup (6,8)" (or the rows' vartypes). */
export function twinKindText(names) {
  return [...new Set(names.map((n) => kindName(`${n}`.replace(/\s*\(.*$/, "").trim())))].join(" / ");
}

/**
 * Collapse the rows of one twin group (the classifier reported the same junction set under two names) into the
 * first row. Returns { events: rows without the later twins, twins: Map(first row -> { group, names, rows }) }.
 */
export function collapseTwins(events = []) {
  const groups = new Map();
  events.forEach((e) => {
    if (e?.twin_group) {
      if (!groups.has(e.twin_group)) groups.set(e.twin_group, []);
      groups.get(e.twin_group).push(e);
    }
  });
  const twins = new Map();
  const dropped = new Set();
  groups.forEach((rows, group) => {
    if (rows.length < 2) return;
    const names = twinNamesOf(rows[0]);
    twins.set(rows[0], { group, names: names.length ? names : rows.map((r) => r.Variant || r.vartype), rows });
    rows.slice(1).forEach((r) => dropped.add(r));
  });
  return { events: events.filter((e) => !dropped.has(e)), twins };
}

/** Label of a complex entry's event: "rDelDup chr1↔chr7" ("TIC / rDelDup chr6↔chr8" for a twin group). */
export function complexEntryLabel(event, twin = null) {
  const span = chromosomeSpan(event?.Genome_Location);
  const kind = twin ? twinKindText(twin.names) : kindName(event?.vartype);
  return `${kind}${event?.gene ? ` ${event.gene}` : ""}${span ? ` ${span}` : ""}`.trim();
}

export const TWIN_TIP = "classifier reported this junction set as both";

const isDm = (e) => /^(dm|cpxdm)$/i.test(`${e?.vartype || ""}`);

/** True when interval `iv` lies inside some interval of `outer` (same chromosome). */
export const intervalInside = (iv, outer) => outer.some((o) => o.chromosome === iv.chromosome && o.start <= iv.start && o.end >= iv.end);

/**
 * DM (ecDNA) events whose footprint contains every interval of this complex non-DM entry, and how many of its
 * carriers are also carriers of one of those DMs. `entries` are the patient's driver entries (event, carriers, label).
 * Returns null when there is none. { dms: [{ label, n, overlap }], overlap (carriers in any such DM), carriers }.
 */
export function dmOverlap(entry, entries = []) {
  const e = entry?.event;
  if (!e || isDm(e)) return null;
  const mine = parseFootprint(e.Genome_Location);
  if (!mine.length) return null;
  const carriers = new Set(entry.carriers || splitIds(e.cell_ids));
  const dms = [];
  const union = new Set();
  entries.forEach((o) => {
    if (o === entry || o.cls !== "complex" || !isDm(o.event)) return;
    const theirs = parseFootprint(o.event.Genome_Location);
    if (!mine.every((iv) => intervalInside(iv, theirs))) return; // the whole footprint sits inside the DM footprint
    const shared = (o.carriers || splitIds(o.event.cell_ids)).filter((c) => carriers.has(c));
    shared.forEach((c) => union.add(c));
    dms.push({ label: o.event.Variant || o.label, n: (o.carriers || splitIds(o.event.cell_ids)).length, overlap: shared.length });
  });
  return dms.length ? { dms, overlap: union.size, carriers: carriers.size } : null;
}

/** Chip text and one-line interpretation of a dmOverlap result (does not claim the junction is on the ecDNA). */
export function dmOverlapText(o) {
  if (!o) return null;
  const names = o.dms.length > 3 ? `${o.dms.slice(0, 3).map((d) => d.label).join(", ")} +${o.dms.length - 3} more` : o.dms.map((d) => d.label).join(", ");
  return {
    chip: `inside ${names} footprint in ${o.overlap} of ${o.carriers} carriers`,
    note: `In those ${o.overlap} cells the DM call covers this junction's region, so the segment may be part of the ecDNA; in the other ${o.carriers - o.overlap} the junction is called without a DM covering it. Overlap of calls, not direct proof that the junction lies on the ecDNA.`,
  };
}
