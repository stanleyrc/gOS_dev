// Per-cell RNA fusions (data/<patient>/rna/fusions.json, format
// "gos-sc-rna-fusions/1": STAR chimeric alignments + Arriba run per cell in
// the back end) and their link to the DNA fusion events. d3-free so it can
// be unit tested.

export const FUSIONS_FORMAT = "gos-sc-rna-fusions/1";
export const CONFIDENCE_RANK = { high: 3, medium: 2, low: 1 };
const confidenceRank = (c) => CONFIDENCE_RANK[`${c || ""}`.toLowerCase()] || 0;

/** "chr7" / "7" -> "7" (for comparing). */
export const bareChrom = (c) => `${c ?? ""}`.replace(/^chr/i, "");
/** "7" -> "chr7" (the per-cell BAM slices are chr-prefixed hg38). */
export const chrName = (c) => (`${c}`.startsWith("chr") ? `${c}` : `chr${c}`);

/** "chr7:55211628" -> { chromosome: "chr7", position: 55211628 } (null when unparseable). */
export function parseBreakpoint(text) {
  const m = `${text || ""}`.match(/^\s*([\w.]+):(\d+)/);
  return m ? { chromosome: m[1], position: Number(m[2]) } : null;
}

// Renamed HGNC symbols that differ between the DNA (older annotation) and the
// RNA (GENCODE) callers.
const ALIASES = { SEPT14: "SEPTIN14", SEPT7: "SEPTIN7", SEPT9: "SEPTIN9", C1orf112: "FIRRM" };
/** Canonical gene symbol: upper case, Arriba's "(distance)" suffix dropped, renamed symbols mapped. */
export function canonicalGene(g) {
  const s = `${g || ""}`.replace(/\(.*?\)/g, "").trim();
  if (!s || s === ".") return "";
  const sept = s.match(/^SEPT(\d+)$/i);
  if (sept) return `SEPTIN${sept[1]}`;
  return (ALIASES[s] || s).toUpperCase();
}
/** Arriba lists several genes for intergenic breakpoints ("A(123),B(456)"): all of them. */
export const geneList = (g) => `${g || ""}`.split(/[,;/]/).map(canonicalGene).filter(Boolean);

/** Total reads of one cell's call. */
export const cellReads = (c) => (Number(c?.split1) || 0) + (Number(c?.split2) || 0) + (Number(c?.discordant) || 0);
/** Total reads of a fusion. */
export const fusionReads = (f) => (Number(f?.split_reads) || 0) + (Number(f?.discordant_mates) || 0);
export const isReadThrough = (f) => /read-?through/i.test(`${f?.type || ""}`);
/** 5'-5' / 3'-3' orientation: cannot make a productive transcript (shown de-emphasised). */
export const isNonProductive = (f) => /5'-5'|3'-3'/.test(`${f?.type || ""}`);
/** Display name of an Arriba gene field: the first gene ("A(123),B(45)" -> "A"); `rest` the others, for a tooltip. */
export function geneDisplay(g) {
  const parts = `${g || ""}`.split(",").map((p) => p.trim()).filter(Boolean);
  const first = (parts[0] || "?").replace(/\(.*?\)/g, "");
  return { name: first, rest: parts.slice(1), full: `${g || ""}`, intergenic: /\(\d+\)/.test(`${g || ""}`) };
}

/** Validated, normalised fusions.json (missing fields filled, cells sorted by reads). */
export function normalizeFusions(json) {
  if (!json || !Array.isArray(json.fusions)) throw new Error("fusions.json: no fusions array");
  const fusions = json.fusions.map((f, k) => {
    const cells = (Array.isArray(f.cells) ? f.cells : [])
      .map((c) => ({
        ...c,
        rna_id: `${c.rna_id}`,
        cell_id: c.cell_id == null || c.cell_id === "" ? null : `${c.cell_id}`,
        reads: cellReads(c),
      }))
      .sort((a, b) => b.reads - a.reads || confidenceRank(b.confidence) - confidenceRank(a.confidence) || a.rna_id.localeCompare(b.rna_id));
    const base = {
      ...f,
      id: f.id || `${f.gene1}::${f.gene2}|${f.breakpoint1}|${f.breakpoint2}|${k}`,
      label: `${geneDisplay(f.gene1).name}::${geneDisplay(f.gene2).name}`,
      known: Boolean(f.known),
      tier_reasons: Array.isArray(f.tier_reasons) ? f.tier_reasons : [],
      cancer_genes: Array.isArray(f.cancer_genes) ? f.cancer_genes : [],
      recurrence: Array.isArray(f.recurrence) ? f.recurrence : [],
      cells,
      n_cells: Number.isFinite(f.n_cells) ? f.n_cells : cells.length,
      n_cells_dna: Number.isFinite(f.n_cells_dna) ? f.n_cells_dna : cells.filter((c) => c.cell_id).length,
      reads: fusionReads(f) || cells.reduce((s, c) => s + c.reads, 0),
      bp1: parseBreakpoint(f.breakpoint1),
      bp2: parseBreakpoint(f.breakpoint2),
    };
    return { ...base, tier: fusionTier(base) };
  });
  return { patient: json.patient || null, nCellsRna: Number(json.n_cells_rna) || null, fusions };
}

