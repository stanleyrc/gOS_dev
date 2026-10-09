// Cross-patient summaries for the single-cell cohort view and the QC tab.
// Pure functions (no d3) so they are unit-testable.

export const SNV_TREE_CATEGORIES = ["truncal", "subclonal", "private", "outside_tumor", "unmapped"];

/** Counts of mapped SNV sites per tree category (CellPhy-input sites only by default). */
export function snvCategoryCounts(variants = [], { cellphyOnly = true } = {}) {
  const out = Object.fromEntries(SNV_TREE_CATEGORIES.map((k) => [k, 0]));
  variants.forEach((v) => {
    if (cellphyOnly && v.cellphy_input !== true && v.cellphyInput !== true) return;
    const k = v.category || "unmapped";
    out[k] = (out[k] || 0) + 1;
  });
  return out;
}

/** Shannon diversity (natural log) of a counts object, ignoring "unassigned"/"Normal". */
export function shannonDiversity(counts = {}) {
  const vals = Object.entries(counts)
    .filter(([k, v]) => v > 0 && !/^(unassigned|normal)$/i.test(k))
    .map(([, v]) => v);
  const n = vals.reduce((s, v) => s + v, 0);
  if (!n) return 0;
  return Math.abs(vals.reduce((s, v) => s + (v / n) * Math.log(v / n), 0)); // abs: avoid -0 for one clone
}

/** Alteration class of a filtered event, for oncoprint colours. */
export function eventClass(event = {}) {
  const vt = `${event.vartype || ""}`.toLowerCase();
  const ty = `${event.type || ""}`.toLowerCase();
  // gGnome events() complex SVs (chromothripsis, BFB, TIC, rDel ...): vartype holds the class
  if (ty === "complex sv") return "complex";
  if (vt === "amp" || /amp/.test(ty)) return "amp";
  if (vt === "homdel" || /homdel|del/.test(ty)) return "homdel";
  if (/fusion/.test(vt) || /fusion/.test(ty)) return "fusion";
  if (/trunc|nonsense|frameshift/.test(ty)) return "trunc";
  if (/splice/.test(ty)) return "splice";
  if (/missense|inframe/.test(ty) || vt === "snv") return "missense";
  return "other";
}

/** Row label of an event: gene, fusion pair, or for complex SVs the class and chromosomes. */
export function eventLabel(e = {}) {
  return e.gene || e.fusion_genes || e.name || (eventClass(e) === "complex" ? e.Variant || e.vartype : "") || "";
}

export const EVENT_CLASS_ORDER = ["amp", "homdel", "fusion", "trunc", "splice", "missense", "complex", "other"];

/**
 * Oncoprint matrix: for each gene (or fusion pair) and patient, the strongest
 * alteration (highest tumor-cell fraction) with its class and fraction.
 * `eventsByPatient` is { patientId: [filtered event] }. Returns genes sorted
 * by how many patients carry them, then by the maximum fraction.
 */
export function oncoprintMatrix(eventsByPatient = {}, { maxTier = 2, filter = null, maxGenes = 40 } = {}) {
  const patients = Object.keys(eventsByPatient);
  const byGene = new Map();
  patients.forEach((p) => {
    (eventsByPatient[p] || []).forEach((e) => {
      const tier = Number(e.Tier ?? e.tier);
      if (Number.isFinite(tier) && tier > maxTier) return;
      if (filter && !filter(e)) return;
      const gene = eventLabel(e);
      if (!gene) return;
      const fraction = Number(e.cell_fraction);
      const n = Number(e.n_cells);
      const entry = { class: eventClass(e), fraction: Number.isFinite(fraction) ? fraction : null, nCells: n, cells: e.cells, event: e };
      if (!byGene.has(gene)) byGene.set(gene, {});
      const cell = byGene.get(gene);
      // keep every class carried, and the strongest one first
      if (!cell[p]) cell[p] = { ...entry, all: [entry] };
      else {
        cell[p].all.push(entry);
        if ((entry.fraction ?? 0) > (cell[p].fraction ?? 0)) Object.assign(cell[p], entry);
      }
    });
  });
  const genes = [...byGene.entries()]
    .map(([gene, cells]) => ({
      gene,
      cells,
      nPatients: Object.keys(cells).length,
      maxFraction: Math.max(0, ...Object.values(cells).map((c) => c.fraction ?? 0)),
    }))
    .sort((a, b) => b.nPatients - a.nPatients || b.maxFraction - a.maxFraction || a.gene.localeCompare(b.gene))
    .slice(0, maxGenes);
  return { patients, genes };
}

