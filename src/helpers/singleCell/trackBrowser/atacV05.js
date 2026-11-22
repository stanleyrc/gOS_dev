// Spec v0.5 (JW-08): `atac_residual` (clade residual accessibility per region, after dose) and `atac_cn` (ATAC-only
// relative CN per pool at 1 Mb, with the genome CN overlay). d3-free (jest).

const bare = (c) => `${c ?? ""}`.replace(/^chr/i, "");
const num = (v) => (v === null || v === "" || v === undefined || v === "NA" || !Number.isFinite(Number(v)) ? null : Number(v));
const TIME_ORDER = (t) => {
  const m = `${t}`.match(/^T(\d+)$/i);
  if (m) return Number(m[1]);
  return `${t}`.toLowerCase() === "late" ? 100 : 200;
};

/**
 * atac_residuals.json -> { unit, source, regions: Map id -> { id, kind, chrom, start, end }, clades: [ids],
 * means: Map clade -> Map region -> { resid, se, n }, tests: Map region -> { clade_q, clade_eta2, lineage_z, lineage_q },
 * times: [labels], timeMeans: Map time -> Map region -> { resid (n-weighted over samples), n, samples: [{ sample, resid, n }] } }.
 * Returns { ok: false, error } when the file has no regions.
 */
export function normalizeAtacResiduals(json) {
  if (!json || typeof json !== "object") return { ok: false, error: "atac_residuals.json is not a JSON object" };
  const na = json.not_available || json.unavailable;
  const regions = new Map();
  (json.regions || []).forEach((r) => {
    const start = num(r.start);
    const end = num(r.end);
    if (r && r.id != null && start != null && end != null && end >= start) regions.set(`${r.id}`, { id: `${r.id}`, kind: r.kind || "", chrom: bare(r.chrom), start, end });
  });
  if (!regions.size) return { ok: false, error: na ? `${na}` : "no regions in atac_residuals.json" };
  const means = new Map();
  const clades = [];
  (json.clade_means || []).forEach((m) => {
    const c = `${m.clade}`;
    if (!regions.has(`${m.region}`)) return;
    if (!means.has(c)) {
      means.set(c, new Map());
      clades.push(c);
    }
    means.get(c).set(`${m.region}`, { resid: num(m.resid), se: num(m.se ?? m.resid_se), n: num(m.n) });
  });
  const tests = new Map((json.tests || []).map((t) => [`${t.region}`, { clade_q: num(t.clade_q), clade_eta2: num(t.clade_eta2), lineage_z: num(t.lineage_z), lineage_q: num(t.lineage_q) }]));
  const acc = new Map();
  (json.time_means || []).forEach((m) => {
    const t = `${m.time}`;
    const rid = `${m.region}`;
    const r = num(m.resid);
    if (!regions.has(rid) || r == null) return;
    if (!acc.has(t)) acc.set(t, new Map());
    const byR = acc.get(t);
    if (!byR.has(rid)) byR.set(rid, { sw: 0, swr: 0, n: 0, samples: [] });
    const a = byR.get(rid);
    const n = num(m.n) || 1;
    a.sw += n;
    a.swr += n * r;
    a.n += num(m.n) || 0;
    a.samples.push({ sample: `${m.sample}`, resid: r, n: num(m.n) });
  });
  const times = [...acc.keys()].sort((a, b) => TIME_ORDER(a) - TIME_ORDER(b) || `${a}`.localeCompare(`${b}`));
  const timeMeans = new Map(times.map((t) => [t, new Map([...acc.get(t)].map(([rid, a]) => [rid, { resid: a.swr / a.sw, se: null, n: a.n, samples: a.samples }]))]));
  clades.sort((a, b) => `${a}`.localeCompare(`${b}`, undefined, { numeric: true }));
  // per-plate datasets: clade means are over the joint clades; clade_map gives each plate clade's majority joint clade
  const cladeMap = json.clade_map && typeof json.clade_map === "object" ? json.clade_map : null;
  const mappedFrom = new Map();
  if (cladeMap) Object.entries(cladeMap).forEach(([pc, jc]) => mappedFrom.set(`${jc}`, [...(mappedFrom.get(`${jc}`) || []), pc]));
  return { ok: true, unit: json.unit || "log2 residual accessibility", source: json.source ?? null, regions, clades, means, tests, times, timeMeans, cladeMap, mappedFrom, notes: json.notes || "" };
}

