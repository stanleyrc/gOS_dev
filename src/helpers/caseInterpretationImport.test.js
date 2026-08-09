/** @jest-environment node */

import {
  createCaseInterpretationImportUrls,
  parseCaseInterpretationImport,
} from "./caseInterpretationImport";
import {
  CASE_INTERPRETATION_IMPORT_STORAGE_CASE_ID,
  CASE_INTERPRETATION_IMPORT_STORAGE_DATASET_ID,
} from "./interpretationHistory";

const headers = {
  userTier: [
    "pair",
    "match_key",
    "match_key_readable",
    "variant_key",
    "variant_key_readable",
    "onco_vkey",
    "onco_vkey_kind",
    "onco_variant_p",
    "onco_fusion_genes",
    "match_confidence",
    "gene",
    "hgvsc",
    "myeloseq_tier",
    "user",
    "tier",
    "freq",
  ],
  tier: [
    "pair",
    "match_key",
    "match_key_readable",
    "variant_key",
    "variant_key_readable",
    "onco_vkey",
    "onco_vkey_kind",
    "onco_variant_p",
    "onco_fusion_genes",
    "match_confidence",
    "gene",
    "hgvsc",
    "myeloseq_tier",
    "tier",
    "freq",
  ],
};

const common = {
  pair: "CASE-1",
  match_key: "TP53 c.1A>G",
  match_key_readable: "TP53|c.1A>G",
  variant_key: "TP53 c.1A>G",
  variant_key_readable: "TP53|c.1A>G|p.Arg1Gly",
  onco_vkey: "1 100 A G",
  onco_vkey_kind: "vcf_coord",
  onco_variant_p: "p.Arg1Gly",
  onco_fusion_genes: "",
  match_confidence: "exact",
  gene: "TP53",
  hgvsc: "c.1A>G",
  myeloseq_tier: "2",
};

function toTsv(header, rows) {
  return [
    header.join("\t"),
    ...rows.map((row) => header.map((field) => row[field] ?? "").join("\t")),
  ].join("\n");
}

const event = {
  uid: "1:100-1:100",
  gene: "TP53",
  variant: "p.Arg1Gly / c.1A>G",
  type: "Missense",
  Variant_g: "1:100-100 A>G",
};

function validSources() {
  const userRows = [
    { ...common, user: "alice", tier: 1, freq: 3 },
    { ...common, user: "alice", tier: 2, freq: 1 },
    { ...common, user: "", tier: 1, freq: 2 },
    { ...common, user: "bob", tier: 3, freq: 4 },
  ];
  const tierRows = [
    { ...common, tier: 1, freq: 5 },
    { ...common, tier: 2, freq: 1 },
    { ...common, tier: 3, freq: 4 },
  ];
  return {
    userTierText: toTsv(headers.userTier, userRows),
    tierText: toTsv(headers.tier, tierRows),
  };
}

