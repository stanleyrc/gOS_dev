import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, InputNumber, Segmented, Select, Slider, Space, Switch, Tag, Tooltip, Typography } from "antd";
import { tryGet } from "../../../redux/singleCell/loaders";
import { resolveUrl } from "../../../helpers/singleCell/trackBrowser/trackSpec";
import { graphInWindows } from "../../../helpers/singleCell/trackBrowser/trackData";
import { chromLength, panWindow, zoomWindow } from "../../../helpers/singleCell/trackBrowser/locus";
import {
  axisLocus, buildMatrix, chunkRanges, chunksFor, columnAxis, decodeChunk, heatRgb, junctionMarks,
  pairAt, pickResolution, pixelRange, renderPixels, robustMax, triangleXY, validateHicIndex, windowBins,
} from "../../../helpers/singleCell/trackBrowser/hic";
import { setupCanvas } from "./draw";
import { useTrackLocus } from "./locusContext";

const { Text } = Typography;
export const HIC_URL = "{dataPath}{unit}/hic/index.json";
const CHUNK_CACHE_MAX = 600;
const MAX_PIXEL_BYTES = 96e6; // per chunk; a coarser resolution is used above this

// ----- data: index.json per unit, then aligned row chunks by HTTP range request (shared LRU across rows)
const indexCache = new Map();
const chunkCache = new Map();
function loadIndex(url) {
  if (!indexCache.has(url))
    indexCache.set(
      url,
      tryGet(url).then((r) => {
        if (r.status !== "ok") return { status: "missing", reason: `no contact map exported for this unit (${r.status})` };
        const errors = validateHicIndex(r.data);
        return errors.length ? { status: "error", reason: errors.join("; ") } : { status: "ok", index: r.data };
      })
    );
  return indexCache.get(url);
}
async function fetchRange(url, [a, b]) {
  const res = await fetch(url, { headers: { Range: `bytes=${a}-${b}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  if (res.status === 200 && buf.byteLength !== b - a + 1) return buf.slice(a, b + 1); // server ignored Range
  return buf;
}
function loadChunk(binUrl, resEntry, chunk) {
  const key = `${binUrl}|${chunk}`;
  if (chunkCache.has(key)) {
    const v = chunkCache.get(key);
    chunkCache.delete(key);
    chunkCache.set(key, v);
    return v;
  }
  const r = chunkRanges(resEntry, chunk);
  const p = Promise.all([fetchRange(binUrl, r.offsets), fetchRange(binUrl, r.weights)]).then(async ([ob, wb]) => {
    const off = new Uint32Array(ob.slice(0));
    const pr = pixelRange(resEntry, off[0], off[off.length - 1]);
    if (pr && pr[1] - pr[0] > MAX_PIXEL_BYTES) throw new Error("chunk too large at this resolution");
    const pb = pr ? await fetchRange(binUrl, pr) : null;
    return decodeChunk(r.r0, r.r1, ob, wb, pb);
  });
  p.catch(() => chunkCache.delete(key));
  chunkCache.set(key, p);
  while (chunkCache.size > CHUNK_CACHE_MAX) chunkCache.delete(chunkCache.keys().next().value);
  return p;
}

/** Index of each unit: Map unitId -> { status, index?, reason? }. */
function useHicIndexes(unitIds, urlOf) {
  const [state, setState] = useState(() => new Map());
  const key = unitIds.join(",");
  useEffect(() => {
    let alive = true;
    unitIds.forEach((id) => {
      loadIndex(urlOf(id)).then((v) => alive && setState((m) => new Map(m).set(id, v)));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

const frameTimes = [];
function recordFrame(ms) {
  frameTimes.push(ms);
  if (frameTimes.length > 200) frameTimes.shift();
  if (typeof window !== "undefined") window.__gosHicFrames = frameTimes; // read by the headless checks
}

/**
 * One unit's contact map over the shared windows: triangle (45 degrees, diagonal on top, x aligned with the tracks
 * above) or square. Cis blocks on the diagonal, trans blocks between windows off it, window borders and labels,
 * optional graph ALT edges as marks at (bp1, bp2).
 */
function HicMap({ label, entry, binUrl, settings, graph, height, onHover, sharedMax = null, onAutoMax = null }) {
  const L = useTrackLocus();
  const { slots, windows, geometry, setWindows, chromoBins } = L;
  const { trackLeft, contentW, gapX } = geometry;
  const mapW = Math.max(10, Math.round(contentW - 2 * gapX));
  const wb = useMemo(() => windowBins(entry, windows), [entry, windows]);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState(null);
  const chunksRef = useRef(new Map());
  const canvasRef = useRef(null);
  const off = useRef(typeof document !== "undefined" ? document.createElement("canvas") : null);
  const matrixRef = useRef(null);
  const colsRef = useRef(null);
  const [stats, setStats] = useState(null);

  // fetch the row chunks of the windows (cached; panning reuses them)
  const lastUrl = useRef(null);
  useEffect(() => {
    let alive = true;
    if (lastUrl.current !== binUrl) {
      chunksRef.current = new Map(); // chunk ids are per resolution
      lastUrl.current = binUrl;
      setError(null);
    }
    const need = chunksFor(wb, entry.nbins);
    const have = new Map();
    need.forEach((c) => {
      loadChunk(binUrl, entry, c)
        .then((ch) => {
          have.set(c, ch);
        })
        .catch((e) => alive && setError(e.message))
        .finally(() => {
          if (!alive) return;
          if (have.size) {
            chunksRef.current = new Map([...chunksRef.current, ...have].filter(([k]) => need.includes(k)));
            setVersion((v) => v + 1);
          }
        });
    });
    return () => {
      alive = false;
    };
  }, [wb, entry, binUrl]);

  // ICE weights that did not converge (e.g. sparse 1 kb bins) are not used: raw counts with a note
  const balanceOk = entry.balance?.method === "ICE" && entry.balance?.converged !== false;
  const norm = settings.normalization === "balanced" && balanceOk ? "balanced" : "raw";
  const H = Math.round(settings.mode === "square" ? mapW : Math.min(height, Math.ceil(mapW / 2)));
  // draw
  useEffect(() => {
    const t0 = performance.now();
    const ctx = setupCanvas(canvasRef.current, trackLeft + mapW + gapX, H);
    if (!ctx) return;
    const m = buildMatrix(wb, chunksRef.current, norm);
    matrixRef.current = m;
    const cols = columnAxis(slots, wb, mapW);
    colsRef.current = cols;
    const ownMax = robustMax(m, settings.quantile);
    if (onAutoMax) onAutoMax(label, ownMax);
    const max = settings.max != null ? settings.max : settings.shareMax && sharedMax > 0 ? sharedMax : ownMax;
    const px = renderPixels(m, cols, mapW, H, { mode: settings.mode, max, log: settings.log });
    const oc = off.current;
    oc.width = mapW;
    oc.height = H;
    oc.getContext("2d").putImageData(new ImageData(px, mapW, H), 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(oc, trackLeft, 0);
    // window borders and labels
    ctx.save();
    ctx.translate(trackLeft, 0);
    ctx.beginPath();
    ctx.rect(0, 0, mapW, H);
    ctx.clip();
    ctx.strokeStyle = "rgba(60,60,60,0.55)";
    ctx.lineWidth = 1;
    ctx.font = "11px sans-serif";
    ctx.fillStyle = "#333";
    const edges = [];
    slots.forEach((s) => edges.push(s.x0, s.x0 + s.width));
    if (settings.mode === "square") {
      edges.forEach((x) => {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.moveTo(0, x * (H / mapW));
        ctx.lineTo(mapW, x * (H / mapW));
        ctx.stroke();
      });
      slots.forEach((s, k) => ctx.fillText(`W${k + 1}`, s.x0 + 3, s.x0 * (H / mapW) + 12));
    } else {
      edges.forEach((x) => {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x - H, H);
        ctx.moveTo(x, 0);
        ctx.lineTo(x + H, H);
        ctx.stroke();
      });
      slots.forEach((s, k) => {
        const [cx, cy] = triangleXY(s.x0, s.x0 + s.width);
        if (cy > 14) ctx.fillText(`W${k + 1}`, cx - 8, Math.min(H - 4, 14));
        // label trans blocks between window pairs
        slots.forEach((s2, k2) => {
          if (k2 <= k) return;
          const [tx, ty] = triangleXY(s.x0 + s.width / 2, s2.x0 + s2.width / 2);
          if (ty < H - 6) ctx.fillText(`W${k + 1}×W${k2 + 1}`, tx - 16, ty + 4);
        });
      });
    }
    // junction overlay: ALT edges with both breakends in the windows
    if (settings.junctions && graph) {
      const marks = junctionMarks(graphInWindows(graph, slots).alts, slots, wb, m);
      ctx.strokeStyle = "#1f5fbf";
      ctx.lineWidth = 1.6;
      marks.forEach((mk) => {
        const pts = settings.mode === "square" ? [[mk.xa, mk.xb * (H / mapW)], [mk.xb, mk.xa * (H / mapW)]] : [triangleXY(mk.xa, mk.xb)];
        pts.forEach(([x, y]) => {
          if (y > H) return;
          ctx.beginPath();
          ctx.arc(x, y, 5, 0, 2 * Math.PI);
          ctx.stroke();
        });
      });
    }
    ctx.restore();
    const ms = performance.now() - t0;
    recordFrame(ms);
    setStats({ max, ms, nPixels: m.nPixels, n: m.n, missing: m.missingChunks });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, wb, slots, settings, norm, mapW, H, trackLeft, graph, sharedMax]);

  // pan (drag) and zoom (wheel) on the map move the shared windows
  const drag = useRef(null);
  const slotAt = (x) => slots.findIndex((s) => x >= s.x0 && x <= s.x0 + s.width);
  const xy = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left - trackLeft, e.clientY - r.top];
  };
  const windowUnder = (x, y) => {
    const p = settings.mode === "square" ? x : x - y; // the left end of the pair under the cursor (triangle)
    return slotAt(p) >= 0 ? slotAt(p) : slotAt(x);
  };
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return undefined;
    const handler = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left - trackLeft;
      const k = slotAt(x);
      if (k < 0) return;
      const s = slots[k];
      const f = (e.deltaY || e.deltaX) > 0 ? 1.25 : 0.8;
      setWindows(windows.map((w, i) => (i === k ? zoomWindow(w, f, (x - s.x0) / s.width, chromLength(chromoBins, w.chrom)) : w)));
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  });
  const onDown = (e) => {
    const [x, y] = xy(e);
    const k = windowUnder(x, y);
    if (k >= 0) drag.current = { k, x: e.clientX, start: windows[k] };
  };
  const onMove = (e) => {
    const [x, y] = xy(e);
    const d = drag.current;
    if (d) {
      const s = slots[d.k];
      const bpPerPx = (d.start.end - d.start.start) / s.width;
      const dx = e.clientX - d.x;
      if (Math.abs(dx) > 1) setWindows(windows.map((w, i) => (i === d.k ? panWindow(d.start, -dx * bpPerPx, chromLength(chromoBins, w.chrom)) : w)));
      return;
    }
    const cols = colsRef.current;
    const m = matrixRef.current;
    if (!cols || !m) return;
    const p = pairAt(cols, x, y, settings.mode, H);
    if (!p) return onHover(null);
    const la = axisLocus(wb, p.a);
    const lb = axisLocus(wb, p.b);
    const raw = m.values[p.a * m.n + p.b];
    return onHover({ cx: e.clientX, cy: e.clientY, unit: label, la, lb, value: raw, mode: norm, res: entry.res });
  };
  const onUp = () => {
    drag.current = null;
  };

  return (
    <div style={{ position: "relative" }}>
      <div style={{ position: "absolute", left: 4, top: 2, width: trackLeft - 8, fontSize: 11, lineHeight: 1.35, zIndex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 12, wordBreak: "break-all" }}>{label}</div>
        <div style={{ color: "#666" }}>{entry.res >= 1e6 ? `${entry.res / 1e6} Mb` : `${entry.res / 1e3} kb`} bins · {norm}</div>
        {settings.normalization === "balanced" && norm === "raw" && <div style={{ color: "#b45309" }}>balanced not available at this resolution (ICE did not converge); raw shown</div>}
        {stats && (
          <div style={{ color: "#666" }}>
            max {stats.max >= 10 ? Math.round(stats.max) : stats.max.toPrecision(2)} ({settings.max != null ? "manual" : `p${Math.round(settings.quantile * 1000) / 10}${settings.shareMax ? ", shared" : ""}`}{settings.log ? ", log" : ""})
          </div>
        )}
        <ColorBar />
        {error && <div style={{ color: "#b45309" }}>{error}</div>}
        {stats && stats.nPixels === 0 && !stats.missing && <div style={{ color: "#b45309" }}>not available (no contacts in these windows)</div>}
      </div>
      <canvas
        ref={canvasRef}
        style={{ display: "block", cursor: "grab", touchAction: "none" }}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={() => {
          drag.current = null;
          onHover(null);
        }}
      />
    </div>
  );
}

function ColorBar() {
  const stops = Array.from({ length: 11 }, (_, i) => {
    const [r, g, b] = heatRgb(i / 10);
    return `rgb(${r},${g},${b}) ${i * 10}%`;
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 2 }}>
      <span>0</span>
      <span style={{ display: "inline-block", width: 60, height: 8, background: `linear-gradient(90deg, ${stops.join(",")})`, border: "1px solid #ccc" }} />
      <span>max</span>
    </div>
  );
}

const fmtLocus = (l) => (l ? `chr${l.chrom}:${(l.start / 1e6).toFixed(3)}-${(l.end / 1e6).toFixed(3)} Mb` : "");

/**
 * Hi-C section of the track browser: one contact map per selected unit (cluster pseudobulk), stacked, over the
 * shared windows. State (spec `hic` track) is owned by the panel: { units, mode, resolution, normalization, log,
 * quantile, max, junctions, height, visible }.
 */
// dataVersion: re-render when the panel's per-unit graphs arrive (junction overlay)
// eslint-disable-next-line no-unused-vars
export default function HicSection({ units, state, setState, dataPath, patient, genome, graphs, dataVersion, narrow }) {
  const L = useTrackLocus();
  const { windows, geometry } = L;
  const urlOf = (id) => resolveUrl(HIC_URL, { dataPath, patient, unit: id, genome });
  const shown = state.units.length ? state.units.filter((id) => units.some((u) => u.id === id)) : [];
  const indexes = useHicIndexes(shown, urlOf);
  const [hover, setHover] = useState(null);
  // shared color max: the largest of the shown maps' own percentile maxima (off by default; spec color.shared)
  const [autoMax, setAutoMax] = useState({});
  const onAutoMax = React.useCallback((id, v) => setAutoMax((m) => (m[id] === v ? m : { ...m, [id]: v })), []);
  const sharedMax = Math.max(0, ...shown.map((id) => autoMax[units.find((x) => x.id === id)?.label || id] || 0));
  const mapW = Math.max(10, geometry.contentW - 2 * geometry.gapX);
  const first = shown.map((id) => indexes.get(id)).find((v) => v?.status === "ok")?.index || null;
  const resList = first ? first.resolutions.map((r) => r.res).sort((a, b) => a - b) : [];
  const resEntryFor = (index) => pickResolution(index, windows, mapW / 1.5, state.resolution);
  const set = (patch) => setState((s) => ({ ...s, ...patch }));
  const height = state.height ?? (narrow ? Math.ceil(mapW / 2) : Math.min(420, Math.ceil(mapW / 2)));
  const dataLabel = first?.data_label;

  return (
    <div style={{ borderTop: "2px solid #c0392b", marginTop: 4, paddingTop: 4 }}>
      <Space wrap size={[8, 4]} style={{ marginBottom: 4 }}>
        <Text strong>Hi-C contacts</Text>
        {dataLabel && <Tag color="gold" style={{ whiteSpace: "normal" }}>{dataLabel}</Tag>}
        <Select
          size="small"
          mode="multiple"
          style={{ minWidth: narrow ? 200 : 260 }}
          placeholder="units (cluster pseudobulk)"
          value={shown}
          options={units.map((u) => ({ label: `${u.label}${u.nCells ? ` (${u.nCells} cells)` : ""}`, value: u.id }))}
          onChange={(v) => set({ units: v.slice(0, 6) })}
        />
        <Segmented size="small" value={state.mode} onChange={(v) => set({ mode: v })} options={[{ label: "triangle", value: "triangle" }, { label: "square", value: "square" }]} />
        <Segmented size="small" value={state.normalization} onChange={(v) => set({ normalization: v })} options={[{ label: "raw", value: "raw" }, { label: "balanced (ICE)", value: "balanced" }]} />
        <Space size={4}>
          <Text>bins</Text>
          <Select
            size="small"
            style={{ width: 96 }}
            value={state.resolution ?? "auto"}
            onChange={(v) => set({ resolution: v === "auto" ? null : Number(v) })}
            options={[{ label: "auto", value: "auto" }, ...resList.map((r) => ({ label: r >= 1e6 ? `${r / 1e6} Mb` : `${r / 1e3} kb`, value: r }))]}
          />
        </Space>
        <Space size={4}><Switch size="small" checked={state.log} onChange={(v) => set({ log: v })} /><Text>log</Text></Space>
        <Space size={4}>
          <Text>max</Text>
          <Select
            size="small"
            style={{ width: 92 }}
            value={state.max != null ? "manual" : state.quantile}
            onChange={(v) => set(v === "manual" ? { max: 10 } : { max: null, quantile: v })}
            options={[0.95, 0.98, 0.99, 0.995, 0.999].map((q) => ({ label: `p${q * 100}`, value: q })).concat([{ label: "manual", value: "manual" }])}
          />
          {state.max != null && <InputNumber size="small" min={0} value={state.max} onChange={(v) => set({ max: v ?? 0 })} style={{ width: 80 }} />}
        </Space>
        <Tooltip title="One color max for all shown units (the largest of their percentile maxima), so maps compare directly; off: each map has its own max">
          <Space size={4}><Switch size="small" checked={Boolean(state.shareMax)} disabled={state.max != null} onChange={(v) => set({ shareMax: v })} /><Text>shared max</Text></Space>
        </Tooltip>
        <Tooltip title="Graph ALT edges (the unit's genome graph) drawn as blue circles at (bp1, bp2) when both breakends are in the windows">
          <Space size={4}><Switch size="small" checked={state.junctions} onChange={(v) => set({ junctions: v })} /><Text>junctions</Text></Space>
        </Tooltip>
        {state.mode === "triangle" && (
          <Space size={4}>
            <Text>height</Text>
            <Slider style={{ width: 100, margin: "0 6px" }} min={80} max={Math.max(120, Math.ceil(mapW / 2))} value={height} onChange={(v) => set({ height: v })} />
          </Space>
        )}
      </Space>
      <div style={{ fontSize: 12, color: "#555", marginBottom: 4 }}>
        One map per unit over the same windows (concatenated axis, GxG gMap style): each window&apos;s cis block on the diagonal, trans blocks between windows (W1×W2, ...) off it, so junctions between windows show as off-diagonal hotspots. Drag to pan, wheel to zoom; resolution follows the window size unless set. Single-cell contacts: not available (this dataset has cluster pseudobulk maps only).
      </div>
      {!shown.length && <Alert type="info" showIcon message="Pick one or more units to draw their contact maps." />}
      {shown.map((id) => {
        const u = units.find((x) => x.id === id);
        const st = indexes.get(id);
        if (!st) return <div key={id} style={{ fontSize: 12, color: "#888", padding: 4 }}>{u?.label || id}: loading contact map index…</div>;
        if (st.status !== "ok") return <Alert key={id} type="warning" showIcon style={{ margin: "4px 0" }} message={`${u?.label || id}: Hi-C not available (${st.reason})`} />;
        const entry = resEntryFor(st.index);
        const binUrl = urlOf(id).replace(/index\.json$/, entry.file);
        return (
          <div key={id} style={{ borderBottom: "1px solid #eee", padding: "2px 0" }}>
            <HicMap label={u?.label || id} entry={entry} binUrl={binUrl} settings={state} graph={graphs?.get(id) || null} height={height} onHover={setHover} sharedMax={sharedMax} onAutoMax={onAutoMax} />
          </div>
        );
      })}
      {hover && (
        <div style={{ position: "fixed", left: Math.min(hover.cx + 14, (typeof window !== "undefined" ? window.innerWidth : 1600) - 340), top: hover.cy + 14, background: "rgba(255,255,255,0.97)", border: "1px solid #ccc", borderRadius: 4, padding: "4px 8px", fontSize: 12, pointerEvents: "none", whiteSpace: "pre", zIndex: 1000 }}>
          {`${hover.unit}\n${fmtLocus(hover.la)}\n× ${fmtLocus(hover.lb)}\n${hover.mode === "balanced" ? "balanced" : "contacts"}: ${Number.isFinite(hover.value) ? (hover.mode === "balanced" ? hover.value.toPrecision(3) : hover.value) : "filtered bin (NaN)"} · ${hover.res / 1e3} kb bins`}
        </div>
      )}
    </div>
  );
}
