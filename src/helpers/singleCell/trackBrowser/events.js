// Event / annotation track (spec v0.3 `events`): intervals such as amplicons with a process-caller class and an
// ecDNA-caller call, and arm-level events, drawn as bars in the track browser header. d3-free (jest).

export const EVENTS_URL = "{dataPath}{patient}/events.json";
const bare = (c) => `${c ?? ""}`.replace(/^chr/i, "");

/** Normalize `{ events: [...] }` (or an array) to [{ id, kind, chrom, start, end, cls, status, ecdna, label }]. */
export function normalizeEvents(json) {
  const list = Array.isArray(json) ? json : Array.isArray(json?.events) ? json.events : [];
  return list
    .map((e) => ({
      id: `${e.id ?? ""}`,
      kind: e.kind === "amplicon" ? "amplicon" : "arm",
      chrom: bare(e.chrom ?? e.seqnames),
      start: Number(e.start),
      end: Number(e.end),
      cls: e.class || "",
      status: e.status || "",
      confidence: e.confidence || "",
      ecdna: e.ecdna_call || "",
      genes: e.genes || "",
      // v0.4: ATAC at the amplicon (gCells accessibility aggregates), when the exporter added them
      fragmentsPerCopy: Number.isFinite(Number(e.fragments_per_copy)) && e.fragments_per_copy !== null && e.fragments_per_copy !== "" ? Number(e.fragments_per_copy) : null,
      atacVsCn: e.atac_vs_cn ?? null,
    }))
    .filter((e) => e.chrom && Number.isFinite(e.start) && Number.isFinite(e.end) && e.end >= e.start);
}

/** Events overlapping each laid-out window, clipped: [{ slot, start, end, event }]. */
export function eventsInWindows(events, slots) {
  const out = [];
  (events || []).forEach((ev) => {
    slots.forEach((s, k) => {
      if (s.window.chrom !== ev.chrom || ev.end < s.window.start || ev.start > s.window.end) return;
      out.push({ slot: k, start: Math.max(ev.start, s.window.start), end: Math.min(ev.end, s.window.end), event: ev });
    });
  });
  return out;
}

/** Short bar label: amplicons "class · ecDNA: call", arm events "class (status)". */
export function eventLabel(ev) {
  if (ev.kind === "amplicon") return `${ev.cls || "amplicon"}${ev.ecdna ? ` · ecDNA caller: ${ev.ecdna}` : ""}`;
  return `${ev.cls || "arm event"}${ev.status ? ` (${ev.status})` : ""}`;
}
