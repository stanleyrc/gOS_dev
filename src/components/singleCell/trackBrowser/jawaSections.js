import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { Alert, Checkbox, InputNumber, Segmented, Space, Switch, Tag, Tooltip, Typography } from "antd";
import { casePath, tryGet } from "../../../redux/singleCell/loaders";
import { loadCn100 } from "../paper/cnZoomLayer";
import { cnColorer } from "../../../helpers/singleCell/matrix";
import { columnAxis, xOfPos } from "../../../helpers/singleCell/trackBrowser/hic";
import {
  axisIndexOf, axisLabel, cnAxis, cnCorrelation1d, cnCorrelation2d, cnMatrix, correlationTrianglePixels, divergingRgb, heatmapPixels,
} from "../../../helpers/singleCell/trackBrowser/cnTracks";
import { WALK_LAYERS, atacInWindows, parseWalks, validateAtac, walkCopies, walkGeometry, walksInWindows } from "../../../helpers/singleCell/trackBrowser/walkTracks";
import { ecdnaCallByCell, ecdnaFieldsOf } from "../../../helpers/singleCell/cellCladeEcdnaFields";
import { useEcdnaStatus } from "../ecdnaStatusChip";
import { setupCanvas } from "./draw";
import { useTrackLocus } from "./locusContext";

const { Text } = Typography;
const ECDNA_COLORS = { "ecDNA-like": "#d62728", stable: "#1f77b4", indeterminate: "#ff7f0e", "not enough": "#bbbbbb" };
const WALK_COLORS = ["#1b9e77", "#d95f02", "#7570b3", "#e7298a", "#66a61e", "#e6ab02", "#a6761d", "#1f78b4", "#b2df8a", "#fb9a99"];
export { JAWA_TYPES, defaultJawaState, jawaStateFromTracks, jawaTracks } from "../../../helpers/singleCell/trackBrowser/jawaSpec";
function useCn(dataset, patient, wanted) {
  const [cn, setCn] = useState({ status: "idle" });
  useEffect(() => {
    if (!wanted || !dataset || !patient) return undefined;
    let live = true;
    setCn({ status: "loading" });
    loadCn100(dataset, patient)
      .then((d) => live && setCn(d ? { status: "ok", ...d } : { status: "missing" }))
      .catch(() => live && setCn({ status: "missing" }));
    return () => {
      live = false;
    };
  }, [dataset, patient, wanted]);
  return cn;
}

function useWalks(dataset, patient, layer, wanted) {
  const [w, setW] = useState({ status: "idle", walks: [] });
  useEffect(() => {
    if (!wanted || !dataset || !patient) return undefined;
    let live = true;
    const file = (WALK_LAYERS.find((l) => l.id === layer) || WALK_LAYERS[0]).file;
    setW({ status: "loading", walks: [] });
    tryGet(casePath(dataset, patient, file)).then((r) => {
      if (!live) return;
      setW(r.status === "ok" ? { status: "ok", walks: parseWalks(r.data, layer), method: r.data.method || null, notes: r.data.notes || null, file } : { status: "missing", walks: [], file });
    });
    return () => {
      live = false;
    };
  }, [dataset, patient, layer, wanted]);
  return w;
}

const Hover = ({ hover }) =>
  hover ? (
    <div style={{ position: "fixed", left: Math.min(hover.cx + 14, (typeof window !== "undefined" ? window.innerWidth : 1600) - 340), top: hover.cy + 14, background: "rgba(255,255,255,0.97)", border: "1px solid #ccc", borderRadius: 4, padding: "4px 8px", fontSize: 12, pointerEvents: "none", whiteSpace: "pre", zIndex: 1000 }}>
      {hover.text}
    </div>
  ) : null;

/**
 * JaWA track types (spec v0.6) under the track browser rows, on the shared windows: CN heat map (cells x bins in the
 * browser's row order, clade and ecDNA classifier strips at the left), CN correlation with an anchor (1D) and the
 * bin x bin CN correlation map (2D triangle, drawn like the Hi-C maps), walks (curated or proposed) and ATAC.
 */
