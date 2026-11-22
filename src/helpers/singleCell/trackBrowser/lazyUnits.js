// Spec v0.5 lazy loading: which per-cell graphs (complex.json) the track browser fetches, clade medians from the
// cn_heatmap matrix instead of the member cells' graphs, and when the single-cell loader defers the per-cell files.
// d3-free (jest).
import { binRange, medianProfile, rowsOf } from "./cnHeatmap";

/** Clades with more members than this load their cells' graphs only for the rows in view. */
export const EXPANDED_GRAPHS_MAX = 300;
/** Patients with more cells than this defer the per-cell files when opened on the track browser. */
export const LAZY_MIN_CELLS = 500;
export const TRACK_BROWSER_TAB = "21";

/**
 * Cell ids whose graphs the track browser needs: the cell rows in view (virtualised stack: `visibleItems`), the
 * pinned cells, and the members of expanded clades (all of them when the clade has <= maxExpanded cells, so the
 * clade's junction support can be computed; otherwise only those in view). Clade rows themselves need none
 * (their median comes from the heat-map matrix).
 */
export function graphIdsToLoad({ visibleItems = [], pinned = [], rows = [], expanded = {}, mode = "pseudobulk", maxExpanded = EXPANDED_GRAPHS_MAX }) {
  const ids = [];
  visibleItems.forEach((it) => it.row.kind === "cell" && ids.push(it.row.id));
  pinned.forEach((k) => k.startsWith("cell:") && ids.push(k.slice(5)));
  if (mode === "pseudobulk") rows.forEach((r) => r.kind === "clade" && expanded[r.group] && r.members.length <= maxExpanded && ids.push(...r.members));
  return [...new Set(ids)];
}

/**
 * Clade pseudobulk from the cn_heatmap matrices (500 kb bins): per window, the median / IQR of the member cells per
 * bin, adjacent bins with equal values merged. Same shape as pseudobulkInWindows ({ n, steps, junctions }) with
 * junctions empty and source "matrix". Windows whose chromosome matrix is not loaded have no steps (`pending` counts them).
 */
export function matrixPseudobulk(index, mats, members, slots) {
  const rows = index ? rowsOf(index, members) : [];
  const out = { n: rows.length, steps: [], junctions: [], source: "matrix", pending: 0 };
  if (!index || !rows.length) return out;
  slots.forEach((s, k) => {
    const entry = index.chroms.get(s.window.chrom);
    const mat = mats.get(s.window.chrom);
    if (!entry) return;
    if (!mat) {
      out.pending += 1;
      return;
    }
    const [b0, b1] = binRange(entry, s.window);
    const p = medianProfile(mat, entry.starts.length, rows, [b0, b1]);
    let cur = null;
    for (let b = b0; b < b1; b += 1) {
      if (!p.n[b]) {
        cur = null;
        continue;
      }
      const start = Math.max(entry.starts[b], s.window.start);
      const end = Math.min(entry.ends[b], s.window.end);
      const st = { slot: k, start, end, median: p.median[b], q1: p.q1[b], q3: p.q3[b], n: p.n[b] };
      if (cur && cur.median === st.median && cur.q1 === st.q1 && cur.q3 === st.q3 && cur.end + 1 >= start) {
        cur.end = end;
        cur.n = Math.min(cur.n, st.n);
      } else {
        cur = st;
        out.steps.push(st);
      }
    }
  });
  return out;
}

/**
 * Whether the single-cell loader defers the per-cell files (complex.json, mutations.json) of a patient: only when it
 * opens on the track browser tab and the dataset asks for it (datasets.json `lazyCellFiles: true`) or the patient
 * has more than LAZY_MIN_CELLS cells. `full` (a later request from another tab) never defers.
 */
export function shouldDeferCellFiles({ tab, dataset, nCells, full = false, url = null }) {
  if (full) return false;
  if (`${tab}` !== TRACK_BROWSER_TAB) return false;
  let param = null;
  try {
    param = new URL(url || (typeof window !== "undefined" ? window.location.href : "http://x/")).searchParams.get("lazycells");
  } catch (e) {
    param = null;
  }
  if (param === "0") return false;
  if (param === "1") return true;
  return dataset?.lazyCellFiles === true || dataset?.lazy_cell_files === true || nCells > LAZY_MIN_CELLS;
}
