import React from "react";
import { render, screen } from "@testing-library/react";
import cohort from "../../../helpers/singleCell/__fixtures__/cohortSplicing.json";
import CohortSplicingPanel from "./cohortSplicingPanel";

jest.mock("../../../redux/singleCell/loaders", () => ({
  tryGet: (path) => Promise.resolve(path.includes("_cohort/rna/splicing.json") ? { status: "ok", data: require("../../../helpers/singleCell/__fixtures__/cohortSplicing.json") } : { status: "missing" }),
}));
// igv.js is ESM-only: the findings list's IGV panel is not exercised here
jest.mock("../cellIgvPanel", () => ({ __esModule: true, default: () => null, SC_MAX_RNA_TRACKS: 8 }));
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
    expect(screen.getAllByText("0.80").length).toBeGreaterThan(0);
  });
  it("lists the findings of every patient with a patient tag", async () => {
    render(<CohortSplicingPanel dataset={{ id: "gbm-sc-findings", dataPath: "data/" }} />);
    expect(await screen.findByText(/PTPRZ1: 9 of 10 reads/)).toBeTruthy();
    expect(screen.getAllByText("P2").length).toBeGreaterThan(0);
  });
});
