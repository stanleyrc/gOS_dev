// Convergent evolution of one event in one patient, and the SNVs that show it.
//
// An event E (filtered event or a copy-number rule over a region) has carrier
// cells. Its carrier groups are the maximal tree clades that consist mostly of
// carriers; two or more groups make E a convergence candidate. Evidence SNVs
// for a pair of groups (Gi, Gj) are sites with alt reads in Gi AND in a clade
// of non-carriers Nk, and absent from Gj: Gi is then closer to those
// non-carriers than to Gj, so E (shared by Gi and Gj) arose more than once, or
// was lost in Nk. Sites shared by Gi and Gj but absent from every non-carrier
// support a single origin. Both counts are reported; no verdict beyond them.
// d3-free for jest.
import { binAt } from "./matrix";

export const CONV_PARAM = "conv";
export const CONV_EVENT = "sc-convergence";

export const DEFAULT_CONV_OPTIONS = {
  tolerance: 0.2, // a carrier group may hold up to this fraction of non-carriers (and a non-carrier clade this fraction of carriers)
  minCells: 3, // smallest carrier group / non-carrier clade
  presentFrac: 0.5, // alt in >= this fraction of covered cells = present
  absentFrac: 0.05, // alt in <= this fraction of covered cells = absent
  minCovered: 3, // covered cells needed to call a site present in a set
  minCoveredAbsent: 5, // covered cells needed to call a site absent from a set
};

/* ------------------------------------------------------------------ */
/* Spec: what the user picked (URL conv=)                              */
/* ------------------------------------------------------------------ */

const eventGeneLabel = (e) => `${e?.gene || e?.fusion_genes || e?.Variant || "event"}`;

/** Stable key of a filtered event for links: gene:vartype:start. */
export function eventConvKey(e) {
  if (!e) return null;
  return [eventGeneLabel(e), `${e.vartype || e.type || ""}`, `${e.start ?? ""}`].join(":").replace(/\s+/g, "_");
}

/** Readable label of a filtered event. */
export function eventConvLabel(e) {
  const v = `${e?.vartype || ""}`;
  const kind = v ? v.toLowerCase() : `${e?.Variant || e?.type || ""}`;
  return `${eventGeneLabel(e)} ${kind}`.trim();
}

/**
 * conv= value -> { kind: "ev", key } | { kind: "cn", dir, rule, thr, region } | null.
 * CN form: cn:<gain|loss>:<delta|abs>:<threshold>:<region>; region last (may contain ':').
 */
export function parseConvSpec(value) {
  const s = `${value || ""}`.trim();
  if (!s) return null;
  if (s.startsWith("ev:")) return s.length > 3 ? { kind: "ev", key: s.slice(3) } : null;
  if (s.startsWith("cn:")) {
    const parts = s.split(":");
    const [, dir, rule, thr] = parts;
    const region = parts.slice(4).join(":");
    if (!["gain", "loss"].includes(dir) || !["delta", "abs"].includes(rule) || !Number.isFinite(Number(thr)) || !region) return null;
    return { kind: "cn", dir, rule, thr: Number(thr), region };
  }
  return null;
}

export function serializeConvSpec(spec) {
  if (!spec) return null;
  if (spec.kind === "ev") return `ev:${spec.key}`;
  if (spec.kind === "cn") return `cn:${spec.dir}:${spec.rule}:${spec.thr}:${spec.region}`;
  return null;
}

/** Label of a CN spec, e.g. "15q loss (CN ≤ cell baseline − 0.75)". */
export function cnSpecLabel(spec) {
  if (!spec || spec.kind !== "cn") return "";
  const op = spec.dir === "gain" ? "≥" : "≤";
  const rhs = spec.rule === "delta" ? `cell baseline ${spec.dir === "gain" ? "+" : "−"} ${spec.thr}` : `${spec.thr}`;
  return `${spec.region} ${spec.dir} (median CN ${op} ${rhs})`;
}

/** Put conv= in the URL and tell a mounted Single-Cell tab (drawer / table / cohort links). */
export function announceConvergence(spec) {
  if (typeof window === "undefined") return;
  const value = typeof spec === "string" ? spec : serializeConvSpec(spec);
  try {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(CONV_PARAM, value);
    else url.searchParams.delete(CONV_PARAM);
    window.history.replaceState(window.history.state, "", url.toString());
  } catch (e) {
    // URL API unavailable: the event still reaches a mounted tab
  }
  window.dispatchEvent(new CustomEvent(CONV_EVENT, { detail: { spec: value } }));
}

