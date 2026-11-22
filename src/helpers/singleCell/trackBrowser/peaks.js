// Peaks for the `atac` track: bgzip (BGZF) or plain gzip BED / MACS3 narrowPeak, fetched whole (one file per pool,
// small) and indexed per chromosome. pako 1.x inflates one gzip member at a time, so BGZF blocks are walked here.
import pako from "pako";

const bare = (c) => `${c ?? ""}`.replace(/^chr/i, "");

/** UTF-8 (ASCII for BED) bytes to a string; TextDecoder when present (browsers), else chunked char codes (jsdom). */
export function decodeText(u8) {
  if (typeof TextDecoder !== "undefined") return new TextDecoder().decode(u8);
  let s = "";
  for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
  return s;
}

/** Decompress gzip / BGZF (several concatenated members) to a string; plain text passes through. */
export function gunzipAll(data) {
  const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (u8.length < 2 || u8[0] !== 0x1f || u8[1] !== 0x8b) return decodeText(u8);
  const parts = [];
  let o = 0;
  while (o + 18 <= u8.length && u8[o] === 0x1f && u8[o + 1] === 0x8b) {
    const flg = u8[o + 3];
    let bsize = null;
    if (flg & 4) {
      const xlen = u8[o + 10] | (u8[o + 11] << 8);
      let p = o + 12;
      const xend = p + xlen;
      while (p + 4 <= xend) {
        const slen = u8[p + 2] | (u8[p + 3] << 8);
        if (u8[p] === 66 && u8[p + 1] === 67 && slen === 2) bsize = (u8[p + 4] | (u8[p + 5] << 8)) + 1;
        p += 4 + slen;
      }
    }
    if (bsize) {
      parts.push(pako.ungzip(u8.subarray(o, o + bsize)));
      o += bsize;
    } else {
      // plain gzip: a single member (pako 1.x stops at its end)
      parts.push(pako.ungzip(u8.subarray(o)));
      break;
    }
  }
  return parts.map((p) => decodeText(p)).join("");
}

/**
 * Parse BED / narrowPeak text into Map chrom (no "chr") -> [{ start, end, name, score, signal, q, summit }],
 * sorted by start. BED is 0-based half open; start stays 0-based, end exclusive.
 */
export function parsePeaks(text) {
  const by = new Map();
  `${text || ""}`.split("\n").forEach((line) => {
    if (!line || line[0] === "#" || line.startsWith("track") || line.startsWith("browser")) return;
    const f = line.split("\t");
    if (f.length < 3) return;
    const start = Number(f[1]);
    const end = Number(f[2]);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return;
    const c = bare(f[0]);
    if (!by.has(c)) by.set(c, []);
    by.get(c).push({ start, end, name: f[3] || "", score: Number(f[4]) || 0, signal: f.length > 6 ? Number(f[6]) : null, q: f.length > 8 ? Number(f[8]) : null, summit: f.length > 9 ? Number(f[9]) : null });
  });
  by.forEach((v) => {
    v.sort((a, b) => a.start - b.start);
    v.maxLen = v.reduce((m, x) => Math.max(m, x.end - x.start), 0);
  });
  return by;
}

/** Peaks overlapping a window (1-based closed { chrom, start, end }). */
export function peaksInWindow(byChrom, w) {
  const list = byChrom?.get(bare(w.chrom)) || [];
  const from = w.start - 1 - (list.maxLen || 0);
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].start < from) lo = mid + 1;
    else hi = mid;
  }
  const out = [];
  for (let i = lo; i < list.length && list[i].start <= w.end; i += 1) if (list[i].end >= w.start) out.push(list[i]);
  return out;
}
