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
    return {
      ...f,
      id: f.id || `${f.gene1}::${f.gene2}|${f.breakpoint1}|${f.breakpoint2}|${k}`,
      label: `${f.gene1 || "?"}::${f.gene2 || "?"}`,
      cells,
      n_cells: Number.isFinite(f.n_cells) ? f.n_cells : cells.length,
      n_cells_dna: Number.isFinite(f.n_cells_dna) ? f.n_cells_dna : cells.filter((c) => c.cell_id).length,
      reads: fusionReads(f) || cells.reduce((s, c) => s + c.reads, 0),
      bp1: parseBreakpoint(f.breakpoint1),
      bp2: parseBreakpoint(f.breakpoint2),
    };
  });
  return { patient: json.patient || null, nCellsRna: Number(json.n_cells_rna) || null, fusions };
}

/** Fusions passing the table filters. */
export function filterFusions(fusions, { minCells = 1, confidence = "low", hideReadThrough = false, query = "" } = {}) {
  const minRank = confidenceRank(confidence);
  const q = `${query || ""}`.trim().toUpperCase();
  return (fusions || []).filter(
    (f) =>
      (f.n_cells || 0) >= minCells &&
      confidenceRank(f.confidence) >= minRank &&
      !(hideReadThrough && isReadThrough(f)) &&
      (!q || `${f.gene1}::${f.gene2}`.toUpperCase().includes(q))
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
