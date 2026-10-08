import { useEffect, useMemo, useState } from "react";

/**
 * Track an element's content width (ResizeObserver, falling back to window
 * resize). The returned ref is a callback ref that also exposes `.current`,
 * so measuring starts whenever the element appears — also when a component
 * first renders an empty state and mounts the measured element later.
 */
export default function useContainerWidth(initial = 800) {
  const [el, setEl] = useState(null);
  const [width, setWidth] = useState(initial);
  const ref = useMemo(() => {
    const callback = (node) => {
      callback.current = node;
      setEl(node);
    };
    callback.current = null;
    return callback;
  }, []);

  useEffect(() => {
    if (!el) return undefined;
    const measure = () => {
      const w = Math.floor(el.getBoundingClientRect().width);
      if (w > 0) setWidth((prev) => (prev === w ? prev : w));
    };
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(measure);
      observer.observe(el);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [el]);

  return [ref, width];
}
