/** @jest-environment node */
/* eslint-disable import/first */

jest.mock("./columnRenderers", () => ({
  TierBadgeRenderer: "TierBadgeRenderer",
  FormattedNumberRenderer: "FormattedNumberRenderer",
  StringRenderer: "StringRenderer",
  EventDetailRenderer: "EventDetailRenderer",
  LocationRenderer: "LocationRenderer",
  ClassIconRenderer: "ClassIconRenderer",
}));

import {
  filteredEventsColumnRegistry,
  getColumnRenderer,
} from "./columnRegistry";

describe("filteredEventsColumnRegistry", () => {
  it("maps event detail links to the existing detail renderer", () => {
    expect(filteredEventsColumnRegistry["event-detail-link"]).toBe(
      "EventDetailRenderer",
    );
    expect(getColumnRenderer("event-detail-link")).toBe(
      "EventDetailRenderer",
    );
  });

  it("keeps basic strings noninteractive", () => {
    expect(getColumnRenderer("string-basic")).toBe("StringRenderer");
  });
});
