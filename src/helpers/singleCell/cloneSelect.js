/**
 * Clone selection (isolate) on top of "hide clones". When selectedClones is
 * non-empty only those clones are shown; every other clone is treated as hidden.
 * hiddenClones still applies: a clone that is both selected and hidden stays hidden.
 */
export function effectiveHiddenClones(allClones, hiddenClones, selectedClones) {
  const hidden = new Set(hiddenClones || []);
  const selected = (selectedClones || []).filter((c) => (allClones || []).includes(c));
  if (selected.length) {
    const keep = new Set(selected);
    for (const c of allClones || []) if (!keep.has(c)) hidden.add(c);
  }
  return hidden;
}

/** Clone names present on the cells, in first-seen order (null / empty ids skipped). */
export function cloneNamesOf(cells) {
  const seen = new Set();
  for (const c of cells || []) if (c?.clone_id != null && c.clone_id !== "") seen.add(c.clone_id);
  return [...seen];
}

/** Toggle one clone in the selection (for click-to-focus). */
export function toggleSelected(selected, clone) {
  const s = selected || [];
  return s.includes(clone) ? s.filter((c) => c !== clone) : [...s, clone];
}
