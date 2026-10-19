// igv.js track configs for the single-cell read views: per-cell DNA BAM
// slices (data/<cell_id>/reads.bam) and per-cell RNA slices around fusion
// breakpoints (data/<patient>/rna/reads/<rna_id>.bam, reads supporting a
// fusion tagged ZF:i:1). d3- and igv-free so it can be unit tested.

export const DNA_READS_FILE = "reads.bam";
export const RNA_FUSION_TAG = "ZF";
export const RNA_TRACK_PREFIX = "RNA · ";

const chr = (c) => (`${c}`.startsWith("chr") ? `${c}` : `chr${c}`);

/**
 * igv.js alignment-track sort that puts reads carrying a non-reference base at
 * the variant on top. igv.js scores each read at the position (reference base
 * +4, a mismatch -(count of that mismatch base at the site), a deletion
 * -(deletion count)) and direction "ASC" sorts ascending, so the most common
 * mismatch (the alt allele) comes first. "DESC" would put the reference
 * reads first, the alt reads last. Always a fresh object: igv.js mutates the
 * options it is given (position is made 0-based), so tracks must not share one.
 */
export function altFirstSort(chromosome, position) {
  if (chromosome == null || !Number.isFinite(Number(position))) return undefined;
  return { chr: chr(chromosome), position: Number(position), option: "BASE", direction: "ASC" };
}

/** Re-sort every loaded DNA alignment track of an igv browser at a site (RNA slices are skipped: igv.js throws sorting spliced reads). */
export function sortBrowserAltFirst(browser, chromosome, position) {
  if (!browser || !browser.findTracks) return 0;
  let n = 0;
  browser.findTracks("type", "alignment").forEach((tr) => {
    if (isRnaTrackName(tr.name)) return;
    const sort = altFirstSort(chromosome, position);
    if (!sort || typeof tr.sort !== "function") return;
    try {
      tr.sort(sort);
      n += 1;
    } catch (e) {
      // track not rendered yet: its initial sort applies on load
    }
  });
  return n;
}

/** Track name (igv.js removes tracks by name, so it doubles as the id) of a cell's RNA slice. */
export const rnaTrackName = (rnaId) => `${RNA_TRACK_PREFIX}${rnaId}`;
export const isRnaTrackName = (name) => `${name || ""}`.startsWith(RNA_TRACK_PREFIX);

/**
 * Track configs for IGV. `pathFor(folder, file)` turns a case folder and a
 * file into a URL (casePath of the dataset). dnaCellIds: cell folders with
 * reads.bam; rnaTracks: [{ rna_id, bam, patientId, label? }] with bam
 * relative to the patient folder. RNA reads are grouped and coloured by the
 * ZF tag so the fusion-supporting reads (ZF:1) form their own block.
 */
export function buildIgvTracks({ dnaCellIds = [], rnaTracks = [], pooled = null, pathFor, sortAt = null, dnaHeight = 260, rnaHeight = 200, labelFor = null }) {
  // pooled: { patientId, file } = the patient's pooled slice BAM (read group = cell id), used when the
  // per-cell reads.bam does not cover the site (see siteHasCellReads). One track per cell, filtered by RG.
  const dna = dnaCellIds.map((cellId) => (pooled ? {
    id: cellId,
    name: labelFor ? `${labelFor(cellId)}` : cellId,
    url: pathFor(pooled.patientId, pooled.file),
    indexURL: pathFor(pooled.patientId, `${pooled.file}.bai`),
    format: "bam",
    type: "alignment",
    height: dnaHeight,
    filter: (al) => al.tags().RG === cellId,
    ...(sortAt ? { sort: altFirstSort(sortAt.chromosome, sortAt.position) } : {}),
  } : {
    id: cellId, // the pair id stays the key (folder, de-duplication); only the shown name follows labelFor
    name: labelFor ? `${labelFor(cellId)}` : cellId,
    url: pathFor(cellId, DNA_READS_FILE),
    indexURL: pathFor(cellId, `${DNA_READS_FILE}.bai`),
    format: "bam",
    type: "alignment",
    height: dnaHeight,
    ...(sortAt ? { sort: altFirstSort(sortAt.chromosome, sortAt.position) } : {}),
  }));
  const rna = rnaTracks
    .filter((r) => r && r.bam && r.patientId)
    .map((r) => {
      const name = rnaTrackName(r.label || r.rna_id);
      return {
        id: name,
        name,
        url: pathFor(r.patientId, r.bam),
        indexURL: pathFor(r.patientId, `${r.bam}.bai`),
        format: "bam",
        type: "alignment",
        height: rnaHeight,
        // spliced RNA reads: show junctions, group / colour by the fusion tag. No base sort:
        // igv.js throws ("reading 'del'") sorting spliced / chimeric RNA reads at a breakpoint.
        groupBy: `tag:${RNA_FUSION_TAG}`,
        colorBy: `tag:${RNA_FUSION_TAG}`,
        showSoftClips: true,
      };
    });
  return [...dna, ...rna];
}

export const POOLED_DRIVER_BAM = "slices/drivers.dna.bam";

/**
 * Per-cell reads.bam only holds slices around the SNV-matrix sites (and SV junctions). A driver event that is
 * not a matrix site (e.g. a tier 2 hotspot rescued after the site filter) has no reads there; its reads are in
 * the patient's pooled slices/drivers.dna.bam. `variants` = snv_matrix variants ({ id: "chr17_7675088_C_T" }).
 */
export function siteHasCellReads(variants, chromosome, position) {
  const c = `${chromosome}`.replace(/^chr/i, "");
  return (variants || []).some((v) => {
    const a = `${v.id}`.split("_");
    return a.length >= 2 && a[0].replace(/^chr/i, "") === c && Number(a[1]) === Number(position);
  });
}

/** Space-separated multi-locus string, `window` bp either side of each locus. */
export function lociString(loci, window = 60) {
  return (loci || [])
    .filter((l) => l && Number.isFinite(l.position))
    .map((l) => `${chr(l.chromosome)}:${Math.max(1, l.position - window)}-${l.position + window}`)
    .join(" ");
}

/** Loci of `a` then those of `b` not within `tolerance` bp of one already listed (same chromosome, chr-insensitive). */
export function mergeLoci(a = [], b = [], tolerance = 200) {
  const bare = (c) => `${c}`.replace(/^chr/i, "");
  const out = [];
  [...a, ...b].forEach((l) => {
    if (!l || !Number.isFinite(l.position)) return;
    if (!out.some((o) => bare(o.chromosome) === bare(l.chromosome) && Math.abs(o.position - l.position) <= tolerance)) out.push(l);
  });
  return out;
}
