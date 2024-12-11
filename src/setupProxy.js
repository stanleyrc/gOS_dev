const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function (app) {
  // Add GPT API proxy first (more specific route)
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