/**
 * Tier of a fusion: the back end's (1 known / actionable driver, 2 cancer-gene
 * fusion with evidence, 3 other; see sc_rna_fusion_tier in skilift), or for
 * older files without it a coarse stand-in: known or in-frame DNA-matched
 * productive fusions 2, everything else 3.
 */
export function fusionTier(f) {
  const t = Number(f?.tier);
  if (Number.isFinite(t) && t >= 1 && t <= 3) return t;
  const productive = !isReadThrough(f) && !isNonProductive(f);
  return productive && (f?.known || (f?.dna_match && f?.reading_frame === "in-frame")) ? 2 : 3;
}

/** Fusions passing the table filters. `maxTier`: keep tiers <= maxTier (3 = all). */
export function filterFusions(fusions, { minCells = 1, confidence = "low", hideReadThrough = false, query = "", keepDnaMatched = false, knownOnly = false, maxTier = 3 } = {}) {
  const minRank = confidenceRank(confidence);
  const q = `${query || ""}`.trim().toUpperCase();
  return (fusions || []).filter(
    (f) =>
      ((f.n_cells || 0) >= minCells || (keepDnaMatched && Boolean(f.dna_match))) &&
      (!knownOnly || f.known) &&
      fusionTier(f) <= maxTier &&
      confidenceRank(f.confidence) >= minRank &&
      !(hideReadThrough && isReadThrough(f)) &&
      (!q || `${f.gene1}::${f.gene2}`.toUpperCase().includes(q) || `${f.label || ""}`.toUpperCase().includes(q))
  );
}

/** The two genes of a DNA fusion event ("A::B" in fusion_genes or gene), canonical; null if not a fusion. */
export function dnaFusionGenes(record) {
  if (!record) return null;
  const text = `${record.fusion_genes || ""}`.includes("::") ? record.fusion_genes : record.gene;
  const parts = `${text || ""}`.split("::");
  if (parts.length !== 2) return null;
  const [a, b] = parts.map(canonicalGene);
  return a && b ? [a, b] : null;
}
export const isDnaFusionEvent = (record) => Boolean(dnaFusionGenes(record)) && (/fusion/i.test(`${record?.vartype || ""} ${record?.type || ""}`) || `${record?.gene || ""}`.includes("::"));

const pairKey = (a, b) => [a, b].sort().join("::");

/**
 * RNA fusions supporting a DNA fusion event: same gene pair in either order
 * (any gene Arriba lists at a breakpoint), or the back end's dna_match naming
 * the event's gene pair. Best first (cells, then reads).
 */
export function matchRnaFusions(record, fusions) {
  const genes = dnaFusionGenes(record);
  if (!genes || !fusions?.length) return [];
  const key = pairKey(genes[0], genes[1]);
  return fusions
    .filter((f) => {
      const g1 = geneList(f.gene1);
      const g2 = geneList(f.gene2);
      if (g1.some((a) => g2.some((b) => pairKey(a, b) === key))) return true;
      const ev = dnaFusionGenes({ gene: f.dna_match?.event_gene });
      return Boolean(ev && pairKey(ev[0], ev[1]) === key);
    })
    .sort((a, b) => (b.n_cells || 0) - (a.n_cells || 0) || (b.reads || 0) - (a.reads || 0));
}

/** The DNA fusion event matching an RNA fusion (gene pair either order, or dna_match.event_gene). */
export function matchDnaEvent(fusion, events) {
  return (events || []).find((e) => isDnaFusionEvent(e) && matchRnaFusions(e, [fusion]).length > 0) || null;
}

