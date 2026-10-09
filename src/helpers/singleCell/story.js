// The single-cell "story": cohort chapters and per-patient vignettes,
// precomputed by analysis/story/scripts/story.py into
// <dataPath>_cohort/story.json (format gos-sc-story/1). Pure helpers.

export const STORY_FORMAT = "gos-sc-story/1";

/** Categorical slots for story figures (validated palette; light / dark steps). */
export const STORY_SERIES = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"],
};

const asArray = (v) => (Array.isArray(v) ? v : []);

/** Typeset comparison operators the scripts write in ASCII: ">=" -> "≥", "<=" -> "≤", "!=" -> "≠". */
export function typeset(text) {
  return `${text ?? ""}`.replace(/\s?>=\s?/g, " ≥ ").replace(/\s?<=\s?/g, " ≤ ").replace(/\s?!=\s?/g, " ≠ ").replace(/\( ([≥≤≠])/g, "($1").replace(/^ ([≥≤≠])/, "$1");
}

/** A table header as the app writes them: first letter upper case, operators typeset. */
export function headerCase(text) {
  const s = typeset(text);
  // leave mixed-case terms alone (ecDNA, mtDNA)
  return s && !/^[a-z]+[A-Z]/.test(s) ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Keep only well-formed chapters / vignettes; null when the file is not a story. */
export function normalizeStory(raw) {
  if (!raw || typeof raw !== "object" || raw.format !== STORY_FORMAT) return null;
  const section = (s) =>
    s && typeof s === "object" && s.title
      ? { id: `${s.id || s.title}`, title: typeset(s.title), lede: typeset(s.lede || ""), body: asArray(s.body).map(typeset), figure: s.figure || null, stats: asArray(s.stats) }
      : null;
  const patients = {};
  Object.entries(raw.patients || {}).forEach(([id, p]) => {
    const vignettes = asArray(p?.vignettes).map(section).filter(Boolean);
    if (vignettes.length) patients[id] = { vignettes };
  });
  return {
    title: raw.title || "",
    generated: raw.generated || null,
    chapters: asArray(raw.chapters).map(section).filter(Boolean),
    patients,
  };
}

/** A patient's vignettes plus the cohort chapters whose text names the patient. */
export function storyForPatient(story, patientId) {
  if (!story || !patientId) return { vignettes: [], chapters: [] };
  const re = new RegExp(`\\b${`${patientId}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
  return {
    vignettes: story.patients[patientId]?.vignettes || [],
    chapters: story.chapters.filter((c) => c.body.some((b) => re.test(b))),
  };
}

/** Sentences of a paragraph that mention the patient (to quote a cohort chapter on a patient page). */
export function sentencesAbout(text, patientId) {
  const re = new RegExp(`\\b${`${patientId}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
  return `${text}`.split(/(?<=[.;])\s+(?=[A-Z])/).filter((s) => re.test(s));
}

/** Stacked-bar segments: [{ label, n, segments: [{ category, value, share, x0, x1 }] }] (x in shares when normalize, else counts). */
export function stackRows(figure) {
  const cats = asArray(figure?.categories);
  return asArray(figure?.rows).map((r) => {
    const values = cats.map((_, k) => Number(asArray(r.values)[k]) || 0);
    const total = values.reduce((a, b) => a + b, 0);
    let acc = 0;
    const segments = cats.map((category, k) => {
      const value = values[k];
      const width = figure.normalize ? (total ? value / total : 0) : value;
      const seg = { category, value, share: total ? value / total : 0, x0: acc, x1: acc + width };
      acc += width;
      return seg;
    });
    return { label: `${r.label}`, n: r.n ?? total, total, segments };
  });
}

/** Symmetric colour domain for a diverging matrix: max |value| over finite cells. */
export function matrixExtent(values) {
  let m = 0;
  asArray(values).forEach((row) => asArray(row).forEach((v) => {
    if (Number.isFinite(v)) m = Math.max(m, Math.abs(v));
  }));
  return m || 1;
}
