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
import SnvSiteDrawer from "./snvSiteDrawer";
import SavedGroupsBar from "./savedGroupsBar";
import { branchVariants, hasAnchors } from "../../helpers/singleCell/branchSnvs";
import { themePalette } from "../../helpers/singleCell/themes";
import { layoutTree } from "../../helpers/singleCell/newick";
import HeatmapLegend from "./heatmapLegend";
import MutationSidePanel, { SNV_CATEGORIES } from "./mutationSidePanel";
import { filterSnvColumns, hasCladeScores } from "../../helpers/singleCell/snvSites";
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
  junctionColumnOrder,
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

const { Text } = Typography;
const STRIP_WIDTHS = [6, 9, 14, 20, 28, 40]; // px per strip: selection, clone, metadata fields, expression
const NOT_ANNOTATIONS = new Set(["pair", "entry_type", "patient_id", "clone_id", "cell_id", "tumor_type", "disease", "primary_site", "summary", "caseReportId"]);
const GAP = 4;
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
  const anchorRow = useRef(null);
  const canvasHolder = useRef(null);

  const {
    cells,
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
  const showSide = sidePanel && snvReady && heatmapType !== "snv";
  // Side panel widths: dragged (live), saved in the layout, or automatic.
  const [dragSide, setDragSide] = useState(null);
  const [dragGene, setDragGene] = useState(null);
  const maxSide = Math.max(120, containerWidth * 0.6);
  const sideWidth = showSide
    ? Math.round(Math.max(100, Math.min(maxSide, dragSide ?? layout.sideWidth ?? sidePanelWidth(containerWidth))))
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
  const annotationFields = (layout.annotationFields || []).filter((f) => annotationOptions.includes(f));
  const annotationLevels = useMemo(
    () => Object.fromEntries(annotationFields.map((f) => [f, annotationColors(cells.map((c) => c[f]).filter((v) => v != null && v !== ""), themePalette(layout.theme))])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layout.theme, cells, annotationFields.join("|")]
  );
  const nAnnotation = 2 + annotationFields.length + (showExpression ? 1 : 0);
  const ANNOTATION_COLUMN = layout.stripWidth || 14;
  const annotationWidth = ANNOTATION_COLUMN * nAnnotation;
  // Genomic columns start at genomeLeft and leave rightSpace, wide enough for
  // the 50 px-margin genome plots (and the nested cell tracks) to be padded to match.
  const leftPad = Math.max(0, MIN_GENOME_LEFT - (treeBlock + annotationWidth + GAP));
  const genomeLeft = leftPad + treeBlock + annotationWidth + GAP;
  const rightSpace = Math.max(
    MIN_GENOME_RIGHT,
    (showSide ? sideWidth + GAP : 0) + (showGenes ? geneWidth + GAP : 0)
  );
  const heatWidth = Math.max(200, containerWidth - genomeLeft - rightSpace);
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
  const { snvCategories, snvCellphyOnly: cellphyOnly, snvDriversOnly: driversOnly, snvSiteIds, snvMinCladeScore } = layout;
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
  const snvColumns = useMemo(() => {
    if (!snvReady) return [];
    const all = snvOrder === "tree" ? treeColumnOrder(snv.data, treeLayout, snvRows) : snvColumnOrder(snv.data, snvOrder);
    const filtered = filterSnvColumns(snv.data, all, { snvCategories, snvCellphyOnly: cellphyOnly, snvDriversOnly: driversOnly, snvSiteIds, snvMinCladeScore });
    return amplifiedOnly && snvCn ? filtered.filter((c) => snvCn[c]?.amplified) : filtered;
  }, [snvReady, snv, snvOrder, treeLayout, snvRows, snvCategories, cellphyOnly, driversOnly, snvSiteIds, snvMinCladeScore, amplifiedOnly, snvCn]);
  const [snvHeader, setSnvHeader] = useState(null);

  // SNVs per branch: sites placed on the file tree by their anchors (needs tree.nwk)
  const fullTreeLayout = useMemo(
    () => (tree.status === "ok" && tree.method === "file" && tree.data?.source ? layoutTree(tree.data.source) : null),
    [tree]
  );
  const canShowBranchSnvs = Boolean(fullTreeLayout && hasTree && snvReady && hasAnchors(snv.data));
  const showBranchSnvs = canShowBranchSnvs && Boolean(layout.branchSnvs);
  const snvsByBranch = useMemo(
    () => (showBranchSnvs ? branchVariants(snv.data, snvColumns, treeLayout, fullTreeLayout) : null),
    [showBranchSnvs, snv, snvColumns, treeLayout, fullTreeLayout]
  );
  const branchCounts = useMemo(
    () => (snvsByBranch ? new Map([...snvsByBranch].map(([k, v]) => [k, v.length])) : null),
    [snvsByBranch]
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
  const nJunctions = junctions.status === "ok" ? junctions.data.junctions.length : 0;
  useEffect(() => setJRange(null), [nJunctions]);
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
      const columnOrder = junctionColumnOrder(m.junctions).slice(js, je);
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
    return null;
  }, [heatmapType, cnSource, cnMode, cnColor, junctions, jRange, order, domains, heatWidth, devWidth, pixelRatio, chromoBins, t]);

  const annotationCols = useMemo(
    () => discreteColumnLookup(nAnnotation, annotationWidth * pixelRatio),
    [nAnnotation, annotationWidth, pixelRatio]
  );
  const annotationColor = useCallback(
    (r, c) => {
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
    [selectedRows, cellById, order, cloneColors, expression, annotationLevels, annotationFields.join("|"), stripBlank]
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
        [t("components.single-cell.tooltip.cell"), order[row]],
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

  const sideProps = {
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
            <span>{t("components.single-cell.heatmap.title")}</span><Provenance id={heatmapType === "snv" ? "snvHeatmap" : heatmapType === "junctions" ? "junctionHeatmap" : "cnHeatmap"} />
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
        <div className="sc-toolbar-sticky">
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
                options={annotationOptions.map((f) => ({ value: f, label: f }))}
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
          {snvReady && heatmapType !== "snv" && (
            <Checkbox
              checked={sidePanel}
              onChange={(e) => dispatch(singleCellActions.updateSidePanel(e.target.checked))}
            >
              {t("components.single-cell.toolbar.side-panel")}
            </Checkbox>
          )}
            </Space>
          </div>
          {(showSnvControls || canShowBranchSnvs) && (
            <div className="sc-toolbar-row">
              <Text strong className="sc-toolbar-row-label">{t("components.single-cell.toolbar.row-snvs")}</Text>
              <Space wrap size={[12, 6]}>
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
                ...annotationFields,
                ...(showExpression ? [expression.gene] : []),
              ]}
            />
            {heatmapType === "snv" && hasCategories && (
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
                width={heatWidth}
                groupOf={snvOrder === "genomic" ? chromosomeOfVariant : null}
              />
            ) : (
              <div style={{ width: heatWidth }}>
                {active ? (
                  <div ref={wheelBox} style={{ overflow: "hidden", width: heatWidth }}>
                  <HeatmapCanvas
                    style={preview ? { transform: preview, transformOrigin: "0 0" } : undefined}
                    width={heatWidth}
                    height={height}
                    nRows={nRows}
                    cols={active.cols}
                    colorAt={active.colorAt}
                    pixelRatio={pixelRatio}
                    separators={active.axis.separators}
                    onClick={handleRowClick}
                    onDrag={heatmapType === "cn" ? handlePan : heatmapType === "junctions" ? junctionDrag : undefined}
                    onDoubleClick={
                      heatmapType === "cn"
                        ? ({ x }) => handleWheelZoom({ x, deltaY: -500, deltaMode: 0 })
                        : heatmapType === "junctions"
                        ? ({ x }) => junctionWheel({ x, deltaY: -500, deltaMode: 0 })
                        : undefined
                    }
                    onHover={({ row, col }, event) => hoverCell(row, active.describe(row, col), event)}
                    onLeave={clearHover}
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
                {active && (
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
            {showSide && (
              <div style={{ position: "relative" }}>
                <div
                  className="sc-width-handle"
                  title={t("components.single-cell.heatmap.resize-panel")}
                  onMouseDown={startWidthDrag(sideWidth, setDragSide, "sideWidth")}
                  onDoubleClick={() => dispatch(singleCellActions.updateLayout({ sideWidth: null }))}
                />
                <MutationSidePanel {...sideProps} width={sideWidth} />
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
            />
            {annotationFields.map((f) => (
              <Space key={f} size={4} wrap className="sc-legend">
                <Text strong type="secondary">{f}</Text>
                {Object.entries(annotationLevels[f] || {}).map(([level, color]) => (
                  <span key={level} className="sc-legend-item">
                    <span className="sc-legend-swatch" style={{ background: color }} />
                    <Text type="secondary">{level}</Text>
                  </span>
                ))}
              </Space>
            ))}
            <HintLine text={t("components.single-cell.heatmap.hint")} style={{ flex: "1 1 240px" }} />
          </div>
        </div>
      </Card>
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
    </Wrapper>
  );
}
