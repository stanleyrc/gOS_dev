import { LOSS_CODE, isBroadCn0, twoHitCalls } from "./twoHit";
import { badgeText, distinctHits, groupMultiHitEntries, inTsgSource, patientBadges, patientTally, summarizeCall, summaryTitle, tsgGeneInfo, tsgHitGrid } from "./tsgHits";

// synthetic fixtures only
const cellsOf = (n, p = "c") => Array.from({ length: n }, (_, i) => `${p}${i}`);
const snv = (gene, ids, start, extra = {}) => ({
  key: `${gene}-${start}`,
  cls: "snv",
  carriers: ids,
  n: ids.length,
  fraction: ids.length / 20,
  event: { gene, type: "Missense", vartype: "SNV", Variant: `p.X${start}Y`, VAF: 0.5, seqnames: "17", start: `${start}`, Tier: 2, effect: "Loss-of-function", role: "Tumor Suppressor", cell_ids: ids.join(","), cells: `${ids.length}/20`, ...extra },
});
const homdel = (gene, ids) => ({ key: `${gene}-hd`, cls: "homdel", carriers: ids, n: ids.length, fraction: ids.length / 20, event: { gene, type: "SCNA", vartype: "HOMDEL", role: "Tumor Suppressor", cells: `${ids.length}/20` } });
const cells = cellsOf(20);
const lossOf = (gene, codes) => ({ cells, genes: { [gene]: codes } });
const code = (n, c) => cells.map((_, i) => (i < n ? c : LOSS_CODE.BALANCED));

describe("two SNVs in trans (phase)", () => {
  const entries = [snv("TP53", cells.slice(0, 18), 100), snv("TP53", cells.slice(0, 18), 200)];
  it("count as two hits in the same cells only when phased in trans", () => {
    const phase = { TP53: [{ a: "17:100", b: "17:200", relation: "trans" }] };
    const [c] = twoHitCalls(entries, { tumorIds: cells, phase });
    expect(c.state).toBe("biallelic");
    expect(c.biallelicCells).toBe(18);
    const s = summarizeCall(c, "P1");
    expect(s.nHits).toBe(2);
    expect(s.sameFraction).toBeCloseTo(0.9);
    expect(s.carrierFraction).toBeCloseTo(1);
    expect(s.clonal).toBe(true);
    expect(s.badge).toBe("TP53 ×2 (biallelic, 90%)");
    const [u] = twoHitCalls(entries, { tumorIds: cells });
    expect(u.state).toBe("monoallelic"); // phase unknown: not claimed
    expect(summarizeCall(u, "P1").sameFraction).toBe(0);
  });
});

describe("distinctHits", () => {
  it("merges LOH and copy-neutral LOH, counts a homozygous deletion as both copies, ignores weak missense and tiny hits", () => {
    const loss = lossOf("PTEN", cells.map((_, i) => (i < 8 ? LOSS_CODE.LOH : i < 12 ? LOSS_CODE.CNLOH : LOSS_CODE.BALANCED)));
    const [c] = twoHitCalls([snv("PTEN", cells.slice(0, 12), 5, { type: "Trunc" }), snv("PTEN", cells.slice(0, 12), 9, { Tier: 3, effect: "Unknown", source: "site evidence (not in SNV calls)" })], { tumorIds: cells, loss });
    const h = distinctHits(c);
    expect(h.map((x) => x.kind)).toEqual(["snv", "loh"]);
    expect(h[1].n).toBe(12);
    const [d] = twoHitCalls([homdel("CDKN2A", cells.slice(0, 15))], { tumorIds: cells });
    const s = summarizeCall(d, "P1");
    expect(s.nHits).toBe(2);
    expect(s.multi).toBe(true);
    expect(distinctHits(twoHitCalls([homdel("RB1", cells.slice(0, 3))], { tumorIds: cells })[0], { minFraction: 0.2 })).toHaveLength(0);
  });
});

