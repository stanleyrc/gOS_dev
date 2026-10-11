import {
  alterationKind,
  alterationText,
  bundleDrivers,
  driverOneLiner,
  driverPriority,
  evidenceStrength,
  expressionEffect,
  fusionExons,
  geneBrief,
  jaccard,
  linkedSpliceFindings,
  plateConfound,
  programEffects,
  roleOf,
  scoreEffect,
  stateShift,
  summarizeDriver,
} from "./driverSummary";

const fusion = {
  gene: "ZNF345::MLLT3",
  fusion_genes: "ZNF345::MLLT3",
  vartype: "fusion",
  type: "Fusion",
  Tier: "2",
  Variant: "In-Frame Fusion Exon -1 (p.5'UTR)::Exon 5 (p.120)",
  role: "None",
};
const lrp1b = {
  gene: "LRP1B",
  vartype: "SNV",
  type: "Trunc",
  Tier: "2",
  Variant: "p.R1999*",
  role: "Tumor Suppressor",
  gene_summary: "LRP1B, a low-density lipoprotein receptor, is infrequently altered in cancer.",
  driver_class: "likely",
  driver_score: "7",
  driver_evidence: "OncoKB cancer gene; truncating",
  alt: "20",
  VAF: "0.2",
};

describe("alteration descriptions", () => {
  it("classifies events", () => {
    expect(alterationKind(fusion)).toBe("fusion");
    expect(alterationKind(lrp1b)).toBe("trunc");
    expect(alterationKind({ vartype: "AMP", type: "SCNA" })).toBe("amp");
    expect(alterationKind({ vartype: "HOMDEL", type: "SCNA" })).toBe("homdel");
    expect(alterationKind({ vartype: "SNV", type: "Splice" })).toBe("splice");
  });
  it("reads roles and fusion exons", () => {
    expect(roleOf("Oncogene,Tumor Suppressor")).toBe("oncogene and tumor suppressor");
    expect(roleOf("None")).toBeNull();
    expect(fusionExons(fusion.Variant)).toEqual([-1, 5]);
  });
  it("explains a 5' UTR fusion as a possible promoter swap", () => {
    const t = alterationText(fusion);
    expect(t).toMatch(/ZNF345/);
    expect(t).toMatch(/MLLT3 from exon 5/);
    expect(t).toMatch(/promoter/);
    expect(t).toMatch(/in frame/);
  });
  it("explains truncating SNVs and amplifications", () => {
    expect(alterationText(lrp1b)).toMatch(/premature stop.*loss of function of a tumor suppressor/);
    expect(alterationText({ gene: "CDK4", vartype: "AMP", type: "SCNA", segment_cn: "34.2", role: "Oncogene" })).toMatch(/about 34 copies.*oncogene/);
  });
  it("gives a gene brief from OncoKB, curated pathway and GBM notes", () => {
    const b = geneBrief("LRP1B", lrp1b);
    expect(b.role).toBe("tumor suppressor");
    expect(b.pathway).toMatch(/LDL/);
    expect(b.summary).toMatch(/lipoprotein/);
    const m = geneBrief("MLLT3", fusion);
    expect(m.role).toBeNull();
    expect(m.pathway).toMatch(/chromatin/);
    expect(geneBrief("EGFR", {}).gbm.kind).toBe("driver");
    expect(geneBrief("CD44", {}).programs).toContain("MES-like (Neftel)");
  });
});

describe("ranking and bundling", () => {
  const ids = (a, b) => Array.from({ length: b - a }, (_, k) => `c${a + k}`);
  it("ranks tiered cancer genes in one clade first", () => {
    const strong = driverPriority({ event: lrp1b, carriers: ids(0, 20), fit: { score: 0.9 } });
    const weak = driverPriority({ event: { gene: "A::B", fusion_genes: "A::B", vartype: "outframe_fusion", Tier: "3" }, carriers: ids(0, 4), fit: { score: 0.3 } });
    expect(strong.score).toBeGreaterThan(weak.score);
    expect(strong.reasons.join(" ")).toMatch(/tier 2/);
  });
  it("bundles events with the same carriers under the highest-priority lead", () => {
    const a = { key: "a", label: "A", carriers: ids(0, 20), priority: { score: 10 } };
    const b = { key: "b", label: "B", carriers: ids(0, 19), priority: { score: 30 } };
    const c = { key: "c", label: "C", carriers: ids(40, 50), priority: { score: 5 } };
    expect(jaccard(a.carriers, b.carriers)).toBeCloseTo(0.95);
    const bundles = bundleDrivers([a, b, c]);
    expect(bundles.map((x) => x.lead.key)).toEqual(["b", "c"]);
    expect(bundles[0].members.map((m) => m.key)).toEqual(["b", "a"]);
  });
});

