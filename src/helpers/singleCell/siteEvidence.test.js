import {
  annotateSite,
  cloneLanes,
  cohortBackground,
  decodeReads,
  evidenceLinkQuery,
  findingsByGene,
  recordGenes,
  fmtLog10P,
  log10BinomLower,
  log10BinomUpper,
  log10FisherGreater,
  log10StrandImbalance,
  pooledCounts,
  rankFindings,
  readEvidenceLink,
  readPasses,
  siteCells,
  siteStats,
  siteVerdict,
} from "./siteEvidence";

const TERT = "chr5:1295113:G>A";
const C250 = "chr5:1295135:G>A";
const AMP = "chr7:55203155:G>C";

// 10 tumour cells (2 clones) + 3 normals
const cells = ["a1", "a2", "a3", "a4", "a5", "b1", "b2", "b3", "b4", "b5", "n1", "n2", "n3"];
const clone = ["Clone 2", "Clone 2", "Clone 2", "Clone 2", "Clone 2", "Clone 6", "Clone 6", "Clone 6", "Clone 6", "Clone 6", "Normal", "Normal", "Normal"];
const calls = {
  cells,
  clone,
  sites: [
    { id: TERT, chrom: "chr5", pos: 1295113, ref: "G", alt: "A", name: "TERT C228T", gene: "TERT", hotspot: true, alt_tumor: 6, dp_tumor: 8, cells_alt: 6, cells_cov: 8, alt_normal: 0, dp_normal: 3, error: 0.001 },
    { id: C250, chrom: "chr5", pos: 1295135, ref: "G", alt: "A", name: "TERT C250T", gene: "TERT", hotspot: true, alt_tumor: 0, dp_tumor: 9, cells_alt: 0, cells_cov: 8, alt_normal: 0, dp_normal: 3, error: 0.001 },
    { id: AMP, chrom: "chr7", pos: 55203155, ref: "G", alt: "C", alt_tumor: 40, dp_tumor: 1000, cells_alt: 9, cells_cov: 10, alt_normal: 6, dp_normal: 120, error: 0.04 },
  ],
  dna: {
    [TERT]: {
      alt: [1, 1, 0, 1, 0, 1, 1, 1, 0, 0, 0, 0, 0],
      dp: [1, 1, 0, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1],
      call: ["mut", "mut", "nc", "mut", "nc", "mut", "mut", "mut", "nc", "nc", "nc", "nc", "nc"],
    },
    [C250]: { alt: Array(13).fill(0), dp: [1, 1, 1, 1, 1, 1, 2, 1, 0, 0, 1, 1, 1], call: Array(13).fill("nc") },
    [AMP]: { alt: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 2, 2, 2], dp: Array(13).fill(100), call: Array(13).fill("nc") },
  },
};
const evidence = {
  sites: {
    [TERT]: {
      n_reads: 14,
      n_dup: 1,
      n_lowmq: 0,
      n_unassigned: 0,
      presets: {
        caller: {
          tumor: { alt_f: 3, alt_r: 3, ref_f: 1, ref_r: 1, other: 0, del: 0, cells_alt: 6, cells_cov: 8 },
          normal: { alt_f: 0, alt_r: 0, ref_f: 2, ref_r: 1, other: 0, del: 0, cells_alt: 0, cells_cov: 3 },
          bq_alt: 34,
          bq_ref: 35,
          end_alt: 40,
          end_ref: 38,
        },
      },
      cohort: [
        { patient: "P2", alt_tumor: 20, dp_tumor: 30, n_mut: 15, alt_normal: 0, dp_normal: 0 },
        { patient: "P3", alt_tumor: 1, dp_tumor: 30, n_mut: 1, alt_normal: 0, dp_normal: 2 },
      ],
      reads: { cols: ["cell", "allele", "bq", "mq", "rev", "dup", "flags", "end", "nm"], rows: [[0, "A", 34, 60, 1, 0, "", 40, 2], [10, "R", 35, 60, 0, 1, "", 30, 1]] },
    },
    [AMP]: {
      presets: {
        caller: {
          tumor: { alt_f: 40, alt_r: 0, ref_f: 480, ref_r: 480, other: 0, del: 0, cells_alt: 9, cells_cov: 10 },
          normal: { alt_f: 6, alt_r: 0, ref_f: 57, ref_r: 57, other: 0, del: 0, cells_alt: 3, cells_cov: 3 },
          bq_alt: 20,
          bq_ref: 36,
          end_alt: 3,
          end_ref: 50,
        },
      },
      cohort: [],
    },
  },
};

