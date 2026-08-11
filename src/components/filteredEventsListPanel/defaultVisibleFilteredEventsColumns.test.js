/** @jest-environment node */

import settings from "../../../public/settings.json";
import getDefaultVisibleFilteredEventsColumnKeys, {
  orderFilteredEventsColumns,
} from "./defaultVisibleFilteredEventsColumns";

describe("getDefaultVisibleFilteredEventsColumnKeys", () => {
  it("gives Gene a 164-pixel default width", () => {
    const geneColumn = settings.filteredEventsColumns.find(
      ({ id }) => id === "gene",
    );

    expect(geneColumn.width).toBe(164);
  });

  it("places Location next to Gene in the application default columns", () => {
    const columnKeys = settings.filteredEventsColumns.map(({ id }) => id);

    expect(columnKeys.indexOf("location")).toBe(columnKeys.indexOf("gene") + 1);
  });

  it("shows every available column when the dataset default is absent", () => {
    expect(
      getDefaultVisibleFilteredEventsColumnKeys(
        ["gene", "tier", "dataset-column"],
        undefined,
        ["caller-column"],
      ),
    ).toEqual(["gene", "tier", "dataset-column", "caller-column"]);
  });

  it("uses the configured IDs as an ordered exact allow-list", () => {
    expect(
      getDefaultVisibleFilteredEventsColumnKeys(
        ["gene", "tier", "dataset-column"],
        ["dataset-column", "tier", "unknown-column", "tier"],
        ["caller-column"],
      ),
    ).toEqual(["dataset-column", "tier", "caller-column"]);
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

  it("orders configured columns first and leaves other columns stable", () => {
    const columns = [
      { key: "gene" },
      { key: "tier" },
      { key: "dataset-column" },
      { key: "other" },
    ];

    expect(
      orderFilteredEventsColumns(columns, [
        "dataset-column",
        "gene",
        "unknown-column",
      ]).map(({ key }) => key),
    ).toEqual(["dataset-column", "gene", "tier", "other"]);
  });
});