export default function JawaSections({ state, setState, orderedUnits, groupColor, patient, narrow }) {
  const L = useTrackLocus();
  const { geometry, slots, windows } = L;
  const dataset = useSelector((s) => s.Settings.dataset);
  const palette = useSelector((s) => s.SingleCell.palette);
  const on = state.on;
  const anyCn = on.cn_heatmap || on.cn_correlation_1d || on.cn_correlation_2d;
  const cn = useCn(dataset, patient, anyCn);
  const walks = useWalks(dataset, patient, state.walkLayer, on.walks);
  const ecdna = useEcdnaStatus();
  const [hover, setHover] = useState(null);
  const mapW = Math.max(10, geometry.contentW - 2 * geometry.gapX);
  const { trackLeft } = geometry;

  const rows = useMemo(() => orderedUnits.filter((u) => !(state.tumorOnly && u.normal)), [orderedUnits, state.tumorOnly]);
  const rowIds = useMemo(() => rows.map((u) => u.id), [rows]);
  const ax = useMemo(() => (cn.status === "ok" ? cnAxis(cn.meta, windows, Math.min(600, Math.round(mapW))) : null), [cn, windows, mapW]);
  const mat = useMemo(() => (ax && cn.status === "ok" ? cnMatrix(cn.values, cn.meta, ax, rowIds) : null), [ax, cn, rowIds]);
  const nWith = useMemo(() => rowIds.filter((id) => cn.meta?.index.has(id)).length, [rowIds, cn]);
  const cols = useMemo(() => (ax ? columnAxis(slots, ax.wins, mapW) : null), [ax, slots, mapW]);

  // anchor: the user's click, else the bin with the largest CN variance across the rows (often the amplicon)
  const anchorIdx = useMemo(() => {
    if (!ax || !mat) return [];
    if (state.anchor) {
      const [c, p] = `${state.anchor}`.replace(/,/g, "").split(":");
      const i = axisIndexOf(ax, c, Number(p));
      if (i >= 0) return [i];
    }
    let best = -1;
    let bv = -1;
    for (let j = 0; j < ax.n; j += 1) {
      let s = 0;
      let ss = 0;
      let m = 0;
      for (let r = 0; r < rowIds.length; r += 1) {
        const v = mat[r * ax.n + j];
        if (Number.isFinite(v)) {
          const t = state.log ? Math.log2(v + 1) : v;
          s += t;
          ss += t * t;
          m += 1;
        }
      }
      const varr = m > 1 ? ss / m - (s / m) ** 2 : -1;
      if (varr > bv) {
        bv = varr;
        best = j;
      }
    }
    return best >= 0 ? [best] : [];
  }, [ax, mat, state.anchor, state.log, rowIds.length]);
  const anchorFromIndex = (i) => {
    const w = ax?.wins.find((x) => i >= x.axis0 && i < x.axis0 + x.n);
    return w ? `chr${w.chrom}:${Math.round(w.binStart + (i - w.axis0 + 0.5) * w.res)}` : null;
  };

  const cor2 = useMemo(() => (on.cn_correlation_2d && mat ? cnCorrelation2d(mat, rowIds.length, ax.n, { log: state.log }) : null), [on.cn_correlation_2d, mat, ax, rowIds.length, state.log]);
  const cor1 = useMemo(() => (on.cn_correlation_1d && mat ? cnCorrelation1d(mat, rowIds.length, ax.n, anchorIdx, { log: state.log }) : null), [on.cn_correlation_1d, mat, ax, rowIds.length, anchorIdx, state.log]);

  const set = (patch) => setState((s) => ({ ...s, ...patch }));
  const setOn = (k, v) => setState((s) => ({ ...s, on: { ...s.on, [k]: v } }));
  const cnNote =
    cn.status === "missing"
      ? "CN not available (no cn_binned.json / 100 kb bins exported for this report)"
      : cn.status === "loading"
      ? "loading per-cell CN (100 kb bins)…"
      : null;

  return (
    <div style={{ borderTop: "2px solid #2c7bb6", marginTop: 4, paddingTop: 4 }} data-jawa-sections>
      <Space wrap size={[8, 4]} style={{ marginBottom: 4 }}>
        <Text strong>JaWA tracks</Text>
        <Tag color="blue">spec 0.6</Tag>
        {[
          ["cn_heatmap", "CN heat map"],
          ["cn_correlation_1d", "CN correlation (anchor)"],
          ["cn_correlation_2d", "CN correlation map"],
          ["walks", "walks"],
          ["atac", "ATAC"],
        ].map(([k, label]) => (
          <Checkbox key={k} checked={on[k]} onChange={(e) => setOn(k, e.target.checked)} data-jawa-toggle={k}>
            {label}
          </Checkbox>
        ))}
        {anyCn && (
          <>
            <Tooltip title="Correlate log2(CN + 1) so a few very high copies do not dominate">
              <Space size={4}><Switch size="small" checked={state.log} onChange={(v) => set({ log: v })} /><Text>log CN</Text></Space>
            </Tooltip>
            <Space size={4}><Switch size="small" checked={state.tumorOnly} onChange={(v) => set({ tumorOnly: v })} /><Text>tumor cells only</Text></Space>
          </>
        )}
      </Space>
      {anyCn && (
        <div style={{ fontSize: 12, color: "#555", marginBottom: 4 }}>
          Per-cell JaBbA copy number in 100 kb bins{ax && ax.factor > 1 ? ` (merged to ${(ax.factor * 100) / 1000} Mb columns for this window size)` : ""}, {nWith} of {rowIds.length} shown cells in the CN export, rows in the browser&apos;s order. Correlations are Pearson across these cells: segments that rise and fall together across cells are likely on the same molecule (ecDNA, a BFB ladder or a missegregated chromosome), the cross-cell covariance signal JaWA uses to link distant pieces of a walk. Two bins of one JaBbA segment always correlate, so read the blocks between segments.
          {cnNote && <div><Text type="warning">{cnNote}</Text></div>}
        </div>
      )}
      {on.cn_heatmap && mat && <CnHeatmap mat={mat} ax={ax} cols={cols} rows={rows} groupColor={groupColor} ecdna={ecdna} windows={windows} state={state} set={set} mapW={mapW} trackLeft={trackLeft} gapX={geometry.gapX} palette={palette} setHover={setHover} onAnchor={(i) => set({ anchor: anchorFromIndex(i) })} anchorIdx={anchorIdx} />}
      {on.cn_correlation_1d && cor1 && <Cor1d r={cor1} ax={ax} cols={cols} mapW={mapW} trackLeft={trackLeft} gapX={geometry.gapX} anchorIdx={anchorIdx} anchorSet={Boolean(state.anchor)} onAnchor={(i) => set({ anchor: anchorFromIndex(i) })} onReset={() => set({ anchor: null })} setHover={setHover} n={rowIds.length} />}
      {on.cn_correlation_2d && cor2 && <Cor2d m={cor2} ax={ax} cols={cols} mapW={mapW} trackLeft={trackLeft} gapX={geometry.gapX} height={state.corrHeight} setHeight={(v) => set({ corrHeight: v })} setHover={setHover} onAnchor={(i) => set({ anchor: anchorFromIndex(i) })} n={rowIds.length} />}
      {on.walks && <WalksTrack walks={walks} state={state} set={set} slots={slots} windows={windows} mapW={mapW} trackLeft={trackLeft} gapX={geometry.gapX} rows={rows} setHover={setHover} />}
      {on.atac && <AtacTrack rows={rows} dataset={dataset} slots={slots} mapW={mapW} trackLeft={trackLeft} gapX={geometry.gapX} state={state} set={set} narrow={narrow} />}
      <Hover hover={hover} />
    </div>
  );
}

