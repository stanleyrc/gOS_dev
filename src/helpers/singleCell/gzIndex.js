/* global DecompressionStream */
// Pre-gzipped data files. The web server does not compress responses, so the data folder can hold
// <file>.gz siblings of its big JSON / text files plus a gz_index.json at the data root listing them
// ({ schemaVersion: 1, files: ["MGH303/snv_matrix.json", ...] }). The loader fetches the .gz and
// gunzips it in the browser (DecompressionStream); without the index, the file or browser support it
// falls back to the plain file. Pure helpers (no axios, no d3).

export const GZ_INDEX_FILE = "gz_index.json";

/** The data root of a file URL / path: everything up to and including the first "data/" folder, or null. */
export function dataRootOf(path) {
  const p = `${path || ""}`.split(/[?#]/)[0];
  const m = /^(.*?\/data\/|data\/)/.exec(p);
  return m ? m[1] : null;
}

/** The part of `path` below its data root ("MGH303/rna/cells.json"), or null. */
export function relativeToRoot(path) {
  const root = dataRootOf(path);
  if (!root) return null;
  return `${path}`.split(/[?#]/)[0].slice(root.length) || null;
}

/**
 * Map of relative path -> { source, size, mtime, derived } from a parsed gz_index.json (schemaVersion 2).
 * `source` is the plain file the .gz (or derived file) was built from; size / mtime(ms) are that source's
 * at build time. Anything unexpected gives an empty map.
 */
export function parseGzIndex(raw) {
  const out = new Map();
  if (!raw || raw.schemaVersion !== 2 || !raw.files || typeof raw.files !== "object") return out;
  Object.entries(raw.files).forEach(([rel, e]) => {
    if (e && typeof e.source === "string" && Number.isFinite(e.size) && Number.isFinite(e.mtime)) out.set(rel, { source: e.source, size: e.size, mtime: e.mtime, derived: Boolean(e.derived) });
  });
  return out;
}

/** The index entry for this path, or null. */
export function gzEntry(index, path) {
  const rel = relativeToRoot(path);
  return (rel && index && index.get(rel)) || null;
}

/** Whether the live source file (HEAD headers) still has the size and mtime the .gz was built from. */
export function sourceIsFresh(entry, headers = {}) {
  const get = (k) => headers[k] ?? headers[k.toLowerCase()];
  const len = Number(get("content-length"));
  const modified = Date.parse(get("last-modified"));
  return Boolean(entry) && len === entry.size && Number.isFinite(modified) && Math.abs(modified - entry.mtime) <= 2000;
}

/** Gunzip an ArrayBuffer to text; null when the browser has no DecompressionStream. */
export async function gunzipText(buffer) {
  if (typeof DecompressionStream === "undefined" || typeof Response === "undefined") return null;
  const stream = new Response(buffer).body.pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}