/** Median and MAD (scaled to sigma) of finite values. */
export function medianMad(values = []) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return { median: NaN, mad: NaN, n: 0 };
  const med = (arr) => (arr.length % 2 ? arr[(arr.length - 1) / 2] : (arr[arr.length / 2 - 1] + arr[arr.length / 2]) / 2);
  const median = med(v);
  const mad = 1.4826 * med(v.map((x) => Math.abs(x - median)).sort((a, b) => a - b));
  return { median, mad, n: v.length };
}

/** Indices of values more than `k` MADs from the median (both sides, or one). */
export function robustOutliers(values = [], { k = 3, side = "both" } = {}) {
  const { median, mad } = medianMad(values);
  if (!Number.isFinite(mad) || mad === 0) return [];
  return values
    .map((x, i) => ({ x, i }))
    .filter(({ x }) => {
      if (!Number.isFinite(x)) return false;
      const z = (x - median) / mad;
      return side === "high" ? z > k : side === "low" ? z < -k : Math.abs(z) > k;
    })
    .map(({ i }) => i);
}

/**
 * Copy-number QC of one cell's CN row ({ binIndex: { start, end, chromosome, n }, values }):
 * fraction of the genome away from the modal state, number of state changes
 * (segments), mean CN and the mean CN on X.
 */
export function cnRowQc(row, ploidy = null) {
  if (!row || !row.values || !row.binIndex) return null;
  const { values, binIndex } = row;
  const n = binIndex.n ?? values.length;
  let total = 0;
  let altered = 0;
  let segments = 0;
  let sum = 0;
  let count = 0;
  let xSum = 0;
  let xCount = 0;
  const states = new Map();
  for (let i = 0; i < n; i += 1) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    const len = (binIndex.end[i] ?? 0) - (binIndex.start[i] ?? 0);
    const state = Math.round(v);
    states.set(state, (states.get(state) || 0) + len);
    sum += v;
    count += 1;
    if (/^(chr)?X$/i.test(`${binIndex.chromosome[i]}`)) {
      xSum += v;
      xCount += 1;
    }
  }
  if (!count) return null;
  let modal = 2;
  let best = -1;
  states.forEach((len, state) => {
    if (len > best) {
      best = len;
      modal = state;
    }
  });
  const base = Number.isFinite(Number(ploidy)) ? Math.round(Number(ploidy)) : modal;
  let alteredPloidy = 0;
  let prev = null;
  for (let i = 0; i < n; i += 1) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    const len = (binIndex.end[i] ?? 0) - (binIndex.start[i] ?? 0);
    total += len;
    const state = Math.round(v);
    if (state !== modal) altered += len;
    if (state !== base) alteredPloidy += len;
    if (prev != null && state !== prev) segments += 1;
    prev = state;
  }
  return {
    fractionAltered: total ? altered / total : NaN,
    // FGA: fraction of the genome whose CN differs from the cell's (rounded) ploidy
    fga: total ? alteredPloidy / total : NaN,
    baseCn: base,
    segments,
    meanCn: sum / count,
    modalCn: modal,
    chrXMeanCn: xCount ? xSum / xCount : NaN,
  };
}

/** Per-patient metrics table for cohort scatter plots. */
export function patientMetrics(summary, { variants = [], events = [], cells = [] } = {}) {
  const cats = snvCategoryCounts(variants);
  const tumor = cells.filter((c) => !/^normal$/i.test(`${c.clone_id || ""}`));
  const num = (k) => tumor.map((c) => Number(c[k])).filter(Number.isFinite);
  const median = (arr) => medianMad(arr).median;
  const strong = events.filter((e) => Number(e.Tier ?? e.tier) <= 2);
  // approximate callable territory: median breadth (% of genome covered) x 3,100 Mb
  const medianBreadth = median(num("qc_breadth"));
  const callableMb = Number.isFinite(medianBreadth) ? (medianBreadth / 100) * GENOME_MB : NaN;
  return {
    medianBreadth,
    callableMb,
    truncalPerMb: Number.isFinite(callableMb) && callableMb > 0 ? cats.truncal / callableMb : NaN,
    subclonalPerMb: Number.isFinite(callableMb) && callableMb > 0 ? (cats.subclonal + cats.private) / callableMb : NaN,
    patient: summary.caseReportId,
    nCells: summary.nCells,
    nTumorCells: tumor.length,
    nClones: summary.nClones,
    shannon: shannonDiversity(summary.cloneCounts),
    truncal: cats.truncal,
    subclonal: cats.subclonal,
    private: cats.private,
    subclonalFraction: cats.truncal + cats.subclonal + cats.private ? (cats.subclonal + cats.private) / (cats.truncal + cats.subclonal + cats.private) : NaN,
    medianPloidy: median(num("ploidy")),
    medianSnvCount: median(num("snv_count")),
    medianJunctions: median(num("junction_count")),
    rnaFraction: tumor.length ? tumor.filter((c) => c.has_rna).length / tumor.length : NaN,
    tier12Events: strong.length,
    clonalEvents: strong.filter((e) => Number(e.cell_fraction) >= 0.9).length,
  };
}