describe("hit counting details", () => {
  it("LOH next to a homozygous deletion is two hits, SV breakpoints in a gene are one hit, weak missense is listed but not counted", () => {
    const loss = lossOf("CDKN2A", cells.map((_, i) => (i < 8 ? LOSS_CODE.LOH : i < 16 ? LOSS_CODE.HOMDEL : LOSS_CODE.BALANCED)));
    const [c] = twoHitCalls([], { tumorIds: cells, loss });
    const s = summarizeCall(c, "P");
    expect(s.hits.map((h) => h.kind)).toEqual(["loh", "homdel"]);
    expect(s.nHits).toBe(2);
    const fus = (g, ids, partner) => ({ key: `${g}-${partner}`, cls: "fusion", carriers: ids, n: ids.length, fraction: 0.5, event: { gene: `${g}::${partner}`, role: "Tumor Suppressor", cells: "10/20" } });
    const fcalls = twoHitCalls([fus("NF1", cells.slice(0, 10), "A"), fus("NF1", cells.slice(5, 15), "B")], { tumorIds: cells });
    expect(fcalls.map((x) => x.gene)).toEqual(["NF1"]); // partners A, B do not inherit the event's TSG role
    const [f] = fcalls;
    const sf = summarizeCall(f, "P");
    expect(sf.hits.map((h) => h.kind)).toEqual(["sv"]);
    expect(sf.hits[0].n).toBe(15);
    const [w] = twoHitCalls([snv("PTEN", cells.slice(0, 15), 7, { Tier: 3, effect: "Unknown", source: "site evidence (not in SNV calls)" })], { tumorIds: cells });
    const sw = summarizeCall(w, "P");
    expect(sw.nHits).toBe(0);
    expect(sw.weak).toHaveLength(1);
    expect(sw.weak[0].n).toBe(15);
  });
});

describe("tally, grid and badges", () => {
  const callsByPatient = (() => {
    const bi = (g) => twoHitCalls([snv(g, cells.slice(0, 19), 10, { type: "Trunc" })], { tumorIds: cells, loss: lossOf(g, code(19, LOSS_CODE.LOH)) })[0];
    const apart = twoHitCalls([snv("NF1", cells.slice(0, 5), 10, { type: "Trunc" })], { tumorIds: cells, loss: lossOf("NF1", cells.map((_, i) => (i >= 10 ? LOSS_CODE.LOH : 0))) })[0];
    return { A: [bi("TP53"), bi("PTEN"), bi("NF1")], B: [bi("TP53")], C: [apart], D: [] };
  })();
  it("sorts patients by TSGs with two hits and writes the tally", () => {
    const g = tsgHitGrid(callsByPatient, { minFraction: 0.05 });
    expect(g.patients.map((p) => p.patient)).toEqual(["A", "B", "C", "D"]);
    expect(g.patients[0].text).toBe("3 TSGs biallelic: NF1, PTEN, TP53");
    expect(g.patients[1].text).toBe("1 TSG biallelic: TP53");
    expect(g.patients[2].text).toMatch(/two hits in different cells: NF1/);
    expect(g.patients[3].text).toBe("no TSG with two hits");
    expect(g.rows[0].gene).toBe("TP53");
    expect(g.rows[0].nMulti).toBe(2);
  });
  it("min hits 1 shows genes with one hit; the gene filter and source work", () => {
    const one = twoHitCalls([snv("ARID1A", cells.slice(0, 10), 3, { type: "Trunc" })], { tumorIds: cells })[0];
    const withOne = { ...callsByPatient, E: [one] };
    expect(tsgHitGrid(withOne, { minHits: 2 }).rows.some((r) => r.gene === "ARID1A")).toBe(false);
    const g1 = tsgHitGrid(withOne, { minHits: 1 });
    expect(g1.rows.some((r) => r.gene === "ARID1A")).toBe(true);
    expect(tsgHitGrid(withOne, { minHits: 1, genes: "pten" }).rows.map((r) => r.gene)).toEqual(["PTEN"]);
    const odd = twoHitCalls([snv("ZZZ1", cells.slice(0, 10), 3, { type: "Trunc" })], { tumorIds: cells })[0]; // role says TSG, not curated
    expect(inTsgSource(odd, "curated")).toBe(false);
    expect(inTsgSource(odd, "oncokb")).toBe(true);
    expect(tsgHitGrid({ E: [odd] }, { minHits: 1, source: "curated" }).rows).toHaveLength(0);
    expect(tsgHitGrid({ E: [odd] }, { minHits: 1, source: "both" }).rows).toHaveLength(1);
  });
  it("badges list the multi-hit genes best first", () => {
    const b = patientBadges(callsByPatient.A, "A");
    expect(b).toHaveLength(3);
    expect(b[0].badge).toMatch(/×2 \(biallelic, 95%\)/);
    expect(badgeText({ gene: "X", nHits: 1 })).toBe("X (one hit)");
    expect(patientTally([], "Z").nMulti).toBe(0);
  });
  it("describes the gene list", () => {
    const info = tsgGeneInfo(callsByPatient, ["TP53", "PTEN"]);
    expect(info.curated).toContain("TP53");
    expect(info.text).toMatch(/OncoKB/);
  });
});

