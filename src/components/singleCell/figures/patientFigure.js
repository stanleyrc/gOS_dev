import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Button, Col, Progress, Row, Select, Space, Switch, Tooltip, Typography } from "antd";
import FigureCanvas, { fitText } from "./figureCanvas";
import { PanelHead, textRole } from "./figureKit";
import useContainerWidth from "../useContainerWidth";
import useTreeView from "../useTreeView";
import useWalks from "../ecdna/useWalks";
import SnvSiteDrawer from "../snvSiteDrawer";
import WalkDiagram from "../ecdna/walkDiagram";
import VariantTree from "./variantTree";
import CellProfiles from "./cellProfiles";
import TriangleCorrelation from "./triangleCorrelation";
import CladeStateTree from "./cladeStateTree";
import singleCellActions from "../../../redux/singleCell/actions";
import filteredEventsActions from "../../../redux/filteredEvents/actions";
import { annotationColors, binAt, rowMap } from "../../../helpers/singleCell/matrix";
import { AMP_LEGEND, ampliconCss, ampliconRGBA, binSnvMatrix, isNormalClone, snvTreeOrder } from "../../../helpers/singleCell/figures";
import { ancestralBinary, packStoreSnv, walkDomains } from "../../../helpers/singleCell/figureMath";
import { walkFamilies } from "../../../helpers/singleCell/walks";
import { defaultFocusWalk } from "../../../helpers/singleCell/walkPanels";
import { selectMode } from "./cellSelection";
import { isDark, onAppThemeChange } from "../../../helpers/appTheme";

const { Text } = Typography;
const STRIP = 10;
const GAP = 6;
const HEAD_H = 74; // header: rotated strip titles, legends, genes, focused-variant track
const GENE_ROW = HEAD_H - 22; // gene marker baseline
const TRACK_H = 14;
const AXIS_H = 16;
const IDEO_H = 40;
const MAX_BARS = 4;
const RETAINED = "#2e7d32";
const LOST = "#c62828";
const ACCENT = "#1677ff";

const toCanvas = (cols, rows, fill) => {
  if (typeof document === "undefined" || cols <= 0 || rows <= 0) return null;
  const cv = document.createElement("canvas");
  cv.width = cols;
  cv.height = rows;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(cols, rows);
  fill(new Uint32Array(img.data.buffer));
  ctx.putImageData(img, 0, 0);
  return cv;
};
// VAF (0-250 scale) to grey: white -> black in light mode, dark -> light in dark mode
const gray = (vaf, dark) => {
  const t = Math.min(250, vaf) / 250;
  const v = Math.round(dark ? 38 + t * 200 : 255 - t * 235);
  return ((255 << 24) | (v << 16) | (v << 8) | v) >>> 0;
};
const WHITE = 0xffffffff;
const DARK_BG = 0xff262626;
/** Current app theme (light / dark), following theme switches. */
function useDarkTheme() {
  const [dark, setDark] = useState(isDark());
  useEffect(() => onAppThemeChange((t) => setDark(t === "dark")), []);
  return dark;
}
const NO_CN = 0xffeeeeee;
const STAIN = { gneg: "#ffffff", gpos25: "#c8c8c8", gpos50: "#969696", gpos75: "#5a5a5a", gpos100: "#1e1e1e", acen: "#d65c5c", gvar: "#dcdcdc", stalk: "#a0a0a0" };
const chromOf = (chromoBins, g) => {
  const chr = Object.keys(chromoBins || {}).find((k) => chromoBins[k].startPlace <= g && chromoBins[k].endPlace >= g);
  return chr ? { chr, pos: g - chromoBins[chr].startPlace } : null;
};

/** Loads `patient` into the single-cell store (the per-patient pages' data) and reports progress. */
export function usePatientLoaded(patient) {
  const dispatch = useDispatch();
  const loaded = useSelector((s) => s.SingleCell.patient?.caseReportId);
  const loading = useSelector((s) => s.SingleCell.loading);
  const pct = useSelector((s) => s.SingleCell.loadingPercentage);
  const ready = !!patient && `${loaded}` === `${patient}`;
  const asked = useRef(null);
  useEffect(() => {
    if (!patient || ready || asked.current === patient) return;
    asked.current = patient;
    dispatch(singleCellActions.fetchSingleCellData(patient));
  }, [patient, ready, dispatch]);
  return { ready, loading, pct };
}

/**
 * The focused ecDNA variant of the loaded patient and its amplicon family
 * (walks nested in / holding it), with the tree-ordered cells and walk
 * colours shared by the figure panels.
 */
export function useFocusFamily(focusWalkId) {
  const { order, treeLayout, cellById } = useTreeView();
  const { all, filtered, colorOf, measured } = useWalks(order);
  const families = useMemo(() => walkFamilies(filtered.length ? filtered : all), [filtered, all]);
  // default: the driver ecDNA (walk with driver genes) carried by the most cells
  const focusWalk = useMemo(() => {
    const picked = all.find((w) => w.id === `${focusWalkId}`);
    if (picked) return picked;
    const pool = filtered.length ? filtered : all;
    const drivers = pool.filter((w) => (w.driver_genes || []).length);
    return defaultFocusWalk(drivers.length ? drivers : families[0] || [], order) || null;
  }, [all, filtered, focusWalkId, families, order]);
  const family = useMemo(() => (focusWalk ? families.find((f) => f.some((w) => w.id === focusWalk.id)) || [focusWalk] : []), [families, focusWalk]);
  return { order, treeLayout, cellById, all, colorOf, measured, families, focusWalk, family };
}

/**
 * Fig 4B / 5D, live: the patient's cells in tree order (the report's tree,
 * selection and hover), with ancestral state of the focused ecDNA variant on
 * the nodes, clade / state strips, whole-genome SNVs, the SNVs inside the
 * amplicon, copy number across the region (walk structures and genes above,
 * ideogram below) and per-variant copies. Scroll over the heatmap zooms the
 * genome, over the tree zooms the rows; double-click resets. Click a node,
 * row, variant header, gene or SNV for its cells / card.
 */