function SectionLabel({ trackLeft, children }) {
  return <div style={{ position: "absolute", left: 4, top: 2, width: trackLeft - 8, fontSize: 11, lineHeight: 1.35, zIndex: 1, color: "#333" }}>{children}</div>;
}

function CnHeatmap({ mat, ax, cols, rows, groupColor, ecdna, windows, state, set, mapW, trackLeft, gapX, palette, setHover, onAnchor, anchorIdx }) {
  const ref = useRef(null);
  const H = Math.max(40, state.heatHeight);
  const n = ax.n;
  // ecDNA classifier strips: amplicons overlapping the windows (call of the smallest tree clade holding the cell)
  const ecFields = useMemo(() => {
    if (ecdna.status !== "ok") return [];
    return ecdnaFieldsOf(ecdna.data)
      .filter((f) => windows.some((w) => `${f.amplicon.chrom}`.replace(/^chr/, "") === w.chrom && Number(f.amplicon.end) >= w.start && Number(f.amplicon.start) <= w.end))
      .slice(0, 3)
      .map((f) => ({ ...f, calls: ecdnaCallByCell(ecdna.data, f.amplicon) }));
  }, [ecdna, windows]);
  const stripW = 9;
  const strips = 1 + ecFields.length;
  const stripX0 = trackLeft - 6 - strips * (stripW + 2);
  useEffect(() => {
    const ctx = setupCanvas(ref.current, trackLeft + mapW + gapX, H);
    if (!ctx) return;
    const colorOf = cnColorer(palette, "total");
    const px = heatmapPixels(mat, rows.length, n, cols, mapW, H, colorOf);
    const oc = document.createElement("canvas");
    oc.width = Math.round(mapW);
    oc.height = H;
    oc.getContext("2d").putImageData(new ImageData(px, Math.round(mapW), H), 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(oc, trackLeft, 0);
    const rh = H / Math.max(1, rows.length);
    rows.forEach((u, r) => {
      ctx.fillStyle = groupColor(u) || "#ccc";
      ctx.fillRect(stripX0, r * rh, stripW, Math.max(1, rh));
      ecFields.forEach((f, k) => {
        const call = f.calls.get(u.id);
        if (!call) return;
        ctx.fillStyle = ECDNA_COLORS[call] || "#999";
        ctx.fillRect(stripX0 + (k + 1) * (stripW + 2), r * rh, stripW, Math.max(1, rh));
      });
    });
    // window borders and anchor
    ctx.strokeStyle = "#999";
    ax.wins.forEach((w, k) => {
      if (k === 0) return;
      const x = trackLeft + (cols.findIndex((c) => c === w.axis0) >= 0 ? cols.findIndex((c) => c === w.axis0) : 0);
      ctx.beginPath();
      ctx.moveTo(x - 0.5, 0);
      ctx.lineTo(x - 0.5, H);
      ctx.stroke();
    });
    anchorIdx.forEach((i) => {
      const x = cols.indexOf(i);
      if (x < 0) return;
      ctx.strokeStyle = "#111";
      ctx.setLineDash([3, 2]);
      ctx.strokeRect(trackLeft + x, 0, Math.max(1, cols.lastIndexOf(i) - x + 1), H);
      ctx.setLineDash([]);
    });
  }, [mat, ax, cols, rows, n, H, mapW, trackLeft, gapX, palette, groupColor, ecFields, stripX0, anchorIdx]);
  const onMove = (e) => {
    const rect = ref.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const r = Math.min(rows.length - 1, Math.floor((y / H) * rows.length));
    const u = rows[r];
    if (!u) return setHover(null);
    if (x < trackLeft) {
      const k = Math.floor((x - stripX0) / (stripW + 2));
      if (k === 0) return setHover({ cx: e.clientX, cy: e.clientY, text: `${u.id}\ngroup: ${u.group ?? "none"}` });
      if (k > 0 && ecFields[k - 1]) return setHover({ cx: e.clientX, cy: e.clientY, text: `${u.id}\necDNA classifier, ${ecFields[k - 1].amplicon.label || ecFields[k - 1].amplicon.amplicon}: ${ecFields[k - 1].calls.get(u.id) || "no call (cell not in a called clade)"}` });
      return setHover(null);
    }
    const j = cols[Math.round(x - trackLeft)] ?? -1;
    if (j < 0) return setHover(null);
    const v = mat[r * ax.n + j];
    return setHover({ cx: e.clientX, cy: e.clientY, text: `${u.id} · ${u.group ?? ""}\n${axisLabel(ax, j)}\nCN ${Number.isFinite(v) ? v.toFixed(1) : "not available"}\nclick: use this bin as the correlation anchor` });
  };
  const onClick = (e) => {
    const rect = ref.current.getBoundingClientRect();
    const j = cols[Math.round(e.clientX - rect.left - trackLeft)] ?? -1;
    if (j >= 0) onAnchor(j);
  };
  return (
    <div style={{ position: "relative", borderBottom: "1px solid #eee", padding: "2px 0" }} data-jawa="cn_heatmap">
      <SectionLabel trackLeft={stripX0 + 4}>
        <b>CN heat map</b>
        <br />
        {rows.length} cells
        <br />
        strips: clade{ecFields.length ? ", ecDNA call" : ""}
        <br />
        <InputNumber size="small" min={60} max={1200} step={40} value={H} onChange={(v) => set({ heatHeight: v || 240 })} style={{ width: 70 }} /> px
      </SectionLabel>
      <canvas ref={ref} style={{ display: "block", cursor: "crosshair" }} onMouseMove={onMove} onMouseLeave={() => setHover(null)} onClick={onClick} />
      {ecFields.length > 0 && (
        <div style={{ fontSize: 11, color: "#555" }}>
          ecDNA strips ({ecFields.map((f) => f.amplicon.label || f.amplicon.amplicon).join("; ")}): {Object.entries(ECDNA_COLORS).map(([k, c]) => <span key={k} style={{ marginRight: 8 }}><span style={{ display: "inline-block", width: 9, height: 9, background: c, marginRight: 3 }} />{k}</span>)}
          · the classifier call of the smallest tree clade holding the cell (ecdna_status.json); blank = no call.
        </div>
      )}
    </div>
  );
}

function Cor1d({ r, ax, cols, mapW, trackLeft, gapX, anchorIdx, anchorSet, onAnchor, onReset, setHover, n }) {
  const ref = useRef(null);
  const H = 70;
  useEffect(() => {
    const ctx = setupCanvas(ref.current, trackLeft + mapW + gapX, H);
    if (!ctx) return;
    const mid = H / 2;
    ctx.strokeStyle = "#ddd";
    ctx.beginPath();
    ctx.moveTo(trackLeft, mid);
    ctx.lineTo(trackLeft + mapW, mid);
    ctx.stroke();
    for (let x = 0; x < cols.length; x += 1) {
      const j = cols[x];
      if (j < 0) continue;
      const v = r[j];
      if (!Number.isFinite(v)) {
        ctx.fillStyle = "#e4e4e4";
        ctx.fillRect(trackLeft + x, mid - 1, 1, 2);
        continue;
      }
      const [cr, cg, cb] = divergingRgb(v);
      ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
      const h = (Math.abs(v) * (H / 2 - 3));
      ctx.fillRect(trackLeft + x, v >= 0 ? mid - h : mid, 1, Math.max(1, h));
    }
    ctx.fillStyle = "#555";
    ctx.font = "10px sans-serif";
    ctx.fillText("+1", trackLeft - 18, 10);
    ctx.fillText("0", trackLeft - 12, mid + 3);
    ctx.fillText("−1", trackLeft - 18, H - 2);
    anchorIdx.forEach((i) => {
      const x = cols.indexOf(i);
      if (x < 0) return;
      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.moveTo(trackLeft + x, H);
      ctx.lineTo(trackLeft + x - 5, H - 8);
      ctx.lineTo(trackLeft + x + 5, H - 8);
      ctx.fill();
    });
  }, [r, cols, mapW, trackLeft, gapX, anchorIdx]);
  const jAt = (e) => cols[Math.round(e.clientX - ref.current.getBoundingClientRect().left - trackLeft)] ?? -1;
  return (
    <div style={{ position: "relative", borderBottom: "1px solid #eee", padding: "2px 0" }} data-jawa="cn_correlation_1d">
      <SectionLabel trackLeft={trackLeft - 22}>
        <b>CN correlation with anchor</b>
        <br />
        anchor: {anchorIdx.length ? axisLabel(ax, anchorIdx[0]) : "none"} {anchorSet ? <button type="button" onClick={onReset} style={{ border: "none", background: "none", padding: 0, color: "#1677ff", cursor: "pointer", fontSize: 11 }}>(reset)</button> : "(most variable bin)"}
      </SectionLabel>
      <canvas
        ref={ref}
        style={{ display: "block", cursor: "crosshair" }}
        onMouseMove={(e) => {
          const j = jAt(e);
          setHover(j >= 0 ? { cx: e.clientX, cy: e.clientY, text: `${axisLabel(ax, j)}\nr = ${Number.isFinite(r[j]) ? r[j].toFixed(2) : "not available (no CN variance)"} across ${n} cells\nclick: make this the anchor` } : null);
        }}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          const j = jAt(e);
          if (j >= 0) onAnchor(j);
        }}
      />
    </div>
  );
}

