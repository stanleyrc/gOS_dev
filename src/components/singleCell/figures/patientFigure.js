import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Button, Checkbox, Col, Progress, Row, Segmented, Select, Space, Switch, Tooltip, Typography } from "antd";
import FigureCanvas, { fitText, useFigureStyleName } from "./figureCanvas";
import { figureStyle, isPaperStyle } from "../../../helpers/singleCell/figureStyle";
import { parseEcdnaSnvs, snvBlockOrder } from "../../../helpers/singleCell/paperPanels";
import { resolveAnchors } from "../../../helpers/singleCell/branchSnvs";
import { casePath, tryGet } from "../../../redux/singleCell/loaders";
import { paperAmpCnRgb, rgbHex, PAPER_AMPCN_STOPS } from "../../../helpers/singleCell/paperPalette";
import { paperTokensVersion } from "../../../helpers/singleCell/paperPalette";
import { PAPER_EGFR, paperCladeLabel, paperCloneColors, paperCnCss, paperCnPacked, paperEgfrColor, paperStateColor } from "../../../helpers/singleCell/paperPalette";
import { PanelHead, textRole } from "./figureKit";
import useContainerWidth from "../useContainerWidth";
import useTreeView from "../useTreeView";
import useWalks from "../ecdna/useWalks";
import SnvSiteDrawer from "../snvSiteDrawer";
import WalkDiagram from "../ecdna/walkDiagram";
import VariantTree from "./variantTree";
import SvgExportButton from "../svgExportButton";
import { usePaperLetters } from "../paper/paperContext";
import TriangleCorrelation from "./triangleCorrelation";
import CladeStateTree from "./cladeStateTree";
import GenomeTracks from "./genomeTracks";
import VariantCopiesBox from "./variantCopiesBox";
import singleCellActions from "../../../redux/singleCell/actions";
import filteredEventsActions from "../../../redux/filteredEvents/actions";
import { SNV_ALT_TOP, SNV_REF_COLOR, annotationColors, binAt, domainExtents, rowMap } from "../../../helpers/singleCell/matrix";
import { AMP_LEGEND, ampliconCss, ampliconRGBA, binSnvMatrix, isNormalClone, snvTreeOrder } from "../../../helpers/singleCell/figures";
import { ancestralBinary, packStoreSnv, walkDomains } from "../../../helpers/singleCell/figureMath";
import { PAPER_WALK_HEATMAP, ampliconWindows, dominantWalk, mainAmplicons, variantGrouping } from "../../../helpers/singleCell/figureDefaults";
import settingsActions from "../../../redux/settings/actions";
import { walkFamilies } from "../../../helpers/singleCell/walks";
import { defaultFocusWalk } from "../../../helpers/singleCell/walkPanels";
import { selectMode } from "./cellSelection";
import { NO_READS_DARK, NO_READS_LIGHT, useDarkTheme, vafGray } from "./darkTheme";

