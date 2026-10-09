// Precomputed per-patient outputs (srctools inst/gos_single_cell/precompute):
// data/<patient>/precompute/{manifest,qc,sphase,telomeres,region_calls}.json,
// data/<patient>/slices/regions.json (+ RG-tagged slice BAMs) and the
// dataset-wide data/_precompute/status.json. The app only reads these; a
// missing file means "not yet computed" for the panels that need it.

export const PRECOMPUTE_FILES = {
  manifest: "precompute/manifest.json",
  qc: "precompute/qc.json",
  sphase: "precompute/sphase.json",
  telomeres: "precompute/telomeres.json",
  calls: "precompute/region_calls.json",
  mtdna: "precompute/mtdna.json",
  slices: "slices/regions.json",
};
export const PRECOMPUTE_STATUS_FILE = "_precompute/status.json";

// Cell fields added from the precompute outputs. Categorical ones (strings)
// become heatmap annotation strips and UMAP colourings; numeric ones bars.
export const PC_FIELDS = {
  dnaCycle: "DNA cycle",
  qcFlag: "QC flag",
  altLike: "ALT-like",
  qcFlags: "pc_qc_flags",
  ado: "pc_ado",
  mapd: "pc_mapd",
  lohHet: "pc_loh_het_rate",
  cnResid: "pc_cn_resid",
  rtCor: "pc_rt_cor",
  sProb: "pc_s_prob",
  sProgression: "pc_s_progression",
  telRel: "pc_tel_rel",
  tvrFrac: "pc_tvr_frac",
  mtCn: "pc_mt_cn",
};
export const PC_NUMERIC_LABELS = {
  pc_ado: "Allelic dropout (germline hets)",
  pc_mapd: "MAPD (500 kb bins)",
  pc_loh_het_rate: "Biallelic hets in LOH (doublet signal)",
  pc_cn_resid: "Coverage vs CN residual",
  pc_rt_cor: "Coverage vs replication timing (rho)",
  pc_s_prob: "S-phase probability (DNA)",
  pc_s_progression: "S-phase progression (DNA)",
  pc_tel_rel: "Telomere content (vs normal cells)",
  pc_tvr_frac: "Telomeric variant repeat fraction",
  pc_mt_cn: "mtDNA copies per cell",
};
export const GENOTYPE_LABELS = { mut: "mutant", wt: "wild type", nc: "no call" };

const byCell = (doc) => {
  const m = new Map();
  (doc?.cells || []).forEach((r) => r && r.cell_id != null && m.set(`${r.cell_id}`, r));
  return m;
};
const num = (v) => (v == null || v === "" || Number.isNaN(+v) ? null : +v);

/** QC flags string -> one label for the strip ("pass" when the cell has none). */
export function qcFlagLabel(row) {
  if (!row) return null;
  const flags = `${row.flags || ""}`.split(",").filter(Boolean);
  if (!flags.length) return "pass";
  if (flags.includes("doublet")) return "doublet";
  if (flags.length > 1) return "several";
  return flags[0].replace(/_/g, " ");
}

/** Per-cell call vectors of region_calls.json for the configured hotspots: { label: { cellId: call } }. */
export function hotspotGenotypes(calls, { onlyHotspots = true, minMut = 0 } = {}) {
  const out = {};
  if (!calls?.sites || !calls?.cells) return out;
  calls.sites.forEach((s) => {
    if (onlyHotspots && !s.hotspot) return;
    if ((s.n_mut || 0) < minMut) return;
    const v = calls.dna?.[s.id];
    if (!v) return;
    const label = s.name || s.id;
    out[label] = {};
    calls.cells.forEach((c, k) => {
      out[label][c] = v.call?.[k] ?? null;
    });
  });
  return out;
}

/**
 * Cell records with the precompute fields merged in. Hotspot genotypes become
 * fields named after the site ("TERT C228T": mutant / wild type / no call)
 * only for hotspots with a mutant call in some cell, so silent hotspots don't
 * clutter the strip menus.
 */
/**
 * Telomere rows with tel_rel (content relative to the normal cells' median, else all cells) and alt_like
 * filled in when the file has only tel_content / tel_rpm (TelSeq-style output): ALT-like = telomere content
 * and variant-repeat fraction both > 2 robust SD above the patient median.
 */
