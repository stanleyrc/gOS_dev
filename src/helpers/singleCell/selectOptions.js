// d3-free helpers for two-line Select options (main label + muted note) with an instant title tooltip.
export function treeOptionParts(t) {
  const label = t.label || t.name;
  return { value: t.name, short: label, note: t.note || "", title: t.note ? `${label}\n${t.note}` : label };
}

// Mutation sets carry one long label; keep the text up to the first " (" as the main line and the rest as the note.
export function setOptionParts(s) {
  const base = s.label || s.name;
  const sites = s.n_variants != null ? ` (${s.n_variants.toLocaleString()} sites)` : "";
  const full = `${base}${sites}`;
  const i = base.indexOf(" (");
  const main = i > 0 ? base.slice(0, i) : base;
  const rest = i > 0 ? base.slice(i + 1) : "";
  const note = [rest, sites.trim()].filter(Boolean).join(" ");
  return { value: s.name, short: main, note, title: full };
}
