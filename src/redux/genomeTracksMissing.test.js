/** @jest-environment node */

import genomeActions from "./genome/actions";
import genomeReducer from "./genome/reducer";
import genomeCoverageActions from "./genomeCoverage/actions";
import genomeCoverageReducer from "./genomeCoverage/reducer";
import methylationBetaActions from "./methylationBetaCoverage/actions";
import methylationBetaReducer from "./methylationBetaCoverage/reducer";
import methylationIntensityActions from "./methylationIntensityCoverage/actions";
import methylationIntensityReducer from "./methylationIntensityCoverage/reducer";
import hetsnpsActions from "./hetsnps/actions";
import hetsnpsReducer from "./hetsnps/reducer";
import mutationsActions from "./mutations/actions";
import mutationsReducer from "./mutations/reducer";
import allelicActions from "./allelic/actions";
import allelicReducer from "./allelic/reducer";
import igvActions from "./igv/actions";
import igvReducer from "./igv/reducer";

const tracks = [
  {
    name: "genome",
    reducer: genomeReducer,
    actions: genomeActions,
    request: "FETCH_GENOME_DATA_REQUEST",
    success: "FETCH_GENOME_DATA_SUCCESS",
    failed: "FETCH_GENOME_DATA_FAILED",
    missing: "FETCH_GENOME_DATA_MISSING",
  },
  {
    name: "genome coverage",
    reducer: genomeCoverageReducer,
    actions: genomeCoverageActions,
    request: "FETCH_COVERAGE_DATA_REQUEST",
    success: "FETCH_COVERAGE_DATA_SUCCESS",
    failed: "FETCH_COVERAGE_DATA_FAILED",
    missing: "FETCH_COVERAGE_DATA_MISSING",
  },
  {
    name: "methylation beta coverage",
    reducer: methylationBetaReducer,
    actions: methylationBetaActions,
    request: "FETCH_METHYLATION_BETA_DATA_REQUEST",
    success: "FETCH_METHYLATION_BETA_DATA_SUCCESS",
    failed: "FETCH_METHYLATION_BETA_DATA_FAILED",
    missing: "FETCH_METHYLATION_BETA_DATA_MISSING",
  },
  {
    name: "methylation intensity coverage",
    reducer: methylationIntensityReducer,
    actions: methylationIntensityActions,
    request: "FETCH_METHYLATION_INTENSITY_DATA_REQUEST",
    success: "FETCH_METHYLATION_INTENSITY_DATA_SUCCESS",
    failed: "FETCH_METHYLATION_INTENSITY_DATA_FAILED",
    missing: "FETCH_METHYLATION_INTENSITY_DATA_MISSING",
  },
  {
    name: "heterozygous SNPs",
    reducer: hetsnpsReducer,
    actions: hetsnpsActions,
    request: "FETCH_HETSNPS_DATA_REQUEST",
    success: "FETCH_HETSNPS_DATA_SUCCESS",
    failed: "FETCH_HETSNPS_DATA_FAILED",
    missing: "FETCH_HETSNPS_DATA_MISSING",
  },
  {
    name: "mutations",
    reducer: mutationsReducer,
    actions: mutationsActions,
    request: "FETCH_MUTATIONS_DATA_REQUEST",
    success: "FETCH_MUTATIONS_DATA_SUCCESS",
    failed: "FETCH_MUTATIONS_DATA_FAILED",
    missing: "FETCH_MUTATIONS_DATA_MISSING",
  },
  {
    name: "allelic copy number",
    reducer: allelicReducer,
    actions: allelicActions,
    request: "FETCH_ALLELIC_DATA_REQUEST",
    success: "FETCH_ALLELIC_DATA_SUCCESS",
    failed: "FETCH_ALLELIC_DATA_FAILED",
    missing: "FETCH_ALLELIC_DATA_MISSING",
  },
  {
    name: "IGV alignments",
    reducer: igvReducer,
    actions: igvActions,
    request: "FETCH_IGV_DATA_REQUEST",
    success: "FETCH_IGV_DATA_SUCCESS",
    failed: "FETCH_IGV_DATA_FAILED",
    missing: "FETCH_IGV_DATA_MISSING",
  },
];

describe.each(tracks)("$name missing state", ({ reducer, actions, request, success, failed, missing }) => {
  it("represents an absent resource without an error", () => {
    const state = reducer(undefined, { type: actions[missing] });

    expect(state).toMatchObject({
      loading: false,
      missing: true,
      error: null,
    });
  });

  it("clears stale missing state for every other lifecycle outcome", () => {
    const missingState = reducer(undefined, { type: actions[missing] });
    const error = new Error("failed");

    expect(reducer(missingState, { type: actions[request] })).toMatchObject({
      loading: true,
      missing: false,
      error: null,
    });
    expect(reducer(missingState, { type: actions[success] })).toMatchObject({
      loading: false,
      missing: false,
      error: null,
    });
    expect(
      reducer(missingState, { type: actions[failed], error })
    ).toMatchObject({
      loading: false,
      missing: false,
      error,
    });
  });
});
