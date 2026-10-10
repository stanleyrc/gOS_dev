// Allele-specific expression (ASE) vs allelic copy number in the same cells:
// data/<patient>/rna/ase.json from srctools gos_sc_ase.py. Haplotypes A / B
// are the two Eagle-phased parental haplotypes; per gene the RNA share of
// haplotype A is compared with the share expected from the cell's allelic
// copy number (CN_A / (CN_A + CN_B)). d3-free so it can be unit tested.

/** Finding kinds, most to least notable (also the legend order). */
export const ASE_KINDS = ["clone-switch", "monoallelic", "minority-allele", "beyond-dna", "buffered", "dosage"];

/** Gene classes (back end `class`) -> short label and tag colour. */
export const ASE_CLASS = {
  monoallelic: { label: "monoallelic", color: "magenta" },
  "monoallelic-nodna": { label: "monoallelic (no DNA)", color: "magenta" },
  "minority-allele": { label: "minority allele", color: "volcano" },
  "beyond-dna": { label: "RNA beyond DNA", color: "orange" },
  buffered: { label: "dosage buffered", color: "cyan" },
  dosage: { label: "follows dosage", color: "blue" },
};

export const ASE_KIND_COLOR = {
  "clone-switch": "purple",
  monoallelic: "magenta",
  "minority-allele": "volcano",
  "beyond-dna": "orange",
  buffered: "cyan",
  dosage: "blue",
};

/** Plot colours of the gene classes (scatter), light-theme values (remapped for dark by the SVG theme). */
export const ASE_CLASS_FILL = {
  monoallelic: "#c41d7f",
  "monoallelic-nodna": "#c41d7f",
  "minority-allele": "#d4380d",
  "beyond-dna": "#d46b08",
  buffered: "#08979c",
  dosage: "#1d39c4",
  "clone-switch": "#722ed1",
  none: "#8c8c8c",
};

export const isNotableAse = (f) => f && (f.severity === "high" || f.severity === "moderate");

const num = (v) => (v == null || v === "" ? NaN : Number(v));

/**
 * Normalise the back-end file: cells (index -> meta), genes with numeric
 * fields and a Map by name, findings sorted by score. Returns null for
 * anything that is not an ASE file.
 */
export function parseAse(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.genes)) return null;
  const cells = (raw.cells || []).map((c, i) => ({ ...c, index: i }));
  const genes = raw.genes.map((g) => ({
    ...g,
    rna: num(g.rna),
    dna: num(g.dna),
    delta: num(g.delta),
    q: num(g.q),
    q_imb: num(g.q_imb),
    cls: g.class || null,
    hasCells: Array.isArray(g.cell_values),
  }));
  const byGene = new Map(genes.map((g) => [g.gene, g]));
  const findings = [...(raw.findings || [])].sort((a, b) => (b.score || 0) - (a.score || 0));
  return { ...raw, cells, genes, byGene, findings, aseReads: raw.ase_reads || {} };
}

/**
 * One gene's cells: [{ index, cellId, rnaId, clone, a, b, n, frac, exp, cnA, cnB }]
 * from the compact cell_values rows [cellIndex, a, b, exp, cnA, cnB].
 */
export function geneCells(ase, gene) {
  const g = ase?.byGene?.get(gene);
  if (!g || !g.hasCells) return [];
  return g.cell_values
    .map(([ci, a, b, exp, cnA, cnB]) => {
      const meta = ase.cells[ci] || {};
      const n = a + b;
      return {
        index: ci,
        cellId: meta.cell_id,
        rnaId: meta.rna_id,
        clone: meta.clone || "Unassigned",
        a,
        b,
        n,
        frac: n ? a / n : NaN,
        exp: exp == null ? NaN : exp,
        cnA: cnA == null ? NaN : cnA,
        cnB: cnB == null ? NaN : cnB,
      };
    })
    .filter((c) => c.n > 0);
}