export function normaliseTelomeres(doc) {
  const rows = doc?.cells || [];
  if (!rows.length || rows.every((r) => r.tel_rel != null)) return doc;
  const val = (r) => num(r.tel_content ?? r.tel_rpm);
  const med = (v) => {
    const x = v.filter((y) => y != null && Number.isFinite(y)).sort((a, b) => a - b);
    if (!x.length) return null;
    const k = x.length >> 1;
    return x.length % 2 ? x[k] : (x[k - 1] + x[k]) / 2;
  };
  const normals = rows.filter((r) => r.normal === true || /^normal$/i.test(`${r.clone_id || ""}`));
  const ref = med((normals.length >= 3 ? normals : rows).map(val));
  const rz = (vals) => {
    const m = med(vals);
    const mad = med(vals.map((v) => (v == null ? null : Math.abs(v - m))));
    return (v) => (v == null || m == null || !mad ? null : (v - m) / (1.4826 * mad));
  };
  const logRel = rows.map((r) => (val(r) && ref ? Math.log2(val(r) / ref) : null));
  const zTel = rz(logRel);
  const zTvr = rz(rows.map((r) => num(r.tvr_frac)));
  return {
    ...doc,
    reference: doc.reference || (normals.length >= 3 ? "normal cells" : "all cells"),
    cells: rows.map((r, i) => ({
      ...r,
      tel_rel: r.tel_rel ?? (val(r) && ref ? val(r) / ref : null),
      alt_like: r.alt_like ?? ((zTel(logRel[i]) ?? 0) > 2 && (zTvr(num(r.tvr_frac)) ?? 0) > 2),
    })),
  };
}

export function mergePrecomputeIntoCells(cells = [], { qc, sphase, telomeres, calls, mtdna } = {}) {
  const q = byCell(qc);
  const s = byCell(sphase);
  const t = byCell(normaliseTelomeres(telomeres));
  const mt = byCell(mtdna);
  const gts = hotspotGenotypes(calls, { minMut: 1 });
  if (!q.size && !s.size && !t.size && !mt.size && !Object.keys(gts).length) return cells;
  return cells.map((c) => {
    const id = `${c.cell_id}`;
    const out = { ...c };
    const qr = q.get(id);
    if (qr) {
      out[PC_FIELDS.qcFlag] = qcFlagLabel(qr);
      out[PC_FIELDS.qcFlags] = [`${qr.flags || ""}`, qr.cn_inconsistent ? "cn_inconsistent" : ""].filter(Boolean).join(",");
      out[PC_FIELDS.ado] = num(qr.ado);
      out[PC_FIELDS.mapd] = num(qr.mapd);
      out[PC_FIELDS.lohHet] = num(qr.loh_het_rate);
      out[PC_FIELDS.cnResid] = num(qr.cn_resid);
    }
    const sr = s.get(id);
    if (sr && sr.rt_cor != null) {
      out[PC_FIELDS.dnaCycle] = sr.s_call ? "S-phase" : "not S";
      out[PC_FIELDS.rtCor] = num(sr.rt_cor);
      out[PC_FIELDS.sProb] = num(sr.s_prob);
      out[PC_FIELDS.sProgression] = num(sr.s_progression);
    }
    const tr = t.get(id);
    if (tr && tr.tel_rel != null) {
      out[PC_FIELDS.altLike] = tr.alt_like ? "ALT-like" : "no";
      out[PC_FIELDS.telRel] = num(tr.tel_rel);
      out[PC_FIELDS.tvrFrac] = num(tr.tvr_frac);
    }
    const mr = mt.get(id);
    if (mr && mr.mt_cn != null) out[PC_FIELDS.mtCn] = num(mr.mt_cn);
    Object.entries(gts).forEach(([label, m]) => {
      const g = m[id];
      if (g != null) out[label] = GENOTYPE_LABELS[g] || g;
    });
    return out;
  });
}

/** Spearman rho (average ranks for ties). */
export function spearman(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const rank = (v) => {
    const idx = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
    const r = new Array(n);
    for (let i = 0; i < n; ) {
      let j = i;
      while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j += 1;
      const avg = (i + j) / 2;
      for (let k = i; k <= j; k += 1) r[idx[k][1]] = avg;
      i = j + 1;
    }
    return r;
  };
  const a = rank(xs);
  const b = rank(ys);
  const ma = a.reduce((p, x) => p + x, 0) / n;
  const mb = b.reduce((p, x) => p + x, 0) / n;
  let num_ = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i += 1) {
    num_ += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? num_ / Math.sqrt(da * db) : null;
}

/**
 * DNA vs RNA cell cycle in the same cells: points {id, clone, rtCor, sProb,
 * sCall, sScore, g2mScore, phase}, Spearman rho of rt_cor vs S.Score and vs
 * G2M.Score, and the proliferating fraction per clone from both readouts.
 * rnaCells are rna/cells.json rows (cell_id links to DNA).
 */
