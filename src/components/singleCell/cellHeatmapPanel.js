import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Alert, Button, Card, Checkbox, Segmented, Select, Space, Tooltip, Typography } from "antd";
import { ApartmentOutlined } from "@ant-design/icons";
import { AiOutlineDownload, AiOutlineFullscreen, AiOutlineZoomIn, AiOutlineZoomOut } from "react-icons/ai";
import HeatmapCanvas from "./heatmapCanvas";
import PhylogenyCanvas from "./phylogenyCanvas";
import HeatmapLegend from "./heatmapLegend";
import MutationSidePanel from "./mutationSidePanel";
import PaletteEditor from "./paletteEditor";
import HeightHandle from "./heightHandle";
import ExpressionSidePanel, { GENE_COLUMN_WIDTH } from "./expressionSidePanel";
import useContainerWidth from "./useContainerWidth";
import usePixelRatio from "./usePixelRatio";
import singleCellActions from "../../redux/singleCell/actions";
import settingsActions from "../../redux/settings/actions";
import { clipLongBranches, longBranchCap, treeForCells } from "../../helpers/singleCell/newick";
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
} from "../../helpers/singleCell/matrix";
import Wrapper from "./index.style";

const { Text } = Typography;
const ANNOTATION_WIDTH = 18;
const ANNOTATION_WIDTH_EXPR = 30;
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
const SELECTED_RGBA = packRGBA(hexToRgb("#262626"));
const UNSELECTED_RGBA = packRGBA(hexToRgb("#FFFFFF"));

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
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const sc = useSelector((state) => state.SingleCell);
  const { domains, chromoBins, defaultDomain, genomeLength, zoomedByCmd } = useSelector((state) => state.Settings);
  const expression = useSelector((state) => state.ScAnalysis.expression);
  const geneList = useSelector((state) => state.ScAnalysis.geneList);
  const showExpression = expression.status === "ok" && Boolean(expression.values);
  const [containerRef, containerWidth] = useContainerWidth();
  const pixelRatio = usePixelRatio();
  const [hover, setHover] = useState(null);
  const anchorRow = useRef(null);
  const canvasHolder = useRef(null);

  const {
    order: fullOrder,
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
  const hiddenKey = (layout.hiddenClones || []).join("|");
  const view = useMemo(() => {
    const hidden = new Set(layout.hiddenClones || []);
    let rows = fullOrder;
    let treeLayout = tree.status === "ok" ? tree.data?.layout || null : null;
    if (hidden.size) {
      rows = fullOrder.filter((id) => !hidden.has(cellById.get(id)?.clone_id));
      if (tree.status === "ok" && tree.data?.source) {
        const built = treeForCells(tree.data.source, rows);
        treeLayout = built.layout;
        rows = [...(built.layout?.leaves || []), ...rows.filter((id) => built.unplaced.includes(id))];
      }
    }
    if (treeLayout && layout.clipBranches) treeLayout = clipLongBranches(treeLayout, longBranchCap(treeLayout));
    return { rows, treeLayout };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullOrder, tree, cellById, hiddenKey, layout.clipBranches]);
  const order = view.rows;
  const treeLayout = view.treeLayout;
  const nRows = order.length;
  const hasTree = Boolean(treeLayout);
  const [dragTreeWidth, setDragTreeWidth] = useState(null);
  const treeWidth = hasTree
    ? Math.max(TREE_MIN, Math.min(TREE_MAX, dragTreeWidth ?? layout.treeWidth, containerWidth - 400))
    : 0;
  const treeBlock = hasTree ? treeWidth + HANDLE_WIDTH : 0;
  const snvReady = snv.status === "ok";
  const showSide = sidePanel && snvReady && heatmapType !== "snv";
  const sideWidth = showSide ? sidePanelWidth(containerWidth) : 0;
  const showGenes = Boolean(layout.showGenePanel) && geneList.length > 0 && sc.rna.status === "ok";
  const geneWidth = showGenes ? Math.max(60, Math.min(400, GENE_COLUMN_WIDTH * geneList.length)) : 0;
  // Annotation strip: selection, clone, and the searched gene's expression when shown.
  const annotationWidth = showExpression ? ANNOTATION_WIDTH_EXPR : ANNOTATION_WIDTH;
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
  const snvColumns = useMemo(() => {
    if (!snvReady) return [];
    if (snvOrder === "tree") return treeColumnOrder(snv.data, treeLayout, snvRows);
    return snvColumnOrder(snv.data, snvOrder);
  }, [snvReady, snv, snvOrder, treeLayout, snvRows]);
  const snvMax = useMemo(() => (snvReady ? snvMetricMax(snv.data, snvMetric) : 1), [snvReady, snv, snvMetric]);
  const chromosomeOfVariant = useCallback((c) => snv.data?.variants[c]?.chromosome ?? null, [snv]);

  /* ---- copy number: total from complex.json, major/minor from allelic.json ---- */
  const cnSource = cnMode === "total" ? cn : allelic;
  const cnColor = useMemo(() => cnColorer(palette, cnMode), [palette, cnMode]);

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
      const columnOrder = junctionColumnOrder(m.junctions);
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
  }, [heatmapType, cnSource, cnMode, cnColor, junctions, order, domains, heatWidth, devWidth, pixelRatio, chromoBins, t]);

  const annotationCols = useMemo(
    () => discreteColumnLookup(showExpression ? 3 : 2, annotationWidth * pixelRatio),
    [showExpression, annotationWidth, pixelRatio]
  );
  const annotationColor = useCallback(
    (r, c) => {
      if (c === 0) return selectedRows.has(r) ? SELECTED_RGBA : UNSELECTED_RGBA;
      if (c === 2) return expressionRGBA(expression.values?.[order[r]], expression.max);
      const clone = cellById.get(order[r])?.clone_id;
      return clone != null && cloneColors[clone] ? packRGBA(hexToRgb(cloneColors[clone])) : MISSING_RGBA;
    },
    [selectedRows, cellById, order, cloneColors, expression]
  );

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
  const shareHover = (cellId) => {
    if (hoveredRef.current === cellId) return;
    hoveredRef.current = cellId;
    dispatch(singleCellActions.updateHover(cellId));
  };
  const clearHover = () => {
    setHover(null);
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
    ctx.fillStyle = "#ffffff";
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

  const sideProps = {
    snv: snv.data,
    rows: snvRows,
    nRows,
    columnOrder: snvColumns,
    metric: snvMetric,
    max: snvMax,
    height,
    pixelRatio,
    axisHeight: AXIS_HEIGHT,
    wheelNeedsModifier: Boolean(zoomedByCmd),
    onRowClick: handleRowClick,
    onSiteClick: (row, c) => {
      const v = snv.data.variants[c];
      dispatch(
        singleCellActions.openIgv({
          cellIds: [order[row]],
          chromosome: v.chromosome,
          position: v.position,
          label: v.id,
        })
      );
    },
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
            <span>{t("components.single-cell.heatmap.title")}</span>
            <Text type="secondary">
              {t("components.single-cell.heatmap.cell-count", { count: nRows })}
            </Text>
            <Text type="secondary" className="sc-hint">
              · {treeNote}
            </Text>
          </Space>
        }
        extra={
          <Space wrap>
            {heatmapType === "cn" && (
              <Tooltip title={t("components.single-cell.heatmap.zoom-in")}>
                <Button size="small" icon={<AiOutlineZoomIn />} onClick={() => zoomAll(0.5)} />
              </Tooltip>
            )}
            {heatmapType === "cn" && (
              <Tooltip title={t("components.single-cell.heatmap.zoom-out")}>
                <Button size="small" icon={<AiOutlineZoomOut />} onClick={() => zoomAll(2)} />
              </Tooltip>
            )}
            {heatmapType === "cn" && (
              <Tooltip title={t("components.single-cell.heatmap.whole-genome")}>
                <Button
                  size="small"
                  icon={<AiOutlineFullscreen />}
                  onClick={() => defaultDomain && dispatch(settingsActions.updateDomains([defaultDomain]))}
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
        <Space wrap size={[16, 8]} className="sc-toolbar">
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
          {showSnvControls && (
            <Space size={4} wrap>
              <Text type="secondary">{t("components.single-cell.toolbar.metric")}</Text>
              <Select
                size="small"
                style={{ width: 120 }}
                value={snvMetric}
                onChange={(value) => dispatch(singleCellActions.updateSnvMetric(value))}
                options={["vaf", "alt", "depth"].map((value) => ({
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
            </Space>
          )}
        </Space>
        {alerts.map((a) => (
          <Alert key={a.key} type="warning" showIcon className="sc-alert" message={a.message} description={a.description} />
        ))}
        {missingGenomes > 0 && (
          <Alert
            type="info"
            showIcon
            className="sc-alert"
            message={t(
              cnMode === "total"
                ? "components.single-cell.heatmap.missing-genomes"
                : "components.single-cell.heatmap.missing-allelic",
              { count: missingGenomes }
            )}
          />
        )}
        <div ref={containerRef} className="sc-heatmap-container">
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
                onHoverNode={(node, event) =>
                  node
                    ? hoverCell(
                        node.firstLeaf,
                        node.isLeaf
                          ? []
                          : [[
                              t("components.single-cell.tooltip.clade"),
                              t("components.single-cell.heatmap.cell-count", {
                                count: node.lastLeaf - node.firstLeaf + 1,
                              }),
                            ]],
                        event
                      )
                    : clearHover()
                }
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
            {heatmapType === "snv" && snvReady ? (
              <MutationSidePanel
                {...sideProps}
                width={heatWidth}
                groupOf={snvOrder === "genomic" ? chromosomeOfVariant : null}
              />
            ) : (
              <div style={{ width: heatWidth }}>
                {active ? (
                  <div style={{ overflow: "hidden", width: heatWidth }}>
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
                    onDrag={heatmapType === "cn" ? handlePan : undefined}
                    onWheelZoom={heatmapType === "cn" ? handleWheelZoom : undefined}
                    wheelNeedsModifier={Boolean(zoomedByCmd)}
                    onDoubleClick={
                      heatmapType === "cn"
                        ? ({ x }) => handleWheelZoom({ x, deltaY: -500, deltaMode: 0 })
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
                  <div className="sc-axis" style={{ width: heatWidth, height: AXIS_HEIGHT }}>
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
            {showSide && <MutationSidePanel {...sideProps} width={sideWidth} />}
            {showGenes && (
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
            {hoverRow != null && (
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
            <Text type="secondary" className="sc-hint">
              {t("components.single-cell.heatmap.hint")}
            </Text>
          </div>
        </div>
      </Card>
    </Wrapper>
  );
}