export default function PatientFigure({ patient, events = [], focusWalkId, onFocusWalk, onSelectCells, onView, maxPlotHeight = 640 }) {
  const dispatch = useDispatch();
  const { ready, loading, pct } = usePatientLoaded(patient);
  const sc = useSelector((s) => s.SingleCell);
  const chromoBins = useSelector((s) => s.Settings.chromoBins);
  const cytobands = useSelector((s) => s.Cytobands?.data || []);
  const { order, treeLayout, cellById, colorOf, measured, families, focusWalk, family } = useFocusFamily(focusWalkId);
  const [ref, measuredW] = useContainerWidth(1200);
  const width = Math.max(760, measuredW);
  const dark = useDarkTheme();

  // ---- focused ecDNA family / variant
  const shownWalks = useMemo(() => {
    const byCells = family.slice().sort((a, b) => (b.stats?.ncells ?? b.ncells ?? 0) - (a.stats?.ncells ?? a.ncells ?? 0));
    const carriers = (w) => Object.values(w.cells || {}).filter((v) => Number(v) >= 1).length;
    const rest = byCells.filter((w) => w.id !== focusWalk?.id && carriers(w) >= 3);
    return (focusWalk ? [focusWalk, ...rest] : rest).slice(0, MAX_BARS);
  }, [family, focusWalk]);
  const baseDomains = useMemo(() => walkDomains(family, chromoBins), [family, chromoBins]);
  const [view, setView] = useState(null); // zoomed genome windows (null = the family's region)
  useEffect(() => setView(null), [focusWalk?.id, patient]);
  const domains = view || baseDomains;
  // report the shown genome windows (cell profiles follow the zoom)
  const domainsKey = JSON.stringify(domains);
  useEffect(() => {
    onView?.(domains);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domainsKey]);
  const [rowWin, setRowWin] = useState(null); // [r0, r1) rows shown (tree zoom)
  useEffect(() => setRowWin(null), [patient]);
  const [showAnc, setShowAnc] = useState(true);
  const [siteDrawer, setSiteDrawer] = useState(null);

  // ---- rows
  const n = order.length;
  const [r0, r1] = rowWin || [0, n];
  const nv = Math.max(1, r1 - r0);
  const plotH = Math.min(maxPlotHeight, Math.max(240, n * 4.2));
  const rh = plotH / nv;
  const selected = useMemo(() => new Set(sc.selectedCellIds || []), [sc.selectedCellIds]);
  const hoverRow = sc.hoveredCellId ? order.indexOf(sc.hoveredCellId) : -1;

  // ---- data
  const snvData = sc.snv.status === "ok" ? sc.snv.data : null;
  const packed = useMemo(() => (snvData ? packStoreSnv(snvData) : null), [snvData]);
  const cnById = useMemo(() => {
    const d = sc.cn.status === "ok" ? sc.cn.data : null;
    return d ? new Map(d.cells.map((id, i) => [id, d.rows[i]])) : new Map();
  }, [sc.cn]);
  const ecSites = useMemo(() => {
    if (!snvData || !family.length) return [];
    const ivals = [];
    family.forEach((w) =>
      (w.nodes || []).forEach((nd) => {
        const chr = `${nd.chromosome}`.replace(/^chr/, "");
        if (!chromoBins?.[chr]) return;
        const s = chromoBins[chr].startPlace + Math.min(nd.start, nd.end);
        const e = chromoBins[chr].startPlace + Math.max(nd.start, nd.end);
        ivals.push([s, e]);
      })
    );
    return snvData.variants.filter((v) => Number.isFinite(v.global) && ivals.some(([s, e]) => v.global >= s && v.global <= e)).sort((a, b) => a.global - b.global);
  }, [snvData, family, chromoBins]);
  const stateColors = useMemo(() => annotationColors(sc.cells.map((c) => c.state).filter((s) => s != null && s !== "")), [sc.cells]);

  // ---- ancestral state of the focused variant
  const anc = useMemo(() => {
    if (!treeLayout || !focusWalk) return null;
    return ancestralBinary(treeLayout, (name) => {
      if (measured && !measured.has(name)) return null;
      if (isNormalClone(cellById.get(name)?.clone_id)) return false;
      return (Number(focusWalk.cells?.[name]) || 0) >= 1;
    });
  }, [treeLayout, focusWalk, measured, cellById]);

  // lineages that lost the variant: below a node with p >= 0.5, every node with p < 0.5 (nodes come parents first)
  const lostBelow = useMemo(() => {
    if (!anc || !treeLayout) return null;
    const out = new Uint8Array(treeLayout.nodes.length);
    treeLayout.nodes.forEach((nd, i) => {
      const par = nd.parent;
      if (par < 0 || !(anc.p[i] < 0.5)) return;
      if (anc.p[par] >= 0.5 || out[par]) out[i] = 1;
    });
    return out;
  }, [anc, treeLayout]);

  // ---- columns
  const L = useMemo(() => {
    const treeW = treeLayout ? Math.round(Math.max(170, Math.min(330, width * 0.21))) : 0;
    const clade = treeW + 6;
    const state = clade + STRIP + 5;
    const data0 = state + STRIP + GAP + 2;
    const barsW = shownWalks.length ? Math.max(58 * shownWalks.length, Math.min(90 * shownWalks.length, width * 0.2)) : 0;
    const rest = width - data0 - barsW - (shownWalks.length ? GAP * 2 : 0) - 4;
    const snvW = packed ? Math.round(rest * 0.3) : 0;
    const ecW = ecSites.length ? Math.round(Math.min(rest * 0.14, Math.max(40, ecSites.length * 6))) : 0;
    const cnW = rest - snvW - ecW - (snvW ? GAP : 0) - (ecW ? GAP : 0);
    const snvX = data0;
    const ecX = snvX + snvW + (snvW ? GAP : 0);
    const cnX = ecX + ecW + (ecW ? GAP : 0);
    const barsX = cnX + cnW + (shownWalks.length ? GAP * 2 : 0);
    const barW = shownWalks.length ? (barsW - GAP * (shownWalks.length - 1)) / shownWalks.length : 0;
    return { treeW, clade, state, data0, snvX, snvW, ecX, ecW, cnX, cnW, barsX, barW };
  }, [treeLayout, width, shownWalks.length, packed, ecSites.length]);
  const TOP = HEAD_H + TRACK_H + 4;
  // bar labels are written vertically under the bars
  const barLabH = shownWalks.length ? Math.min(130, 18 + 7.4 * Math.max(...shownWalks.map((w) => `${w.label || w.name || w.id}`.length))) : 0;
  const height = TOP + plotH + Math.max(AXIS_H + IDEO_H + 24, barLabH + 18);

  // ---- prebuilt images (all rows; zoomed rows are a source crop)
  const snvImg = useMemo(() => {
    if (!packed || L.snvW < 8) return null;
    const rowOf = new Map(order.map((id, i) => [id, i]));
    const cols0 = snvTreeOrder(packed, rowOf, snvData.variants.length);
    if (!cols0.length) return null;
    const cols = Math.max(4, Math.min(Math.floor(L.snvW), cols0.length));
    const m = binSnvMatrix(packed, order, cols0, cols);
    return { canvas: toCanvas(cols, n, (px) => px.forEach((_, k) => (px[k] = m[k] < 0 ? (dark ? DARK_BG : WHITE) : gray(m[k], dark)))), nSites: cols0.length };
  }, [packed, snvData, order, n, L.snvW, dark]);
  const ecImg = useMemo(() => {
    if (!snvData || !ecSites.length) return null;
    const rows = rowMap(order, snvData.cells);
    return toCanvas(ecSites.length, n, (px) => {
      order.forEach((id, r) => {
        const sr = rows[r];
        ecSites.forEach((v, c) => {
          const d = sr == null ? NaN : snvData.depth[sr][v.index];
          px[r * ecSites.length + c] = d > 0 ? gray((250 * (snvData.alt[sr][v.index] || 0)) / d, dark) : dark ? DARK_BG : WHITE;
        });
      });
    });
  }, [snvData, ecSites, order, n, dark]);
  const cnGeo = useMemo(() => {
    const cols = Math.max(0, Math.floor(L.cnW));
    if (!cols || !domains.length) return null;
    const gapPx = 4;
    const share = (cols - gapPx * (domains.length - 1)) / domains.length;
    const ext = domains.map((d, k) => [Math.round(k * (share + gapPx)), Math.round(k * (share + gapPx) + share), d]);
    const gOf = new Float64Array(cols).fill(NaN);
    ext.forEach(([a, b, d]) => {
      for (let x = a; x < b; x += 1) gOf[x] = d[0] + ((x + 0.5 - a) / (b - a)) * (d[1] - d[0]);
    });
    return { cols, ext, gOf };
  }, [L.cnW, domains]);
  const cnImg = useMemo(() => {
    if (!cnGeo || !cnById.size) return null;
    const { cols, gOf } = cnGeo;
    return toCanvas(cols, n, (px) =>
      order.forEach((id, r) => {
        const row = cnById.get(id);
        for (let x = 0; x < cols; x += 1) {
          if (!Number.isFinite(gOf[x])) px[r * cols + x] = 0;
          else if (!row) px[r * cols + x] = NO_CN;
          else {
            const b = binAt(row.binIndex, gOf[x]);
            px[r * cols + x] = b >= 0 ? ampliconRGBA(row.values[b]) : NO_CN;
          }
        }
      })
    );
  }, [cnGeo, cnById, order, n]);
  const bars = useMemo(
    () =>
      shownWalks.map((w) => {
        const vals = new Float32Array(n);
        let max = 0;
        order.forEach((id, r) => {
          const v = Number(w.cells?.[id]);
          vals[r] = Number.isFinite(v) ? v : NaN;
          if (vals[r] > max) max = vals[r];
        });
        return { w, vals, max: max || 1 };
      }),
    [shownWalks, order, n]
  );
  const barMax = useMemo(() => Math.max(1, ...bars.map((b) => b.max)), [bars]);
  const geneMarks = useMemo(() => {
    if (!cnGeo) return [];
    const amp = new Set(shownWalks.flatMap((w) => w.driver_genes || []));
    const seen = new Set();
    const out = [];
    events.forEach((e) => {
      const g = `${e.gene || ""}`;
      if (!g || g.includes("::") || seen.has(g) || !Number.isFinite(Number(e.start))) return;
      const chr = `${e.seqnames}`.replace(/^chr/, "");
      if (!chromoBins?.[chr]) return;
      const gx = chromoBins[chr].startPlace + (Number(e.start) + (Number(e.end) || Number(e.start))) / 2;
      const ext = cnGeo.ext.find(([, , d]) => gx >= d[0] && gx <= d[1]);
      if (!ext) return;
      seen.add(g);
      const [a, b, d] = ext;
      out.push({ gene: g, event: e, x: L.cnX + a + ((gx - d[0]) / (d[1] - d[0])) * (b - a), amp: amp.has(g) });
    });
    return out.sort((a, b) => b.amp - a.amp);
  }, [events, cnGeo, chromoBins, shownWalks, L.cnX]);

  // ---- tree geometry (rows in the window)
  const yOfRow = useCallback((r) => TOP + (r - r0 + 0.5) * rh, [TOP, r0, rh]);
  const nodePx = useMemo(() => {
    if (!treeLayout) return [];
    const maxX = Math.max(1e-9, treeLayout.maxX || 0);
    const sx = (L.treeW - 10) / maxX;
    return treeLayout.nodes.map((nd) => ({ nd, x: 5 + nd.x * sx, y: yOfRow(nd.y) }));
  }, [treeLayout, L.treeW, yOfRow]);

  const draw = useCallback(
    (ctx, c) => {
      ctx.imageSmoothingEnabled = false;
      const ink = c.dark ? "rgba(230,230,230,0.85)" : "rgba(30,30,30,0.85)";
      const lostInk = c.dark ? "#ef6f6c" : LOST;
      const keepInk = c.dark ? "#66bb6a" : RETAINED;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, TOP, width, plotH);
      ctx.clip();
      // tree
      if (treeLayout) {
        const inWin = (nd) => nd.lastLeaf >= r0 && nd.firstLeaf < r1;
        const pre = new Int32Array(n + 1);
        for (let r = 0; r < n; r += 1) pre[r + 1] = pre[r] + (selected.has(order[r]) ? 1 : 0);
        const allSel = (nd) => selected.size && pre[nd.lastLeaf + 1] - pre[nd.firstLeaf] === nd.lastLeaf - nd.firstLeaf + 1;
        const stroke = (filter, color, w) => {
          ctx.beginPath();
          nodePx.forEach(({ nd, x, y }, i) => {
            if (nd.parent < 0 || !inWin(nd) || (filter && !filter(nd, i))) return;
            const p = nodePx[nd.parent];
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x, y);
            ctx.lineTo(x, y);
          });
          ctx.strokeStyle = color;
          ctx.lineWidth = w;
          ctx.stroke();
        };
        const lw = rh >= 3 ? 1.1 : 0.85;
        stroke(null, ink, lw);
        // lineages that lost the focused variant, in red (as in the paper's "Long status")
        if (showAnc && lostBelow) stroke((nd, i) => lostBelow[i], lostInk, lw + 0.3);
        if (selected.size) stroke(allSel, c.dark ? "#69b1ff" : ACCENT, 1.8);
        // ancestral state on every internal node: filled = present, red = lost; radius = likelihood of the call
        if (showAnc && anc) {
          nodePx.forEach(({ nd, x, y }, i) => {
            if (nd.isLeaf || !inWin(nd) || nd.lastLeaf - nd.firstLeaf < 1) return;
            const p = anc.p[i];
            if (!Number.isFinite(p)) return;
            const present = p >= 0.5;
            if (!present && !(lostBelow && lostBelow[i])) return; // never had it: no glyph
            const pp = nd.parent >= 0 ? anc.p[nd.parent] : NaN;
            const change = present !== (pp >= 0.5) && nd.parent >= 0;
            const like = Math.max(p, 1 - p);
            // small dots everywhere (size = likelihood, as in the paper), larger rings where the state changes
            const r = (0.9 + 2.2 * (like - 0.5)) * Math.min(1, 0.6 + rh / 5) + (change ? 1.4 : 0);
            ctx.beginPath();
            ctx.arc(x, y, r, 0, 2 * Math.PI);
            ctx.fillStyle = present ? keepInk : lostInk;
            ctx.fill();
            if (change) {
              ctx.lineWidth = 1;
              ctx.strokeStyle = c.panel;
              ctx.stroke();
              ctx.beginPath();
              ctx.arc(x, y, r + 1.6, 0, 2 * Math.PI);
              ctx.strokeStyle = present ? keepInk : lostInk;
              ctx.stroke();
            }
          });
        }
      }
      // strips
      for (let r = r0; r < r1; r += 1) {
        const cell = cellById.get(order[r]) || {};
        const y = TOP + (r - r0) * rh;
        const h = Math.max(1, rh - (rh >= 4 ? 0.5 : 0));
        ctx.fillStyle = sc.cloneColors[cell.clone_id] || (isNormalClone(cell.clone_id) ? "#9e9e9e" : "#d9d9d9");
        ctx.fillRect(L.clade, y, STRIP, h);
        ctx.fillStyle = cell.state != null && cell.state !== "" ? stateColors[`${cell.state}`] || "#d9d9d9" : c.dark ? "#3a3a3a" : "#ededed";
        ctx.fillRect(L.state, y, STRIP, h);
      }
      // heatmaps: source crop = the row window
      const blit = (img, x, w) => img && ctx.drawImage(img, 0, r0, img.width, nv, x, TOP, w, plotH);
      blit(snvImg?.canvas, L.snvX, L.snvW);
      blit(ecImg, L.ecX, L.ecW);
      blit(cnImg, L.cnX, L.cnW);
      // per-variant copies (shared scale, light column background, faint 50-copy guides)
      bars.forEach(({ w, vals }, k) => {
        const x0 = L.barsX + k * (L.barW + GAP);
        ctx.fillStyle = c.dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.022)";
        ctx.fillRect(x0, TOP, L.barW, plotH);
        ctx.fillStyle = colorOf(w.id);
        const bh = Math.max(1, rh * 0.82);
        for (let r = r0; r < r1; r += 1) {
          const v = vals[r];
          if (!(v > 0)) continue;
          ctx.fillRect(x0, TOP + (r - r0) * rh + (rh - bh) / 2, Math.max(1, (v / barMax) * (L.barW - 2)), bh);
        }
      });
      // selection shading + hover line
      if (selected.size) {
        ctx.fillStyle = c.dark ? "rgba(20,20,20,0.6)" : "rgba(255,255,255,0.64)";
        let r = r0;
        while (r < r1) {
          if (selected.has(order[r])) {
            r += 1;
            continue;
          }
          let e = r;
          while (e < r1 && !selected.has(order[e])) e += 1;
          ctx.fillRect(L.clade, TOP + (r - r0) * rh, width - L.clade, (e - r) * rh);
          r = e;
        }
        ctx.fillStyle = c.dark ? "#69b1ff" : ACCENT;
        for (let k = r0; k < r1; k += 1) if (selected.has(order[k])) ctx.fillRect(L.clade - 4, TOP + (k - r0) * rh, 2.5, Math.max(1, rh));
      }
      if (hoverRow >= r0 && hoverRow < r1) {
        ctx.strokeStyle = c.dark ? "#ffd666" : "#fa8c16";
        ctx.lineWidth = 1.2;
        ctx.strokeRect(L.clade - 1, TOP + (hoverRow - r0) * rh, width - L.clade, Math.max(1.5, rh));
        ctx.lineWidth = 1;
      }
      ctx.restore();
      // frames
      ctx.strokeStyle = c.dark ? "#8c8c8c" : "#262626";
      ctx.lineWidth = 0.8;
      [[L.snvX, L.snvW], [L.ecX, L.ecW]].forEach(([x, w]) => w && ctx.strokeRect(x + 0.5, TOP + 0.5, w - 1, plotH - 1));
      cnGeo?.ext.forEach(([a, b]) => ctx.strokeRect(L.cnX + a + 0.5, TOP + 0.5, b - a - 1, plotH - 1));
      bars.forEach((_, k) => ctx.strokeRect(L.barsX + k * (L.barW + GAP) + 0.5, TOP + 0.5, L.barW - 1, plotH - 1));
      ctx.lineWidth = 1;

      // ---- header
      // rotated strip titles
      const vtext = (txt, x, yBottom, role = "head", inkName = "text") => {
        ctx.save();
        ctx.translate(x, yBottom);
        ctx.rotate(-Math.PI / 2);
        textRole(ctx, c, role, inkName);
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(txt, 0, 0);
        ctx.restore();
      };
      vtext("Clade", L.clade + STRIP / 2, TOP - 4);
      vtext("Cell state", L.state + STRIP / 2, TOP - 4);
      // legend ramps: VAF over the SNV panels, CN over the heatmap's left edge
      const ramp = (x, y, w, stops, labels, title) => {
        textRole(ctx, c, "label", "text");
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.fillText(title, x, y - 2);
        const g = ctx.createLinearGradient(x, 0, x + w, 0);
        stops.forEach(([t, col]) => g.addColorStop(t, col));
        ctx.fillStyle = g;
        ctx.fillRect(x, y, w, 7);
        ctx.strokeStyle = c.grid;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 6);
        textRole(ctx, c, "tick");
        ctx.textBaseline = "top";
        labels.forEach(([t, txt]) => {
          ctx.textAlign = t <= 0 ? "left" : t >= 1 ? "right" : "center";
          ctx.fillText(txt, x + t * w, y + 9);
        });
        ctx.textBaseline = "middle";
      };
      if (snvImg || ecImg) {
        const rx = snvImg ? L.snvX : L.ecX;
        ramp(rx, 16, Math.min(120, (snvImg ? L.snvW : L.ecW) - 4), [[0, c.dark ? "#2a2a2a" : "#ffffff"], [1, c.dark ? "#f0f0f0" : "#141414"]], [[0, "0"], [0.5, "0.5"], [1, "1"]], "Variant allele frequency");
      }
      if (cnGeo) {
        const stops = AMP_LEGEND.map((v, k) => [k / (AMP_LEGEND.length - 1), ampliconCss(v)]);
        const labs = AMP_LEGEND.map((v, k) => [k / (AMP_LEGEND.length - 1), `${v}`]);
        ramp(L.cnX, 16, Math.min(180, L.cnW * 0.4), stops, labs, "Copy number");
      }
      if (bars.length) {
        textRole(ctx, c, "label", "text");
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText("Amplicon copies", L.barsX + (bars.length * (L.barW + GAP) - GAP) / 2, TOP - 18);
        textRole(ctx, c, "tick");
        ctx.textBaseline = "bottom";
        bars.forEach((_, k) => {
          const x0 = L.barsX + k * (L.barW + GAP);
          ctx.textAlign = "left";
          ctx.fillText("0", x0, TOP - 3);
          ctx.textAlign = "right";
          ctx.fillText(`${Math.round(barMax)}`, x0 + L.barW, TOP - 3);
        });
      }
      // focused-variant track over the CN columns, then gene markers
      if (cnGeo) {
        const gx = (g) => {
          const e = cnGeo.ext.find(([, , d]) => g >= d[0] && g <= d[1]);
          return e ? L.cnX + e[0] + ((g - e[2][0]) / (e[2][1] - e[2][0])) * (e[1] - e[0]) : null;
        };
        const w = focusWalk;
        const y = HEAD_H + TRACK_H / 2;
        ctx.strokeStyle = c.grid;
        ctx.beginPath();
        ctx.moveTo(L.cnX, y + 0.5);
        ctx.lineTo(L.cnX + L.cnW, y + 0.5);
        ctx.stroke();
        if (w) {
          ctx.fillStyle = colorOf(w.id);
          (w.nodes || []).forEach((nd) => {
            const chr = `${nd.chromosome}`.replace(/^chr/, "");
            if (!chromoBins?.[chr]) return;
            const a = gx(chromoBins[chr].startPlace + Math.min(nd.start, nd.end));
            const b = gx(chromoBins[chr].startPlace + Math.max(nd.start, nd.end));
            if (a == null && b == null) return;
            const xa = a ?? L.cnX;
            const xb = b ?? L.cnX + L.cnW;
            ctx.fillRect(xa, y - 4, Math.max(1.5, xb - xa), 8);
          });
          textRole(ctx, c, "label", "text");
          ctx.fillStyle = colorOf(w.id);
          ctx.font = ctx.font.replace(/^(\d+ )?/, "600 ");
          ctx.textAlign = "right";
          ctx.textBaseline = "middle";
          const room = L.cnX - (L.ecW ? L.ecX : L.snvW ? L.snvX + L.snvW : L.data0) - 6;
          if (room > 30) ctx.fillText(fitText(ctx, w.label || w.name || `walk ${w.id}`, room), L.cnX - 4, y);
        }
      }
      const placed = [];
      geneMarks.forEach(({ gene, x, amp }) => {
        ctx.fillStyle = amp ? c.text : c.muted;
        ctx.beginPath();
        ctx.moveTo(x - 4, GENE_ROW + 6);
        ctx.lineTo(x + 4, GENE_ROW + 6);
        ctx.lineTo(x, GENE_ROW + 12);
        ctx.closePath();
        ctx.fill();
        textRole(ctx, c, "label", amp ? "text" : "textSecondary");
        ctx.font = ctx.font.replace(/^(\d+ )?/, amp ? "italic 600 " : "italic 400 ");
        const tw = ctx.measureText(gene).width;
        const box = [x - tw / 2 - 3, x + tw / 2 + 3];
        if (placed.some(([l, r]) => box[0] < r && box[1] > l)) return;
        placed.push(box);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(gene, x, GENE_ROW);
      });

      // ---- bottom: panel titles, genome axis, ideogram with a zoom funnel, bar labels
      const yb = TOP + plotH + 3;
      textRole(ctx, c, "head", "text");
      ctx.textBaseline = "top";
      ctx.textAlign = "center";
      if (snvImg) ctx.fillText(fitText(ctx, `Whole-genome SNVs (${snvImg.nSites.toLocaleString()})`, L.snvW), L.snvX + L.snvW / 2, yb + 3);
      if (ecImg) ctx.fillText(fitText(ctx, `ecDNA SNVs (${ecSites.length})`, L.ecW + 24), L.ecX + L.ecW / 2, yb + 3);
      if (cnGeo) {
        cnGeo.ext.forEach(([a, b, d]) => {
          const p0 = chromOf(chromoBins, d[0]);
          const p1 = chromOf(chromoBins, d[1]);
          if (!p0) return;
          textRole(ctx, c, "tick");
          ctx.textBaseline = "top";
          ctx.textAlign = "left";
          ctx.fillText(`${(p0.pos / 1e6).toFixed(1)}`, L.cnX + a + 1, yb);
          ctx.textAlign = "right";
          if (p1) ctx.fillText(`${(p1.pos / 1e6).toFixed(1)} Mb`, L.cnX + b - 1, yb);
          textRole(ctx, c, "head", "text");
          ctx.textAlign = "center";
          ctx.fillText(`chr${p0.chr}: ${(p0.pos / 1e6).toFixed(1)}–${p1 ? (p1.pos / 1e6).toFixed(1) : "?"} Mb`, L.cnX + (a + b) / 2, yb);
          // ideogram of the chromosome with the window marked, joined to the heatmap by a funnel
          const bands = cytobands.filter((cb) => `${cb.chromosome}`.replace(/^chr/, "") === p0.chr);
          const bin = chromoBins[p0.chr];
          const iy = yb + AXIS_H + 14;
          const iw = Math.min(b - a, 360);
          const ix0 = L.cnX + (a + b) / 2 - iw / 2;
          const len = bin.endPoint || bin.endPlace - bin.startPlace;
          const wa = ix0 + (p0.pos / len) * iw;
          const wb = p1 ? ix0 + (p1.pos / len) * iw : wa + 2;
          ctx.fillStyle = c.dark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)";
          ctx.beginPath();
          ctx.moveTo(L.cnX + a, yb + AXIS_H - 2);
          ctx.lineTo(L.cnX + b, yb + AXIS_H - 2);
          ctx.lineTo(wb + 1, iy - 1);
          ctx.lineTo(wa - 1, iy - 1);
          ctx.closePath();
          ctx.fill();
          bands.forEach((cb) => {
            ctx.fillStyle = STAIN[cb.stain] || "#dcdcdc";
            const xa = ix0 + (Number(cb.startPoint) / len) * iw;
            const xb = ix0 + (Number(cb.endPoint) / len) * iw;
            ctx.fillRect(xa, iy, Math.max(0.5, xb - xa), 9);
          });
          ctx.strokeStyle = c.dark ? "#8c8c8c" : "#595959";
          ctx.strokeRect(ix0 + 0.5, iy + 0.5, iw - 1, 9);
          ctx.strokeStyle = "#e53935";
          ctx.lineWidth = 1.6;
          ctx.strokeRect(wa - 0.5, iy - 2, Math.max(2, wb - wa + 1), 13);
          ctx.lineWidth = 1;
          textRole(ctx, c, "head", "text");
          ctx.textBaseline = "top";
          ctx.textAlign = "center";
          ctx.fillText(`chr${p0.chr}`, ix0 + iw / 2, iy + 13);
        });
      }
      bars.forEach(({ w }, k) => {
        const x0 = L.barsX + k * (L.barW + GAP);
        ctx.save();
        ctx.translate(x0 + L.barW / 2, yb + 3);
        ctx.rotate(-Math.PI / 2);
        textRole(ctx, c, "label", "text");
        ctx.fillStyle = colorOf(w.id);
        ctx.font = ctx.font.replace(/^(\d+ )?/, w.id === focusWalk?.id ? "700 " : "500 ");
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(fitText(ctx, w.label || w.name || `walk ${w.id}`, barLabH - 6), 0, 0);
        ctx.restore();
      });
      ctx.textBaseline = "middle";
      return [];
    },
    [TOP, width, plotH, treeLayout, r0, r1, n, nv, order, selected, nodePx, rh, showAnc, anc, lostBelow, cellById, sc.cloneColors, stateColors, L, snvImg, ecImg, cnImg, bars, barMax, barLabH, colorOf, hoverRow, cnGeo, focusWalk, chromoBins, geneMarks, cytobands, ecSites.length]
  );

  // ---- interaction
  const rowAt = (y) => {
    const r = r0 + Math.floor((y - TOP) / rh);
    return y >= TOP && y < TOP + plotH && r >= r0 && r < r1 ? r : -1;
  };
  const hitTest = (x, y) => {
    if (y < TOP) {
      if (y >= GENE_ROW - 10 && y < HEAD_H && x >= L.cnX && x < L.cnX + L.cnW) {
        const m = geneMarks.find((g) => Math.abs(g.x - x) < 14);
        return m ? { kind: "gene", m } : null;
      }
      if (y >= HEAD_H && focusWalk && x >= L.cnX - 140 && x < L.cnX + L.cnW) return { kind: "walk", w: focusWalk };
      if (x >= L.barsX && bars.length) {
        const k = Math.floor((x - L.barsX) / (L.barW + GAP));
        return k >= 0 && k < bars.length ? { kind: "walk", w: bars[k].w } : null;
      }
      return null;
    }
    if (y >= TOP + plotH) {
      const k = Math.floor((x - L.barsX) / (L.barW + GAP));
      return k >= 0 && k < bars.length && x >= L.barsX ? { kind: "walk", w: bars[k].w } : null;
    }
    if (treeLayout && x < L.treeW + 2) {
      let best = null;
      let bd = 49;
      nodePx.forEach((p, i) => {
        if (p.nd.isLeaf) return;
        const d = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (d < bd) {
          bd = d;
          best = { ...p, i };
        }
      });
      if (best) return { kind: "node", nd: best.nd, i: best.i };
    }
    const r = rowAt(y);
    if (r < 0) return null;
    if (ecImg && x >= L.ecX && x < L.ecX + L.ecW) return { kind: "site", r, v: ecSites[Math.min(ecSites.length - 1, Math.floor(((x - L.ecX) / L.ecW) * ecSites.length))] };
    return { kind: "row", r, id: order[r], x };
  };
  const leavesOf = (nd) => order.slice(nd.firstLeaf, nd.lastLeaf + 1);
  const select = (ids, label, event) => {
    const mode = selectMode(event);
    let next;
    if (mode === "replace") next = ids;
    else if (mode === "add") next = [...new Set([...(sc.selectedCellIds || []), ...ids])];
    else next = (sc.selectedCellIds || []).filter((id) => !ids.includes(id));
    dispatch(singleCellActions.updateSelection(next));
    onSelectCells?.(next, label);
  };
  const anchor = useRef(null);
  const tooltip = (h) => {
    if (h.kind === "gene") return [h.m.gene, ["Event", `${h.m.event.vartype || h.m.event.type || ""}`], ["Click", "open the gene's event card"]];
    if (h.kind === "walk") {
      const ncar = order.filter((id) => (Number(h.w.cells?.[id]) || 0) >= 1).length;
      return [h.w.label || h.w.name || `walk ${h.w.id}`, ["Carriers", `${ncar} cells`], ["Nodes", (h.w.nodes || []).length], ["Click", "focus this variant and select its carriers"]];
    }
    if (h.kind === "node") {
      const ids = leavesOf(h.nd);
      const p = anc?.p[h.i];
      return [`Clade of ${ids.length} cells`, ...(Number.isFinite(p) && focusWalk ? [[`${focusWalk.label || "variant"} present`, `${Math.round(100 * p)}%`]] : []), ["Click", "select the clade (Cmd adds)"], ["Double-click", "zoom to the clade"]];
    }
    if (h.kind === "site") return [h.v.id, ["Gene", h.v.gene || "–"], ["Cell", order[h.r]], ["Click", "open the SNV site"]];
    const cell = cellById.get(h.id) || {};
    const lines = [h.id, ["Clone", cell.clone_id ?? "–"], ["State", cell.state ?? "–"]];
    bars.forEach(({ w, vals }) => lines.push([w.label || `walk ${w.id}`, Number.isFinite(vals[h.r]) ? vals[h.r].toFixed(1) : "–"]));
    if (cnGeo && h.x >= L.cnX && h.x < L.cnX + L.cnW) {
      const g = cnGeo.gOf[Math.floor(h.x - L.cnX)];
      const row = cnById.get(h.id);
      const p = Number.isFinite(g) ? chromOf(chromoBins, g) : null;
      if (row && p) {
        const b = binAt(row.binIndex, g);
        lines.push([`CN chr${p.chr}:${(p.pos / 1e6).toFixed(2)} Mb`, b >= 0 ? row.values[b].toFixed(1) : "–"]);
      }
    }
    return lines;
  };
  const hoverRaf = useRef(0);
  const onHover = (h) => {
    const id = h && h.kind === "row" ? h.id : null;
    cancelAnimationFrame(hoverRaf.current);
    hoverRaf.current = requestAnimationFrame(() => {
      if (id !== sc.hoveredCellId) dispatch(singleCellActions.updateHover(id));
    });
  };
  const onWheel = (x, y, event) => {
    const zoomIn = event.deltaY < 0;
    const f = zoomIn ? 0.8 : 1.25;
    if (cnGeo && x >= L.cnX && x < L.cnX + L.cnW && y >= TOP - 4) {
      const col = Math.floor(x - L.cnX);
      const k = cnGeo.ext.findIndex(([a, b]) => col >= a && col < b);
      if (k < 0) return false;
      const [a, b, d] = cnGeo.ext[k];
      const g = d[0] + ((col - a) / (b - a)) * (d[1] - d[0]);
      const span = Math.max(2e4, (d[1] - d[0]) * f);
      const t = (g - d[0]) / (d[1] - d[0]);
      const next = domains.slice();
      next[k] = [g - t * span, g - t * span + span];
      setView(next);
      return true;
    }
    if (x < L.data0 && y >= TOP && y < TOP + plotH) {
      const r = rowAt(y);
      const span = Math.min(n, Math.max(8, Math.round(nv * f)));
      const t = (r - r0) / nv;
      let a = Math.round(r - t * span);
      a = Math.max(0, Math.min(n - span, a));
      setRowWin(span >= n ? null : [a, a + span]);
      return true;
    }
    return false;
  };

  if (!ready) {
    return (
      <Space direction="vertical" align="center" style={{ width: "100%", padding: "36px 0" }}>
        <Text type="secondary">{`Loading ${patient}…`}</Text>
        <Progress percent={loading ? pct || 0 : 0} size="small" style={{ width: 260 }} />
      </Space>
    );
  }
  const familyOptions = families.map((f) => ({ label: f.map((w) => w.label || w.name || w.id).slice(0, 3).join(" · ") + (f.length > 3 ? ` +${f.length - 3}` : ""), options: f.map((w) => ({ value: w.id, label: `${w.label || w.name || `walk ${w.id}`} (${order.filter((id) => (Number(w.cells?.[id]) || 0) >= 1).length} cells)` })) }));
  return (
    <div ref={ref}>
      <Space size={10} wrap align="center" style={{ marginBottom: 4 }}>
        <span className="sc-fig-patient">{patient}</span>
        <Text type="secondary">ecDNA variant</Text>
        <Select size="small" style={{ width: 260 }} value={focusWalk?.id} options={familyOptions} onChange={(v) => onFocusWalk?.(v)} placeholder="No ecDNA walks" />
        <Space size={4}>
          <Switch size="small" checked={showAnc} onChange={setShowAnc} />
          <Tooltip title="Marginal ancestral state of the focused variant (two-state model on the tree), shown where it changes or is uncertain: green = present (gained or retained), red = lost where the parent had it; size = likelihood. Hover a node for its probability.">
            <Text type="secondary">Ancestral state</Text>
          </Tooltip>
        </Space>
        {(view || rowWin) && (
          <Button size="small" onClick={() => { setView(null); setRowWin(null); }}>
            Reset zoom
          </Button>
        )}
      </Space>
      <PanelHead letter="A" title="Clonal structure of the amplicon" fig="Fig 4B · 5D" hint="hover a row for its cell · click or drag rows, or click a node, to select · scroll to zoom genome (heatmap) or rows (tree) · double-click a node for its clade (Fig 4D)" />
      <FigureCanvas
        width={width}
        height={height}
        draw={draw}
        hitTest={hitTest}
        tooltip={tooltip}
        onHover={onHover}
        onWheel={onWheel}
        onDoubleClick={(x, y) => {
          // double-click a tree node: zoom the rows to its clade (Fig 4D); elsewhere: reset
          const h = hitTest(x, y);
          if (h?.kind === "node") {
            setRowWin([h.nd.firstLeaf, h.nd.lastLeaf + 1]);
            return;
          }
          setView(null);
          setRowWin(null);
        }}
        ariaLabel={`${patient}: clonal amplicon figure`}
        onClick={(h, event) => {
          if (h.kind === "gene") dispatch(filteredEventsActions.selectFilteredEvent({ ...h.m.event, uid: h.m.event.uid ?? `${patient}-${h.m.gene}` }, "plots"));
          else if (h.kind === "walk") {
            onFocusWalk?.(h.w.id);
            select(order.filter((id) => (Number(h.w.cells?.[id]) || 0) >= 1), `${h.w.label || "walk " + h.w.id} carriers`, event);
          } else if (h.kind === "node") select(leavesOf(h.nd), `clade of ${h.nd.lastLeaf - h.nd.firstLeaf + 1} cells`, event);
          else if (h.kind === "site") setSiteDrawer({ c: h.v.index, row: h.r });
          else if (h.kind === "row") {
            if (event.shiftKey && anchor.current != null) {
              const [a, b] = [Math.min(anchor.current, h.r), Math.max(anchor.current, h.r)];
              select(order.slice(a, b + 1), `${b - a + 1} rows`, { metaKey: true });
            } else {
              anchor.current = h.r;
              select([h.id], h.id, event.metaKey || event.ctrlKey ? { metaKey: true } : null);
            }
          }
        }}
        onDragStart={(x, y) => (x >= L.clade - 4 && y >= TOP && y < TOP + plotH ? { mode: "band-y", x0: L.clade, x1: width, y0: TOP, y1: TOP + plotH } : null)}
        onDragEnd={({ a, b }, event) => {
          const ra = rowAt(Math.min(a[1], b[1]));
          const rb = rowAt(Math.max(a[1], b[1]));
          const s = ra < 0 ? r0 : ra;
          const e = rb < 0 ? r1 - 1 : rb;
          if (e >= s) select(order.slice(s, e + 1), `${e - s + 1} rows (brushed)`, event);
        }}
      />
      <div className="sc-fig-keys">
        <span className="sc-fig-key">
          <b>Clade</b>
          {Object.entries(sc.cloneColors).slice(0, 14).map(([k, col]) => (
            <span key={k}>
              <span className="sc-fig-swatch" style={{ background: col }} />
              {k}
            </span>
          ))}
        </span>
        <span className="sc-fig-key">
          <b>State</b>
          {Object.entries(stateColors).map(([k, col]) => (
            <span key={k}>
              <span className="sc-fig-swatch" style={{ background: col }} />
              {k}
            </span>
          ))}
        </span>
        {showAnc && focusWalk && (
          <span className="sc-fig-key">
            <b>{`${focusWalk.label || "variant"} status`}</b>
            <span><span className="sc-fig-swatch" style={{ background: RETAINED, borderRadius: 5 }} />present</span>
            <span><span className="sc-fig-swatch" style={{ background: LOST, borderRadius: 5 }} />lost (red lineage)</span>
            <span><span className="sc-fig-swatch" style={{ background: "transparent", border: `1.5px solid ${RETAINED}`, borderRadius: 6 }} />ringed: state changes here</span>
            <span>dot size = likelihood</span>
          </span>
        )}
        {!snvData && <span className="sc-fig-key">No SNV matrix for this patient: SNV panels left out.</span>}
      </div>
      {siteDrawer && snvData && (
        <SnvSiteDrawer open onClose={() => setSiteDrawer(null)} variant={snvData.variants[siteDrawer.c]} order={order} rows={rowMap(order, snvData.cells)} clickedRow={siteDrawer.row} />
      )}
    </div>
  );
}

