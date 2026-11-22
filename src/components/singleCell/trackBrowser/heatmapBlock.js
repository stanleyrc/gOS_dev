import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CN_PALETTE, NA_COLOR, binRange, cnRgb, columnBins, diffColor, heatmapRowAt, heatmapRows, lodBinAt, lodLayout, medianProfile, rowsOf, stripScales,
  stripValue, STRIPS,
} from "../../../helpers/singleCell/trackBrowser/cnHeatmap";
import { bpToPx, formatWindow } from "../../../helpers/singleCell/trackBrowser/locus";
import { COLORS, drawTree, setupCanvas } from "./draw";

const STRIP_W = 9;
const median = (v) => {
  const s = v.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : 2;
};

/** "not available (reason)" line in the track area (spec conformance: never placeholder data). */
export function UnavailableRow({ title, reason, leftW, width }) {
  const text = /^not available/i.test(`${reason}`) ? reason : `not available (${reason})`;
  return (
    <div style={{ display: "flex", width, minHeight: 24, alignItems: "center", borderBottom: "1px solid #eee", fontSize: 12 }}>
      <div style={{ width: leftW - 6, textAlign: "right", paddingRight: 6, color: COLORS.muted, flex: "none" }}>{title}</div>
      <div style={{ color: "#8a5a00", paddingLeft: 8 }}>{text}</div>
    </div>
  );
}

/**
 * The `cn_heatmap` track: cells x 500 kb bins on the shared windows (or genome-wide from the 5 Mb LOD), rows in the
 * stack's order (tree order, selected clades first), left strips (clade, plate, time point, S-phase, MAPD, depth,
 * ecDNA-caller call). Clades mode: one median band per clade (n = the shown cells), expandable to its cells.
 * Click a band: select the clade (shift: add); click its ▸: expand. Click a cell row: pin that cell's rows
 * (linked brushing); shift-click: select its clade. Genome-wide: click a chromosome to open it.
 */
