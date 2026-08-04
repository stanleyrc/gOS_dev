/** @jest-environment node */

import filteredEventsActions from "./filteredEvents/actions";
import filteredEventsReducer from "./filteredEvents/reducer";
import ppfitActions from "./ppfit/actions";
import ppfitReducer from "./ppfit/reducer";
import populationActions from "./populationStatistics/actions";
import populationReducer from "./populationStatistics/reducer";
import sageQcActions from "./sageQc/actions";
import sageQcReducer from "./sageQc/reducer";
import snvplicityActions from "./snvplicity/actions";
import snvplicityReducer from "./snvplicity/reducer";
import highlightsActions from "./highlights/actions";
import highlightsReducer from "./highlights/reducer";

const sources = [
  {
    name: "filtered events",
    reducer: filteredEventsReducer,
    actions: filteredEventsActions,
    request: "FETCH_FILTERED_EVENTS_REQUEST",
    success: "FETCH_FILTERED_EVENTS_SUCCESS",
    missing: "FETCH_FILTERED_EVENTS_MISSING",
    failed: "FETCH_FILTERED_EVENTS_FAILED",
    successPayload: { filteredEvents: [] },
  },
  {
    name: "purity-ploidy fit",
    reducer: ppfitReducer,
    actions: ppfitActions,
    request: "FETCH_PPFIT_DATA_REQUEST",
    success: "FETCH_PPFIT_DATA_SUCCESS",
    missing: "FETCH_PPFIT_DATA_MISSING",
    failed: "FETCH_PPFIT_DATA_FAILED",
    successPayload: {
      data: {
        settings: {},
        intervals: [{ id: "interval" }],
        connections: [],
        intervalBins: {},
        frameConnections: [],
      },
    },
  },
  {
    name: "population statistics",
    reducer: populationReducer,
    actions: populationActions,
    request: "FETCH_POPULATION_STATISTICS_REQUEST",
    success: "FETCH_POPULATION_STATISTICS_SUCCESS",
    missing: "FETCH_POPULATION_STATISTICS_MISSING",
    failed: "FETCH_POPULATION_STATISTICS_FAILED",
    successPayload: { general: [{ id: "tmb" }], tumor: [] },
  },
];

describe.each(sources)(
  "$name missing lifecycle",
  ({ reducer, actions, request, success, missing, failed, successPayload }) => {
    it("represents absence without an error", () => {
      expect(reducer(undefined, { type: actions[missing] })).toMatchObject({
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
      expect(
        reducer(missingState, { type: actions[success], ...successPayload })
      ).toMatchObject({
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
  }
);

describe("optional detail assets", () => {
  it("retains independent Sage QC image presence and errors", () => {
    const imageError = new Error("image failed");
    const state = sageQcReducer(undefined, {
      type: sageQcActions.FETCH_SAGEQC_MISSING,
      coverageOriginalPresent: true,
      coverageDenoisedError: imageError,
    });

    expect(state).toMatchObject({
      missing: true,
      error: null,
      coverageOriginalPresent: true,
      coverageOriginalError: null,
      coverageDenoisedPresent: false,
      coverageDenoisedError: imageError,
    });
  });

  it("retains independent Purity-Ploidy image presence and errors", () => {
    const imageError = new Error("image failed");
    const state = snvplicityReducer(undefined, {
      type: snvplicityActions.FETCH_SNVPLICITY_DATA_MISSING,
      purpleSunrisePresent: true,
      hetsnpsImageError: imageError,
    });

    expect(state).toMatchObject({
      missing: true,
      error: null,
      purpleSunrisePresent: true,
      purpleSunriseError: null,
      hetsnpsImagePresent: false,
      hetsnpsImageError: imageError,
    });
  });

  it("clears stale optional assets on a new request", () => {
    const loaded = snvplicityReducer(undefined, {
      type: snvplicityActions.FETCH_SNVPLICITY_DATA_SUCCESS,
      imagePresent: true,
      purpleSunrisePresent: true,
      hetsnpsImagePresent: true,
    });

    expect(
      snvplicityReducer(loaded, {
        type: snvplicityActions.FETCH_SNVPLICITY_DATA_REQUEST,
      })
    ).toMatchObject({
      loading: true,
      missing: false,
      imagePresent: false,
      purpleSunrisePresent: false,
      hetsnpsImagePresent: false,
    });
  });
});

describe("highlights failures", () => {
  it("keeps a true failure renderable instead of marking it missing", () => {
    const error = new Error("failed");
    expect(
      highlightsReducer(undefined, {
        type: highlightsActions.FETCH_HIGHLIGHTS_DATA_FAILED,
        error,
      })
    ).toMatchObject({
      highlightsMissing: false,
      error,
      loading: false,
    });
  });
});
