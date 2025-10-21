export const getCurrentState = (state) => state;

export const getInterpretationsStatus = (state) => 
  state.Interpretations?.status || "idle";

export const getInterpretationsById = (state) => 
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