const { Text } = Typography;
const STRIP = 10;
const GAP = 6;
const HEAD_H = 74; // header: rotated strip titles, legends, genes, focused-variant track
const GENE_ROW = HEAD_H - 22; // gene marker baseline
const TRACK_H = 14;
const AXIS_H = 16;
const IDEO_H = 40;
const GENOME_GAP = 50; // px between genome windows, as in the gOS genome / genes / walk tracks
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
const WHITE = NO_READS_LIGHT;
const DARK_BG = NO_READS_DARK;
const gray = vafGray;
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
  const { all, filtered, colorOf: baseColorOf, measured } = useWalks(order);
  // Paper style: the manuscript's ecEGFR colours (long / short / shorter / variants); other walks keep theirs
  const paper = isPaperStyle(figureStyle(useFigureStyleName()));
  const colorOf = useMemo(() => {
    if (!paper) return baseColorOf;
    const byId = new Map(all.map((w) => [`${w.id}`, w]));
    return (id) => paperEgfrColor(byId.get(`${id}`)?.label) || baseColorOf(id);
  }, [paper, all, baseColorOf]);
  const families = useMemo(() => walkFamilies(filtered.length ? filtered : all), [filtered, all]);
  // default: the driver ecDNA (walk with driver genes) carried by the most cells
  const focusWalk = useMemo(() => {
    const picked = all.find((w) => w.id === `${focusWalkId}`);
    if (picked) return picked;
    // default: the dominant driver amplicon (most ecDNA copies over its carriers; BWH69 -> MYCN)
    const pool = all.length ? all : filtered;
    return dominantWalk(pool, order) || defaultFocusWalk(families[0] || [], order) || null;
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
export default function PatientFigure({ patient, events = [], focusWalkId, onFocusWalk, onSelectCells, onView, maxPlotHeight = 640, walkNames = null, ecdnaSnvs = null }) {
  const dispatch = useDispatch();
  const { ready, loading, pct } = usePatientLoaded(patient);
  const sc = useSelector((s) => s.SingleCell);
  const chromoBins = useSelector((s) => s.Settings.chromoBins);
  const cytobands = useSelector((s) => s.Cytobands?.data || []);
  const { order, treeLayout, cellById, all, colorOf, measured, families, focusWalk, family } = useFocusFamily(focusWalkId);
  const [ref, measuredW] = useContainerWidth(1200);
  const width = Math.max(760, measuredW);
  const dark = useDarkTheme();
  const paper = isPaperStyle(figureStyle(useFigureStyleName()));
  const figRef = useRef(null);
  const paperLetters = usePaperLetters("patient-figure");
  const tokensVersion = paperTokensVersion(); // the paper's style tokens (CN scale, states, clades) may load after the first render

  // ---- amplicons: every main amplicon of the patient by default (hide / reorder with the chips)
  const tumorIds = useMemo(() => order.filter((id) => !isNormalClone(cellById.get(id)?.clone_id)), [order, cellById]);
  const amps = useMemo(() => mainAmplicons(all, tumorIds), [all, tumorIds]);
  const [ampState, setAmpState] = useState(null); // { order: [key], shown: [key] } once the user changes it
  useEffect(() => setAmpState(null), [patient]);
  const ampOrder = useMemo(() => {
    const keys = amps.map((x) => x.key);
    const o = (ampState?.order || []).filter((k) => keys.includes(k));
    return [...o, ...keys.filter((k) => !o.includes(k))];
  }, [amps, ampState]);
  const shownKeys = useMemo(() => {
    if (ampState?.shown) return new Set(ampState.shown);
    const main = amps.filter((x) => x.main).map((x) => x.key);
    return new Set(main.length ? main : amps.slice(0, 1).map((x) => x.key));
  }, [amps, ampState]);
  const shownAmps = useMemo(() => ampOrder.map((k) => amps.find((x) => x.key === k)).filter((x) => x && shownKeys.has(x.key)), [ampOrder, amps, shownKeys]);
  const setAmps = (orderKeys, shown) => setAmpState({ order: orderKeys, shown: [...shown] });
  const grouping = useMemo(() => variantGrouping(patient, all), [patient, all]);
  // figure context: the paper's walk display names (figure sidecar, e.g. wEGFR_var1 -> "ecEGFR Long 1"); walks.json is unchanged
  const nameOf = useMemo(() => (walkNames ? (w) => (w && walkNames[`${w.label}`]) || grouping.nameOf(w) : grouping.nameOf), [walkNames, grouping]);

  // bar columns: one per shown amplicon, split into the paper's variant groups where defined (BWH70: long / short EGFR); each stacks its variants
  // copies per cell as stacked bars (Fig 4B) or a CN heatmap (Fig 5B); the paper uses the heatmap for BWH69
  const [copyModeChoice, setCopyMode] = useState(null);
  useEffect(() => setCopyMode(null), [patient]);
  const copyMode = copyModeChoice || (paper && PAPER_WALK_HEATMAP[patient] ? "heatmap" : "bars");
  const columns = useMemo(() => {
    const carriers = (w) => tumorIds.reduce((k, id) => k + ((Number(w.cells?.[id]) || 0) >= 1 ? 1 : 0), 0);
    const total = (w) => tumorIds.reduce((t, id) => t + (Number(w.cells?.[id]) || 0), 0);
    const out = [];
    shownAmps.forEach((amp) => {
      const inAmp = new Set(amp.walks.map((w) => w.id));
      const groups = grouping.groups.filter((g) => g.walks.some((w) => inAmp.has(w.id)));
      const sets = groups.length
        ? groups.map((g) => ({ label: g.label, anchor: g.walks.find((w) => w.id === g.anchorId), walks: g.walks.filter((w) => inAmp.has(w.id)) }))
        : [{ label: `ec${amp.label}`, anchor: amp.dominant, walks: amp.walks }];
      sets.forEach((set) => {
        const ws = set.walks.filter((w) => carriers(w) > 0).sort((x, y) => (x.id === set.anchor?.id ? -1 : y.id === set.anchor?.id ? 1 : total(y) - total(x)));
        out.push({ key: `${amp.key}:${set.label}`, label: set.label, amp, anchor: set.anchor || ws[0], parts: ws.slice(0, 6), rest: ws.slice(6) });
      });
    });
    // Fig 5B (BWH69): the paper's named walks, one heatmap column each
    if (copyMode === "heatmap" && paper && PAPER_WALK_HEATMAP[patient]) {
      const cols = PAPER_WALK_HEATMAP[patient]
        .map((spec) => {
          const w = all.find((x) => `${x.label}` === spec.walk);
          return w ? { key: `heat:${spec.label}`, label: spec.label, amp: null, anchor: w, parts: [w], rest: [] } : null;
        })
        .filter(Boolean);
      if (cols.length) return cols;
    }
    // Paper style with the paper's variant groups (BWH70): only those columns, as the PDF (Short | Long)
    if (paper && grouping.groups.length) {
      const named = out.filter((col) => grouping.groups.some((g) => g.label === col.label));
      if (named.length) {
        const order = [...grouping.groups].reverse().map((g) => g.label);
        return named.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label)).map((col) => ({ ...col, label: col.label.replace(/\s*EGFR$/i, "").replace(/^./, (ch) => ch.toUpperCase()) }));
      }
    }
    return out;
  }, [shownAmps, grouping, tumorIds, paper, copyMode, patient, all]);
  const ampWalks = useMemo(() => shownAmps.flatMap((x) => x.walks), [shownAmps]);
  // walk lanes for the genome tracks: the shown amplicons' walks with carriers, most carried first
  const laneWalks = useMemo(() => {
    const nc = (w) => tumorIds.reduce((k, id) => k + ((Number(w.cells?.[id]) || 0) >= 1 ? 1 : 0), 0);
    return ampWalks
      .map((w) => [w, nc(w)])
      .filter(([, k]) => k > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 16)
      .map(([w]) => w);
  }, [ampWalks, tumorIds]);
  // cells for the genome graph tracks: the selection (up to 3), else the top and a median carrier of the focused variant
  const trackCells = useMemo(() => {
    const sel = sc.selectedCellIds || [];
    if (sel.length && sel.length <= 6) return sel.slice(0, 3).map((id) => ({ id, why: "selected" }));
    if (!focusWalk) return [];
    const cn = (id) => Number(focusWalk.cells?.[id]) || 0;
    const car = tumorIds.filter((id) => cn(id) >= 1).sort((a, b) => cn(b) - cn(a));
    const out = car.length ? [{ id: car[0], why: `highest ${nameOf(focusWalk)} copies` }] : [];
    if (car.length > 2) out.push({ id: car[Math.floor(car.length / 2)], why: "median carrier" });
    return out;
  }, [sc.selectedCellIds, focusWalk, tumorIds, nameOf]);
  const baseDomains = useMemo(() => {
    const wins = ampliconWindows(shownAmps)
      .map(([chr, a, b]) => (chromoBins?.[chr] ? [chromoBins[chr].startPlace + a, chromoBins[chr].startPlace + Math.min(b, chromoBins[chr].endPoint || b)] : null))
      .filter(Boolean);
    return wins.length ? wins : walkDomains(family, chromoBins);
  }, [shownAmps, family, chromoBins]);
  const [view, setView] = useState(null); // zoomed genome windows (null = the amplicons' windows)
  const ampKey = shownAmps.map((x) => x.key).join("|");
  useEffect(() => setView(null), [ampKey, patient]);
  const domains = view || baseDomains;
  // report the shown genome windows, and share them with the report's genome tracks (Settings domains)
  const domainsKey = JSON.stringify(domains);
  const storeDomains = useSelector((st) => st.Settings.domains);
  useEffect(() => {
    onView?.(domains);
    if (ready && domains.length && JSON.stringify(storeDomains) !== domainsKey) dispatch(settingsActions.updateDomains(domains));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domainsKey, ready]);
  useEffect(() => {
    // zoom / pan in the genome tracks (walk lanes) moves the heatmap too: adopt store windows that overlap ours one to one
    if (!storeDomains?.length || storeDomains.length !== domains.length || JSON.stringify(storeDomains) === domainsKey) return;
    if (storeDomains.every((d, k) => d[1] > domains[k][0] && d[0] < domains[k][1])) setView(storeDomains);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(storeDomains)]);
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
  // the paper's ecDNA SNVs (<patient>/ecdna_snvs.json: filtered sites, no alt read in normal cells), when exported
  const dataset = useSelector((st) => st.Settings?.dataset);
  const [ecExport, setEcExport] = useState(null);
  useEffect(() => {
    setEcExport(null);
    // figure context: the exact SNV set the figure draws (figure sidecar), else the exported file
    if (ecdnaSnvs?.length) {
      setEcExport(ecdnaSnvs);
      return undefined;
    }
    if (!dataset?.dataPath || !patient) return undefined;
    let live = true;
    tryGet(casePath(dataset, patient, "ecdna_snvs.json")).then((r) => live && setEcExport(r.status === "ok" ? parseEcdnaSnvs(r.data) : null));
    return () => {
      live = false;
    };
  }, [dataset, patient, ecdnaSnvs]);
  const ecSites = useMemo(() => {
    if (ecExport?.length) {
      const idx = new Map((snvData?.variants || []).map((v, i) => [`${v.id}`.replace(/^chr/, ""), i]));
      return ecExport.map((x) => ({ ...x, index: idx.get(x.id.replace(/^chr/, "")) ?? -1, gene: `chr${x.id.split("_")[0]}:${x.pos} (no alt in ${x.normalDepth ?? "?"} normal reads)`, exported: true }));
    }
    const pool = ampWalks.length ? ampWalks : family;
    if (!snvData || !pool.length) return [];
    const ivals = [];
    pool.forEach((w) =>
      (w.nodes || []).forEach((nd) => {
        const chr = `${nd.chromosome}`.replace(/^chr/, "");
        if (!chromoBins?.[chr]) return;
        const s = chromoBins[chr].startPlace + Math.min(nd.start, nd.end);
        const e = chromoBins[chr].startPlace + Math.max(nd.start, nd.end);
        ivals.push([s, e]);
      })
    );
    return snvData.variants.filter((v) => Number.isFinite(v.global) && ivals.some(([s, e]) => v.global >= s && v.global <= e)).sort((a, b) => a.global - b.global);
  }, [snvData, ampWalks, family, chromoBins, ecExport]);
  const stateColors = useMemo(() => {
    const base = annotationColors(sc.cells.map((c) => c.state).filter((s) => s != null && s !== ""));
    if (!paper) return base;
    return Object.fromEntries(Object.entries(base).map(([k, col]) => [k, paperStateColor(k) || col]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sc.cells, paper, tokensVersion]);
  // clade strip: the manuscript's clade colours and names in the Paper style (MGH303: EC1-3, CI)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cloneColors = useMemo(() => (paper ? { ...sc.cloneColors, ...paperCloneColors(patient, Object.keys(sc.cloneColors || {})) } : sc.cloneColors), [paper, sc.cloneColors, patient, tokensVersion]);
  const cloneLabel = useCallback((k) => (paper ? paperCladeLabel(patient, k) : k), [paper, patient]);
  const cnPacked = paper ? paperCnPacked : ampliconRGBA;
  const cnCss = paper ? paperCnCss : ampliconCss;
  const lostInkP = paper ? PAPER_EGFR.lost : LOST;
  const keepInkP = paper ? PAPER_EGFR.retained : RETAINED;

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
    const nb = columns.length;
    const barsW = nb ? Math.max(58 * nb, Math.min(90 * nb, width * 0.22)) : 0;
    const rest = width - data0 - barsW - (nb ? GAP * 2 : 0) - 4;
    const snvW = packed ? Math.round(rest * 0.3) : 0;
    const ecW = ecSites.length ? Math.round(Math.min(rest * 0.14, Math.max(52, ecSites.length * 6))) : 0;
    const cnW = rest - snvW - ecW - (snvW ? GAP : 0) - (ecW ? GAP : 0);
    const snvX = data0;
    const ecX = snvX + snvW + (snvW ? GAP : 0);
    const cnX = ecX + ecW + (ecW ? GAP : 0);
    const barsX = cnX + cnW + (nb ? GAP * 2 : 0);
    const barW = nb ? (barsW - GAP * (nb - 1)) / nb : 0;
    return { treeW, clade, state, data0, snvX, snvW, ecX, ecW, cnX, cnW, barsX, barW };
  }, [treeLayout, width, columns.length, packed, ecSites.length]);
  const TOP = HEAD_H + TRACK_H + 4;
  // bar labels are written vertically under the bars
  const barLabH = columns.length ? Math.min(130, 18 + 7.4 * Math.max(...columns.map((col) => col.label.length))) : 0;
  const height = TOP + plotH + Math.max(AXIS_H + IDEO_H + 24, barLabH + 18);

  // ---- prebuilt images (all rows; zoomed rows are a source crop)
  const snvImg = useMemo(() => {
    if (!packed || L.snvW < 8) return null;
    const rowOf = new Map(order.map((id, i) => [id, i]));
    let cols0 = null;
    let blocks = null;
    // Paper style: truncal | subclonal by mapped clade in tree order | private (srctools fig4 snv_hm), when the sites carry tree anchors
    const anchored = snvData.variants.filter((v) => v.anchor).length;
    if (paper && treeLayout && anchored >= snvData.variants.length * 0.5) {
      const nodeIds = resolveAnchors(snvData.variants.map((v) => v.anchor || null), treeLayout);
      const nodes = nodeIds.map((k) => (k == null || k < 0 ? null : treeLayout.nodes[k]));
      const carriers = new Int32Array(snvData.variants.length);
      Object.values(packed).forEach((p) => p.idx.forEach((j, k) => p.vaf[k] >= 25 && (carriers[j] += 1)));
      const res = snvBlockOrder(snvData.variants, nodes, (r) => cellById.get(order[r])?.clone_id ?? null, carriers);
      cols0 = res.cols;
      blocks = res.blocks;
    } else cols0 = snvTreeOrder(packed, rowOf, snvData.variants.length);
    if (!cols0.length) return null;
    const cols = Math.max(4, Math.min(Math.floor(L.snvW), cols0.length));
    const m = binSnvMatrix(packed, order, cols0, cols);
    return { canvas: toCanvas(cols, n, (px) => px.forEach((_, k) => (px[k] = m[k] < 0 ? (dark ? DARK_BG : WHITE) : gray(m[k], dark)))), nSites: cols0.length, blocks };
  }, [packed, snvData, order, n, L.snvW, dark, paper, treeLayout, cellById]);
  const ecImg = useMemo(() => {
    if (ecSites[0]?.exported) {
      return toCanvas(ecSites.length, n, (px) =>
        order.forEach((id, r) =>
          ecSites.forEach((v, c) => {
            if (v.frac) {
              const f = v.frac.get(id);
              px[r * ecSites.length + c] = f == null ? (dark ? DARK_BG : WHITE) : gray(250 * f, dark);
              return;
            }
            const rd = v.reads?.get(id);
            const d = rd ? rd[0] + rd[1] : 0;
            px[r * ecSites.length + c] = d > 0 ? gray((250 * rd[1]) / d, dark) : dark ? DARK_BG : WHITE;
          })
        )
      );
    }
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
    // same split as the gOS genome tracks below (equal panels, GENOME_GAP px apart), so they line up
    const ext = domainExtents(domains, cols, GENOME_GAP);
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
            px[r * cols + x] = b >= 0 ? cnPacked(row.values[b]) : NO_CN;
          }
        }
      })
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cnGeo, cnById, order, n, cnPacked, tokensVersion]);
  const bars = useMemo(
    () =>
      columns.map((col) => {
        // per cell: the stacked parts (walk copies) and the rest summed
        const parts = col.parts.map((w) => {
          const v = new Float32Array(n);
          order.forEach((id, r) => (v[r] = Number(w.cells?.[id]) || 0));
          return { w, v };
        });
        const rest = new Float32Array(n);
        col.rest.forEach((w) => order.forEach((id, r) => (rest[r] += Number(w.cells?.[id]) || 0)));
        const sum = new Float32Array(n);
        let max = 0;
        for (let r = 0; r < n; r += 1) {
          sum[r] = parts.reduce((t, p) => t + p.v[r], rest[r]);
          if (sum[r] > max) max = sum[r];
        }
        return { col, w: col.anchor, parts, rest, sum, vals: sum, max: max || 1 };
      }),
    [columns, order, n]
  );
  // shared copy scale, robust to a few extreme cells (98th percentile of the stacked totals; longer bars are clipped)
  const barMax = useMemo(() => {
    const v = [];
    bars.forEach((b) => b.sum.forEach((x) => x > 0 && v.push(x)));
    if (!v.length) return 1;
    v.sort((x, y) => x - y);
    return Math.max(1, v[Math.min(v.length - 1, Math.floor(0.98 * v.length))]);
  }, [bars]);
  const geneMarks = useMemo(() => {
    if (!cnGeo) return [];
    const amp = new Set(shownAmps.flatMap((x) => x.key.split("+")));
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
  }, [events, cnGeo, chromoBins, shownAmps, L.cnX]);

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
      const lostInk = c.dark ? "#ef6f6c" : lostInkP;
      const keepInk = c.dark ? "#66bb6a" : keepInkP;
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
        ctx.fillStyle = cloneColors[cell.clone_id] || (isNormalClone(cell.clone_id) ? "#9e9e9e" : "#d9d9d9");
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
      // stacked copies per cell: the column's variants (anchor first), the rest in grey
      bars.forEach(({ parts, rest, sum }, k) => {
        const x0 = L.barsX + k * (L.barW + GAP);
        if (copyMode === "heatmap") {
          // amplicon CN 0-100 (Fig 5B palette), white = no copies
          for (let r = r0; r < r1; r += 1) {
            ctx.fillStyle = rgbHex(paperAmpCnRgb(sum[r]));
            ctx.fillRect(x0, TOP + (r - r0) * rh, L.barW, Math.max(rh, 0.6) + 0.3);
          }
          ctx.strokeStyle = c.text;
          ctx.lineWidth = 0.6;
          ctx.strokeRect(x0 + 0.5, TOP + 0.5, L.barW - 1, plotH - 1);
          ctx.lineWidth = 1;
          return;
        }
        ctx.fillStyle = c.dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.022)";
        ctx.fillRect(x0, TOP, L.barW, plotH);
        const bh = Math.max(1, rh * 0.82);
        const sx = (L.barW - 2) / barMax;
        const acc = new Float32Array(r1 - r0);
        const layer = (v, color) => {
          ctx.fillStyle = color;
          for (let r = r0; r < r1; r += 1) {
            if (!(v[r] > 0)) continue;
            const a = acc[r - r0];
            const w = Math.min(v[r] * sx, L.barW - 2 - a * sx);
            if (w > 0) ctx.fillRect(x0 + a * sx, TOP + (r - r0) * rh + (rh - bh) / 2, Math.max(0.8, w), bh);
            acc[r - r0] = a + v[r];
          }
        };
        parts.forEach((p) => layer(p.v, colorOf(p.w.id)));
        layer(rest, c.dark ? "#8c8c8c" : "#bfbfbf");
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
      if (snvImg?.blocks) {
        // block header (truncal grey, subclonal / private coloured by clade) and separators, as the PDF
        const bx = (u) => L.snvX + (u / snvImg.nSites) * L.snvW;
        snvImg.blocks.forEach((b, k) => {
          if (b.block === "Unmapped") return;
          if (b.block === "Truncal") {
            ctx.fillStyle = "#4D4D4D";
            ctx.fillRect(bx(b.x0), TOP - 9, bx(b.x1) - bx(b.x0), 6);
          } else
            b.clades.forEach((cl) => {
              ctx.fillStyle = cloneColors[cl.clade] || (isNormalClone(cl.clade) ? "#9e9e9e" : "#bdbdbd");
              ctx.fillRect(bx(cl.x0), TOP - 9, bx(cl.x1) - bx(cl.x0), 6);
            });
          textRole(ctx, c, "caption", "text");
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          if (bx(b.x1) - bx(b.x0) > 30) ctx.fillText(b.block, (bx(b.x0) + bx(b.x1)) / 2, TOP - 11);
          ctx.textBaseline = "middle";
          if (k > 0) {
            ctx.strokeStyle = "#8C8C8C";
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(Math.round(bx(b.x0)) + 0.5, TOP);
            ctx.lineTo(Math.round(bx(b.x0)) + 0.5, TOP + plotH);
            ctx.stroke();
            ctx.lineWidth = 1;
          }
        });
      }
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
        ramp(rx, 16, Math.min(120, (snvImg ? L.snvW : L.ecW) - 4), c.dark ? [[0, "#2a2a2a"], [1, "#f0f0f0"]] : [[0, SNV_REF_COLOR], [0.04, SNV_REF_COLOR], [0.05, `rgb(${SNV_ALT_TOP},${SNV_ALT_TOP},${SNV_ALT_TOP})`], [1, "#000000"]], [[0, "0"], [0.5, "0.5"], [1, "1"]], c.dark ? "Variant allele frequency" : "VAF (0 = ref reads, white; no reads = blue)");
      }
      if (cnGeo) {
        const stops = AMP_LEGEND.map((v, k) => [k / (AMP_LEGEND.length - 1), cnCss(v)]);
        const labs = AMP_LEGEND.map((v, k) => [k / (AMP_LEGEND.length - 1), `${v}`]);
        ramp(L.cnX, 16, Math.min(180, L.cnW * 0.4), stops, labs, "Copy number");
      }
      if (bars.length) {
        textRole(ctx, c, "label", "text");
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(copyMode === "heatmap" ? "Amplicon CN" : "Amplicon copies", L.barsX + (bars.length * (L.barW + GAP) - GAP) / 2, TOP - 18);
        textRole(ctx, c, "tick");
        ctx.textBaseline = "bottom";
        if (copyMode === "heatmap") {
          // legend ramp 0-100 under the title
          const lw = Math.min(120, bars.length * (L.barW + GAP) - GAP);
          const lx = L.barsX + (bars.length * (L.barW + GAP) - GAP - lw) / 2;
          for (let k = 0; k < 50; k += 1) {
            ctx.fillStyle = rgbHex(paperAmpCnRgb((k / 49) * PAPER_AMPCN_STOPS[PAPER_AMPCN_STOPS.length - 1]));
            ctx.fillRect(lx + (k * lw) / 50, TOP - 13, lw / 50 + 0.4, 6);
          }
          ctx.fillStyle = c.text;
          ctx.textBaseline = "middle";
          ctx.textAlign = "right";
          ctx.fillText("0", lx - 3, TOP - 10);
          ctx.textAlign = "left";
          ctx.fillText("100", lx + lw + 3, TOP - 10);
        } else bars.forEach((_, k) => {
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
          if (room > 30) ctx.fillText(fitText(ctx, nameOf(w), room), L.cnX - 4, y);
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
      if (ecImg) {
        // narrow column: two short lines
        ctx.fillText("ecDNA", L.ecX + L.ecW / 2, yb + 3);
        ctx.fillText(`SNVs (${ecSites.length})`, L.ecX + L.ecW / 2, yb + 17);
      }
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
      bars.forEach(({ col, w }, k) => {
        const x0 = L.barsX + k * (L.barW + GAP);
        ctx.save();
        ctx.translate(x0 + L.barW / 2, yb + 3);
        ctx.rotate(-Math.PI / 2);
        textRole(ctx, c, "label", "text");
        ctx.fillStyle = w ? colorOf(w.id) : c.text;
        ctx.font = ctx.font.replace(/^(\d+ )?/, col.parts.some((p) => p.id === focusWalk?.id) || w?.id === focusWalk?.id ? "700 " : "600 ");
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(fitText(ctx, col.label, barLabH - 6), 0, 0);
        ctx.restore();
      });
      ctx.textBaseline = "middle";
      return [];
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [TOP, width, plotH, treeLayout, r0, r1, n, nv, order, selected, nodePx, rh, showAnc, anc, lostBelow, nameOf, cellById, cloneColors, stateColors, cnCss, lostInkP, keepInkP, copyMode, L, snvImg, ecImg, cnImg, bars, barMax, barLabH, colorOf, hoverRow, cnGeo, focusWalk, chromoBins, geneMarks, cytobands, ecSites.length, tokensVersion]
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
        return k >= 0 && k < bars.length ? { kind: "column", b: bars[k] } : null;
      }
      return null;
    }
    if (y >= TOP + plotH) {
      const k = Math.floor((x - L.barsX) / (L.barW + GAP));
      return k >= 0 && k < bars.length && x >= L.barsX ? { kind: "column", b: bars[k] } : null;
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
      return [nameOf(h.w), ["Carriers", `${ncar} cells`], ["Nodes", (h.w.nodes || []).length], ["Click", "focus this variant and select its carriers"]];
    }
    if (h.kind === "column") {
      const ncar = h.b.sum.reduce((t, v) => t + (v >= 1 ? 1 : 0), 0);
      return [h.b.col.label, ["Amplicon", h.b.col.amp.label], ["Carriers", `${ncar} cells`], ["Stacked", h.b.col.parts.map((w) => nameOf(w)).join(", ") + (h.b.col.rest.length ? ` + ${h.b.col.rest.length} more (grey)` : "")], ["Click", "select its carriers and focus its main variant"]];
    }
    if (h.kind === "node") {
      const ids = leavesOf(h.nd);
      const p = anc?.p[h.i];
      return [`Clade of ${ids.length} cells`, ...(Number.isFinite(p) && focusWalk ? [[`${focusWalk.label || "variant"} present`, `${Math.round(100 * p)}%`]] : []), ["Click", "select the clade (Cmd adds)"], ["Double-click", "zoom to the clade"]];
    }
    if (h.kind === "site") {
      const rd = h.v.reads?.get(order[h.r]);
      return [h.v.id, [h.v.exported ? "Site" : "Gene", h.v.gene || "–"], ["Cell", order[h.r]], ...(rd ? [["Reads (ref / alt)", `${rd[0]} / ${rd[1]}`]] : []), ["Click", h.v.index >= 0 ? "open the SNV site" : "not in the SNV matrix"]];
    }
    const cell = cellById.get(h.id) || {};
    const lines = [h.id, ["Clone", cell.clone_id ?? "–"], ["State", cell.state ?? "–"]];
    bars.forEach(({ col, parts, sum }) => {
      if (!(sum[h.r] > 0)) return lines.push([col.label, "–"]);
      const bits = parts.filter((p) => p.v[h.r] > 0).map((p) => `${nameOf(p.w)} ${p.v[h.r].toFixed(0)}`);
      return lines.push([col.label, `${sum[h.r].toFixed(0)}${bits.length > 1 || (bits.length === 1 && parts[0].v[h.r] !== sum[h.r]) ? ` (${bits.join(", ")})` : ""}`]);
    });
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
  const familyOptions = families.map((f) => ({ label: f.map((w) => nameOf(w)).slice(0, 3).join(" · ") + (f.length > 3 ? ` +${f.length - 3}` : ""), options: f.map((w) => ({ value: w.id, label: `${nameOf(w)} (${order.filter((id) => (Number(w.cells?.[id]) || 0) >= 1).length} cells)` })) }));
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
      {amps.length > 0 && (
        <div className="sc-fig-amps">
          <Text type="secondary">Amplicons</Text>
          {ampOrder.map((k, i) => {
            const amp = amps.find((x) => x.key === k);
            const on = shownKeys.has(k);
            const toggle = () => {
              const next = new Set(shownKeys);
              if (on) next.delete(k);
              else next.add(k);
              if (next.size) setAmps(ampOrder, next);
            };
            const move = (d) => {
              const o = ampOrder.slice();
              const j = i + d;
              if (j < 0 || j >= o.length) return;
              [o[i], o[j]] = [o[j], o[i]];
              setAmps(o, shownKeys);
            };
            return (
              <span key={k} className={`sc-fig-amp${on ? " is-on" : ""}${amp.main ? " is-main" : ""}`}>
                <Tooltip title={`${amp.carriers} tumor cells (${Math.round(100 * amp.frac)}%) · median ${Math.round(amp.medianCn)} copies in carriers · ${amp.walks.length} walk${amp.walks.length === 1 ? "" : "s"}${amp.main ? " · main amplicon" : " · minor (below 15% of tumor cells or median 8 copies)"}`}>
                  <Checkbox checked={on} onChange={toggle}>
                    <span style={{ color: colorOf(amp.dominant.id), fontWeight: 600 }}>ec{amp.label}</span>
                    <span className="sc-fig-amp-n">{Math.round(100 * amp.frac)}%</span>
                  </Checkbox>
                </Tooltip>
                <Button size="small" type="text" disabled={i === 0} onClick={() => move(-1)} aria-label={`move ec${amp.label} left`}>‹</Button>
                <Button size="small" type="text" disabled={i === ampOrder.length - 1} onClick={() => move(1)} aria-label={`move ec${amp.label} right`}>›</Button>
              </span>
            );
          })}
        </div>
      )}
      <PanelHead letter="A" title="Clonal structure of the amplicons" fig={paperLetters?.label || "Fig 4B · 5D"} hint="hover a row for its cell · click or drag rows, or click a node, to select · scroll to zoom genome (heatmap) or rows (tree) · double-click a node for its clade (Fig 4D)" extra={
          <Space size={8}>
            <Segmented size="small" value={copyMode} onChange={setCopyMode} options={[{ value: "bars", label: "Copies as bars" }, { value: "heatmap", label: "Copies as heatmap" }]} />
            <SvgExportButton containerRef={figRef} name={`figure-4B-${patient}`} title="Export SVG (vector, publication size) or PNG" />
          </Space>
        } />
      <div ref={figRef}>
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
          else if (h.kind === "column") {
            if (h.b.w) onFocusWalk?.(h.b.w.id);
            select(order.filter((id, r) => h.b.sum[r] >= 1), `${h.b.col.label} carriers`, event);
          } else if (h.kind === "walk") {
            onFocusWalk?.(h.w.id);
            select(order.filter((id) => (Number(h.w.cells?.[id]) || 0) >= 1), `${nameOf(h.w)} carriers`, event);
          } else if (h.kind === "node") select(leavesOf(h.nd), `clade of ${h.nd.lastLeaf - h.nd.firstLeaf + 1} cells`, event);
          else if (h.kind === "site" && h.v.index >= 0) setSiteDrawer({ c: h.v.index, row: h.r });
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
      </div>
      <div className="sc-fig-keys">
        <span className="sc-fig-key">
          <b>Clade</b>
          {Object.entries(cloneColors).slice(0, 14).map(([k, col]) => (
            <span key={k}>
              <span className="sc-fig-swatch" style={{ background: col }} />
              {cloneLabel(k)}
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
            <b>{`${nameOf(focusWalk) || "variant"} status`}</b>
            <span><span className="sc-fig-swatch" style={{ background: keepInkP, borderRadius: 5 }} />present</span>
            <span><span className="sc-fig-swatch" style={{ background: lostInkP, borderRadius: 5 }} />lost (red lineage)</span>
            <span><span className="sc-fig-swatch" style={{ background: "transparent", border: `1.5px solid ${keepInkP}`, borderRadius: 6 }} />ringed: state changes here</span>
            <span>dot size = likelihood</span>
          </span>
        )}
        {!snvData && <span className="sc-fig-key">No SNV matrix for this patient: SNV panels left out.</span>}
      </div>
      {bars.some((b) => b.parts.length > 1 || b.rest.length) && (
        <div className="sc-fig-keys">
          {bars.map(({ col }) => (
            <span key={col.key} className="sc-fig-key">
              <b>{col.label}</b>
              {col.parts.map((w) => (
                <span key={w.id}>
                  <span className="sc-fig-swatch" style={{ background: colorOf(w.id) }} />
                  {nameOf(w)}
                </span>
              ))}
              {col.rest.length > 0 && (
                <span>
                  <span className="sc-fig-swatch" style={{ background: "#bfbfbf" }} />
                  {`${col.rest.length} more`}
                </span>
              )}
            </span>
          ))}
        </div>
      )}
      <div className="sc-fig-block">
        <PanelHead letter="B" title="Genome graph and walks" fig="Fig 4C · 4E" hint="the report's gene, walk, JaBbA graph and coverage tracks on A's windows, aligned to its heatmap · zoom the walk lanes (Ctrl/⌘ + wheel) to move A too" />
        <GenomeTracks
          width={width}
          cnX={L.cnX}
          cnW={L.cnW}
          walks={laneWalks}
          colorOf={colorOf}
          nameOf={nameOf}
          cells={trackCells}
          cellNote={trackCells.length ? `Cells: ${trackCells.map((c) => `${c.id} (${c.why})`).join(" · ")} — select 1–3 cells to show yours` : "Select 1–3 cells to show their genome graphs"}
          focusId={focusWalk?.id}
          onFocus={(id) => onFocusWalk?.(id)}
        />
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
 * focused variant's carriers) against the other tumor cells, both over the
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
  const tumor = useMemo(() => order.filter((id) => !isNormalClone(cellById.get(id)?.clone_id)), [order, cellById]);
  const sel = useMemo(() => sc.selectedCellIds || [], [sc.selectedCellIds]);
  const groupA = useMemo(() => (sel.length >= 3 ? sel : focusWalk ? tumor.filter((id) => (Number(focusWalk.cells?.[id]) || 0) >= 1) : []), [sel, focusWalk, tumor]);
  const groupB = useMemo(() => {
    const a = new Set(groupA);
    return tumor.filter((id) => !a.has(id));
  }, [groupA, tumor]);
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
    <>
      <PanelHead letter="C" title="Segment co-variation" fig="Fig 5C" hint={`${sel.length >= 3 ? "selected cells" : `${focusWalk?.label || "variant"} carriers`} (up) vs other tumor cells (down) · one triangle per window`} />
      <TriangleCorrelation order={order} cnById={cnById} domains={domains} groupA={groupA} groupB={groupB} labelA={sel.length >= 3 ? "Selected cells" : `${focusWalk?.label || "variant"} carriers`} labelB="Other tumor cells" walk={focusWalk} colorOf={colorOf} genes={genes} />
    </>
  );
}

