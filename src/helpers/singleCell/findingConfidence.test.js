import {
  DEFAULT_CONFIDENCE_LEVEL,
  confidenceCounts,
  confidenceFromSearch,
  confidenceSummary,
  confidenceTooltip,
  filterByConfidence,
  hasConfidence,
  hiddenCount,
  passesConfidence,
  readConfidence,
  tiersShown,
  withConfidence,
} from "./findingConfidence";
import { normalizeSpliceFindings, rnaFindingCounts, rnaHeadlineItems } from "./rnaHeadlineFindings";
import { normalizeSpliceEvents } from "./spliceEventTable";
import { normalizeVignettes, vignettesAtConfidence } from "./vignettes";
import { spliceSupportOf } from "./spliceSupport";

// synthetic fixtures only
const items = [{ id: "a", confidence: "consistent" }, { id: "b", confidence: "suggestive" }, { id: "c", confidence: "low" }, { id: "d" }];

describe("findingConfidence", () => {
  it("default level shows consistent and untiered items only", () => {
    expect(DEFAULT_CONFIDENCE_LEVEL).toBe("consistent");
    expect(filterByConfidence(items, "consistent").map((x) => x.id)).toEqual(["a", "d"]);
    expect(filterByConfidence(items, "suggestive").map((x) => x.id)).toEqual(["a", "b", "d"]);
    expect(filterByConfidence(items, "low").map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
    expect(filterByConfidence(items, "bogus").map((x) => x.id)).toEqual(["a", "d"]);
    expect(passesConfidence({ confidence: "weird" }, "consistent")).toBe(true);
    expect(hiddenCount(items, "consistent")).toBe(2);
  });

  it("counts, presence and summary line", () => {
    expect(confidenceCounts(items)).toEqual({ consistent: 1, suggestive: 1, low: 1, unrated: 1, total: 4 });
    expect(hasConfidence(items)).toBe(true);
    expect(hasConfidence([{ id: "x" }])).toBe(false);
    expect(tiersShown("suggestive")).toEqual(["consistent", "suggestive"]);
    expect(confidenceSummary({ consistent: 10, suggestive: 190, low: 181 }, "consistent")).toBe("10 consistent shown; 190 suggestive, 181 low confidence hidden");
    expect(confidenceSummary({ consistent: 10, suggestive: 190, low: 181 }, "low")).toBe("10 consistent + 190 suggestive + 181 low confidence shown");
  });

  it("URL round trip (default level removes the parameter)", () => {
    expect(confidenceFromSearch("?report=P1")).toBe("consistent");
    expect(confidenceFromSearch("?spliceconf=low")).toBe("low");
    expect(confidenceFromSearch("?spliceconf=nope")).toBe("consistent");
    expect(withConfidence("?report=P1", "suggestive")).toBe("?report=P1&spliceconf=suggestive");
    expect(withConfidence("?report=P1&spliceconf=low", "consistent")).toBe("?report=P1");
    expect(withConfidence("", "low", "otherconf")).toBe("?otherconf=low");
    expect(confidenceFromSearch("?otherconf=low", "otherconf")).toBe("low");
  });

  it("reads exported fields and builds the hover text", () => {
    const c = readConfidence({ confidence: "suggestive", confidence_reason: "one patient only", confidence_detail: { consequence: "known isoform switch", first_intron: true } });
    expect(c.confidence).toBe("suggestive");
    const tip = confidenceTooltip(c);
    expect(tip).toContain("one patient only");
    expect(tip).toContain("known isoform switch");
    expect(tip).toContain("alternative promoter");
    expect(readConfidence({}).confidence).toBeNull();
    expect(confidenceTooltip({})).toContain("Not rated");
  });
});

describe("splicing findings follow the level", () => {
  const raw = [
    { id: "f1", kind: "patient_specific", text: "G1 cryptic", score: 9, confidence: "consistent", confidence_reason: "DNA in cis" },
    { id: "f2", kind: "patient_specific", text: "G2 cryptic", score: 8, confidence: "suggestive", confidence_reason: "tumour-to-tumour" },
    { id: "f3", kind: "clone_differential", text: "G3 clone", score: 7, confidence: "low", confidence_reason: "batch" },
  ];
  const f = normalizeSpliceFindings(raw);

  it("normalizes the tier", () => {
    expect(f.map((x) => x.confidence)).toEqual(["consistent", "suggestive", "low"]);
    expect(f[0].confidenceReason).toBe("DNA in cis");
  });

  it("counts and headlines", () => {
    expect(rnaFindingCounts({ splicing: f }).splicing).toBe(1);
    expect(rnaFindingCounts({ splicing: f, level: "suggestive" }).splicing).toBe(2);
    expect(rnaFindingCounts({ splicing: f, level: "low" }).splicing).toBe(3);
    expect(rnaHeadlineItems({ splicing: f, max: 10 }).map((h) => h.id)).toEqual(["f1"]);
    expect(rnaHeadlineItems({ splicing: f, max: 10, level: "low" }).map((h) => h.id)).toEqual(["f1", "f2", "f3"]);
  });

  it("untiered files are unchanged", () => {
    const old = normalizeSpliceFindings(raw.map(({ confidence, confidence_reason: r, ...x }) => x));
    expect(rnaFindingCounts({ splicing: old }).splicing).toBe(3);
  });

  it("events carry the tier", () => {
    const ev = normalizeSpliceEvents([{ id: "e1", cluster_id: "c1", confidence: "low", confidence_reason: "not re-tested" }, { id: "e2", cluster_id: "c2" }]);
    expect(ev.map((e) => e.confidence)).toEqual(["low", null]);
    expect(filterByConfidence(ev, "consistent").map((e) => e.id)).toEqual(["e2"]);
  });
});

describe("vignettes and splice support follow the level", () => {
  it("drops splice vignette items below the level", () => {
    const v = normalizeVignettes({
      format: "gos-sc-vignettes/1",
      patients: {
        P1: {
          findings: [
            { id: "1", rank: 1, kind: "snv", text: "SNV" },
            { id: "2", rank: 2, kind: "splice", text: "splice ok", confidence: "consistent" },
            { id: "3", rank: 3, kind: "splice", text: "splice weak", confidence: "suggestive" },
          ],
        },
      },
    });
    expect(vignettesAtConfidence(v, "consistent").patients.P1.findings.map((x) => x.id)).toEqual(["1", "2"]);
    expect(vignettesAtConfidence(v, "suggestive")).toBe(v);
  });

  it("filters RNA entries of splice_support", () => {
    const doc = {
      patients: {
        P1: {
          G1: { dna: [{}], rna: [{ text: "x", confidence: "low" }], support: "DNA+RNA" },
          G2: { dna: [], rna: [{ text: "y", confidence: "suggestive" }], support: "RNA" },
          G3: { dna: [], rna: [{ text: "z", confidence: "consistent" }, { text: "w", confidence: "low" }], support: "RNA" },
          G4: { dna: [], rna: [{ text: "old" }], support: "RNA" },
        },
      },
    };
    expect(spliceSupportOf(doc, "P1", "G1", "consistent").support).toBe("DNA");
    expect(spliceSupportOf(doc, "P1", "G2", "consistent")).toBeNull();
    expect(spliceSupportOf(doc, "P1", "G2", "suggestive").support).toBe("RNA");
    expect(spliceSupportOf(doc, "P1", "G3", "consistent").rna).toHaveLength(1);
    expect(spliceSupportOf(doc, "P1", "G4", "consistent").support).toBe("RNA");
    expect(spliceSupportOf(doc, "P1", "G1").support).toBe("DNA+RNA");
  });
});
