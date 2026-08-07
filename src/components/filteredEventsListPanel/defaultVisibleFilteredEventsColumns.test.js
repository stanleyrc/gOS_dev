/** @jest-environment node */

import getDefaultVisibleFilteredEventsColumnKeys from "./defaultVisibleFilteredEventsColumns";

describe("getDefaultVisibleFilteredEventsColumnKeys", () => {
  it("shows every available column when the dataset default is absent", () => {
    expect(
      getDefaultVisibleFilteredEventsColumnKeys(
        ["gene", "tier", "dataset-column"],
        undefined,
        ["caller-column"],
      ),
    ).toEqual(["gene", "tier", "dataset-column", "caller-column"]);
  });

  it("uses the configured IDs as an exact allow-list of available columns", () => {
    expect(
      getDefaultVisibleFilteredEventsColumnKeys(
        ["gene", "tier", "dataset-column"],
        ["dataset-column", "unknown-column"],
        ["caller-column"],
      ),
    ).toEqual(["dataset-column", "caller-column"]);
  });

  it("accepts an empty allow-list while preserving caller-owned columns", () => {
    expect(
      getDefaultVisibleFilteredEventsColumnKeys(
        ["gene", "tier", "dataset-column"],
        [],
        ["caller-column"],
      ),
    ).toEqual(["caller-column"]);
  });
});
