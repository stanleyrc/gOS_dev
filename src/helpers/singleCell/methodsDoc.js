// Methods text of gOS: loaded from public/methods/methods.json (format gos_methods_v1, written by the methods
// authoring step from the code and READMEs). d3-free. Missing or malformed -> { ok: false, reason }.

export const METHODS_FORMAT = "gos_methods_v1";
export const METHODS_PATH = "methods/methods.json";

/** Validate and normalise: sections [{ id, title, body_md, sources: [path], status }]; status "to confirm" is flagged. */
export function normalizeMethods(doc) {
  if (!doc || typeof doc !== "object") return { ok: false, reason: "methods text pending (methods.json not found)" };
  if (doc.format && doc.format !== METHODS_FORMAT) return { ok: false, reason: `unexpected methods format ${doc.format}` };
  if (!Array.isArray(doc.sections) || !doc.sections.length) return { ok: false, reason: "methods text pending (no sections)" };
  const seen = new Set();
  const sections = doc.sections
    .filter((s) => s && s.title && s.body_md)
    .map((s, i) => {
      let id = `${s.id || `section-${i + 1}`}`.replace(/[^A-Za-z0-9_-]/g, "-");
      while (seen.has(id)) id += "-x";
      seen.add(id);
      const status = `${s.status || ""}`.toLowerCase();
      return {
        id,
        title: `${s.title}`,
        body_md: `${s.body_md}`,
        sources: Array.isArray(s.sources) ? s.sources.map(String) : s.sources ? [`${s.sources}`] : [],
        toConfirm: status.includes("confirm") || /\bto confirm\b/i.test(`${s.body_md}`),
      };
    });
  return sections.length ? { ok: true, sections, created: doc.created || null } : { ok: false, reason: "methods text pending (no usable sections)" };
}

/** Sections whose title or body contains every query word (case-insensitive). */
export function searchMethods(sections, query) {
  const terms = `${query || ""}`.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return sections;
  return sections.filter((s) => terms.every((t) => `${s.title} ${s.body_md}`.toLowerCase().includes(t)));
}