/** Wilson 95% interval of a binomial share. */
export function wilson(k, n, z = 1.96) {
  if (!n) return [NaN, NaN];
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

/**
 * Cells grouped by clone (clone order: most cells first, Unassigned / Normal
 * last), inside a clone ordered by DNA expectation then RNA share.
 * Returns { order: cells in plot order with x index, groups: [{ clone, from, to, a, b, rna, dna, ci }] }.
 */
export function cellsByClone(cells) {
  const groups = new Map();
  cells.forEach((c) => {
    if (!groups.has(c.clone)) groups.set(c.clone, []);
    groups.get(c.clone).push(c);
  });
  const tail = (k) => (/^unassigned$/i.test(k) ? 2 : /^normal$/i.test(k) ? 1 : 0);
  const keys = [...groups.keys()].sort((x, y) => tail(x) - tail(y) || groups.get(y).length - groups.get(x).length || `${x}`.localeCompare(`${y}`));
  const order = [];
  const out = [];
  keys.forEach((k) => {
    const list = groups.get(k).sort((p, q) => (Number.isFinite(p.exp) ? p.exp : 0.5) - (Number.isFinite(q.exp) ? q.exp : 0.5) || p.frac - q.frac);
    const from = order.length;
    let a = 0;
    let b = 0;
    let en = 0;
    let ne = 0;
    list.forEach((c) => {
      order.push({ ...c, x: order.length });
      a += c.a;
      b += c.b;
      if (Number.isFinite(c.exp)) {
        en += c.exp * c.n;
        ne += c.n;
      }
    });
    out.push({ clone: k, from, to: order.length - 1, cells: list.length, a, b, rna: a + b ? a / (a + b) : NaN, dna: ne ? en / ne : NaN, ci: wilson(a, a + b) });
  });
  return { order, groups: out };
}

/** Per-cell pattern of a gene: how many cells express only A, only B, or both (cells with >= minReads reads). */
export function cellPattern(cells, minReads = 2) {
  let onlyA = 0;
  let onlyB = 0;
  let both = 0;
  cells.forEach((c) => {
    if (c.n < minReads) return;
    if (c.frac >= 0.9) onlyA += 1;
    else if (c.frac <= 0.1) onlyB += 1;
    else both += 1;
  });
  return { onlyA, onlyB, both, total: onlyA + onlyB + both };
}

/**
 * Folded allele shares of a gene: haplotype labels are arbitrary, so x is the
 * DNA share of the haplotype with more copies (0.5..1) and y the RNA share of
 * that same haplotype; with balanced DNA (|x - 0.5| < 0.02) the haplotype with
 * more RNA reads is used. Then y = x: follows dosage; y = 0.5: buffered;
 * y > x: imbalance beyond DNA (y ~ 1: monoallelic); y < 0.5: minority allele.
 */
export function foldShares(dna, rna) {
  if (!Number.isFinite(dna) || !Number.isFinite(rna)) return null;
  const flip = Math.abs(dna - 0.5) < 0.02 ? rna < 0.5 : dna < 0.5;
  return flip ? { x: 1 - dna, y: 1 - rna } : { x: dna, y: rna };
}

/** Genes for the genome-wide scatter (folded DNA vs RNA shares), flagged with their class. */
export function scatterGenes(ase) {
  return (ase?.genes || [])
    .map((g) => {
      const f = foldShares(g.dna, g.rna);
      return f && { gene: g.gene, ...f, reads: g.reads, cls: g.cls || "none", q: g.q, switch: Boolean(g.switch) };
    })
    .filter(Boolean);
}

/** Gene table rows filtered by a search string and class ("all" | "called" | a class key). */
export function filterGenes(genes, { query = "", cls = "called" } = {}) {
  const qq = `${query}`.trim().toUpperCase();
  return genes.filter((g) => {
    if (qq && !`${g.gene}`.toUpperCase().includes(qq)) return false;
    if (cls === "all") return true;
    if (cls === "called") return Boolean(g.cls) || Boolean(g.switch);
    if (cls === "switch") return Boolean(g.switch);
    return g.cls === cls;
  });
}

/** IGV view of a finding: per-cell RNA slices at its SNPs (cells with a slice, most reads first). */
export function aseIgvView(finding, ase, patientId, limit = 8) {
  if (!finding?.loci?.length || !ase) return null;
  const reads = ase.aseReads || {};
  const cells = geneCells(ase, finding.gene).sort((p, q) => q.n - p.n);
  const ids = cells.length ? cells.map((c) => c.rnaId) : finding.cells || [];
  const tracks = ids
    .filter((id) => reads[id])
    .slice(0, limit)
    .map((id) => ({ rna_id: id, bam: reads[id], patientId, label: id }));
  if (!tracks.length) return null;
  const locus = finding.loci[0];
  return { cellIds: [], rnaTracks: tracks, chromosome: locus.chromosome, position: locus.position, loci: finding.loci, window: 60, label: `${finding.gene} ASE` };
}

/** Number of a finding's cells with a read slice. */
export const aseSliceCount = (finding, ase) => (finding?.cells || []).filter((id) => ase?.aseReads?.[id]).length;

/** "62%" / "–". */
export const pctText = (v) => (Number.isFinite(v) ? `${Math.round(v * 100)}%` : "–");

/** q-value text: "q 3e-5" / "q 0.012" / "–". */
export function qText(q) {
  if (!Number.isFinite(q)) return "–";
  if (q < 1e-3) return `q ${q.toExponential(0)}`;
  return `q ${q.toPrecision(2)}`;
}

/** Headline counts of a patient's ASE file for the summary line. */
export function aseHeadline(ase) {
  const s = ase?.summary || {};
  const by = s.by_class || {};
  return {
    cells: s.n_cells || 0,
    genes: s.n_genes || 0,
    genesDna: s.n_genes_dna || 0,
    imbalanced: s.n_imbalanced_q05 || 0,
    beyond: (by.monoallelic || 0) + (by["minority-allele"] || 0) + (by["beyond-dna"] || 0),
    dosage: by.dosage || 0,
    buffered: by.buffered || 0,
    switches: s.n_switch || 0,
    readsPerCell: s.median_reads_per_cell || 0,
  };
}
