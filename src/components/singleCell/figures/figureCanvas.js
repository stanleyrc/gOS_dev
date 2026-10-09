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
 * [{ x0, y0, x1, y1, ...data }] (later regions win). `hitTest(x, y)` can
 * replace the regions for dense panels (one row per cell). Hovering shows
 * `tooltip(hit)` lines in a DOM tooltip without re-rendering React; clicks
 * call onClick(hit, event).
 *
 * `onDragStart(x, y, event)` turns a press-and-drag into a selection gesture:
 * return { mode: "band-y" | "band-x" | "rect" | "lasso", x0, x1, y0, y1 }
 * (the bounds the gesture is clipped to) or null to ignore. The gesture is
 * drawn on an overlay canvas (the figure is not redrawn while dragging) and
 * `onDragEnd({ mode, a, b, path }, event)` gets its end points / lasso path.
 */
export default function FigureCanvas({ width, height, draw, tooltip, onClick, onHover, style, ariaLabel, hitTest, onDragStart, onDragEnd, onWheel, onDoubleClick }) {
  const ref = useRef(null);
  const overlayRef = useRef(null);
  const tipRef = useRef(null);
  const hitsRef = useRef([]);
  const dragRef = useRef(null);
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

  // wheel zoom: a native, non-passive listener so the page does not scroll while zooming
  const wheelRef = useRef(onWheel);
  wheelRef.current = onWheel;
  const hasWheel = !!onWheel;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !hasWheel) return undefined;
    const listener = (event) => {
      const rect = canvas.getBoundingClientRect();
      const handled = wheelRef.current?.(event.clientX - rect.left, event.clientY - rect.top, event);
      if (handled) event.preventDefault();
    };
    canvas.addEventListener("wheel", listener, { passive: false });
    return () => canvas.removeEventListener("wheel", listener);
  }, [hasWheel]);

  useEffect(() => {
    const ov = overlayRef.current;
    if (!ov || width <= 0 || height <= 0) return;
    ov.width = Math.floor(width * pr);
    ov.height = Math.floor(height * pr);
  }, [width, height, pr]);

  const paintGesture = () => {
    const ov = overlayRef.current;
    const g = dragRef.current;
    if (!ov) return;
    const ctx = ov.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(pr, 0, 0, pr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (!g || !g.moved) return;
    const c = ink(styleName);
    ctx.fillStyle = c.dark ? "rgba(120,170,255,0.18)" : "rgba(24,144,255,0.12)";
    ctx.strokeStyle = c.dark ? "rgba(140,185,255,0.95)" : "rgba(24,144,255,0.9)";
    ctx.lineWidth = 1.25;
    const clampX = (v) => Math.max(g.x0, Math.min(g.x1, v));
    const clampY = (v) => Math.max(g.y0, Math.min(g.y1, v));
    if (g.mode === "lasso") {
      ctx.beginPath();
      g.path.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fill();
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }
    let [ax, ay] = g.a;
    let [bx, by] = g.b;
    if (g.mode === "band-y") {
      ax = g.x0;
      bx = g.x1;
    } else if (g.mode === "band-x") {
      ay = g.y0;
      by = g.y1;
    }
    const x0 = clampX(Math.min(ax, bx));
    const x1 = clampX(Math.max(ax, bx));
    const y0 = clampY(Math.min(ay, by));
    const y1 = clampY(Math.max(ay, by));
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, Math.max(0, x1 - x0 - 1), Math.max(0, y1 - y0 - 1));
  };

  const pos = (event) => {
    const rect = ref.current.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  };
  const find = (event) => {
    const [x, y] = pos(event);
    if (hitTest) return { hit: hitTest(x, y) || null, x, y };
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
    const g = dragRef.current;
    if (g) {
      const [x, y] = pos(event);
      if (!g.moved && Math.hypot(x - g.a[0], y - g.a[1]) < 4) return;
      g.moved = true;
      g.b = [x, y];
      if (g.mode === "lasso") {
        const last = g.path[g.path.length - 1];
        if (Math.hypot(x - last[0], y - last[1]) >= 3) g.path.push([Math.max(g.x0, Math.min(g.x1, x)), Math.max(g.y0, Math.min(g.y1, y))]);
      }
      hide();
      paintGesture();
      return;
    }
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
        style={{ width, height, display: "block", touchAction: onDragStart ? "none" : undefined }}
        onPointerDown={(event) => {
          if (!onDragStart || event.button !== 0) return;
          const [x, y] = pos(event);
          const spec = onDragStart(x, y, event);
          if (!spec) return;
          dragRef.current = { x0: 0, x1: width, y0: 0, y1: height, ...spec, a: [x, y], b: [x, y], path: [[x, y]], moved: false };
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={move}
        onPointerUp={(event) => {
          const g = dragRef.current;
          if (!g) return;
          dragRef.current = null;
          paintGesture();
          if (g.moved) {
            event.preventDefault();
            onDragEnd?.({ mode: g.mode, a: g.a, b: g.b, path: g.path }, event);
            ref.current.dataset.dragged = "1";
          }
        }}
        onMouseLeave={() => {
          hide();
          onHover?.(null);
        }}
        onDoubleClick={(event) => {
          if (!onDoubleClick) return;
          const [x, y] = pos(event);
          onDoubleClick(x, y, event);
        }}
        onClick={(event) => {
          if (ref.current?.dataset.dragged) {
            delete ref.current.dataset.dragged;
            return;
          }
          const { hit } = find(event);
          if (hit && onClick) onClick(hit, event);
        }}
      />
      {onDragStart && <canvas ref={overlayRef} aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, width, height, pointerEvents: "none" }} />}
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