export const GENOME_MB = 3100;

/** Callable Mb of a cell list from its median breadth (% genome covered); NaN when unknown. */
export function callableMbOf(cells = []) {
  const b = medianMad(cells.map((c) => Number(c.qc_breadth)).filter(Number.isFinite)).median;
  return Number.isFinite(b) ? (b / 100) * GENOME_MB : NaN;
}

export const PATIENT_METRICS = [
  ["nTumorCells", "Tumor cells"],
  ["nClones", "Clones"],
  ["shannon", "Clone diversity (Shannon)"],
  ["truncal", "Truncal SNVs"],
  ["subclonal", "Subclonal SNVs"],
  ["private", "Private SNVs"],
  ["subclonalFraction", "Subclonal + private fraction"],
  ["truncalPerMb", "Truncal SNVs per callable Mb (approx.)"],
  ["subclonalPerMb", "Subclonal + private SNVs per callable Mb (approx.)"],
  ["callableMb", "Callable territory, Mb (median breadth)"],
  ["medianPloidy", "Median ploidy"],
  ["medianSnvCount", "Median SNVs per cell"],
  ["medianJunctions", "Median junctions per cell"],
  ["rnaFraction", "Fraction of cells with RNA"],
  ["tier12Events", "Tier 1–2 events"],
  ["clonalEvents", "Clonal tier 1–2 events (≥90% cells)"],
];

const clean = (v) => (v == null || v === "" || v === "None" ? null : `${v}`.replace(/<[^>]+>/g, ""));

/**
 * Plain-text lines describing a filtered event for a hover tooltip: tier,
 * alteration type (in-frame / out-of-frame fusion, deletion, amplification,
 * SNV consequence), protein and genomic change, role, effect, copies and
 * carrier cells.
 */
export function eventTooltipLines(event = {}) {
  const lines = [];
  const vt = `${event.vartype || event.type || ""}`;
  const type = /outframe/i.test(vt) ? "out-of-frame fusion" : /fusion/i.test(vt) ? "in-frame fusion" : /homdel/i.test(vt) ? "homozygous deletion" : /amp/i.test(vt) ? "amplification" : clean(event.Variant) && !/^(SNV|None)$/i.test(event.Variant) ? `${vt} ${clean(event.Variant)}` : clean(vt);
  if (clean(event.Tier)) lines.push(`Tier ${clean(event.Tier)}`);
  if (type) lines.push(type);
  if (clean(event.Variant_g)) lines.push(clean(event.Variant_g));
  if (clean(event.fusion_gene_coords)) lines.push(`breakpoints ${clean(event.fusion_gene_coords)}`);
  else if (clean(event.Genome_Location)) lines.push(clean(event.Genome_Location));
  if (clean(event.role)) lines.push(clean(event.role));
  if (clean(event.effect)) lines.push(clean(event.effect));
  if (clean(event.estimated_altered_copies)) lines.push(`${clean(event.estimated_altered_copies)} altered copies`);
  if (clean(event.fusion_cn)) lines.push(`fusion CN ${clean(event.fusion_cn)}`);
  if (clean(event.VAF)) lines.push(`VAF ${clean(event.VAF)}`);
  if (clean(event.cells)) lines.push(`${clean(event.cells)} cells${Number.isFinite(Number(event.cell_fraction)) ? ` (${Math.round(100 * Number(event.cell_fraction))}%)` : ""}`);
  if (clean(event.therapeutics)) lines.push(`therapeutics: ${clean(event.therapeutics)}`);
  return lines;
}