describe("statistics", () => {
  test("binomial upper tail", () => {
    expect(log10BinomUpper(0, 10, 0.1)).toBe(0);
    expect(10 ** log10BinomUpper(10, 10, 0.5)).toBeCloseTo(1 / 1024, 8);
    expect(10 ** log10BinomUpper(1, 2, 0.5)).toBeCloseTo(0.75, 8);
    expect(log10BinomUpper(48, 69, 0.042)).toBeLessThan(-40);
  });
  test("binomial lower tail", () => {
    expect(10 ** log10BinomLower(0, 7, 0.7)).toBeCloseTo(0.3 ** 7, 10);
  });
  test("one-sided Fisher", () => {
    // 48/69 vs 0/7: P = C(28,7)/C(76,7)
    const p = 10 ** log10FisherGreater([48, 21], [0, 7]);
    expect(p).toBeGreaterThan(1e-4);
    expect(p).toBeLessThan(1e-3);
    expect(log10FisherGreater([1, 99], [10, 90])).toBeCloseTo(0, 1);
  });
  test("strand imbalance", () => {
    expect(log10StrandImbalance(5, 5)).toBe(0);
    expect(log10StrandImbalance(10, 0)).toBeLessThan(-2.5);
  });
  test("p formatting", () => {
    expect(fmtLog10P(-12.3)).toBe("5.0e-13");
    expect(fmtLog10P(-0.5)).toBe("0.32");
    expect(fmtLog10P(-Infinity)).toBe("< 1e-300");
  });
});

describe("site assembly", () => {
  test("annotation names known hotspots and falls back to gene", () => {
    expect(annotateSite(calls.sites[0]).note).toMatch(/ETS/);
    const a = annotateSite(calls.sites[2], { gene: "EGFR" });
    expect(a.name).toBe("EGFR G>C");
    expect(a.gbmGene).toBe(true);
    expect(a.hotspot).toBe(false);
  });
  test("pooled counts use site_evidence when present, else the caller totals", () => {
    const p = pooledCounts(calls.sites[0], evidence.sites[TERT]);
    expect(p.tumor).toMatchObject({ alt: 6, dp: 8, altF: 3, altR: 3 });
    const q = pooledCounts(calls.sites[1], null);
    expect(q.source).toBe("calls");
    expect(q.tumor).toMatchObject({ alt: 0, dp: 9 });
  });
  test("cohort background excludes carrier patients", () => {
    const c = cohortBackground(evidence.sites[TERT]);
    expect(c.carriers).toEqual(["P2"]);
    expect(c).toMatchObject({ alt: 1, dp: 32, nPatients: 1 });
  });
  test("clone lanes follow tree order, normals last", () => {
    const rows = siteCells(calls, TERT);
    const lanes = cloneLanes(rows, ["n1", "b1", "b2", "b3", "b4", "b5", "a1", "a2", "a3", "a4", "a5"]);
    expect(lanes.map((l) => l.clone)).toEqual(["Clone 6", "Clone 2", "Normal"]);
    expect(lanes[0]).toMatchObject({ n: 5, covered: 4, carriers: 3 });
    expect(lanes[2].normal).toBe(true);
  });
});

