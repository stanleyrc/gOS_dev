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
    tumorDetails: "Acute myeloid leukemia",
    disease: "Myeloid neoplasm",
    primarySite: "Bone marrow",
  },
  metadata: {
    specimen_type: "Peripheral blood",
    clinical_history: "MPN",
    tumor_details: "Acute myeloid leukemia",
    disease: "Myeloid neoplasm",
    purity: 0.42,
    ploidy: 2.1,
    tmb: 3.5,
    msisensor: { score: 0.08 },
    hrd: { b1_2_score: 0.12 },
  },
  notes: "Case-level note",
  alterations: [
    {
      uid: "finding-jak2",
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
      uid: "finding-bcr-abl1",
      gene: "BCR::ABL1",
      variant: "BCR(14)::ABL1(2)",
      tier: "1",
      type: "Fusion",
      eventType: "fusion",
      locus: "chr22:23632600::chr9:133729451",
      variant_summary: "BCR::ABL1 variant summary",
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
  it("renders only the reference report's dynamic labels and fields", async () => {
    const result = await new MyeloSeqHtmlRenderer().render(report);

    expect(result.mimeType).toBe("text/html");
    expect(result.filename).toContain("CASE-001");
    expect(result.html).toContain("SPECIMEN");
    expect(result.html).toContain("<strong>Tumor sample:</strong> CASE-001");
    expect(result.html).toContain(
      "<strong>Specimen Type:</strong> Bone marrow",
    );
    expect(result.html).toContain("<strong>Clinical History:</strong> NA");
    expect(result.html).not.toContain("Peripheral blood");
    expect(result.html).not.toContain("<strong>Clinical History:</strong> MPN");
    expect(result.html).not.toContain("<strong>Tumor Type:</strong>");
    expect(result.html).not.toContain("<strong>Tumor Details:</strong>");
    expect(result.html).not.toContain("<strong>Disease:</strong>");
    expect(result.html).not.toContain("<strong>Primary Site:</strong>");

    expect(result.html).toContain("DNA Sequencing results");
    expect(result.html).toContain(
      "<th>Gene</th><th>Variant</th><th>Tier</th><th>Variant Type</th>",
    );
    expect(result.html).toContain("Targeted RNA Sequencing results");
    expect(result.html).toContain(
      "<th>Gene(Exon)</th><th>Tier</th><th>Variant Type</th><th>Locus</th>",
    );
    expect(result.html).toContain(
      '<td class="gene-cell">BCR(14)::ABL1(2)</td><td>1</td><td>Fusion</td><td>chr22:23632600::chr9:133729451</td>',
    );
    expect(result.html).toContain(
      '<section class="result-table fusion-result-table">',
    );
    expect(result.html).toContain(
      '<colgroup><col style="width: 29%"><col style="width: 8%"><col style="width: 21%"><col style="width: 42%"></colgroup>',
    );
    expect(result.html).not.toContain("Fusion results");
    expect(result.html).toContain("NM_004972.4");
    expect(result.html).toContain("chr22:23632600::chr9:133729451");

    expect(result.html).toContain(
      "<strong>Variant:</strong> JAK2, c.1849G&gt;T, p.V617F",
    );
    expect(result.html).toContain(
      "<strong>Gene Fusion:</strong> BCR(14)::ABL1(2)",
    );
    expect(result.html).toContain(
      "<strong>Breakpoint:</strong> chr22:23632600::chr9:133729451",
    );
    expect(result.html).toContain(
      '<strong>Comments:</strong> <span class="report-comment-value">JAK2 variant summary</span>',
    );
    expect(result.html).toContain(
      '<strong>Comments:</strong> <span class="report-comment-value">BCR::ABL1 variant summary</span>',
    );
    expect(result.html).not.toContain("contenteditable");
    expect(result.html).not.toContain("JAK2 effect description");
    expect(result.html).not.toContain("Fusion effect description");
    expect(result.html).not.toContain("<strong>Variant Type:</strong>");
    expect(result.html).not.toContain("<strong>Effect:</strong>");
    expect(result.html).not.toContain("<strong>Gene Summary:</strong>");
    expect(result.html).not.toContain("<strong>Variant Summary:</strong>");
    expect(result.html).not.toContain("<strong>Notes:</strong>");
    expect(result.html).not.toContain("<strong>Therapeutics:</strong>");
    expect(result.html).not.toContain("<strong>Resistances:</strong>");
    expect(result.html).not.toContain("Additional gOS results");
    expect(result.html).not.toContain("Case-level note");
    expect(result.html).not.toContain(">NOTES<");
  });

  it("replaces all results with the insufficient-quality message when QC fails", async () => {
    const result = await new MyeloSeqHtmlRenderer().render({
      ...report,
      metadata: { ...report.metadata, qcEvaluation: "FAIL" },
    });

    expect(result.html).toContain('<h2 class="section-bar">RESULTS</h2>');
    expect(result.html).toContain(
      '<section class="qc-failure-results"><h3>DNA/RNA QUANTITY/QUALITY NOT SUFFICIENT</h3>',
    );
    expect(result.html).toContain(
      "<p><strong>Note:</strong> Please refer to peripheral blood NGS findings.</p>",
    );
    expect(result.html).not.toContain("DNA Sequencing results");
    expect(result.html).not.toContain("Targeted RNA Sequencing results");
    expect(result.html).not.toContain('<section class="tier-section">');
    expect(result.html).not.toContain(
      "Variants are categorized into three tiers",
    );
    expect(result.html).not.toContain("JAK2 variant summary");
    expect(result.html).not.toContain("BCR::ABL1 variant summary");
    expect(result.html).toContain("BACKGROUND");
  });

  it("uses the fusion gene field when Variant only describes the fusion", async () => {
    const result = await new MyeloSeqHtmlRenderer().render({
      patient: { caseId: "CASE-RUNX1-FUSION" },
      alterations: [
        {
          gene: "RUNX1::RUNX1T1",
          variant: "In-Frame Fusion Exon 3::Exon 3",
          tier: "1",
          type: "Fusion",
          locus: "21:36159848-37377215,8:92966953-93115764",
        },
        {
          gene: "",
          variant: "Legacy Fusion Exon 1::Exon 2",
          tier: "2",
          type: "Fusion",
        },
      ],
    });

    expect(result.html).toContain(
      "<th>Gene(Exon)</th><th>Tier</th><th>Variant Type</th><th>Locus</th>",
    );
    expect(result.html).toContain(
      '<td class="gene-cell">RUNX1(3)::RUNX1T1(3)</td><td>1</td><td>Fusion</td><td>21:36159848-37377215,8:92966953-93115764</td>',
    );
    expect(result.html).toContain(
      "<strong>Gene Fusion:</strong> RUNX1::RUNX1T1 In-Frame Fusion Exon 3::Exon 3",
    );
    expect(result.html).not.toContain(
      '<td class="gene-cell">RUNX1::RUNX1T1 In-Frame Fusion Exon 3::Exon 3</td>',
    );
    expect(result.html).toContain(
      '<td class="gene-cell">Legacy Fusion Exon 1::Exon 2</td><td>2</td><td>Fusion</td><td></td>',
    );
  });

  it("always renders Clinical History as NA without mapping metadata", async () => {
    const result = await new MyeloSeqHtmlRenderer().render({
      patient: {
        caseId: "CASE-HISTORY",
        disease: "Patient disease",
        tumorType: "Patient type",
        tumorDetails: "Patient details",
      },
      metadata: {
        clinical_history: "Explicit history",
        disease: "Metadata disease",
        tumor_type: "Metadata type",
        tumor_details: "Metadata details",
      },
      alterations: [],
    });

    expect(result.html).toContain("<strong>Clinical History:</strong> NA");
    expect(result.html).not.toContain("Explicit history");
    expect(result.html).not.toContain("Patient disease");
    expect(result.html).not.toContain("Metadata disease");
  });

  it("includes fixed report boilerplate without legacy embedded interpretation data", async () => {
    const result = await new MyeloSeqHtmlRenderer().render(report);

    expect(result.html).toContain("Variants are categorized into three tiers");
    expect(result.html).toContain("The NYU Oncomine Myeloid panel");
    expect(result.html).toContain("Analysis is performed using Ion Reporter Software 5.18");
    expect(result.html).toContain(
      "This test is not designed for detection of germline mutations",
    );
    expect(result.html).toMatch(/^<!DOCTYPE html>[\s\S]*<\/html>$/);
    expect(result.html).not.toContain("interpretations-data");
    expect(result.html).not.toContain("Legacy embedded value");
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
    expect(result.html).not.toContain("Targeted RNA Sequencing results");
    expect(result.html).toContain("<h3>Tier 2:</h3>");
    expect(result.html).toContain("<strong>Specimen Type:</strong> NA");
    expect(result.html).toContain("<strong>Clinical History:</strong> NA");
    expect(result.html).not.toContain("N/A");
  });

  it("renders Tier 3 findings explicitly included in the report", async () => {
    const result = await new MyeloSeqHtmlRenderer().render({
      patient: { caseId: "CASE-TIER-3" },
      alterations: [
        {
          uid: "finding-tier-3",
          gene: "TET2",
          variant: "p.Gln548Ter",
          tier: "3",
          type: "SNV",
          variant_summary: "Selected Tier 3 interpretation",
        },
      ],
    });

    expect(result.html).toContain("DNA Sequencing results");
    expect(result.html).toContain("<h3>Tier 3:</h3>");
    expect(result.html).toContain("<strong>Variant:</strong> TET2, p.Gln548Ter");
    expect(result.html).toContain(
      '<strong>Comments:</strong> <span class="report-comment-value">Selected Tier 3 interpretation</span>',
    );
  });

  it("renders an empty summary without report editing metadata", async () => {
    const result = await new MyeloSeqHtmlRenderer().render({
      patient: { caseId: "CASE-EMPTY-COMMENT" },
      alterations: [
        {
          uid: 'finding-"quoted"',
          gene: "TP53",
          variant: "p.R175H",
          tier: "2",
          type: "SNV",
          variant_summary: "",
        },
      ],
    });

    expect(result.html).toContain(
      '<strong>Comments:</strong> <span class="report-comment-value"></span>',
    );
    expect(result.html).not.toContain("contenteditable");
  });

  it("renders comments without report editing metadata", async () => {
    const result = await new MyeloSeqHtmlRenderer().render({
      patient: { caseId: "CASE-NO-UID" },
      alterations: [
        {
          id: "noncanonical-id",
          gene: "TP53",
          variant: "p.R175H",
          tier: "2",
          type: "SNV",
          variant_summary: "Visible but not editable",
        },
      ],
    });

    expect(result.html).toContain(
      '<strong>Comments:</strong> <span class="report-comment-value">Visible but not editable</span>',
    );
    expect(result.html).not.toContain("data-editable-comment");
    expect(result.html).not.toContain("data-alteration-id");
  });

  it("escapes case-specific content", async () => {
    const result = await new MyeloSeqHtmlRenderer().render({
      ...report,
      alterations: [
        {
          ...report.alterations[0],
          variant_summary: "<script>alert('unsafe')</script>",
        },
      ],
    });

    expect(result.html).not.toContain("<script>alert('unsafe')</script>");
    expect(result.html).toContain(
      "&lt;script&gt;alert(&#39;unsafe&#39;)&lt;/script&gt;",
    );
  });

  it("uses NA for specimen type when primary site is disabled", async () => {
    const result = await new MyeloSeqHtmlRenderer().render({
      ...report,
      dataset: {
        schema: [{ id: "disease" }],
        fields: [{ id: "disease" }],
      },
      patient: {
        ...report.patient,
        tumorType: "SCHEMA-OMITTED-TYPE",
        tumorDetails: "SCHEMA-OMITTED-DETAILS",
        disease: "Allowed disease",
      },
      metadata: {
        ...report.metadata,
        tumor_type: "SCHEMA-OMITTED-TYPE",
        tumor_details: "SCHEMA-OMITTED-DETAILS",
        specimen_type: "SCHEMA-OMITTED-SPECIMEN",
        clinical_history: "SCHEMA-OMITTED-HISTORY",
        disease: "Allowed disease",
      },
    });

    expect(result.html).toContain("<strong>Specimen Type:</strong> NA");
    expect(result.html).toContain("<strong>Clinical History:</strong> NA");
    expect(result.html).not.toContain("Allowed disease");
    expect(result.html).not.toContain("SCHEMA-OMITTED");
  });
});