describe("groupMultiHitEntries", () => {
  it("moves the entries of a multi-hit gene next to each other", () => {
    const e = [snv("TP53", cells.slice(0, 18), 100), { key: "egfr", cls: "amp", event: { gene: "EGFR" } }, snv("TP53", cells.slice(0, 18), 200)];
    const calls = twoHitCalls(e, { tumorIds: cells, phase: { TP53: [{ a: "17:100", b: "17:200", relation: "trans" }] } });
    expect(groupMultiHitEntries(e, calls).map((d) => d.key)).toEqual(["TP53-100", "TP53-200", "egfr"]);
    expect(groupMultiHitEntries(e, [])).toBe(e);
  });
});

describe("chromosome-scale CN-0 calls (broad_cn0)", () => {
  it("are not counted as homozygous deletions, from the event or the per-cell allelic calls, and are listed as excluded", () => {
    const hd = homdel("NF2", cells.slice(0, 14));
    hd.event = { ...hd.event, broad_cn0: true, cn0_segment_mb_median: 50.8, cell_ids: cells.slice(0, 14).join(",") };
    const entries = [hd, snv("NF2", cells.slice(0, 4), 100)];
    const [c] = twoHitCalls(entries, { tumorIds: cells, loss: lossOf("NF2", code(14, LOSS_CODE.HOMDEL)) });
    expect(c.homdelCells).toBe(0);
    expect(c.state).toBe("monoallelic");
    expect(c.excluded[0].label).toMatch(/50.8 Mb/);
    const s = summarizeCall(c, "P1");
    expect(s.nHits).toBe(1);
    expect(s.weak[0].label).toMatch(/not counted as a homozygous deletion/);
    expect(isBroadCn0({ broad_cn0: "true" })).toBe(true);
  });
  it("a focal HOMDEL still counts", () => {
    const [c] = twoHitCalls([homdel("CDKN2A", cells.slice(0, 18))], { tumorIds: cells });
    expect(c.state).toBe("homdel");
  });
});

describe("broad CN-0 cells from _cohort/broad_cn0.json", () => {
  it("drop those cells' allelic HOMDEL calls even when the event itself is filtered out of the view", () => {
    const entries = [snv("NF2", cells.slice(0, 4), 100)];
    const loss = lossOf("NF2", code(14, LOSS_CODE.HOMDEL));
    const [c] = twoHitCalls(entries, { tumorIds: cells, loss, broadCn0: { NF2: { mb: 50.8, cells: cells.slice(0, 12) } } });
    expect(c.homdelCells).toBe(2); // 14 allelic HOMDEL cells minus the 12 broad ones
    expect(c.excluded[0].label).toMatch(/50.8 Mb/);
  });
});

describe("CN-0 cells with mutant reads", () => {
  it("count as LOH plus the mutation, not as a homozygous deletion", () => {
    const entries = [snv("TP53", cells.slice(0, 18), 100)];
    const loss = lossOf("TP53", code(10, LOSS_CODE.HOMDEL));
    const [c] = twoHitCalls(entries, { tumorIds: cells, loss });
    expect(c.homdelCells).toBe(0);
    expect(c.biallelicCells).toBe(10);
    expect(c.excluded.some((x) => /keep a copy/.test(x.label))).toBe(true);
  });
});

describe("germline hits in the TSG grid", () => {
  const cells = Array.from({ length: 20 }, (_, i) => `c${i}`);
  const germ = (sig, type = "Missense") => ({
    key: "g", cls: "snv", carriers: cells, n: 20, fraction: 1, germline: true,
    event: { gene: "BRCA1", type, vartype: "SNV", Variant: "p.A322T", seqnames: "17", start: "1", germline_like: true, clinical: { clinvar: { found: true, significance: sig } } },
  });
  it("a gene with only an uncounted germline variant is still listed (minHits 2)", () => {
    const calls = twoHitCalls([germ("Uncertain_significance")], { tumorIds: cells });
    const grid = tsgHitGrid({ P1: calls });
    expect(grid.rows.map((r) => r.gene)).toEqual(["BRCA1"]);
    const s = grid.rows[0].cells.P1;
    expect(s.nHits).toBe(0);
    expect(s.badge).toContain("germline variant, not counted");
    expect(summaryTitle(s)).toContain("not counted");
  });
  it("a damaging germline variant is one hit in every cell", () => {
    const s = summarizeCall(twoHitCalls([germ("Pathogenic")], { tumorIds: cells })[0], "P1");
    expect(s.nHits).toBe(1);
    expect(s.hits[0]).toMatchObject({ kind: "germline", fraction: 1 });
    expect(s.badge).toBe("BRCA1 (germline hit)");
  });
});
