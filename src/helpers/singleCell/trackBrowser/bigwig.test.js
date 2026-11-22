/**
 * @jest-environment node
 */
// bigWig reader on a tiny synthetic bigWig written with pyBigWig (__fixtures__/make_fixtures.py), the range reader
// with a mocked fetch (206 and a server that ignores Range), and the BGZF narrowPeak parser.
import fs from "fs";
import path from "path";
import { bufferReader, openBigWig, parseHeader, pickZoom } from "./bigwig";
import { rangeReader } from "./rangeFetch";
import { decodeText, gunzipAll, parsePeaks, peaksInWindow } from "./peaks";

const fixture = (f) => fs.readFileSync(path.join(__dirname, "__fixtures__", f));

describe("bigWig reader", () => {
  const bw = fixture("tiny.bw");
  test("header and chromosome tree", async () => {
    const h = parseHeader(new Uint8Array(bw).buffer);
    expect(h.le).toBe(true);
    expect(h.zoomLevels).toBeGreaterThanOrEqual(1);
    const f = await openBigWig(bufferReader(bw));
    expect([...f.chroms.byName.keys()].sort()).toEqual(["chr1", "chr2", "chrX"]);
    expect(f.chroms.byName.get("chr1").size).toBe(100000);
  });
  test("raw bedGraph values over a region, with or without the chr prefix", async () => {
    const f = await openBigWig(bufferReader(bw));
    const r = await f.readRegion("1", 2500, 4500);
    expect(r.zoom).toBe(0);
    expect(r.values.map((v) => [v.start, v.end, v.value])).toEqual([[2000, 3000, 2], [3000, 4000, 3], [4000, 5000, 4]]);
    const r2 = await f.readRegion("chr1", 2500, 4500);
    expect(r2.values).toHaveLength(3);
  });
  test("fixedStep and varStep sections", async () => {
    const f = await openBigWig(bufferReader(bw));
    const fx = await f.readRegion("chr2", 0, 1200);
    expect(fx.values.map((v) => [v.start, v.end, v.value])).toEqual([[0, 500, 2.5], [500, 1000, 2.5], [1000, 1500, 2.5]]);
    const vs = await f.readRegion("X", 0, 20000);
    expect(vs.values.map((v) => [v.start, v.end, v.value])).toEqual([[100, 150, 1], [5000, 5050, 3], [9000, 9050, 7]]);
  });
  test("zoom levels for coarse pixels keep the mean", async () => {
    const f = await openBigWig(bufferReader(bw));
    const z = f.header.zooms[0];
    expect(pickZoom(f.header.zooms, z.reductionLevel - 1)).toBeNull();
    expect(pickZoom(f.header.zooms, z.reductionLevel * 10)).toBe(z);
    const r = await f.readRegion("chr1", 0, 100000, { bpPerPixel: z.reductionLevel * 2 });
    expect(r.zoom).toBe(z.reductionLevel);
    const covered = r.values.reduce((s, v) => s + (v.end - v.start), 0);
    const mean = r.values.reduce((s, v) => s + v.value * (v.end - v.start), 0) / covered;
    expect(mean).toBeCloseTo(49.5, 1);
  });
  test("unknown chromosome gives no values", async () => {
    const f = await openBigWig(bufferReader(bw));
    const r = await f.readRegion("chr9", 0, 1000);
    expect(r.values).toEqual([]);
    expect(r.missingChrom).toBe(true);
  });
  test("not a bigWig", () => {
    expect(() => parseHeader(new ArrayBuffer(64))).toThrow("not a bigWig");
  });
});

describe("range reader", () => {
  const bw = new Uint8Array(fixture("tiny.bw"));
  const mockFetch = (honourRange) => {
    const calls = [];
    const impl = async (url, { headers }) => {
      calls.push(headers.Range);
      const m = /bytes=(\d+)-(\d+)/.exec(headers.Range);
      const a = Number(m[1]);
      const b = Math.min(bw.length - 1, Number(m[2]));
      const body = honourRange ? bw.slice(a, b + 1) : bw.slice();
      return {
        ok: true,
        status: honourRange ? 206 : 200,
        headers: { get: (k) => (k === "content-range" && honourRange ? `bytes ${a}-${b}/${bw.length}` : null) },
        arrayBuffer: async () => body.buffer,
      };
    };
    return { impl, calls };
  };
  test("206 responses are cached in pages (one request for the whole small file)", async () => {
    const { impl, calls } = mockFetch(true);
    const read = rangeReader("x.bw", { fetchImpl: impl, page: 1024 });
    const f = await openBigWig(read);
    const r = await f.readRegion("chr1", 2500, 4500);
    expect(r.values).toHaveLength(3);
    expect(calls.length).toBeLessThanOrEqual(2);
    const again = new Uint8Array(await read(10, 20));
    expect([...again]).toEqual([...bw.slice(10, 30)]);
  });
  test("a server that ignores Range: the whole file is kept and sliced", async () => {
    const { impl, calls } = mockFetch(false);
    const read = rangeReader("x.bw", { fetchImpl: impl });
    const f = await openBigWig(read);
    expect((await f.readRegion("chr2", 0, 600)).values).toHaveLength(2);
    expect(calls).toHaveLength(1);
  });
  test("errors propagate", async () => {
    const read = rangeReader("x.bw", { fetchImpl: async () => ({ ok: false, status: 404 }) });
    await expect(read(0, 10)).rejects.toThrow("404");
  });
});

describe("peaks (BGZF narrowPeak)", () => {
  test("multi-block BGZF decodes to all lines", () => {
    const text = gunzipAll(fixture("peaks.bed.gz"));
    expect(text.trim().split("\n")).toHaveLength(4);
    const by = parsePeaks(text);
    expect(by.get("1").map((p) => p.name)).toEqual(["p1", "big", "p2"]);
    expect(by.get("2")[0].signal).toBe(9);
    expect(by.get("2")[0].summit).toBe(150);
  });
  test("window lookup finds long peaks that start before the window", () => {
    const by = parsePeaks(gunzipAll(fixture("peaks.bed.gz")));
    expect(peaksInWindow(by, { chrom: "1", start: 5100, end: 5200 }).map((p) => p.name).sort()).toEqual(["big", "p2"]);
    expect(peaksInWindow(by, { chrom: "chr1", start: 95000, end: 99000 })).toEqual([]);
    expect(peaksInWindow(by, { chrom: "3", start: 1, end: 10 })).toEqual([]);
  });
  test("plain text passes through and the decoder works without TextDecoder", () => {
    expect(gunzipAll(new Uint8Array([99, 104, 114, 49]))).toBe("chr1");
    const saved = global.TextDecoder;
    global.TextDecoder = undefined;
    try {
      expect(decodeText(new Uint8Array([65, 66]))).toBe("AB");
    } finally {
      global.TextDecoder = saved;
    }
  });
});