/**
 * Fig 4 (right): copies per carrier of each main amplicon's variants (the
 * paper's groups where defined, e.g. BWH70 long / short EGFR and ecMAP3K1),
 * with rank-sum brackets against the focused one.
 */
export function PatientVariantCopies({ patient, focusWalkId, onFocusWalk, selected, onSelect }) {
  const { ready } = usePatientLoaded(patient);
  const { order, all, cellById, colorOf, focusWalk } = useFocusFamily(focusWalkId);
  const walks = useMemo(() => {
    const tumor = order.filter((id) => !isNormalClone(cellById.get(id)?.clone_id));
    const { nameOf, groups } = variantGrouping(patient, all);
    const out = [];
    mainAmplicons(all, tumor)
      .filter((x) => x.main)
      .forEach((amp) => {
        const ids = new Set(amp.walks.map((w) => w.id));
        const gs = groups.filter((g) => ids.has(g.anchorId));
        (gs.length ? gs.map((g) => all.find((w) => w.id === g.anchorId)) : [amp.dominant]).forEach((w) => w && out.push({ ...w, label: gs.length ? nameOf(w) : `ec${amp.label}` }));
      });
    return out;
  }, [patient, all, order, cellById]);
  if (!ready) return null;
  const focusId = walks.some((w) => w.id === focusWalk?.id) ? focusWalk.id : walks[0]?.id;
  return <VariantCopiesBox walks={walks} order={order} focusId={focusId} colorOf={colorOf} selected={selected} onSelect={onSelect} onFocus={onFocusWalk} />;
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
