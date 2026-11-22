// HTTP range reads for indexed files (bigWig) with a page cache: small reads (index nodes) are served from 64 kB
// pages fetched once. A server that ignores Range (e.g. `python -m http.server`) answers 200 with the whole file;
// that file is then kept and sliced. d3-free; `fetchImpl` is injectable for jest.

export const PAGE = 65536;

/** A readRange(offset, length) -> Promise<ArrayBuffer> for `url`. */
export function rangeReader(url, { fetchImpl = typeof fetch !== "undefined" ? (...a) => fetch(...a) : null, page = PAGE, maxPages = 512 } = {}) {
  const pages = new Map(); // page index -> Uint8Array
  let whole = null; // Uint8Array when the server sent the full file
  let size = Infinity;
  const fetchPages = async (p0, p1) => {
    const start = p0 * page;
    const end = Math.min((p1 + 1) * page, size) - 1;
    const res = await fetchImpl(url, { headers: { Range: `bytes=${start}-${end}` } });
    if (!res.ok && res.status !== 206) throw new Error(`${res.status} at ${url}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    if (res.status === 200) {
      whole = buf;
      size = buf.length;
      return;
    }
    const cr = res.headers && typeof res.headers.get === "function" ? res.headers.get("content-range") : null;
    const total = cr && /\/(\d+)$/.exec(cr);
    if (total) size = Number(total[1]);
    for (let p = p0; p <= p1; p += 1) {
      const a = (p - p0) * page;
      if (a >= buf.length) break;
      pages.set(p, buf.subarray(a, Math.min(buf.length, a + page)));
    }
    while (pages.size > maxPages) pages.delete(pages.keys().next().value);
  };
  return async (offset, length) => {
    if (length <= 0) return new ArrayBuffer(0);
    if (!whole) {
      const p0 = Math.floor(offset / page);
      const p1 = Math.floor((offset + length - 1) / page);
      let missingFrom = -1;
      for (let p = p0; p <= p1 + 1; p += 1) {
        const missing = p <= p1 && !pages.has(p) && p * page < size;
        if (missing && missingFrom < 0) missingFrom = p;
        if (!missing && missingFrom >= 0) {
          await fetchPages(missingFrom, p - 1); // eslint-disable-line no-await-in-loop
          missingFrom = -1;
          if (whole) break;
        }
      }
    }
    if (whole) return whole.slice(offset, Math.min(whole.length, offset + length)).buffer;
    const out = new Uint8Array(Math.max(0, Math.min(length, size - offset)));
    let o = 0;
    for (let p = Math.floor(offset / page); o < out.length; p += 1) {
      const pg = pages.get(p);
      if (!pg) break;
      const from = Math.max(0, offset + o - p * page);
      const take = Math.min(pg.length - from, out.length - o);
      if (take <= 0) break;
      out.set(pg.subarray(from, from + take), o);
      o += take;
    }
    return out.buffer;
  };
}
