/** @jest-environment node */
/* eslint-disable import/first */

const mockRender = jest.fn();

jest.mock("./myeloSeqHtmlRenderer", () => ({
  MyeloSeqHtmlRenderer: class MockMyeloSeqHtmlRenderer {
    render(report) {
      return mockRender(report);
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

import { previewReport } from "./reportExporter";

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
  beforeEach(() => {
    mockRender.mockReset();
    mockRender.mockResolvedValue({ html: "<html></html>" });
  });

  it("automatically includes all merged Tier 1 and Tier 2 events", async () => {
    const mergedEvents = {
      filteredEvents: [
        { uid: "tier-1", gene: "TP53", variant: "p.R175H", tier: 1 },
        { uid: "tier-2", gene: "KRAS", variant: "p.G12D", Tier: "2" },
        { uid: "tier-3", gene: "BRAF", variant: "p.V600E", tier: 3 },
        { uid: "unranked", gene: "EGFR", variant: "p.L858R" },
      ],
    };

    await previewReport(state, mergedEvents);

    const report = mockRender.mock.calls[0][0];
    expect(report.alterations.map(({ id }) => id)).toEqual([
      "tier-1",
      "tier-2",
    ]);
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
          effect_description: "Mapped to comments",
        },
      ],
    };

    await previewReport(state, mergedEvents);

    expect(mockRender.mock.calls[0][0].alterations[0]).toMatchObject({
      type: "SNV",
      eventType: "snv",
      VAF: 0.477,
      depth: 2000,
      transcript: "NM_004972.4",
      locus: "9:5073770-5073771",
      effect_description: "Mapped to comments",
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

    expect(mockRender.mock.calls[0][0]).toMatchObject({
      dataset,
      patient: {
        caseId: "case-schema",
        tumorType: "",
        tumorDetails: "",
        tmb: undefined,
      },
    });
  });
});
