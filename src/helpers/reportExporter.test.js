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
});