export function cellCycleConcordance(sphase, rnaCells = [], cloneOf = new Map()) {
  const rna = new Map();
  rnaCells.forEach((r) => r?.cell_id && rna.set(`${r.cell_id}`, r));
  const points = [];
  (sphase?.cells || []).forEach((c) => {
    if (c.rt_cor == null) return;
    const r = rna.get(`${c.cell_id}`);
    points.push({
      id: `${c.cell_id}`,
      clone: cloneOf.get(`${c.cell_id}`) ?? c.clone_id ?? null,
      rtCor: +c.rt_cor,
      rtZ: num(c.rt_z),
      sProb: num(c.s_prob),
      sCall: !!c.s_call,
      progression: num(c.s_progression),
      sScore: num(r?.S_Score ?? r?.["S.Score"]),
      g2mScore: num(r?.G2M_Score ?? r?.["G2M.Score"]),
      phase: r?.Phase ?? null,
    });
  });
  const paired = points.filter((p) => p.sScore != null);
  const rhoS = spearman(paired.map((p) => p.rtCor), paired.map((p) => p.sScore));
  const rhoG2M = spearman(
    paired.filter((p) => p.g2mScore != null).map((p) => p.rtCor),
    paired.filter((p) => p.g2mScore != null).map((p) => p.g2mScore)
  );
  const clones = new Map();
  points.forEach((p) => {
    const k = p.clone ?? "unassigned";
    if (!clones.has(k)) clones.set(k, { clone: k, n: 0, dnaS: 0, nRna: 0, rnaCycling: 0 });
    const e = clones.get(k);
    e.n += 1;
    if (p.sCall) e.dnaS += 1;
    if (p.phase != null) {
      e.nRna += 1;
      if (p.phase === "S" || p.phase === "G2M") e.rnaCycling += 1;
    }
  });
  const perClone = [...clones.values()].map((e) => ({
    ...e,
    dnaFrac: e.n ? e.dnaS / e.n : null,
    rnaFrac: e.nRna ? e.rnaCycling / e.nRna : null,
  }));
  return { points, nPaired: paired.length, rhoS, rhoG2M, perClone };
}

/**
 * One hotspot's per-cell evidence from region_calls.json, rows sorted by clone:
 * { id, clone, alt, dp, p, call, miss, rnaAlt, rnaDp }. `miss` is the chance a
 * mutant cell shows no alt reads at this depth given the cell's dropout.
 */
export function siteEvidence(calls, siteId, cloneOf = new Map(), cloneOrder = []) {
  if (!calls?.dna?.[siteId]) return [];
  const v = calls.dna[siteId];
  const r = calls.rna?.[siteId];
  const rank = new Map(cloneOrder.map((c, i) => [c, i]));
  const rows = calls.cells.map((id, k) => ({
    id,
    clone: cloneOf.get(id) ?? calls.clone?.[k] ?? null,
    alt: v.alt?.[k] ?? null,
    dp: v.dp?.[k] ?? null,
    p: v.p?.[k] ?? null,
    call: v.call?.[k] ?? "nc",
    miss: v.miss?.[k] ?? null,
    rnaAlt: r?.alt?.[k] ?? null,
    rnaDp: r?.dp?.[k] ?? null,
  }));
  return rows.sort(
    (a, b) =>
      (rank.get(a.clone) ?? 1e9) - (rank.get(b.clone) ?? 1e9) ||
      `${a.clone}`.localeCompare(`${b.clone}`) ||
      `${a.id}`.localeCompare(`${b.id}`)
  );
}

/** Calls per clone for a site: { clone: { mut, wt, nc, n } }. */
export function siteCloneSummary(rows) {
  const out = {};
  rows.forEach((r) => {
    const k = r.clone ?? "unassigned";
    out[k] = out[k] || { mut: 0, wt: 0, nc: 0, n: 0 };
    out[k][r.call] = (out[k][r.call] || 0) + 1;
    out[k].n += 1;
  });
  return out;
}

/** status.json -> rows { patient, steps: { id: { state, detail, finished } } } plus step ids, worst state first. */
export function statusRows(doc) {
  if (!doc?.patients) return { steps: [], rows: [] };
  const steps = (doc.steps || []).map((s) => s.id);
  const order = { failed: 0, running: 1, stale: 2, missing: 3, done: 4 };
  const rows = Object.entries(doc.patients).map(([patient, st]) => {
    const states = steps.map((s) => st[s]?.state || "missing");
    const worst = states.reduce((w, s) => ((order[s] ?? 9) < (order[w] ?? 9) ? s : w), "done");
    return { patient, steps: st, worst, nDone: states.filter((s) => s === "done").length };
  });
  return { steps, rows: rows.sort((a, b) => a.patient.localeCompare(b.patient)) };
}

// Global cell filter: QC rules (layout.qcExcludeRules) and manually excluded
// cells (layout.excludedCells). Rules apply to every patient; ids are unique.
export const QC_EXCLUDE_RULES = [
  { value: "doublet", label: "Doublets (biallelic hets in LOH)" },
  { value: "high_ado", label: "High allelic dropout" },
  { value: "high_mapd", label: "High MAPD (noisy coverage)" },
  { value: "cn_inconsistent", label: "Coverage not fitting integer CN" },
  { value: "s_phase", label: "S-phase cells (DNA)" },
];

/** Set of cell ids excluded by the rules and the manual list. */
export function excludedCellIds(cells = [], rules = [], manual = []) {
  const out = new Set((manual || []).map(String));
  if (!rules?.length) return out;
  const want = new Set(rules);
  cells.forEach((c) => {
    const flags = new Set(`${c[PC_FIELDS.qcFlags] || ""}`.split(",").filter(Boolean));
    const hit = [...flags].some((f) => want.has(f)) || (want.has("s_phase") && c[PC_FIELDS.dnaCycle] === "S-phase");
    if (hit) out.add(`${c.cell_id}`);
  });
  return out;
}
