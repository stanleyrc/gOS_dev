import React, { useEffect, useRef } from "react";
import usePixelRatio from "../usePixelRatio";
import { isDarkPlots } from "../../../helpers/singleCell/matrix";

/** Text / grid colours for the current theme. */
export function ink() {
  const dark = isDarkPlots();
  return {
    dark,
    text: dark ? "#d9d9d9" : "#262626",
    muted: dark ? "#8c8c8c" : "#8c8c8c",
    grid: dark ? "#303030" : "#f0f0f0",
    band: dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.045)",
    empty: dark ? "#2a2a2a" : "#e8e8e8",
    panel: dark ? "#141414" : "#ffffff",
  };
}

export const FONT_FAMILY = "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
export const font = (px, weight = 400) => `${weight} ${px}px ${FONT_FAMILY}`;

/**
 * One canvas per figure panel. `draw(ctx, ink)` paints in CSS pixels (the
 * context is pre-scaled to the device pixel ratio) and returns hit regions
 * [{ x0, y0, x1, y1, ...data }] (later regions win). Hovering shows
 * `tooltip(hit)` lines in a DOM tooltip without re-rendering React; clicks
 * call onClick(hit).
 */
export default function FigureCanvas({ width, height, draw, tooltip, onClick, onHover, style, ariaLabel }) {
  const ref = useRef(null);
  const tipRef = useRef(null);
  const hitsRef = useRef([]);
  const pr = usePixelRatio();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || width <= 0 || height <= 0) return;
    canvas.width = Math.floor(width * pr);
    canvas.height = Math.floor(height * pr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(pr, 0, 0, pr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.textBaseline = "middle";
    hitsRef.current = draw(ctx, ink()) || [];
  }, [width, height, draw, pr]);

  const find = (event) => {
    const rect = ref.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const hits = hitsRef.current;
    for (let k = hits.length - 1; k >= 0; k -= 1) {
      const h = hits[k];
      if (x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1) return { hit: h, x, y };
    }
    return { hit: null, x, y };
  };
  const hide = () => {
    if (tipRef.current) tipRef.current.style.display = "none";
  };
  const move = (event) => {
    const { hit, x, y } = find(event);
    if (ref.current) ref.current.style.cursor = hit && onClick ? "pointer" : "default";
    onHover?.(hit);
    const tip = tipRef.current;
    if (!tip) return;
    const lines = hit && tooltip ? tooltip(hit) : null;
    if (!lines || !lines.length) return hide();
    tip.replaceChildren(
      ...lines.map((line, k) => {
        const div = document.createElement("div");
        if (Array.isArray(line)) {
          const key = document.createElement("span");
          key.className = "sc-tooltip-key";
          key.textContent = `${line[0]} `;
          div.append(key, `${line[1]}`);
        } else {
          div.textContent = `${line}`;
          if (k === 0) div.style.fontWeight = 600;
        }
        return div;
      })
    );
    tip.style.display = "block";
    const tw = tip.offsetWidth;
    tip.style.left = `${Math.max(0, x + 14 + tw > width ? x - tw - 10 : x + 14)}px`;
    tip.style.top = `${y + 14}px`;
  };

  return (
    <div style={{ position: "relative", width, height, ...style }}>
      <canvas
        ref={ref}
        role="img"
        aria-label={ariaLabel}
        style={{ width, height, display: "block" }}
        onMouseMove={move}
        onMouseLeave={() => {
          hide();
          onHover?.(null);
        }}
        onClick={(event) => {
          const { hit } = find(event);
          if (hit && onClick) onClick(hit, event);
        }}
      />
      <div ref={tipRef} className="sc-tooltip" style={{ display: "none", pointerEvents: "none", zIndex: 5 }} />
    </div>
  );
}

/** Deterministic jitter in [-0.5, 0.5) for point k. */
export const jitter = (k) => ((((Math.sin((k + 1) * 12.9898) * 43758.5453) % 1) + 1) % 1) - 0.5;

/** Ellipsised text that fits maxWidth. */
export function fitText(ctx, text, maxWidth) {
  const s = `${text}`;
  if (ctx.measureText(s).width <= maxWidth) return s;
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(`${s.slice(0, mid)}…`).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${s.slice(0, lo)}…`;
}
