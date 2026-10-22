// d3-free helpers for cycling through the ordered paper figures with the arrow keys.

/** Index after a step of +1 / -1 in a list of n items, wrapping at the ends; -1 when the list is empty. */
export function stepIndex(i, n, delta) {
  if (!(n > 0)) return -1;
  const from = Number.isInteger(i) && i >= 0 && i < n ? i : delta > 0 ? -1 : 0;
  return (((from + delta) % n) + n) % n;
}

/** The key of the neighbour of `current` in `keys` (wrapping), or null when current is not in the list. */
export function neighbourKey(keys, current, delta) {
  const i = (keys || []).indexOf(current);
  return i < 0 ? null : keys[stepIndex(i, keys.length, delta)];
}

const TYPING = new Set(["INPUT", "SELECT", "TEXTAREA"]);
/**
 * True when the event target is a field the user is typing in (or a contenteditable). An empty text box does not count:
 * arrows do nothing there, and the page's search box takes focus by itself.
 */
export function isTypingTarget(target) {
  if (!target) return false;
  const tag = `${target.tagName || ""}`.toUpperCase();
  if ((tag === "INPUT" || tag === "TEXTAREA") && `${target.type || "text"}` !== "range" && !target.value) return false;
  return TYPING.has(tag) || !!target.isContentEditable || target.getAttribute?.("role") === "slider";
}

/**
 * What a keydown means for figure navigation: "prev" | "next" | "close" | null.
 * opts.blocked: true while a zoom lens, live patient view or modal is capturing keys.
 * Modified keys and typing targets never navigate.
 */
export function navAction(e, opts = {}) {
  if (!e || opts.blocked || e.defaultPrevented) return null;
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null;
  if (isTypingTarget(e.target)) return null;
  if (e.key === "ArrowLeft") return "prev";
  if (e.key === "ArrowRight") return "next";
  if (e.key === "Escape" && opts.canClose) return "close";
  return null;
}

/** "n / N" counter text (1-based), "" when the item is not in the list. */
export function counterText(keys, current) {
  const i = (keys || []).indexOf(current);
  return i < 0 ? "" : `${i + 1} / ${keys.length}`;
}
