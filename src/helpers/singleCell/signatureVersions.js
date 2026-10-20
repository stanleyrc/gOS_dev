// Signature-fit versions (data/<P>/signature_versions.json, format gos-sc-signature-versions/1; skilift
// gos_sc_signature_versions.py): the same SBS96 fit under several SNV-set definitions, version-to-version assignment
// flows and artifact diagnostics. d3-free helpers for the Signatures tab.

export const DEFAULT_VERSION = "v2_current";
export const DEFAULT_VERSION_B = "v4_tree_cells";
export const NOT_IN_VERSION = "(not in version)";
export const OTHER_NODE = "other";
export const SPLITS = [
  { value: "all", label: "all SNVs" },
  { value: "singleton", label: "singletons" },
  { value: "shared", label: "shared" },
  { value: "private_tree", label: "private (tree)" },
];
export const SPLIT_NOTE = "assignment = argmax posterior a_k S[c,k]; depends on the 96-channel context only";
export const DIAG_GROUP_ORDER = ["truncal", "shared3", "subclonal_other", "private_tree", "singleton", "singleton_lowconf", "normal_singleton"];
export const DIAG_COSINES = [
  { key: "SBS3", label: "SBS3" },
  { key: "SBS5", label: "SBS5" },
  { key: "SBS40a", label: "SBS40a" },
  { key: "SBS40c", label: "SBS40c" },
  { key: "PTA_SCAN2", label: "PTA artifact" },
  { key: "normal_singleton", label: "normal singletons" },
  { key: "flat_uniform", label: "flat" },
];

export const hasVersions = (data) => Boolean(data && Array.isArray(data.versions) && data.versions.length);

const num = (x) => (x == null || x === "" || !Number.isFinite(Number(x)) ? null : Number(x));

/** [{ id, label, definition, mode, status, reason, available, n, nSingleton }] in file order. */
export function versionList(data) {
  return (data?.versions || []).map((v) => ({
    id: v.id,
    label: v.label || v.id,
    definition: v.definition || "",
    mode: v.mode || "joint",
    status: v.status || "ok",
    reason: v.reason || "",
    available: (v.status || "ok") === "ok" && (v.sets || []).length > 0,
    n: num(v.n) ?? 0,
    nSingleton: num(v.n_singleton) ?? 0,
  }));
}

/** Pick the requested version id when it exists, else the default, else the first. */
export function resolveVersionId(data, wanted) {
  const ids = (data?.versions || []).map((v) => v.id);
  if (ids.includes(wanted)) return wanted;
  if (ids.includes(DEFAULT_VERSION)) return DEFAULT_VERSION;
  return ids[0] || null;
}

/**
 * Activity table of one version: one entry per set (legacy per_set versions have several, joint ones one):
 * [{ name, n, nSingleton, status, reason, cosine, cosineLo, cosineHi, bars: [{ signature, fraction, lo, hi, count }] }].
 * Unavailable versions give { unavailable: reason } so the card can say "not available (reason)".
 */
export function versionActivities(version) {
  if (!version) return { unavailable: "version not in file", sets: [] };
  const sets = (version.sets || []).map((s) => ({
    name: s.name,
    n: num(s.n) ?? 0,
    nSingleton: num(s.n_singleton) ?? 0,
    status: s.selection?.status || "ok",
    reason: s.selection?.reason || "",
    cosine: num(s.cosine),
    cosineLo: num(s.cosine_lo),
    cosineHi: num(s.cosine_hi),
    bars: (s.activities || [])
      .filter((a) => num(a.fraction) != null)
      .map((a) => ({ signature: a.signature, fraction: Number(a.fraction), lo: num(a.lo), hi: num(a.hi), count: num(a.activity) }))
      .sort((a, b) => b.fraction - a.fraction),
  }));
  const bad = (version.status || "ok") !== "ok";
  if (bad || !sets.length) return { unavailable: version.reason || (bad ? `status ${version.status}` : "no fitted sets"), sets: [] };
  return { unavailable: null, sets };
}

/** "0.899 (0.877 to 0.903)" or "not available". */
export function fmtCosine(c, lo, hi) {
  if (c == null) return "not available";
  const f = (x) => Number(x).toFixed(3);
  return lo != null && hi != null ? `${f(c)} (${f(lo)} to ${f(hi)})` : f(c);
}

