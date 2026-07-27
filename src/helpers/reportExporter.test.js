/** @jest-environment node */
/* eslint-disable import/first */

const mockRender = jest.fn();

jest.mock("./htmlRenderer", () => ({
  HtmlRenderer: class MockHtmlRenderer {
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
});
