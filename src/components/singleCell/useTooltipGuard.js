import { useEffect, useLayoutEffect, useRef } from "react";
import { viewportShift } from "../../helpers/singleCell/hoverPopup";

// Shared tooltip lifecycle for the panels that keep their own tooltip state (d3-free). While `active` is truthy the
// tooltip is dismissed (by calling `clear`) on Escape, on any scroll (capture, so scrolling an inner pane counts),
// pointercancel, window blur, and when another guarded tooltip opens. The returned ref goes on the tooltip element: after
// each render it is nudged by a CSS translate so the whole box stays inside the window, not just inside the card.
// Usage: const tipRef = useTooltipGuard(tip, () => setTip(null)); <div ref={tipRef} className="sc-tooltip" .../>
const OPEN_EVENT = "sc-tooltip-open";
let nextId = 1;

export function useTooltipGuard(active, clear) {
  const ref = useRef(null);
  const clearRef = useRef(clear);
  clearRef.current = clear;
  const idRef = useRef(0);
  if (!idRef.current) idRef.current = nextId++;
  const on = !!active;

  useEffect(() => {
    if (!on || typeof window === "undefined") return undefined;
    const id = idRef.current;
    const dismiss = () => clearRef.current && clearRef.current();
    const onKey = (e) => {
      if (e.key === "Escape") dismiss();
    };
    const onOther = (e) => {
      if (e.detail !== id) dismiss();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("pointercancel", dismiss, true);
    window.addEventListener("blur", dismiss);
    window.addEventListener(OPEN_EVENT, onOther);
    window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id }));
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("pointercancel", dismiss, true);
      window.removeEventListener("blur", dismiss);
      window.removeEventListener(OPEN_EVENT, onOther);
    };
  }, [on]);

  // runs after every render of the host, because the tooltip follows the pointer
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined" || el.style.display === "none") return;
    el.style.transform = "";
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return;
    const { dx, dy } = viewportShift(r, window.innerWidth, window.innerHeight);
    if (dx || dy) el.style.transform = `translate(${Math.round(dx)}px, ${Math.round(dy)}px)`;
  });

  return ref;
}
