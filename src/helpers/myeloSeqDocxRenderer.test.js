/** @jest-environment node */
/* eslint-disable import/first */

const { Blob: NodeBlob } = require("buffer");

global.Blob = NodeBlob;

const JSZip = require("jszip");

jest.mock("./browseScope", () => ({
  datasetHasField: (dataset, fieldId) =>
    (dataset?.fields || []).some(
      (field) => (field.id || field.name) === fieldId,
    ),
}));

const {
  buildMyeloSeqDocxModel,
  DOCX_MIME_TYPE,
  MyeloSeqDocxRenderer,
} = require("./myeloSeqDocxRenderer");

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
    purity: 0.42,
    ploidy: 2.1,
  },
  author: "Test User",
  notes: "Extra gOS note",
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
      variant_summary: "JAK2 variant summary",
      effect_description: "Must not become Comments",
      therapeutics: ["Ruxolitinib"],
    },
    {
      uid: "finding-bcr-abl1",
      gene: "BCR::ABL1",
      variant: "BCR(14)::ABL1(2)",
      tier: "2",
      type: "Fusion",
      eventType: "fusion",
      locus: "chr22:23632600::chr9:133729451",
      variant_summary: "BCR::ABL1 variant summary",
    },
  ],
};

async function unpackDocumentXml(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const zip = await JSZip.loadAsync(bytes);
  return {
    bytes,
    documentXml: await zip.file("word/document.xml").async("string"),
    stylesXml: await zip.file("word/styles.xml").async("string"),
  };
}

