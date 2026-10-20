// igv.js is ~1.3 MB: load it on first use (own webpack chunk) instead of in the main bundle.
// Same createBrowser / removeBrowser surface the panels use.
let loaded = null;
let pending = null;

function load() {
  if (!pending) {
    pending = import("../../../node_modules/igv/dist/igv.esm.min.js").then((m) => {
      loaded = m.default;
      return loaded;
    });
    pending.catch(() => {
      pending = null;
    });
  }
  return pending;
}

const igv = {
  createBrowser: async (...args) => (await load()).createBrowser(...args),
  // a browser can only exist once igv has loaded
  removeBrowser: (browser) => (loaded ? loaded.removeBrowser(browser) : undefined),
};

export default igv;
