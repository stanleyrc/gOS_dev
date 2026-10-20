/** @jest-environment node */
import zlib from "zlib";

// d3 is ESM-only (Jest cannot parse it) and only reached through import-time helpers: a chainable stand-in is enough.
jest.mock("d3", () => {
  const chain = new Proxy(function chainFn() {}, { get: (t, p) => (p === Symbol.toPrimitive ? () => 0 : chain), apply: () => chain });
  return new Proxy({}, { get: (t, p) => (p === "__esModule" ? true : chain) });
});

jest.mock("axios", () => {
  const fn = { get: jest.fn(), head: jest.fn(), isCancel: () => false };
  return { __esModule: true, default: fn, ...fn };
});

// the jest node sandbox may not expose these Node 18 globals
if (typeof DecompressionStream === "undefined") global.DecompressionStream = require("stream/web").DecompressionStream;
if (typeof TextDecoder === "undefined") global.TextDecoder = require("util").TextDecoder;

// fresh module instances per test (the loader caches the index and the HEAD checks)
function load() {
  jest.resetModules();
  return { axios: require("axios").default, tryGet: require("./loaders").tryGet };
}

const ROOT = "https://h.org/gOS/data/";
const mtime = 1760000000000;
const body = JSON.stringify({ hello: "gz" });
const buf = (b) => { const g = zlib.gzipSync(Buffer.from(b)); return g.buffer.slice(g.byteOffset, g.byteOffset + g.byteLength); };
const index = (extra = {}) => ({
  data: { schemaVersion: 2, files: { "P/a.json": { source: "P/a.json", size: 10, mtime, derived: false }, "P/snv_variants.json": { source: "P/snv_matrix.json", size: 99, mtime, derived: true }, ...extra } },
  headers: { "content-type": "application/json" },
});

function setup(axios, { headSize = 10, plain = { data: { hello: "plain" }, headers: { "content-type": "application/json" } } } = {}) {
  axios.get.mockImplementation(async (url) => {
    if (url.endsWith("gz_index.json")) return index();
    if (url.endsWith(".gz")) return { data: buf(body), headers: {} };
    return plain;
  });
  axios.head.mockImplementation(async () => ({ headers: { "content-length": `${headSize}`, "last-modified": new Date(mtime).toUTCString() } }));
}

jest.setTimeout(60000); // first require transforms the loader module graph

describe("tryGet with gz_index.json", () => {
  it("reads the .gz while the source is unchanged", async () => {
    const { axios, tryGet } = load();
    setup(axios);
    const r = await tryGet(`${ROOT}P/a.json`);
    expect(r).toEqual({ status: "ok", data: { hello: "gz" } });
    expect(axios.get.mock.calls.some(([u]) => u.endsWith("P/a.json.gz"))).toBe(true);
  });
  it("falls back to the plain file when the source changed", async () => {
    const { axios, tryGet } = load();
    setup(axios, { headSize: 11 });
    expect((await tryGet(`${ROOT}P/a.json`)).data).toEqual({ hello: "plain" });
  });
  it("never reads a derived file whose source changed", async () => {
    const { axios, tryGet } = load();
    setup(axios, { headSize: 11 });
    expect((await tryGet(`${ROOT}P/snv_variants.json`)).status).toBe("missing");
  });
});
