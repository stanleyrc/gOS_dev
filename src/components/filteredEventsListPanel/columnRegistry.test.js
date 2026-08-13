/** @jest-environment node */
/* eslint-disable import/first */

jest.mock("./columnRenderers", () => ({
  TierBadgeRenderer: "TierBadgeRenderer",
  FormattedNumberRenderer: "FormattedNumberRenderer",
  StringRenderer: "StringRenderer",
  EventDetailRenderer: "EventDetailRenderer",
  LocationRenderer: "LocationRenderer",
  ClassIconRenderer: "ClassIconRenderer",
  ClinvarIconRenderer: "ClinvarIconRenderer",
  GnomadAfRenderer: "GnomadAfRenderer",
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

  it("maps external annotations to their dedicated renderers", () => {
    expect(filteredEventsColumnRegistry["clinvar-icon"]).toBe(
      "ClinvarIconRenderer",
    );
    expect(filteredEventsColumnRegistry["gnomad-af-link"]).toBe(
      "GnomadAfRenderer",
    );
    expect(getColumnRenderer("formatted-number", "gnomad_af")).toBe(
      "GnomadAfRenderer",
    );
    expect(getColumnRenderer("class-icon", "clinvar")).toBe(
      "ClinvarIconRenderer",
    );
  });

  it("keeps basic strings noninteractive", () => {
    expect(getColumnRenderer("string-basic")).toBe("StringRenderer");
  });
});
