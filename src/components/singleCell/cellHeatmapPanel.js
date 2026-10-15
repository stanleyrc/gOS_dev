import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Alert, Button, Card, Checkbox, Segmented, Select, Space, Tag, Tooltip, Typography } from "antd";
import { ApartmentOutlined, InfoCircleOutlined } from "@ant-design/icons";
import { AiOutlineDownload, AiOutlineFullscreen, AiOutlineZoomIn, AiOutlineZoomOut } from "react-icons/ai";
import HeatmapCanvas from "./heatmapCanvas";
import StripLabels from "./stripLabels";
import HintLine, { Provenance } from "./hintLine";
import PhylogenyCanvas from "./phylogenyCanvas";
import BranchDiffDrawer from "./branch/branchDiffDrawer";
import GeneInfoDrawer from "./rna/geneInfoDrawer";
import SnvSiteDrawer from "./snvSiteDrawer";
import SavedGroupsBar from "./savedGroupsBar";
import { branchVariants, hasAnchors } from "../../helpers/singleCell/branchSnvs";
import { carrierRows } from "../../helpers/singleCell/snvIsolate";
import SnvSelectionBar from "./snvSelectionBar";
import { idsToColumns, knownIds, parseSnsel, serializeSnsel, SNSEL_PARAM } from "../../helpers/singleCell/snvSelection";
import SnvIsolatePanel from "./snvIsolatePanel";
import { cladeNodeLabels } from "../../helpers/singleCell/clades";
import usePatientClades from "./usePatientClades";
import usePatientTmb from "./usePatientTmb";
import { TMB_TRACK, cellTmbMap, fmtTmb, tmbAxisMax, tmbBarColor, tmbBarFraction, tmbTooltipLines } from "../../helpers/singleCell/tmb";
import { themePalette } from "../../helpers/singleCell/themes";
import { layoutTree } from "../../helpers/singleCell/newick";
import HeatmapLegend from "./heatmapLegend";
import MutationSidePanel, { SNV_CATEGORIES } from "./mutationSidePanel";
import { filterSnvColumns, hasCladeScores } from "../../helpers/singleCell/snvSites";
import { SnvTrackControls, useSnvAnnot, useSnvTracks, useTreeSiteFit } from "./snvAnnotTracks";
import { snvCopyNumber } from "../../helpers/singleCell/snvCopyNumber";
import PaletteEditor from "./paletteEditor";
import HeightHandle from "./heightHandle";
import ExpressionSidePanel, { GENE_COLUMN_WIDTH } from "./expressionSidePanel";
import PinnedGenesOverlay from "./pinnedGenesOverlay";
import useContainerWidth from "./useContainerWidth";
import usePixelRatio from "./usePixelRatio";
import singleCellActions from "../../redux/singleCell/actions";
import settingsActions from "../../redux/settings/actions";
import scaActions from "../../redux/scAnalysis/actions";
import useTreeView from "./useTreeView";
import HideLowQcControl from "./hideLowQcControl";
import { useQcCells } from "./useCovQc";
import { withQcColumn } from "../../helpers/singleCell/cellQc";
import {
  MISSING_RGBA,
  binLabel,
  chromosomeSpans,
  cnColorer,
  discreteColumnLookup,
  discreteGroups,
  domainExtents,
  expressionRGBA,
  genomicColumnLookup,
  genomicTicks,
  hexToRgb,
  junctionRGBA,
  packRGBA,
  panDomain,
  rowMap,
  snvColumnOrder,
  snvMetricMax,
  treeColumnOrder,
  wheelZoomFactor,
  zoomDomain,
  annotationColors,
} from "../../helpers/singleCell/matrix";
import Wrapper from "./index.style";
import usePlotTheme from "./usePlotTheme";
import { currentPlotTheme } from "../../helpers/singleCell/plotTheme";
import { fieldLabel } from "../../helpers/singleCell/fieldLabels";
import { PLOIDY_TRACK, barPixels, modalPloidy, ploidyAxisMax, ploidyBarFraction, ploidyDeviation, ploidyDeviationColor, ploidyTooltipLines } from "../../helpers/singleCell/ploidyBars";
import useDriverLayer from "./drivers/useDriverLayer";
import DriverControls from "./drivers/driverControls";
import DriverColumnHeader from "./drivers/driverColumnHeader";
import JunctionColumnHeader from "./junctionColumnHeader";
import {
  JUNCTION_FOCUS_PARAMS,
  carrierRows as junctionCarrierRows,
  effectiveFilter,
  isZoomed,
  junctionBreakends,
  junctionColumns,
  junctionFocusToSearch,
  junctionLabel,
  junctionStats,
  junctionType,
  walkOptions,
} from "../../helpers/singleCell/junctionFocus";
import DriverWidthControl from "./drivers/driverWidthControl";
import { DRIVER_AUTO_COL, DRIVER_AUTO_COL_BESIDE, DRIVER_LAYOUT_PARAMS, driverLayoutToSearch, driverView, panRange, zoomRange } from "../../helpers/singleCell/driverColumns";
import DriverLayerDrawer from "./drivers/driverLayerDrawer";
import { DEFAULT_SNV_TRACKS } from "../../helpers/singleCell/snvAnnot";
import { SPLIT_PARAMS, dragSplitter, fractionsToLayout, layoutFractions, splitToSearch, splitWidths } from "../../helpers/singleCell/panelSplit";
import { driverColors } from "./drivers/driverColors";
import { twoHitStatus } from "../../helpers/singleCell/twoHit";
import { SELECTION_PARAMS, branchMarkText, driverBranchMarks, entryStates, classLabel, serializeSelection } from "../../helpers/singleCell/driverLayer";
import useCellLabels from "./useCellLabels";

const { Text } = Typography;
const STRIP_WIDTHS = [6, 9, 14, 20, 28, 40]; // px per strip: selection, clone, metadata fields, expression
const NOT_ANNOTATIONS = new Set(["pair", "well", "entry_type", "patient_id", "clone_id", "cell_id", "tumor_type", "disease", "primary_site", "summary", "caseReportId"]);
const GAP = 4;
const TRACK_LABEL_ROOM = 92; // px kept free right of the beside-SNV annotation strips for their track names
// Genome plots (navigation genes/cytobands, cell tracks) keep 50 px margins
// and 50 px between regions; the heatmap uses the same so they line up.
const GENOME_MARGIN = 50;
const DOMAIN_GAP = 50;
// The cell tracks sit inside nested cards (cellTracksPanel TRACK_NESTING), so
// the genomic area keeps at least this much room on each side for them to match.
const MIN_GENOME_LEFT = GENOME_MARGIN + 40;
const MIN_GENOME_RIGHT = GENOME_MARGIN + 24;
// Tree block = tree + gap + 2 px handle + gap (the row is a flex box with 4 px gaps).
const HANDLE_WIDTH = 10;
const TREE_MIN = 80;
const TREE_MAX = 900;
const STRIP_HANDLE = 6; // drag handle between the annotation strips and the heatmap (the row adds a GAP on each side)
const AXIS_HEIGHT = 18;
const TICK_HEIGHT = 16;
const SELECTED_RGBA = packRGBA(hexToRgb("#262626"));

const heatmapHeight = (nRows, rowHeight = "auto") =>
  rowHeight === "auto"
    ? Math.min(720, Math.max(160, nRows * 6))
    : Math.min(6000, Math.max(160, nRows * Number(rowHeight)));
const ROW_HEIGHTS = ["auto", 4, 6, 10, 14, 20];
const sidePanelWidth = (containerWidth) => Math.round(Math.min(420, Math.max(180, containerWidth * 0.22)));
const isMulti = (event) => event.metaKey || event.ctrlKey;

/**
 * Phylogeny + cells x genome heatmap for a single-cell patient. Rows follow
 * the tree; the heatmap shows copy number (total, major or minor allele),
 * SNVs or junction copy number. Beside the copy number, a compact mutation
 * matrix uses the same rows. Hovering a row highlights the cell in every
 * linked view (tree, UMAP).
 *
 * Click a leaf or row to pull up that cell; Cmd/Ctrl-click adds or removes
 * cells; Shift-click selects a range; click an internal node for its clade.
 */
