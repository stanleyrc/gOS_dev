/** @jest-environment node */
/* eslint-disable import/first */

const { Blob: NodeBlob } = require("buffer");

global.Blob = NodeBlob;

const mockClassicHtmlRender = jest.fn();
const mockHtmlRender = jest.fn();
const mockDocxRender = jest.fn();

jest.mock("./htmlRenderer", () => ({
  HtmlRenderer: class MockHtmlRenderer {
    render(report) {
      return mockClassicHtmlRender(report);
    }
  },
}));

jest.mock("./myeloSeqHtmlRenderer", () => ({
  MyeloSeqHtmlRenderer: class MockMyeloSeqHtmlRenderer {
    render(report) {
      return mockHtmlRender(report);
    }
  },
}));

jest.mock("./myeloSeqDocxRenderer", () => ({
  MyeloSeqDocxRenderer: class MockMyeloSeqDocxRenderer {
    render(report) {
      return mockDocxRender(report);
    }
  },
}));

jest.mock("./userAuth", () => ({
  getUser: jest.fn(() => ({
    userId: "test-user",
    displayName: "Test User",
  })),
}));

jest.mock("./browseScope", () => ({
  datasetHasField: (dataset, fieldId) =>
    (dataset?.fields || []).some(
      (field) => (field.id || field.name) === fieldId,
    ),
}));

import { exportReport, previewReport } from "./reportExporter";

const state = {
  dataset: { id: "dataset-1", reportStyle: "myeloseq" },
  CaseReport: {
    id: "case-1",
    metadata: {},
  },
  Interpretations: {
    byId: {},
    selected: {},
  },
};