/** Lanes of the residual track: one per clade (`by` "clade") or per time label (`by` "time"): [{ key, label, values }]. */
export function residualLanes(res, by = "clade") {
  if (!res?.ok) return [];
  if (by === "time" && res.times.length) return res.times.map((t) => ({ key: `time:${t}`, label: t, values: res.timeMeans.get(t) }));
  return res.clades.map((c) => ({ key: `clade:${c}`, label: c, values: res.means.get(c), note: res.mappedFrom?.size ? (res.mappedFrom.has(c) ? `this plate: ${res.mappedFrom.get(c).join(", ")}` : "no clade of this plate") : "" }));
}

/** Regions overlapping each window, clipped: [{ slot, start, end, region }]. */
export function regionsInWindows(res, slots) {
  const out = [];
  if (!res?.ok) return out;
  res.regions.forEach((r) => {
    slots.forEach((s, k) => {
      if (s.window.chrom !== r.chrom || r.end < s.window.start || r.start > s.window.end) return;
      out.push({ slot: k, start: Math.max(r.start, s.window.start), end: Math.min(r.end, s.window.end), region: r });
    });
  });
  return out;
}

/** Symmetric y half-range for the lanes over the regions in view (|resid| + se), rounded up to a readable value. */
export function residualRange(lanes, hits) {
  let m = 0;
  const ids = new Set(hits.map((h) => h.region.id));
  lanes.forEach((l) => ids.forEach((id) => {
    const v = l.values?.get(id);
    if (v && v.resid != null) m = Math.max(m, Math.abs(v.resid) + (v.se || 0));
  }));
  if (!(m > 0)) return 0.5;
  const steps = [0.1, 0.2, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 5];
  return steps.find((s) => s >= m) || Math.ceil(m);
}

/** Tooltip lines of one region in one lane. */
export function residualLines(res, lane, region) {
  const v = lane.values?.get(region.id);
  const t = res.tests.get(region.id);
  const f = (x, d = 3) => (x == null ? "not available" : Math.abs(x) < 1e-3 && x !== 0 ? x.toExponential(1) : x.toFixed(d));
  const lines = [`${region.id} (${region.kind || "region"}) · chr${region.chrom}:${region.start.toLocaleString()}-${region.end.toLocaleString()}`];
  if (!v || v.resid == null) lines.push(`${lane.label}: not available (no residual for this region)`);
  else lines.push(`${lane.label}${lane.note ? ` (${lane.note})` : ""}: residual ${f(v.resid)}${v.se != null ? ` ± ${f(v.se)} (SE)` : ""}${v.n != null ? ` · n ${v.n}` : ""}`);
  if (v?.samples?.length) lines.push(`plates: ${v.samples.map((s) => `${s.sample} ${f(s.resid, 2)}`).join(", ")}`);
  if (t) lines.push(`clade q ${f(t.clade_q)} · clade η² ${f(t.clade_eta2)} · lineage z ${f(t.lineage_z, 2)} · lineage q ${f(t.lineage_q)}`);
  else lines.push("tests: not available");
  lines.push(`unit: ${res.unit}`);
  return lines;
}

// ----- atac_cn

/**
 * atac_cn.json -> { ok, unit, source, binSize, pools: [{ id, n_cells, chroms: Map chrom -> { starts, ends, atac, genome, usable } }],
 * arms: Map arm -> { arm, n_bins, pooled_rel_cn, sd_cells }, hasGenome } or { ok: false, error }.
 */