export function CnHeatmapBlock({
  hm, mats, lod, matStatus, lodStatus, slots, geometry, width, mode, units, groupColor, selected, onSelect, expanded, onToggleExpand, onPinCell,
  pinnedIds, rowPx, genomeWide, onJumpChrom, treeLayout, colorMode, title = "CN heat map",
}) {
  const { leftW, trackLeft } = geometry;
  const ref = useRef(null);
  const [tip, setTip] = useState(null);
  const index = hm.index;
  const layout = useMemo(() => heatmapRows(units, mode, expanded, rowPx, { bandPx: 16, maxH: mode === "cells" ? 480 : 420 }), [units, mode, expanded, rowPx]);
  const unitById = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const strips = useMemo(() => STRIPS.filter((s) => units.some((u) => stripValue(u, s.key) != null)), [units]);
  const scales = useMemo(() => stripScales(units, groupColor), [units, groupColor]);
  const stripX0 = leftW - 4 - strips.length * STRIP_W;
  const heatW = slots.length ? slots[slots.length - 1].x0 + slots[slots.length - 1].width : 0;
  const genomeLayout = useMemo(() => (genomeWide && index?.lod ? lodLayout(index.lod, heatW) : []), [genomeWide, index, heatW]);
  // the tree is drawn only when the rows are in plain tree order (cells mode, no selection reordering)
  const showTree = mode === "cells" && treeLayout && !(selected || []).length && stripX0 > 60;
  const treeW = showTree ? Math.min(110, stripX0 - 4) : 0;

  // per band: matrix rows of its members, and the neutral CN (median ploidy, or 2 for absolute colors)
  const bandInfo = useMemo(() => {
    const m = new Map();
    if (!index) return m;
    layout.rows.forEach((r) => {
      if (r.kind !== "band") return;
      m.set(r.group, { rows: rowsOf(index, r.members), neutral: colorMode === "absolute" ? 2 : median(r.members.map((id) => Number(unitById.get(id)?.ploidy))) });
    });
    return m;
  }, [layout, index, unitById, colorMode]);

  // clade medians per window (chromosome matrices) or genome-wide (LOD)
  const profiles = useMemo(() => {
    const out = new Map();
    if (!index) return out;
    bandInfo.forEach((b, g) => {
      if (genomeWide) {
        if (lod) out.set(`${g}|lod`, medianProfile(lod, index.lod.bins.length, b.rows));
        return;
      }
      slots.forEach((s, k) => {
        const entry = index.chroms.get(s.window.chrom);
        const mat = mats.get(s.window.chrom);
        if (!entry || !mat) return;
        out.set(`${g}|${k}`, medianProfile(mat, entry.starts.length, b.rows, binRange(entry, s.window)));
      });
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bandInfo, index, slots, genomeWide, lod, mats.size, [...mats.keys()].join(",")]);

  useEffect(() => {
    const H = layout.height;
    const ctx = setupCanvas(ref.current, width, H);
    if (!ctx || !index) return;
    ctx.imageSmoothingEnabled = false;
    const rows = layout.rows;
    const rowOfPx = new Int32Array(H).fill(-1);
    for (let py = 0, r = 0; py < H; py += 1) {
      while (r < rows.length && rows[r].y + rows[r].h <= py + 0.5) r += 1;
      if (r < rows.length && rows[r].y <= py + 0.5) rowOfPx[py] = r;
    }
    const matRow = rows.map((r) => (r.kind === "cell" ? index.cellIndex.get(`${r.id}`) ?? -1 : -1));
    const neutral = rows.map((r) => (r.kind === "band" ? bandInfo.get(r.group)?.neutral ?? 2 : colorMode === "absolute" ? 2 : Number(unitById.get(r.id)?.ploidy) || 2));
    const paint = (x0, cols, valueAt) => {
      const W = cols;
      if (W <= 0) return;
      const img = new ImageData(W, H);
      const d = img.data;
      for (let py = 0; py < H; py += 1) {
        const r = rowOfPx[py];
        if (r < 0) continue;
        for (let x = 0; x < W; x += 1) {
          const v = valueAt(r, x);
          if (v === undefined) continue;
          const rgb = cnRgb(v, neutral[r]);
          const o = (py * W + x) * 4;
          d[o] = rgb[0];
          d[o + 1] = rgb[1];
          d[o + 2] = rgb[2];
          d[o + 3] = 255;
        }
      }
      const off = document.createElement("canvas");
      off.width = W;
      off.height = H;
      off.getContext("2d").putImageData(img, 0, 0);
      ctx.drawImage(off, x0, 0, W, H);
    };
    if (genomeWide) {
      if (lod) {
        const nL = index.lod.bins.length;
        const W = Math.max(1, Math.round(heatW));
        const binOf = new Int32Array(W);
        for (let x = 0; x < W; x += 1) binOf[x] = lodBinAt(genomeLayout, x + 0.5);
        paint(trackLeft, W, (r, x) => {
          const b = binOf[x];
          if (b < 0) return undefined;
          if (rows[r].kind === "band") return profiles.get(`${rows[r].group}|lod`)?.median[b];
          return matRow[r] < 0 ? NaN : lod[matRow[r] * nL + b];
        });
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        ctx.fillStyle = COLORS.muted;
        ctx.font = "10px system-ui, sans-serif";
        ctx.textAlign = "center";
        genomeLayout.forEach((c) => {
          ctx.beginPath();
          ctx.moveTo(trackLeft + c.x0 + 0.5, 0);
          ctx.lineTo(trackLeft + c.x0 + 0.5, H);
          ctx.stroke();
        });
      }
    } else {
      slots.forEach((s, k) => {
        const entry = index.chroms.get(s.window.chrom);
        const mat = mats.get(s.window.chrom);
        if (!entry || !mat) return;
        const W = Math.max(1, Math.round(s.width));
        const cols = columnBins(entry, s.window, W);
        const nB = entry.starts.length;
        paint(trackLeft + s.x0, W, (r, x) => {
          const b = cols[x];
          if (b < 0) return undefined;
          if (rows[r].kind === "band") return profiles.get(`${rows[r].group}|${k}`)?.median[b];
          return matRow[r] < 0 ? NaN : mat[matRow[r] * nB + b];
        });
      });
    }
    // strips and labels
    rows.forEach((r) => {
      const y = r.y;
      const h = Math.max(r.h, 0.5);
      const u = r.kind === "cell" ? unitById.get(r.id) : null;
      strips.forEach((s, i) => {
        let color;
        if (r.kind === "band") {
          if (s.key !== "clade") return;
          color = groupColor(r.group);
        } else color = scales.get(s.key).color(stripValue(u, s.key));
        ctx.fillStyle = color;
        ctx.fillRect(stripX0 + i * STRIP_W, y, STRIP_W - 1, h);
      });
      if (r.kind === "band") {
        const n = r.members.length;
        ctx.fillStyle = COLORS.ink;
        ctx.font = "600 11px system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(`${expanded[r.group] ? "▾" : "▸"} ${r.group}`, 4, y + h / 2);
        ctx.font = "10px system-ui, sans-serif";
        ctx.fillStyle = COLORS.muted;
        ctx.textAlign = "right";
        ctx.fillText(`n ${n}`, stripX0 - 4, y + h / 2);
        ctx.strokeStyle = "#fff";
        ctx.beginPath();
        ctx.moveTo(trackLeft, y + h - 0.5);
        ctx.lineTo(trackLeft + heatW, y + h - 0.5);
        ctx.stroke();
      } else if (r.h >= 10 && !showTree) {
        ctx.fillStyle = COLORS.ink;
        ctx.font = "10px system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(`${r.id}`.slice(-18), 14, y + h / 2);
      }
      if (u && pinnedIds.has(r.id)) {
        ctx.fillStyle = COLORS.sel;
        ctx.fillRect(stripX0 - 6, y, 4, Math.max(2, h));
        ctx.strokeStyle = COLORS.sel;
        ctx.lineWidth = 1;
        ctx.strokeRect(trackLeft + 0.5, y, heatW - 1, Math.max(2, h));
      }
    });
    // selection: outline the selected clades' rows, dim the others
    if ((selected || []).length) {
      const groups = new Map();
      rows.forEach((r) => {
        const g = groups.get(r.group) || { y0: Infinity, y1: -Infinity };
        g.y0 = Math.min(g.y0, r.y);
        g.y1 = Math.max(g.y1, r.y + r.h);
        groups.set(r.group, g);
      });
      groups.forEach((g, name) => {
        if (selected.includes(name)) {
          ctx.strokeStyle = COLORS.sel;
          ctx.lineWidth = 2;
          ctx.strokeRect(1, g.y0 + 1, trackLeft + heatW - 2, Math.max(2, g.y1 - g.y0 - 2));
        } else {
          ctx.fillStyle = "rgba(255,255,255,0.62)";
          ctx.fillRect(0, g.y0, trackLeft + heatW, g.y1 - g.y0);
        }
      });
    }
    if (showTree) {
      const centers = new Map(rows.map((r) => [r.id, r.y + r.h / 2]));
      drawTree(ctx, treeLayout, (id) => centers.get(id) ?? -1000, treeW, 0, H, () => "rgba(0,0,0,0)");
    }
  }, [layout, index, mats, lod, profiles, slots, width, genomeWide, genomeLayout, heatW, trackLeft, strips, scales, stripX0, unitById, groupColor, expanded, pinnedIds, selected, showTree, treeW, treeLayout, bandInfo, colorMode]);

  const locate = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const i = heatmapRowAt(layout.rows, y);
    return { x, y, row: i >= 0 ? layout.rows[i] : null };
  };
  const posAt = (x) => {
    if (genomeWide) {
      const c = genomeLayout.find((it) => x - trackLeft >= it.x0 && x - trackLeft < it.x1);
      return c ? { chrom: c.chrom, genome: true, bin: lodBinAt(genomeLayout, x - trackLeft) } : null;
    }
    const k = slots.findIndex((s) => x >= trackLeft + s.x0 && x <= trackLeft + s.x0 + s.width);
    if (k < 0) return null;
    const s = slots[k];
    const pos = Math.round(s.window.start + ((x - trackLeft - s.x0) / s.width) * (s.window.end - s.window.start));
    return { k, chrom: s.window.chrom, pos };
  };
  const valueAt = (row, p) => {
    if (!p || !index) return null;
    if (p.genome) {
      if (!lod || p.bin < 0) return null;
      if (row.kind === "band") return profiles.get(`${row.group}|lod`)?.median[p.bin];
      const m = index.cellIndex.get(`${row.id}`);
      return m == null ? null : lod[m * index.lod.bins.length + p.bin];
    }
    const entry = index.chroms.get(p.chrom);
    const mat = mats.get(p.chrom);
    if (!entry || !mat) return null;
    const [b] = binRange(entry, { start: p.pos, end: p.pos });
    if (b >= entry.starts.length || entry.starts[b] > p.pos) return null;
    if (row.kind === "band") {
      const pr = profiles.get(`${row.group}|${p.k}`);
      return pr ? { median: pr.median[b], q1: pr.q1[b], q3: pr.q3[b], n: pr.n[b] } : null;
    }
    const m = index.cellIndex.get(`${row.id}`);
    return m == null ? null : mat[m * entry.starts.length + b];
  };
  const onMove = (e) => {
    const { x, row } = locate(e);
    if (!row) return setTip(null);
    const p = posAt(x);
    const lines = [];
    if (row.kind === "band") lines.push(`${row.group}: median CN of ${row.members.length} shown cells`);
    else {
      const u = unitById.get(row.id) || {};
      lines.push(`${row.id}`, `clade ${u.group ?? "n/a"} · ψ ${Number(u.ploidy) ? Number(u.ploidy).toFixed(2) : "n/a"}`);
      const attrs = STRIPS.filter((s) => s.key !== "clade").map((s) => [s.label, stripValue(u, s.key)]).filter(([, v]) => v != null);
      if (attrs.length) lines.push(attrs.map(([k, v]) => `${k} ${typeof v === "number" ? +v.toPrecision(3) : v}`).join(" · "));
      if (u.ecdna_call && u.ecdna_call !== "none") lines.push(`ecDNA caller call (not proof of ecDNA): ${u.ecdna_call}`);
    }
    if (p) {
      const v = valueAt(row, p);
      const where = p.genome ? `chr${p.chrom} (5 Mb bins)` : `chr${p.chrom}:${p.pos.toLocaleString()}`;
      if (v && typeof v === "object") lines.push(`${where} · median CN ${Number.isFinite(v.median) ? v.median.toFixed(2) : "NA"} (IQR ${Number.isFinite(v.q1) ? v.q1.toFixed(1) : "NA"}-${Number.isFinite(v.q3) ? v.q3.toFixed(1) : "NA"}, n ${v.n})`);
      else lines.push(`${where} · CN ${Number.isFinite(v) ? v.toFixed(2) : "NA"}`);
    } else if (x >= stripX0 && x < stripX0 + strips.length * STRIP_W) lines.push(`strip: ${strips[Math.floor((x - stripX0) / STRIP_W)]?.label}`);
    lines.push(row.kind === "band" ? "click: select clade (shift: add) · ▸: expand" : genomeWide ? "click: open this chromosome" : "click: pin this cell's rows · shift-click: select its clade");
    return setTip({ cx: e.clientX, cy: e.clientY, text: lines.join("\n") });
  };
  const onClick = (e) => {
    const { x, row } = locate(e);
    if (!row) return;
    if (genomeWide && x >= trackLeft) {
      const p = posAt(x);
      if (p && onJumpChrom) onJumpChrom(p.chrom);
      return;
    }
    if (row.kind === "band") {
      if (x < 18) onToggleExpand(row.group);
      else onSelect(row.group, e.shiftKey);
    } else if (e.shiftKey) onSelect(row.group, true);
    else onPinCell(row.id);
  };

  const legend = (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", fontSize: 11, color: COLORS.muted, padding: "2px 0 2px", marginLeft: 4 }}>
      <span style={{ color: COLORS.ink, fontWeight: 600 }}>{title}</span>
      <span>{mode === "cells" ? `${units.length} cells` : `${layout.rows.filter((r) => r.kind === "band").length} clades, ${units.length} cells`}{genomeWide ? " · genome-wide, 5 Mb bins" : ` · 500 kb bins${slots.length ? ` · ${slots.map((s) => formatWindow(s.window)).join(" | ")}` : ""}`}</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
        CN{colorMode === "absolute" ? "" : " vs ploidy"}:
        {CN_PALETTE.map((c, i) => <span key={c} title={colorMode === "absolute" ? `CN ${i}${i === CN_PALETTE.length - 1 ? "+" : ""}` : `ploidy ${i - 2 >= 0 ? "+" : ""}${i - 2}`} style={{ display: "inline-block", width: 12, height: 10, background: c, border: "1px solid #ddd" }} />)}
        <span style={{ marginLeft: 2 }}>{colorMode === "absolute" ? "0 … 8+ (2 white)" : "−2 … +6 (white = ploidy)"}</span>
        <span title="no value" style={{ display: "inline-block", width: 12, height: 10, background: NA_COLOR, marginLeft: 6 }} /> NA
      </span>
      {strips.length > 0 && <span>strips: {strips.map((s) => s.label).join(", ")}</span>}
    </div>
  );
  const loading = !genomeWide && slots.some((s) => index?.chroms.has(s.window.chrom) && !mats.get(s.window.chrom));
  const missingChrom = !genomeWide && slots.filter((s) => index && !index.chroms.has(s.window.chrom)).map((s) => `chr${s.window.chrom}`);
  const errs = [...(matStatus || new Map()).entries()].filter(([, v]) => `${v}`.startsWith("error")).map(([c, v]) => `chr${c}: ${v}`);
  return (
    <div style={{ borderBottom: "1px solid #ddd", position: "relative" }}>
      {legend}
      {genomeWide && !lod && <div style={{ fontSize: 12, color: COLORS.muted, paddingLeft: trackLeft }}>{index?.lod ? `genome-wide heat map: ${lodStatus === "loading" || lodStatus === "none" ? "loading" : `not available (${lodStatus})`}` : "genome-wide heat map not available (no 5 Mb level of detail in the index)"}</div>}
      {loading && <div style={{ fontSize: 11, color: COLORS.muted, paddingLeft: trackLeft }}>loading chromosome matrix…</div>}
      {missingChrom && missingChrom.length > 0 && <div style={{ fontSize: 11, color: "#8a5a00", paddingLeft: trackLeft }}>not available ({missingChrom.join(", ")} not in the heat map)</div>}
      {errs.length > 0 && <div style={{ fontSize: 11, color: "#a8071a", paddingLeft: trackLeft }}>not available ({errs.join("; ")})</div>}
      <canvas ref={ref} style={{ display: "block", cursor: "pointer" }} onMouseMove={onMove} onMouseLeave={() => setTip(null)} onClick={onClick} />
      {tip && (
        <div style={{ position: "fixed", left: Math.min(tip.cx + 14, (typeof window !== "undefined" ? window.innerWidth : 1600) - 340), top: tip.cy + 14, background: "rgba(255,255,255,0.97)", border: "1px solid #ccc", borderRadius: 4, padding: "4px 8px", fontSize: 12, pointerEvents: "none", whiteSpace: "pre", zIndex: 1000, maxWidth: 440 }}>
          {tip.text}
        </div>
      )}
    </div>
  );
}

/**
 * `cn_diff`: median CN of set A minus set B per 500 kb bin on each window, drawn as signed bars (gains red, losses
 * blue) on a symmetric axis. profiles[k] = { diff, nA, nB } over the window's chromosome bins (or null).
 */
export function CnDiffBlock({ index, slots, geometry, width, height = 60, profiles, label, nA, nB }) {
  const ref = useRef(null);
  const { trackLeft } = geometry;
  const maxAbs = useMemo(() => {
    let m = 0;
    slots.forEach((s, k) => {
      const p = profiles[k];
      const entry = index?.chroms.get(s.window.chrom);
      if (!p || !entry) return;
      const [b0, b1] = binRange(entry, s.window);
      for (let b = b0; b < b1; b += 1) if (Number.isFinite(p.diff[b])) m = Math.max(m, Math.abs(p.diff[b]));
    });
    return Math.max(1, Math.ceil(m));
  }, [profiles, slots, index]);
  useEffect(() => {
    const ctx = setupCanvas(ref.current, width, height);
    if (!ctx || !index) return;
    const mid = height / 2;
    slots.forEach((s, k) => {
      const x0 = trackLeft + s.x0;
      ctx.fillStyle = COLORS.band;
      ctx.fillRect(x0, 0, s.width, height);
      ctx.strokeStyle = "#bbb";
      ctx.beginPath();
      ctx.moveTo(x0, mid + 0.5);
      ctx.lineTo(x0 + s.width, mid + 0.5);
      ctx.stroke();
      const p = profiles[k];
      const entry = index.chroms.get(s.window.chrom);
      if (!p || !entry) return;
      const [b0, b1] = binRange(entry, s.window);
      for (let b = b0; b < b1; b += 1) {
        const d = p.diff[b];
        if (!Number.isFinite(d) || d === 0) continue;
        const xa = x0 + Math.max(0, bpToPx(s, entry.starts[b]));
        const xb = x0 + Math.min(s.width, bpToPx(s, entry.ends[b]));
        const hgt = (Math.min(Math.abs(d), maxAbs) / maxAbs) * (mid - 2);
        ctx.fillStyle = diffColor(d);
        ctx.fillRect(xa, d > 0 ? mid - hgt : mid, Math.max(1, xb - xa), hgt);
      }
      ctx.fillStyle = COLORS.muted;
      ctx.font = "10px system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillText(`+${maxAbs}`, x0 - 3, 1);
      ctx.textBaseline = "bottom";
      ctx.fillText(`−${maxAbs}`, x0 - 3, height - 1);
    });
    ctx.fillStyle = COLORS.ink;
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("CN difference", 4, 4);
    ctx.font = "10px system-ui, sans-serif";
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(`${label}`, 4, 18);
    ctx.fillText(`median CN, n ${nA} vs ${nB}`, 4, 31);
  }, [profiles, slots, index, width, height, trackLeft, maxAbs, label, nA, nB]);
  return <canvas ref={ref} style={{ display: "block", borderBottom: "1px solid #ddd" }} />;
}