describe("effects", () => {
  it("measures expression fold change, AUC and p", () => {
    const a = Array(20).fill(2);
    const b = Array(20).fill(0.2);
    const e = expressionEffect(a, b);
    expect(e.log2fc).toBeGreaterThan(2);
    expect(e.auc).toBe(1);
    expect(e.p).toBeLessThan(1e-4);
    expect(expressionEffect([], b)).toBeNull();
  });
  it("gives standardised program differences with CI and BH q", () => {
    const a = Array.from({ length: 30 }, (_, k) => 1 + (k % 5) * 0.1);
    const b = Array.from({ length: 30 }, (_, k) => (k % 5) * 0.1);
    const s = scoreEffect(a, b);
    expect(s.d).toBeGreaterThan(3);
    expect(s.lo).toBeLessThan(s.d);
    const rows = programEffects([
      { name: "up", a, b },
      { name: "flat", a: b, b },
    ]);
    expect(rows[0].name).toBe("up");
    expect(rows[0].q).toBeLessThan(0.01);
  });
  it("finds the state with the largest shift", () => {
    const rows = stateShift([
      { level: "MES", a: 20, b: 2 },
      { level: "NPC", a: 10, b: 28 },
    ]);
    expect(rows[0].p).toBeLessThan(1e-4);
    expect(rows.find((r) => r.level === "MES").shareA).toBeCloseTo(2 / 3);
  });
  it("links splicing findings enriched in carriers", () => {
    const carriers = ids0(20);
    const others = Array.from({ length: 20 }, (_, k) => `o${k}`);
    const f = { id: "f1", gene: "TP53", cells: carriers.slice(0, 15) };
    const g = { id: "f2", gene: "X", cells: [...carriers.slice(0, 5), ...others.slice(0, 10)] };
    const out = linkedSpliceFindings([f, g], carriers, others);
    expect(out.map((x) => x.finding.id)).toEqual(["f1"]);
  });
  it("flags plate confounding", () => {
    expect(plateConfound({ p: 1e-5, nA: 10, nB: 10, levels: [{ level: "pl1", a: 9, b: 1 }, { level: "pl2", a: 1, b: 9 }] }).plates).toEqual(["pl1"]);
    expect(plateConfound({ p: 0.5, nA: 10, nB: 10, levels: [] })).toBeNull();
  });
});
function ids0(n) {
  return Array.from({ length: n }, (_, k) => `c${k}`);
}

