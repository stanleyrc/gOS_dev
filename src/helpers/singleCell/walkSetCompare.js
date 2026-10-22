// Walk-set selection (curated vs proposed Peel v4 walks) and the pairing of the two sets. d3-free.

export const WALKSETS = ["curated", "peel_v4", "compare"];

/** ?walkset=peel_v4|compare from a query string; anything else is the curated set. */
export function parseWalkset(search) {
  let v = null;
  try {
    v = new URLSearchParams(search || "").get("walkset");
  } catch (e) {
    v = null;
  }
  return WALKSETS.includes(v) ? v : "curated";
}

/** The query string with walkset set (curated removes the parameter). */
export function withWalkset(search, walkset) {
  const p = new URLSearchParams(search || "");
  if (!walkset || walkset === "curated") p.delete("walkset");
  else p.set("walkset", walkset);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** A peel walks source with the per-cell copies of the chosen kind ("free" = NNLS `cells`, "cplex" = `cells_cplex`). */
export function peelSourceWithCopies(source, copies) {
  if (!source || source.status !== "ok" || copies !== "cplex") return source;
  const walks = (source.data?.walks || []).map((w) => (w.cells_cplex ? { ...w, cells: w.cells_cplex } : { ...w, cells: {} }));
  return { ...source, data: { ...source.data, walks } };
}

/**
 * Rows aligning peel walks with the curated walks they reproduce: a peel walk with `curated_match.walk_id` is paired with that
 * curated walk; peel walks without a match are "new"; curated walks nobody points at are listed last as unpaired.
 * When two peel walks point at one curated walk, the curated walk appears in the first row and the later rows show it as
 * `curatedShared` so nothing is silently dropped.
 */
export function pairWalkSets(curated = [], peel = [], recovery = []) {
  const byId = new Map(curated.map((w) => [`${w.id}`, w]));
  // curated_recovery.walks[].best_unit names the best new walk of a curated walk: a second way to pair
  const bestFor = new Map();
  (recovery || []).forEach((e) => {
    if (e && e.best_unit != null && e.curated_id != null && !bestFor.has(`${e.best_unit}`)) bestFor.set(`${e.best_unit}`, e);
  });
  const used = new Set();
  const rows = [];
  peel.forEach((p) => {
    const m = p.curated_match || null;
    let cid = m && m.walk_id != null ? `${m.walk_id}` : null;
    let c = cid ? byId.get(cid) || null : null;
    let viaBest = null;
    if (!c && bestFor.has(`${p.id}`) && byId.has(`${bestFor.get(`${p.id}`).curated_id}`)) {
      viaBest = bestFor.get(`${p.id}`);
      cid = `${viaBest.curated_id}`;
      c = byId.get(cid);
    }
    const shared = !!(c && used.has(cid));
    if (c) used.add(cid);
    rows.push({
      key: `p${p.id}`,
      peel: p,
      curated: c,
      curatedShared: shared,
      status: m && !viaBest ? m.status || (c ? "partial" : "new") : viaBest ? (viaBest.status === "recovered" ? "reproduces" : "partial") : "new",
      cosine: viaBest ? viaBest.segment_cosine ?? null : m ? m.segment_cosine ?? null : null,
      jaccard: viaBest ? viaBest.junction_jaccard ?? null : m ? m.junction_jaccard ?? null : null,
      rho: viaBest ? viaBest.rho_free ?? null : m ? m.rho_free ?? null : null,
      rhoCplex: m && !viaBest ? m.rho_cplex ?? null : null,
      missingCurated: !!(cid && !c),
    });
  });
  curated.forEach((c) => {
    if (used.has(`${c.id}`)) return;
    rows.push({ key: `c${c.id}`, peel: null, curated: c, curatedShared: false, status: "unpaired", cosine: null, jaccard: null, rho: null, rhoCplex: null, missingCurated: false });
  });
  const order = { reproduces: 0, partial: 1, new: 2, unpaired: 3 };
  return rows.map((r, i) => ({ r, i })).sort((a, b) => (order[a.r.status] ?? 4) - (order[b.r.status] ?? 4) || a.i - b.i).map((x) => x.r);
}

/** Counts per status for the compare header. */
export function summarizePairs(rows) {
  const out = { reproduces: 0, partial: 0, new: 0, unpaired: 0 };
  rows.forEach((r) => {
    if (r.status in out) out[r.status] += 1;
  });
  return out;
}

/** "R2 free 0.93 / CPLEX 0.88 / curated 0.91" from the file's `fit`; null when there is none. */
export function fitText(fit) {
  if (!fit || typeof fit !== "object") return null;
  const f = (v) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(2) : null);
  const parts = [["free", fit.R2_free], ["CPLEX", fit.R2_cplex], ["curated", fit.R2_curated]].map(([k, v]) => (f(v) ? `${k} ${f(v)}` : null)).filter(Boolean);
  return parts.length ? `R² ${parts.join(" / ")}` : null;
}

/** curated_id -> recovery entry from fit.curated_recovery.walks (empty map when absent). */
export function recoveryMap(data) {
  const list = data?.fit?.curated_recovery?.walks;
  const m = new Map();
  (Array.isArray(list) ? list : []).forEach((e) => {
    if (e && e.curated_id != null) m.set(`${e.curated_id}`, e);
  });
  return m;
}

/** The badge of a curated walk that was not fully recovered: { color, text, reason }; null when recovered or unknown. */
export function recoveryBadge(entry) {
  if (!entry) return null;
  const st = `${entry.status || ""}`.toLowerCase();
  if (st === "recovered") return null;
  const reason = entry.reason ? `${entry.reason}` : "no reason given";
  if (st === "partial") return { color: "orange", text: "partial", reason };
  return { color: "red", text: "not recovered", reason };
}

/** "k of n curated walks recovered (p partial)" for the patient; null when the file has no recovery block. */
export function recoverySummary(data) {
  const r = data?.fit?.curated_recovery;
  if (!r) return null;
  const base = r.summary || (Number.isFinite(r.n_curated) ? `${r.n_recovered ?? 0} of ${r.n_curated} curated walks recovered` : null);
  if (!base) return null;
  return Number.isFinite(r.n_partial) && r.n_partial > 0 ? `${base} (${r.n_partial} partial)` : base;
}

/** Chips for a peel walk: "proposal" (text on hover) and "open" (not closed). */
export function walkChips(w) {
  const out = [];
  if (!w) return out;
  if (w.proposal) out.push({ key: "proposal", text: "proposal", color: "purple", title: `${w.proposal}` });
  const closed = w.closed != null ? w.closed : w.evidence?.closed;
  if (closed === false) out.push({ key: "open", text: "open", color: "default", title: "open walk: not closed into a cycle" });
  return out;
}
