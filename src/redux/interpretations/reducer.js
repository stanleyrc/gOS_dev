import actions from "./actions";

const initState = {
  status: "idle",
  error: null,
  byId: {},
  selected: {},
};

export default function interpretationsReducer(state = initState, action) {
  switch (action.type) {
    case actions.FETCH_INTERPRETATIONS_FOR_CASE_REQUEST:
      return {
        ...state,
        status: "pending",
        error: null,
      };
    case actions.FETCH_INTERPRETATIONS_FOR_CASE_SUCCESS:
      return {
        ...state,
        status: "succeeded",
        byId: action.byId,
        selected: action.selected,
        error: null,
      };
    case actions.FETCH_INTERPRETATIONS_FOR_CASE_FAILED:
      return {
        ...state,
        status: "failed",
        error: action.error,
        byId: {},
        selected: {},
      };
    case actions.UPDATE_INTERPRETATION_REQUEST:
      return {
        ...state,
        status: "pending",
      };
    case actions.UPDATE_INTERPRETATION_SUCCESS: {
      const interpretation = action.interpretation;
      const key = `${interpretation.alterationId}___${interpretation.authorId}`;
      
      console.log('[Reducer] UPDATE_INTERPRETATION_SUCCESS:', { interpretation, key });
      console.log('[Reducer] Existing byId:', state.byId);
      
      const existingInterpretation = state.byId[key];
      const mergedInterpretation = existingInterpretation 
        ? {
            ...existingInterpretation,
            ...interpretation,
            data: {
              ...(existingInterpretation.data || {}),
              ...(interpretation.data || {}),
            },
          }
        : interpretation;
      
      console.log('[Reducer] Merged interpretation:', mergedInterpretation);
      
      const updatedById = {
        ...state.byId,
        [key]: mergedInterpretation,
      };

      let updatedSelected = { ...state.selected };
      if (interpretation.isCurrentUser) {
        updatedSelected[interpretation.alterationId] = key;
      }
      
      console.log('[Reducer] New byId:', updatedById);
      console.log('[Reducer] New selected:', updatedSelected);

      return {
        ...state,
        status: "succeeded",
        byId: updatedById,
        selected: updatedSelected,
        error: null,
      };
    }
    case actions.UPDATE_INTERPRETATION_FAILED:
      return {
        ...state,
        status: "failed",
        error: action.error,
      };
    case actions.CLEAR_CASE_INTERPRETATIONS_REQUEST:
      return {
        ...state,
        status: "pending",
        error: null,
      };
    case actions.CLEAR_CASE_INTERPRETATIONS_SUCCESS:
      return {
        ...state,
        status: "succeeded",
        byId: {},
        selected: {},
        error: null,
      };
    case actions.CLEAR_CASE_INTERPRETATIONS_FAILED:
      return {
        ...state,
        status: "failed",
        error: action.error,
      };
    default:
      return state;
  }
}
