import React, { useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import usePixelRatio from "../usePixelRatio";
import usePlotTheme from "../usePlotTheme";
import { FONT_FAMILY, TYPE, currentPlotTheme, fontCss } from "../../../helpers/singleCell/plotTheme";
import { figureStyle } from "../../../helpers/singleCell/figureStyle";

/**
 * Colour tokens of the current theme (helpers/singleCell/plotTheme) plus the
 * figure style `st` (helpers/singleCell/figureStyle) that draw() receives.
 */
export function ink(styleName) {
  const pt = currentPlotTheme();
  return { ...pt, dark: pt.mode === "dark", st: figureStyle(styleName) };
}

/** The chart style chosen in the layout preferences (Paper figures and the shared SVG charts). */
export const useFigureStyleName = () => useSelector((s) => s.SingleCell.layout.figureStyle);
export const useFigureStyle = () => figureStyle(useFigureStyleName());

export { FONT_FAMILY };
// figure text follows the app type scale: nothing below TYPE.micro, small sizes nudged up
const scaled = (px) => (px <= 9 ? TYPE.micro : px <= 10 ? TYPE.tick - 0.5 : px <= 11 ? TYPE.tick : px <= 12 ? TYPE.label : px);
export const font = (px, weight = 400) => fontCss(scaled(px), weight);

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
  const themeMode = usePlotTheme().mode; // redraw on a light / dark switch
  const styleName = useFigureStyleName(); // and on a figure style switch

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
    hitsRef.current = draw(ctx, ink(styleName)) || [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, draw, pr, themeMode, styleName]);

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