describe("verdicts", () => {
  test("TERT-like site is supported", () => {
    const st = siteStats(calls.sites[0], evidence.sites[TERT], siteCells(calls, TERT));
    expect(st.carrierCells).toBe(6);
    expect(st.coveredTumour).toBe(8);
    const v = siteVerdict(st);
    expect(v.level).toBe("supported");
    expect(v.checks.find((c) => c.key === "strand").status).toBe("pass");
  });
  test("zero alt reads with depth is not detected", () => {
    const v = siteVerdict(siteStats(calls.sites[1], null, siteCells(calls, C250)));
    expect(v.level).toBe("absent");
  });
  test("normal cells at tumour rate + one strand is artefact-like", () => {
    const v = siteVerdict(siteStats(calls.sites[2], evidence.sites[AMP], siteCells(calls, AMP)));
    expect(v.level).toBe("artefact");
    expect(v.checks.find((c) => c.key === "normal").status).toBe("fail");
    expect(v.checks.find((c) => c.key === "strand").status).toBe("fail");
  });
  test("germline-like when normals carry it at het VAF", () => {
    const site = { ...calls.sites[0], alt_normal: 4, dp_normal: 8, alt_tumor: 10, dp_tumor: 20 };
    const v = siteVerdict(siteStats(site, null, []));
    expect(v.level).toBe("germline");
  });
  test("ranking puts the supported hotspot first and lists silent hotspots separately", () => {
    const r = rankFindings(calls, evidence);
    expect(r.findings[0].id).toBe(TERT);
    expect(r.negativeHotspots.map((f) => f.id)).toEqual([C250]);
  });
});

describe("reads and links", () => {
  test("decode reads", () => {
    const rows = decodeReads(evidence.sites[TERT], cells, new Map([["a1", "Clone 2"]]));
    expect(rows[0]).toMatchObject({ cell: "a1", clone: "Clone 2", allele: "alt", strand: "−", dup: false });
    expect(rows[1]).toMatchObject({ cell: "n1", allele: "ref", dup: true });
    expect(readPasses(rows[1])).toBe(false);
    expect(readPasses(rows[1], { hideDup: false })).toBe(true);
    expect(readPasses(rows[0], { minMq: 61 })).toBe(false);
  });
  test("deep link round trip", () => {
    const q = evidenceLinkQuery({ dataset: "gbm-sc", report: "MGH285", site: TERT });
    expect(readEvidenceLink(q)).toEqual({ report: "MGH285", site: TERT, view: null });
    expect(q).toContain("tab=15");
  });
});

describe("links from other views", () => {
  test("findings by gene keep the best supported / weak site", () => {
    const m = findingsByGene(rankFindings(calls, evidence));
    expect(m.get("TERT").id).toBe(TERT);
    expect(m.has("EGFR")).toBe(false);
  });
  test("record genes split fusions", () => {
    expect(recordGenes({ gene: "NPIPB3::BOLA2B" })).toEqual(["NPIPB3", "BOLA2B"]);
  });
});

describe("amplicon-style and quality checks", () => {
  test("low VAF over deep coverage is at most weak", () => {
    const site = { id: "chr7:1:C>T", chrom: "chr7", pos: 1, ref: "C", alt: "T", alt_tumor: 160, dp_tumor: 30000, alt_normal: 0, dp_normal: 300, error: 0.001 };
    const rows = Array.from({ length: 50 }, (_, i) => ({ id: `c${i}`, clone: "Clone 2", alt: i < 40 ? 4 : 0, dp: 600, call: "nc" }));
    const v = siteVerdict(siteStats(site, null, rows));
    expect(v.checks.find((c) => c.key === "vaf").status).toBe("warn");
    expect(v.level).toBe("weak");
  });
  test("low-quality reference reads are flagged as info, not against the call", () => {
    const ev = JSON.parse(JSON.stringify(evidence.sites[TERT]));
    ev.presets.caller.bq_ref = 20;
    const v = siteVerdict(siteStats(calls.sites[0], ev, siteCells(calls, TERT)));
    expect(v.checks.find((c) => c.key === "bq").status).toBe("info");
    expect(v.level).toBe("supported");
  });
});
