import actions from "./actions";
import { createInterpretationHistoryKey } from "../../helpers/interpretationHistory";

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
        byId: {},
        selected: {},
      };
    case actions.FETCH_INTERPRETATIONS_FOR_CASE_SUCCESS: {
      const newByGene = {};
      (action.allInterpretations || []).forEach(interpretation => {
        const gene = interpretation.gene;
        if (gene) {
          if (!newByGene[gene]) newByGene[gene] = {};
          const historyKey = createInterpretationHistoryKey(interpretation);
          newByGene[gene][historyKey] = interpretation;
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
        byGene: {},
      };
    case actions.UPDATE_INTERPRETATION_REQUEST:
      return {
        ...state,
        status: "pending",
      };
    case actions.UPDATE_INTERPRETATION_SUCCESS: {
      const interpretation = action.interpretation;
      
      if (!interpretation && action.deletedInterpretation) {
        const deletedInterpretations = action.deletedInterpretations || [
          action.deletedInterpretation,
        ];
        const updatedById = { ...state.byId };
        const updatedSelected = { ...state.selected };
        const updatedByGene = { ...state.byGene };

        deletedInterpretations.forEach((deletedInterpretation) => {
          const { alterationId, authorId, caseId } = deletedInterpretation;
          const key = `${alterationId}___${authorId}___${caseId}`;
          delete updatedById[key];
          if (updatedSelected[alterationId] === key) {
            delete updatedSelected[alterationId];
          }

          const historyKey = createInterpretationHistoryKey(
            deletedInterpretation,
          );
          Object.keys(updatedByGene).forEach((gene) => {
            if (updatedByGene[gene][historyKey]) {
              const newGeneObj = { ...updatedByGene[gene] };
              delete newGeneObj[historyKey];
              updatedByGene[gene] = newGeneObj;
            }
          });
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
      
      const updatedById = {
        ...state.byId,
        [key]: mergedInterpretation,
      };

      let updatedSelected = { ...state.selected };
      if (interpretation.isCurrentUser) {
        updatedSelected[interpretation.alterationId] = key;
      }

      const updatedByGene = { ...state.byGene };
      const replacedInterpretations = action.replacedInterpretations || (
        action.replacedInterpretation ? [action.replacedInterpretation] : []
      );
      replacedInterpretations.forEach((replacedInterpretation) => {
        const replacedHistoryKey = createInterpretationHistoryKey(
          replacedInterpretation,
        );
        Object.keys(updatedByGene).forEach((existingGene) => {
          if (updatedByGene[existingGene][replacedHistoryKey]) {
            const newGeneObj = { ...updatedByGene[existingGene] };
            delete newGeneObj[replacedHistoryKey];
            updatedByGene[existingGene] = newGeneObj;
          }
        });
      });

      const gene = mergedInterpretation.gene;
      if (gene) {
        const geneInterpretations = { ...(updatedByGene[gene] || {}) };
        const historyKey = createInterpretationHistoryKey(mergedInterpretation);
        geneInterpretations[historyKey] = mergedInterpretation;
        updatedByGene[gene] = geneInterpretations;
      }

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
        byGene: {},
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
      const updatedByGene = {};

      Object.entries(state.byId).forEach(([key, interpretation]) => {
        updatedById[key] = interpretation.authorId === authorId
          ? {
              ...interpretation,
              authorName: newAuthorName,
              lastModified: new Date().toISOString(),
            }
          : interpretation;
      });

      Object.entries(state.byGene).forEach(([gene, interpretations]) => {
        updatedByGene[gene] = {};
        Object.entries(interpretations).forEach(([key, interpretation]) => {
          updatedByGene[gene][key] = interpretation.authorId === authorId
            ? {
                ...interpretation,
                authorName: newAuthorName,
                lastModified: new Date().toISOString(),
              }
            : interpretation;
        });
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
