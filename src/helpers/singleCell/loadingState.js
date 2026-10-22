// d3-free helpers describing how much of a cohort's per-patient data has loaded,
// shared by every Transcriptome view so partial data is never mistaken for
// "no data" and statistics computed from partial data are labelled.
//
// A patient is in exactly one state per data source:
//   pending : not requested or still in flight (entry undefined / null)
//   ok      : loaded with data
//   none    : loaded, but the file says there is nothing ("not available (reason)")
//   failed  : the request or parse failed (names the file)
//   skipped : not requested because an earlier source already failed or has no data (entry.skipped)

export const LOAD = { PENDING: "pending", OK: "ok", NONE: "none", FAILED: "failed", SKIPPED: "skipped" };

/**
 * State of one patient's entry.
 * entry: undefined/null (pending) | { error, file } (failed) | { missing, reason, file } (none) | anything with data (ok)
 * `hasData` (optional) decides whether a loaded entry counts as ok.
 */
export function entryState(entry, hasData = () => true) {
  if (entry === undefined || entry === null) return LOAD.PENDING;
  if (entry.skipped) return LOAD.SKIPPED;
  if (entry.error) return LOAD.FAILED;
  if (entry.missing) return LOAD.NONE;
  return hasData(entry) ? LOAD.OK : LOAD.NONE;
}

/** "rna/cells.json not available (missing)" style reason for a patient that has no data. */
export function notAvailable(file, reason) {
  return `${file} not available${reason ? ` (${reason})` : ""}`;
}

/**
 * Overall progress over `patients` (ids) for one or more sources.
 * sources: { cn: { entries, hasData, file }, rna: { ... } } where entries is {patientId: entry}.
 * weights (optional): { patientId: cells } used for the cell counts.
 * A patient counts as "done" when every source has left the pending state.
 */
export function loadProgress(patients, sources, weights = {}) {
  const names = Object.keys(sources);
  const per = {};
  names.forEach((n) => {
    per[n] = { ok: 0, none: [], failed: [], pending: [] };
  });
  const rows = patients.map((id) => {
    const st = {};
    names.forEach((n) => {
      const src = sources[n];
      const entry = src.entries ? src.entries[id] : undefined;
      const s = entryState(entry, src.hasData);
      st[n] = s;
      if (s === LOAD.OK) per[n].ok += 1;
      else if (s === LOAD.NONE) per[n].none.push({ id, reason: entry?.reason || notAvailable(src.file || n, "no data for this patient") });
      else if (s === LOAD.FAILED) per[n].failed.push({ id, file: entry?.file || src.file || n, message: `${entry?.error?.message || entry?.error || "failed"}` });
      else per[n].pending.push(id);
    });
    const done = names.every((n) => st[n] !== LOAD.PENDING);
    return { id, state: st, done, usable: names.every((n) => st[n] === LOAD.OK) };
  });
  const total = patients.length;
  const done = rows.filter((r) => r.done).length;
  const usable = rows.filter((r) => r.usable).length;
  const cellsTotal = patients.reduce((a, id) => a + (Number(weights[id]) || 0), 0);
  const cellsDone = rows.filter((r) => r.done).reduce((a, r) => a + (Number(weights[r.id]) || 0), 0);
  return {
    total,
    done,
    usable,
    partial: done < total,
    complete: total > 0 && done === total,
    pct: total ? Math.round((100 * done) / total) : 100,
    cellsTotal,
    cellsDone,
    per,
    rows,
    pending: rows.filter((r) => !r.done).map((r) => r.id),
    failed: names.flatMap((n) => per[n].failed.map((f) => ({ ...f, source: n }))),
    none: names.flatMap((n) => per[n].none.map((f) => ({ ...f, source: n }))),
  };
}

const num = (n) => Number(n).toLocaleString("en-US");

/** "Loading 4 of 9 patients / 812 of 2,116 cells…" (or "Loaded 9 of 9 patients" when complete). */
export function progressText(p, unit = "patients") {
  if (!p.total) return "";
  const cells = p.cellsTotal > 0 ? ` / ${num(p.cellsDone)} of ${num(p.cellsTotal)} cells` : "";
  return p.partial ? `Loading ${p.done} of ${p.total} ${unit}${cells}…` : `Loaded ${p.done} of ${p.total} ${unit}${cells}`;
}

/** Label for a statistic computed while data is partial; empty string once complete. */
export function provisionalLabel(p) {
  return p && p.partial ? `provisional (partial data: ${p.done} of ${p.total} patients loaded)` : "";
}

/** Value to display for a statistic: null while partial and `hideWhenPartial`, otherwise the value. */
export function guardStat(value, p, hideWhenPartial = false) {
  return p && p.partial && hideWhenPartial ? null : value;
}

/** Short list of patient ids for messages: "A, B, C and 2 more". */
export function idList(ids, max = 4) {
  if (ids.length <= max) return ids.join(", ");
  return `${ids.slice(0, max).join(", ")} and ${ids.length - max} more`;
}

/** One line per problem, e.g. "MGH1: rna/cells.json failed (HTTP 404)". */
export function problemLines(p) {
  return [
    ...p.failed.map((f) => `${f.id}: ${f.file} failed to load (${f.message})`),
    ...p.none.map((f) => `${f.id}: ${f.reason}`),
  ];
}

/**
 * Note for a result the user computed on demand (DE, gene-set scores, dosage) from whatever was loaded then.
 * ran: { ranWith, ranPartial } recorded when the run started; usableNow: patients usable now.
 * Returns null when the result used complete data.
 */
export function resultNote(ran, usableNow, total) {
  if (!ran || !ran.ranPartial) return null;
  return {
    text: `provisional (partial data: computed from ${ran.ranWith} of ${total} patients)`,
    rerun: usableNow > ran.ranWith,
    rerunText: usableNow > ran.ranWith ? `${usableNow - ran.ranWith} more patient(s) have loaded since this was computed: run again to include them` : "",
  };
}