function Cor2d({ m, ax, cols, mapW, trackLeft, gapX, height, setHeight, setHover, onAnchor, n }) {
  const ref = useRef(null);
  const H = Math.round(Math.min(height, Math.ceil(mapW / 2)));
  useEffect(() => {
    const ctx = setupCanvas(ref.current, trackLeft + mapW + gapX, H);
    if (!ctx) return;
    const px = correlationTrianglePixels(m, cols, mapW, H);
    const oc = document.createElement("canvas");
    oc.width = Math.round(mapW);
    oc.height = H;
    oc.getContext("2d").putImageData(new ImageData(px, Math.round(mapW), H), 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(oc, trackLeft, 0);
    // color bar
    for (let i = 0; i < 100; i += 1) {
      const [r, g, b] = divergingRgb(1 - (2 * i) / 99);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(trackLeft - 30, 60 + i, 10, 1);
    }
    ctx.fillStyle = "#333";
    ctx.font = "10px sans-serif";
    ctx.fillText("+1", trackLeft - 18, 66);
    ctx.fillText("0", trackLeft - 18, 113);
    ctx.fillText("−1", trackLeft - 18, 160);
  }, [m, cols, mapW, trackLeft, gapX, H]);
  const pairAt = (e) => {
    const rect = ref.current.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left - trackLeft);
    const y = Math.round(e.clientY - rect.top);
    const xa = x - y;
    const xb = x + y;
    if (xa < 0 || xb >= cols.length) return null;
    const a = cols[xa];
    const b = cols[xb];
    return a >= 0 && b >= 0 ? { a, b } : null;
  };
  return (
    <div style={{ position: "relative", borderBottom: "1px solid #eee", padding: "2px 0" }} data-jawa="cn_correlation_2d">
      <SectionLabel trackLeft={trackLeft - 34}>
        <b>CN correlation map</b>
        <br />
        bin × bin, {n} cells
        <br />
        <InputNumber size="small" min={80} max={900} step={40} value={height} onChange={(v) => setHeight(v || 320)} style={{ width: 70 }} /> px
      </SectionLabel>
      <canvas
        ref={ref}
        style={{ display: "block", cursor: "crosshair" }}
        onMouseMove={(e) => {
          const p = pairAt(e);
          setHover(p ? { cx: e.clientX, cy: e.clientY, text: `${axisLabel(ax, Math.min(p.a, p.b))}\n× ${axisLabel(ax, Math.max(p.a, p.b))}\nr = ${Number.isFinite(m.values[p.a * m.n + p.b]) ? m.values[p.a * m.n + p.b].toFixed(2) : "not available (no CN variance)"}\nclick: anchor the 1D track at the left bin` } : null);
        }}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          const p = pairAt(e);
          if (p) onAnchor(Math.min(p.a, p.b));
        }}
      />
    </div>
  );
}

