import { createSelector } from "reselect";

export const getCurrentState = (state) => state;

export const getInterpretationsStatus = (state) => 
  state.Interpretations?.status || "idle";

export const selectInterpretationsById = (state) => 
  state.Interpretations?.byId || {};

export const getSelectedInterpretations = (state) => 
  state.Interpretations?.selected || {};

export const getInterpretationForAlteration = (state, alterationId) => {
  const selected = state.Interpretations?.selected || {};
  const byId = state.Interpretations?.byId || {};
  const selectedKey = selected[alterationId];
  return selectedKey ? byId[selectedKey] : null;
};

export const getAllInterpretationsForAlteration = (state, alterationId) => {
  const byId = state.Interpretations?.byId || {};
  return Object.entries(byId)
    .filter(([key]) => key.startsWith(`${alterationId}___`))
    .map(([, interpretation]) => interpretation);
};

const selectFilteredEventsState = (state) => state.FilteredEvents || {};

export const selectMergedEvents = createSelector(
  [selectFilteredEventsState, selectInterpretationsById],
  (filteredEventsState, interpretationsById) => {
    const filteredEvents = filteredEventsState.filteredEvents || [];
    const selected = filteredEventsState.selectedFilteredEvent;
    
    const mergeEventWithInterpretation = (event) => {
      if (!event) return event;
      
      const alterationId = event.uid;
      if (!alterationId) return event;
      
      const interpretationKeys = Object.keys(interpretationsById).filter(key => 
        key.startsWith(`${alterationId}___`)
      );
      
      if (interpretationKeys.length === 0) return event;
      
      let currentUserInterpretation = null;
      
      for (const key of interpretationKeys) {
        const interpretation = interpretationsById[key];
        if (interpretation?.isCurrentUser) {
          currentUserInterpretation = interpretation;
          break;
        }
      }
      
      if (!currentUserInterpretation) return event;
      
      return {
        ...event,
        ...currentUserInterpretation.data,
      };
    };
    
    const mergedEvents = filteredEvents.map(mergeEventWithInterpretation);
    const mergedSelected = mergeEventWithInterpretation(selected);
    
    return {
      ...filteredEventsState,
      filteredEvents: mergedEvents,
      selectedFilteredEvent: mergedSelected,
    };
  }
);
