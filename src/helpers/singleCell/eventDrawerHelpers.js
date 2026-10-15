// d3-free helpers of the cohort event drawer: which carrier cells to open in
// IGV for a point mutation, and which genes get a gene card.

const stripChr = (c) => `${c ?? ""}`.replace(/^chr/i, "");
const isNormal = (clone) => /normal/i.test(`${clone ?? ""}`);

/** "8:47819400-47819400 A>G" | "chr8_47819400_A_G" -> { chromosome, position, ref, alt } (ref/alt "" when absent) or null. */
export function parseSite(text) {
  const m = `${text ?? ""}`.match(/^(?:chr)?([^_:\s]+)[_:](\d+)(?:-\d+)?(?:[\s_]+([ACGTN*-]+)[>_]([ACGTN*-]+))?/i);
  return m ? { chromosome: m[1], position: Number(m[2]), ref: (m[3] || "").toUpperCase(), alt: (m[4] || "").toUpperCase() } : null;
}

/** Index of the snv_matrix variant at the event's site (and alleles when both are known), or -1. */
export function findVariantIndex(variants, site) {
  if (!site || !Array.isArray(variants)) return -1;
  let loose = -1;
  for (let i = 0; i < variants.length; i += 1) {
    const m = `${variants[i]?.id ?? ""}`.match(/^(?:chr)?([^_:]+)[_:](\d+)[_:]([A-Za-z*-]+)[_>:]([A-Za-z*-]+)$/i);
    if (!m || stripChr(m[1]) !== stripChr(site.chromosome) || Number(m[2]) !== site.position) continue;
    if (!site.ref || (m[3].toUpperCase() === site.ref && m[4].toUpperCase() === site.alt)) return i;
    if (loose < 0) loose = i;
  }
  return loose;
}

/**
 * Carrier cells to show in IGV. Point mutations: carriers with alt reads at
 * the site in the patient's SNV matrix (packed { idx, vaf } per cell, vaf
 * 0..250), tumour cells first and highest VAF first. Without a matrix or a
 * match: the first tumour carriers, flagged as unverified.
 * Returns { cells, basis: "alt-reads" | "carriers", reason? }.
 */
export function pickIgvCells({ site, variants, snvCells, carriers = [], cloneOf = new Map(), max = 2 }) {
  const tumour = carriers.filter((id) => !isNormal(cloneOf.get(id)));
  const pool = tumour.length ? tumour : carriers;
  const fallback = (reason) => ({ cells: pool.slice(0, max), basis: "carriers", reason });
  if (!site || !site.ref) return fallback("not a point mutation");
  if (!snvCells || !variants) return fallback("SNV matrix not available");
  const vi = findVariantIndex(variants, site);
  if (vi < 0) return fallback("site not in the SNV matrix");
  const scored = pool
    .map((id, order) => {
      const p = snvCells[id];
      if (!p) return null;
      const k = Array.prototype.indexOf.call(p.idx, vi);
      return k >= 0 && p.vaf[k] > 0 ? { id, vaf: p.vaf[k], order } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.vaf - a.vaf || a.order - b.order);
  if (!scored.length) return fallback("no carrier has alt reads in the SNV matrix");
  return { cells: scored.slice(0, max).map((s) => s.id), basis: "alt-reads" };
}

/** Genes to show cards for: fusions both partners, otherwise the event's gene; [] when none. */
export function eventGenes(event) {
  if (!event) return [];
  const raw = `${event.fusion_genes || ""}` || `${event.gene || ""}`;
  const names = raw
    .replace(/^upstream of\s+/i, "")
    .split(/::|,|;|\/|\s+/)
    .map((s) => s.trim())
    .filter((s) => s && s !== "None" && s !== "NA");
  return [...new Set(names)].slice(0, 4);
}
