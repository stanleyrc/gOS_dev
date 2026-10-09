import React, { useEffect, useRef, useState } from "react";
import usePixelRatio from "../usePixelRatio";

/**
 * One-row (or few-row) canvas strip: one column per cell, coloured by
 * `colorOf(k, row)`. Cheap for hundreds of cells and many strips (fusion
 * table rows). Hover reports the column through `titleOf(k, row)`.
 */
export default function CellStripCanvas({ n, rows = 1, width, height = 14, colorOf, titleOf, gaps = [], style, onClickCell }) {
  const ref = useRef(null);
  const ratio = usePixelRatio();
  const [title, setTitle] = useState("");
  // gaps: column indices before which a 4 px separator is drawn (e.g. tree | RNA-only)
  const gapW = 4;
  const colW = n > 0 ? Math.max(0.5, (width - gaps.length * gapW) / n) : 0;
  const xOf = (k) => k * colW + gaps.filter((g) => g <= k).length * gapW;
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext ? canvas.getContext("2d") : null;
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const rowH = height / rows;
    for (let r = 0; r < rows; r += 1) {
      for (let k = 0; k < n; k += 1) {
        const c = colorOf(k, r);
        if (!c) continue;
        ctx.fillStyle = c;
        ctx.fillRect(xOf(k), r * rowH, Math.max(colW, 1), Math.max(1, rowH - (rows > 1 ? 1 : 0)));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });
  const cellAt = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const r = Math.min(rows - 1, Math.max(0, Math.floor(((e.clientY - rect.top) / height) * rows)));
    let k = 0;
    while (k < n - 1 && xOf(k + 1) <= x) k += 1;
    return [k, r];
  };
  return (
    <canvas
      ref={ref}
      width={Math.round(width * ratio)}
      height={Math.round(height * ratio)}
      title={title}
      style={{ width, height, display: "block", cursor: onClickCell ? "pointer" : "default", ...style }}
      onMouseMove={titleOf ? (e) => setTitle(titleOf(...cellAt(e)) || "") : undefined}
      onClick={onClickCell ? (e) => onClickCell(...cellAt(e)) : undefined}
    />
  );
}
