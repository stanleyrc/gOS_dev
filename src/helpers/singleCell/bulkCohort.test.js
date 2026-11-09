import { BULK_DATASET_ID, bulkDonorUrl, bulkLinkProblem, filterDonors, filterOptions, fmtPrevalence, sourceOf, summarizeSources } from "./bulkCohort";

const rows = [
  { donor: "D1", source: "TCGA/PCAWG", tumor_type: "GBM", ecdna_ggnome: true, ecdna_aa: true, origin: "simple", genes: ["EGFR", "CDK4"], egfrviii: true, location: "7:1-100", has_graph: true, has_coverage: true },
  { donor: "D2", source: "TCGA/PCAWG", tumor_type: "GBM", ecdna_ggnome: false, ecdna_aa: false, origin: null, genes: [], egfrviii: false, location: null, has_graph: true, has_coverage: false },
  { donor: "H1", source: "HMF", tumor_type: "GBM", ecdna_ggnome: true, ecdna_aa: null, origin: "fold-back", genes: ["EGFR"], egfrviii: false, location: "7:5-50", has_graph: true, has_coverage: true },
  { donor: "H2", source: "HMF", tumor_type: "LGG", ecdna_ggnome: false, ecdna_aa: null, origin: null, genes: [], egfrviii: false, location: null, has_graph: true, has_coverage: true },
];

test("TCGA and PCAWG share one source", () => {
  expect(sourceOf("TCGA")).toBe("TCGA/PCAWG");
  expect(sourceOf("PCAWG")).toBe("TCGA/PCAWG");
  expect(sourceOf("HMF")).toBe("HMF");
});

test("summaries count per source and tumor type", () => {
  const s = summarizeSources(rows, "GBM");
  expect(s.map((x) => x.source)).toEqual(["TCGA/PCAWG", "HMF"]);
  expect(s[0].n).toBe(2);
  expect(s[0].ggnome).toEqual({ n: 1, total: 2 });
  expect(s[0].aa).toEqual({ n: 1, total: 2 });
  expect(s[1].aa).toEqual({ n: 0, total: 0 });
  expect(s[0].egfrviii).toBe(1);
  expect(s[0].genes[0]).toEqual({ name: "CDK4", n: 1 });
  expect(s[0].withCoverage).toBe(1);
  expect(summarizeSources(rows, "LGG").map((x) => x.source)).toEqual(["HMF"]);
});

test("prevalence says not available without a caller", () => {
  expect(fmtPrevalence(1, 4)).toBe("1/4 (25.0%)");
  expect(fmtPrevalence(0, 0)).toMatch(/^not available/);
});

test("donor filter: search, origin, gene, ecDNA", () => {
  const t = rows.slice(0, 2);
  expect(filterDonors(t, { query: "d1" }).map((r) => r.donor)).toEqual(["D1"]);
  expect(filterDonors(t, { query: "cdk4" }).map((r) => r.donor)).toEqual(["D1"]);
  expect(filterDonors(t, { origin: "simple" }).length).toBe(1);
  expect(filterDonors(t, { gene: "EGFR" }).length).toBe(1);
  expect(filterDonors(t, { ecdna: "no" }).map((r) => r.donor)).toEqual(["D2"]);
  expect(filterDonors(t, {}).length).toBe(2);
  expect(filterOptions(t).genes.map((g) => g.name).sort()).toEqual(["CDK4", "EGFR"]);
});

test("donor URL opens the Genome View with the amplicon", () => {
  const u = new URL(bulkDonorUrl("https://x.org/p/gOS_dev/?dataset=gbm-sc&report=MGH285&tab=7#z", BULK_DATASET_ID, "CA-0012", "7:1-100"));
  expect(u.pathname).toBe("/p/gOS_dev/");
  expect(u.searchParams.get("dataset")).toBe("gbm-bulk");
  expect(u.searchParams.get("report")).toBe("CA-0012");
  expect(u.searchParams.get("tab")).toBe("2");
  expect(u.searchParams.get("location")).toBe("7:1-100");
  expect(new URL(bulkDonorUrl("https://x.org/", "gbm-bulk", "D2", null)).searchParams.has("location")).toBe(false);
});

test("link problem is reported when the dataset is missing", () => {
  expect(bulkLinkProblem([{ id: "gbm-sc" }])).toMatch(/not configured/);
  expect(bulkLinkProblem([{ id: "gbm-bulk" }])).toBeNull();
});