/**
 * rna_id <-> cell_id from the fusion calls and rna/cells.json (either may be
 * missing). Returns { cellOf: Map(rna_id -> cell_id), rnaOf: Map(cell_id -> rna_id) }.
 */
export function rnaCellMaps(fusions = [], rnaCells = [], cellMap = null) {
  const cellOf = new Map();
  const add = (rna, cell) => {
    if (rna == null || cell == null || cell === "") return;
    cellOf.set(`${rna}`, `${cell}`);
  };
  (rnaCells || []).forEach((c) => add(c.rna_id, c.cell_id));
  Object.entries(cellMap || {}).forEach(([r, c]) => add(r, c));
  (fusions || []).forEach((f) => (f.cells || []).forEach((c) => add(c.rna_id, c.cell_id)));
  const rnaOf = new Map();
  cellOf.forEach((cell, rna) => {
    if (!rnaOf.has(cell)) rnaOf.set(cell, rna);
  });
  return { cellOf, rnaOf };
}

/**
 * Read support of one fusion along the tree's tip order, for the mini strip:
 * values[k] = reads in the RNA of order[k] (0: RNA present, no reads; -1: no
 * RNA for that cell), plus the supporting RNA-only cells (not on the tree).
 */
export function fusionStrip(fusion, order, rnaOfCell) {
  const byCell = new Map();
  const rnaOnly = [];
  (fusion?.cells || []).forEach((c) => {
    if (c.cell_id) byCell.set(c.cell_id, c.reads ?? cellReads(c));
    else rnaOnly.push(c.reads ?? cellReads(c));
  });
  const values = new Float32Array(order.length);
  let max = 0;
  let onTree = 0;
  order.forEach((id, k) => {
    if (byCell.has(id)) {
      values[k] = byCell.get(id);
      max = Math.max(max, values[k]);
      onTree += 1;
    } else values[k] = rnaOfCell && !rnaOfCell.has(id) ? -1 : 0;
  });
  rnaOnly.forEach((v) => (max = Math.max(max, v)));
  return { values, rnaOnly, max, onTree, offTree: byCell.size - onTree };
}

/** IGV loci of both breakpoints (for a multi-locus view), skipping unparseable ones. */
export function fusionLoci(fusion) {
  return [fusion?.bp1 || parseBreakpoint(fusion?.breakpoint1), fusion?.bp2 || parseBreakpoint(fusion?.breakpoint2)].filter(Boolean);
}

/** Default RNA cells for IGV: the `limit` best supported, preferring cells also in `prefer` (e.g. the DNA cells shown). */
export function defaultRnaCells(fusion, limit = 6, prefer = []) {
  const want = new Set(prefer || []);
  const cells = [...(fusion?.cells || [])].filter((c) => c.bam);
  cells.sort((a, b) => Number(want.has(b.cell_id)) - Number(want.has(a.cell_id)) || (b.reads ?? cellReads(b)) - (a.reads ?? cellReads(a)));
  return cells.slice(0, limit).map((c) => c.rna_id);
}

/** Table order: tier (best first), then carrier cells, then reads. */
export const compareFusions = (a, b) => fusionTier(a) - fusionTier(b) || (b.n_cells || 0) - (a.n_cells || 0) || (b.reads || 0) - (a.reads || 0);

/**
 * One row per gene pair (as displayed, 5'::3'): breakpoint variants of the
 * same genes are collapsed under the best one (tier, then cells). Groups of
 * several variants get `variants` (best first; each a normal fusion) and
 * `children` (the others, for an expandable table row), the union of the
 * carrier cells (reads summed per cell), summed reads, the best tier /
 * confidence and any DNA match or known flag. Single variants are returned as is.
 */
