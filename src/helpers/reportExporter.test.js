/** @jest-environment node */
/* eslint-disable import/first */

const { Blob: NodeBlob } = require("buffer");

global.Blob = NodeBlob;

const mockHtmlRender = jest.fn();
const mockDocxRender = jest.fn();

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
    mockHtmlRender.mockReset();
    mockDocxRender.mockReset();
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

  it("does not map raw patient values omitted by the active dataset", async () => {
    const dataset = {
      id: "schema-test",
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
