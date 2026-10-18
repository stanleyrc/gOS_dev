import { useCallback, useEffect, useRef, useState } from "react";
import { clampView, identityView, isIdentity, panBy, wheelFactor, zoomAt } from "../../helpers/singleCell/umapZoom";

/**
 * Zoom / pan state for a 2-D plot of size width x height. Attach `bindRef` to the
 * element that should react to the wheel (non-passive, so the page does not scroll).
 */
export default function useUmapZoom(width, height) {
  const [view, setView] = useState(identityView);
  const [el, setEl] = useState(null);
  const sizeRef = useRef([width, height]);
  sizeRef.current = [width, height];
  useEffect(() => {
    setView((v) => clampView(v, width, height));
  }, [width, height]);
  useEffect(() => {
    if (!el) return undefined;
    const onWheel = (event) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const f = wheelFactor(event.deltaY, { deltaMode: event.deltaMode, ctrl: event.ctrlKey });
      setView((v) => zoomAt(v, event.clientX - rect.left, event.clientY - rect.top, f, ...sizeRef.current));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [el]);
  const zoomBy = useCallback((factor) => setView((v) => zoomAt(v, sizeRef.current[0] / 2, sizeRef.current[1] / 2, factor, ...sizeRef.current)), []);
  const pan = useCallback((dx, dy) => setView((v) => panBy(v, dx, dy, ...sizeRef.current)), []);
  const reset = useCallback(() => setView(identityView()), []);
  return { view, setView, bindRef: setEl, zoomBy, pan, reset, zoomed: !isIdentity(view) };
}
