const actions = {
  FETCH_SETTINGS_DATA_REQUEST: "FETCH_SETTINGS_DATA_REQUEST",
  FETCH_SETTINGS_DATA_SUCCESS: "FETCH_SETTINGS_DATA_SUCCESS",
  FETCH_SETTINGS_DATA_FAILED: "FETCH_SETTINGS_DATA_FAILED",

  UPDATE_DOMAINS: "UPDATE_DOMAINS",

  UPDATE_TAB: "UPDATE_TAB",

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
};

export default actions;
