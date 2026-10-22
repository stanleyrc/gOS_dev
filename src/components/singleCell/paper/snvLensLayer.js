import React, { useEffect, useRef } from "react";
import { casePath, tryGet } from "../../../redux/singleCell/loaders";
import { snvAt, snvLookup } from "../../../helpers/singleCell/paperZoom";
import { snvWhiteNaRGB } from "../../../helpers/singleCell/matrix";

const cache = new Map();
/** A patient's per-cell SNV reads (snv_matrix.json) as a lookup, fetched once per page. */
export function loadSnvLookup(dataset, patient) {
  const key = `${dataset?.dataPath}|${patient}`;
  if (!cache.has(key)) {
    const p = tryGet(casePath(dataset, patient, "snv_matrix.json")).then((r) => (r.status === "ok" ? snvLookup(r.data) : null));
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return cache.get(key);
}

/**
 * A figure SNV / VAF heatmap redrawn from the patient's reads for the part visible in a zoomed panel: one rectangle
 * per cell x site (the figure's site order), the patient-view colours: light blue = reference reads only, grey -> black
 * by VAF, white without reads. box: display px inside the
 * lens; r0..r1 / c0..c1: the visible row / column ranges.
 */
export default function SnvLensLayer({ region, lookup, box, r0, r1, c0, c1 }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !lookup) return;
    const pr = window.devicePixelRatio || 1;
    const W = Math.max(1, Math.round(box.width));
    const H = Math.max(1, Math.round(box.height));
    cv.width = W * pr;
    cv.height = H * pr;
    const ctx = cv.getContext("2d");
    ctx.setTransform(pr, 0, 0, pr, 0, 0);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, W, H);
    const nr = Math.max(1, r1 - r0);
    const nc = Math.max(1, c1 - c0);
    const cw = W / nc;
    const ch = H / nr;
    for (let r = r0; r < r1; r += 1) {
      const cell = region.rows[r];
      for (let c = c0; c < c1; c += 1) {
        const v = snvAt(lookup, cell, region.cols.ids[c]);
        if (!v || v.vaf == null) continue;
        ctx.fillStyle = `rgb(${snvWhiteNaRGB(v.vaf).join(",")})`;
        ctx.fillRect((c - c0) * cw, (r - r0) * ch, Math.max(0.6, cw - (cw > 4 ? 0.5 : 0)), Math.max(0.6, ch - (ch > 4 ? 0.5 : 0)));
      }
    }
  }, [lookup, region, box.width, box.height, r0, r1, c0, c1]);
  return <canvas ref={ref} style={{ position: "absolute", left: box.left, top: box.top, width: box.width, height: box.height, pointerEvents: "none" }} />;
}
