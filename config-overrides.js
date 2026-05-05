const path = require("path");

module.exports = function override(webpackConfig) {
  webpackConfig.module.rules.push({
    test: /\.mjs$/,
    include: /node_modules/,
    type: "javascript/auto",
  });

  return webpackConfig;
};

module.exports.devServer = function overrideDevServer(configFunction) {
  return function (proxy, allowedHost) {
    const config = configFunction(proxy, allowedHost);

    const existingStatic = config.static;
    const staticDirs = Array.isArray(existingStatic)
      ? existingStatic
      : existingStatic
        ? [existingStatic]
        : [];

    config.static = [
      ...staticDirs,
      {
        directory: path.resolve(__dirname, "shared"),
        publicPath: "/",
        watch: false,
      },
    ];

    return config;
  };
};