describe("MyeloSeqDocxRenderer model", () => {
  it("derives only approved specimen facts, result columns, and interpretations", () => {
    const model = buildMyeloSeqDocxModel(report);

    expect(model.specimenFacts).toEqual([
      { label: "Tumor sample", value: "CASE-001" },
      { label: "Specimen Type", value: "Bone marrow" },
      { label: "Clinical History", value: "NA" },
    ]);
    expect(model.resultTables.map(({ title, columns }) => ({ title, columns })))
      .toEqual([
        {
          title: "DNA Sequencing results",
          columns: [
            "Gene",
            "Variant",
            "Tier",
            "Variant Type",
            "VAF(%)",
            "Depth",
            "Transcript",
          ],
        },
        {
          title: "Targeted RNA Sequencing results",
          columns: ["Gene(Exon)", "Tier", "Variant Type", "Locus"],
        },
      ]);
    expect(model.resultTables[1]).toMatchObject({
      width: 10800,
      columnWidths: [3132, 864, 2268, 4536],
    });
    expect(model.resultTables[1].rows[0].map(({ value }) => value)).toEqual([
      "BCR(14)::ABL1(2)",
      "2",
      "Fusion",
      "chr22:23632600::chr9:133729451",
    ]);
    expect(model.tierSections).toEqual([
      {
        tier: "1",
        findings: [
          {
            lines: [
              { label: "Variant", value: "JAK2, c.1849G>T, p.V617F" },
              { label: "Comments", value: "JAK2 variant summary" },
            ],
          },
        ],
      },
      {
        tier: "2",
        findings: [
          {
            lines: [
              { label: "Gene Fusion", value: "BCR(14)::ABL1(2)" },
              {
                label: "Breakpoint",
                value: "chr22:23632600::chr9:133729451",
              },
              { label: "Comments", value: "BCR::ABL1 variant summary" },
            ],
          },
        ],
      },
    ]);
    expect(JSON.stringify(model)).not.toContain("Must not become Comments");
    expect(JSON.stringify(model)).not.toContain("Extra gOS note");
    expect(JSON.stringify(model)).not.toContain("Ruxolitinib");
  });

  it("uses the fusion gene field when Variant only describes the fusion", () => {
    const model = buildMyeloSeqDocxModel({
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

    expect(model.resultTables[0].columns).toEqual([
      "Gene(Exon)",
      "Tier",
      "Variant Type",
      "Locus",
    ]);
    expect(
      model.resultTables[0].rows.map((row) =>
        row.map((cell) => cell.value),
      ),
    ).toEqual([
      [
        "RUNX1(3)::RUNX1T1(3)",
        "1",
        "Fusion",
        "21:36159848-37377215,8:92966953-93115764",
      ],
      ["Legacy Fusion Exon 1::Exon 2", "2", "Fusion", ""],
    ]);
    expect(model.tierSections[0].findings[0].lines[0]).toEqual({
      label: "Gene Fusion",
      value: "RUNX1::RUNX1T1 In-Frame Fusion Exon 3::Exon 3",
    });
    expect(model.tierSections[1].findings[0].lines[0]).toEqual({
      label: "Gene Fusion",
      value: "Legacy Fusion Exon 1::Exon 2",
    });
  });

  it("uses NA when primary site is disabled and keeps Clinical History unmapped", () => {
    const model = buildMyeloSeqDocxModel({
      ...report,
      dataset: {
        schema: [{ id: "disease" }],
        fields: [{ id: "disease" }],
      },
      patient: {
        ...report.patient,
        disease: "Allowed disease",
        tumorType: "SCHEMA-OMITTED-TYPE",
        tumorDetails: "SCHEMA-OMITTED-DETAILS",
      },
      metadata: {
        specimen_type: "SCHEMA-OMITTED-SPECIMEN",
        clinical_history: "SCHEMA-OMITTED-HISTORY",
        disease: "Allowed disease",
      },
      alterations: [],
    });

    expect(model.specimenFacts).toEqual([
      { label: "Tumor sample", value: "CASE-001" },
      { label: "Specimen Type", value: "NA" },
      { label: "Clinical History", value: "NA" },
    ]);
    expect(model.resultTables).toEqual([]);
    expect(model.tierSections).toEqual([]);
    expect(JSON.stringify(model)).not.toContain("Allowed disease");
    expect(JSON.stringify(model)).not.toContain("SCHEMA-OMITTED");
  });

  it("omits unavailable optional result columns without placeholders", () => {
    const model = buildMyeloSeqDocxModel({
      patient: { caseId: "CASE-EMPTY" },
      metadata: {},
      alterations: [
        { gene: "TP53", variant: "p.R175H", tier: "2", type: "SNV" },
      ],
    });

    expect(model.specimenFacts).toEqual([
      { label: "Tumor sample", value: "CASE-EMPTY" },
      { label: "Specimen Type", value: "NA" },
      { label: "Clinical History", value: "NA" },
    ]);
    expect(model.resultTables).toHaveLength(1);
    expect(model.resultTables[0].columns).toEqual([
      "Gene",
      "Variant",
      "Tier",
      "Variant Type",
    ]);
    expect(JSON.stringify(model)).not.toContain("N/A");
  });

  it("includes Tier 3 findings explicitly included in the report", () => {
    const model = buildMyeloSeqDocxModel({
      alterations: [
        {
          gene: "TET2",
          variant: "p.Gln548Ter",
          tier: "3",
          type: "SNV",
          variant_summary: "Selected Tier 3 interpretation",
        },
      ],
    });

    expect(model.tierSections).toEqual([
      {
        tier: "3",
        findings: [
          {
            lines: [
              { label: "Variant", value: "TET2, p.Gln548Ter" },
              { label: "Comments", value: "Selected Tier 3 interpretation" },
            ],
          },
        ],
      },
    ]);
  });

  it("omits an unavailable finding identity while retaining Comments", () => {
    const model = buildMyeloSeqDocxModel({
      alterations: [
        { tier: "2", type: "SNV", variant_summary: "Summary only" },
      ],
    });

    expect(model.tierSections[0].findings[0].lines).toEqual([
      { label: "Comments", value: "Summary only" },
    ]);
  });
});

describe("MyeloSeqDocxRenderer output", () => {
  it("returns a real DOCX Blob with semantic WordprocessingML presentation", async () => {
    const result = await new MyeloSeqDocxRenderer().render(report);

    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.mimeType).toBe(DOCX_MIME_TYPE);
    expect(result.blob.type).toBe(DOCX_MIME_TYPE);
    expect(result.extension).toBe(".docx");
    expect(result.filename).toBe("report-CASE-001-Test User.docx");

    const { bytes, documentXml, stylesXml } = await unpackDocumentXml(
      result.blob,
    );
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(documentXml).toContain('<w:pgSz w:w="12240" w:h="15840"');
    expect(documentXml).toContain(
      '<w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"',
    );
    expect(stylesXml).toContain('w:ascii="Arial"');
    expect(stylesXml).toContain('<w:sz w:val="20"/>');
    expect(documentXml).toContain('w:fill="0563C1"');
    expect(documentXml).toContain('<w:color w:val="FFFFFF"/>');
    expect(documentXml).toContain("<w:tblBorders>");
    expect(documentXml).toContain('w:val="single"');

    [
      "SPECIMEN",
      "Tumor sample:",
      "Specimen Type:",
      "Clinical History:",
      "DNA Sequencing results",
      "Targeted RNA Sequencing results",
      "Variant:",
      "Gene Fusion:",
      "Breakpoint:",
      "Comments:",
      "BACKGROUND",
      "METHODS",
      "References:",
      "DISCLAIMERS",
    ].forEach((label) => expect(documentXml).toContain(label));
    expect(documentXml).toContain("JAK2 variant summary");
    expect(documentXml).toContain("BCR::ABL1 variant summary");
    expect(documentXml).not.toContain("Must not become Comments");
    expect(documentXml).not.toContain("Extra gOS note");
    expect(documentXml).not.toContain("Ruxolitinib");
    expect(documentXml).not.toContain("interpretations-data");
  });

  it("accepts an explicit DOCX filename", async () => {
    const result = await new MyeloSeqDocxRenderer().render(report, {
      filename: "reviewed-report.docx",
    });

    expect(result.filename).toBe("reviewed-report.docx");
  });
});
