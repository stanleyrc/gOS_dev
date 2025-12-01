const releaseLabel =
  process.env.REACT_APP_RELEASE_TAG ||
  process.env.REACT_APP_RELEASE_COMMIT ||
  "local-dev";

const siteConfig = {
  siteName: "gOS",
  footerText: `gOS ©${new Date().getFullYear()} Created by C. Xanthopoulakis | ${releaseLabel}`,
  releaseLabel,
};

const language = "english";

export { siteConfig, language };