describe("evidence and summary", () => {
  it("grades evidence with reasons and cautions", () => {
    const strong = evidenceStrength({ event: lrp1b, carriers: ids0(30), fit: { score: 0.95, inClade: 30, clade: 31 } });
    expect(strong.level).toBe("strong");
    const weak = evidenceStrength({ event: { Tier: "3" }, carriers: ids0(4), fit: { score: 0.2 } }, { confound: { plates: ["pl1"] } });
    expect(weak.level).toBe("weak");
    expect(weak.cautions.join(" ")).toMatch(/scattered.*|only 4/);
    expect(weak.cautions.join(" ")).toMatch(/pl1/);
  });
  it("summarises a driver bundle in one line", () => {
    const lead = { key: "k", label: "LRP1B SNV", event: lrp1b, carriers: ids0(20), fit: { score: 0.9, inClade: 20, clade: 22 } };
    const others = Array.from({ length: 20 }, (_, k) => `o${k}`);
    const expr = (g, list) => list.map((id) => (id.startsWith("c") ? 0.1 : 1.5));
    const s = summarizeDriver(
      { lead, members: [lead, { label: "GRIP1::GLI1" }] },
      {
        total: 40,
        nonCarriers: others,
        expr,
        programScores: [{ name: "MES-like (Neftel)", of: (list) => list.map((id, k) => (id.startsWith("c") ? 1 + k * 0.01 : k * 0.01)) }],
        stateOf: () => [
          { level: "MES", a: 12, b: 2 },
          { level: "NPC", a: 8, b: 18 },
        ],
      }
    );
    expect(s.dosage[0].agrees).toBe(true);
    expect(s.evidence.reasons.join(" ")).toMatch(/expected way/);
    expect(s.state[0].level).toBeDefined();
    expect(s.oneLiner).toMatch(/LRP1B SNV \(truncating mutation\) in 20 of 40 tumor cells \(50%, one clade\)/);
    expect(s.oneLiner).toMatch(/travels with GRIP1::GLI1/);
    expect(s.oneLiner).toMatch(/LRP1B RNA .* lower/);
    expect(driverOneLiner(null)).toBe("");
  });
});

describe("copy-number regions", () => {
  it("names strong regions with their location and genes", () => {
    const { describeCnRegions } = require("./driverSummary");
    const chromoBins = { 1: { startPlace: 0, endPlace: 100e6 }, 12: { startPlace: 100e6, endPlace: 200e6 } };
    const out = describeCnRegions(
      [
        { start: 160.5e6, end: 170.5e6, diff: 30, meanA: 40, meanB: 10 },
        { start: 10.5e6, end: 10.5e6, diff: 0.6, meanA: 2.6, meanB: 2 },
      ],
      chromoBins,
      [{ gene: "CDK4", global: 165e6 }]
    );
    expect(out).toHaveLength(1);
    expect(out[0].where).toBe("chr12:60–71 Mb");
    expect(out[0].genes).toEqual(["CDK4"]);
  });
});

describe("ranking candidates and merging regions", () => {
  const { rankCandidates, describeCnRegions } = require("./driverSummary");
  const ids = (n, p = "c") => Array.from({ length: n }, (_, k) => `${p}${k}`);
  it("puts a clean clone-defining tier-2 fusion above scattered tier-2 SNVs", () => {
    const snv = { key: "snv", label: "LRP1B SNV", event: { ...lrp1b, type: "Splice" }, carriers: ids(42), fit: { score: 0.49 } };
    const fus = { key: "fus", label: "ZNF345::MLLT3", event: fusion, carriers: ids(65, "f"), fit: { score: 0.99, inClade: 65, clade: 66 } };
    const out = rankCandidates([{ lead: snv, members: [snv] }, { lead: fus, members: [fus, {}, {}] }]);
    expect(out[0].lead.key).toBe("fus");
  });
  it("leads with candidates whose carriers form one branch, highest clade F1 first", () => {
    const { keyFindingsFirst } = require("./driverSummary");
    const mk = (key, score) => ({ lead: { key, fit: score == null ? null : { score } } });
    const out = keyFindingsFirst([mk("a", 0.4), mk("b", 0.85), mk("c", null), mk("d", 0.99), mk("e", 0.97)]);
    expect(out.map((x) => x.lead.key)).toEqual(["d", "e", "b", "a", "c"]);
  });
  it("merges pieces of one amplicon and names GBM drivers first", () => {
    const chromoBins = { 12: { startPlace: 0, endPlace: 133e6 } };
    const out = describeCnRegions(
      [
        { start: 62.5e6, end: 62.5e6, diff: 33, meanA: 70, meanB: 37 },
        { start: 70.5e6, end: 70.5e6, diff: 37, meanA: 98, meanB: 60 },
      ],
      chromoBins,
      [{ gene: "DDIT3", global: 57.5e6 }, { gene: "MDM2", global: 68.8e6 }, { gene: "AGAP2", global: 63e6 }]
    );
    expect(out).toHaveLength(1);
    expect(out[0].diff).toBe(37);
    expect(out[0].genes[0]).toBe("MDM2");
  });
});