export function normalizeAtacCn(json) {
  if (!json || typeof json !== "object") return { ok: false, error: "atac_cn.json is not a JSON object" };
  const na = json.not_available || json.unavailable;
  const pools = (json.pools || []).map((p) => {
    const chroms = new Map();
    (p.bins || []).forEach((b) => {
      const [c, s, e, a, g, u] = Array.isArray(b) ? b : [b.chrom, b.start, b.end, b.atac_rel, b.genome_rel, b.usable];
      const chrom = bare(c);
      const start = num(s);
      const end = num(e);
      if (!chrom || start == null || end == null) return;
      if (!chroms.has(chrom)) chroms.set(chrom, { starts: [], ends: [], atac: [], genome: [], usable: [] });
      const x = chroms.get(chrom);
      x.starts.push(start);
      x.ends.push(end);
      x.atac.push(num(a));
      x.genome.push(num(g));
      x.usable.push(u === true || u === "TRUE" || u === 1 || u === "true");
    });
    return { id: `${p.id}`, n_cells: num(p.n_cells), chroms };
  }).filter((p) => p.chroms.size);
  if (!pools.length) return { ok: false, error: na ? `${na}` : "no pools in atac_cn.json" };
  const arms = new Map((json.arms || []).map((r) => [`${r.arm}`, { arm: `${r.arm}`, n_bins: num(r.n_bins), pooled_rel_cn: num(r.pooled_rel_cn), sd_cells: num(r.sd_cells) }]));
  const hasGenome = pools.some((p) => [...p.chroms.values()].some((c) => c.genome.some((v) => v != null)));
  return { ok: true, unit: json.unit || "relative CN (ATAC-only, no ploidy)", source: json.source ?? null, binSize: num(json.bin_size) || 1e6, pools, arms, hasGenome };
}

/** Bins of a pool inside a window: [{ start, end, atac, genome, usable }]. */
export function atacCnInWindow(pool, w) {
  const c = pool?.chroms.get(bare(w.chrom));
  if (!c) return [];
  const out = [];
  for (let i = 0; i < c.starts.length; i += 1) {
    if (c.ends[i] < w.start || c.starts[i] > w.end) continue;
    out.push({ start: Math.max(c.starts[i], w.start), end: Math.min(c.ends[i], w.end), atac: c.atac[i], genome: c.genome[i], usable: c.usable[i] });
  }
  return out;
}

/** y range [0, max] over usable values (atac and genome), at least 2, rounded up to 0.5. */
export function atacCnMax(pools, windows) {
  let m = 0;
  (pools || []).forEach((p) => (windows || []).forEach((w) => atacCnInWindow(p, w).forEach((b) => {
    if (!b.usable) return;
    if (b.atac != null) m = Math.max(m, b.atac);
    if (b.genome != null) m = Math.max(m, b.genome);
  })));
  return Math.max(2, Math.ceil(Math.min(m, 6) * 2) / 2);
}

/**
 * Genome-wide layout over `width` px for the chromosomes present in the pools (in chromoBins order when given):
 * [{ chrom, x0, x1, start, end }] with x proportional to chromosome length (gaps of `gap` px).
 */
export function genomeLayout(res, width, chromoBins = null, gap = 2) {
  if (!res?.ok) return [];
  const present = new Set();
  res.pools.forEach((p) => p.chroms.forEach((_, c) => present.add(c)));
  const order = chromoBins ? Object.keys(chromoBins).filter((c) => present.has(c)) : [...present].sort((a, b) => (Number(a) || 100 + a.charCodeAt(0)) - (Number(b) || 100 + b.charCodeAt(0)));
  const len = (c) => {
    if (chromoBins?.[c]) return chromoBins[c].endPoint - chromoBins[c].startPoint + 1;
    let m = 0;
    res.pools.forEach((p) => {
      const x = p.chroms.get(c);
      if (x) m = Math.max(m, x.ends[x.ends.length - 1]);
    });
    return m;
  };
  const total = order.reduce((s, c) => s + len(c), 0);
  const avail = Math.max(10, width - gap * Math.max(0, order.length - 1));
  let x = 0;
  return order.map((c) => {
    const w = (len(c) / total) * avail;
    const seg = { chrom: c, x0: x, x1: x + w, start: 1, end: len(c) };
    x += w + gap;
    return seg;
  });
}

// hg38 centromere positions (UCSC cytoBand acen p/q boundary, Mb), for the arm of a bin
const CEN_HG38 = { 1: 123.4, 2: 93.9, 3: 90.9, 4: 50.0, 5: 48.8, 6: 59.8, 7: 60.1, 8: 45.2, 9: 43.0, 10: 39.8, 11: 53.4, 12: 35.5, 13: 17.7, 14: 17.2, 15: 19.0, 16: 36.8, 17: 25.1, 18: 18.5, 19: 26.2, 20: 28.1, 21: 12.0, 22: 15.0, X: 60.6, Y: 10.4 };

/** Arm name ("7p", "12q") of an hg38 position. */
export function armOf(chrom, pos) {
  const c = bare(chrom);
  const cen = CEN_HG38[c];
  if (cen == null) return null;
  return `${c}${pos < cen * 1e6 ? "p" : "q"}`;
}
