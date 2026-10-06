import React, { useEffect, useRef } from "react";
import { rowLookup } from "../../helpers/singleCell/matrix";

const BACKGROUND = 0x00000000; // transparent

/**
 * Pixel-level canvas heatmap. Every pixel is coloured from
 * colorAt(row, column), where the row comes from an even split of `height`
 * over `nRows` and the column from `cols` — an Int32Array with one entry per
 * pixel column (-1 = empty), or a function row -> Int32Array when rows use
 * different column layouts (e.g. samples binned differently).
 *
 * Cost is width x height lookups regardless of matrix size, so it stays fast
 * for thousands of cells x thousands of bins.
 *
 * pixelRatio draws at device resolution (sharp on high-DPI screens): `cols`
 * then has one entry per device pixel column, i.e. width * pixelRatio.
 */
export default function HeatmapCanvas({
  width,
  height,
  nRows,
  cols,
  colorAt,
  separators = [],
  highlightRows = null,
  onHover,
  onLeave,
  onClick,
  onDrag,
  onWheelZoom,
  className,
  style,
  pixelRatio = 1,
  wheelNeedsModifier = true,
  onDoubleClick,
}) {
  const ref = useRef(null);
  const rowsRef = useRef(null);
  const dragRef = useRef(null);
  const suppressClick = useRef(false);
  const wheelHandler = useRef(onWheelZoom);
  wheelHandler.current = onWheelZoom;
  const needsModifier = useRef(wheelNeedsModifier);
  needsModifier.current = wheelNeedsModifier;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || width <= 0 || height <= 0) return;
    const pr = pixelRatio;
    const w = Math.floor(width * pr);
    const h = Math.floor(height * pr);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rows = rowLookup(nRows, h);
    rowsRef.current = rows;
    const image = ctx.createImageData(w, h);
    const buf = new Uint32Array(image.data.buffer);
    const perRow = typeof cols === "function";
    let lastRow = -2;
    let rowCols = perRow ? null : cols;
    for (let y = 0; y < h; y += 1) {
      const r = rows[y];
      const offset = y * w;
      if (r < 0) {
        buf.fill(BACKGROUND, offset, offset + w);
        continue;
      }
      if (r === lastRow) {
        // Same row as the pixel line above: copy it.
        buf.copyWithin(offset, offset - w, offset);
        continue;
      }
      lastRow = r;
      if (perRow) rowCols = cols(r);
      for (let x = 0; x < w; x += 1) {
        const c = rowCols && x < rowCols.length ? rowCols[x] : -1;
        buf[offset + x] = c < 0 ? BACKGROUND : colorAt(r, c);
      }
    }
    ctx.putImageData(image, 0, 0);

    ctx.lineWidth = pr;
    separators.forEach((x) => {
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      const px = Math.floor(x * pr) + pr / 2;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
      ctx.stroke();
    });

    if (highlightRows && highlightRows.size && nRows) {
      ctx.strokeStyle = "rgba(0,0,0,0.85)";
      const rowH = h / nRows;
      highlightRows.forEach((r) => {
        const y0 = r * rowH;
        ctx.strokeRect(pr / 2, y0 + pr / 2, w - pr, Math.max(pr, rowH - pr));
      });
    }
  }, [width, height, nRows, cols, colorAt, separators, highlightRows, pixelRatio]);

  // Wheel zoom needs a non-passive listener to stop the page from scrolling.
  // With wheelNeedsModifier only Cmd/Ctrl/Alt wheels zoom (plain wheels scroll
  // the page); otherwise every wheel zooms, as in the genome plots.
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const listener = (event) => {
      if (!wheelHandler.current) return;
      if (needsModifier.current && !(event.metaKey || event.ctrlKey || event.altKey)) return;
      const rect = canvas.getBoundingClientRect();
      event.preventDefault();
      wheelHandler.current(
        { x: event.clientX - rect.left, deltaY: event.deltaY, deltaMode: event.deltaMode, pinch: event.ctrlKey },
        event
      );
    };
    canvas.addEventListener("wheel", listener, { passive: false });
    return () => canvas.removeEventListener("wheel", listener);
  }, []);

  useEffect(() => {
    if (!onDrag) return undefined;
    const move = (event) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = event.clientX - d.lastX;
      if (!d.moved && Math.abs(event.clientX - d.startX) < 4) return;
      d.moved = true;
      d.lastX = event.clientX;
      if (dx) onDrag({ dx, startX: d.startXLocal }, event);
    };
    const up = () => {
      if (dragRef.current?.moved) suppressClick.current = true;
      dragRef.current = null;
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [onDrag]);

  const locate = (event) => {
    const canvas = ref.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) * pixelRatio);
    const y = Math.floor((event.clientY - rect.top) * pixelRatio);
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null;
    const rows = rowsRef.current;
    const row = rows ? rows[y] : -1;
    const rowCols = typeof cols === "function" ? (row >= 0 ? cols(row) : null) : cols;
    const col = rowCols && x < rowCols.length ? rowCols[x] : -1;
    return {
      x: x / pixelRatio,
      y: y / pixelRatio,
      row,
      col,
      clientX: event.clientX,
      clientY: event.clientY,
    };
  };

  return (
    <canvas
      ref={ref}
      className={className}
      style={{
        display: "block",
        width,
        height,
        cursor: onDrag ? "grab" : onClick ? "pointer" : "default",
        ...style,
      }}
      onMouseDown={(e) => {
        if (!onDrag || e.button !== 0) return;
        const rect = ref.current.getBoundingClientRect();
        dragRef.current = {
          startX: e.clientX,
          lastX: e.clientX,
          startXLocal: e.clientX - rect.left,
          moved: false,
        };
      }}
      onMouseMove={(e) => {
        if (!onHover) return;
        const hit = locate(e);
        hit ? onHover(hit, e) : onLeave && onLeave();
      }}
      onMouseLeave={() => onLeave && onLeave()}
      onDoubleClick={(e) => {
        if (!onDoubleClick) return;
        const rect = ref.current.getBoundingClientRect();
        onDoubleClick({ x: e.clientX - rect.left }, e);
      }}
      onClick={(e) => {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        if (!onClick) return;
        const hit = locate(e);
        if (hit && hit.row >= 0) onClick(hit, e);
      }}
    />
  );
}
