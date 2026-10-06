const actions = {
  SCA_INIT: "SCA_INIT",
  SCA_DISABLED: "SCA_DISABLED",
  SCA_CATALOGUE_LOADED: "SCA_CATALOGUE_LOADED",
  SCA_RNA_STATUS: "SCA_RNA_STATUS",
  SCA_SERVICE_ERROR: "SCA_SERVICE_ERROR",

  SCA_SET_GROUP: "SCA_SET_GROUP",
  SCA_CLEAR_GROUPS: "SCA_CLEAR_GROUPS",

  SCA_SUBMIT_JOB: "SCA_SUBMIT_JOB",
  SCA_JOB_UPDATED: "SCA_JOB_UPDATED",
  SCA_SUBMIT_FAILED: "SCA_SUBMIT_FAILED",
  SCA_SELECT_JOB: "SCA_SELECT_JOB",
  SCA_RESULT_LOADED: "SCA_RESULT_LOADED",
  SCA_RESULT_FAILED: "SCA_RESULT_FAILED",
  SCA_HISTORY_LOADED: "SCA_HISTORY_LOADED",

  SCA_FETCH_EXPRESSION: "SCA_FETCH_EXPRESSION",
  SCA_EXPRESSION_LOADED: "SCA_EXPRESSION_LOADED",
  SCA_EXPRESSION_FAILED: "SCA_EXPRESSION_FAILED",
  SCA_CLEAR_EXPRESSION: "SCA_CLEAR_EXPRESSION",
  SCA_GENE_LIST_UPDATED: "SCA_GENE_LIST_UPDATED",

  /** groups: [{ patient, cells: [cellId] }], label: short display name */
  setGroup: (side, groups, label) => ({ type: actions.SCA_SET_GROUP, side, groups, label }),
  clearGroups: () => ({ type: actions.SCA_CLEAR_GROUPS }),
  /** body: { analysis, params, sourceJob? } — groups and labels come from state */
  submitJob: (analysis, params, sourceJob = null) => ({
    type: actions.SCA_SUBMIT_JOB,
    analysis,
    params,
    sourceJob,
  }),
  selectJob: (id) => ({ type: actions.SCA_SELECT_JOB, id }),
  fetchExpression: (gene) => ({ type: actions.SCA_FETCH_EXPRESSION, gene }),
  clearExpression: () => ({ type: actions.SCA_CLEAR_EXPRESSION }),
  /** Genes picked in the RNA tab (volcano, table); shown beside the tree. */
  setGeneList: (genes) => ({ type: actions.SCA_GENE_LIST_UPDATED, genes }),
};

export default actions;
