// Minimal bigWig range reader for the track browser `atac` track (spec v0.4). igv.js does not export its BWReader,
// so this reads the format directly (UCSC bigWig: header, chromosome B+ tree, zoom levels, R-tree index, zlib data
// blocks) through a `readRange(offset, length) -> Promise<ArrayBuffer>` function, so it works over HTTP range
// requests (rangeFetch.js) and on in-memory buffers (jest). Only what the browser needs: values over a region, from
// the raw data or from the best zoom level for the pixel resolution. d3-free.
import pako from "pako";

export const BIGWIG_MAGIC = 0x888ffc26;
const BPT_MAGIC = 0x78ca8c91;
const RTREE_MAGIC = 0x2468ace0;

const u64 = (dv, o, le) => {
  const lo = dv.getUint32(o + (le ? 0 : 4), le);
  const hi = dv.getUint32(o + (le ? 4 : 0), le);
  return hi * 2 ** 32 + lo;
};

/** Parse the 64-byte header and the zoom headers. buf: ArrayBuffer of at least 64 + 24 * zoomLevels bytes. */
export function parseHeader(buf) {
  const dv = new DataView(buf);
  let le = true;
  if (dv.getUint32(0, true) !== BIGWIG_MAGIC) {
    if (dv.getUint32(0, false) !== BIGWIG_MAGIC) throw new Error("not a bigWig file");
    le = false;
  }
  const h = {
    le,
    version: dv.getUint16(4, le),
    zoomLevels: dv.getUint16(6, le),
    chromTreeOffset: u64(dv, 8, le),
    fullDataOffset: u64(dv, 16, le),
    fullIndexOffset: u64(dv, 24, le),
    fieldCount: dv.getUint16(32, le),
    definedFieldCount: dv.getUint16(34, le),
    autoSqlOffset: u64(dv, 36, le),
    totalSummaryOffset: u64(dv, 44, le),
    uncompressBufSize: dv.getUint32(52, le),
    zooms: [],
  };
  for (let i = 0; i < h.zoomLevels; i += 1) {
    const o = 64 + i * 24;
    if (o + 24 > buf.byteLength) break;
    h.zooms.push({ reductionLevel: dv.getUint32(o, le), dataOffset: u64(dv, o + 8, le), indexOffset: u64(dv, o + 16, le) });
  }
  return h;
}

const decoder = typeof TextDecoder !== "undefined" ? new TextDecoder() : null;
const keyString = (bytes) => {
  let end = bytes.indexOf(0);
  if (end < 0) end = bytes.length;
  const b = bytes.subarray(0, end);
  if (decoder) return decoder.decode(b);
  return String.fromCharCode(...b);
};

/** Read the chromosome B+ tree: Map name -> { id, size } (and the reverse list by id). */
export async function readChromTree(readRange, offset, le) {
  const head = new DataView(await readRange(offset, 32));
  if (head.getUint32(0, le) !== BPT_MAGIC) throw new Error("bigWig chromosome tree not found");
  const blockSize = head.getUint32(4, le);
  const keySize = head.getUint32(8, le);
  const valSize = head.getUint32(12, le);
  const byName = new Map();
  const byId = [];
  const readNode = async (o) => {
    const nh = new DataView(await readRange(o, 4));
    const isLeaf = nh.getUint8(0);
    const count = nh.getUint16(2, le);
    const itemSize = keySize + (isLeaf ? valSize : 8);
    const body = await readRange(o + 4, count * itemSize);
    const dv = new DataView(body);
    const bytes = new Uint8Array(body);
    const children = [];
    for (let i = 0; i < count; i += 1) {
      const p = i * itemSize;
      if (isLeaf) {
        const name = keyString(bytes.subarray(p, p + keySize));
        const id = dv.getUint32(p + keySize, le);
        const size = dv.getUint32(p + keySize + 4, le);
        byName.set(name, { id, size, name });
        byId[id] = name;
      } else children.push(u64(dv, p + keySize, le));
    }
    for (let i = 0; i < children.length; i += 1) await readNode(children[i]); // eslint-disable-line no-await-in-loop
  };
  if (blockSize > 0) await readNode(offset + 32);
  return { byName, byId };
}

/** Leaf items of an R-tree index overlapping [chromId:start, chromId:end): [{ offset, size }]. */
export async function rtreeBlocks(readRange, indexOffset, le, chromId, start, end) {
  const head = new DataView(await readRange(indexOffset, 48));
  if (head.getUint32(0, le) !== RTREE_MAGIC) throw new Error("bigWig R-tree index not found");
  const out = [];
  const overlaps = (sc, sb, ec, eb) => (sc < chromId || (sc === chromId && sb < end)) && (ec > chromId || (ec === chromId && eb > start));
  const readNode = async (o) => {
    const nh = new DataView(await readRange(o, 4));
    const isLeaf = nh.getUint8(0);
    const count = nh.getUint16(2, le);
    const itemSize = isLeaf ? 32 : 24;
    const dv = new DataView(await readRange(o + 4, count * itemSize));
    const next = [];
    for (let i = 0; i < count; i += 1) {
      const p = i * itemSize;
      const sc = dv.getUint32(p, le);
      const sb = dv.getUint32(p + 4, le);
      const ec = dv.getUint32(p + 8, le);
      const eb = dv.getUint32(p + 12, le);
      if (!overlaps(sc, sb, ec, eb)) continue;
      if (isLeaf) out.push({ offset: u64(dv, p + 16, le), size: u64(dv, p + 24, le) });
      else next.push(u64(dv, p + 16, le));
    }
    for (let i = 0; i < next.length; i += 1) await readNode(next[i]); // eslint-disable-line no-await-in-loop
  };
  await readNode(indexOffset + 48);
  return out;
}

