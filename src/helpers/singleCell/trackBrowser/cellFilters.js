// Cell filters and clade selection of the track browser (spec v0.4 `filters`, `selection.clades`):
// all vs deep cells (URL tbdepth), S-phase show / hide / only (tbsphase), and selecting clades (tbsel): selected
// clades are outlined and moved to the top, the others dimmed. Selecting is not hiding ("hide others" is the
// separate clone filter). d3-free (jest).

export const DEEP_MIN_FRAGMENTS = 1e5; // good B fragments; the S-phase-call threshold (contract.md depth_class)
export const DEPTH_MODES = ["all", "deep"];
export const SPHASE_MODES = ["show", "hide", "only"];

/** "deep" | "shallow" | null for a unit: its depth_class, else from the fragment count. */
export function depthClass(unit) {
  const c = `${unit?.depth_class ?? ""}`.toLowerCase();
  if (c === "deep" || c === "shallow") return c;
  const d = Number(unit?.depth);
  return Number.isFinite(d) ? (d >= DEEP_MIN_FRAGMENTS ? "deep" : "shallow") : null;
}

/** true / false / null (not called) for a unit's S-phase call (TRUE / FALSE / NA). */
export function sPhaseOf(unit) {
  const s = `${unit?.s_phase ?? ""}`.toUpperCase();
  if (s === "TRUE" || s === "T" || s === "1") return true;
  if (s === "FALSE" || s === "F" || s === "0") return false;
  return null;
}

/**
 * Units kept by the filters. depth "deep" keeps deep cells (cells without a depth are dropped, the caller states
 * how many); sphase "hide" drops S-phase cells, "only" keeps only S-phase cells, "show" keeps all.
 * Returns { units, dropped: { depth, sphase } }.
 */
export function applyCellFilters(units, { depth = "all", sphase = "show" } = {}) {
  const dropped = { depth: 0, sphase: 0 };
  const out = (units || []).filter((u) => {
    if (depth === "deep" && depthClass(u) !== "deep") {
      dropped.depth += 1;
      return false;
    }
    const s = sPhaseOf(u);
    if ((sphase === "hide" && s === true) || (sphase === "only" && s !== true)) {
      dropped.sphase += 1;
      return false;
    }
    return true;
  });
  return { units: out, dropped };
}

/** Short text of the active filters for row labels ("deep cells, S-phase hidden"), "" when none. */
export function filterLabel({ depth = "all", sphase = "show" } = {}) {
  const parts = [];
  if (depth === "deep") parts.push("deep cells");
  if (sphase === "hide") parts.push("S-phase hidden");
  if (sphase === "only") parts.push("S-phase only");
  return parts.join(", ");
}

/**
 * Units reordered so the selected clades come first (each keeps its internal tree order, in selection order), then
 * the rest in their original order. Empty selection: unchanged.
 */
export function orderBySelection(units, selected) {
  const sel = (selected || []).filter(Boolean);
  if (!sel.length) return units;
  const set = new Set(sel);
  const first = [];
  sel.forEach((g) => (units || []).forEach((u) => (u.group ?? "no clone") === g && first.push(u)));
  return [...first, ...(units || []).filter((u) => !set.has(u.group ?? "no clone"))];
}

/** Rows reordered: rows of selected groups first (in selection order, keeping their relative order). */
export function rowsBySelection(rows, selected) {
  const sel = (selected || []).filter(Boolean);
  if (!sel.length) return rows;
  const set = new Set(sel);
  const first = [];
  sel.forEach((g) => rows.forEach((r) => (r.group ?? "no clone") === g && first.push(r)));
  return [...first, ...rows.filter((r) => !set.has(r.group ?? "no clone"))];
}

/** Row emphasis under a selection: "selected" | "dimmed" | "normal". */
export function rowEmphasis(row, selected) {
  if (!selected || !selected.length) return "normal";
  return selected.includes(row.group ?? "no clone") ? "selected" : "dimmed";
}

/** Toggle a clade in the selection (shift: add / remove; plain click: select only it, or clear when it is the only one). */
export function toggleSelection(selected, group, additive = false) {
  const cur = selected || [];
  if (additive) return cur.includes(group) ? cur.filter((g) => g !== group) : [...cur, group];
  return cur.length === 1 && cur[0] === group ? [] : [group];
}

/** Parse the URL params: { depth, sphase, selected }. */
export function parseFilterParams(get) {
  const d = get("tbdepth");
  const s = get("tbsphase");
  const sel = get("tbsel");
  return {
    depth: DEPTH_MODES.includes(d) ? d : "all",
    sphase: SPHASE_MODES.includes(s) ? s : "show",
    selected: sel ? sel.split(",").map((x) => decodeURIComponent(x)).filter(Boolean) : [],
  };
}

/** URL params for a state (null = remove the param). */
export function filterParams({ depth = "all", sphase = "show", selected = [] } = {}) {
  return {
    tbdepth: depth === "deep" ? "deep" : null,
    tbsphase: sphase === "show" ? null : sphase,
    tbsel: selected && selected.length ? selected.map((g) => encodeURIComponent(g)).join(",") : null,
  };
}

/**
 * The two sides of a `cn_diff` track. by "clade": A and B are clade names; by "time_point": A and B are lists of
 * time points (e.g. ["T11", "T12"] vs ["T0"]). Returns { a: unitIds, b: unitIds, label }.
 */
export function diffSides(units, { by = "clade", a = [], b = [] } = {}) {
  const A = new Set([].concat(a));
  const B = new Set([].concat(b));
  const key = (u) => (by === "time_point" ? u.time_point : u.group ?? "no clone");
  const ids = (S) => (units || []).filter((u) => S.has(`${key(u)}`)).map((u) => u.id);
  return { a: ids(A), b: ids(B), label: `${[...A].join("+")} minus ${[...B].join("+")}` };
}
