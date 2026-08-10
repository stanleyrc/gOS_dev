/** @jest-environment node */

jest.mock("../../helpers/userAuth", () => ({
  getCurrentUserId: () => "user-1",
}));

import actions from "./actions";
import reducer from "./reducer";
import { selectReportEventUids } from "./selectors";

describe("FilteredEvents report selection", () => {
  it("shows all tiers by default and restores that default for a new fetch", () => {
    const initial = reducer(undefined, { type: "@@INIT" });
    expect(initial.columnFilters).toEqual({ tier: [1, 2, 3] });

    const changed = reducer(initial, actions.setColumnFilters({ tier: [1] }));
    const next = reducer(changed, actions.fetchFilteredEvents());
    expect(next.columnFilters).toEqual({ tier: [1, 2, 3] });
  });

  it("tracks canonical event UIDs selected for the report", () => {
    const selected = reducer(
      undefined,
      actions.setSelectedEventUids(["event-1"]),
    );
    const added = reducer(
      selected,
      actions.toggleEventUidSelection("event-2", true),
    );
    const removed = reducer(
      added,
      actions.toggleEventUidSelection("event-1", false),
    );

    expect(added.selectedEventUids).toEqual(["event-1", "event-2"]);
    expect(removed.selectedEventUids).toEqual(["event-2"]);
  });

  it("derives default selection from interpretation-merged Tier 1 and 2 events", () => {
    const state = {
      FilteredEvents: {
        filteredEvents: [
          { uid: "retiered-to-2", tier: 3 },
          { uid: "retiered-to-3", tier: 2 },
          { uid: "tier-1", tier: 1 },
        ],
        selectedEventUids: null,
      },
      Interpretations: {
        byId: {
          "retiered-to-2___user-1___case-1": {
            alterationId: "retiered-to-2",
            caseId: "case-1",
            datasetId: "dataset-1",
            isCurrentUser: true,
            data: { tier: "2" },
          },
          "retiered-to-3___user-1___case-1": {
            alterationId: "retiered-to-3",
            caseId: "case-1",
            datasetId: "dataset-1",
            isCurrentUser: true,
            data: { tier: "3" },
          },
        },
        selected: {
          "retiered-to-2": "retiered-to-2___user-1___case-1",
          "retiered-to-3": "retiered-to-3___user-1___case-1",
        },
      },
      CaseReport: { id: "case-1" },
      Settings: { dataset: { id: "dataset-1" } },
    };

    expect(selectReportEventUids(state)).toEqual([
      "retiered-to-2",
      "tier-1",
    ]);

    expect(
      selectReportEventUids({
        ...state,
        FilteredEvents: {
          ...state.FilteredEvents,
          selectedEventUids: [],
        },
      })
    ).toEqual([]);
  });

  it("returns report selection to automatic defaults when a new fetch begins", () => {
    const selected = reducer(
      undefined,
      actions.setSelectedEventUids(["event-from-previous-case"]),
    );

    const next = reducer(selected, actions.fetchFilteredEvents());

    expect(next.selectedEventUids).toBeNull();
  });
});
