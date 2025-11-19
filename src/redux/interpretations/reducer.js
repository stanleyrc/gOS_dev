import actions from "./actions";

const initState = {
  status: "idle",
  error: null,
  byId: {},
  selected: {},
  byGene: {},
};

export default function interpretationsReducer(state = initState, action) {
  switch (action.type) {
    case actions.FETCH_INTERPRETATIONS_FOR_CASE_REQUEST:
      return {
        ...state,
        status: "pending",
        error: null,
      };
    case actions.FETCH_INTERPRETATIONS_FOR_CASE_SUCCESS: {
      const newByGene = {};
      (action.allInterpretations || []).forEach(interpretation => {
        const gene = interpretation.gene;
        if (gene) {
          if (!newByGene[gene]) newByGene[gene] = {};
          const key = `${interpretation.alterationId}___${interpretation.authorId}___${interpretation.caseId}`;
          newByGene[gene][key] = interpretation;
        }
      });
      return {
        ...state,
        status: "succeeded",
        byId: action.byId,
        selected: action.selected,
        byGene: newByGene,
        error: null,
      };
    }
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
      
      if (!interpretation && action.deletedInterpretation) {
        const { alterationId, authorId, caseId } = action.deletedInterpretation;
        const key = `${alterationId}___${authorId}___${caseId}`;
        
        const updatedById = { ...state.byId };
        delete updatedById[key];
        
        const updatedSelected = { ...state.selected };
        if (updatedSelected[alterationId] === key) {
          delete updatedSelected[alterationId];
        }
        
        const updatedByGene = { ...state.byGene };
        Object.keys(updatedByGene).forEach(gene => {
          if (updatedByGene[gene][key]) {
            const newGeneObj = { ...updatedByGene[gene] };
            delete newGeneObj[key];
            updatedByGene[gene] = newGeneObj;
          }
        });
        
        return {
          ...state,
          status: "succeeded",
          byId: updatedById,
          selected: updatedSelected,
          byGene: updatedByGene,
          error: null,
        };
      }
      
      if (!interpretation) {
        return {
          ...state,
          status: "succeeded",
          error: null,
        };
      }
      
      const key = `${interpretation.alterationId}___${interpretation.authorId}___${interpretation.caseId}`;
      
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

      const updatedByGene = { ...state.byGene };
      const gene = mergedInterpretation.gene;
      if (gene) {
        if (!updatedByGene[gene]) updatedByGene[gene] = {};
        updatedByGene[gene][key] = mergedInterpretation;
      }

      console.log('[Reducer] New byId:', updatedById);
      console.log('[Reducer] New selected:', updatedSelected);

      return {
        ...state,
        status: "succeeded",
        byId: updatedById,
        selected: updatedSelected,
        byGene: updatedByGene,
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
    case actions.SELECT_INTERPRETATION:
      return {
        ...state,
        selected: {
          ...state.selected,
          [action.alterationId]: action.key,
        },
      };
    case actions.UPDATE_AUTHOR_NAME_REQUEST:
      return {
        ...state,
        status: "pending",
      };
    case actions.UPDATE_AUTHOR_NAME_SUCCESS: {
      const { authorId, newAuthorName } = action;
      const updatedById = {};
      const updatedByGene = { ...state.byGene };
      
      // Update all interpretations with matching authorId
      Object.entries(state.byId).forEach(([key, interpretation]) => {
        if (interpretation.authorId === authorId) {
          const updated = {
            ...interpretation,
            authorName: newAuthorName,
            lastModified: new Date().toISOString(),
          };
          updatedById[key] = updated;
          
          // Update in byGene as well
          const gene = updated.gene;
          if (gene && updatedByGene[gene] && updatedByGene[gene][key]) {
            updatedByGene[gene][key] = updated;
          }
        } else {
          updatedById[key] = interpretation;
        }
      });
      
      return {
        ...state,
        status: "succeeded",
        byId: updatedById,
        byGene: updatedByGene,
        error: null,
      };
    }
    case actions.UPDATE_AUTHOR_NAME_FAILED:
      return {
        ...state,
        status: "failed",
        error: action.error,
      };
    default:
      return state;
  }
}