export default function CellHeatmapPanel() {
  const pt = usePlotTheme();
  // annotation strips: "not selected" / "no value" cells take the panel tint, not white
  const stripBlank = useMemo(() => packRGBA(hexToRgb(pt.panelAlt)), [pt]);
  const { t } = useTranslation("common");
  const cellLabels = useCellLabels();
  const dispatch = useDispatch();
  const sc = useSelector((state) => state.SingleCell);
  const { domains, chromoBins, defaultDomain, genomeLength, zoomedByCmd } = useSelector((state) => state.Settings);
  const expression = useSelector((state) => state.ScAnalysis.expression);
  const geneList = useSelector((state) => state.ScAnalysis.geneList);
  const geneOptions = useSelector((state) => state.Genes.optionsList);
  const showExpression = expression.status === "ok" && Boolean(expression.values);
  const [containerRef, containerWidth] = useContainerWidth();
  const pixelRatio = usePixelRatio();
  const [hover, setHover] = useState(null);
  const [cardGene, setCardGene] = useState(null);   // gene label clicked in the RNA side panel
  const anchorRow = useRef(null);
  const canvasHolder = useRef(null);

  const {
    cells: rawCells,
    cloneColors,
    tree,
    cn,
    allelic,
    snv,
    junctions,
    heatmapType,
    snvOrder,
    snvMetric,
    cnMode,
    palette,
    sidePanel,
    hoveredCellId,
    selectedCellIds,
    layout,
  } = sc;
  const cells = useQcCells(rawCells); // + live QC / QC reason annotation fields
  const cellById = useMemo(() => new Map(cells.map((c) => [c.cell_id, c])), [cells]);
  const cloneNames = useMemo(
    () => [...new Set(cells.map((c) => c.clone_id).filter((c) => c != null))].sort(),
    [cells]
  );

  /* ---- displayed rows: hidden clones removed (tree re-pruned), long branches shortened ---- */
  const { order, treeLayout } = useTreeView();
  const nRows = order.length;
  const hasTree = Boolean(treeLayout);
  const [dragTreeWidth, setDragTreeWidth] = useState(null);
  const treeWidth = hasTree
    ? Math.max(TREE_MIN, Math.min(TREE_MAX, dragTreeWidth ?? layout.treeWidth, containerWidth - 400))
    : 0;
  const treeBlock = hasTree ? treeWidth + HANDLE_WIDTH : 0;
  const snvReady = snv.status === "ok";
  const showSide = sidePanel && snvReady && heatmapType !== "snv" && heatmapType !== "drivers";
  const driverLayer = useDriverLayer();
  const driverEntries = driverLayer.columns; // display columns (redundant CN events collapsed); .entry is the representative driver
  // zoom range of the driver columns ([start, end) of driverEntries; null = all) and the block beside the CN heatmap
  const [driverRange, setDriverRange] = useState(null);
  useEffect(() => setDriverRange(null), [driverLayer.shown]);
  const showCnDrivers = heatmapType === "cn" && Boolean(layout.cnDrivers) && driverEntries.length > 0;
  const driverBesideMax = Math.round(Math.max(120, Math.min(420, containerWidth * 0.28)));
  const driverBesideAuto = showCnDrivers
    ? driverView({ n: driverEntries.length, range: driverRange, colPx: layout.driverColPx, maxWidth: driverBesideMax, autoCol: DRIVER_AUTO_COL_BESIDE })
    : null;
  // Side panel widths: dragged (live), saved in the layout, or automatic.
  const [dragGene, setDragGene] = useState(null);
  const maxSide = Math.max(120, containerWidth * 0.6);
  const sideAutoWidth = showSide
    ? Math.round(Math.max(100, Math.min(maxSide, layout.sideWidth ?? sidePanelWidth(containerWidth))))
    : 0;
  const showGenes = Boolean(layout.showGenePanel) && geneList.length > 0 && sc.rna.status === "ok";
  const geneWidth = showGenes
    ? Math.round(
        Math.max(40, Math.min(maxSide, dragGene ?? layout.geneWidth ?? Math.max(60, Math.min(400, GENE_COLUMN_WIDTH * geneList.length))))
      )
    : 0;
  // Drag a panel's left edge: moving left widens it.
  const startWidthDrag = (current, setLive, key) => (event) => {
    event.preventDefault();
    const x0 = event.clientX;
    let latest = current;
    const move = (e) => {
      latest = Math.round(Math.max(40, Math.min(maxSide, current - (e.clientX - x0))));
      setLive(latest);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      dispatch(singleCellActions.updateLayout({ [key]: latest }));
      setLive(null);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  // Drag the edge of the annotation strips to change their width (all strips together).
  const startStripDrag = (event) => {
    event.preventDefault();
    const x0 = event.clientX;
    const start = layout.stripWidth || 14;
    const n = Math.max(1, Math.round(annotationWidth / start));
    const move = (e) => {
      const next = Math.round(Math.max(4, Math.min(60, start + (e.clientX - x0) / n)));
      dispatch(singleCellActions.updateLayout({ stripWidth: next }));
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  // Annotation strip: selection, clone, and the searched gene's expression when shown.
  // Metadata strips (e.g. GBM state, region) from the cells' manifest records.
  const annotationOptions = useMemo(() => {
    const keys = new Set();
    cells.forEach((c) => Object.keys(c).forEach((k) => keys.add(k)));
    return [...keys].filter((k) => {
      if (NOT_ANNOTATIONS.has(k)) return false;
      const values = new Set(cells.map((c) => c[k]).filter((v) => v != null && v !== "" && typeof v !== "object"));
      return values.size >= 2 && values.size <= 24 && [...values].every((v) => typeof v === "string");
    });
  }, [cells]);
  const annotationFields = withQcColumn(layout.annotationFields, annotationOptions);
  const annotationLevels = useMemo(
    () => Object.fromEntries(annotationFields.map((f) => [f, annotationColors(cells.map((c) => c[f]).filter((v) => v != null && v !== ""), themePalette(layout.theme))])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layout.theme, cells, annotationFields.join("|")]
  );
  const nAnnotation = 2 + annotationFields.length + (showExpression ? 1 : 0);
  const ANNOTATION_COLUMN = layout.stripWidth || 14;
  // optional ploidy bar column (two strips wide), after the other annotation strips
  const hasPloidy = useMemo(() => cells.some((c) => Number.isFinite(c.ploidy)), [cells]);
  const showPloidy = Boolean(layout.ploidyBars) && hasPloidy;
  const modalPl = useMemo(() => modalPloidy(cells), [cells]);
  const ploidyMax = useMemo(() => ploidyAxisMax(cells, modalPl), [cells, modalPl]);
  // optional TMB bar column (three strips wide) after the ploidy bars: per-cell dropout-corrected mutations per callable Mb
  const patientTmb = usePatientTmb();
  const hasTmb = patientTmb.status === "ok";
  const showTmb = Boolean(layout.tmbBars) && hasTmb;
  const tmbMap = useMemo(() => cellTmbMap(patientTmb.data), [patientTmb]);
  const tmbMax = useMemo(() => tmbAxisMax([...tmbMap.values()]), [tmbMap]);
  const annotationWidth = ANNOTATION_COLUMN * (nAnnotation + (showPloidy ? 3 : 0) + (showTmb ? 3 : 0));
  // Genomic columns start at genomeLeft and leave rightSpace, wide enough for
  // the 50 px-margin genome plots (and the nested cell tracks) to be padded to match.
  // the heatmap canvas starts after the annotation strips, a gap, the strip drag handle and another gap
  const leftPad = Math.max(0, MIN_GENOME_LEFT - (treeBlock + annotationWidth + STRIP_HANDLE + 2 * GAP));
  const genomeLeft = leftPad + treeBlock + annotationWidth + STRIP_HANDLE + 2 * GAP;
  // Panels right of the strips: CN heatmap | drivers | SNVs beside. Widths are the automatic ones, or the split the
  // user dragged (fractions layout.cnw / drvbw / snbw, URL cnw / drvbw / snbw; live while a splitter moves).
  const [dragSplit, setDragSplit] = useState(null);
  const panelsPresent = ["cn", ...(driverBesideAuto ? ["drv"] : []), ...(showSide ? ["snv"] : [])];
  const storedSplit = dragSplit || layoutFractions(layout);
  const panelSplit =
    panelsPresent.length > 1
      ? splitWidths({
          // room right of the SNV strips for their track names
          total: containerWidth - genomeLeft - (showGenes ? geneWidth + GAP : 0) - (panelsPresent.length - 1) * GAP - (showSide && (layout.snvTracks || DEFAULT_SNV_TRACKS).length > 0 && !showGenes ? TRACK_LABEL_ROOM : 0),
          present: panelsPresent,
          fractions: storedSplit,
          auto: { drv: driverBesideAuto?.width, snv: sideAutoWidth },
        })
      : null;
  const splitStored = Boolean(panelSplit && panelsPresent.every((k) => storedSplit?.[k]));
  const sideWidth = panelSplit?.snv ?? sideAutoWidth;
  const driverBeside = driverBesideAuto
    ? driverView({
        n: driverEntries.length,
        range: driverRange,
        colPx: splitStored ? null : layout.driverColPx,
        maxWidth: panelSplit.drv,
        autoCol: splitStored ? panelSplit.drv / Math.max(1, driverEntries.length) : DRIVER_AUTO_COL_BESIDE,
      })
    : null;
  const rightSpace = Math.max(
    MIN_GENOME_RIGHT,
    (showSide ? sideWidth + GAP : 0) + (showGenes ? geneWidth + GAP : 0) + (driverBeside ? driverBeside.width + GAP : 0)
  );
  const heatWidth = panelSplit ? Math.max(40, panelSplit.cn) : Math.max(200, containerWidth - genomeLeft - rightSpace);
  // splitter between panel `left` and the next one: drag moves px between the two; double-click resets the split
  const startSplitDrag = (left) => (event) => {
    event.preventDefault();
    if (!panelSplit) return;
    const x0 = event.clientX;
    const w0 = { ...panelSplit };
    let latest = null;
    const move = (e) => {
      latest = dragSplitter({ widths: w0, present: panelsPresent, left, dx: e.clientX - x0 });
      setDragSplit(latest);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      if (latest) dispatch(singleCellActions.updateLayout(fractionsToLayout(latest)));
      setDragSplit(null);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  const resetSplit = () => dispatch(singleCellActions.updateLayout({ ...fractionsToLayout(null), driverColPx: null, sideWidth: null }));
  const splitTitle = "Drag to resize the panels (copy number | drivers | SNVs); double-click to reset";
  // visible driver columns and their block width (standalone: the heatmap width; beside CN: its own block)
  const driverViewNow = heatmapType === "drivers" ? driverView({ n: driverEntries.length, range: driverRange, colPx: layout.driverColPx, maxWidth: heatWidth, autoCol: DRIVER_AUTO_COL }) : driverBeside;
  const driverVisible = useMemo(
    () => (driverViewNow ? driverEntries.slice(driverViewNow.start, driverViewNow.end) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [driverEntries, driverViewNow?.start, driverViewNow?.end]
  );
  const [dragHeight, setDragHeight] = useState(null);
  const baseHeight = layout.heatmapHeight || heatmapHeight(nRows, layout.rowHeight);
  const height = dragHeight ?? baseHeight;
  const clampHeight = (h) => Math.round(Math.max(120, Math.min(6000, h)));
  useEffect(() => {
    dispatch(
      singleCellActions.updatePlotInsets({
        left: genomeLeft - GENOME_MARGIN,
        right: containerWidth - genomeLeft - heatWidth - GENOME_MARGIN,
      })
    );
  }, [dispatch, genomeLeft, heatWidth, containerWidth]);

  /* ---- tree width: drag the handle between the tree and the heatmap ---- */
  const startTreeDrag = (event) => {
    event.preventDefault();
    const x0 = event.clientX;
    const w0 = treeWidth;
    let latest = w0;
    const move = (e) => {
      latest = Math.max(TREE_MIN, Math.min(TREE_MAX, w0 + e.clientX - x0));
      setDragTreeWidth(latest);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      dispatch(singleCellActions.updateLayout({ treeWidth: latest }));
      setDragTreeWidth(null);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  const devWidth = heatWidth * pixelRatio;

  /* ---- zoom / pan: same shared domains as the genome view and the cell tracks ---- */
  // With one region shown, wheel/drag previews instantly as a CSS transform of
  // the drawn heatmap and commits the region once the gesture pauses (like the
  // genome tracks); several regions update frame by frame.
  const pendingDomains = useRef(null);
  const frame = useRef(null);
  const commitTimer = useRef(null);
  const [preview, setPreview] = useState(null);
  useEffect(() => {
    pendingDomains.current = null;
    setPreview(null);
  }, [domains]);
  useEffect(
    () => () => {
      if (frame.current) cancelAnimationFrame(frame.current);
      if (commitTimer.current) clearTimeout(commitTimer.current);
    },
    []
  );
  const bounds = useMemo(() => [1, genomeLength || defaultDomain?.[1] || 1], [genomeLength, defaultDomain]);
  const pushDomains = (next) => {
    pendingDomains.current = next;
    if (domains.length === 1 && next.length === 1 && heatmapType === "cn") {
      const [a0, a1] = domains[0];
      const [b0, b1] = next[0];
      const scale = (a1 - a0) / Math.max(1, b1 - b0);
      const tx = ((a0 - b0) * heatWidth) / Math.max(1, b1 - b0);
      setPreview(`translateX(${tx}px) scaleX(${scale})`);
      if (commitTimer.current) clearTimeout(commitTimer.current);
      commitTimer.current = setTimeout(() => {
        commitTimer.current = null;
        if (pendingDomains.current) dispatch(settingsActions.updateDomains(pendingDomains.current));
      }, 160);
      return;
    }
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (pendingDomains.current) dispatch(settingsActions.updateDomains(pendingDomains.current));
    });
  };
  const currentDomains = () => pendingDomains.current || domains;
  const extentAt = (x) => {
    const extents = domainExtents(currentDomains(), heatWidth, DOMAIN_GAP);
    const k = extents.findIndex(([px0, px1]) => x >= px0 && x < px1);
    return k < 0 ? null : { k, extent: extents[k] };
  };
  const handlePan = ({ dx, startX }) => {
    const hit = extentAt(startX);
    if (!hit) return;
    const [px0, px1, d] = hit.extent;
    const next = [...currentDomains()];
    next[hit.k] = panDomain(d, (-dx * (d[1] - d[0])) / (px1 - px0), bounds);
    pushDomains(next);
  };
  const handleWheelZoom = ({ x, deltaY, deltaMode, pinch }) => {
    const hit = extentAt(x);
    if (!hit) return;
    const [px0, px1, d] = hit.extent;
    const anchor = d[0] + ((x - px0) / (px1 - px0)) * (d[1] - d[0]);
    const next = [...currentDomains()];
    // Same wheel response as the genome plots (d3-zoom).
    next[hit.k] = zoomDomain(d, anchor, wheelZoomFactor({ deltaY, deltaMode, pinch }), bounds);
    pushDomains(next);
  };
  const zoomAll = (factor) =>
    pushDomains(currentDomains().map((d) => zoomDomain(d, (d[0] + d[1]) / 2, factor, bounds)));

  // Wheel zoom listens on the fixed-size box around the heatmap, not the canvas:
  // while a zoom previews, the canvas is CSS-scaled and (zooming out) no longer
  // covers the box, so wheels there would otherwise scroll the page, and x must
  // be measured in the box's (unscaled) coordinates.
  const wheelZoom = useRef(null);
  const wheelNeedsModifierRef = useRef(false);
  wheelNeedsModifierRef.current = Boolean(zoomedByCmd);
  const detachWheel = useRef(null);
  const wheelBox = useCallback((el) => {
    if (detachWheel.current) detachWheel.current();
    detachWheel.current = null;
    if (!el) return;
    const listener = (event) => {
      if (!wheelZoom.current) return;
      if (wheelNeedsModifierRef.current && !(event.metaKey || event.ctrlKey || event.altKey)) return;
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      wheelZoom.current({ x: event.clientX - rect.left, deltaY: event.deltaY, deltaMode: event.deltaMode, pinch: event.ctrlKey });
    };
    el.addEventListener("wheel", listener, { passive: false });
    detachWheel.current = () => el.removeEventListener("wheel", listener);
  }, []);

  const rowOf = useMemo(() => new Map(order.map((id, k) => [id, k])), [order]);
  const selectedRows = useMemo(
    () => new Set(selectedCellIds.map((id) => rowOf.get(id)).filter((r) => r != null)),
    [selectedCellIds, rowOf]
  );
  // Selected rows as contiguous runs, drawn as light overlays (no canvas redraw).
  const selectedRuns = useMemo(() => {
    const rows = [...selectedRows].sort((a, b) => a - b);
    const runs = [];
    rows.forEach((r) => {
      const last = runs[runs.length - 1];
      if (last && r === last[1] + 1) last[1] = r;
      else runs.push([r, r]);
    });
    return runs;
  }, [selectedRows]);
  const hoverRow = hoveredCellId != null && rowOf.has(hoveredCellId) ? rowOf.get(hoveredCellId) : null;
  const leafClones = useMemo(
    () => (hasTree ? treeLayout.leaves.map((id) => cellById.get(id)?.clone_id ?? null) : []),
    [hasTree, treeLayout, cellById]
  );
  const selectedLeafRange = useMemo(() => {
    if (!hasTree || !selectedRows.size) return null;
    const rows = [...selectedRows];
    const lo = Math.min(...rows);
    const hi = Math.max(...rows);
    // Only shade when the selection is one contiguous block of tree rows.
    return hi - lo + 1 === rows.length && hi < treeLayout.leaves.length ? [lo, hi] : null;
  }, [hasTree, selectedRows, treeLayout]);

  /* ---- mutation matrix shared by the SNV view and the side panel ---- */
  const snvRows = useMemo(() => (snvReady ? rowMap(order, snv.data.cells) : null), [snvReady, order, snv]);
  // Which sites to show (shared with the signature panel through the layout):
  // by where they map on the tree, CellPhy input only, OncoKB drivers only.
  const { snvCategories, snvCellphyOnly: cellphyOnly, snvDriversOnly: driversOnly, snvSiteIds, snvMinCladeScore, snvSelected, snvSelectedOnly } = layout;
  const setSnvCategories = (value) => dispatch(singleCellActions.updateLayout({ snvCategories: value }));
  const setCellphyOnly = (value) => dispatch(singleCellActions.updateLayout({ snvCellphyOnly: value }));
  const setDriversOnly = (value) => dispatch(singleCellActions.updateLayout({ snvDriversOnly: value }));
  const nDrivers = useMemo(() => (snvReady ? snv.data.variants.filter((v) => v.driver).length : 0), [snvReady, snv]);
  const categoryCounts = useMemo(() => {
    const counts = {};
    if (snvReady) snv.data.variants.forEach((v) => v.category && (counts[v.category] = (counts[v.category] || 0) + 1));
    return counts;
  }, [snvReady, snv]);
  const hasCategories = Object.keys(categoryCounts).length > 0;
  // copy number at each site in its carrier cells (amplified SNVs: CN >= 4 with >= 1.5 mutant copies)
  const snvCn = useMemo(() => (snvReady && cn.status === "ok" ? snvCopyNumber(snv.data, cn.data, { allelic: allelic.status === "ok" ? allelic.data : null }) : null), [snvReady, snv, cn, allelic]);
  const nAmplified = useMemo(() => (snvCn ? snvCn.filter((x) => x?.amplified).length : 0), [snvCn]);
  const amplifiedOnly = Boolean(layout.snvAmplifiedOnly);
  // the file tree (anchors for branch SNVs, and the tree the phylogeny-fit metrics are scored on)
  const fullTreeLayout = useMemo(
    () => (tree.status === "ok" && tree.method === "file" && tree.data?.source ? layoutTree(tree.data.source) : null),
    [tree]
  );
  const { fit: snvFit, busy: snvFitBusy } = useTreeSiteFit(snvReady ? snv.data : null, fullTreeLayout || treeLayout);
  const snvAnnot = useSnvAnnot(snvReady ? snv.data : null, null, snvFit);
  const snvTrackProps = useSnvTracks(snvAnnot);
  const snvAnnotFilter = layout.snvAnnotFilter;
  const snvColumns = useMemo(() => {
    if (!snvReady) return [];
    const all = snvOrder === "tree" ? treeColumnOrder(snv.data, treeLayout, snvRows) : snvColumnOrder(snv.data, snvOrder);
    const filtered = filterSnvColumns(snv.data, all, { snvCategories, snvCellphyOnly: cellphyOnly, snvDriversOnly: driversOnly, snvSiteIds, snvMinCladeScore, snvAnnotFilter, annot: snvAnnot, snvSelected, snvSelectedOnly });
    return amplifiedOnly && snvCn ? filtered.filter((c) => snvCn[c]?.amplified) : filtered;
  }, [snvReady, snv, snvOrder, treeLayout, snvRows, snvCategories, cellphyOnly, driversOnly, snvSiteIds, snvSelected, snvSelectedOnly, snvMinCladeScore, amplifiedOnly, snvCn, snvAnnotFilter, snvAnnot]);
  const [snvHeader, setSnvHeader] = useState(null);
  const [besideHeader, setBesideHeader] = useState(null); // annotation strips above the SNV matrix beside the heatmap

  // SNVs per branch: sites placed on the file tree by their anchors (needs tree.nwk)
  const canShowBranchSnvs = Boolean(fullTreeLayout && hasTree && snvReady && hasAnchors(snv.data));
  const showBranchSnvs = canShowBranchSnvs && Boolean(layout.branchSnvs);
  // "Paint on tree" from the selection bar counts only the selected mutations on the branches
  const paintSelected = Boolean(layout.snvPaintSelected) && snvSelected?.length > 0;
  const branchColumns = useMemo(() => (paintSelected && snvReady ? idsToColumns(snv.data, snvSelected) : snvColumns), [paintSelected, snvReady, snv, snvSelected, snvColumns]);
  const snvsByBranch = useMemo(
    () => (showBranchSnvs ? branchVariants(snv.data, branchColumns, treeLayout, fullTreeLayout) : null),
    [showBranchSnvs, snv, branchColumns, treeLayout, fullTreeLayout]
  );
  // the selection is part of the URL (snsel=<site ids>): read once when the matrix loads, then kept in step
  const snselRead = useRef(false);
  useEffect(() => {
    if (!snvReady || snselRead.current) return;
    snselRead.current = true;
    try {
      const ids = knownIds(snv.data, parseSnsel(new URL(window.location.href).searchParams.get(SNSEL_PARAM)));
      if (ids.length) dispatch(singleCellActions.updateLayout({ snvSelected: ids }));
    } catch (error) {
      // no window: nothing to read
    }
  }, [snvReady, snv, dispatch]);
  useEffect(() => {
    if (!snselRead.current || !sc.patient) return;
    try {
      const url = new URL(window.location.href);
      const value = serializeSnsel(snvSelected);
      if (value) url.searchParams.set(SNSEL_PARAM, value);
      else url.searchParams.delete(SNSEL_PARAM);
      if (url.toString() !== window.location.href) window.history.replaceState(window.history.state, "", url.toString());
    } catch (error) {
      // no window / history: the selection still lives in redux
    }
  }, [snvSelected, sc.patient]);
  const branchCounts = useMemo(
    () => (snvsByBranch ? new Map([...snvsByBranch].map(([k, v]) => [k, v.length])) : null),
    [snvsByBranch]
  );
  const [driverHover, setDriverHover] = useState(null);
  // the Drivers layer and its selection live in the URL (heatmap=drivers&drvpreset=..&drvadd=..), so a link reopens the same view
  useEffect(() => {
    if (!sc.patient) return; // a deep link is read when the patient loads
    try {
      const url = new URL(window.location.href);
      SELECTION_PARAMS.forEach((k) => url.searchParams.delete(k));
      DRIVER_LAYOUT_PARAMS.forEach((k) => url.searchParams.delete(k));
      SPLIT_PARAMS.forEach((k) => url.searchParams.delete(k));
      Object.entries(splitToSearch(layout, panelsPresent)).forEach(([k, v]) => url.searchParams.set(k, v));
      if (heatmapType === "drivers" || showCnDrivers) {
        if (heatmapType === "drivers") url.searchParams.set("heatmap", "drivers");
        else if (url.searchParams.get("heatmap") === "drivers") url.searchParams.delete("heatmap");
        Object.entries(serializeSelection(driverLayer.selection)).forEach(([k, v]) => url.searchParams.set(k, v));
        // drvw=<px per driver column> (absent = auto fit); cndrv=1 = drivers beside the copy-number heatmap
        Object.entries(driverLayoutToSearch({ heatmapType, driverColPx: layout.driverColPx, cnDrivers: showCnDrivers })).forEach(([k, v]) => url.searchParams.set(k, v));
      } else if (url.searchParams.get("heatmap") === "drivers") url.searchParams.delete("heatmap");
      if (url.toString() !== window.location.href) window.history.replaceState(window.history.state, "", url.toString());
    } catch (error) {
      // no window / history: the selection still lives in redux
    }
  }, [heatmapType, showCnDrivers, layout.driverColPx, layout.cnw, layout.drvbw, layout.snbw, panelsPresent.join(), driverLayer.selection, sc.patient]);
  // Junction CN focus (filter + sort) lives in the URL (heatmap=junctions&jcf=all|view|walk:<id>&jsort=carriers)
  useEffect(() => {
    if (!sc.patient) return;
    try {
      const url = new URL(window.location.href);
      JUNCTION_FOCUS_PARAMS.forEach((k) => url.searchParams.delete(k));
      Object.entries(junctionFocusToSearch({ heatmapType, junctionFilter: layout.junctionFilter, junctionSort: layout.junctionSort })).forEach(([k, v]) => url.searchParams.set(k, v));
      if (url.toString() !== window.location.href) window.history.replaceState(window.history.state, "", url.toString());
    } catch (error) {
      // no window / history: the choice still lives in redux
    }
  }, [heatmapType, layout.junctionFilter, layout.junctionSort, sc.patient]);
  // Drivers layer: label of the driver(s) arising on each branch
  const driverMarks = useMemo(() => {
    if (!(heatmapType === "drivers" || showCnDrivers) || !layout.driverBranches || !treeLayout) return null;
    const marks = driverBranchMarks(driverLayer.shown, treeLayout);
    return new Map([...marks].map(([k, v]) => [k, branchMarkText(v)]));
  }, [heatmapType, showCnDrivers, layout.driverBranches, treeLayout, driverLayer.shown]);
  const patientClades = usePatientClades();
  const canShowClades = patientClades.status === "ok" && hasTree && patientClades.data.clades.length > 0;
  const cladeLabels = useMemo(
    () => (canShowClades && layout.cladeOverlay ? cladeNodeLabels(treeLayout, patientClades.data.clades) : null),
    [canShowClades, layout.cladeOverlay, treeLayout, patientClades]
  );
  const [branchNode, setBranchNode] = useState(null);
  const [siteDrawer, setSiteDrawer] = useState(null);
  useEffect(() => setBranchNode(null), [treeLayout]);
  const snvMax = useMemo(() => (snvReady ? snvMetricMax(snv.data, snvMetric) : 1), [snvReady, snv, snvMetric]);
  const chromosomeOfVariant = useCallback((c) => snv.data?.variants[c]?.chromosome ?? null, [snv]);

  /* ---- copy number: total from complex.json, major/minor from allelic.json ---- */
  const cnSource = cnMode === "total" ? cn : allelic;
  const cnColor = useMemo(() => cnColorer(palette, cnMode), [palette, cnMode]);

  /* ---- junction columns can be zoomed (wheel/drag/double-click) like the mutation panel ---- */
  const [jRange, setJRange] = useState(null);
  const jFilterChoice = layout.junctionFilter || null; // {mode, walkId} from the toolbar / ?jcf=; null = automatic
  const jSort = layout.junctionSort === "carriers" ? "carriers" : "pos";
  const walkList = sc.walks?.status === "ok" ? sc.walks.data.walks || [] : [];
  const jWalkOptions = useMemo(() => walkOptions(walkList), [walkList]);
  const jStats = useMemo(() => (junctions.status === "ok" ? junctionStats(junctions.data) : []), [junctions]);
  const jZoomed = isZoomed(domains, defaultDomain);
  const jChoiceOk = jFilterChoice && (jFilterChoice.mode !== "walk" || walkList.some((w) => `${w.id}` === `${jFilterChoice.walkId}`));
  const jFilter = effectiveFilter(jChoiceOk ? jFilterChoice : null, jZoomed);
  const jCols = useMemo(
    () => (junctions.status === "ok" ? junctionColumns(junctions.data, { filter: jFilter, domains, walks: walkList, sort: jSort, stats: jStats }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [junctions, jFilter.mode, jFilter.walkId, domains, sc.walks, jSort, jStats]
  );
  const nJunctions = jCols.length;
  useEffect(() => setJRange(null), [nJunctions, jFilter.mode, jFilter.walkId, jSort]);
  const jRangeRef = useRef(null);
  jRangeRef.current = jRange || [0, nJunctions];
  const setJunctionRange = (start, span) => {
    const size = Math.max(Math.min(3, nJunctions), Math.min(nJunctions, Math.round(span)));
    const s = Math.max(0, Math.min(nJunctions - size, Math.round(start)));
    setJRange(s === 0 && size === nJunctions ? null : [s, s + size]);
  };
  const junctionWheel = (e) => {
    const [s, eEnd] = jRangeRef.current;
    const span = eEnd - s;
    const next = span * wheelZoomFactor(e);
    const f = e.x / heatWidth;
    setJunctionRange(s + f * span - f * next, next);
  };
  const junctionDrag = ({ dx }) => {
    const [s, eEnd] = jRangeRef.current;
    setJunctionRange(s - (dx * (eEnd - s)) / heatWidth, eEnd - s);
  };
  wheelZoom.current = heatmapType === "cn" ? handleWheelZoom : heatmapType === "junctions" ? junctionWheel : null;

  /* ---- driver columns: wheel / pinch zoom, drag to pan, reset (standalone layer and the block beside CN) ---- */
  const driverZoomAt = (frac, factor) => {
    if (!driverViewNow?.count) return;
    const next = zoomRange([driverViewNow.start, driverViewNow.end], driverEntries.length, frac, factor);
    setDriverRange(next);
    if (layout.driverColPx) dispatch(singleCellActions.updateLayout({ driverColPx: null })); // zooming fits the view to the width
  };
  const driverWheel = (e) => driverZoomAt(e.x / Math.max(1, driverViewNow?.width || 1), wheelZoomFactor(e));
  const driverDrag = ({ dx }) => {
    if (!driverViewNow?.count) return;
    setDriverRange(panRange([driverViewNow.start, driverViewNow.end], driverEntries.length, dx, driverViewNow.width));
  };
  // drag the left edge of the block beside CN: moving left widens it (a fixed px per column)
  const driverWheelRef = useRef(null);
  driverWheelRef.current = driverWheel;
  const detachDriverWheel = useRef(null);
  const driverWheelBox = useCallback((el) => {
    if (detachDriverWheel.current) detachDriverWheel.current();
    detachDriverWheel.current = null;
    if (!el) return;
    const listener = (event) => {
      if (wheelNeedsModifierRef.current && !(event.metaKey || event.ctrlKey || event.altKey)) return;
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      driverWheelRef.current({ x: event.clientX - rect.left, deltaY: event.deltaY, deltaMode: event.deltaMode, pinch: event.ctrlKey });
    };
    el.addEventListener("wheel", listener, { passive: false });
    detachDriverWheel.current = () => el.removeEventListener("wheel", listener);
  }, []);

  /* ---- Drivers layer matrix (standalone, or beside the copy-number heatmap): the visible columns only ---- */
  const driverCnColor = useMemo(() => cnColorer(palette, "total"), [palette]);
  const driverMatrix = useMemo(() => {
    if (!(heatmapType === "drivers" || showCnDrivers) || !driverVisible.length || !driverViewNow) return null;
    const colors = {};
    Object.entries(driverColors()).forEach(([k, hex]) => (colors[k] = packRGBA(hexToRgb(hex))));
    const states = driverVisible.map((c) => c.states);
    const matrixWidth = driverViewNow.width;
    const colorAt = (r, c) => {
      const d = driverVisible[c]?.entry;
      const v = states[c]?.[r];
      if (!d) return stripBlank;
      if (d.cls === "snv") return v === 4 ? colors.bothHit : v === 3 ? colors.loss : v === 2 ? colors.mutant : v === 1 ? colors.wildtype : colors.noCoverage;
      if (d.cls === "amp" || d.cls === "homdel") return driverCnColor(v);
      if (d.cls === "fusion") return v === 3 ? colors.both : v === 2 ? colors.rna : v === 1 ? colors.dna : stripBlank;
      return v ? colors.complex : stripBlank;
    };
    return {
      cols: discreteColumnLookup(driverVisible.length, Math.floor(matrixWidth * pixelRatio)),
      axis: { spans: [], separators: [] },
      width: matrixWidth,
      colorAt,
      describe: (r, c) => {
        const col = driverVisible[c];
        const d = col?.entry;
        if (!d || c < 0) return null;
        const v = states[c][r];
        const state =
          d.cls === "snv"
            ? twoHitStatus(v)
            : d.cls === "amp" || d.cls === "homdel"
            ? Number.isFinite(v) ? `copy number ${v}` : t("components.single-cell.no-file")
            : d.cls === "fusion"
            ? v === 3 ? "DNA + RNA" : v === 2 ? "RNA only" : v === 1 ? "DNA" : "not seen"
            : v ? "carrier" : "no";
        return [
          ["Driver", col.label],
          ...(col.members.length > 1 ? [["Same CN pattern", col.genes.join(", ")]] : []),
          ["Class", classLabel(d)],
          ...(d.tier != null ? [["Tier", d.tier]] : []),
          ["Carriers", `${d.n} cells${d.subclonal ? " (subclonal)" : " (clonal)"}`],
          ...(d.twoHit ? [["Two hits", d.twoHit.text]] : []),
          ["This cell", state],
        ];
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heatmapType, showCnDrivers, driverVisible, driverViewNow?.width, pixelRatio, t, snv, snvRows, cn, stripBlank, driverCnColor]);

  /* ---- active matrix (copy number or junctions): column lookup, colour, axis ---- */
  const active = useMemo(() => {
    if (heatmapType === "cn" && cnSource.status === "ok") {
      const { rows } = cnSource.data;
      const map = rowMap(order, cnSource.data.cells);
      const valuesOf = (row) => (cnMode === "major" ? row.major : cnMode === "minor" ? row.minor : row.values);
      const lookups = new Map();
      const colsFor = (r) => {
        const p = map[r];
        if (p < 0 || !rows[p]) return null;
        if (!lookups.has(p)) {
          lookups.set(p, genomicColumnLookup(rows[p].binIndex, domains, devWidth, DOMAIN_GAP * pixelRatio).cols);
        }
        return lookups.get(p);
      };
      const axis = chromosomeSpans(chromoBins, domainExtents(domains, heatWidth, DOMAIN_GAP));
      const label = t(`components.single-cell.cn-mode.${cnMode}`);
      return {
        cols: colsFor,
        axis,
        colorAt: (r, c) => cnColor(valuesOf(rows[map[r]])[c]),
        describe: (r, c) => {
          const p = map[r];
          if (p < 0 || !rows[p]) return [[label, t("components.single-cell.no-file")]];
          if (c < 0) return null;
          return [
            [t("components.single-cell.tooltip.segment"), binLabel(rows[p].binIndex, c)],
            [label, valuesOf(rows[p])[c]],
          ];
        },
      };
    }
    if (heatmapType === "junctions" && junctions.status === "ok") {
      const m = junctions.data;
      const map = rowMap(order, m.cells);
      const [js, je] = jRange || [0, m.junctions.length];
      const columnOrder = jCols.slice(js, je);
      const disc = discreteColumnLookup(columnOrder.length, devWidth);
      const cols = Int32Array.from(disc, (k) => (k < 0 ? -1 : columnOrder[k]));
      const axis = discreteGroups(columnOrder, (i) => m.junctions[i].chromosome1, heatWidth);
      return {
        cols,
        axis,
        colorAt: (r, c) => {
          const p = map[r];
          return p < 0 ? MISSING_RGBA : junctionRGBA(m.cn[p][c], m.maxCn);
        },
        describe: (r, c) => {
          const p = map[r];
          if (p < 0 || c < 0) return null;
          const j = m.junctions[c];
          const value = m.cn[p][c];
          return [
            ["Junction", `${junctionLabel(j)} · ${jStats[c]?.n ?? 0} cells · median CN ${Number.isFinite(jStats[c]?.median) ? jStats[c].median : "not available"}`],
            [
              t("components.single-cell.tooltip.breakpoints"),
              `${j.chromosome1}:${j.position1.toLocaleString()}${j.strand1} → ${j.chromosome2}:${j.position2.toLocaleString()}${j.strand2}`,
            ],
            ...(j.class ? [[t("components.single-cell.tooltip.type"), j.class]] : []),
            [t("components.single-cell.tooltip.junction-cn"), Number.isFinite(value) ? value : t("components.single-cell.no-file")],
          ];
        },
      };
    }
    if (heatmapType === "drivers" && driverMatrix) return driverMatrix;
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heatmapType, cnSource, cnMode, cnColor, junctions, jRange, jCols, jStats, order, domains, heatWidth, devWidth, pixelRatio, chromoBins, t, driverMatrix, snv, snvRows, cn, stripBlank]);

  const annotationCols = useMemo(() => {
    if (!showPloidy && !showTmb) return discreteColumnLookup(nAnnotation, annotationWidth * pixelRatio);
    // strips left of the bar columns; each bar region is masked per row to the bar length
    const total = Math.floor(annotationWidth * pixelRatio);
    const barPx = Math.round(ANNOTATION_COLUMN * 3 * pixelRatio);
    const stripPx = total - (showPloidy ? barPx : 0) - (showTmb ? barPx : 0);
    const base = discreteColumnLookup(nAnnotation, stripPx);
    return (r) => {
      const out = new Int32Array(total).fill(-1);
      out.set(base, 0);
      const cell = cellById.get(order[r]);
      // lit bar (column nAnnotation / nAnnotation + 2) over a faint full-width track (+ 1 / + 3), so length reads against the axis
      if (showPloidy) {
        const n = barPixels(ploidyBarFraction(cell?.ploidy, ploidyMax), barPx - 2);
        for (let x = 1; x < barPx - 1; x += 1) out[stripPx + x] = x <= n ? nAnnotation : nAnnotation + 1;
      }
      if (showTmb) {
        const n = barPixels(tmbBarFraction(tmbMap.get(order[r])?.tmb_corrected, tmbMax), barPx - 2);
        const x0 = stripPx + (showPloidy ? barPx : 0);
        for (let x = 1; x < barPx - 1; x += 1) out[x0 + x] = x <= n ? nAnnotation + 2 : nAnnotation + 3;
      }
      return out;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nAnnotation, annotationWidth, pixelRatio, showPloidy, showTmb, cellById, order, ploidyMax, tmbMap, tmbMax, ANNOTATION_COLUMN]);
  const annotationColor = useCallback(
    (r, c) => {
      if (showTmb && c === nAnnotation + 3) return packRGBA(hexToRgb(TMB_TRACK));
      if (showTmb && c === nAnnotation + 2) return packRGBA(hexToRgb(tmbBarColor(tmbMap.get(order[r]))));
      if (showPloidy && c === nAnnotation + 1) return packRGBA(hexToRgb(PLOIDY_TRACK));
      if (showPloidy && c === nAnnotation) {
        return packRGBA(hexToRgb(ploidyDeviationColor(ploidyDeviation(cellById.get(order[r])?.ploidy, modalPl))));
      }
      if (c === 0) return selectedRows.has(r) ? SELECTED_RGBA : stripBlank;
      const cell = cellById.get(order[r]);
      if (c === 1) {
        const clone = cell?.clone_id;
        return clone != null && cloneColors[clone] ? packRGBA(hexToRgb(cloneColors[clone])) : stripBlank;
      }
      const f = annotationFields[c - 2];
      if (f == null) return expressionRGBA(expression.values?.[order[r]], expression.max);
      const hex = annotationLevels[f]?.[`${cell?.[f] ?? ""}`];
      return hex ? packRGBA(hexToRgb(hex)) : stripBlank;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedRows, cellById, order, cloneColors, expression, annotationLevels, annotationFields.join("|"), stripBlank, showPloidy, showTmb, tmbMap, nAnnotation, modalPl]
  );

  /* ---- groups for RNA comparisons from the current (tree / heatmap) selection ---- */
  const scaGroups = useSelector((state) => state.ScAnalysis.groups);
  const setTreeGroup = (side, rest = false) => {
    const chosen = new Set(selectedCellIds);
    const ids = rest ? order.filter((id) => !chosen.has(id)) : [...selectedCellIds];
    const label = rest
      ? t("components.single-cell.groups.rest-label")
      : t("components.single-cell.groups.tree-label", { count: ids.length });
    dispatch(scaActions.setGroup(side, ids.length ? [{ patient: sc.patient?.caseReportId, cells: ids }] : [], label, "tree"));
  };

  /* ---- selection ---- */
  const setSelection = (ids) => dispatch(singleCellActions.updateSelection(ids));

  const handleRowClick = ({ row }, event) => {
    const id = order[row];
    if (event.shiftKey && anchorRow.current != null) {
      const [a, b] = [anchorRow.current, row].sort((x, y) => x - y);
      setSelection([...selectedCellIds, ...order.slice(a, b + 1)]);
    } else if (isMulti(event)) {
      setSelection(
        selectedCellIds.includes(id)
          ? selectedCellIds.filter((c) => c !== id)
          : [...selectedCellIds, id]
      );
    } else {
      setSelection([id]);
    }
    anchorRow.current = row;
  };

  const handleTreeSelect = ([a, b], event) => {
    if (a === b) {
      handleRowClick({ row: a }, event);
      return;
    }
    const clade = order.slice(a, b + 1);
    setSelection(isMulti(event) || event.shiftKey ? [...selectedCellIds, ...clade] : clade);
  };

  /* ---- hover: tooltip here, highlighted cell shared with the tree and UMAP ---- */
  const hoveredRef = useRef(null);
  const [hoverRange, setHoverRange] = useState(null);
  const shareHover = (cellId) => {
    if (hoveredRef.current === cellId) return;
    hoveredRef.current = cellId;
    dispatch(singleCellActions.updateHover(cellId));
  };
  const clearHover = () => {
    setHover(null);
    setHoverRange(null);
    shareHover(null);
  };
  const hoverCell = (row, extra, event) => {
    if (row == null || row < 0) return clearHover();
    shareHover(order[row]);
    const cell = cellById.get(order[row]);
    const holder = canvasHolder.current?.getBoundingClientRect();
    const left = event.clientX - (holder?.left || 0) + 14;
    setHover({
      left: Math.min(left, (holder?.width || left) - 260),
      top: event.clientY - (holder?.top || 0) + 14,
      lines: [
        [t("components.single-cell.tooltip.cell"), cellLabels.full(order[row])],
        ...(cell?.clone_id != null ? [[t("components.single-cell.tooltip.clone"), cell.clone_id]] : []),
        ...annotationFields.filter((f) => cell?.[f] != null).map((f) => [f, cell[f]]),
        ...(showExpression
          ? [[
              expression.gene,
              expression.values[order[row]] == null
                ? t("components.single-cell.tooltip.no-rna")
                : expression.values[order[row]],
            ]]
          : []),
        ...(showPloidy ? ploidyTooltipLines(cell, modalPl) : []),
        ...(showTmb ? tmbTooltipLines(tmbMap.get(order[row])) : []),
        ...(extra || []),
      ],
    });
  };

  const downloadPng = () => {
    const holder = canvasHolder.current;
    if (!holder) return;
    const base = holder.getBoundingClientRect();
    const out = document.createElement("canvas");
    out.width = Math.ceil(base.width * pixelRatio);
    out.height = Math.ceil(height * pixelRatio);
    const ctx = out.getContext("2d");
    ctx.scale(pixelRatio, pixelRatio);
    ctx.fillStyle = currentPlotTheme().panel;
    ctx.fillRect(0, 0, base.width, height);
    holder.querySelectorAll("canvas").forEach((c) => {
      const r = c.getBoundingClientRect();
      ctx.drawImage(c, r.left - base.left, r.top - base.top, r.width, r.height);
    });
    const link = document.createElement("a");
    link.download = `${sc.patient?.caseReportId || "patient"}_${heatmapType}_heatmap.png`;
    link.href = out.toDataURL("image/png");
    link.click();
  };

  const typeOptions = [
    { value: "cn", label: t("components.single-cell.heatmap.cn"), disabled: cn.status !== "ok" },
    { value: "snv", label: t("components.single-cell.heatmap.snv"), disabled: !snvReady },
    {
      value: "junctions",
      label: t("components.single-cell.heatmap.junctions"),
      disabled: junctions.status !== "ok",
    },
    { value: "drivers", label: t("components.single-cell.heatmap.drivers"), disabled: !driverLayer.entries.length },
  ];
  const showSnvControls = snvReady && (heatmapType === "snv" || showSide);

  const alerts = [];
  if (tree.error) {
    alerts.push({ key: "tree", message: t("components.single-cell.errors.tree"), description: tree.error.message });
  }
  [["cn", cn], ["snv", snv], ["junctions", junctions], ["allelic", allelic]].forEach(([key, s]) => {
    if (s.status === "error") {
      alerts.push({ key, message: t(`components.single-cell.errors.${key}`), description: s.error?.message });
    }
  });
  const missingGenomes =
    heatmapType === "cn" && cnSource.status === "ok" ? cnSource.data.rows.filter((r) => !r).length : 0;

  const treeNote =
    tree.status === "ok"
      ? t(`components.single-cell.tree.${tree.method}`)
      : t("components.single-cell.tree.none");

  const ticks = useMemo(
    () => (heatmapType === "cn" && chromoBins ? genomicTicks(chromoBins, domainExtents(domains, heatWidth, DOMAIN_GAP)) : []),
    [heatmapType, chromoBins, domains, heatWidth]
  );
  const axisHeight = ticks.length ? AXIS_HEIGHT + TICK_HEIGHT : AXIS_HEIGHT;

  const isolating = Boolean(layout.snvIsolate) && snvReady && heatmapType === "snv";
  const isolateRows = useMemo(() => (isolating ? carrierRows(snv.data, snvColumns, snvRows) : null), [isolating, snv, snvColumns, snvRows]);
  const isolateBranches = useMemo(() => (isolating && snvsByBranch ? { branches: snvsByBranch.size, sites: [...snvsByBranch.values()].reduce((n, v) => n + v.length, 0) } : null), [isolating, snvsByBranch]);
  const setIsolate = (on) => {
    const patch = { snvIsolate: on };
    if (on && canShowBranchSnvs) patch.branchSnvs = true; // counts of the isolated sites on the tree branches
    dispatch(singleCellActions.updateLayout(patch));
    if (on && snvOrder !== "tree" && hasTree) dispatch(singleCellActions.updateSnvOrder("tree")); // columns grouped by best clade
  };
  const isolateSelected = () => {
    dispatch(singleCellActions.updateLayout({ snvSelectedOnly: true }));
    setIsolate(true);
  };
  const paintSelectedOnTree = () => {
    if (!canShowBranchSnvs) return;
    dispatch(singleCellActions.updateLayout({ branchSnvs: true, snvPaintSelected: !layout.snvPaintSelected }));
  };
  // signature of an SNV driver (context-only posterior from the shown fit), for the header tooltip and the drawer
  const driverSigText = (entry) => {
    if (!entry || entry.cls !== "snv") return null;
    if (entry.snvColumn == null || !snvAnnot?.sigText) return "not available (site is not in the SNV matrix, or no signature fit)";
    return snvAnnot.sigText(entry.snvColumn);
  };
  const driverHeaderShown = Boolean((heatmapType === "drivers" ? active : driverMatrix && showCnDrivers) && driverViewNow);
  const sideProps = {
    highlightRows: isolateRows && isolateRows.size < 0.5 * nRows ? isolateRows : null, // outlines only when carriers are a minority
    snv: snv.data,
    rows: snvRows,
    nRows,
    columnOrder: snvColumns,
    metric: snvMetric,
    max: snvMax,
    height,
    pixelRatio,
    axisHeight: axisHeight,
    wheelNeedsModifier: Boolean(zoomedByCmd),
    onRowClick: handleRowClick,
    // a site: drawer with its annotation and every cell's reads, IGV for several cells
    onSiteClick: (row, c) => setSiteDrawer({ c, row }),
    onHover: (row, lines, event) => hoverCell(row, lines, event),
    onLeave: clearHover,
  };

  return (
    <Wrapper>
      <Card
        size="small"
        title={
          <Space wrap>
            <ApartmentOutlined />
            <span>{t("components.single-cell.heatmap.title")}</span><Provenance id={heatmapType === "snv" ? "snvHeatmap" : heatmapType === "junctions" ? "junctionHeatmap" : heatmapType === "drivers" ? "driversHeatmap" : "cnHeatmap"} />
            <Text type="secondary">
              {t("components.single-cell.heatmap.cell-count", { count: nRows })}
            </Text>
            <Text type="secondary" className="sc-hint">
              · <Provenance id="phylogeny">{treeNote}</Provenance>
            </Text>
            {missingGenomes > 0 && (
              <span className="sc-note">
                <InfoCircleOutlined />
                {t(
                  cnMode === "total"
                    ? "components.single-cell.heatmap.missing-genomes"
                    : "components.single-cell.heatmap.missing-allelic",
                  { count: missingGenomes }
                )}
              </span>
            )}
          </Space>
        }
        extra={
          <Space wrap>
            {(heatmapType === "cn" || heatmapType === "junctions") && (
              <Tooltip title={t("components.single-cell.heatmap.zoom-in")}>
                <Button
                  size="small"
                  icon={<AiOutlineZoomIn />}
                  onClick={() =>
                    heatmapType === "cn" ? zoomAll(0.5) : junctionWheel({ x: heatWidth / 2, deltaY: -500, deltaMode: 0 })
                  }
                />
              </Tooltip>
            )}
            {(heatmapType === "cn" || heatmapType === "junctions") && (
              <Tooltip title={t("components.single-cell.heatmap.zoom-out")}>
                <Button
                  size="small"
                  icon={<AiOutlineZoomOut />}
                  onClick={() =>
                    heatmapType === "cn" ? zoomAll(2) : junctionWheel({ x: heatWidth / 2, deltaY: 500, deltaMode: 0 })
                  }
                />
              </Tooltip>
            )}
            {(heatmapType === "cn" || heatmapType === "junctions") && (
              <Tooltip title={t("components.single-cell.heatmap.whole-genome")}>
                <Button
                  size="small"
                  icon={<AiOutlineFullscreen />}
                  onClick={() =>
                    heatmapType === "cn"
                      ? defaultDomain && dispatch(settingsActions.updateDomains([defaultDomain]))
                      : setJRange(null)
                  }
                />
              </Tooltip>
            )}
            <PaletteEditor />
            <Tooltip title={t("components.single-cell.heatmap.download")}>
              <Button size="small" icon={<AiOutlineDownload />} onClick={downloadPng} />
            </Tooltip>
          </Space>
        }
      >
        <div className={heatmapType === "snv" ? undefined : "sc-toolbar-sticky"}>
        <SavedGroupsBar />
        {selectedCellIds.length > 0 && (
          <Space wrap size={[8, 4]} className="sc-group-bar">
            <Text strong>{t("components.single-cell.groups.selected", { count: selectedCellIds.length })}</Text>
            <Button size="small" onClick={() => setTreeGroup("A")}>
              {t("components.single-cell.groups.set", { side: "A" })}
            </Button>
            <Button size="small" onClick={() => setTreeGroup("B")}>
              {t("components.single-cell.groups.set", { side: "B" })}
            </Button>
            <Button size="small" onClick={() => setTreeGroup("B", true)}>
              {t("components.single-cell.groups.rest")}
            </Button>
            {(scaGroups.A || scaGroups.B) && (
              <Text type="secondary">
                {["A", "B"]
                  .filter((s) => scaGroups[s])
                  .map((s) => `${s}: ${scaGroups[s].label} (${scaGroups[s].nCells})`)
                  .join(" · ")}
              </Text>
            )}
            {sc.rna.status === "ok" && scaGroups.A && scaGroups.B && (
              <Button size="small" type="link" onClick={() => dispatch(settingsActions.updateTab("8"))}>
                {t("components.single-cell.groups.compare")}
              </Button>
            )}
            <Button size="small" type="text" onClick={() => dispatch(singleCellActions.updateSelection([]))}>
              {t("components.single-cell.selection.clear")}
            </Button>
          </Space>
        )}
        <div className="sc-toolbar">
          <div className="sc-toolbar-row">
            <Text strong className="sc-toolbar-row-label">{t("components.single-cell.toolbar.row-view")}</Text>
            <Space wrap size={[12, 6]}>

          <Segmented
            size="small"
            options={typeOptions}
            value={heatmapType}
            onChange={(value) => dispatch(singleCellActions.updateHeatmapType(value))}
          />
          {heatmapType === "cn" && (
            <Space size={4}>
              <Text type="secondary">{t("components.single-cell.toolbar.copy-number")}</Text>
              <Select
                size="small"
                style={{ width: 110 }}
                value={cnMode}
                loading={cnMode !== "total" && allelic.status === "loading"}
                onChange={(value) => dispatch(singleCellActions.updateCnMode(value))}
                options={["total", "major", "minor"].map((value) => ({
                  value,
                  label: t(`components.single-cell.cn-mode.${value}`),
                }))}
              />
            </Space>
          )}
          {heatmapType === "junctions" && junctions.status === "ok" && (
            <Space size={4} wrap>
              <Text type="secondary">Junctions</Text>
              <Select
                size="small"
                style={{ width: 330 }}
                data-junction-filter
                value={jFilter.mode === "walk" ? `walk:${jFilter.walkId}` : jFilter.mode}
                onChange={(v) => {
                  const mode = v.startsWith("walk:") ? { mode: "walk", walkId: v.slice(5) } : { mode: v, walkId: null };
                  dispatch(singleCellActions.updateLayout({ junctionFilter: mode }));
                }}
                options={[
                  { value: "all", label: "All junctions" },
                  { value: "view", label: "Touching the viewport (either breakend)" },
                  ...(jWalkOptions.length ? [{ label: "Junctions of an ecDNA / amplicon walk", options: jWalkOptions.map((w) => ({ value: `walk:${w.id}`, label: w.label })) }] : []),
                ]}
              />
              <Text type="secondary">{`${nJunctions} of ${junctions.data.junctions.length}`}</Text>
              <Segmented
                size="small"
                value={jSort}
                onChange={(v) => dispatch(singleCellActions.updateLayout({ junctionSort: v }))}
                options={[{ value: "pos", label: "By position" }, { value: "carriers", label: "By carriers" }]}
              />
            </Space>
          )}
          <Space size={4}>
            <Text type="secondary">{t("components.single-cell.toolbar.strip-width")}</Text>
            <Select
              size="small"
              style={{ width: 80 }}
              value={layout.stripWidth || 14}
              onChange={(value) => dispatch(singleCellActions.updateLayout({ stripWidth: value }))}
              options={STRIP_WIDTHS.map((value) => ({ value, label: `${value} px` }))}
            />
          </Space>
          <Space size={4}>
            <Text type="secondary">{t("components.single-cell.toolbar.row-height")}</Text>
            <Select
              size="small"
              style={{ width: 90 }}
              value={layout.rowHeight}
              onChange={(value) => dispatch(singleCellActions.updateLayout({ rowHeight: value, heatmapHeight: null }))}
              options={ROW_HEIGHTS.map((value) => ({
                value,
                label: value === "auto" ? t("components.single-cell.toolbar.fit") : `${value} px`,
              }))}
            />
          </Space>
          {annotationOptions.length > 0 && (
            <Space size={4}>
              <Text type="secondary">{t("components.single-cell.toolbar.annotate")}</Text>
              <Select
                size="small"
                mode="multiple"
                allowClear
                maxTagCount="responsive"
                style={{ minWidth: 150, maxWidth: 320 }}
                value={annotationFields}
                onChange={(value) => dispatch(singleCellActions.updateLayout({ annotationFields: value }))}
                options={annotationOptions.map((f) => ({ value: f, label: fieldLabel(f) }))}
              />
            </Space>
          )}
          <Space size={4}>
            <Text type="secondary">{t("components.single-cell.toolbar.pin")}</Text>
            <Select
              size="small"
              mode="multiple"
              allowClear
              showSearch
              maxTagCount="responsive"
              style={{ minWidth: 150, maxWidth: 340 }}
              placeholder={t("components.single-cell.toolbar.pin-placeholder")}
              value={layout.pinnedGenes || []}
              onChange={(value) => dispatch(singleCellActions.updateLayout({ pinnedGenes: value }))}
              options={(geneOptions || []).map((o) => ({ value: o.label, label: o.label }))}
              filterOption={(input, option) => option.value.toUpperCase().startsWith(input.toUpperCase())}
            />
          </Space>
          <HideLowQcControl />
          {cloneNames.length > 1 && (
            <Space size={4}>
              <Text type="secondary">{t("components.single-cell.toolbar.hide")}</Text>
              <Select
                size="small"
                mode="multiple"
                allowClear
                maxTagCount="responsive"
                style={{ minWidth: 160, maxWidth: 320 }}
                placeholder={t("components.single-cell.toolbar.hide-placeholder")}
                value={layout.hiddenClones || []}
                onChange={(value) => dispatch(singleCellActions.updateLayout({ hiddenClones: value }))}
                options={cloneNames.map((c) => ({ value: c, label: c }))}
              />
            </Space>
          )}
          {hasPloidy && (
            <Checkbox
              checked={Boolean(layout.ploidyBars)}
              onChange={(e) => dispatch(singleCellActions.updateLayout({ ploidyBars: e.target.checked }))}
            >
              <Tooltip title={t("components.single-cell.toolbar.ploidy-help")}>
                {t("components.single-cell.toolbar.ploidy")}
              </Tooltip>
            </Checkbox>
          )}
          {hasTmb && (
            <Checkbox
              checked={Boolean(layout.tmbBars)}
              onChange={(e) => dispatch(singleCellActions.updateLayout({ tmbBars: e.target.checked }))}
            >
              <Tooltip title={t("components.single-cell.toolbar.tmb-help")}>
                {t("components.single-cell.toolbar.tmb")}
              </Tooltip>
            </Checkbox>
          )}
          {tree.status === "ok" && (
            <Checkbox
              checked={layout.clipBranches}
              onChange={(e) => dispatch(singleCellActions.updateLayout({ clipBranches: e.target.checked }))}
            >
              <Tooltip title={t("components.single-cell.toolbar.clip-help")}>
                {t("components.single-cell.toolbar.clip")}
              </Tooltip>
            </Checkbox>
          )}
          {geneList.length > 0 && sc.rna.status === "ok" && (
            <Checkbox
              checked={Boolean(layout.showGenePanel)}
              onChange={(e) => dispatch(singleCellActions.updateLayout({ showGenePanel: e.target.checked }))}
            >
              {t("components.single-cell.toolbar.genes-beside", { count: geneList.length })}
            </Checkbox>
          )}
          {heatmapType === "cn" && driverLayer.entries.length > 0 && (
            <Tooltip title="Show the Drivers layer as a block of driver columns to the right of the copy-number heatmap (same cells, same filters and picker)">
              <Checkbox
                checked={Boolean(layout.cnDrivers)}
                onChange={(e) => dispatch(singleCellActions.updateLayout({ cnDrivers: e.target.checked }))}
              >
                Show drivers
              </Checkbox>
            </Tooltip>
          )}
          {snvReady && heatmapType !== "snv" && heatmapType !== "drivers" && (
            <Checkbox
              checked={sidePanel}
              onChange={(e) => dispatch(singleCellActions.updateSidePanel(e.target.checked))}
            >
              {t("components.single-cell.toolbar.side-panel")}
            </Checkbox>
          )}
            </Space>
          </div>
          {(heatmapType === "drivers" || showCnDrivers) && (
            <div className="sc-toolbar-row">
              <Text strong className="sc-toolbar-row-label">Drivers</Text>
              <DriverWidthControl
                view={driverViewNow}
                colPx={layout.driverColPx}
                onColPx={(v) => dispatch(singleCellActions.updateLayout({ driverColPx: v, ...(showCnDrivers ? fractionsToLayout(null) : {}) }))}
                onZoom={(factor) => driverZoomAt(0.5, factor)}
                onResetZoom={() => setDriverRange(null)}
              />
              <DriverControls
                driverLayer={driverLayer}
                canBranches={hasTree}
                branches={Boolean(layout.driverBranches)}
                onBranches={(value) => dispatch(singleCellActions.updateLayout({ driverBranches: value }))}
              />
            </div>
          )}
          {(showSnvControls || canShowBranchSnvs || canShowClades) && (
            <div className="sc-toolbar-row">
              <Text strong className="sc-toolbar-row-label">{t("components.single-cell.toolbar.row-snvs")}</Text>
              <Space wrap size={[12, 6]}>
          {canShowClades && (
            <Checkbox
              checked={Boolean(layout.cladeOverlay)}
              onChange={(e) => dispatch(singleCellActions.updateLayout({ cladeOverlay: e.target.checked }))}
            >
              <Tooltip title="Ring the clades called by gos_sc_clades.R and label each with its private-SNV count (clades.json).">
                Called clades ({patientClades.data.clades.length})
              </Tooltip>
            </Checkbox>
          )}
          {canShowBranchSnvs && (
            <Checkbox
              checked={Boolean(layout.branchSnvs)}
              onChange={(e) => dispatch(singleCellActions.updateLayout({ branchSnvs: e.target.checked }))}
            >
              <Tooltip title={t("components.single-cell.branch.toggle-help")}>
                {t("components.single-cell.branch.toggle")}
              </Tooltip>
            </Checkbox>
          )}
                {showSnvControls && (<>
              <Text type="secondary">{t("components.single-cell.toolbar.metric")}</Text>
              <Select
                size="small"
                style={{ width: 120 }}
                value={snvMetric}
                onChange={(value) => dispatch(singleCellActions.updateSnvMetric(value))}
                options={["vaf", "alt", "depth", ...(snv.data?.gt ? ["gt"] : [])].map((value) => ({
                  value,
                  label: t(`components.single-cell.metric.${value}`),
                }))}
              />
              <Text type="secondary">{t("components.single-cell.toolbar.order")}</Text>
              <Select
                size="small"
                style={{ width: 150 }}
                value={snvOrder}
                onChange={(value) => dispatch(singleCellActions.updateSnvOrder(value))}
                options={["tree", "genomic", "prevalence", "catalog"].map((value) => ({
                  value,
                  label: t(`components.single-cell.snv.order-${value}`),
                  disabled: value === "tree" && !hasTree,
                }))}
              />
              {hasCategories && (
                <>
                  <Text type="secondary">{t("components.single-cell.snv.sites")}</Text>
                  <Select
                    size="small"
                    mode="multiple"
                    allowClear
                    maxTagCount="responsive"
                    style={{ minWidth: 200 }}
                    placeholder={t("components.single-cell.snv.all-sites")}
                    value={snvCategories || []}
                    onChange={(value) => setSnvCategories(value.length ? value : null)}
                    options={SNV_CATEGORIES.filter((c) => categoryCounts[c.key]).map((c) => ({
                      value: c.key,
                      label: (
                        <span>
                          <span className="sc-swatch" style={{ background: c.color }} />
                          {t(`components.single-cell.snv.category-${c.key}`)} ({categoryCounts[c.key]})
                        </span>
                      ),
                    }))}
                  />
                  <Checkbox checked={cellphyOnly} onChange={(e) => setCellphyOnly(e.target.checked)}>
                    {t("components.single-cell.snv.cellphy-only")}
                  </Checkbox>
                  {snvSiteIds?.length > 0 && (
                    <Tag closable color="blue" onClose={() => dispatch(singleCellActions.updateLayout({ snvSiteIds: null }))}>
                      {t("components.single-cell.events.filter-tag", { count: snvSiteIds.length })}
                    </Tag>
                  )}
                  {hasCladeScores(snv.data) && (
                    <Tooltip title={t("components.single-cell.snv.clade-score-help")}>
                      <Select
                        size="small"
                        style={{ width: 150 }}
                        value={snvMinCladeScore || 0}
                        onChange={(value) => dispatch(singleCellActions.updateLayout({ snvMinCladeScore: value || null }))}
                        options={[0, 0.5, 0.7, 0.8, 0.9].map((value) => ({
                          value,
                          label: value ? t("components.single-cell.snv.clade-score-min", { value }) : t("components.single-cell.snv.clade-score-any"),
                        }))}
                      />
                    </Tooltip>
                  )}
                  {nAmplified > 0 && (
                    <Tooltip title={t("components.single-cell.snv.amplified-help")}>
                      <Checkbox checked={amplifiedOnly} onChange={(e) => dispatch(singleCellActions.updateLayout({ snvAmplifiedOnly: e.target.checked }))}>
                        {t("components.single-cell.snv.amplified-only", { count: nAmplified })}
                      </Checkbox>
                    </Tooltip>
                  )}
                  {nDrivers > 0 && (
                    <Checkbox checked={driversOnly} onChange={(e) => setDriversOnly(e.target.checked)}>
                      {t("components.single-cell.snv.drivers-only", { count: nDrivers })}
                    </Checkbox>
                  )}
                  <div style={{ width: "100%" }}>
                    <SnvTrackControls annot={snvAnnot} nShown={snvColumns.length} onIsolate={setIsolate} fitBusy={snvFitBusy} />
                  </div>
                  <div style={{ width: "100%" }}>
                    <SnvSelectionBar snv={snv.data} annot={snvAnnot} patient={sc.patient?.caseReportId || ""} onIsolate={isolateSelected} onPaint={canShowBranchSnvs ? paintSelectedOnTree : null} painted={showBranchSnvs && paintSelected} />
                  </div>
                </>
              )}
            </>)}
              </Space>
            </div>
          )}
        </div>
        </div>
        {alerts.map((a) => (
          <Alert key={a.key} type="warning" showIcon className="sc-alert" message={a.message} description={a.description} />
        ))}
        <div ref={containerRef} className="sc-heatmap-container">
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <StripLabels
              left={leftPad + treeBlock}
              columnWidth={ANNOTATION_COLUMN}
              labels={[
                t("components.single-cell.heatmap.strip-selected"),
                t("components.single-cell.heatmap.strip-clone"),
                ...annotationFields.map(fieldLabel),
                ...(showExpression ? [expression.gene] : []),
                ...(showPloidy ? [t("components.single-cell.heatmap.strip-ploidy"), "", ""] : []),
                ...(showTmb ? [t("components.single-cell.heatmap.strip-tmb"), "", ""] : []),
              ]}
            />
            {driverHeaderShown && (
              // the canvas row: strips, GAP, drag handle, GAP, then the heatmap (beside CN: after the CN heatmap and a GAP)
              <div style={{ marginLeft: STRIP_HANDLE + 2 * GAP + (showCnDrivers ? heatWidth + GAP : 0), width: driverViewNow.width, flex: "none" }}>
                <DriverColumnHeader
                  sigText={driverSigText}
                  entries={driverVisible}
                  width={driverViewNow.width}
                  pixelRatio={pixelRatio}
                  hoverKey={driverHover}
                  openKey={sc.driverDrawer}
                  onOpen={(key) => dispatch(singleCellActions.updateDriverDrawer(key))}
                />
              </div>
            )}
            {heatmapType === "junctions" && active && junctions.status === "ok" && (
              <div style={{ marginLeft: STRIP_HANDLE + 2 * GAP, width: heatWidth, flex: "none" }}>
                <JunctionColumnHeader
                  columns={jCols.slice(...(jRange || [0, nJunctions])).map((k) => ({ j: junctions.data.junctions[k], ...jStats[k] }))}
                  width={heatWidth}
                  pixelRatio={pixelRatio}
                  onClick={(d, e) => {
                    const ids = junctionCarrierRows(junctions.data, d.j.index).map((r) => junctions.data.cells[r]);
                    setSelection(ids);
                    if (e.shiftKey && chromoBins) {
                      const pad = Math.max(5e4, Math.abs(d.j.global2 - d.j.global1) * 0.1);
                      const near = (g) => [Math.max(1, g - pad), g + pad];
                      dispatch(settingsActions.updateDomains(d.j.global2 - d.j.global1 > 4 * pad ? [near(d.j.global1), near(d.j.global2)] : [[Math.max(1, d.j.global1 - pad), d.j.global2 + pad]]));
                    }
                  }}
                />
              </div>
            )}
            {showSide && snvTrackProps.tracks.length > 0 && (
              // beside the CN heatmap: after the CN heatmap (and the drivers header, when drawn) and a GAP
              <div
                ref={setBesideHeader}
                style={{
                  marginLeft: driverHeaderShown ? GAP : STRIP_HANDLE + 2 * GAP + heatWidth + GAP,
                  width: sideWidth,
                  flex: "none",
                  paddingBottom: 2,
                }}
              />
            )}
            {heatmapType === "snv" && snvTrackProps.tracks.length > 0 && (
              <div ref={setSnvHeader} style={{ marginLeft: GAP, width: heatWidth, flex: "none", paddingBottom: 2 }} />
            )}
          </div>
          <div ref={canvasHolder} className="sc-heatmap-row" style={{ minHeight: height }}>
            {leftPad > 0 && <div style={{ width: leftPad - GAP, flex: "none" }} />}
            {hasTree && (
              <PhylogenyCanvas
                layout={treeLayout}
                nRows={nRows}
                width={treeWidth}
                height={height}
                pixelRatio={pixelRatio}
                leafClones={leafClones}
                cloneColors={cloneColors}
                selectedLeafRange={selectedLeafRange}
                selectedRows={selectedRows}
                hoverRow={hoverRow}
                onSelectRange={handleTreeSelect}
                branchCounts={branchCounts}
                branchMarks={driverMarks}
                cladeLabels={cladeLabels}
                onSelectNode={(k) => (snvsByBranch?.has(k) || treeLayout?.nodes[k]?.isLeaf === false) && setBranchNode(k)}
                hoverRange={hoverRange}
                onHoverNode={(node, event) => {
                  if (!node) return clearHover();
                  if (node.isLeaf) {
                    setHoverRange(null);
                    return hoverCell(node.firstLeaf, [], event);
                  }
                  // A clade: highlight all of it, not its first cell.
                  hoverCell(
                    node.firstLeaf,
                    [[
                      t("components.single-cell.tooltip.clade"),
                      t("components.single-cell.heatmap.cell-count", { count: node.lastLeaf - node.firstLeaf + 1 }),
                    ]],
                    event
                  );
                  shareHover(null);
                  setHoverRange([node.firstLeaf, node.lastLeaf]);
                  return undefined;
                }}
              />
            )}
            {hasTree && (
              <div
                className="sc-resize-handle"
                style={{ height, width: HANDLE_WIDTH - 2 * GAP, flex: "none" }}
                title={t("components.single-cell.heatmap.resize-tree")}
                onMouseDown={startTreeDrag}
                onDoubleClick={() => dispatch(singleCellActions.updateLayout({ treeWidth: 220 }))}
              />
            )}
            <HeatmapCanvas
              width={annotationWidth}
              height={height}
              nRows={nRows}
              cols={annotationCols}
              colorAt={annotationColor}
              pixelRatio={pixelRatio}
              onClick={handleRowClick}
              onHover={({ row }, event) => hoverCell(row, null, event)}
              onLeave={clearHover}
            />
            <div
              className="sc-resize-handle"
              style={{ height, width: 6, flex: "none" }}
              title={t("components.single-cell.toolbar.strip-width")}
              onMouseDown={startStripDrag}
              onDoubleClick={() => dispatch(singleCellActions.updateLayout({ stripWidth: 14 }))}
            />
            {heatmapType === "snv" && snvReady ? (
              <MutationSidePanel
                {...sideProps}
                categoryNode={snvHeader}
                {...snvTrackProps}
                trackLabelSide="right"
                width={heatWidth}
                groupOf={snvOrder === "genomic" ? chromosomeOfVariant : null}
              />
            ) : (
              <div style={{ width: heatWidth }}>
                {active ? (
                  <div ref={heatmapType === "drivers" ? driverWheelBox : wheelBox} style={{ overflow: "hidden", width: heatWidth }}>
                  <HeatmapCanvas
                    style={preview ? { transform: preview, transformOrigin: "0 0" } : undefined}
                    width={active.width ?? heatWidth}
                    height={height}
                    nRows={nRows}
                    cols={active.cols}
                    colorAt={active.colorAt}
                    pixelRatio={pixelRatio}
                    separators={active.axis.separators}
                    onClick={(hit, event) => {
                      handleRowClick(hit, event);
                      // Drivers layer: a click on a cell also opens that driver's drawer
                      if (heatmapType === "drivers" && hit.col >= 0 && driverVisible[hit.col]) dispatch(singleCellActions.updateDriverDrawer(driverVisible[hit.col].key));
                    }}
                    onDrag={heatmapType === "cn" ? handlePan : heatmapType === "junctions" ? junctionDrag : heatmapType === "drivers" ? driverDrag : undefined}
                    onDoubleClick={
                      heatmapType === "cn"
                        ? ({ x }) => handleWheelZoom({ x, deltaY: -500, deltaMode: 0 })
                        : heatmapType === "junctions"
                        ? ({ x }) => junctionWheel({ x, deltaY: -500, deltaMode: 0 })
                        : heatmapType === "drivers"
                        ? ({ x }) => driverWheel({ x, deltaY: -500, deltaMode: 0 })
                        : undefined
                    }
                    onHover={({ row, col }, event) => {
                      if (heatmapType === "drivers") setDriverHover(driverVisible[col]?.key ?? null);
                      hoverCell(row, active.describe(row, col), event);
                    }}
                    onLeave={() => {
                      setDriverHover(null);
                      clearHover();
                    }}
                  />
                  </div>
                ) : (
                  <div className="sc-heatmap-empty" style={{ width: heatWidth, height }}>
                    <Text type="secondary">
                      {heatmapType === "cn" && cnSource.status === "loading"
                        ? t("components.single-cell.heatmap.loading-allelic")
                        : t("components.single-cell.heatmap.no-matrix")}
                    </Text>
                  </div>
                )}
                {active && heatmapType !== "drivers" && (
                  <div className="sc-axis" style={{ width: heatWidth, height: axisHeight }}>
                    {ticks.map((tk, k) => (
                      <span key={`tick-${k}`} className="sc-axis-tick" style={{ left: tk.x, top: AXIS_HEIGHT - 2 }} title={`chr${tk.chromosome}:${tk.label}`}>
                        {tk.label}
                      </span>
                    ))}
                    {active.axis.spans
                      .filter((s) => s.x1 - s.x0 >= 14)
                      .map((s, k) => (
                        <span
                          key={`${s.chromosome}-${k}`}
                          className={heatmapType === "cn" ? "sc-axis-label sc-axis-link" : "sc-axis-label"}
                          style={{ left: s.x0, width: s.x1 - s.x0 }}
                          title={
                            heatmapType === "cn"
                              ? t("components.single-cell.heatmap.zoom-chromosome", { chromosome: s.chromosome })
                              : s.chromosome
                          }
                          onClick={() => {
                            const c = chromoBins[s.chromosome];
                            if (heatmapType === "cn" && c) {
                              dispatch(settingsActions.updateDomains([[c.startPlace, c.endPlace]]));
                            }
                          }}
                        >
                          {s.chromosome}
                        </span>
                      ))}
                  </div>
                )}
              </div>
            )}
            {driverBeside && driverMatrix && (
              <div style={{ position: "relative", width: driverBeside.width, flex: "none" }}>
                <div
                  className="sc-width-handle"
                  title={splitTitle}
                  onMouseDown={startSplitDrag("cn")}
                  onDoubleClick={resetSplit}
                />
                <div ref={driverWheelBox} style={{ overflow: "hidden", width: driverBeside.width }}>
                  <HeatmapCanvas
                    width={driverMatrix.width}
                    height={height}
                    nRows={nRows}
                    cols={driverMatrix.cols}
                    colorAt={driverMatrix.colorAt}
                    pixelRatio={pixelRatio}
                    onClick={(hit, event) => {
                      handleRowClick(hit, event);
                      if (hit.col >= 0 && driverVisible[hit.col]) dispatch(singleCellActions.updateDriverDrawer(driverVisible[hit.col].key));
                    }}
                    onDrag={driverDrag}
                    onDoubleClick={({ x }) => driverWheel({ x, deltaY: -500, deltaMode: 0 })}
                    onHover={({ row, col }, event) => {
                      setDriverHover(driverVisible[col]?.key ?? null);
                      hoverCell(row, driverMatrix.describe(row, col), event);
                    }}
                    onLeave={() => {
                      setDriverHover(null);
                      clearHover();
                    }}
                  />
                </div>
              </div>
            )}
            {showSide && (
              <div style={{ position: "relative" }}>
                <div
                  className="sc-width-handle"
                  title={splitTitle}
                  onMouseDown={startSplitDrag(driverBeside ? "drv" : "cn")}
                  onDoubleClick={resetSplit}
                />
                <MutationSidePanel {...sideProps} width={sideWidth} categoryNode={besideHeader} {...snvTrackProps} trackLabelSide="right" />
              </div>
            )}
            {showGenes && (
              <div style={{ position: "relative" }}>
              <div
                className="sc-width-handle"
                title={t("components.single-cell.heatmap.resize-panel")}
                onMouseDown={startWidthDrag(geneWidth, setDragGene, "geneWidth")}
                onDoubleClick={() => dispatch(singleCellActions.updateLayout({ geneWidth: null }))}
              />
              <ExpressionSidePanel
                genes={geneList}
                order={order}
                width={geneWidth}
                height={height}
                pixelRatio={pixelRatio}
                onRowClick={handleRowClick}
                onHover={(row, lines, event) => hoverCell(row, lines, event)}
                onLeave={clearHover}
                onGeneClick={setCardGene}
              />
              </div>
            )}
            {heatmapType === "cn" && (
              <PinnedGenesOverlay left={genomeLeft} width={heatWidth} top={0} bottom={0} />
            )}
            {selectedRuns.map(([a, b]) => (
              <div
                key={`sel${a}`}
                className="sc-select-band"
                style={{
                  top: (a * height) / nRows,
                  height: Math.max(2, ((b - a + 1) * height) / nRows),
                  left: leftPad + treeBlock,
                }}
              />
            ))}
            {hoverRange && (
              <div
                className="sc-hover-band sc-hover-clade"
                style={{
                  top: (hoverRange[0] * height) / nRows,
                  height: Math.max(2, ((hoverRange[1] - hoverRange[0] + 1) * height) / nRows),
                  left: leftPad + treeBlock,
                }}
              />
            )}
            {!hoverRange && hoverRow != null && (
              <div
                className="sc-hover-band"
                style={{
                  top: (hoverRow * height) / nRows,
                  height: Math.max(2, height / nRows),
                  left: leftPad + treeBlock,
                }}
              />
            )}
            {hover && (
              <div className="sc-tooltip" style={{ left: Math.max(0, hover.left), top: hover.top }}>
                {hover.lines.map(([k, v]) => (
                  <div key={k}>
                    <span className="sc-tooltip-key">{k}</span> {`${v}`}
                  </div>
                ))}
              </div>
            )}
          </div>
          <HeightHandle
            title={t("components.single-cell.heatmap.resize-height")}
            onResize={(dy) => setDragHeight(clampHeight(baseHeight + dy))}
            onCommit={(dy) => {
              dispatch(singleCellActions.updateLayout({ heatmapHeight: clampHeight(baseHeight + dy) }));
              setDragHeight(null);
            }}
            onReset={() => dispatch(singleCellActions.updateLayout({ heatmapHeight: null }))}
          />
          <div className="sc-heatmap-footer">
            <HeatmapLegend
              type={heatmapType}
              cnMode={cnMode}
              palette={palette}
              snvMetric={showSnvControls ? snvMetric : null}
              snvMax={snvMax}
              maxJunctionCn={junctions.data?.maxCn}
              cloneColors={cloneColors}
              expression={showExpression ? expression : null}
              drivers={heatmapType === "drivers" ? { colors: driverColors(), palette, entries: driverEntries.map((c) => c.entry) } : null}
            />
            {annotationFields.map((f) => (
              <Space key={f} size={4} wrap className="sc-legend">
                <Text strong type="secondary">{fieldLabel(f)}</Text>
                {Object.entries(annotationLevels[f] || {}).map(([level, color]) => (
                  <span key={level} className="sc-legend-item">
                    <span className="sc-legend-swatch" style={{ background: color }} />
                    <Text type="secondary">{level}</Text>
                  </span>
                ))}
              </Space>
            ))}
            {showPloidy && modalPl != null && (
              <Space size={4} wrap className="sc-legend">
                <Text strong type="secondary">{t("components.single-cell.heatmap.strip-ploidy")}</Text>
                {[[-1.5, "below"], [0, `mode ${modalPl.toFixed(2)}`], [1.5, "above"]].map(([dev, label]) => (
                  <span key={label} className="sc-legend-item">
                    <span className="sc-legend-swatch" style={{ background: ploidyDeviationColor(dev) }} />
                    <Text type="secondary">{label}</Text>
                  </span>
                ))}
                <Text type="secondary">{`bar = 0–${ploidyMax.toFixed(1)}`}</Text>
              </Space>
            )}
            {showTmb && tmbMax != null && (
              <Space size={4} wrap className="sc-legend">
                <Text strong type="secondary">{t("components.single-cell.heatmap.strip-tmb")}</Text>
                <span className="sc-legend-item">
                  <span className="sc-legend-swatch" style={{ background: tmbBarColor({ sensitivity: 1 }) }} />
                  <Text type="secondary">{t("components.single-cell.heatmap.tmb-legend-ok")}</Text>
                </span>
                <span className="sc-legend-item">
                  <span className="sc-legend-swatch" style={{ background: tmbBarColor(null) }} />
                  <Text type="secondary">{t("components.single-cell.heatmap.tmb-legend-nosens")}</Text>
                </span>
                <Text type="secondary">{`bar = 0–${fmtTmb(tmbMax)} mut/Mb`}</Text>
              </Space>
            )}
            <HintLine text={t("components.single-cell.heatmap.hint")} style={{ flex: "1 1 240px" }} />
          </div>
        </div>
      </Card>
      {isolating && <SnvIsolatePanel snv={snv.data} columns={snvColumns} annot={snvAnnot} branchInfo={isolateBranches} carrierCount={isolateRows ? isolateRows.size : null} patient={sc.patient?.caseReportId || ""} />}
      {siteDrawer && snvReady && snv.data.variants[siteDrawer.c] && (
        <SnvSiteDrawer open onClose={() => setSiteDrawer(null)} variant={snv.data.variants[siteDrawer.c]} order={order} rows={snvRows} clickedRow={siteDrawer.row} cnInfo={snvCn?.[siteDrawer.c] || null} />
      )}
      {branchNode != null && treeLayout?.nodes[branchNode] && (
        <BranchDiffDrawer
          open
          onClose={() => setBranchNode(null)}
          layout={treeLayout}
          node={branchNode}
          snv={snvsByBranch ? snv.data : null}
          variantIdx={snvsByBranch?.get(branchNode) || []}
        />
      )}
      {sc.driverDrawer && driverLayer.entries.find((d) => d.key === sc.driverDrawer) && (
        <DriverLayerDrawer
          sigText={driverSigText}
          entry={driverLayer.entries.find((d) => d.key === sc.driverDrawer)}
          driverLayer={driverLayer}
          onClose={() => dispatch(singleCellActions.updateDriverDrawer(null))}
        />
      )}
      <GeneInfoDrawer gene={cardGene} onClose={() => setCardGene(null)} />
    </Wrapper>
  );
}