/* ------------------------------------------------------------------ */
/* Copy-number carriers                                                */
/* ------------------------------------------------------------------ */

const median = (v) => {
  const s = v.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return NaN;
  const k = s.length >> 1;
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
};

/**
 * Region of a CN spec in global coordinates: an arm name from `arms` ("15q"),
 * a chromosome ("15" / "chr15"), a locus ("chr4:54000000-56000000") or a gene
 * (genePos: gene -> { start, end } global). Null when it cannot be resolved.
 */
export function resolveRegion(region, { arms = [], chromoBins = {}, genes = new Map() } = {}) {
  const r = `${region || ""}`.trim();
  if (!r) return null;
  const arm = arms.find((a) => a.name.toLowerCase() === r.replace(/^chr/i, "").toLowerCase());
  if (arm) return { gStart: arm.gStart, gEnd: arm.gEnd, label: arm.name, focal: false };
  const locus = /^(?:chr)?([0-9XYM]{1,2}):([\d,.]+)-([\d,.]+)$/i.exec(r);
  if (locus) {
    const c = chromoBins[locus[1].toUpperCase()] || chromoBins[locus[1]];
    if (!c) return null;
    const a = Number(locus[2].replace(/,/g, ""));
    const b = Number(locus[3].replace(/,/g, ""));
    if (!(b > a)) return null;
    return { gStart: c.startPlace + a, gEnd: c.startPlace + b, label: r, focal: b - a < 20e6 };
  }
  const chr = /^(?:chr)?([0-9]{1,2}|X|Y)$/i.exec(r);
  if (chr) {
    const c = chromoBins[chr[1].toUpperCase()] || chromoBins[chr[1]];
    if (!c) return null;
    return { gStart: c.startPlace, gEnd: c.endPlace, label: `chr${chr[1].toUpperCase()}`, focal: false };
  }
  const g = genes.get(r) || genes.get(r.toUpperCase());
  if (g && Number.isFinite(g.start) && Number.isFinite(g.end)) return { gStart: g.start, gEnd: Math.max(g.end, g.start + 1), label: r.toUpperCase(), focal: true };
  return null;
}

/** Median CN of one cell row over [gStart, gEnd] on a grid of `step` (gene-sized regions: the midpoint). */
export function rowMedian(row, gStart, gEnd, step = 1e6) {
  if (!row) return NaN;
  const at = (g) => {
    const b = binAt(row.binIndex, g);
    return b >= 0 ? row.values[b] : NaN;
  };
  if (gEnd - gStart <= step) return at((gStart + gEnd) / 2);
  const v = [];
  for (let g = gStart + step / 2; g < gEnd; g += step) v.push(at(g));
  return median(v);
}

/** Per-cell baseline: rounded median of the arm medians (as in convergence.js). */
export function cellBaseline(row, arms, step = 1e6) {
  if (!row || !arms.length) return NaN;
  return Math.round(median(arms.map((a) => rowMedian(row, a.gStart, a.gEnd, step))));
}

/**
 * Carriers of a CN rule: Map cellId -> { value, baseline, carrier }. rule
 * "delta": median - baseline >= thr (gain) or <= -thr (loss); "abs": median
 * >= thr (gain) or <= thr (loss). Cells without CN are left out.
 */