describe("reportExporter", () => {
  let originalDocument;
  let originalUrl;

  beforeEach(() => {
    mockClassicHtmlRender.mockReset();
    mockHtmlRender.mockReset();
    mockDocxRender.mockReset();
    mockClassicHtmlRender.mockResolvedValue({
      html: "<html>classic</html>",
      mimeType: "text/html",
      filename: "report-case-1-Test User.html",
    });
    mockHtmlRender.mockResolvedValue({ html: "<html></html>" });
    mockDocxRender.mockResolvedValue({
      blob: new Blob(["PK\u0003\u0004"], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      filename: "report-case-1-Test User.docx",
    });
    originalDocument = global.document;
    originalUrl = global.URL;
  });

  afterEach(() => {
    global.document = originalDocument;
    global.URL = originalUrl;
  });

  it("includes only events selected by canonical uid", async () => {
    const mergedEvents = {
      filteredEvents: [
        { uid: "tier-1", gene: "TP53", variant: "p.R175H", tier: 1 },
        { uid: "tier-2", gene: "KRAS", variant: "p.G12D", Tier: "2" },
        { uid: "tier-3", gene: "BRAF", variant: "p.V600E", tier: 3 },
        { uid: "unranked", gene: "EGFR", variant: "p.L858R" },
      ],
    };

    await previewReport(state, mergedEvents, ["tier-2", "tier-3"]);

    const report = mockHtmlRender.mock.calls[0][0];
    expect(report.alterations.map(({ uid }) => uid)).toEqual([
      "tier-2",
      "tier-3",
    ]);
  });

  it("leaves report alterations empty when no events are selected", async () => {
    await previewReport(state, {
      filteredEvents: [
        { uid: "tier-1", gene: "TP53", variant: "p.R175H", tier: 1 },
      ],
    });

    expect(mockHtmlRender.mock.calls[0][0].alterations).toEqual([]);
  });

  it("does not promote a noncanonical event id to a selected uid", async () => {
    await previewReport(
      state,
      {
        filteredEvents: [
          { id: "fallback-id", gene: "TP53", variant: "p.R175H", tier: 1 },
        ],
      },
      ["fallback-id"],
    );

    expect(mockHtmlRender.mock.calls[0][0].alterations).toEqual([]);
  });

  it("maps available filtered-event report fields without inventing values", async () => {
    const mergedEvents = {
      filteredEvents: [
        {
          uid: "tier-1",
          gene: "JAK2",
          variant: "p.V617F",
          tier: 1,
          type: "SNV",
          eventType: "snv",
          VAF: 0.477,
          altCounts: 954,
          refCounts: 1046,
          transcript: "NM_004972.4",
          Genome_Location: "9:5073770-5073771",
          variant_summary: "Mapped to comments",
          effect_description: "Must not be comments",
        },
      ],
    };

    await previewReport(state, mergedEvents, ["tier-1"]);

    expect(mockHtmlRender.mock.calls[0][0].alterations[0]).toMatchObject({
      type: "SNV",
      eventType: "snv",
      VAF: 0.477,
      depth: 2000,
      transcript: "NM_004972.4",
      locus: "9:5073770-5073771",
      variant_summary: "Mapped to comments",
      effect_description: "Must not be comments",
    });
  });

  it("preserves fusion gene identity independently of the Variant field", async () => {
    const mergedEvents = {
      filteredEvents: [
        {
          uid: "gene-field",
          gene: "RUNX1::RUNX1T1",
          fusion_genes: "IGNORED::FALLBACK",
          Variant: "In-Frame Fusion Exon 3::Exon 3",
          type: "Fusion",
        },
        {
          uid: "legacy-gene-field",
          Gene: "PML::RARA",
          Variant: "In-Frame Fusion Exon 6::Exon 3",
          type: "Fusion",
        },
        {
          uid: "fusion-genes-field",
          gene: "",
          fusion_genes: "KMT2A::MLLT3",
          Variant: "In-Frame Fusion Exon 8::Exon 6",
          type: "Fusion",
        },
        {
          uid: "missing-gene",
          Variant: "Fusion with unavailable genes",
          type: "Fusion",
        },
      ],
    };

    await previewReport(state, mergedEvents, [
      "gene-field",
      "legacy-gene-field",
      "fusion-genes-field",
      "missing-gene",
    ]);

    expect(
      mockHtmlRender.mock.calls[0][0].alterations.map(({ gene }) => gene),
    ).toEqual([
      "RUNX1::RUNX1T1",
      "PML::RARA",
      "KMT2A::MLLT3",
      "",
    ]);
  });

  it("uses the persisted primary site in both modal HTML and DOCX without changing tumor type", async () => {
    const dataset = {
      id: "dataset-1",
      reportStyle: "myeloseq",
      fields: [{ id: "primary_site" }, { id: "tumor_type" }],
    };
    const savedState = {
      ...state, Settings: { dataset },
      CaseReport: { id: "case-1", metadata: { primary_site: "Original", tumor_type: "UNCHANGED" } },
      Interpretations: { selected: { PRIMARY_SITE: "saved" }, byId: { saved: {
        alterationId: "PRIMARY_SITE", caseId: "case-1", datasetId: "dataset-1", isCurrentUser: true,
        data: { primarySite: { value: "Bone marrow", label: "Bone marrow" } },
      } } },
    };
    global.document = { createElement: () => ({ click: jest.fn() }), body: { appendChild: jest.fn(), removeChild: jest.fn() } };
    global.URL = { createObjectURL: () => "blob:test", revokeObjectURL: jest.fn() };
    await previewReport(savedState, { filteredEvents: [] });
    await exportReport(savedState, { filteredEvents: [] });
    for (const render of [mockHtmlRender, mockDocxRender]) {
      expect(render.mock.calls[0][0].patient).toMatchObject({ primarySite: "Bone marrow", tumorType: "UNCHANGED" });
    }
    expect(savedState.CaseReport.metadata.primary_site).toBe("Original");
    savedState.Settings.dataset = { ...dataset, fields: [{ id: "tumor_type" }] };
    await previewReport(savedState, { filteredEvents: [] });
    expect(mockHtmlRender.mock.calls[1][0].patient.primarySite).toBe("");
  });

  it("does not map raw patient values omitted by the active dataset", async () => {
    const dataset = {
      id: "schema-test",
      reportStyle: "myeloseq",
      schema: [{ id: "purity" }],
      fields: [{ id: "purity" }],
    };
    const schemaState = {
      ...state,
      dataset,
      CaseReport: {
        id: "case-schema",
        metadata: {
          tumor_type: "SCHEMA-OMITTED-TYPE",
          tumor_details: "SCHEMA-OMITTED-DETAILS",
          tmb: 999,
          purity: 0.37,
          ploidy: 4.8,
        },
      },
    };

    await previewReport(schemaState, { filteredEvents: [] });

    expect(mockHtmlRender.mock.calls[0][0]).toMatchObject({
      dataset,
      patient: {
        caseId: "case-schema",
        tumorType: "",
        tumorDetails: "",
        tmb: undefined,
      },
    });
  });

  it("uses HTML for preview without preparing embedded interpretations", async () => {
    const stateWithInterpretations = {
      ...state,
      Interpretations: {
        selected: {},
        byId: {
          current: {
            authorId: "test-user",
            caseId: "case-1",
            data: { variant_summary: "Legacy embedded value" },
          },
        },
      },
    };

    await expect(
      previewReport(stateWithInterpretations, { filteredEvents: [] }),
    ).resolves.toBe("<html></html>");

    expect(mockHtmlRender).toHaveBeenCalledTimes(1);
    expect(mockDocxRender).not.toHaveBeenCalled();
    expect(mockHtmlRender.mock.calls[0][0]).not.toHaveProperty(
      "interpretations",
    );
  });

  it.each([undefined, "unknown", "myeloseq"])(
    "uses MyeloSeq preview and DOCX export for reportStyle %p",
    async (reportStyle) => {
      const anchor = { click: jest.fn() };
      global.document = {
        createElement: jest.fn(() => anchor),
        body: { appendChild: jest.fn(), removeChild: jest.fn() },
      };
      global.URL = {
        createObjectURL: jest.fn(() => "blob:myeloseq"),
        revokeObjectURL: jest.fn(),
      };
      const dataset = { id: "dataset-1", fields: [{ id: "primary_site" }] };
      if (reportStyle !== undefined) dataset.reportStyle = reportStyle;
      const myeloState = {
        ...state,
        Settings: { dataset },
        CaseReport: {
          id: "case-1",
          metadata: { primary_site: "peripheral blood" },
        },
      };

      await previewReport(myeloState, { filteredEvents: [] });
      await exportReport(myeloState, { filteredEvents: [] });

      expect(mockHtmlRender).toHaveBeenCalledTimes(1);
      expect(mockDocxRender).toHaveBeenCalledTimes(1);
      expect(mockClassicHtmlRender).not.toHaveBeenCalled();
      expect(anchor.download).toBe("report-case-1-Test User.docx");
    },
  );

  it("uses classic HTML for preview and download when explicitly selected", async () => {
    const anchor = { click: jest.fn() };
    global.document = {
      createElement: jest.fn(() => anchor),
      body: { appendChild: jest.fn(), removeChild: jest.fn() },
    };
    global.URL = {
      createObjectURL: jest.fn(() => "blob:classic"),
      revokeObjectURL: jest.fn(),
    };
    const classicState = {
      ...state,
      Settings: {
        dataset: {
          id: "classic-dataset",
          reportStyle: "classic",
          fields: [{ id: "primary_site" }],
        },
      },
      CaseReport: {
        id: "case-1",
        metadata: { primary_site: "Liver" },
      },
      Interpretations: {
        selected: { PRIMARY_SITE: "saved" },
        byId: {
          saved: {
            alterationId: "PRIMARY_SITE",
            caseId: "case-1",
            datasetId: "classic-dataset",
            isCurrentUser: true,
            data: {
              primarySite: { value: "Bone marrow", label: "Bone marrow" },
            },
          },
        },
      },
    };

    await expect(
      previewReport(classicState, { filteredEvents: [] }),
    ).resolves.toBe("<html>classic</html>");
    const result = await exportReport(classicState, { filteredEvents: [] });

    expect(mockClassicHtmlRender).toHaveBeenCalledTimes(2);
    expect(mockClassicHtmlRender.mock.calls[0][0].patient.primarySite).toBe("Liver");
    expect(mockHtmlRender).not.toHaveBeenCalled();
    expect(mockDocxRender).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      html: "<html>classic</html>",
      mimeType: "text/html",
      filename: "report-case-1-Test User.html",
    });
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.blob.type).toBe("text/html");
    expect(anchor).toMatchObject({
      href: "blob:classic",
      download: "report-case-1-Test User.html",
    });
    expect(anchor.click).toHaveBeenCalledTimes(1);
  });

  it("uses the DOCX renderer and downloads its Blob and filename", async () => {
    const anchor = { click: jest.fn() };
    global.document = {
      createElement: jest.fn(() => anchor),
      body: {
        appendChild: jest.fn(),
        removeChild: jest.fn(),
      },
    };
    global.URL = {
      createObjectURL: jest.fn(() => "blob:docx-report"),
      revokeObjectURL: jest.fn(),
    };
    const mergedEvents = {
      filteredEvents: [
        {
          uid: "tier-1",
          gene: "TP53",
          variant: "p.R175H",
          tier: 1,
          variant_summary: "Live preview override",
        },
      ],
    };

    const result = await exportReport(state, mergedEvents, ["tier-1"]);

    expect(mockDocxRender).toHaveBeenCalledTimes(1);
    expect(mockHtmlRender).not.toHaveBeenCalled();
    expect(mockDocxRender.mock.calls[0][0].alterations[0]).toMatchObject({
      uid: "tier-1",
      variant_summary: "Live preview override",
    });
    expect(result.blob).toBeInstanceOf(Blob);
    expect(global.URL.createObjectURL).toHaveBeenCalledWith(result.blob);
    expect(anchor).toMatchObject({
      href: "blob:docx-report",
      download: "report-case-1-Test User.docx",
    });
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith(
      "blob:docx-report",
    );
  });
});
