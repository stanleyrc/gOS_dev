// Bulk GBM cohort cards (d3-free). Reads _cohort/bulk_cohort.json written by srctools
// inst/analysis/bulk_comparisons/bc06_bulk_cards.R. One card per source; each card lists its donors.
// Row: { donor, source, tumor_type, ecdna_ggnome, ecdna_aa (true/false/null), origin, genes[], egfrviii,
//        location ("7:54000000-56000000", hg19), has_graph, has_coverage }.

export const BULK_DATASET_ID = "gbm-bulk";
export const SOURCE_ORDER = ["TCGA/PCAWG", "HMF", "CA", "IPM"];
export const SOURCE_LABEL = {
  "TCGA/PCAWG": "TCGA / PCAWG",
  HMF: "Hartwig (HMF)",
  CA: "NYGC Cancer Alliance (CA)",
  IPM: "WCM IPM",
};

/** Source key of a cohort dataset code (TCGA and PCAWG share one card). */
export function sourceOf(dataset) {
  return dataset === "TCGA" || dataset === "PCAWG" ? "TCGA/PCAWG" : `${dataset ?? ""}`;
}

const countBy = (items) => {
  const m = new Map();
  items.forEach((x) => m.set(x, (m.get(x) || 0) + 1));
  return [...m.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
};

/** "n/N (p%)" with the percentage to one decimal; "not available" when the caller has no calls. */
export function fmtPrevalence(n, total) {
  return total > 0 ? `${n}/${total} (${((100 * n) / total).toFixed(1)}%)` : "not available (no donors with this caller)";
}

/** Per-source summaries for one tumor type, in SOURCE_ORDER (sources with no donors are dropped). */
export function summarizeSources(rows, tumorType = "GBM") {
  const mine = (rows || []).filter((r) => r.tumor_type === tumorType);
  return SOURCE_ORDER.map((source) => {
    const rs = mine.filter((r) => r.source === source);
    if (!rs.length) return null;
    const aaRows = rs.filter((r) => r.ecdna_aa === true || r.ecdna_aa === false);
    return {
      source,
      label: SOURCE_LABEL[source] || source,
      tumorType,
      rows: rs,
      n: rs.length,
      ggnome: { n: rs.filter((r) => r.ecdna_ggnome).length, total: rs.length },
      aa: { n: aaRows.filter((r) => r.ecdna_aa).length, total: aaRows.length },
      origins: countBy(rs.filter((r) => r.origin).map((r) => r.origin)),
      genes: countBy(rs.flatMap((r) => r.genes || [])).slice(0, 8),
      egfrviii: rs.filter((r) => r.egfrviii).length,
      withGraph: rs.filter((r) => r.has_graph).length,
      withCoverage: rs.filter((r) => r.has_coverage).length,
    };
  }).filter(Boolean);
}

/** Donor rows matching the search text (donor id or gene), origin class, gene and ecDNA call ("any"/"yes"/"no"). */
export function filterDonors(rows, { query = "", origin = null, gene = null, ecdna = "any" } = {}) {
  const q = `${query}`.trim().toLowerCase();
  return (rows || []).filter((r) => {
    if (origin && r.origin !== origin) return false;
    if (gene && !(r.genes || []).includes(gene)) return false;
    if (ecdna === "yes" && !r.ecdna_ggnome) return false;
    if (ecdna === "no" && r.ecdna_ggnome) return false;
    if (!q) return true;
    return r.donor.toLowerCase().includes(q) || (r.genes || []).some((g) => g.toLowerCase().includes(q));
  });
}

/** Dropdown options (sorted by frequency) for the origin classes and genes of a source's rows. */
export function filterOptions(rows) {
  return {
    origins: countBy((rows || []).filter((r) => r.origin).map((r) => r.origin)),
    genes: countBy((rows || []).flatMap((r) => r.genes || [])),
  };
}

/** Genome View (tab 2) URL of a bulk donor, preselecting the amplicon region when it is known. */
export function bulkDonorUrl(href, datasetId, donor, location) {
  const url = new URL(href);
  const out = new URL(`${url.origin}${url.pathname}`);
  out.searchParams.set("dataset", `${datasetId}`);
  out.searchParams.set("report", `${donor}`);
  out.searchParams.set("tab", "2");
  if (location) out.searchParams.set("location", `${location}`);
  return out.toString();
}

/** Why the bulk view cannot link donors (null when it can). */
export function bulkLinkProblem(datasets) {
  return (datasets || []).some((d) => `${d.id}` === BULK_DATASET_ID) ? null : `dataset "${BULK_DATASET_ID}" is not configured on this site`;
}