/**
 * The flow table from version a to version b for a split. The file stores each unordered pair once in file order; a
 * reversed request swaps the columns. null when the pair or split is absent.
 */
export function flowBetween(data, split, a, b) {
  const list = data?.flows?.[split];
  if (!list || a === b) return null;
  const direct = list.find((f) => f.from === a && f.to === b);
  if (direct) return { from: a, to: b, rows: (direct.rows || []).map((r) => [r[0], r[1], Number(r[2])]) };
  const rev = list.find((f) => f.from === b && f.to === a);
  if (rev) return { from: a, to: b, rows: (rev.rows || []).map((r) => [r[1], r[0], Number(r[2])]) };
  return null;
}

/** Version ids of a chain (2 or 3 columns) with consecutive duplicates removed. */
export function chainIds(ids) {
  return ids.filter((id, i) => id && id !== ids[i - 1]);
}

/** Named chains offered besides a custom A -> B pick. */
export const CHAIN_PRESETS = [
  { value: "v1_legacy>v2_current>v4_tree_cells>v9_artifact_cols", label: "v1 -> v2 -> v4 -> v9" },
];

const bySizeThenName = (a, b) => b.n - a.n || String(a.label).localeCompare(String(b.label));

/**
 * Alluvial layout for a chain of flow tables (flows[i] links column i to i+1; each {rows:[[sigA, sigB, n]]}).
 * Nodes of a column are stacked largest first with "(not in version)" last and "other" (merged flows below minFrac of
 * the column total) just before it. Heights scale so the tallest column fills `height` (minus gaps).
 * Returns { columns: [{ index, nodes: [{ key, label, n, y, h }] }], links: [{ col, source, target, n, y0, y1, h, frac }], total }.
 * frac = n / the SNVs of the first column's source node total (A's SNVs = column-0 total).
 */
