import { useEffect, useState } from "react";

const current = () =>
  typeof window === "undefined" ? 1 : Math.min(3, Math.max(1, window.devicePixelRatio || 1));

/** Device pixel ratio (capped at 3), updated when the window moves between screens or zooms. */
export default function usePixelRatio() {
  const [ratio, setRatio] = useState(current);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    let query = null;
    const update = () => {
      setRatio(current());
      if (query) query.removeEventListener?.("change", update);
      query = window.matchMedia(`(resolution: ${current()}dppx)`);
      query.addEventListener?.("change", update);
    };
    update();
    return () => query && query.removeEventListener?.("change", update);
  }, []);
  return ratio;
}
