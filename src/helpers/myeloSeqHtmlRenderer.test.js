/** @jest-environment node */
/* eslint-disable import/first */

jest.mock("./browseScope", () => ({
  datasetHasField: (dataset, fieldId) =>
    (dataset?.fields || []).some(
      (field) => (field.id || field.name) === fieldId,
    ),
}));

import { MyeloSeqHtmlRenderer } from "./myeloSeqHtmlRenderer";

const report = {
  patient: {
    caseId: "CASE-001",
    tumorType: "AML",
    primarySite: "Bone marrow",
  },
  metadata: {
    tumor_details: "Acute myeloid leukemia",
    purity: 0.42,
    ploidy: 2.1,
    tmb: 3.5,
    msisensor: { score: 0.08 },
    hrd: { b1_2_score: 0.12 },
  },
  notes: "Case-level note",
  alterations: [
    {
      gene: "JAK2",
      variant: "c.1849G>T, p.V617F",
      tier: "1",
      type: "SNV",
      eventType: "snv",
      VAF: 0.477,
      depth: 1974,
      transcript: "NM_004972.4",
      effect: "Gain-of-function",
      gene_summary: "JAK2 gene summary",
      variant_summary: "JAK2 variant summary",
      effect_description: "JAK2 effect description",
      notes: "JAK2 note",
      therapeutics: ["Ruxolitinib"],
      resistances: ["Example resistance"],
    },
    {
      gene: "BCR::ABL1",
      variant: "BCR(14)::ABL1(2)",
      tier: "1",
      type: "Fusion",
      eventType: "fusion",
      locus: "chr22:23632600::chr9:133729451",
      effect_description: "Fusion effect description",
    },
  ],
  interpretations: [
    {
      caseId: "CASE-001",
      data: { tier: "1", notes: "</script><script>alert('unsafe')</script>" },
    },
  ],
};

describe("MyeloSeqHtmlRenderer", () => {
  it("renders available gOS content in the reference report structure", async () => {
    const result = await new MyeloSeqHtmlRenderer().render(report);

    expect(result.mimeType).toBe("text/html");
    expect(result.filename).toContain("CASE-001");
    expect(result.html).toContain("SPECIMEN");
    expect(result.html).toContain("DNA Sequencing results");
    expect(result.html).toContain("Fusion results");
    expect(result.html).toContain("CASE-001");
    expect(result.html).toContain("Acute myeloid leukemia");
    expect(result.html).toContain("NM_004972.4");
    expect(result.html).toContain("chr22:23632600::chr9:133729451");
    expect(result.html).toContain("<strong>Comments:</strong> JAK2 effect description");
    expect(result.html).toContain("<strong>Comments:</strong> Fusion effect description");
    expect(result.html).toContain("JAK2 gene summary");
    expect(result.html).toContain("Ruxolitinib");
    expect(result.html).toContain("Case-level note");
  });

  it("includes fixed report boilerplate and embedded interpretation data", async () => {
    const result = await new MyeloSeqHtmlRenderer().render(report);

    expect(result.html).toContain("Variants are categorized into three tiers");
    expect(result.html).toContain("The NYU Oncomine Myeloid panel");
    expect(result.html).toContain("Analysis is performed using Ion Reporter Software 5.18");
    expect(result.html).toContain("This test is not designed for detection of germline mutations");
    expect(result.html).toContain('id="interpretations-data"');
    expect(result.html).toContain("\\u003c/script>");
  });

  it("omits dynamic fields and sections that are unavailable", async () => {
    const result = await new MyeloSeqHtmlRenderer().render({
      patient: { caseId: "CASE-EMPTY" },
      metadata: {},
      alterations: [{ gene: "TP53", variant: "p.R175H", tier: "2", type: "SNV" }],
    });

    expect(result.html).not.toContain("<th>VAF(%)</th>");
    expect(result.html).not.toContain("<th>Depth</th>");
    expect(result.html).not.toContain("<th>Transcript</th>");
    expect(result.html).not.toContain("Fusion results");
    expect(result.html).not.toContain("Clinical History");
    expect(result.html).not.toContain("N/A");
  });

  it("escapes case-specific content", async () => {
    const result = await new MyeloSeqHtmlRenderer().render({
      ...report,
      notes: "<script>alert('unsafe')</script>",
    });

    expect(result.html).not.toContain("<script>alert('unsafe')</script>");
    expect(result.html).toContain("&lt;script&gt;alert(&#39;unsafe&#39;)&lt;/script&gt;");
  });

  it("omits raw report values disabled by the normalized dataset fields", async () => {
    const result = await new MyeloSeqHtmlRenderer().render({
      ...report,
      dataset: {
        schema: [{ id: "purity" }],
        fields: [{ id: "purity" }],
      },
      patient: {
        ...report.patient,
        tumorType: "SCHEMA-OMITTED-TYPE",
        tumorDetails: "SCHEMA-OMITTED-DETAILS",
        tmb: 999,
      },
      metadata: {
        ...report.metadata,
        tumor_details: "SCHEMA-OMITTED-DETAILS",
        specimen_type: "SCHEMA-OMITTED-SPECIMEN",
        clinical_history: "SCHEMA-OMITTED-HISTORY",
        purity: 0.42,
        ploidy: 4.8,
        tmb: 999,
        tumor_median_coverage: 888,
      },
    });

    expect(result.html).toContain("<th>Purity</th><td>0.42</td>");
    expect(result.html).not.toContain("<th>Ploidy</th>");
    expect(result.html).not.toContain("Tumor Mutational Burden");
    expect(result.html).not.toContain("Tumor Median Coverage");
    expect(result.html).not.toContain("SCHEMA-OMITTED");
  });
});
