// Per-cell germline het-SNP track helpers (d3-free). A cell's hetsnps.arrow holds one point per
// germline het site (BAF = alt / depth); hetblocks.json aggregates the same sites per allelic-CN
// segment as a phase-agnostic minor-allele fraction (MAF) with a likelihood interval.

export const HET_MODES = ["snps", "blocks"];
export const HET_BLOCK_COLORS = { maf: "#08306BCC", ci: "#6BAED680", expected: "#E6550DCC" };

/** "?hets=blocks" selects the block view; anything else is the SNP scatter. */
export function parseHetMode(value) {
  return value === "blocks" ? "blocks" : "snps";
}

/** The per-cell files to fetch for the visible tracks: het SNPs become het blocks in block mode. */
export function effectiveTracks(visibleTracks, hetMode) {
  return (visibleTracks || []).map((track) => (track === "hetsnps" && hetMode === "blocks" ? "hetblocks" : track));
}

/** The track key under which a visible track is stored in perCell. */
export function storedTrack(track, hetMode) {
  return track === "hetsnps" && hetMode === "blocks" ? "hetblocks" : track;
}

const finite = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * hetblocks.json -> genome graph (allelic.json shape: intervals with chromosome / startPoint /
 * endPoint / y). Per block with an estimate: the MAF segment, its interval ends (CI) as lighter
 * segments, and the MAF expected from the allelic CN (minor / (major + minor)) as an overlay.
 */
export function hetBlocksToGraph(raw) {
  const blocks = (raw && raw.blocks) || [];
  const intervals = [];
  let iid = 1;
  const add = (b, y, color, title) => {
    intervals.push({
      chromosome: String(b.chr),
      startPoint: b.start,
      endPoint: b.end,
      iid: iid++,
      y,
      annotation: "",
      title,
      type: "interval",
      strand: "*",
      metadata: { color },
    });
  };
  blocks.forEach((b) => {
    if (finite(b.expected_maf)) add(b, b.expected_maf, HET_BLOCK_COLORS.expected, `expected ${b.expected_maf.toFixed(2)} (CN ${b.major_cn}+${b.minor_cn})`);
    if (!finite(b.maf)) return;
    if (finite(b.maf_lo)) add(b, b.maf_lo, HET_BLOCK_COLORS.ci, `lower ${b.maf_lo.toFixed(2)}`);
    if (finite(b.maf_hi)) add(b, b.maf_hi, HET_BLOCK_COLORS.ci, `upper ${b.maf_hi.toFixed(2)}`);
    add(b, b.maf, HET_BLOCK_COLORS.maf, `MAF ${b.maf.toFixed(2)} (${b.n_snps_d2} SNPs)`);
  });
  return { settings: { y_axis: { title: "minor allele fraction", visible: true }, "y.axis": "maf" }, intervals, connections: [] };
}

/** Blocks that carry an estimate, and how many of them are imbalanced (lower CI end above `cut`). */
export function hetBlockSummary(raw, cut = 0.05) {
  const blocks = (raw && raw.blocks) || [];
  const est = blocks.filter((b) => finite(b.maf));
  return { blocks: blocks.length, estimated: est.length, imbalanced: est.filter((b) => finite(b.maf_hi) && b.maf_hi < 0.5 - cut).length };
}