function WalksTrack({ walks, state, set, slots, windows, mapW, trackLeft, gapX, rows, setHover }) {
  const ref = useRef(null);
  const lane = 16;
  const shown = useMemo(() => walksInWindows(walks.walks, windows, { minCells: state.walkMinCells }), [walks, windows, state.walkMinCells]);
  const H = Math.max(24, shown.length * lane + 6);
  const xOf = (c, p) => xOfPos(slots, c, p);
  const geo = useMemo(() => shown.map((w) => walkGeometry(w, xOf)), [shown, slots]); // eslint-disable-line react-hooks/exhaustive-deps
  const rowIds = useMemo(() => rows.map((u) => u.id), [rows]);
  useEffect(() => {
    const ctx = setupCanvas(ref.current, trackLeft + mapW + gapX, H);
    if (!ctx) return;
    shown.forEach((w, k) => {
      const y = 3 + k * lane;
      const col = WALK_COLORS[k % WALK_COLORS.length];
      const g = geo[k];
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      g.links.forEach((l) => {
        ctx.setLineDash(l.closing ? [3, 2] : []);
        ctx.beginPath();
        const xa = trackLeft + l.xa;
        const xb = trackLeft + l.xb;
        ctx.moveTo(xa, y + lane / 2);
        ctx.bezierCurveTo(xa, y - 2, xb, y - 2, xb, y + lane / 2);
        ctx.stroke();
      });
      ctx.setLineDash([]);
      ctx.fillStyle = col;
      g.bars.forEach((b) => {
        ctx.fillRect(trackLeft + b.x0, y + 4, Math.max(2, b.x1 - b.x0), lane - 8);
        // strand chevron
        const xm = trackLeft + (b.x0 + b.x1) / 2;
        if (b.x1 - b.x0 > 10) {
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          const d = b.strand === "-" ? -3 : 3;
          ctx.moveTo(xm - d, y + 5);
          ctx.lineTo(xm + d, y + lane / 2);
          ctx.lineTo(xm - d, y + lane - 5);
          ctx.fill();
          ctx.fillStyle = col;
        }
      });
    });
  }, [shown, geo, H, mapW, trackLeft, gapX]);
  const layerInfo = WALK_LAYERS.find((l) => l.id === state.walkLayer) || WALK_LAYERS[0];
  return (
    <div style={{ position: "relative", borderBottom: "1px solid #eee", padding: "2px 0" }} data-jawa="walks">
      <Space wrap size={[8, 4]} style={{ marginBottom: 2 }}>
        <Text strong>Walks</Text>
        <Segmented size="small" value={state.walkLayer} onChange={(v) => set({ walkLayer: v })} options={WALK_LAYERS.map((l) => ({ label: l.label, value: l.id }))} />
        <Text>min cells</Text>
        <InputNumber size="small" min={0} value={state.walkMinCells} onChange={(v) => set({ walkMinCells: v || 0 })} style={{ width: 70 }} />
        <Text type="secondary" style={{ fontSize: 12 }}>
          {walks.status === "ok" ? `${shown.length} of ${walks.walks.length} walks touch the windows (most cells first, up to 40) · ${walks.method || layerInfo.label}` : walks.status === "missing" ? `walks not available (no ${walks.file} for this report)` : "loading walks…"}
        </Text>
      </Space>
      {walks.status === "ok" && state.walkLayer === "peel" && <div style={{ fontSize: 12, color: "#8a5a00" }}>Proposed walks (peel / covariance), not curated; compare against the curated layer.</div>}
      {walks.status === "ok" && !shown.length && <Alert type="info" showIcon message="No walk of this layer touches the current windows." style={{ marginBottom: 4 }} />}
      {shown.length > 0 && (
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", left: 4, top: 0, width: trackLeft - 8, fontSize: 10, lineHeight: `${lane}px`, paddingTop: 3 }}>
            {shown.map((w, k) => (
              <div key={w.id} style={{ height: lane, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", color: WALK_COLORS[k % WALK_COLORS.length] }} title={w.label}>
                {w.circular ? "○ " : "— "}{w.label} · {w.ncells}
              </div>
            ))}
          </div>
          <canvas
            ref={ref}
            style={{ display: "block" }}
            onMouseMove={(e) => {
              const k = Math.floor((e.clientY - ref.current.getBoundingClientRect().top - 3) / lane);
              const w = shown[k];
              if (!w) return setHover(null);
              const cp = walkCopies(w, rowIds);
              const vals = [...cp].filter(Number.isFinite).sort((a, b) => a - b);
              const med = vals.length ? vals[Math.floor(vals.length / 2)] : null;
              return setHover({ cx: e.clientX, cy: e.clientY, text: `${w.label}\n${w.circular ? "circular" : "linear"} · ${w.nodes.length} nodes (${w.inWin.length} in the windows) · ${w.method}\n${w.ncells} cells carry it in the export; median copies over the shown cells ${med != null ? med.toFixed(1) : "not available"}\nnodes: ${w.nodes.slice(0, 6).map((n) => `${n.chrom}:${(n.start / 1e6).toFixed(2)}-${(n.end / 1e6).toFixed(2)}${n.strand}`).join(" → ")}${w.nodes.length > 6 ? " …" : ""}` });
            }}
            onMouseLeave={() => setHover(null)}
          />
        </div>
      )}
    </div>
  );
}

/** ATAC per group (gos-atac-bins/1 per unit). This dataset has no ATAC export, so every unit reads "not available". */
function AtacTrack({ rows, dataset, slots, mapW, trackLeft, gapX, state, set }) {
  const groups = useMemo(() => [...new Set(rows.map((u) => u.group).filter((g) => g != null))].slice(0, 8), [rows]);
  const [docs, setDocs] = useState({});
  useEffect(() => {
    if (!dataset) return undefined;
    let live = true;
    groups.forEach((g) => {
      const unit = `${g}`.replace(/\s+/g, "_");
      tryGet(`${dataset.dataPath}${unit}/atac/signal.json`).then((r) => {
        if (!live) return;
        const errs = r.status === "ok" ? validateAtac(r.data) : null;
        setDocs((d) => ({ ...d, [g]: r.status === "ok" && !errs.length ? { status: "ok", doc: r.data } : { status: "missing", reason: r.status === "ok" ? errs.join("; ") : "no ATAC export for this unit" } }));
      });
    });
    return () => {
      live = false;
    };
  }, [dataset, groups]);
  const anyOk = groups.some((g) => docs[g]?.status === "ok");
  return (
    <div style={{ position: "relative", borderBottom: "1px solid #eee", padding: "2px 0" }} data-jawa="atac">
      <Space wrap size={[8, 4]}>
        <Text strong>ATAC</Text>
        <Space size={4}><Switch size="small" checked={state.perCopy} onChange={(v) => set({ perCopy: v })} /><Text>per copy (signal ÷ CN)</Text></Space>
      </Space>
      {!anyOk && <Alert type="info" showIcon style={{ marginTop: 4 }} message="ATAC not available (no ATAC data for this dataset; the dATAC lines are processed on the other cluster and are pending)." />}
      {anyOk && groups.map((g) => (docs[g]?.status === "ok" ? <AtacRow key={g} label={g} doc={docs[g].doc} slots={slots} mapW={mapW} trackLeft={trackLeft} gapX={gapX} perCopy={state.perCopy} /> : <div key={g} style={{ fontSize: 12, paddingLeft: 4 }}>{g}: ATAC not available ({docs[g]?.reason || "loading"})</div>))}
    </div>
  );
}

function AtacRow({ label, doc, slots, mapW, trackLeft, gapX, perCopy }) {
  const ref = useRef(null);
  const H = 40;
  useEffect(() => {
    const ctx = setupCanvas(ref.current, trackLeft + mapW + gapX, H);
    if (!ctx) return;
    const a = atacInWindows(doc, slots, { perCopy });
    ctx.fillStyle = "#4daf4a";
    a.bars.forEach((b) => {
      const h = a.max > 0 ? (b.v / a.max) * (H - 8) : 0;
      ctx.fillRect(trackLeft + b.x0, H - 6 - h, Math.max(1, b.x1 - b.x0), h);
    });
    ctx.fillStyle = "#222";
    a.peaks.forEach((p) => ctx.fillRect(trackLeft + p.x0, H - 4, Math.max(1, p.x1 - p.x0), 3));
    ctx.font = "11px sans-serif";
    ctx.fillText(label, 4, 14);
  }, [doc, slots, mapW, trackLeft, gapX, perCopy, label]);
  return <canvas ref={ref} style={{ display: "block" }} />;
}
