import React from "react";
import { render, screen } from "@testing-library/react";
import cohort from "../../../helpers/singleCell/__fixtures__/cohortSplicing.json";
import CohortSplicingPanel from "./cohortSplicingPanel";

jest.mock("../../../redux/singleCell/loaders", () => ({
  tryGet: (path) => Promise.resolve(path.includes("_cohort/rna/splicing.json") ? { status: "ok", data: require("../../../helpers/singleCell/__fixtures__/cohortSplicing.json") } : { status: "missing" }),
}));
if (!window.matchMedia) {
  window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
}

describe("CohortSplicingPanel", () => {
  it("lists clusters by q and draws one panel per patient plus the PSI heatmap", async () => {
    render(<CohortSplicingPanel dataset={{ id: "gbm-sc", dataPath: "data/" }} />);
    expect(await screen.findByText("1.0e-17")).toBeTruthy();
    expect(cohort.clusters.length).toBe(2);
    expect(screen.getAllByText("EGFR").length).toBeGreaterThan(0);
    // P3: small-multiple title + heatmap column header
    expect((await screen.findAllByText("P3")).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("0.80")).toBeTruthy();
  });
});
