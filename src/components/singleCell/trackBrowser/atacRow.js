import React, { useEffect, useRef } from "react";
import { bpToPx } from "../../../helpers/singleCell/trackBrowser/locus";
import { COLORS, setupCanvas } from "./draw";
import { useTrackLocus } from "./locusContext";

export const ATAC_COLOR = "#2b7bb9";
const fmt = (v) => (v >= 100 ? v.toFixed(0) : v >= 1 ? v.toPrecision(2) : v.toPrecision(1));

/**
 * ATAC sub-row (spec v0.4 `atac`): per window, the signal as filled columns (clade pool bigWig at 1 kb or its zoom
 * level, or a cell's 500 kb atac.arrow), peaks as ticks along the bottom, the y max printed per window. cols[k] is a
 * Float32Array of pixel columns (NaN = no data) for window k; maxes[k] its y max; peaks[k] [{ start, end }] or null;
 * note: text drawn when there is nothing to draw ("not available (reason)" / "loading").
 */
export default function AtacRow({ cols, maxes, peaks, height, width, note = null }) {
  const L = useTrackLocus();
  const ref = useRef(null);
  useEffect(() => {
    const ctx = setupCanvas(ref.current, width, height);
    if (!ctx) return;
    const left = L.geometry.gapX;
    const peakH = peaks && peaks.some((p) => p && p.length) ? 4 : 0;
    const top = 3;
    const hh = height - top - 2 - peakH;
    L.slots.forEach((s, k) => {
      const x0 = left + s.x0;
      ctx.fillStyle = "#fbfdff";
      ctx.fillRect(x0, 0, s.width, height);
      const c = cols?.[k];
      const max = maxes?.[k];
      if (c && max > 0) {
        ctx.fillStyle = ATAC_COLOR;
        const step = s.width / c.length;
        for (let x = 0; x < c.length; x += 1) {
          const v = c[x];
          if (!Number.isFinite(v) || v <= 0) continue;
          const h = Math.max(1, (Math.min(v, max) / max) * hh);
          ctx.fillRect(x0 + x * step, top + hh - h, Math.max(1, step), h);
          if (v > max) {
            ctx.fillStyle = "#c0392b";
            ctx.fillRect(x0 + x * step, top, Math.max(1, step), 2);
            ctx.fillStyle = ATAC_COLOR;
          }
        }
        ctx.fillStyle = COLORS.muted;
        ctx.font = "10px system-ui, sans-serif";
        ctx.textAlign = "right";
        ctx.textBaseline = "top";
        ctx.fillText(fmt(max), x0 - 3, top);
        ctx.textBaseline = "bottom";
        ctx.fillText("0", x0 - 3, top + hh);
      }
      const pk = peaks?.[k];
      if (pk && pk.length) {
        ctx.fillStyle = "#08306b";
        pk.forEach((p) => {
          const a = bpToPx(s, p.start + 1);
          const b = bpToPx(s, p.end);
          if (b < 0 || a > s.width) return;
          ctx.fillRect(x0 + Math.max(0, a), height - peakH, Math.max(1, Math.min(s.width, b) - Math.max(0, a)), peakH - 1);
        });
      }
    });
    if (note) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(note, left + 8, height / 2);
    }
  }, [cols, maxes, peaks, height, width, note, L.slots, L.geometry.gapX]);
  return <canvas ref={ref} style={{ display: "block" }} />;
}
