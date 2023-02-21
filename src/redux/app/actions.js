const actions = {
  LAUNCH_APP: "LAUNCH_APP",
  LAUNCH_APP_SUCCESS: "LAUNCH_APP_SUCCESS",
  LAUNCH_APP_FAILED: "LAUNCH_APP_FAILED",
  launchApp: (files, selectedTags) => ({
    type: actions.LAUNCH_APP,
    files,
    selectedTags,
  })
};

export default actions;