export function groupFusions(fusions) {
  const groups = new Map();
  (fusions || []).forEach((f) => {
    const key = f.label || `${f.gene1}::${f.gene2}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  });
  const out = [];
  groups.forEach((variants, key) => {
    if (variants.length === 1) {
      out.push(variants[0]);
      return;
    }
    const sorted = [...variants].sort(compareFusions);
    const best = sorted[0];
    const byRna = new Map();
    sorted.forEach((v) =>
      (v.cells || []).forEach((c) => {
        const prev = byRna.get(c.rna_id);
        if (prev) prev.reads += c.reads ?? cellReads(c);
        else byRna.set(c.rna_id, { ...c, reads: c.reads ?? cellReads(c) });
      })
    );
    const cells = [...byRna.values()].sort((a, b) => b.reads - a.reads || a.rna_id.localeCompare(b.rna_id));
    out.push({
      ...best,
      id: `group:${key}`,
      group: true,
      variants: sorted,
      children: sorted.slice(1).map((v) => ({ ...v, variantOf: `group:${key}` })),
      cells,
      n_cells: cells.length,
      n_cells_dna: new Set(cells.filter((c) => c.cell_id).map((c) => c.cell_id)).size,
      reads: sorted.reduce((s, v) => s + (v.reads || 0), 0),
      tier: Math.min(...sorted.map(fusionTier)),
      confidence: sorted.reduce((b, v) => (confidenceRank(v.confidence) > confidenceRank(b) ? v.confidence : b), best.confidence),
      known: sorted.some((v) => v.known),
      dna_match: sorted.find((v) => v.dna_match)?.dna_match || null,
    });
  });
  return out;
}

/**
 * Pseudo DNA-event record of an RNA fusion for the per-cell plots (the DNA
 * event popup's Plots tab): both breakpoints as the location (bare
 * chromosome names, as the genome plots use) and the DNA cells of the RNA
 * carriers, best supported first, as the carriers.
 */
export function fusionPlotRecord(fusion) {
  const loci = fusionLoci(fusion);
  if (!fusion || !loci.length) return null;
  const cellIds = [];
  (fusion.cells || []).forEach((c) => c.cell_id && !cellIds.includes(c.cell_id) && cellIds.push(c.cell_id));
  return {
    uid: `rna:${fusion.id}`,
    gene: fusion.label,
    fusion_genes: fusion.label,
    vartype: "fusion",
    type: "RNA fusion",
    location: loci.map((l) => `${bareChrom(l.chromosome)}:${l.position}-${l.position}`).join("|"),
    fusion_gene_coords: loci.map((l) => `${bareChrom(l.chromosome)}:${l.position}`).join(","),
    cell_ids: cellIds.join(","),
  };
}

/** The carrier best suited for the per-cell plots: most reads among the carriers with a DNA cell (null if none). */
export const defaultPlotCell = (fusion) => (fusion?.cells || []).find((c) => c.cell_id)?.cell_id || null;

/** Arriba's retained protein domains, "a(100%),b(40%)|c(100%)", as [5' gene domains, 3' gene domains] of { name, pct }. */
export function parseDomains(text) {
  const sides = `${text || ""}`.split("|");
  const parse = (s) =>
    `${s || ""}`
      .split(",")
      .map((d) => d.trim())
      .filter((d) => d && d !== ".")
      .map((d) => {
        const m = d.match(/^(.*)\((\d+)%\)$/);
        return { name: (m ? m[1] : d).replace(/_/g, " "), pct: m ? Number(m[2]) : null };
      });
  return [parse(sides[0]), parse(sides[1])];
}

/**
 * Carriers of a fusion per DNA clone: for each clone, the carrier DNA cells,
 * the clone's cells that have RNA (`rnaOfCell`: cell_id -> rna_id) and the
 * fraction carrying it; RNA-only carriers are counted apart. Sorted by carriers.
 */
export function fusionCloneDistribution(fusion, cells = [], rnaOfCell = null) {
  const cloneOf = new Map((cells || []).map((c) => [c.cell_id, c.clone_id]));
  const withRna = new Map();
  (cells || []).forEach((c) => {
    if (rnaOfCell && !rnaOfCell.has(c.cell_id)) return;
    const k = `${c.clone_id}`;
    withRna.set(k, (withRna.get(k) || 0) + 1);
  });
  const carriers = new Map();
  let rnaOnly = 0;
  let unplaced = 0;
  (fusion?.cells || []).forEach((c) => {
    if (!c.cell_id) {
      rnaOnly += 1;
      return;
    }
    const clone = cloneOf.get(c.cell_id);
    if (clone == null) {
      unplaced += 1;
      return;
    }
    const k = `${clone}`;
    carriers.set(k, (carriers.get(k) || 0) + 1);
  });
  const clones = [...new Set([...carriers.keys(), ...withRna.keys()])].map((clone) => {
    const n = carriers.get(clone) || 0;
    const total = withRna.get(clone) || 0;
    return { clone, carriers: n, withRna: total, fraction: total ? n / total : null };
  });
  clones.sort((a, b) => b.carriers - a.carriers || (b.fraction ?? 0) - (a.fraction ?? 0) || `${a.clone}`.localeCompare(`${b.clone}`, undefined, { numeric: true }));
  return { clones, rnaOnly, unplaced };
}