const inflate = (buf, compressed) => (compressed ? pako.inflate(new Uint8Array(buf)).buffer : buf);

/** Decode one raw-data section (bedGraph, varStep or fixedStep) into [{ start, end, value }] (0-based, half open). */
export function decodeDataBlock(buf, le, chromId, start, end) {
  const dv = new DataView(buf);
  const out = [];
  let o = 0;
  while (o + 24 <= buf.byteLength) {
    const cid = dv.getUint32(o, le);
    const secStart = dv.getUint32(o + 4, le);
    const itemStep = dv.getUint32(o + 12, le);
    const itemSpan = dv.getUint32(o + 16, le);
    const type = dv.getUint8(o + 20);
    const n = dv.getUint16(o + 22, le);
    o += 24;
    const size = type === 1 ? 12 : type === 2 ? 8 : 4;
    for (let i = 0; i < n; i += 1) {
      let s;
      let e;
      let v;
      if (type === 1) {
        s = dv.getUint32(o, le);
        e = dv.getUint32(o + 4, le);
        v = dv.getFloat32(o + 8, le);
      } else if (type === 2) {
        s = dv.getUint32(o, le);
        e = s + itemSpan;
        v = dv.getFloat32(o + 4, le);
      } else {
        s = secStart + i * itemStep;
        e = s + itemSpan;
        v = dv.getFloat32(o, le);
      }
      o += size;
      if (cid === chromId && e > start && s < end) out.push({ start: s, end: e, value: v });
    }
  }
  return out;
}

/** Decode zoom records into [{ start, end, value: mean, min, max, n }] for the region. */
export function decodeZoomBlock(buf, le, chromId, start, end) {
  const dv = new DataView(buf);
  const out = [];
  for (let o = 0; o + 32 <= buf.byteLength; o += 32) {
    const cid = dv.getUint32(o, le);
    const s = dv.getUint32(o + 4, le);
    const e = dv.getUint32(o + 8, le);
    const n = dv.getUint32(o + 12, le);
    if (cid !== chromId || e <= start || s >= end || !n) continue;
    const sum = dv.getFloat32(o + 24, le);
    out.push({ start: s, end: e, value: sum / n, min: dv.getFloat32(o + 16, le), max: dv.getFloat32(o + 20, le), n });
  }
  return out;
}

/** The zoom level to read for `bpPerPixel` (the coarsest whose reduction is <= bpPerPixel), or null for raw data. */
export function pickZoom(zooms, bpPerPixel) {
  let best = null;
  (zooms || []).forEach((z) => {
    if (z.reductionLevel <= bpPerPixel && (!best || z.reductionLevel > best.reductionLevel)) best = z;
  });
  return best;
}

/**
 * Open a bigWig. Returns { header, chroms, readRegion(chrom, start, end, { bpPerPixel }) } where start/end are
 * 0-based half open; chrom may be "12" or "chr12" (whichever the file has). readRegion resolves to
 * { values: [{ start, end, value }], zoom: reductionLevel | 0 } ([] when the chromosome is not in the file).
 */
export async function openBigWig(readRange) {
  const first = await readRange(0, 64);
  const zoomLevels = new DataView(first).getUint16(6, new DataView(first).getUint32(0, true) === BIGWIG_MAGIC);
  const header = parseHeader(zoomLevels ? await readRange(0, 64 + 24 * zoomLevels) : first);
  const chroms = await readChromTree(readRange, header.chromTreeOffset, header.le);
  const compressed = header.uncompressBufSize > 0;
  const chromOf = (c) => {
    const bare = `${c}`.replace(/^chr/i, "");
    return chroms.byName.get(`chr${bare}`) || chroms.byName.get(bare) || chroms.byName.get(`${c}`) || null;
  };
  const readRegion = async (chrom, start, end, { bpPerPixel = 0 } = {}) => {
    const c = chromOf(chrom);
    if (!c) return { values: [], zoom: 0, missingChrom: true };
    const zoom = pickZoom(header.zooms, bpPerPixel);
    const index = zoom ? zoom.indexOffset : header.fullIndexOffset;
    const blocks = await rtreeBlocks(readRange, index, header.le, c.id, start, end);
    const values = [];
    for (let i = 0; i < blocks.length; i += 1) {
      const raw = inflate(await readRange(blocks[i].offset, blocks[i].size), compressed); // eslint-disable-line no-await-in-loop
      const part = zoom ? decodeZoomBlock(raw, header.le, c.id, start, end) : decodeDataBlock(raw, header.le, c.id, start, end);
      for (let k = 0; k < part.length; k += 1) values.push(part[k]);
    }
    values.sort((a, b) => a.start - b.start);
    return { values, zoom: zoom ? zoom.reductionLevel : 0 };
  };
  return { header, chroms, readRegion };
}

/** A readRange over an in-memory ArrayBuffer / Uint8Array / Node Buffer (tests, whole-file fallback). */
export function bufferReader(data) {
  const u8 = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return async (offset, length) => u8.slice(offset, Math.min(u8.length, offset + length)).buffer;
}