export function alluvialLayout(flows, { height = 360, gap = 6, minFrac = 0.005 } = {}) {
  const ncol = flows.length + 1;
  const outTot = flows.map((f) => {
    const m = new Map();
    f.rows.forEach(([s, , n]) => m.set(s, (m.get(s) || 0) + n));
    return m;
  });
  const inTot = flows.map((f) => {
    const m = new Map();
    f.rows.forEach(([, t, n]) => m.set(t, (m.get(t) || 0) + n));
    return m;
  });
  const totalOf = (i) => (i < flows.length ? [...outTot[i].values()] : [...inTot[i - 1].values()]).reduce((a, b) => a + b, 0);
  const grand = Math.max(1, ...Array.from({ length: ncol }, (_, i) => totalOf(i)));
  // node size in a column = max(incoming, outgoing)
  const sizeIn = (i, k) => (i > 0 ? inTot[i - 1].get(k) || 0 : 0);
  const sizeOut = (i, k) => (i < flows.length ? outTot[i].get(k) || 0 : 0);
  const mergeKey = (i, k) => (k === NOT_IN_VERSION || Math.max(sizeIn(i, k), sizeOut(i, k)) >= minFrac * grand ? k : OTHER_NODE);
  const maxNodes = Math.max(...Array.from({ length: ncol }, (_, i) => new Set([...(i > 0 ? inTot[i - 1].keys() : []), ...(i < flows.length ? outTot[i].keys() : [])]).size));
  const scale = Math.max(1e-9, (height - gap * Math.max(0, Math.min(maxNodes, 12) - 1)) / grand);
  const columns = [];
  for (let i = 0; i < ncol; i++) {
    const keys = new Set([...(i > 0 ? inTot[i - 1].keys() : []), ...(i < flows.length ? outTot[i].keys() : [])]);
    const merged = new Map();
    keys.forEach((k) => {
      const mk = mergeKey(i, k);
      const cur = merged.get(mk) || { key: mk, label: mk, in: 0, out: 0 };
      cur.in += sizeIn(i, k);
      cur.out += sizeOut(i, k);
      merged.set(mk, cur);
    });
    const rank = (n) => (n.key === NOT_IN_VERSION ? 2 : n.key === OTHER_NODE ? 1 : 0);
    const nodes = [...merged.values()]
      .map((n) => ({ ...n, n: Math.max(n.in, n.out) }))
      .sort((a, b) => rank(a) - rank(b) || bySizeThenName(a, b));
    let y = 0;
    nodes.forEach((n) => {
      n.y = y;
      n.h = n.n * scale;
      n.inUsed = 0;
      n.outUsed = 0;
      y += n.h + gap;
    });
    columns.push({ index: i, nodes });
  }
  const find = (i, k) => columns[i].nodes.find((n) => n.key === mergeKey(i, k));
  const links = [];
  const total0 = totalOf(0) || 1;
  flows.forEach((f, i) => {
    // merge rows after node merging, then order links by source node then target node order so they do not cross needlessly
    const agg = new Map();
    f.rows.forEach(([s, t, n]) => {
      const sn = find(i, s);
      const tn = find(i + 1, t);
      const key = `${sn.key}\u0000${tn.key}`;
      const cur = agg.get(key) || { sn, tn, n: 0 };
      cur.n += n;
      agg.set(key, cur);
    });
    const order = (n) => columns[i].nodes.indexOf(n);
    const orderT = (n) => columns[i + 1].nodes.indexOf(n);
    [...agg.values()]
      .sort((a, b) => order(a.sn) - order(b.sn) || orderT(a.tn) - orderT(b.tn))
      .forEach((l) => {
        l.y0 = l.sn.y + l.sn.outUsed;
        l.sn.outUsed += l.n * scale;
        l.sy = l.y0;
      });
    [...agg.values()]
      .sort((a, b) => orderT(a.tn) - orderT(b.tn) || order(a.sn) - order(b.sn))
      .forEach((l) => {
        l.y1 = l.tn.y + l.tn.inUsed;
        l.tn.inUsed += l.n * scale;
      });
    agg.forEach((l) =>
      links.push({ col: i, source: l.sn.key, target: l.tn.key, n: l.n, y0: l.y0, y1: l.y1, h: l.n * scale, frac: l.n / total0 })
    );
  });
  const outCols = columns.map((c) => ({ index: c.index, nodes: c.nodes.map(({ key, label, n, y, h }) => ({ key, label, n, y, h })) }));
  const tallest = Math.max(...outCols.map((c) => c.nodes.reduce((m, n) => Math.max(m, n.y + n.h), 0)));
  return { columns: outCols, links, total: total0, height: tallest };
}

/** "SBS5 -> SBS1: 139 SNVs (4.8% of 2,913 in A)" for a link hover. */
export function linkText(link, labels, total) {
  const pct = total ? `${(100 * link.n / total).toFixed(link.n / total < 0.01 ? 2 : 1)}%` : "";
  const s = link.n === 1 ? "SNV" : "SNVs";
  return `${link.source} (${labels[link.col]}) -> ${link.target} (${labels[link.col + 1]}): ${link.n.toLocaleString("en-US")} ${s}${pct ? ` (${pct} of ${total.toLocaleString("en-US")} in ${labels[0]})` : ""}`;
}

/** Share of A's SNVs whose argmax signature differs between the two ends of a flow (excluding "(not in version)" ends). */
export function reassignedFraction(rows) {
  let both = 0;
  let moved = 0;
  rows.forEach(([a, b, n]) => {
    if (a === NOT_IN_VERSION || b === NOT_IN_VERSION) return;
    both += n;
    if (a !== b) moved += n;
  });
  return both ? moved / both : null;
}

/**
 * Diagnostics rows, one per group present in data.diagnostics.groups (fixed group order first):
 * [{ group, n, definition, cosines: {key: value}, entropy, entropyMax, cpg, vafMedian, altReadsMedian, oneStrand, spectrum }].
 * vaf_q is quantiles [q05, q25, q50, q75, q95]; the median is element 2.
 */