describe("Case Interpretation Import", () => {
  it("keeps the current source path contract behind one URL builder", () => {
    expect(
      createCaseInterpretationImportUrls({
        dataPath: "data/",
        caseId: "CASE-1",
        sourceStem: "PAIR-1",
      }),
    ).toEqual({
      userTier: "data/CASE-1/retier_trace/retier_agg_user_tier_PAIR-1.tsv",
      tier: "data/CASE-1/retier_trace/retier_agg_tier_PAIR-1.tsv",
    });
  });

  it("normalizes identified and unattributed weighted history", () => {
    const result = parseCaseInterpretationImport({
      ...validSources(),
      events: [event],
      datasetId: "dataset-1",
      caseId: "CASE-1",
    });

    expect(result.state).toBe("ready");
    expect(result.interpretations).toHaveLength(4);
    expect(result.interpretations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          authorName: "alice",
          frequency: 3,
          data: { tier: "1" },
          lastModified: null,
          source: expect.objectContaining({
            kind: "case-interpretation-import",
          }),
        }),
        expect.objectContaining({
          authorName: "Unattributed",
          frequency: 2,
        }),
      ]),
    );
    expect(new Set(result.interpretations.map(({ authorId }) => authorId)).size).toBe(4);
    expect(result.distributions).toEqual([
      expect.objectContaining({ counts: { 1: 5, 2: 1, 3: 4 } }),
    ]);
  });

  it("uses one global aggregate identity across source cases and datasets", () => {
    const first = parseCaseInterpretationImport({
      ...validSources(),
      events: [event],
      datasetId: "dataset-1",
      caseId: "CASE-1",
    });
    const second = parseCaseInterpretationImport({
      ...validSources(),
      events: [event],
      datasetId: "dataset-2",
      caseId: "CASE-2",
    });

    expect(second.interpretations[0]).toMatchObject({
      datasetId: CASE_INTERPRETATION_IMPORT_STORAGE_DATASET_ID,
      caseId: CASE_INTERPRETATION_IMPORT_STORAGE_CASE_ID,
      alterationId: first.interpretations[0].alterationId,
      authorId: first.interpretations[0].authorId,
      source: {
        ...second.interpretations[0].source,
        caseId: "CASE-2",
        datasetId: "dataset-2",
      },
    });
    expect(second.interpretations[0].source.aggregateId).toBe(
      first.interpretations[0].source.aggregateId,
    );
  });

  it("keeps identified and unattributed storage identities distinct", () => {
    const userRows = [
      { ...common, user: "unattributed", tier: 1, freq: 1 },
      { ...common, user: "", tier: 1, freq: 2 },
    ];
    const result = parseCaseInterpretationImport({
      userTierText: toTsv(headers.userTier, userRows),
      tierText: toTsv(headers.tier, [{ ...common, tier: 1, freq: 3 }]),
      events: [event],
      datasetId: "dataset-1",
      caseId: "CASE-1",
    });

    expect(result.state).toBe("ready");
    expect(new Set(result.interpretations.map(({ authorId }) => authorId)).size).toBe(2);
  });

  it("rejects incomplete source event identity", () => {
    const incomplete = { ...common, gene: "", user: "alice", tier: 1, freq: 1 };
    const result = parseCaseInterpretationImport({
      userTierText: toTsv(headers.userTier, [incomplete]),
      tierText: toTsv(headers.tier, [{ ...incomplete, user: undefined }]),
      events: [event],
      datasetId: "dataset-1",
      caseId: "CASE-1",
    });

    expect(result.state).toBe("rejected");
    expect(result.issues.join(" ")).toContain("missing gene");
  });

  it("rejects unsupported non-coordinate matching rather than guessing", () => {
    const fusionRow = {
      ...common,
      onco_vkey: "",
      onco_vkey_kind: "fusion",
      onco_fusion_genes: "BCR::ABL1",
      gene: "BCR::ABL1",
      hgvsc: "fusion",
      user: "alice",
      tier: 1,
      freq: 1,
    };
    const result = parseCaseInterpretationImport({
      userTierText: toTsv(headers.userTier, [fusionRow]),
      tierText: toTsv(headers.tier, [fusionRow]),
      events: [{
        uid: "fusion-1",
        gene: "BCR::ABL1",
        fusion_genes: "BCR::ABL1",
        variant: "BCR::ABL1",
        type: "Fusion",
      }],
      datasetId: "dataset-1",
      caseId: "CASE-1",
    });

    expect(result.state).toBe("rejected");
    expect(result.issues.join(" ")).toContain("Unsupported event key kind");
  });

  it("rejects a cross-file frequency mismatch before producing records", () => {
    const sources = validSources();
    const result = parseCaseInterpretationImport({
      ...sources,
      tierText: sources.tierText.replace("\t5\n", "\t6\n"),
      events: [event],
      datasetId: "dataset-1",
      caseId: "CASE-1",
    });

    expect(result.state).toBe("rejected");
    expect(result.issues.join(" ")).toContain("does not match");
    expect(result).not.toHaveProperty("interpretations");
  });

  it("rejects ambiguous event matches atomically", () => {
    const result = parseCaseInterpretationImport({
      ...validSources(),
      events: [event, { ...event }],
      datasetId: "dataset-1",
      caseId: "CASE-1",
    });

    expect(result.state).toBe("rejected");
    expect(result.issues.join(" ")).toContain("exactly one event");
  });
});
