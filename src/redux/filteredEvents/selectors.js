import { createSelector } from "reselect";
import { selectMergedEvents } from "../interpretations/selectors";

export const getCurrentState = (state) => state;

const getExplicitlySelectedEventUids = (state) =>
  state.FilteredEvents?.selectedEventUids;

export const getDefaultSelectedEventUids = (filteredEvents) => [
  ...new Set(
    (filteredEvents || [])
      .filter(
        (event) =>
          event?.uid != null && (+event.tier === 1 || +event.tier === 2)
      )
      .map((event) => event.uid)
  ),
];

export const selectReportEventUids = createSelector(
  [getExplicitlySelectedEventUids, selectMergedEvents],
  (explicitlySelectedEventUids, mergedEvents) =>
    Array.isArray(explicitlySelectedEventUids)
      ? explicitlySelectedEventUids
      : getDefaultSelectedEventUids(mergedEvents.filteredEvents)
);