export function diagnosticsRows(data) {
  const g = data?.diagnostics?.groups || {};
  const names = [...DIAG_GROUP_ORDER.filter((k) => g[k]), ...Object.keys(g).filter((k) => !DIAG_GROUP_ORDER.includes(k))];
  return names.map((k) => {
    const d = g[k];
    const med = (q) => (Array.isArray(q) && q.length >= 3 ? num(q[Math.floor(q.length / 2)]) : null);
    return {
      group: k,
      n: num(d.n) ?? 0,
      definition: d.definition || data?.group_definitions?.[k] || "",
      cosines: d.cosine || {},
      entropy: num(d.entropy_bits),
      entropyMax: num(d.entropy_max_bits),
      cpg: num(d.cpg_ct_frac),
      vafMedian: med(d.reads?.vaf_q),
      altReadsMedian: med(d.reads?.alt_reads_q),
      oneStrand: num(d.reads?.frac_one_strand),
      spectrum: Array.isArray(d.spectrum) && d.spectrum.length === 96 ? d.spectrum.map(Number) : null,
    };
  });
}

/**
 * Headline computed from the data: callable singletons vs normal-cell singletons (artifact) vs truncal.
 * null when a needed group or cosine is missing.
 */
export function diagnosticsHeadline(data) {
  const rows = diagnosticsRows(data);
  const by = (k) => rows.find((r) => r.group === k);
  const s = by("singleton");
  const t = by("truncal");
  const lc = by("singleton_lowconf");
  const f = (x) => Number(x).toFixed(2);
  const ok = (r) => r && r.n > 0 && r.cosines?.normal_singleton != null;
  const parts = [];
  if (ok(s)) parts.push(`callable singletons: cosine ${f(s.cosines.normal_singleton)} to normal-cell singletons (artifact)${ok(t) ? ` vs ${f(t.cosines.normal_singleton)} for truncal` : " (truncal not available)"}`);
  if (ok(lc)) parts.push(`${parts.length ? "low-confidence singletons" : "low-confidence singletons: cosine"} ${parts.length ? `${f(lc.cosines.normal_singleton)} to normal-cell singletons` : `${f(lc.cosines.normal_singleton)} to normal-cell singletons (artifact)`}`);
  if (ok(s) && ok(t) && s.cosines.PTA_SCAN2 != null && t.cosines.PTA_SCAN2 != null) parts.push(`cosine to the PTA artifact signature ${f(s.cosines.PTA_SCAN2)} (singletons) vs ${f(t.cosines.PTA_SCAN2)} (truncal)`);
  return parts.length ? parts.join("; ") : null;
}

/** Histogram of per-cell singleton counts: { bins: [{ x0, x1, count }], max, n, median }. metric = singleton | singleton_lowconf | normal_singleton. */
export function burdenHistogram(data, metric = "singleton", nbins = 20) {
  const vals = Object.values(data?.diagnostics?.cell_burden || {})
    .map((c) => num(c?.[metric]))
    .filter((v) => v != null);
  if (!vals.length) return { bins: [], max: 0, n: 0, median: null };
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const w = (hi - lo) / nbins || 1;
  const bins = Array.from({ length: nbins }, (_, i) => ({ x0: lo + i * w, x1: lo + (i + 1) * w, count: 0 }));
  vals.forEach((v) => {
    bins[Math.min(nbins - 1, Math.floor((v - lo) / w))].count += 1;
  });
  const s = [...vals].sort((a, b) => a - b);
  const median = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  return { bins, max: Math.max(...bins.map((b) => b.count)), n: vals.length, median };
}

/**
 * The signature assigned to one tree site under every version: [{ versionId, signature }].
 * tree_sites = { id[], group[], assign: { versionId: code[] } }, signature_codes[] names the codes, -1 = not in version.
 */
export function siteAssignments(data, siteId) {
  const ts = data?.tree_sites;
  const i = ts?.id ? ts.id.indexOf(siteId) : -1;
  if (i < 0) return [];
  const codes = data.signature_codes || [];
  return (data.versions || []).map((v) => {
    const code = ts.assign?.[v.id]?.[i];
    return { versionId: v.id, signature: code == null ? null : code < 0 ? NOT_IN_VERSION : codes[code] ?? null };
  });
}

/** SBS96 channel labels in COSMIC order (the order of every 96-array of the file). */
export const SBS96_CHANNELS = (() => {
  const B = "ACGT";
  const out = [];
  [["C", "AGT"], ["T", "ACG"]].forEach(([r, alts]) =>
    [...alts].forEach((a) => [...B].forEach((l) => [...B].forEach((rr) => out.push(`${l}[${r}>${a}]${rr}`))))
  );
  return out;
})();