export function regionCarriers(cn, interval, { dir, rule = "delta", thr }, arms = [], step = 1e6) {
  const out = new Map();
  if (!cn?.cells || !interval) return out;
  cn.cells.forEach((id, k) => {
    const row = cn.rows[k];
    if (!row) return;
    const value = rowMedian(row, interval.gStart, interval.gEnd, step);
    if (!Number.isFinite(value)) return;
    const baseline = rule === "delta" ? cellBaseline(row, arms, step) : NaN;
    if (rule === "delta" && !Number.isFinite(baseline)) return;
    const d = rule === "delta" ? value - baseline : value;
    const carrier = dir === "gain" ? d >= thr : rule === "delta" ? d <= -thr : d <= thr;
    out.set(`${id}`, { value, baseline, carrier });
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* Carrier groups on the tree                                          */
/* ------------------------------------------------------------------ */

/**
 * Carrier groups and non-carrier clades of one event.
 * layout: { nodes: [{ children, firstLeaf, lastLeaf }], leaves: [id] }.
 * carriers: Set of cell ids; exclude: Set of leaf ids left out (normal cells).
 * Returns { groups: [{ node, ids, n, carriers }], clades: [{ node, ids, n }]
 * (non-carrier cells of each maximal non-carrier clade), carrierIds,
 * nonCarrierIds (tumour leaves), scattered (carriers outside every group),
 * between: [{ i, j, lca, nonCarriers }] }.
 */
export function carrierGroups(layout, carriers, opts = {}) {
  const { tolerance, minCells } = { ...DEFAULT_CONV_OPTIONS, ...opts };
  const exclude = opts.exclude || new Set();
  const empty = { groups: [], clades: [], carrierIds: [], nonCarrierIds: [], scattered: 0, between: [] };
  if (!layout?.nodes?.length || !layout.leaves?.length) return empty;
  const L = layout.leaves.length;
  const ok = new Uint8Array(L);
  const car = new Uint8Array(L);
  const P = new Int32Array(L + 1); // tumour leaves
  const C = new Int32Array(L + 1); // carriers among them
  layout.leaves.forEach((id, i) => {
    ok[i] = exclude.has(`${id}`) ? 0 : 1;
    car[i] = ok[i] && carriers.has(`${id}`) ? 1 : 0;
    P[i + 1] = P[i] + ok[i];
    C[i + 1] = C[i] + car[i];
  });
  const count = (n) => [C[n.lastLeaf + 1] - C[n.firstLeaf], P[n.lastLeaf + 1] - P[n.firstLeaf]];
  const parent = new Int32Array(layout.nodes.length).fill(-1);
  layout.nodes.forEach((n, i) => (n.children || []).forEach((c) => (parent[c] = i)));
  const root = parent.indexOf(-1);
  const ids = (n, want) => {
    const out = [];
    for (let i = n.firstLeaf; i <= n.lastLeaf; i += 1) if (ok[i] && (want == null || car[i] === want)) out.push(`${layout.leaves[i]}`);
    return out;
  };

  const groups = [];
  const stack = [root];
  while (stack.length) {
    const idx = stack.pop();
    const n = layout.nodes[idx];
    const [c, k] = count(n);
    if (!c) continue;
    if (c >= minCells && c / k >= 1 - tolerance) groups.push({ node: idx, ids: ids(n), n: k, carriers: c });
    else (n.children || []).slice().reverse().forEach((ch) => stack.push(ch));
  }
  groups.sort((a, b) => layout.nodes[a.node].firstLeaf - layout.nodes[b.node].firstLeaf);
  groups.forEach((g, i) => (g.name = `G${i + 1}`));

  // non-carrier clades: maximal clades that hold no carrier group and few carriers
  const inGroup = new Uint8Array(layout.nodes.length);
  const holdsGroup = new Uint8Array(layout.nodes.length);
  groups.forEach((g) => {
    const mark = (i) => {
      inGroup[i] = 1;
      (layout.nodes[i].children || []).forEach(mark);
    };
    mark(g.node);
    for (let p = g.node; p >= 0; p = parent[p]) holdsGroup[p] = 1;
  });
  const clades = [];
  const st2 = [root];
  while (st2.length) {
    const idx = st2.pop();
    if (inGroup[idx]) continue;
    const n = layout.nodes[idx];
    const [c, k] = count(n);
    if (k - c < minCells) continue;
    if (!holdsGroup[idx] && c / k <= tolerance) clades.push({ node: idx, ids: ids(n, 0), n: k - c });
    else (n.children || []).slice().reverse().forEach((ch) => st2.push(ch));
  }
  clades.sort((a, b) => layout.nodes[a.node].firstLeaf - layout.nodes[b.node].firstLeaf);
  clades.forEach((c, i) => (c.name = `N${i + 1}`));

  const all = layout.nodes[root];
  const carrierIds = ids(all, 1);
  const nonCarrierIds = ids(all, 0);
  const grouped = groups.reduce((s, g) => s + g.carriers, 0);
  const anc = (i) => {
    const a = [];
    for (let p = i; p >= 0; p = parent[p]) a.push(p);
    return a;
  };
  const between = [];
  for (let i = 0; i < groups.length; i += 1)
    for (let j = i + 1; j < groups.length; j += 1) {
      const aj = new Set(anc(groups[j].node));
      const lca = anc(groups[i].node).find((x) => aj.has(x));
      const [c, k] = count(layout.nodes[lca]);
      between.push({ i, j, lca, nonCarriers: k - c });
    }
  return { groups, clades, carrierIds, nonCarrierIds, scattered: carrierIds.length - grouped, between };
}

/** Carrier groups of every filtered event with >= minCells carriers on the tree, ranked (most groups, then lowest clade F1). */
export function rankEventCandidates(events, layout, opts = {}) {
  const { minCells } = { ...DEFAULT_CONV_OPTIONS, ...opts };
  const seen = new Set();
  const out = [];
  (events || []).forEach((e) => {
    const ids = `${e.cell_ids || ""}`.split(",").filter(Boolean);
    if (ids.length < minCells) return;
    const key = eventConvKey(e);
    if (seen.has(key)) return;
    seen.add(key);
    const res = carrierGroups(layout, new Set(ids), opts);
    if (!res.carrierIds.length) return;
    out.push({ key, label: eventConvLabel(e), event: e, nGroups: res.groups.length, carriers: res.carrierIds.length, sizes: res.groups.map((g) => g.carriers), tier: Number(e.Tier ?? 9) });
  });
  return out.sort((a, b) => b.nGroups - a.nGroups || a.tier - b.tier || b.carriers - a.carriers);
}

/* ------------------------------------------------------------------ */
/* Evidence SNVs                                                       */
/* ------------------------------------------------------------------ */

/** Alt / covered cell counts per site for a list of cell ids. */
function setCounts(snv, rowOf, ids, nSites) {
  const alt = new Int32Array(nSites);
  const cov = new Int32Array(nSites);
  ids.forEach((id) => {
    const p = rowOf.get(`${id}`);
    if (p == null) return;
    const st = snv.status[p];
    for (let c = 0; c < nSites; c += 1) {
      const s = st[c];
      if (s >= 0) {
        cov[c] += 1;
        if (s === 1) alt[c] += 1;
      }
    }
  });
  return { alt, cov };
}

/**
 * Evidence SNVs for the carrier groups of one event.
 * snv: { cells, variants, status } (status 1 alt, 0 ref only, -1 no reads).
 * columns: site indices allowed (heatmap site filters applied by the caller).
 * Sites mapped outside the tumour are dropped here.
 * Returns { sites: [{ c, id, kind: "split" | "shared", i, j, k, fi, fj, fk, ci, cj, ck, score, group }],
 *   split: [[count]] (split[i][j]: sites placing Gi with non-carriers, absent from Gj),
 *   shared: [[count]] (shared[i][j], i < j: sites in Gi and Gj, absent from all non-carriers), nTested }.
 */
export function convergenceEvidence(snv, groupsRes, columns, opts = {}) {
  const o = { ...DEFAULT_CONV_OPTIONS, ...opts };
  const { groups, clades, nonCarrierIds } = groupsRes || {};
  const G = groups?.length || 0;
  const zero = () => Array.from({ length: G }, () => new Array(G).fill(0));
  const res = { sites: [], split: zero(), shared: zero(), nTested: 0 };
  if (!snv?.status?.length || G < 2) return res;
  const nSites = snv.variants.length;
  const rowOf = new Map(snv.cells.map((id, p) => [`${id}`, p]));
  const gC = groups.map((g) => setCounts(snv, rowOf, g.ids, nSites));
  const nC = clades.map((c) => setCounts(snv, rowOf, c.ids, nSites));
  const allN = setCounts(snv, rowOf, nonCarrierIds, nSites);
  const frac = (x, c) => (x.cov[c] ? x.alt[c] / x.cov[c] : NaN);
  const present = (x, c) => x.cov[c] >= o.minCovered && x.alt[c] / x.cov[c] >= o.presentFrac;
  const absent = (x, c) => x.cov[c] >= o.minCoveredAbsent && x.alt[c] / x.cov[c] <= o.absentFrac;
  const cols = columns || snv.variants.map((_, c) => c);
  cols.forEach((c) => {
    const v = snv.variants[c];
    if (v.category === "outside_tumor") return;
    res.nTested += 1;
    let best = null;
    for (let i = 0; i < G; i += 1) {
      if (!present(gC[i], c)) continue;
      // split: Gi + some non-carrier clade, absent from Gj
      let kBest = -1;
      for (let k = 0; k < nC.length; k += 1) if (present(nC[k], c) && (kBest < 0 || frac(nC[k], c) * Math.log2(1 + nC[k].cov[c]) > frac(nC[kBest], c) * Math.log2(1 + nC[kBest].cov[c]))) kBest = k;
      for (let j = 0; j < G; j += 1) {
        if (j === i) continue;
        if (kBest >= 0 && absent(gC[j], c)) {
          res.split[i][j] += 1;
          const clarity = Math.min(frac(gC[i], c), frac(nC[kBest], c)) - frac(gC[j], c);
          const score = clarity * Math.log2(1 + Math.min(gC[i].cov[c], nC[kBest].cov[c], gC[j].cov[c]));
          if (!best || score > best.score)
            best = { kind: "split", i, j, k: kBest, fi: frac(gC[i], c), fj: frac(gC[j], c), fk: frac(nC[kBest], c), ci: gC[i].cov[c], cj: gC[j].cov[c], ck: nC[kBest].cov[c], score };
        }
        if (j > i && present(gC[j], c) && absent(allN, c)) {
          res.shared[i][j] += 1;
          const clarity = Math.min(frac(gC[i], c), frac(gC[j], c)) - frac(allN, c);
          const score = clarity * Math.log2(1 + Math.min(gC[i].cov[c], gC[j].cov[c], allN.cov[c]));
          if (!best || (best.kind === "shared" && score > best.score))
            best = { kind: "shared", i, j, k: -1, fi: frac(gC[i], c), fj: frac(gC[j], c), fk: frac(allN, c), ci: gC[i].cov[c], cj: gC[j].cov[c], ck: allN.cov[c], score };
        }
      }
    }
    if (best) res.sites.push({ c, id: v.id, ...best, group: evidenceGroupLabel(best, groups) });
  });
  res.sites.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "split" ? -1 : 1) || a.group.localeCompare(b.group) || b.score - a.score);
  return res;
}

/** Column group of an evidence site: "G1+N not G2" or "G1+G2 not N". */
export function evidenceGroupLabel(s, groups) {
  const gi = groups[s.i]?.name || `G${s.i + 1}`;
  const gj = groups[s.j]?.name || `G${s.j + 1}`;
  return s.kind === "split" ? `${gi}+N not ${gj}` : `${gi}+${gj} not N`;
}

/** Total split / shared counts over all pairs. */
export function evidenceTotals(ev) {
  let split = 0;
  let shared = 0;
  (ev?.split || []).forEach((r) => r.forEach((x) => (split += x)));
  (ev?.shared || []).forEach((r) => r.forEach((x) => (shared += x)));
  return { split, shared };
}

/**
 * One-line summary that states the counts only. snvReason: why SNV evidence
 * is not available (null when it is).
 */
export function convergenceSummary(label, groupsRes, ev, snvReason = null) {
  const groups = groupsRes?.groups || [];
  const sizes = groups.map((g) => `${g.name} n=${g.carriers}`).join(", ");
  const head = `${label}: ${groups.length} carrier group${groups.length === 1 ? "" : "s"}${groups.length ? ` (${sizes})` : ""}`;
  if (groups.length < 2) return `${head}; fewer than 2 carrier groups, no convergence test.`;
  if (snvReason) return `${head}; SNV evidence not available (${snvReason}).`;
  const parts = [];
  for (let i = 0; i < groups.length; i += 1)
    for (let j = 0; j < groups.length; j += 1) if (i !== j && ev.split[i][j]) parts.push(`${ev.split[i][j]} place ${groups[i].name} with non-carriers but not ${groups[j].name}`);
  const { split, shared } = evidenceTotals(ev);
  const splitText = split ? `${split} SNVs separate the groups (${parts.join("; ")})` : "0 SNVs place a group with non-carriers apart from another group";
  const sharedText = `${shared} SNV${shared === 1 ? "" : "s"} shared by carrier groups only`;
  const reading = split > 0 && shared === 0 ? " → supports independent origins (or a loss in the non-carriers)" : shared > 0 && split === 0 ? " → supports a single origin" : "";
  return `${head}; ${splitText}; ${sharedText}${reading}. ${ev.nTested} sites tested.`;
}
