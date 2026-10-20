/* global DecompressionStream */
// Fetch + decode a columnar SNV cell matrix (snvColumnar.js) in a Web Worker,
// so neither the download nor the decode blocks the page. The worker source
// is built from fillDense's own source (it is self-contained), so the decoder
// in the worker is the tested one. Falls back to the main thread when Workers
// or Blob URLs are unavailable (tests, old browsers).
import { fillDense } from "./snvColumnar";

let workerUrl = null;

function workerSource() {
  return `var fillDense = ${fillDense.toString()};
function get(url, range, gz) {
  var h = {};
  if (range) h.Range = "bytes=" + range[0] + "-" + (range[1] - 1);
  return fetch(gz || url, { headers: h }).then(function (r) {
    if (!r.ok) {
      if (gz) return get(url, range, null); // no .gz copy: the plain file
      throw new Error(url + ": HTTP " + r.status);
    }
    // a server that labels .gz with Content-Encoding: gzip has the browser inflate it already
    if (gz && !/gzip/i.test(r.headers.get("content-encoding") || "")) return new Response(r.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
    return r.arrayBuffer().then(function (b) {
      // a server without range support answers 200 with the whole file
      return range && r.status !== 206 ? b.slice(range[0], range[1]) : b;
    });
  });
}
self.onmessage = function (e) {
  var d = e.data;
  var t0 = Date.now();
  var p = d.range
    ? Promise.all([get(d.url, [0, d.headerBytes]), get(d.url, [d.range.byteStart, d.range.byteEnd])]).then(function (x) {
        var offsets = new Uint32Array(x[0], 0, d.nSites + 1);
        return fillDense(offsets, x[1], offsets[d.range.siteStart], d.range.siteStart, d.range.siteEnd, d.tableCells, d.cellIds);
      })
    : get(d.url, null, d.gzUrl && typeof DecompressionStream !== "undefined" ? d.gzUrl : null).then(function (b) {
        var offsets = new Uint32Array(b, 0, d.nSites + 1);
        return fillDense(offsets, b.slice(d.headerBytes), 0, 0, d.nSites, d.tableCells, d.cellIds);
      });
  p.then(function (out) {
    out.ms = Date.now() - t0;
    self.postMessage({ ok: true, out: out }, [out.status.buffer, out.alt.buffer, out.depth.buffer, out.gt.buffer]);
  }).catch(function (err) {
    self.postMessage({ ok: false, error: String(err && err.message ? err.message : err) });
  });
};`;
}

function canUseWorker() {
  return typeof Worker !== "undefined" && typeof Blob !== "undefined" && typeof URL !== "undefined" && typeof URL.createObjectURL === "function";
}

async function mainThread(url, msg) {
  const get = async (range) => {
    const res = await fetch(url, range ? { headers: { Range: `bytes=${range[0]}-${range[1] - 1}` } } : {});
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    const b = await res.arrayBuffer();
    return range && res.status !== 206 ? b.slice(range[0], range[1]) : b;
  };
  if (msg.range) {
    const [h, body] = await Promise.all([get([0, msg.headerBytes]), get([msg.range.byteStart, msg.range.byteEnd])]);
    const offsets = new Uint32Array(h, 0, msg.nSites + 1);
    return fillDense(offsets, body, offsets[msg.range.siteStart], msg.range.siteStart, msg.range.siteEnd, msg.tableCells, msg.cellIds);
  }
  let b = null;
  if (msg.gzUrl && typeof DecompressionStream !== "undefined") {
    const res = await fetch(msg.gzUrl);
    if (res.ok) {
      b = /gzip/i.test(res.headers.get("content-encoding") || "")
        ? await res.arrayBuffer()
        : await new Response(res.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
    }
  }
  if (!b) b = await get();
  const offsets = new Uint32Array(b, 0, msg.nSites + 1);
  return fillDense(offsets, b.slice(msg.headerBytes), 0, 0, msg.nSites, msg.tableCells, msg.cellIds);
}

/**
 * Decode the cell matrix of `table` (a columnar site table) at `url` for
 * `cellIds`; `range` ({ siteStart, siteEnd, byteStart, byteEnd } from
 * groupRanges) fetches one branch block only. Resolves to fillDense output.
 */
export function loadColumnarMatrix(url, table, cellIds, { range = null, useWorker = true } = {}) {
  // absolute: a blob: worker cannot resolve a page-relative URL
  const absOf = (u) => (typeof window !== "undefined" && window.location ? new URL(u, window.location.href).href : u);
  const abs = absOf(url);
  // whole-file fetches read the gzipped copy (the web server sends JSON / binary uncompressed) when the browser can inflate it
  const gz = table.matrix.file_gz ? absOf(url.replace(/[^/]*$/, table.matrix.file_gz)) : null;
  const msg = {
    url: abs,
    nSites: table.n_sites,
    headerBytes: table.matrix.header_bytes,
    tableCells: table.cells,
    cellIds: [...cellIds],
    range,
    gzUrl: gz,
  };
  if (!useWorker || !canUseWorker()) return mainThread(abs, msg);
  return new Promise((resolve, reject) => {
    let worker;
    try {
      if (!workerUrl) workerUrl = URL.createObjectURL(new Blob([workerSource()], { type: "text/javascript" }));
      worker = new Worker(workerUrl);
    } catch (e) {
      mainThread(abs, msg).then(resolve, reject);
      return;
    }
    worker.onmessage = (e) => {
      worker.terminate();
      if (e.data?.ok) resolve(e.data.out);
      else reject(new Error(e.data?.error || "SNV matrix worker failed"));
    };
    worker.onerror = (e) => {
      worker.terminate();
      mainThread(abs, msg).then(resolve, reject); // e.g. a CSP that blocks blob: workers
      e.preventDefault?.();
    };
    worker.postMessage(msg);
  });
}

export const _workerSource = workerSource; // tests
