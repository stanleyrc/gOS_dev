// Width split of the panels right of the strips on the Single-Cell tab: the copy-number
// heatmap (cn), the drivers block (drv) and the SNV matrix beside (snv). d3-free.
//
// Widths are stored as fractions of the space the panels share (layout.cnw / drvbw /
// snbw, URL cnw / drvbw / snbw), so a saved split survives a window resize. Without a
// stored split the automatic widths apply (drivers and SNVs at their own auto width,
// the copy number heatmap takes the rest).

export const PANEL_MIN = { cn: 200, drv: 60, snv: 100 };
export const PANEL_KEYS = ["cn", "drv", "snv"];
export const SPLIT_PARAM = { cn: "cnw", drv: "drvbw", snv: "snbw" };
export const SPLIT_FIELD = { cn: "cnw", drv: "drvbw", snv: "snbw" };

const frac = (v) => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 && x < 1 ? Math.round(x * 10000) / 10000 : null;
};

/** Minimum width of each present panel, shrunk when `total` cannot hold them all. */
export function panelMins(present, total, mins = PANEL_MIN) {
  const want = Object.fromEntries(present.map((k) => [k, mins[k]]));
  const sum = Object.values(want).reduce((a, b) => a + b, 0);
  const scale = sum > total && total > 0 ? total / sum : 1;
  return Object.fromEntries(present.map((k) => [k, Math.floor(want[k] * scale)]));
}

/**
 * Widths (integer px, summing to `total`) of the present panels.
 * present: panel keys in left-to-right order (cn first); fractions: stored split or null;
 * auto: automatic widths of the non-cn panels, { drv, snv }.
 * A stored split is used only when it has a value for every present panel.
 */
export function splitWidths({ total, present, fractions = null, auto = {}, mins = PANEL_MIN }) {
  const keys = PANEL_KEYS.filter((k) => present.includes(k));
  const out = {};
  if (!keys.length || !(total > 0)) return Object.fromEntries(keys.map((k) => [k, 0]));
  const min = panelMins(keys, total, mins);
  const stored = keys.every((k) => frac(fractions?.[k])) ? keys.map((k) => frac(fractions[k])) : null;
  let raw;
  if (stored) {
    const s = stored.reduce((a, b) => a + b, 0);
    raw = Object.fromEntries(keys.map((k, i) => [k, (stored[i] / s) * total]));
  } else {
    raw = {};
    keys.filter((k) => k !== "cn").forEach((k) => (raw[k] = Number(auto[k]) > 0 ? Number(auto[k]) : min[k]));
    const others = Object.values(raw).reduce((a, b) => a + b, 0);
    if (keys.includes("cn")) raw.cn = total - others;
  }
  // clamp to the minimums, taking the excess from the widest panels
  keys.forEach((k) => (out[k] = Math.max(min[k], raw[k])));
  let over = Object.values(out).reduce((a, b) => a + b, 0) - total;
  while (over > 0.5) {
    const donor = keys.filter((k) => out[k] > min[k]).sort((a, b) => out[b] - out[a])[0];
    if (!donor) break;
    const give = Math.min(over, out[donor] - min[donor]);
    out[donor] -= give;
    over -= give;
  }
  keys.forEach((k) => (out[k] = Math.round(out[k])));
  // rounding remainder goes to the last panel with room (cn first)
  const diff = total - Object.values(out).reduce((a, b) => a + b, 0);
  if (diff) out[keys[0]] += diff;
  return out;
}

/**
 * Move the splitter between panel `left` and the next present panel by dx px: the left
 * panel grows, the right shrinks, both within their minimums. Returns the new fractions
 * of every present panel (the value to store).
 */
export function dragSplitter({ widths, present, left, dx, mins = PANEL_MIN }) {
  const keys = PANEL_KEYS.filter((k) => present.includes(k));
  const i = keys.indexOf(left);
  if (i < 0 || i >= keys.length - 1) return fractionsOf(widths, keys);
  const right = keys[i + 1];
  const total = widths[left] + widths[right];
  const min = panelMins(keys, Object.values(widths).reduce((a, b) => a + b, 0), mins);
  const l = Math.max(min[left], Math.min(total - min[right], widths[left] + dx));
  return fractionsOf({ ...widths, [left]: l, [right]: total - l }, keys);
}

export function fractionsOf(widths, keys = PANEL_KEYS) {
  const present = keys.filter((k) => widths[k] != null);
  const sum = present.reduce((a, k) => a + widths[k], 0) || 1;
  return Object.fromEntries(present.map((k) => [k, Math.round((widths[k] / sum) * 10000) / 10000]));
}

/** Stored split from the layout ({ cnw, drvbw, snbw } fields) or null when none is stored. */
export function layoutFractions(layout = {}) {
  const out = {};
  PANEL_KEYS.forEach((k) => {
    const v = frac(layout[SPLIT_FIELD[k]]);
    if (v) out[k] = v;
  });
  return Object.keys(out).length ? out : null;
}

/** Layout patch that stores fractions (absent panels are cleared). */
export const fractionsToLayout = (fractions) => Object.fromEntries(PANEL_KEYS.map((k) => [SPLIT_FIELD[k], fractions?.[k] ?? null]));

/** URL params cnw / drvbw / snbw -> layout fields; null when the link has none. */
export function splitFromSearch(search = "") {
  const p = new URLSearchParams(search);
  const out = {};
  PANEL_KEYS.forEach((k) => {
    if (p.has(SPLIT_PARAM[k])) out[SPLIT_FIELD[k]] = frac(p.get(SPLIT_PARAM[k]));
  });
  return Object.keys(out).length ? out : null;
}

export const SPLIT_PARAMS = PANEL_KEYS.map((k) => SPLIT_PARAM[k]);

/** Params to write for the layout in force; only the present panels, and only when a split is stored. */
export function splitToSearch(layout, present) {
  const f = layoutFractions(layout);
  if (!f || present.length < 2 || !present.every((k) => f[k])) return {};
  return Object.fromEntries(present.map((k) => [SPLIT_PARAM[k], `${f[k]}`]));
}