/**
 * Fig 4C row, live: the variant derivation tree of the focused family next
 * to the report's own walk diagram (ring / bar) of the focused variant.
 */
export function PatientVariants({ patient, events = [], focusWalkId, onFocusWalk, onSelectCells }) {
  const dispatch = useDispatch();
  const { ready } = usePatientLoaded(patient);
  const { order, colorOf, focusWalk, family } = useFocusFamily(focusWalkId);
  if (!ready || !family.length) return null;
  return (
    <Row gutter={[24, 12]} className="sc-fig-block">
      <Col xs={24} xl={14}>
        <PanelHead letter="B" title="ecDNA variants" fig="Fig 4C" hint="how the walks derive from one another · click a variant to focus it" />
        <VariantTree
          family={family}
          order={order}
          colorOf={colorOf}
          focusId={focusWalk?.id}
          events={events}
          onFocus={onFocusWalk}
          onSelect={(ids, { label, mode }) => {
            dispatch(singleCellActions.updateSelection(ids));
            onSelectCells?.(ids, label, mode);
          }}
        />
      </Col>
      <Col xs={24} xl={10}>
        <PanelHead letter="C" title={`Structure of ${focusWalk?.label || "the focused variant"}`} hint="the report's walk diagram" />
        {focusWalk && <WalkDiagram walk={focusWalk} colorOf={colorOf} cellIds={order} />}
      </Col>
    </Row>
  );
}

