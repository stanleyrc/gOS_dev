// igv.js track configs for the single-cell read views: per-cell DNA BAM
// slices (data/<cell_id>/reads.bam) and per-cell RNA slices around fusion
// breakpoints (data/<patient>/rna/reads/<rna_id>.bam, reads supporting a
// fusion tagged ZF:i:1). d3- and igv-free so it can be unit tested.

export const DNA_READS_FILE = "reads.bam";
export const RNA_FUSION_TAG = "ZF";
export const RNA_TRACK_PREFIX = "RNA · ";

const chr = (c) => (`${c}`.startsWith("chr") ? `${c}` : `chr${c}`);

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
export function buildIgvTracks({ dnaCellIds = [], rnaTracks = [], pathFor, sortAt = null, dnaHeight = 260, rnaHeight = 200 }) {
  const sort = sortAt && Number.isFinite(sortAt.position) ? { chr: chr(sortAt.chromosome), position: sortAt.position, option: "BASE", direction: "ASC" } : undefined;
  const dna = dnaCellIds.map((cellId) => ({
    id: cellId,
    name: cellId,
    url: pathFor(cellId, DNA_READS_FILE),
    indexURL: pathFor(cellId, `${DNA_READS_FILE}.bai`),
    format: "bam",
    type: "alignment",
    height: dnaHeight,
    ...(sort ? { sort } : {}),
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
