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

/** Set of relative paths from a parsed gz_index.json (empty for anything unexpected). */
export function parseGzIndex(raw) {
  const files = raw && typeof raw === "object" && Array.isArray(raw.files) ? raw.files : [];
  return new Set(files.filter((f) => typeof f === "string" && f.length > 0));
}

/** Whether the index lists a gzipped sibling for this path. */
export function hasGzSibling(index, path) {
  const rel = relativeToRoot(path);
  return Boolean(rel && index && index.has(rel));
}

/** Gunzip an ArrayBuffer to text; null when the browser has no DecompressionStream. */
export async function gunzipText(buffer) {
  if (typeof DecompressionStream === "undefined" || typeof Response === "undefined") return null;
  const stream = new Response(buffer).body.pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}
