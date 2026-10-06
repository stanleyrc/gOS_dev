import actions from "./actions";
import singleCellActions from "../singleCell/actions";

const emptyGroups = { A: null, B: null }; // each: { groups: [{patient, cells}], label, nCells }

const initState = {
  // "off": no analysisApi for this dataset · "loading" · "ready" · "error"
  service: "off",
  serviceError: null,
  base: null,
  context: null, // { dataset, patient }
  catalogue: [],
  geneSets: [],
  rna: null, // { available, n_cells, n_matched, ... }
  groups: emptyGroups,
  submitting: false,
  submitError: null,
  jobs: {}, // id -> status
  history: [],
  activeJobId: null,
  results: {}, // id -> result
  resultErrors: {},
  expression: { gene: null, status: "idle", values: null, max: 0, error: null },
  geneList: [],
};

const countCells = (groups) => groups.reduce((n, g) => n + g.cells.length, 0);

export default function appReducer(state = initState, action) {
  switch (action.type) {
    case singleCellActions.FETCH_SINGLE_CELL_DATA_REQUEST:
      return initState;
    case actions.SCA_INIT:
      return {
        ...initState,
        service: "loading",
        base: action.base,
        context: action.context,
      };
    case actions.SCA_DISABLED:
      return { ...initState, service: "off" };
    case actions.SCA_CATALOGUE_LOADED:
      return { ...state, catalogue: action.analyses, geneSets: action.geneSets };
    case actions.SCA_RNA_STATUS:
      return { ...state, service: "ready", rna: action.rna };
    case actions.SCA_SERVICE_ERROR:
      return { ...state, service: "error", serviceError: action.error };
    case actions.SCA_SET_GROUP:
      return {
        ...state,
        groups: {
          ...state.groups,
          [action.side]: action.groups?.length
            ? { groups: action.groups, label: action.label, nCells: countCells(action.groups) }
            : null,
        },
      };
    case actions.SCA_CLEAR_GROUPS:
      return { ...state, groups: emptyGroups };
    case actions.SCA_SUBMIT_JOB:
      return { ...state, submitting: true, submitError: null };
    case actions.SCA_SUBMIT_FAILED:
      return { ...state, submitting: false, submitError: action.error };
    case actions.SCA_JOB_UPDATED: {
      const job = action.job;
      const history = state.history.some((j) => j.id === job.id)
        ? state.history.map((j) => (j.id === job.id ? job : j))
        : [job, ...state.history];
      return {
        ...state,
        submitting: action.fromSubmit ? false : state.submitting,
        jobs: { ...state.jobs, [job.id]: job },
        history,
        activeJobId: action.fromSubmit ? job.id : state.activeJobId,
      };
    }
    case actions.SCA_HISTORY_LOADED:
      return {
        ...state,
        history: action.jobs,
        jobs: Object.fromEntries(action.jobs.map((j) => [j.id, j])),
      };
    case actions.SCA_SELECT_JOB:
      return { ...state, activeJobId: action.id };
    case actions.SCA_RESULT_LOADED:
      return { ...state, results: { ...state.results, [action.id]: action.result } };
    case actions.SCA_RESULT_FAILED:
      return { ...state, resultErrors: { ...state.resultErrors, [action.id]: action.error } };
    case actions.SCA_FETCH_EXPRESSION:
      return {
        ...state,
        expression: { gene: action.gene, status: "loading", values: null, max: 0, error: null },
      };
    case actions.SCA_EXPRESSION_LOADED:
      if (action.gene !== state.expression.gene) return state;
      return {
        ...state,
        expression: {
          gene: action.resolvedGene || action.gene,
          status: "ok",
          values: action.values,
          max: action.max,
          error: null,
        },
      };
    case actions.SCA_EXPRESSION_FAILED:
      if (action.gene !== state.expression.gene) return state;
      return { ...state, expression: { ...state.expression, status: "error", error: action.error } };
    case actions.SCA_GENE_LIST_UPDATED:
      return { ...state, geneList: [...new Set(action.genes || [])] };
    case actions.SCA_CLEAR_EXPRESSION:
      return { ...state, expression: initState.expression };
    default:
      return state;
  }
}
