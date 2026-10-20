// CN-mapped SNVs: sites in copy-number-altered regions that the diploid tree-building filter drops, placed on the current tree by a
// copy-number-aware likelihood (srctools inst/analysis/cn_tree_mapping; exported by skilift gos_sc_snv_columnar.py as
// cn_mapped_snvs.sites.json + .cells.bin). They are shown as an opt-in layer (layout.snvCnMapped, URL cnmapped=1) and are never
// tree-building sites. d3-free.

export const CN_MAPPED_PARAM = "cnmapped";
export const CN_MAPPED_CATEGORY = "cn_mapped";

const pct = (x) => (x == null ? "n/a" : `${(100 * x).toFixed(1)}%`);

/** One-line state of the CN-mapped layer for the toggle label / tooltip. */
export function cnMappedSummary(cnMapped, on) {
  const st = cnMapped?.status || "idle";
  if (st === "missing") return { label: "not available", text: `CN-mapped sites: not available (${cnMapped.reason || "not exported for this patient"})`, disabled: true };
  if (st === "error") return { label: "error", text: `CN-mapped sites could not be loaded (${cnMapped.error?.message || "error"})`, disabled: true };
  if (st === "loading") return { label: "loading…", text: "Loading the CN-mapped sites (site table, then the per-cell reads in a background worker)", disabled: false };
  if (st !== "ok") return { label: on ? "loading…" : null, text: METHOD_TEXT, disabled: false };
  const n = cnMapped.data?.variants?.length || 0;
  const v = cnMapped.meta?.validation || {};
  const c = v.counts || {};
  const hold = v.holdout_normal_B || {};
  const mine = hold.cn_mapped_halfA_rule_after_read_qc || {};
  const tree = hold.tree_sites_clean_in_A || {};
  const cons = v.tree_site_consistency || {};
  const conf = cons.subclonal_confident_cn_placement || {};
  const by = c.by_status || {};
  const lines = [
    `${n} CN-mapped sites (${by.trunk || 0} trunk, ${by.subclonal || 0} subclonal; ${c.with_allele_loss || 0} with the mutant allele lost in an LOH clade).`,
    METHOD_TEXT,
    `Validation: normal hold-out alt rate ${pct(mine.rate)} (n = ${mine.n_informative ?? "n/a"}) vs ${pct(tree.rate)} for the tree sites; the same model places the diploid tree sites on their mapped branch in ${pct(conf.same_branch)} of confident placements.`,
  ];
  return { label: `${n}`, text: lines.join(" "), disabled: false };
}

export const METHOD_TEXT =
  "Sites in copy-number-altered regions (the tree is built from diploid sites only) placed on the current tree by a copy-number-aware likelihood: " +
  "expected per-cell VAF = mutant copies / total CN (one copy, or every copy of the major allele), PTA dropout, loss of the mutant allele allowed in LOH clades; " +
  "0 alt reads in normal cells and read-level QC (MAPQ, BQ, strand, read end, split reads, same allele in other patients). Not used to build the tree.";

/** Branch drawer / site drawer rows for a CN-mapped variant record (cellFiles snvVariantRecords). */
export function cnMappedRows(v) {
  if (!v?.cnMapped) return [];
  const rows = [
    ["Set", "CN-mapped (copy-number-altered region; not a tree-building site)"],
    ["Placement", `${v.cnStatus || "branch"}; posterior ${v.posterior ?? "n/a"} (${v.confidence || "n/a"})`],
    ["Multiplicity", v.multiplicity || "n/a"],
    ["Copy number", v.modalCn != null ? `modal CN ${v.modalCn}${v.cnCounts ? ` (cells by CN ${v.cnCounts})` : ""}` : "n/a"],
  ];
  if (v.lostIn) rows.push(["Allele lost in", `${v.lostIn} (${v.lostCells ?? "?"} cells, LOH)`]);
  if (v.dIid != null) rows.push(["Tree structure", `ΔlogL vs no tree structure ${v.dIid}`]);
  if (v.normalReads != null) rows.push(["Normal cells", `${v.normalReads} reads, 0 alt`]);
  if (v.altMapq != null) rows.push(["Alt reads", `mean MAPQ ${v.altMapq}`]);
  return rows;
}
