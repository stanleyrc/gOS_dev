import React, { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { Typography } from "antd";
import { casePath, tryGet } from "../../../redux/singleCell/loaders";
import { chromLimits, cnPixels, panWindow, parseCnBinnedMeta, windowLabel, zoomWindow } from "../../../helpers/singleCell/paperCnZoom";
import { paperCnRgb } from "../../../helpers/singleCell/paperPalette";

const { Text } = Typography;
const cache = new Map(); // patient -> Promise<{ meta, values }>

/** The patient's 100 kb per-cell CN (metadata + uint16 matrix), fetched once per page. */
export function loadCn100(dataset, patient) {
  const key = `${dataset?.dataPath}|${patient}`;
  if (!cache.has(key)) {
    const p = tryGet(casePath(dataset, patient, "cn_binned.json")).then(async (r) => {
      const meta = r.status === "ok" ? parseCnBinnedMeta(r.data) : null;
      if (!meta) return null;
      const res = await fetch(casePath(dataset, patient, meta.file));
      if (!res.ok) return null;
      return { meta, values: new Uint16Array(await res.arrayBuffer()) };
    });
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return cache.get(key);
}

/**
 * A figure CN heatmap made zoomable in place: a canvas over the panel's exact rectangle, the same rows (cells, top to
 * bottom) and colours (the paper's CN scale), redrawn from the 100 kb bins at the device pixel ratio for the current
 * window. Wheel zooms about the pointer, drag pans, double-click goes back to the PDF.
 * region: sidecar rows region with a genome axis; k: px per pt; win: { from, to } | null (null = the panel's own range).
 */
export default function CnZoomLayer({ region, k, win, onWindow, onClose }) {
  const dataset = useSelector((s) => s.Settings?.dataset);
  const ref = useRef(null);
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("loading");
  const chr = `${region.axis.chr}`;
  const base = { from: Number(region.axis.from), to: Number(region.axis.to) };
  const cur = win || base;
  useEffect(() => {
    let live = true;
    setStatus("loading");
    loadCn100(dataset, region.patient).then((d) => {
      if (!live) return;
      setData(d);
      setStatus(d ? "ok" : "none");
    });
    return () => {
      live = false;
    };
  }, [dataset, region.patient]);
  const w = region.w * k;
  const h = region.h * k;
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !data) return;
    const pr = window.devicePixelRatio || 1;
    const pw = Math.max(1, Math.round(w * pr));
    const px = cnPixels(data.values, data.meta, region.rows, cur, chr, pw, paperCnRgb);
    const off = document.createElement("canvas");
    off.width = pw;
    off.height = region.rows.length;
    off.getContext("2d").putImageData(new ImageData(px, pw, region.rows.length), 0, 0);
    cv.width = pw;
    cv.height = Math.max(1, Math.round(h * pr));
    const ctx = cv.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(off, 0, 0, cv.width, cv.height);
  }, [data, cur.from, cur.to, w, h, region, chr]); // eslint-disable-line react-hooks/exhaustive-deps
  // wheel zoom (non-passive so the page does not scroll)
  const curRef = useRef(cur);
  curRef.current = cur;
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !data) return undefined;
    const lim = chromLimits(data.meta, chr);
    const onWheel = (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      onWindow(zoomWindow(curRef.current, Math.exp(e.deltaY * 0.0015), (e.clientX - r.left) / r.width, lim));
    };
    cv.addEventListener("wheel", onWheel, { passive: false });
    return () => cv.removeEventListener("wheel", onWheel);
  }, [data, chr, onWindow]);
  const drag = useRef(null);
  if (status === "none") return null;
  const lim = data ? chromLimits(data.meta, chr) : null;
  return (
    <>
      <canvas
        ref={ref}
        className="sc-paperzoom"
        style={{ position: "absolute", left: region.x * k, top: region.y * k, width: w, height: h, cursor: "grab", zIndex: 3 }}
        onPointerDown={(e) => {
          e.stopPropagation();
          drag.current = { x: e.clientX, win: cur };
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || !lim) return;
          e.stopPropagation();
          onWindow(panWindow(d.win, -(e.clientX - d.x) / w, lim));
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          drag.current = null;
        }}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      />
      <div className="sc-paperzoom-badge" style={{ left: region.x * k, top: (region.y + region.h) * k + 2, width: w }}>
        <Text style={{ fontSize: 11 }}>{status === "loading" ? "loading 100 kb CN…" : `${windowLabel(chr, cur)} · wheel zoom · drag pan · double-click: PDF`}</Text>
      </div>
    </>
  );
}
