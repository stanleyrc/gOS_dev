/** @jest-environment node */

import {
  firstEnabledDetailTab,
  getDetailTabAvailability,
  sourceKeepsTabEnabled,
} from "./detailTabAvailability";

const missingSource = () => ({ loading: false, missing: true, error: null });
const availableSource = () => ({
  loading: false,
  missing: false,
  error: null,
});

const baseState = () => ({
  CaseReport: { metadata: { beta: 2, gamma: 1 } },
  FilteredEvents: missingSource(),
  Genome: missingSource(),
  GenomeCoverage: missingSource(),
  MethylationBetaCoverage: missingSource(),
  MethylationIntensityCoverage: missingSource(),
  Hetsnps: missingSource(),
  Mutations: missingSource(),
  Allelic: missingSource(),
  Igv: missingSource(),
  PopulationStatistics: missingSource(),
  SageQc: missingSource(),
  Ppfit: missingSource(),
  Snvplicity: missingSource(),
  SignatureStatistics: missingSource(),
});

describe("sourceKeepsTabEnabled", () => {
  it("disables only a resolved missing source", () => {
    expect(sourceKeepsTabEnabled(missingSource())).toBe(false);
    expect(sourceKeepsTabEnabled(availableSource())).toBe(true);
    expect(
      sourceKeepsTabEnabled({ loading: true, missing: false, error: null })
    ).toBe(true);
    expect(
      sourceKeepsTabEnabled({
        loading: false,
        missing: false,
        error: new Error("failed"),
      })
    ).toBe(true);
  });
});

describe("detail tab availability", () => {
  it("keeps Summary enabled when every optional source is missing", () => {
    const availability = getDetailTabAvailability(baseState());

    expect(availability).toMatchObject({
      0: true,
      1: false,
      2: false,
      3: false,
      4: false,
      5: false,
      6: false,
    });
  });

  it.each([
    ["available", availableSource()],
    ["loading", { loading: true, missing: false, error: null }],
    ["failed", { loading: false, missing: false, error: new Error("failed") }],
  ])("keeps Genome View enabled for one %s track", (_name, source) => {
    const state = baseState();
    state.Mutations = source;

    expect(getDetailTabAvailability(state)[2]).toBe(true);
  });

  it("lets optional Variant QC assets independently keep the tab enabled", () => {
    const presentState = baseState();
    presentState.SageQc.coverageOriginalPresent = true;
    expect(getDetailTabAvailability(presentState)[4]).toBe(true);

    const failedState = baseState();
    failedState.SageQc.coverageDenoisedError = new Error("failed");
    expect(getDetailTabAvailability(failedState)[4]).toBe(true);
  });

  it("does not count an empty PP fit slice without numeric beta and gamma", () => {
    const state = baseState();
    state.CaseReport.metadata = { beta: "2", gamma: 1 };
    state.Ppfit = availableSource();

    expect(getDetailTabAvailability(state)[5]).toBe(false);
  });

  it("keeps Purity-Ploidy enabled for renderable PP fit intervals", () => {
    const state = baseState();
    state.CaseReport.metadata = {};
    state.Ppfit = {
      ...availableSource(),
      data: { intervals: [{ chromosome: "1" }] },
    };

    expect(getDetailTabAvailability(state)[5]).toBe(true);
  });

  it("keeps Purity-Ploidy enabled for a failed fit or an optional asset", () => {
    const failedFitState = baseState();
    failedFitState.CaseReport.metadata = { beta: null, gamma: null };
    failedFitState.Ppfit = {
      loading: false,
      missing: false,
      error: new Error("failed"),
    };
    expect(getDetailTabAvailability(failedFitState)[5]).toBe(true);

    const imageState = baseState();
    imageState.Snvplicity.purpleSunrisePresent = true;
    expect(getDetailTabAvailability(imageState)[5]).toBe(true);
  });
});

describe("firstEnabledDetailTab", () => {
  it("returns the first enabled tab in route order", () => {
    expect(
      firstEnabledDetailTab({
        0: false,
        1: false,
        2: true,
        3: true,
      })
    ).toBe("2");
  });

  it("returns null when every tab is disabled", () => {
    expect(
      firstEnabledDetailTab({
        0: false,
        1: false,
        2: false,
        3: false,
        4: false,
        5: false,
        6: false,
      })
    ).toBeNull();
  });
});