/**
 * Fig 4E + 5C row: copy-number profiles of the selected (or representative)
 * cells, and segment co-variation triangles of the selected cells (else the
 * focused variant's carriers) against the other tumour cells, both over the
 * figure's current windows.
 */
export function PatientProfiles({ patient, focusWalkId, domains = [], events = [] }) {
  const { ready } = usePatientLoaded(patient);
  const { order, focusWalk, cellById, colorOf } = useFocusFamily(focusWalkId);
  const sc = useSelector((st) => st.SingleCell);
  const chromoBins = useSelector((st) => st.Settings.chromoBins);
  const cnById = useMemo(() => {
    const d = sc.cn.status === "ok" ? sc.cn.data : null;
    return d ? new Map(d.cells.map((id, i) => [id, d.rows[i]])) : new Map();
  }, [sc.cn]);
  const tumour = useMemo(() => order.filter((id) => !isNormalClone(cellById.get(id)?.clone_id)), [order, cellById]);
  const sel = useMemo(() => sc.selectedCellIds || [], [sc.selectedCellIds]);
  const groupA = useMemo(() => (sel.length >= 3 ? sel : focusWalk ? tumour.filter((id) => (Number(focusWalk.cells?.[id]) || 0) >= 1) : []), [sel, focusWalk, tumour]);
  const groupB = useMemo(() => {
    const a = new Set(groupA);
    return tumour.filter((id) => !a.has(id));
  }, [groupA, tumour]);
  const genes = useMemo(() => {
    const amp = new Set((focusWalk?.driver_genes || []).map(String));
    const seen = new Set();
    const out = [];
    events.forEach((e) => {
      const g = `${e.gene || ""}`;
      if (!amp.has(g) || seen.has(g)) return;
      const chr = `${e.seqnames}`.replace(/^chr/, "");
      if (!chromoBins?.[chr]) return;
      seen.add(g);
      out.push({ name: g, g: chromoBins[chr].startPlace + (Number(e.start) + (Number(e.end) || Number(e.start))) / 2 });
    });
    return out;
  }, [events, focusWalk, chromoBins]);
  if (!ready || !domains.length) return null;
  return (
    <Row gutter={[24, 12]} className="sc-fig-block">
      <Col xs={24} xl={13}>
        <PanelHead letter="D" title="Single-cell copy-number profiles" fig="Fig 4E" hint="selected cells (up to 3), else carriers and a non-carrier · follows A's zoom" />
        <CellProfiles order={order} focusWalk={focusWalk} domains={domains} cellById={cellById} />
      </Col>
      <Col xs={24} xl={11}>
        <PanelHead letter="E" title="Segment co-variation" fig="Fig 5C" hint={`${sel.length >= 3 ? "selected cells" : `${focusWalk?.label || "variant"} carriers`} (up) vs other tumour cells (down)`} />
        <TriangleCorrelation order={order} cnById={cnById} domains={domains} groupA={groupA} groupB={groupB} labelA={sel.length >= 3 ? "Selected cells" : `${focusWalk?.label || "variant"} carriers`} labelB="Other tumour cells" walk={focusWalk} colorOf={colorOf} genes={genes} />
      </Col>
    </Row>
  );
}

/** Fig 5F: the clade-state tree of the focused variant. */
export function PatientCladeStates({ patient, focusWalkId, onSelectCells }) {
  const dispatch = useDispatch();
  const { ready } = usePatientLoaded(patient);
  const { order, treeLayout, cellById, focusWalk } = useFocusFamily(focusWalkId);
  const cloneColors = useSelector((st) => st.SingleCell.cloneColors);
  if (!ready || !treeLayout) return null;
  return (
    <CladeStateTree
      treeLayout={treeLayout}
      order={order}
      cellById={cellById}
      cloneColors={cloneColors}
      walk={focusWalk}
      onSelect={(ids, { label }) => {
        dispatch(singleCellActions.updateSelection(ids));
        onSelectCells?.(ids, label);
      }}
    />
  );
}
