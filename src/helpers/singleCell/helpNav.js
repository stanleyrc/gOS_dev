// "Go" from the Help Center to a cohort view: the list view and the cohort
// panel may not be mounted yet when the target is set, so the target is kept
// here until a consumer takes it. Patient tabs go through redux (updateTab).
let pending = null;
const listeners = new Set();

/** target: { scope: "cohort", view } */
export function requestHelpTarget(target) {
  pending = target ? { ...target, at: Date.now() } : null;
  listeners.forEach((fn) => fn(pending));
}

/** Current target if still fresh (consumers mounting within 10 s of the request). */
export function peekHelpTarget(maxAgeMs = 10000) {
  return pending && Date.now() - pending.at <= maxAgeMs ? pending : null;
}

export function subscribeHelpTarget(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Scroll to a card and flash it. Looks for the provenance icon
 * ([data-help-id]) first, else a card title containing `anchor`; retries
 * while the tab renders (lazy cards). Returns a cancel function.
 */
export function scrollToHelpCard({ id, anchor }, { tries = 40, delay = 150, doc = typeof document !== "undefined" ? document : null } = {}) {
  if (!doc) return () => {};
  let n = 0;
  let timer = null;
  const find = () => {
    const icon = id ? doc.querySelector(`[data-help-id="${CSS.escape(id)}"]`) : null;
    if (icon) return icon.closest(".ant-card") || icon;
    if (anchor) {
      const a = anchor.toLowerCase();
      const head = [...doc.querySelectorAll(".ant-card-head-title")].find((h) => h.textContent.toLowerCase().includes(a));
      if (head) return head.closest(".ant-card") || head;
    }
    return null;
  };
  const step = () => {
    const el = find();
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.classList.remove("sc-help-flash");
      // restart the animation
      void el.offsetWidth;
      el.classList.add("sc-help-flash");
      setTimeout(() => el.classList.remove("sc-help-flash"), 2600);
      return;
    }
    if (++n < tries) timer = setTimeout(step, delay);
  };
  timer = setTimeout(step, delay);
  return () => clearTimeout(timer);
}

// Open the Help Center (mounted once in the top bar) from any "?" button.
const openers = new Set();
export function openHelpCenter(options = {}) {
  openers.forEach((fn) => fn(options));
}
export function onOpenHelpCenter(fn) {
  openers.add(fn);
  return () => openers.delete(fn);
}
