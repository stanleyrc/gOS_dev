const actions = {
  LAUNCH_APPLICATION: "LAUNCH_APPLICATION",

  FETCH_SETTINGS_DATA_REQUEST: "FETCH_SETTINGS_DATA_REQUEST",
  FETCH_SETTINGS_DATA_SUCCESS: "FETCH_SETTINGS_DATA_SUCCESS",
  FETCH_SETTINGS_DATA_FAILED: "FETCH_SETTINGS_DATA_FAILED",

  UPDATE_DOMAINS: "UPDATE_DOMAINS",

  UPDATE_TAB: "UPDATE_TAB",

  UPDATE_CASE_REPORT: "UPDATE_CASE_REPORT",

  launchApplication: () => ({
    type: actions.LAUNCH_APPLICATION,
  }),

  fetchSettingsData: () => ({
    type: actions.FETCH_SETTINGS_DATA_REQUEST,
  }),

  updateDomains: (domains) => ({
    type: actions.UPDATE_DOMAINS,
    domains,
  }),

  updateTab: (tab) => ({
    type: actions.UPDATE_TAB,
    tab,
  }),

  updateCaseReport: (report) => ({
    type: actions.UPDATE_CASE_REPORT,
    report,
  }),
};

export default actions;
