const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function (app) {
  app.use(
    "/api/gpt-4o-mini",
    createProxyMiddleware({
      target: "https://genai-api.prod1.nyumc.org",
      changeOrigin: true,
      logLevel: "debug",
      pathRewrite: {
        "^/api/gpt-4o-mini": "/gpt-4o-mini",
      },
      secure: false
    })
  );

  app.use(
    "/api/gpt-4o",
    createProxyMiddleware({
      target: "https://genai-api.prod1.nyumc.org",
      changeOrigin: true,
      logLevel: "debug",
      pathRewrite: {
        "^/api/gpt-4o": "/gpt-4o",
      },
      secure: false
    }),
  );

  // Single-cell analysis service (services/sc-analysis); it strips the prefix itself.
  app.use(
    "/sc-api",
    createProxyMiddleware({
      target: process.env.GOS_SC_API || "http://127.0.0.1:8787",
      changeOrigin: true,
    })
  );

  app.use(
    "/api",
    createProxyMiddleware({
      target: "http://0.0.0.0:3002",
      changeOrigin: true,
      logLevel: "debug",
      pathRewrite: {
        "^/api": "/",
      },
    }),
  );

};
