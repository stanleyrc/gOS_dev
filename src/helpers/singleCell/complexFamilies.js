// d3-free helpers for complex-SV event families (srctools gos_sc_event_families.py): complex rows that share
// junction ids carry one `family_id`; gOS counts one entry per family and keeps the member classifications.
import { kindName, complexChromosomes, twinKindText } from "./complexLabels";
import { mergeIntervals, parseFootprint } from "./complexZoom";
import { driverKey } from "./driverContrast";

const splitIds = (s) => `${s || ""}`.split(",").map((x) => x.trim()).filter(Boolean);
const isDmRow = (e) => /^(dm|cpxdm)$/i.test(`${e?.vartype || ""}`);
const n = (e) => splitIds(e.cell_ids).length;

/** Dominant member of a family: the DM (ecDNA) member with most cells if any, else the member with most cells. */
export function dominantMember(rows) {
  const pool = rows.some(isDmRow) ? rows.filter(isDmRow) : rows;
  return pool.reduce((best, r) => (n(r) > n(best) ? r : best), pool[0]);
}

/** Member classifications of a family: [{ label (Variant), n }] by cell count, same label summed once. */
export function familyClassifications(rows) {
  const by = new Map();
  rows.forEach((r) => {
    const label = `${r.Variant || r.vartype}`;
    by.set(label, Math.max(by.get(label) || 0, n(r)));
  });
  return [...by.entries()].map(([label, count]) => ({ label, n: count })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
}

/** Union footprint of the member rows as a location string. */
export function familyFootprint(rows) {
  return mergeIntervals(rows.flatMap((r) => parseFootprint(r.Genome_Location)), 0).map((iv) => `${iv.chromosome}:${iv.start}-${iv.end}`).join(",");
}

/** "DM chr7 (+chr1, chr6, chr17 in subsets)": dominant classification and chromosomes, the others as subset captures. */
export function familyLabel(rows, dominant = dominantMember(rows)) {
  const own = complexChromosomes(dominant.Genome_Location);
  const extra = complexChromosomes(familyFootprint(rows)).filter((c) => !own.includes(c));
  const span = own.map((c) => `chr${c}`).join("↔");
  return `${kindName(dominant.vartype)}${dominant.gene ? ` ${dominant.gene}` : ""}${span ? ` ${span}` : ""}${extra.length ? ` (+${extra.map((c) => `chr${c}`).join(", ")} in subsets)` : ""}`.trim();
}

/**
 * Collapse complex rows with the same `family_id` (two or more rows) into one synthetic row per family: the dominant
 * member's data with the union of the carriers. Rows without a family_id (no file / unresolved) or alone in their
 * family pass through. Returns { events, families: Map(syntheticRow -> family) }, family = { id, members, dominant,
 * classifications, footprint, label, memberKeys, junctionIds }. The synthetic row's driverKey is the dominant row's.
 */
export function collapseFamilies(events = []) {
  const groups = new Map();
  events.forEach((e) => {
    if (e?.family_id && e.type === "Complex SV") {
      if (!groups.has(e.family_id)) groups.set(e.family_id, []);
      groups.get(e.family_id).push(e);
    }
  });
  const families = new Map();
  const replace = new Map();
  groups.forEach((rows, id) => {
    if (rows.length < 2) return;
    const dominant = dominantMember(rows);
    const cells = [...new Set(rows.flatMap((r) => splitIds(r.cell_ids)))];
    const total = Number(dominant.n_cells) > 0 && Number(dominant.cell_fraction) > 0 ? Math.round(Number(dominant.n_cells) / Number(dominant.cell_fraction)) : null;
    const junctionIds = [...new Set(rows.flatMap((r) => (Array.isArray(r.junction_ids) ? r.junction_ids : [])))];
    const synthetic = { ...dominant, cell_ids: cells.join(","), n_cells: cells.length, family_id: id, junction_ids: junctionIds, twin_group: undefined, twin_names: undefined, __familyKey: driverKey(dominant) };
    if (total) Object.assign(synthetic, { cell_fraction: cells.length / total, cells: `${cells.length}/${total}` });
    const family = {
      id,
      members: rows,
      dominant,
      classifications: familyClassifications(rows),
      footprint: familyFootprint(rows),
      label: familyLabel(rows, dominant),
      memberKeys: rows.map((r) => driverKey(r)),
      junctionIds,
    };
    families.set(synthetic, family);
    replace.set(dominant, synthetic);
  });
  const dropped = new Set([...families.values()].flatMap((f) => f.members).filter((r) => !replace.has(r)));
  return { events: events.filter((e) => !dropped.has(e)).map((e) => replace.get(e) || e), families };
}

/** Entry for a key: its own key, or the key of one of a family's member rows (old ?drvopen links). */
export function findEntryByKey(entries = [], key) {
  if (key == null) return null;
  return entries.find((d) => d.key === key) || entries.find((d) => d.family?.memberKeys?.includes(key)) || null;
}

/** Drivers header text: "N complex-SV families (M per-cell classifications)"; null when no complex entries. */
export function familyCountText(entries = []) {
  const cx = entries.filter((d) => d.cls === "complex");
  if (!cx.length) return null;
  const rows = cx.reduce((t, d) => t + (d.family ? d.family.members.length : d.twin ? d.twin.rows.length : 1), 0);
  return `${cx.length} complex-SV famil${cx.length === 1 ? "y" : "ies"} (${rows} per-cell classification${rows === 1 ? "" : "s"})`;
}

/** Text of a family's classifications for the drawer: "DM in 47 cells, TIC in 7". */
export const classificationText = (cls) => cls.map((c) => `${c.label} in ${c.n} cell${c.n === 1 ? "" : "s"}`).join(", ");

export { twinKindText };

/**
 * Link lines of one family from event_families.json (family.links: { a, b, shared_ids, n_cells, kind } with a / b =
 * member event_index; kind shared_junction | twin | weak_attach). Returns { lines: [text], weak: Set(member Variant) }
 * where weak = members attached with fewer than 3 cells ("attached, <3 cells").
 */
export function familyLinkLines(fileFamily) {
  if (!fileFamily?.links?.length) return { lines: [], weak: new Set() };
  const byIndex = new Map((fileFamily.members || []).map((m) => [m.event_index, m]));
  const name = (i) => byIndex.get(i)?.Variant || `event ${i}`;
  const weak = new Set();
  const lines = fileFamily.links.map((l) => {
    const ids = l.shared_ids || [];
    const idText = ids.length ? `${ids[0]}${ids.length > 1 ? ` (+${ids.length - 1} more)` : ""}` : "";
    if (l.kind === "weak_attach") {
      [l.a, l.b].forEach((i) => {
        const m = byIndex.get(i);
        if (m && m.n_cells < 3) weak.add(m.Variant);
      });
      const small = [l.a, l.b].map((i) => byIndex.get(i)).find((m) => m && m.n_cells < 3);
      return `${name(l.a)} - ${small ? `${small.Variant} attached, <3 cells; ` : "weak attachment; "}shared with ${name(l.b)}${idText ? ` via ${idText}` : ""} in ${l.n_cells} common cells`;
    }
    if (l.kind === "twin") return `${name(l.a)} - same junction set as ${name(l.b)} (classifier twin) in ${l.n_cells} common cells`;
    return `${name(l.a)} - shared junction ${idText} with ${name(l.b)} in ${l.n_cells} common cells`;
  });
  return { lines, weak };
}
