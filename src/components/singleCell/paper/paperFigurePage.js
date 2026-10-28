import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { Button, Empty, Modal, Space, Switch, Tag, Tooltip, Typography } from "antd";
import { CompressOutlined, DownloadOutlined, ExpandOutlined, LeftOutlined, LinkOutlined, RightOutlined, ZoomInOutlined, ZoomOutOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import useCohortExport from "../cohort/useCohortExport";
import { PAPER_FIGURES_DIR, PAPER_MANIFEST_FILE, anchoredPanels, bestImage, formatBuilt, panelAt, panelRegions, panelTarget, parsePaperManifest, targetSearch } from "../../../helpers/singleCell/paperManifest";
import { announceCohortView, requestHelpTarget } from "../../../helpers/singleCell/helpNav";
import { PAPER_FIGURE_TABS } from "../../../helpers/singleCell/cohortViews";
import { counterText, navAction, neighbourKey } from "../../../helpers/singleCell/figureNav";
import { PanelModal, STATUS_TAG_COLOR, ZoomPanImage, targetLabel } from "./paperFiguresViewer";
import { casePath, tryGet } from "../../../redux/singleCell/loaders";
import CnZoomLayer from "./cnZoomLayer";
import GenomeTrackLayer from "./genomeTrackLayer";
import CellGraphLens from "./cellGraphLens";
import { createPopupController } from "../../../helpers/singleCell/hoverPopup";
import { focusWindows } from "../../../helpers/singleCell/paperCellGraph";
import SnvLensLayer, { loadSnvLookup } from "./snvLensLayer";
import { highlightRects, hitAt, markPositions, panelTables, parseSidecar, plotHitAt, rowBand, rowsBetween, selectionTable, sidecarExtras, tableTsv, toPage } from "../../../helpers/singleCell/paperSidecar";
import { applyPaperTokens, paperTokensVersion } from "../../../helpers/singleCell/paperPalette";
import { encodeGroups } from "../../../helpers/singleCell/savedGroups";
import { cellFromLabel, lensContains, lensToDisplay, lensIsHome, lensOn, lensPan, lensToPage, lensView, lensZoom, marksInBox, nearestJunction, pinchFactor, regionWindow } from "../../../helpers/singleCell/paperZoom";
import { controlKey, figureControls, liveCellsOnPlot, livePatients, zoomTarget } from "../../../helpers/singleCell/paperAxes";
import { STATE_SCORES_FILE, parseStateScores } from "../../../helpers/singleCell/paperPanels";
import { isPatientRecord, patientKeyOf } from "../../../helpers/singleCell/cellFiles";
import { ringBox } from "../../../helpers/singleCell/paperRing";
import PanelControls, { controlOverlays } from "./panelControls";
import FigureGeneCard from "./figureGeneCard";
import { useGeneSummaries } from "../geneInfoPopover";
import useGeneSpans from "../cohort/useGeneSpans";
import { geneAtPoint } from "../../../helpers/singleCell/paperGenes";
import { selectCells, selectedIds, selectionGroups, selectionText } from "../../../helpers/singleCell/paperSelection";
import { colIndexAt, graphInWindow, regionWindows, snvAt } from "../../../helpers/singleCell/paperZoom";
import { livePanel, livePanels, liveStart } from "../../../helpers/singleCell/paperLiveView";

const InteractiveSlot = React.lazy(() => import("./interactiveSlot"));
const PatientLiveView = React.lazy(() => import("./patientLiveView"));
const SelectionDrawer = React.lazy(() => import("./selectionDrawer"));
const PatientDrawer = React.lazy(() => import("./patientDrawer"));

const rowsets = (sidecar) => [...new Set((sidecar?.regions || []).filter((r) => r.kind === "rows").map((r) => r.rowset || r.id))];
/** Highlight rectangles of cell ids in every rows region, and ring positions of matching point marks. */
function linkedMarks(sidecar, ids) {
  if (!sidecar || !ids?.size) return { rects: [], rings: [] };
  const rects = rowsets(sidecar).flatMap((rs) => highlightRects(sidecar, rs, rs, ids));
  return { rects, rings: markPositions(sidecar, "cell", ids) };
}
const fmtVal = (v) => (typeof v === "number" ? (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100) : `${v}`);

/** gOS link that opens a patient's Single-Cell tab with these cells selected (saved group carried in the URL), optionally at a locus. */
export function cellsUrl(patient, cells, name, locus = null) {
  const p = new URLSearchParams(window.location.search);
  ["scview", "figmode", "figpanel", "figpatient", "scsel", "scgroups", "location"].forEach((k) => p.delete(k));
  p.set("report", patient);
  p.set("tab", "7");
  if (cells?.length) {
    p.set("scgroups", encodeGroups({ [patient]: [{ name, cells }] }));
    p.set("scsel", name);
  }
  if (locus) p.set("location", `${locus.chr}:${locus.from}-${locus.chr}:${locus.to}`);
  return `${window.location.pathname}?${p.toString()}`;
}

const download = (text, name) => {
  const url = URL.createObjectURL(new Blob([text], { type: "text/tab-separated-values;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const { Text } = Typography;
const PT_PX = 96 / 72;

/** The synced paper-figures manifest of the current dataset: { status, manifest }. */
export function usePaperManifest() {
  const dataset = useSelector((s) => s.Settings?.dataset);
  const base = dataset?.dataPath ? `${dataset.dataPath}_cohort/${PAPER_FIGURES_DIR}/` : "";
  const ex = useCohortExport(dataset?.dataPath ? dataset : null, PAPER_MANIFEST_FILE);
  const manifest = useMemo(() => parsePaperManifest(ex.data, base), [ex.data, base]);
  return { status: ex.status, manifest };
}

/** Open a panel's interactive counterpart from anywhere in the cohort pages. */
export function openPaperTarget(target) {
  const search = targetSearch(target, window.location.search);
  if (target.kind === "tab") {
    window.location.assign(`${window.location.pathname}${search}`);
    return;
  }
  window.history.replaceState(null, "", `${window.location.pathname}${search}`);
  const view = target.kind === "interactive" ? "figures" : target.scview;
  announceCohortView(view);
  requestHelpTarget({ scope: "cohort", view });
}

/** Genome-graph tracks of a figure: one per cell, from genome-axis regions that name a cell (label) or carry a few cell rows. */
function genomeTracks(sidecar) {
  const out = [];
  (sidecar?.regions || []).forEach((r) => {
    if (r.axis?.type !== "genome") return;
    if (r.rows?.length && r.rows.length <= 5) {
      r.rows.forEach((cell, i) => {
        const b = rowBand(r, i);
        out.push({ id: `${r.id}:${i}`, cell, patient: r.patient, panel: r.panel, region: r, rect: { x: r.x, y: b.y0, w: r.w, h: b.y1 - b.y0 } });
      });
      return;
    }
    const cell = cellFromLabel(r.label);
    if (cell) out.push({ id: r.id, cell, patient: r.patient, panel: r.panel, region: r, rect: { x: r.x, y: r.y, w: r.w, h: r.h } });
  });
  return out;
}
const inRect = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/**
 * One manuscript figure as its own page, exactly as in the PDF (every panel at its PDF position, the exact SVG),
 * with an interactive layer on top:
 * - zoom any panel in place (wheel, +/-, drag to pan, double-click to reset): the vector figure redrawn sharp inside
 *   the panel, hit regions follow; CN heatmaps re-render from the 100 kb bins; genome-graph tracks (per-cell JaBbA
 *   graph + coverage) re-render live for the zoomed window down to single junctions;
 * - hover: cell rows, points, tiles, tracks (cell, clade, locus, junction CN);
 * - select cells (click toggles, shift / drag adds, box-drag over plots), across panels and patients, with a
 *   selection bar (open in each patient, cells drawer, TSV);
 * - walks of the figure (chips) select their carriers; drawers for patients and panel data tables.
 * label: "Fig 4" (manifest figure label).
 */
export default function PaperFigurePage({ label }) {
  const { status, manifest } = usePaperManifest();
  const fig = manifest?.figures.find((f) => f.label === label) || null;
  const [ref, measured] = useContainerWidth(1100);
  const [hover, setHover] = useState(null);
  const [focusPanel, setFocusPanel] = useState(null); // panel letter whose toolbar group is hovered
  const [tip, setTip] = useState(null);
  const [open, setOpen] = useState(null);
  const [zoom, setZoom] = useState(false);
  // live patient view of a panel (the patient's own gOS components, inline under the controls): { panel, patient } | null
  const [liveView, setLiveView] = useState(null);
  const liveRef = useRef(null);
  const anchors = useMemo(() => anchoredPanels(fig), [fig]);
  const regions = useMemo(() => (fig?.widthPt ? panelRegions(anchors, fig.widthPt, fig.heightPt) : []), [anchors, fig]);
  const [imgReady, setImgReady] = useState(false);
  useEffect(() => setImgReady(false), [fig?.id]);
  const [sidecar, setSidecar] = useState(null);
  useEffect(() => {
    setSidecar(null);
    if (!fig?.interactive || !imgReady) return undefined;
    let live = true;
    tryGet(fig.interactive).then((r) => live && setSidecar(r.status === "ok" ? parseSidecar(r.data) : null));
    return () => {
      live = false;
    };
  }, [fig?.interactive, imgReady]);
  const [tokens, setTokens] = useState("loading");
  useEffect(() => {
    if (!manifest) return undefined;
    if (!manifest.styleTokens) {
      setTokens("none");
      return undefined;
    }
    let live = true;
    tryGet(manifest.styleTokens).then((r) => live && setTokens(r.status === "ok" && applyPaperTokens(r.data) ? `v${paperTokensVersion()}` : "none"));
    return () => {
      live = false;
    };
  }, [manifest]);
  const [hit, setHit] = useState(null);
  // gene cards: any gene symbol found in the sidecar (mark gene field, axis label) opens the gene card; genome tracks resolve genes via gene_spans when "Genes on tracks" is on
  const geneSummaries = useGeneSummaries();
  const { spans: geneSpans } = useGeneSpans();
  const [geneCard, setGeneCard] = useState(null); // { gene, genes, anchor: { x, y } | null }
  const [geneGenome, setGeneGenome] = useState(false);
  const [geneHover, setGeneHover] = useState(null);
  const isGene = useMemo(() => (geneSummaries.map ? (sym) => geneSummaries.map.has(sym) : null), [geneSummaries.map]);
  useEffect(() => {
    // deep link: ?figgene=EGFR opens that gene's card
    if (!geneSummaries.map) return;
    let sym = null;
    try {
      sym = new URLSearchParams(window.location.search).get("figgene");
    } catch (e) {
      sym = null;
    }
    if (sym && geneSummaries.map.has(sym)) setGeneCard((cur) => cur || { gene: sym, genes: [sym], anchor: null });
  }, [geneSummaries.map]);
  const [plotHit, setPlotHit] = useState(null);
  const [trackHit, setTrackHit] = useState(null);
  const [patientOpen, setPatientOpen] = useState(null);
  const [sel, setSel] = useState(null); // paperSelection: { byPatient, label }
  const [cellsOpen, setCellsOpen] = useState(null); // patient whose cells drawer is open
  const drag = useRef(null); // { kind: "rows" | "box" | "pan" | "pinch", ... }
  const pointers = useRef(new Map()); // active pointers (display px), for two-finger pinch zoom
  const [brushBox, setBrushBox] = useState(null);
  const [cnZoom, setCnZoom] = useState({});
  const [lens, setLens] = useState(null); // panel zoom: paperZoom lens + letter
  const graphs = useRef(new Map()); // cell -> JaBbA graph (hover junctions)
  // the cell whose full genome graph is open under its row / track: { cell, patient, regionId, trackId, row }
  const [graphFocus, setGraphFocus] = useState(null);
  // hover lifecycle (shared helper): opens on hover, closes on leaving row + dock (grace delay), Escape, scroll, click elsewhere; pinned only by the pin button
  const popupCtl = useRef(null);
  if (!popupCtl.current) popupCtl.current = createPopupController({ onChange: (st) => setGraphFocus(st ? { ...st.data, pinned: st.pinned } : null) });
  const focusOn = (f) => popupCtl.current.hoverRegion(`${f.cell}|${f.regionId}|${f.trackId || ""}`, f);
  const clearHover = () => {
    setHit(null);
    setTrackHit(null);
    setPlotHit(null);
    setHover(null);
    setTip(null);
    setGeneHover(null);
  };
  const clearHoverRef = useRef(clearHover);
  clearHoverRef.current = clearHover;
  useEffect(() => {
    const ctl = popupCtl.current;
    const inDock = (t) => !!(t && t.closest && t.closest(".sc-cellgraph-dock"));
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      ctl.escape();
      clearHoverRef.current();
    };
    const onScroll = (e) => {
      if (inDock(e.target)) return;
      ctl.scroll();
      clearHoverRef.current();
    };
    const onDown = (e) => {
      if (!inDock(e.target)) ctl.clickOutside();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("scroll", onScroll, true);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      ctl.dispose();
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, []);
  const [snv, setSnv] = useState({}); // patient -> SNV lookup (SNV heatmaps with site ids), loaded on first zoom / hover
  const wantSnv = (patient) => {
    if (!patient || snv[patient] !== undefined) return;
    setSnv((m) => ({ ...m, [patient]: null }));
    loadSnvLookup(dataset, patient).then((L) => setSnv((m) => ({ ...m, [patient]: L || false })));
  };
  const [, setGraphTick] = useState(0);
  useEffect(() => {
    setSel(null);
    setCnZoom({});
    setLens(null);
    setPatientOpen(null);
    popupCtl.current.close();
  }, [label]);
  const extras = useMemo(() => (sidecar ? sidecarExtras(sidecar, sidecar.data?.walk_names?.patient || sidecar.data?.ecdna_snvs?.patient) : {}), [sidecar]);
  const walkPatient = sidecar?.data?.walk_names?.patient || null;
  const dataset = useSelector((s) => s.Settings?.dataset);
  const datafiles = useSelector((s) => s.CaseReports.datafiles);
  const cloneOf = useMemo(() => new Map((datafiles || []).filter((r) => r.entry_type === "cell").map((r) => [`${r.pair || r.caseReportId}`, r.clone_id])), [datafiles]);
  const [walks, setWalks] = useState(null);
  useEffect(() => {
    setWalks(null);
    if (!walkPatient || !dataset?.dataPath) return undefined;
    let live = true;
    tryGet(casePath(dataset, walkPatient, "walks.json")).then((r) => live && setWalks(r.status === "ok" ? r.data?.walks || [] : null));
    return () => {
      live = false;
    };
  }, [walkPatient, dataset]);
  const tracks = useMemo(() => genomeTracks(sidecar), [sidecar]);
  // in-figure controls (patient / gene / clade choices), state by control key
  const controls = useMemo(() => figureControls(sidecar, fig?.id), [sidecar, fig?.id]);
  const [ctrlVals, setCtrlVals] = useState({});
  useEffect(() => setCtrlVals({}), [label]);
  const wantState = controls.some((c) => c.source === "state_scores");
  const stateEx = useCohortExport(wantState && dataset?.dataPath ? dataset : null, STATE_SCORES_FILE);
  const statePoints = useMemo(() => parseStateScores(stateEx.data) || [], [stateEx.data]);
  const patientChoices = useMemo(() => {
    const fromData = (datafiles || []).filter(isPatientRecord).map((r) => `${patientKeyOf(r)}`);
    const fromSidecar = (sidecar?.regions || []).map((r) => r.patient).filter(Boolean);
    return [...new Set([...fromData, ...fromSidecar])].sort();
  }, [datafiles, sidecar]);
  const optionsOf = (c) => {
    if (c.source === "state_scores") return livePatients(statePoints).map((p) => ({ value: p.patient, label: `${p.patient} (${p.count} cells)` }));
    if (c.type === "patient-view") return (c.options || patientChoices).map((o) => ({ value: o, label: o }));
    return (c.options || []).map((o) => ({ value: o, label: o }));
  };
  // the live state-score control: the chosen patient's cells matched to the static plot's points
  const stateCtl = controls.find((c) => c.source === "state_scores");
  const stateVal = stateCtl ? ctrlVals[controlKey(stateCtl)] : null;
  const live = useMemo(() => {
    if (!stateCtl) return null;
    const region = (sidecar?.regions || []).find((r) => r.kind === "plot" && `${r.panel}`.toLowerCase() === stateCtl.panel.toLowerCase() && r.marks.some((m) => m.type === "points"));
    if (!region || !stateVal) return { status: stateEx.status, region, cells: [] };
    if (stateEx.status !== "ok") return { status: stateEx.status, region, cells: [] };
    const m = liveCellsOnPlot(region, statePoints, stateVal);
    return { status: "ok", region, cells: m.cells, matched: m.matched, total: m.total };
  }, [stateCtl, stateVal, stateEx.status, statePoints, sidecar]);
  const panelBox = useMemo(() => new Map(regions.map((b) => [`${b.letter}`.toLowerCase(), b])), [regions]);
  const sheetRef = useRef(null);
  const chromoBins = useSelector((s) => s.Settings?.chromoBins);
  const liveList = useMemo(() => livePanels(sidecar), [sidecar]);
  useEffect(() => setLiveView(null), [label]);
  // open a patient's live view for a panel (or the first panel printed from that patient); the panel's switcher shows the choice
  const openLive = (patient, panel = null) => {
    if (!patient) return;
    const p = (panel && livePanel(liveList, panel)) || liveList.find((x) => x.patient === `${patient}`) || liveList[0] || null;
    const letter = p?.panel || panel || "";
    setLiveView({ panel: letter, patient: `${patient}` });
    setCtrlVals((m) => ({ ...m, [`${letter}|patient-view`]: `${patient}` }));
    setTimeout(() => liveRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  };
  const liveSpec = liveView ? livePanel(liveList, liveView.panel) : null;
  const liveOpen = liveView ? liveStart(liveSpec, liveView.patient, chromoBins) : null;
  const kRef = useRef(1);
  const lensRef = useRef(null);
  lensRef.current = lens;
  // left / right arrows (and the < > buttons) cycle through the paper figures in manifest order, wrapping; the URL follows (scview)
  const navKeys = useMemo(() => PAPER_FIGURE_TABS.map((n) => `paperfig${n}`), []);
  const curKey = label ? `paperfig${`${label}`.replace(/^Fig /, "")}` : null;
  const blocked = !!(lens || liveView || open || zoom);
  const goFigure = useCallback(
    (delta) => {
      const next = neighbourKey(navKeys, curKey, delta);
      if (!next) return;
      const p = new URLSearchParams(window.location.search);
      p.set("scview", next);
      window.history.pushState(null, "", `${window.location.pathname}?${p.toString()}`);
      announceCohortView(next);
      requestHelpTarget({ scope: "cohort", view: next });
    },
    [navKeys, curKey]
  );
  const navRef = useRef({});
  navRef.current = { goFigure, blocked };
  useEffect(() => {
    const onKey = (e) => {
      const a = navAction(e, { blocked: navRef.current.blocked });
      if (a === "prev" || a === "next") {
        e.preventDefault();
        navRef.current.goFigure(a === "next" ? 1 : -1);
      }
    };
    const onPop = () => {
      const v = new URLSearchParams(window.location.search).get("scview");
      if (v && /^paperfig/.test(v)) {
        announceCohortView(v);
        requestHelpTarget({ scope: "cohort", view: v });
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPop);
    };
  }, []);
  // display px (sheet-relative) -> page pt, through the lens when the pointer is inside it
  const toPt = useCallback((px, py) => {
    const l = lensRef.current;
    const k = kRef.current;
    if (l && lensContains(l, k, px, py)) return lensToPage(l, k, px, py);
    return [px / k, py / k];
  }, []);
  const zoomRegionAt = (x, y) => sidecar?.regions.find((r) => r.kind === "rows" && r.axis?.type === "genome" && r.rows?.length > 5 && r.patient && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  const panelRectAt = (x, y) => {
    const p = panelAt(anchors, x, y);
    const b = p ? regions.find((q) => q.letter === p.letter) : null;
    return b ? { letter: b.letter, rect: { x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0 } } : null;
  };
  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      const [x, y] = toPt(px, py);
      const reg = zoomRegionAt(x, y);
      if (reg && !lensRef.current) {
        // CN heatmap: data zoom (the layer handles further wheel events)
        e.preventDefault();
        setCnZoom((z) => (z[reg.id] ? z : { ...z, [reg.id]: true }));
        return;
      }
      const k = kRef.current;
      const f = Math.exp(-e.deltaY * 0.0018);
      const cur = lensRef.current;
      if (cur && lensContains(cur, k, px, py)) {
        e.preventDefault();
        const next = lensZoom(cur, k, f, px, py);
        setLens(lensIsHome(next) ? null : { ...next, letter: cur.letter });
        return;
      }
      if (f <= 1) return; // zooming out outside a lens: let the page scroll
      const pr = panelRectAt(x, y);
      if (!pr) return;
      const zt = zoomTarget(sidecar, x, y, pr.rect); // the zoom axis of the region under the pointer (matrices / genome: columns only)
      if (!zt) return;
      e.preventDefault();
      setLens({ ...lensZoom(lensOn(zt.rect, zt.mode), k, f, px, py), letter: pr.letter });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [sidecar, anchors, regions]); // eslint-disable-line react-hooks/exhaustive-deps
  if (status === "loading") return <Text type="secondary">Loading the paper figures…</Text>;
  if (!manifest) return <Empty description="not available (paper figures not synced: srctools inst/paper_figures/sync_gos.sh)" />;
  if (!fig) return <Empty description={`not available (${label} is not in the synced figures)`} />;
  const natW = (fig.widthPt || 600) * PT_PX;
  const width = Math.max(320, Math.min(measured, Math.round(natW * 1.9)));
  const k = width / (fig.widthPt || 600);
  kRef.current = k;
  const height = (fig.heightPt || 600) * k;
  const at = (e) => {
    const r = sheetRef.current.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    const [x, y] = toPt(px, py);
    return [x, y, px, py];
  };
  const region = hover ? regions.find((b) => b.letter === hover.letter) : focusPanel ? regions.find((b) => `${b.letter}`.toLowerCase() === focusPanel) : null;
  const ids = selectedIds(sel);
  const select = (cells, patient, lbl, e) => setSel((cur) => selectCells(cur, cells, patient, { add: !!e?.shiftKey, toggle: !e?.shiftKey && cells.length === 1 && selectedIds(cur).has(`${cells[0]}`), label: lbl }));
  const zoomWin = (id) => (cnZoom[id] && cnZoom[id] !== true ? cnZoom[id] : null);
  const hitPos = (h, x) => {
    if (!h?.region.axis || h.region.axis.type !== "genome") return h?.position || null;
    const w = zoomWin(h.region.id);
    if (!w) return h.position;
    const t = (x - h.region.x) / h.region.w;
    return { chr: `${h.region.axis.chr}`, pos: Math.round(w.from + t * (w.to - w.from)) };
  };
  const geneAt = (x, y) => geneAtPoint(sidecar, x, y, { isGene, spans: geneSpans, genome: geneGenome, zoomWin: (r) => zoomWin(r.id) });
  const trackAt = (x, y) => tracks.find((t) => inRect(t.rect, x, y)) || null;
  const trackInfo = (t, x) => {
    const pos = regionWindow(t.region, x, x);
    const g = graphs.current.get(t.cell);
    const tolBp = (Math.abs(Number(t.region.axis.to) - Number(t.region.axis.from)) / (t.region.w * k * (lens ? lens.sx : 1))) * 6;
    const j = g ? nearestJunction(graphInWindow(g, { chr: pos.chr, from: pos.from - tolBp, to: pos.from + tolBp }).juncs, pos.chr, pos.from, tolBp) : null;
    return { track: t, pos, junction: j };
  };
  // overlays drawn at scales kx, ky (k on the page; k * sx, k * sy inside the lens)
  const overlays = (kx, ky, keyp) => {
    const out = [];
    if (sel) {
      const lm = linkedMarks(sidecar, ids);
      lm.rects.forEach((r, i) => out.push(<div key={`${keyp}s${i}`} className="sc-paperpage-sel" style={{ left: r.x * kx, top: r.y * ky, width: r.w * kx, height: Math.max(1.5, r.h * ky) }} />));
      lm.rings.forEach(([x, y], i) => out.push(<div key={`${keyp}sr${i}`} className="sc-paperpage-ring is-sel" style={ringBox([x, y], kx, ky)} />));
      tracks.filter((t) => ids.has(t.cell)).forEach((t) => out.push(<div key={`${keyp}st${t.id}`} className="sc-paperpage-sel" style={{ left: t.rect.x * kx, top: t.rect.y * ky, width: t.rect.w * kx, height: t.rect.h * ky, background: "transparent" }} />));
    }
    if (hit) linkedMarks(sidecar, new Set([hit.id])).rects.forEach((r, i) => out.push(<div key={`${keyp}h${i}`} className="sc-paperpage-hover" style={{ left: r.x * kx, top: r.y * ky, width: r.w * kx, height: Math.max(2, r.h * ky) }} />));
    if (plotHit?.page) out.push(<div key={`${keyp}pr`} className="sc-paperpage-ring" style={ringBox(plotHit.page, kx, ky)} />);
    if (plotHit?.rect) out.push(<div key={`${keyp}pt`} className="sc-paperpage-hover" style={{ left: plotHit.rect.x * kx, top: plotHit.rect.y * ky, width: Math.max(2, plotHit.rect.w * kx), height: Math.max(2, plotHit.rect.h * ky), background: "transparent", outline: "2px solid #1677ff" }} />);
    if (trackHit) {
      const t = trackHit.track;
      out.push(<div key={`${keyp}tr`} className="sc-paperpage-hover" style={{ left: t.rect.x * kx, top: t.rect.y * ky, width: t.rect.w * kx, height: t.rect.h * ky, background: "transparent", outline: "1.5px solid #1677ff" }} />);
    }
    controlOverlays({ controls, values: ctrlVals, sidecar, live, kx, ky, keyp }).forEach((el) => out.push(el));
    if (brushBox) out.push(<div key={`${keyp}bb`} className="sc-paperpage-brush" style={{ left: brushBox.x * kx, top: brushBox.y0 * ky, width: brushBox.w * kx, height: (brushBox.y1 - brushBox.y0) * ky }} />);
    if (sidecar)
      Object.keys(cnZoom).forEach((id) => {
        const reg = sidecar.regions.find((r) => r.id === id);
        if (!reg) return;
        out.push(
          <CnZoomLayer
            key={`${keyp}z${id}`}
            region={reg}
            k={kx}
            win={zoomWin(id)}
            onWindow={(w) => setCnZoom((z) => ({ ...z, [id]: w }))}
            onClose={() =>
              setCnZoom((z) => {
                const n = { ...z };
                delete n[id];
                return n;
              })
            }
          />
        );
      });
    return out;
  };
  // live genome tracks inside the lens (drawn in lens display px, only past the PDF's own detail)
  const lensTracks = () => {
    if (!lens || lens.s < 1.6) return null;
    const v = lensView(lens);
    return tracks
      .filter((t) => t.rect.x < v.x1 && t.rect.x + t.rect.w > v.x0 && t.rect.y < v.y1 && t.rect.y + t.rect.h > v.y0)
      .flatMap((t) => {
        const y0 = Math.max(t.rect.y, v.y0);
        const y1 = Math.min(t.rect.y + t.rect.h, v.y1);
        const sx = k * lens.sx;
        const sy = k * lens.sy;
        // one live track per visible axis window (broken axes: chr2 | chr12 ...)
        return regionWindows(t.region, Math.max(t.rect.x, v.x0), Math.min(t.rect.x + t.rect.w, v.x1)).map((w, wi) => (
          <GenomeTrackLayer
            key={`gt${t.id}:${wi}`}
            cell={t.cell}
            box={{ left: (w.x0 - lens.ox) * sx, top: (y0 - lens.oy) * sy, width: (w.x1 - w.x0) * sx, height: (y1 - y0) * sy }}
            win={{ chr: w.chr, from: w.from, to: w.to }}
            onGraph={(c, g) => {
              if (!graphs.current.has(c)) {
                graphs.current.set(c, g);
                setGraphTick((n) => n + 1);
              }
            }}
          />
        ));
      });
  };
  const lensSnv = () => {
    if (!lens || lens.s < 1.6 || !sidecar) return null;
    const v = lensView(lens);
    return sidecar.regions
      .filter((r) => r.kind === "rows" && r.cols?.ids?.length && r.patient && r.x < v.x1 && r.x + r.w > v.x0 && r.y < v.y1 && r.y + r.h > v.y0)
      .map((r) => {
        const L = snv[r.patient];
        if (L === undefined) setTimeout(() => wantSnv(r.patient), 0);
        if (!L) return null;
        const nC = r.cols.ids.length;
        const nR = r.rows.length;
        const c0 = Math.max(0, Math.floor(((Math.max(r.x, v.x0) - r.x) / r.w) * nC));
        const c1 = Math.min(nC, Math.ceil(((Math.min(r.x + r.w, v.x1) - r.x) / r.w) * nC));
        const q0 = Math.max(0, Math.floor(((Math.max(r.y, v.y0) - r.y) / r.h) * nR));
        const q1 = Math.min(nR, Math.ceil(((Math.min(r.y + r.h, v.y1) - r.y) / r.h) * nR));
        const sx = k * lens.sx;
        const sy = k * lens.sy;
        const x0 = r.x + (c0 / nC) * r.w;
        const x1 = r.x + (c1 / nC) * r.w;
        const y0 = r.y + (q0 / nR) * r.h;
        const y1 = r.y + (q1 / nR) * r.h;
        return <SnvLensLayer key={`sv${r.id}`} region={r} lookup={L} r0={q0} r1={q1} c0={c0} c1={c1} box={{ left: (x0 - lens.ox) * sx, top: (y0 - lens.oy) * sy, width: (x1 - x0) * sx, height: (y1 - y0) * sy }} />;
      });
  };
  // the focused cell's full gOS genome graph, docked under its row / track, on the window the zoom shows
  const graphDock = () => {
    if (!graphFocus || !sidecar) return null;
    const t = graphFocus.trackId ? tracks.find((q) => q.id === graphFocus.trackId) : null;
    const region = t ? t.region : sidecar.regions.find((r) => r.id === graphFocus.regionId);
    if (!region) return null;
    const rect = t ? t.rect : (() => { const b = rowBand(region, Math.max(0, graphFocus.row || 0)); return { x: region.x, y: b.y0, w: region.w, h: b.y1 - b.y0 }; })();
    const wz = !t && zoomWin(region.id);
    const wins = focusWindows(region, { zoom: wz || (cnZoom[region.id] && !lens ? { from: Number(region.axis.from), to: Number(region.axis.to) } : null), view: lens && lens.s >= 1.6 ? lensView(lens) : null, rect });
    if (!wins) return null;
    const bottom = rect.y + rect.h;
    const inLens = !wz && lens && lensContains(lens, k, region.x * k + 1, bottom * k);
    const below = inLens ? Math.min(lensToDisplay(lens, k, rect.x, bottom)[1], (lens.rect.y + lens.rect.h) * k) : bottom * k;
    // tracks: dock above the track so the other example tracks stay reachable; heatmap rows: under the row
    const DOCK_H = 316;
    const above = t ? (inLens ? Math.max(lensToDisplay(lens, k, rect.x, rect.y)[1], lens.rect.y * k) : rect.y * k) - DOCK_H - 4 : -1;
    const top = above >= 0 ? above : below;
    const w = Math.min(width, Math.max(620, region.w * k));
    const left = Math.max(0, Math.min(region.x * k, width - w));
    const href = cellsUrl(graphFocus.patient, [graphFocus.cell], graphFocus.cell, wins[0]);
    return (
      <div
        className="sc-cellgraph-dock"
        style={{ position: "absolute", left, top: top + 2, zIndex: 9 }}
        onPointerEnter={() => {
          popupCtl.current.enterPopup();
          clearHover();
        }}
        onPointerLeave={() => popupCtl.current.leavePopup()}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerMove={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <CellGraphLens cell={graphFocus.cell} patient={graphFocus.patient} wins={wins} width={w} height={280} href={href} pinned={!!graphFocus.pinned} onPin={() => (graphFocus.pinned ? popupCtl.current.unpin() : popupCtl.current.pin())} onClose={() => popupCtl.current.close()} />
      </div>
    );
  };
  const lensBox = lens ? { left: lens.rect.x * k, top: lens.rect.y * k, width: lens.rect.w * k, height: lens.rect.h * k } : null;
  const groups = selectionGroups(sel);
  // tooltip next to the cursor; flips above it when it would run past the bottom of the window (estimated 170 px tall)
  const sheetTop = sheetRef.current ? sheetRef.current.getBoundingClientRect().top : 0;
  const tipAbove = typeof window !== "undefined" && sheetTop + (tip?.py || 0) + 14 + 170 > window.innerHeight && sheetTop + (tip?.py || 0) - 14 - 170 > 0;
  const tooltipStyle = { position: "absolute", left: Math.min((tip?.px || 0) + 14, width - 280), top: (tip?.py || 0) + (tipAbove ? -14 : 14), transform: tipAbove ? "translateY(-100%)" : undefined, maxWidth: 300, pointerEvents: "none", zIndex: 8 };
  return (
    <div ref={ref} className="sc-paperpage">
      <div className="sc-paper-bar">
        <div className="sc-paper-title" style={{ marginBottom: 0 }}>
          <b>{fig.label}</b> {fig.title}
        </div>
        <Space size={10} wrap>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {`Built ${formatBuilt(fig.built)} · synced ${formatBuilt(manifest.synced)}${manifest.srctools?.sha ? ` · srctools ${manifest.srctools.sha}` : ""} · scroll over a panel to zoom it`}
          </Text>
          <Space.Compact size="small">
            <Tooltip title="Previous figure (left arrow)">
              <Button size="small" icon={<LeftOutlined />} aria-label="Previous figure" onClick={() => goFigure(-1)} />
            </Tooltip>
            <Button size="small" disabled style={{ color: "inherit", cursor: "default" }}>{counterText(navKeys, curKey)}</Button>
            <Tooltip title="Next figure (right arrow)">
              <Button size="small" icon={<RightOutlined />} aria-label="Next figure" onClick={() => goFigure(1)} />
            </Tooltip>
          </Space.Compact>
          <Tooltip title="Genes in the figure open a gene card on click (marks and axis labels). With this on, a click on a genome track opens the card of the gene under the cursor (GENCODE v32 coordinates) instead of selecting the cell.">
            <span style={{ fontSize: 12 }}>
              <Switch size="small" checked={geneGenome} onChange={setGeneGenome} disabled={!geneSpans} aria-label="Genes on genome tracks" />
              {` Genes on tracks${geneSpans ? "" : " (not available: gene_spans.json)"}`}
            </span>
          </Tooltip>
          <Button size="small" icon={<ExpandOutlined />} onClick={() => setZoom(true)}>
            Zoom
          </Button>
          {fig.pdf && (
            <Button size="small" icon={<DownloadOutlined />} href={fig.pdf} target="_blank" rel="noopener noreferrer">
              PDF
            </Button>
          )}
        </Space>
      </div>
      {extras.walkNames && walks && (
        <div className="sc-paperpage-walks">
          <Text type="secondary" style={{ fontSize: 12 }}>{`${walkPatient} walks: `}</Text>
          {Object.entries(extras.walkNames).map(([lab, name]) => {
            const w = walks.find((x) => `${x.label}` === lab);
            if (!w) return null;
            const carriers = Object.entries(w.cells || {})
              .filter(([, v]) => (Number(v) || 0) >= 1)
              .map(([c]) => c);
            const on = sel?.label === name;
            return (
              <Tag.CheckableTag key={lab} checked={on} onChange={() => setSel(on ? null : selectCells(null, carriers, walkPatient, { label: name }))} style={{ borderColor: extras.walkColors?.[lab], color: on ? undefined : extras.walkColors?.[lab] }}>
                {`${name} (${carriers.length})`}
              </Tag.CheckableTag>
            );
          })}
        </div>
      )}
      {(sel || tracks.length > 0) && (
        <div className="sc-paperpage-selbar">
          {sel ? (
            <>
              <b>{selectionText(sel)}</b>
              {sel.label && <Text type="secondary">{` · ${sel.label}`}</Text>}
              {groups.map((g) =>
                g.patient ? (
                  <Button key={`o${g.patient}`} size="small" type="primary" href={cellsUrl(g.patient, g.ids, `${fig.label} selection`)} target="_blank" rel="noopener noreferrer">
                    {`Open in ${g.patient}`}
                  </Button>
                ) : null
              )}
              {groups.map((g) => (
                <Button key={`c${g.patient}`} size="small" onClick={() => setCellsOpen(g.patient || "")}>
                  {`Cells${groups.length > 1 ? ` (${g.patient || "?"})` : ""}`}
                </Button>
              ))}
              <Button
                size="small"
                icon={<DownloadOutlined />}
                onClick={() => {
                  const t = selectionTable(sidecar, [...ids], (id) => ({ clone_id: cloneOf.get(`${id}`) }), (c) => c?.clone_id ?? null);
                  const patientOf = new Map(groups.flatMap((g) => g.ids.map((id) => [id, g.patient || ""])));
                  download(tableTsv({ columns: ["patient", ...t.columns], rows: t.rows.map((r) => [patientOf.get(r[0]) || "", ...r]) }), `${fig.id}_selection.tsv`);
                }}
              >
                TSV
              </Button>
              <Button size="small" onClick={() => setSel(null)}>
                Clear
              </Button>
            </>
          ) : (
            <Text type="secondary">Click cells, rows or tracks to select them (shift or drag adds); the selection opens in the patient.</Text>
          )}
          {tracks.length > 0 && (
            <Button size="small" onClick={() => tracks.forEach((t, i) => setSel((cur) => selectCells(i === 0 ? null : cur, [t.cell], t.patient, { add: i > 0, label: "example cells" })))}>
              {`Select the ${new Set(tracks.map((t) => t.cell)).size} example cells`}
            </Button>
          )}
        </div>
      )}
      {controls.length > 0 && (
        <PanelControls
          controls={controls}
          values={ctrlVals}
          label={fig.label}
          live={live}
          optionsOf={optionsOf}
          onFocusPanel={setFocusPanel}
          onChange={(c, v) => (c.type === "patient-view" ? openLive(v, c.panel) : setCtrlVals((m) => ({ ...m, [controlKey(c)]: v })))}
          liveOf={(c) => (liveView && `${liveView.panel}`.toLowerCase() === `${c.panel}`.toLowerCase() ? liveView.patient : null)}
          onCloseLive={() => setLiveView(null)}
          onClear={(c) => setCtrlVals((m) => ({ ...m, [controlKey(c)]: null }))}
          onSelectCells={(cells, patient, lbl) => setSel(selectCells(null, cells.map((c) => c.cell), patient, { label: lbl }))}
        />
      )}
      {liveOpen && (
        <div ref={liveRef} className="sc-paperlive" data-testid="paper-live-view">
          <div className="sc-paperlive-head">
            <b>{`${fig.label}${`${liveView.panel}`.toLowerCase()} · ${liveOpen.patient} · live`}</b>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {liveOpen.kind === "ecdna"
                ? " the patient's ecDNA figure (tree, SNVs, copy number, walk copies) from the same gOS components as the patient pages"
                : ` the patient's Single-Cell view (same components as its Single-Cell tab): ${liveOpen.printed ? "opened at the printed panel's loci" : "whole genome"}; scroll / drag to zoom and pan, gene track Collapsed / Squished / Expanded, click or drag rows to select cells`}
            </Text>
            <span style={{ flex: 1 }} />
            <Button size="small" icon={<LinkOutlined />} href={cellsUrl(liveOpen.patient, [], "")} target="_blank" rel="noopener noreferrer">
              {`${liveOpen.patient} patient page`}
            </Button>
            <Button size="small" onClick={() => setLiveView(null)}>
              Back to the printed panel
            </Button>
          </div>
          <React.Suspense fallback={<Text type="secondary">Loading…</Text>}>
            {liveOpen.kind === "ecdna" ? (
              tokens === "loading" ? <Text type="secondary">Loading the figure style…</Text> : <InteractiveSlot patient={liveOpen.patient} {...sidecarExtras(sidecar, liveOpen.patient)} />
            ) : (
              <PatientLiveView key={`${liveOpen.patient}|${liveView.panel}`} start={liveOpen} />
            )}
          </React.Suspense>
        </div>
      )}
      <div
        ref={sheetRef}
        className="sc-paperpage-sheet"
        style={{ position: "relative", width, height, cursor: drag.current?.kind === "pan" ? "grabbing" : geneHover ? "pointer" : hit || trackHit ? "crosshair" : hover || plotHit?.fields ? "pointer" : lens ? "grab" : "default", touchAction: "none", userSelect: "none" }}
        onPointerDown={(e) => {
          const [x, y, px, py] = at(e);
          pointers.current.set(e.pointerId, [px, py]);
          if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            drag.current = { kind: "pinch", d: Math.hypot(a[0] - b[0], a[1] - b[1]), moved: true };
            return;
          }
          const h = trackAt(x, y) ? null : hitAt(sidecar, x, y);
          if (h && !(geneGenome && geneAt(x, y))) {
            drag.current = { kind: "rows", h, y0: y, moved: false };
            return;
          }
          const inLens = lens && lensContains(lens, k, px, py);
          const pr = sidecar?.regions.find((r) => r.kind === "plot" && inRect(r, x, y));
          if (pr && (!inLens || e.shiftKey)) {
            drag.current = { kind: "box", x0: x, y0: y, moved: false };
            return;
          }
          if (inLens) drag.current = { kind: "pan", px, py, moved: false };
        }}
        onPointerMove={(e) => {
          const [x, y, px, py] = at(e);
          const d = drag.current;
          if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, [px, py]);
          if (d?.kind === "pinch") {
            // two fingers: zoom about their midpoint along the zoom axis of the region under it
            if (pointers.current.size < 2) return;
            const [a, b] = [...pointers.current.values()];
            const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
            const f = pinchFactor(d.d, dist);
            d.d = dist;
            const [mx, my] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
            const [qx, qy] = toPt(mx, my);
            setLens((cur) => {
              if (cur && lensContains(cur, k, mx, my)) {
                const n = lensZoom(cur, k, f, mx, my);
                return lensIsHome(n) ? null : { ...n, letter: cur.letter };
              }
              const pr = f > 1 ? panelRectAt(qx, qy) : null;
              const zt = pr ? zoomTarget(sidecar, qx, qy, pr.rect) : null;
              return zt ? { ...lensZoom(lensOn(zt.rect, zt.mode), k, f, mx, my), letter: pr.letter } : cur;
            });
            return;
          }
          if (d) {
            if (d.kind === "pan") {
              if (Math.hypot(px - d.px, py - d.py) > 2) d.moved = true;
              setLens((l) => (l ? { ...lensPan(l, k, px - d.px, py - d.py), letter: l.letter } : l));
              d.px = px;
              d.py = py;
              return;
            }
            if (d.kind === "rows") {
              if (Math.abs(y - d.y0) > 2) d.moved = true;
              if (d.moved) setBrushBox({ x: d.h.region.x, w: d.h.region.w, y0: Math.min(d.y0, y), y1: Math.max(d.y0, y) });
              return;
            }
            if (d.kind === "box") {
              if (Math.hypot(x - d.x0, y - d.y0) > 2) d.moved = true;
              if (d.moved) setBrushBox({ x: Math.min(d.x0, x), w: Math.abs(x - d.x0), y0: Math.min(d.y0, y), y1: Math.max(d.y0, y) });
              return;
            }
          }
          const t = trackAt(x, y);
          const h = t ? null : hitAt(sidecar, x, y);
          let site = null;
          if (h?.region.cols?.ids?.length && h.region.patient) {
            const L = snv[h.region.patient];
            if (L === undefined) wantSnv(h.region.patient);
            const c = colIndexAt(h.region, x);
            if (L && c >= 0) site = { id: h.region.cols.ids[c], ...(snvAt(L, h.id, h.region.cols.ids[c]) || { vaf: null, ref: 0, alt: 0, gene: "" }) };
          }
          setHit(h ? { ...h, position: hitPos(h, x), site } : null);
          // open the hovered cell's genome graph once its row / track is zoomed past the PDF's detail
          if (t && lens && lens.s >= 1.6) focusOn({ cell: t.cell, patient: t.patient, trackId: t.id, regionId: t.region.id });
          else if (h && h.region.axis?.type === "genome" && h.region.patient && (cnZoom[h.region.id] || (lens && lens.s >= 1.6))) focusOn({ cell: h.id, patient: h.region.patient, regionId: h.region.id, trackId: null, row: h.region.rows.indexOf(h.id) });
          else popupCtl.current.leaveRegion();
          setTrackHit(t ? trackInfo(t, x) : null);
          const ph = h || t ? null : plotHitAt(sidecar, x, y);
          setPlotHit(ph && (ph.fields || ph.axis) ? ph : null);
          const p = h || t || (ph && ph.fields) ? null : panelAt(anchors, x, y);
          setHover(p);
          const gh = isGene && !drag.current ? geneAt(x, y) : null;
          setGeneHover(gh ? { ...gh, px, py } : null);
          setTip(h || t || ph || p || gh ? { px, py } : null);
        }}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          if (drag.current?.kind === "pinch") drag.current = null;
        }}
        onPointerUp={(e) => {
          pointers.current.delete(e.pointerId);
          const d = drag.current;
          if (d?.kind === "pinch") {
            if (pointers.current.size < 2) drag.current = null;
            sheetRef.current.dataset.dragged = "1";
            return;
          }
          drag.current = null;
          setBrushBox(null);
          if (!d) return;
          const [x, y] = at(e);
          if (d.kind === "rows") {
            const r = d.h.region;
            const cells = d.moved ? rowsBetween(r, d.y0, y) : [d.h.id];
            if (cells.length) select(cells, r.patient, d.moved ? `${cells.length} rows of ${fig.label}${r.panel || ""}` : null, d.moved ? { shiftKey: true } : e);
            d.handled = true;
          } else if (d.kind === "box" && d.moved) {
            const m = marksInBox(sidecar, d.x0, d.y0, x, y, toPage);
            const byP = new Map();
            m.forEach((p, c) => byP.set(p || "", [...(byP.get(p || "") || []), c]));
            setSel((cur) => {
              let s = e.shiftKey ? cur : null;
              byP.forEach((cells, p) => {
                s = selectCells(s, cells, p || null, { add: true, label: `${m.size} cells boxed in ${fig.label}` });
              });
              return s;
            });
          }
          sheetRef.current.dataset.dragged = d.moved || d.kind === "rows" ? "1" : "";
        }}
        onMouseLeave={() => {
          clearHover();
          popupCtl.current.leaveRegion();
        }}
        onDoubleClick={() => setLens(null)}
        onClick={(e) => {
          if (sheetRef.current?.dataset.dragged) {
            sheetRef.current.dataset.dragged = "";
            return;
          }
          const [x, y] = at(e);
          const gc = isGene ? geneAt(x, y) : null;
          if (gc) {
            setGeneCard({ gene: gc.gene, genes: gc.genes, anchor: { x: e.clientX, y: e.clientY } });
            return;
          }
          const t = trackAt(x, y);
          if (t) {
            select([t.cell], t.patient, `${t.cell} (${fig.label}${t.panel || ""})`, e);
            return;
          }
          const ph = plotHitAt(sidecar, x, y);
          const cell = ph?.fields?.cell || ph?.fields?.cell_id;
          if (cell) {
            select([`${cell}`], ph.fields.patient || ph.region.patient || null, null, e);
            return;
          }
          if (ph?.fields?.patient) {
            setPatientOpen({ patient: `${ph.fields.patient}`, fields: ph.fields, panel: `${fig.label}${ph.region.panel || ""}` });
            return;
          }
          if (lens) return;
          const p = panelAt(anchors, x, y);
          if (p) setOpen(p);
        }}
      >
        <img src={bestImage(fig)} alt={`${fig.label}: ${fig.title}`} draggable={false} onLoad={() => setImgReady(true)} style={{ width, height, display: "block", userSelect: "none" }} />
        {overlays(k, k, "p")}
        {region && !hit && !plotHit?.fields && !trackHit && !lens && (
          <div className="sc-paperpage-region" style={{ left: region.x0 * k, top: region.y0 * k, width: (region.x1 - region.x0) * k, height: (region.y1 - region.y0) * k }} />
        )}
        {lens && (
          <>
            <div className="sc-paperlens" style={{ ...lensBox, position: "absolute", overflow: "hidden", zIndex: 5 }}>
              <div style={{ position: "absolute", left: -lens.ox * k * lens.sx, top: -lens.oy * k * lens.sy, width: width * lens.sx, height: height * lens.sy, pointerEvents: "none" }}>
                {/* a transform (not a resized img) so one-axis zooms stretch the SVG along that axis only */}
                <img src={bestImage(fig)} alt="" draggable={false} style={{ width, height, display: "block", maxWidth: "none", transformOrigin: "0 0", transform: `scale(${lens.sx}, ${lens.sy})` }} />
                {overlays(k * lens.sx, k * lens.sy, "l")}
              </div>
              <div style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}>
                {lensSnv()}
                {lensTracks()}
              </div>
            </div>
            <Space.Compact className="sc-paperlens-tools" style={{ position: "absolute", left: lensBox.left + lensBox.width - 96, top: lensBox.top + 4, zIndex: 7 }}>
              <Tooltip title="Zoom in">
                <Button size="small" icon={<ZoomInOutlined />} onClick={(e) => { e.stopPropagation(); setLens((l) => ({ ...lensZoom(l, k, 1.6, lensBox.left + lensBox.width / 2, lensBox.top + lensBox.height / 2), letter: l.letter })); }} />
              </Tooltip>
              <Tooltip title="Zoom out">
                <Button size="small" icon={<ZoomOutOutlined />} onClick={(e) => { e.stopPropagation(); setLens((l) => { const n = lensZoom(l, k, 1 / 1.6, lensBox.left + lensBox.width / 2, lensBox.top + lensBox.height / 2); return lensIsHome(n) ? null : { ...n, letter: l.letter }; }); }} />
              </Tooltip>
              <Tooltip title="Reset (double-click)">
                <Button size="small" icon={<CompressOutlined />} onClick={(e) => { e.stopPropagation(); setLens(null); }} />
              </Tooltip>
            </Space.Compact>
            <div className="sc-paperzoom-badge" style={{ left: lensBox.left, top: lensBox.top + lensBox.height + 2 }}>
              <Text style={{ fontSize: 11 }}>{`${fig.label}${lens.letter} × ${lens.mode === "x" ? `${lens.sx.toFixed(1)} horizontal (rows fixed)` : lens.mode === "y" ? `${lens.sy.toFixed(1)} vertical` : lens.s.toFixed(1)} · wheel / pinch zoom · drag to pan · shift-drag to select · double-click resets`}</Text>
            </div>
          </>
        )}
        {graphDock()}
        {hit && tip && (
          <div className="sc-tooltip" style={tooltipStyle}>
            <div style={{ fontWeight: 600 }}>{hit.id}</div>
            <div>{`${fig.label}${hit.region.panel || ""} · ${hit.region.label}${hit.region.patient ? ` · ${hit.region.patient}` : ""}`}</div>
            {hit.extras.map((x) => (
              <div key={x.label}>{`${x.label}: ${fmtVal(x.value)}`}</div>
            ))}
            {hit.position && <div>{`chr${hit.position.chr}:${hit.position.pos.toLocaleString()}`}</div>}
            {hit.site && <div>{`${hit.site.id}${hit.site.gene ? ` (${hit.site.gene})` : ""} · ${hit.site.vaf == null ? "no reads" : `VAF ${hit.site.vaf.toFixed(2)} (${hit.site.alt}/${hit.site.alt + hit.site.ref})`}`}</div>}
            <div style={{ opacity: 0.8 }}>{`${ids.has(hit.id) ? "click to unselect" : "click to select"} · drag rows · shift adds${hit.region.axis?.type === "genome" ? (cnZoom[hit.region.id] || (lens && lens.s >= 1.6) ? " · its genome graph opens under the row" : " · scroll to zoom, then the cell's genome graph opens") : ""}`}</div>
          </div>
        )}
        {trackHit && tip && (
          <div className="sc-tooltip" style={tooltipStyle}>
            <div style={{ fontWeight: 600 }}>{trackHit.track.cell}</div>
            <div>{`${fig.label}${trackHit.track.panel || ""} · ${trackHit.track.patient || ""}${cloneOf.get(trackHit.track.cell) ? ` · ${cloneOf.get(trackHit.track.cell)}` : ""}`}</div>
            <div>{`chr${trackHit.pos.chr}:${trackHit.pos.from.toLocaleString()}`}</div>
            {trackHit.junction ? (
              <div>{`junction ${trackHit.junction.type || ""} JCN ${trackHit.junction.cn} · chr${trackHit.junction.chrA}:${trackHit.junction.a.toLocaleString()} → chr${trackHit.junction.chrB}:${trackHit.junction.b.toLocaleString()}`}</div>
            ) : (
              <div style={{ opacity: 0.8 }}>{graphs.current.has(trackHit.track.cell) ? "no junction under the cursor" : "zoom in to load the cell's genome graph"}</div>
            )}
            <div style={{ opacity: 0.8 }}>{lens && lens.s >= 1.6 ? "its genome graph opens above the track · click to select (shift adds)" : "zoom in for its genome graph · click to select (shift adds)"}</div>
          </div>
        )}
        {plotHit && tip && !hit && !trackHit && (
          <div className="sc-tooltip" style={tooltipStyle}>
            <div style={{ fontWeight: 600 }}>{plotHit.fields ? plotHit.fields.cell || plotHit.fields.patient || plotHit.fields.gene || plotHit.fields.row || plotHit.fields.label || `${fig.label}${plotHit.region.panel || ""}` : `${fig.label}${plotHit.region.panel || ""}`}</div>
            {plotHit.fields &&
              Object.entries(plotHit.fields)
                .filter(([key]) => key !== "cell")
                .map(([key, v]) => <div key={key}>{`${key}: ${fmtVal(v)}`}</div>)}
            {plotHit.axis && <div>{`x: ${plotHit.axis.x == null ? "–" : fmtVal(plotHit.axis.x)} · y: ${plotHit.axis.y == null ? "–" : fmtVal(plotHit.axis.y)}`}</div>}
            <div style={{ opacity: 0.8 }}>{plotHit.fields?.cell ? "click to select · shift adds · drag a box to select many" : plotHit.fields?.patient ? "click for the patient summary" : "drag a box to select cells · click to open the panel"}</div>
          </div>
        )}
        {geneHover && tip && (
          <div className="sc-tooltip" style={{ ...tooltipStyle, top: (tip.py || 0) - 14, transform: "translateY(-100%)" }}>
            <div style={{ fontWeight: 600 }}>{geneHover.genes.length > 1 ? geneHover.genes.join(" · ") : geneHover.gene}</div>
            <div style={{ opacity: 0.8 }}>{`click for the gene card${geneHover.kind === "genome" ? ` · ${geneHover.position.chr}:${geneHover.position.pos.toLocaleString()}` : ""}`}</div>
          </div>
        )}
        {hover && tip && !hit && !plotHit && !trackHit && !geneHover && (
          <div className="sc-tooltip" style={tooltipStyle}>
            <div style={{ fontWeight: 600 }}>{`${fig.label}${hover.letter}`}</div>
            <div>{hover.status}</div>
            {hover.reason && <div style={{ opacity: 0.8 }}>{hover.reason.length > 160 ? `${hover.reason.slice(0, 160)}…` : hover.reason}</div>}
            <div style={{ opacity: 0.8 }}>{lens ? "drag to pan · double-click resets" : "scroll to zoom · click: open large, data table and links"}</div>
          </div>
        )}
      </div>
      <div className="sc-paperpage-notes">
        <div className="sc-paper-subhead">{`${fig.label} · panel notes (build status from the figure scripts)`}</div>
        {fig.panels.map((p) => {
          const t = panelTarget(p.view);
          return (
            <div key={p.letter} className="sc-paperpage-note">
              <Button type="link" size="small" style={{ padding: 0, fontWeight: 700 }} onClick={() => setOpen(p)}>
                {p.letter}
              </Button>
              <Tag color={STATUS_TAG_COLOR[p.status] || "default"} style={{ marginInlineEnd: 0 }}>
                {p.status}
              </Tag>
              <Text style={{ fontSize: 12 }}>{p.reason || "no notes"}</Text>
              {panelTables(sidecar, p.letter).length > 0 && (
                <Button type="link" size="small" onClick={() => setOpen({ panel: p, tab: "data" })}>
                  data
                </Button>
              )}
              {p.view?.panel === "patient-figure" && p.view.patient && (
                <Button type="link" size="small" onClick={() => openLive(p.view.patient, p.letter || null)}>
                  {`Open in patient view (${p.view.patient})`}
                </Button>
              )}
              {t && t.kind !== "interactive" && (
                <Button type="link" size="small" icon={<LinkOutlined />} onClick={() => openPaperTarget(t)}>
                  {targetLabel(t)}
                </Button>
              )}
            </div>
          );
        })}
      </div>
      {cellsOpen != null && sel && (
        <React.Suspense fallback={null}>
          <SelectionDrawer
            ids={(groups.find((g) => (g.patient || "") === cellsOpen) || groups[0])?.ids || []}
            patient={(groups.find((g) => (g.patient || "") === cellsOpen) || groups[0])?.patient || null}
            label={sel.label}
            sidecar={sidecar}
            figLabel={fig.label}
            onClose={() => setCellsOpen(null)}
          />
        </React.Suspense>
      )}
      {geneCard && <FigureGeneCard gene={geneCard.gene} genes={geneCard.genes} anchor={geneCard.anchor} onPick={(g) => setGeneCard((c) => ({ ...c, gene: g }))} onClose={() => setGeneCard(null)} />}
      {patientOpen && (
        <React.Suspense fallback={null}>
          <PatientDrawer patient={patientOpen.patient} focus={patientOpen} onClose={() => setPatientOpen(null)} />
        </React.Suspense>
      )}
      <PanelModal
        fig={fig}
        panel={open?.panel || open}
        initialTab={open?.tab || "panel"}
        tables={open ? panelTables(sidecar, (open.panel || open).letter) : []}
        onClose={() => setOpen(null)}
        onOpenTarget={(t) => (t.kind === "interactive" && t.panel === "patient-figure" && t.patient ? (setOpen(null), openLive(t.patient, t.letter || null)) : openPaperTarget(t))}
      />
      <Modal open={zoom} onCancel={() => setZoom(false)} footer={null} width="96vw" title={`${fig.label} · ${fig.title}`}>
        {zoom && <ZoomPanImage src={bestImage(fig)} alt={fig.label} width={natW} height={(fig.heightPt || 600) * PT_PX} viewHeight={Math.max(400, (window.innerHeight || 900) - 220)} />}
      </Modal>
    </div>
  );
}

/** Row of links to the figure tabs (landing pages): one thumbnail button per figure, in the paper's order. */
export function PaperFigureLinks({ onView, views }) {
  const { manifest } = usePaperManifest();
  if (!manifest) return null;
  const byLabel = new Map(manifest.figures.map((f) => [f.label, f]));
  const items = views.map((v) => ({ ...v, fig: byLabel.get(v.label) })).filter((x) => x.fig);
  if (!items.length) return null;
  return (
    <div className="sc-paperlinks">
      <div className="sc-paperlinks-head">
        <b>The paper</b>
        <Text type="secondary" style={{ fontSize: 12 }}>{` · each figure exactly as built, panels linked to their interactive views · built ${formatBuilt(manifest.synced)}`}</Text>
      </div>
      <div className="sc-paperlinks-row">
        {items.map(({ key, fig }) => (
          <button key={key} type="button" className="sc-paperlinks-item" onClick={() => onView(key)} title={fig.title}>
            <img src={fig.png || bestImage(fig)} alt="" loading="lazy" />
            <span>{fig.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
