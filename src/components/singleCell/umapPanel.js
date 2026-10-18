import React, { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { AutoComplete, Button, Card, Checkbox, Select, Space, Switch, Tag, Typography } from "antd";
import { DotChartOutlined } from "@ant-design/icons";
import singleCellActions from "../../redux/singleCell/actions";
import scaActions from "../../redux/scAnalysis/actions";
import useContainerWidth from "./useContainerWidth";
import usePixelRatio from "./usePixelRatio";
import { annotationColors } from "../../helpers/singleCell/matrix";
import { themePalette } from "../../helpers/singleCell/themes";
import { cnAtPosition, geneLocus } from "../../helpers/singleCell/dosage";
import { searchGeneNames, topVariableGenes } from "../../helpers/singleCell/staticRna";
import { kmeans, pca, scaledExpression } from "../../helpers/singleCell/rnaStats";
import useRnaData from "./rna/useRnaData";
import Wrapper from "./index.style";
import usePlotTheme from "./usePlotTheme";
import { Provenance } from "./hintLine";
import { fieldLabel } from "../../helpers/singleCell/fieldLabels";
import { layoutEmbedding } from "../../helpers/singleCell/umapLayout";
import useHideNa, { HideNaControl } from "./useHideNa";
import { partitionNa } from "../../helpers/singleCell/hideNa";
import { linkAppliesTo, readDeepLink } from "../../helpers/singleCell/deepLink";
import useCellLabels from "./useCellLabels";
import useUmapZoom from "./useUmapZoom";
import UmapViewControls from "./umapViewControls";
import Umap3dCanvas from "./umap3dCanvas";
import { defaultView3d, indexUmap3d, parseColor, zoom3d } from "../../helpers/singleCell/umap3d";
import { toScreen, zoomRadius } from "../../helpers/singleCell/umapZoom";
import { loadUmap3d } from "../../redux/singleCell/loaders";
import { ZERO_STYLE, themeKey, expressionModel, exprColor, exprDrawOrder, rampGradient } from "../../helpers/singleCell/exprColour";

const readPref = (key, fallback) => {
  try {
    const v = window.localStorage.getItem(key);
    return v == null ? fallback : v;
  } catch (error) {
    return fallback;
  }
};
const writePref = (key, value) => {
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    // storage unavailable: the choice still applies for this visit
  }
};

const { Text } = Typography;
const MIN_HEIGHT = 400;
const MAX_HEIGHT = 560;
const LEGEND_WIDTH = 240;
const PAD = 14;
const HIT_RADIUS = 8;
const NO_DATA = "#D9D9D9";

const isMulti = (event) => event.metaKey || event.ctrlKey;

// Viridis stops: readable on small points, ordered light-to-dark in luminance.
const VIRIDIS = [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]];
function viridis(t) {
  const x = Math.max(0, Math.min(1, t)) * (VIRIDIS.length - 1);
  const k = Math.min(VIRIDIS.length - 2, Math.floor(x));
  const f = x - k;
  const c = VIRIDIS[k].map((v, i) => Math.round(v + (VIRIDIS[k + 1][i] - v) * f));
  return `rgb(${c.join(",")})`;
}

/** Even-odd point-in-polygon test. */
function insidePolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * UMAP of the patient's RNA (rna/cells.json from export_seurat.R), linked to
 * the tree and heatmap: hovering a point highlights the cell everywhere,
 * click selects (Cmd/Ctrl toggles, Shift adds) and dragging draws a lasso.
 * Colour by clone, any metadata field exported from Seurat, or a gene.
 */
export default function UmapPanel() {
  const pt = usePlotTheme();
  const { t } = useTranslation("common");
  const cellLabels = useCellLabels();
  const dispatch = useDispatch();
  const { rna, cells, order, cloneColors, selectedCellIds, hoveredCellId, cn, layout } = useSelector((s) => s.SingleCell);
  const genesState = useSelector((s) => s.Genes);
  // colour by copy number at this gene's locus (from the cells' genome graphs)
  const [cnGene, setCnGene] = useState("EGFR");
  const [cnGeneOptions, setCnGeneOptions] = useState([]);
  const cnLocus = useMemo(() => geneLocus(genesState, cnGene), [genesState, cnGene]);
  const cnOfCell = useMemo(
    () => (cn.status === "ok" && cnLocus ? cnAtPosition(cn.data, cnLocus.mid) : new Map()),
    [cn, cnLocus]
  );
  const expression = useSelector((s) => s.ScAnalysis.expression);
  const [containerRef, containerWidth] = useContainerWidth();
  const pixelRatio = usePixelRatio();
  const canvasRef = useRef(null);
  const [colorBy, setColorBy] = useState("clone");
  // all: original UMAP, every RNA cell · dna: original UMAP, RNA-only cells hidden ·
  // dna-umap: UMAP recomputed on the cells with DNA
  const [view, setView] = useState("all");
  const [geneOptions, setGeneOptions] = useState([]);
  const [tip, setTip] = useState(null);
  const [lasso, setLasso] = useState(null);
  const { matrix, summary } = useRnaData();
  const [k, setK] = useState(4);
  const [clustering, setClustering] = useState(false);
  // clip far-away cells to the plot edge so they do not squash the rest
  const [clip, setClip] = useState(true);
  // gene colouring: cap at the 99th percentile of non-zero values or at the max; optionally hide zero cells
  const [exprScale, setExprScaleState] = useState(() => (readPref("sc.umap.exprScale", "p99") === "max" ? "max" : "p99"));
  const setExprScale = (v) => {
    setExprScaleState(v);
    writePref("sc.umap.exprScale", v);
  };
  const [hideZero, setHideZeroState] = useState(() => readPref("sc.umap.hideZero", "0") === "1");
  const setHideZero = (v) => {
    setHideZeroState(v);
    writePref("sc.umap.hideZero", v ? "1" : "0");
  };
  // Quick clustering: PCA (10 PCs) on the 2,000 most variable genes, then
  // k-means; the labels become a metadata field usable everywhere.
  const runClustering = () => {
    if (!matrix || !summary) return;
    setClustering(true);
    setTimeout(() => {
      const genes = topVariableGenes(summary, matrix, 2000);
      const idx = genes.map((g) => summary.geneIndex.get(g));
      const X = scaledExpression(matrix, idx, summary.cells.length);
      const { scores } = pca(X, summary.cells.length, idx.length, 10);
      const labels = kmeans(scores, k);
      const name = `rna_kmeans_k${k}`;
      const values = {};
      summary.cells.forEach((c, i) => (values[c.displayId] = `C${labels[i] + 1}`));
      dispatch(singleCellActions.addRnaField(name, values));
      setColorBy(name);
      setClustering(false);
    }, 30);
  };
  const dragRef = useRef(null);
  const hoveredRef = useRef(null);

  // the plot fills the card next to the legend; height follows the width within bounds
  const width = Math.max(240, containerWidth - LEGEND_WIDTH - 22); // 16 px gap + plot border
  const height = Math.round(Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, width * 0.55)));
  const patientId = useSelector((s) => s.SingleCell.patient?.caseReportId);
  const zoom = useUmapZoom(width, height);
  const zv = zoom.view;
  // 2D drag selects with the lasso, or pans (Alt / middle button always pans)
  const [dragMode, setDragMode] = useState("select");
  const [dim, setDim] = useState("2d");
  const [view3d, setView3d] = useState(defaultView3d);
  const [hover3d, setHover3d] = useState({ index: -1, x: 0, y: 0 });
  const dataset = useSelector((s) => s.Settings.dataset);
  const [umap3d, setUmap3d] = useState({ status: "loading" });
  useEffect(() => {
    if (!dataset || !patientId) return undefined;
    let active = true;
    setUmap3d({ status: "loading" });
    loadUmap3d(dataset, patientId).then(
      (r) => active && setUmap3d(r.status === "ok" ? { status: "ok", index: indexUmap3d(r.data), method: r.data.method } : { status: r.status }),
      () => active && setUmap3d({ status: "error" })
    );
    return () => {
      active = false;
    };
  }, [dataset, patientId]);
  const inTree = useMemo(() => new Set(order), [order]);
  const cloneOf = useMemo(() => new Map(cells.map((c) => [c.cell_id, c.clone_id])), [cells]);
  const selected = useMemo(() => new Set(selectedCellIds), [selectedCellIds]);
  const geneReady = expression.status === "ok" && Boolean(expression.values);

  useEffect(() => {
    if (geneReady) setColorBy("gene");
    else setColorBy((current) => (current === "gene" ? "clone" : current));
  }, [geneReady, expression.gene]);

  // ?umap=cn:<GENE> | gene:<GENE> | <field> opens the UMAP with that colouring, once per patient
  const linkedFor = useRef(null);
  useEffect(() => {
    if (!summary || !patientId || linkedFor.current === patientId) return;
    linkedFor.current = patientId;
    const link = readDeepLink();
    if (!linkAppliesTo(link, patientId) || !link.umap) return;
    const { kind, gene, field } = link.umap;
    if (kind === "cn") {
      setCnGene(gene);
      setColorBy("cn");
    } else if (kind === "gene") {
      dispatch(scaActions.fetchExpression(gene));
    } else if (summary.fields.some((f) => f.name === field)) {
      setColorBy(field);
    }
  }, [summary, patientId, dispatch]);

  useEffect(() => {
    zoom.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, clip]);

  const allPoints = useMemo(() => {
    if (!summary?.hasUmap) return [];
    const recomputed = view === "dna-umap" && summary.hasDnaUmap;
    const xKey = recomputed ? "umap_dna_1" : "umap_1";
    const yKey = recomputed ? "umap_dna_2" : "umap_2";
    const hasDna = (c) => c.cell_id != null && inTree.has(c.cell_id);
    const list = summary.cells.filter(
      (c) => Number.isFinite(c[xKey]) && Number.isFinite(c[yKey]) && (view === "all" || hasDna(c))
    );
    if (!list.length) return [];
    const placed = layoutEmbedding(list.map((c) => ({ x: c[xKey], y: c[yKey] })), { width, height, margin: PAD, robust: clip });
    return list.map((c, i) => ({
      cell: c,
      id: c.displayId,
      linked: c.cell_id != null && inTree.has(c.cell_id),
      x: placed[i].px,
      y: placed[i].py,
      clipped: placed[i].clipped,
    }));
  }, [summary, width, height, inTree, view, clip]);

  /* ---- colour scale ---- */
  const field = summary?.fields.find((f) => f.name === colorBy) || null;
  const scale = useMemo(() => {
    if (colorBy === "cn") {
      const values = [...cnOfCell.values()].sort((a, b) => a - b);
      const hi = Math.max(2, values[Math.floor(0.98 * (values.length - 1))] || 2);
      return {
        kind: "numeric",
        color: (p) => {
          const v = cnOfCell.get(p.cell.cell_id);
          return Number.isFinite(v) ? viridis(Math.min(1, v / hi)) : NO_DATA;
        },
        value: (p) => cnOfCell.get(p.cell.cell_id),
        range: [0, hi],
        title: t("components.single-cell.umap.cn-title", { gene: cnLocus?.gene || cnGene }),
      };
    }
    if (colorBy === "selection") {
      const sel = new Set(selectedCellIds);
      const levels = {
        [t("components.single-cell.umap.sel-in")]: "#d4380d",
        [t("components.single-cell.umap.sel-out")]: "#91caff",
      };
      return {
        kind: "categorical",
        color: (p) => (sel.has(p.cell.cell_id) ? levels[t("components.single-cell.umap.sel-in")] : levels[t("components.single-cell.umap.sel-out")]),
        value: (p) => (sel.has(p.cell.cell_id) ? t("components.single-cell.umap.sel-in") : t("components.single-cell.umap.sel-out")),
        levels,
        title: t("components.single-cell.umap.sel-title", { count: selectedCellIds.length }),
      };
    }
    if (colorBy === "gene" && geneReady) {
      const model = expressionModel(allPoints.map((p) => expression.values[p.id]), { scale: exprScale });
      return {
        kind: "expression",
        model,
        color: (p) => {
          const v = expression.values[p.id];
          return Number.isFinite(v) ? exprColor(v, model, pt.mode) : NO_DATA;
        },
        value: (p) => expression.values[p.id],
        isZero: (p) => !(expression.values[p.id] > 0),
        range: [model.min, model.cap],
        title: expression.gene,
      };
    }
    if (field && field.numeric) {
      const values = allPoints.map((p) => p.cell[field.name]).filter(Number.isFinite);
      const lo = Math.min(...values);
      const hi = Math.max(...values);
      return {
        kind: "numeric",
        color: (p) => {
          const v = p.cell[field.name];
          return Number.isFinite(v) ? viridis((v - lo) / (hi - lo || 1)) : NO_DATA;
        },
        value: (p) => p.cell[field.name],
        range: [lo, hi],
        title: field.name,
      };
    }
    if (field) {
      const colors = annotationColors(field.levels, themePalette(layout.theme));
      return {
        kind: "categorical",
        color: (p) => colors[`${p.cell[field.name]}`] || NO_DATA,
        value: (p) => p.cell[field.name],
        levels: colors,
        title: field.name,
      };
    }
    return {
      kind: "categorical",
      color: (p) => {
        const clone = p.linked ? cloneOf.get(p.cell.cell_id) : null;
        return clone != null && cloneColors[clone] ? cloneColors[clone] : NO_DATA;
      },
      value: (p) => (p.linked ? cloneOf.get(p.cell.cell_id) : null),
      levels: cloneColors,
      title: t("components.single-cell.legend.clones"),
    };
  }, [colorBy, geneReady, expression, field, allPoints, cloneOf, cloneColors, t, cnOfCell, cnLocus, cnGene, selectedCellIds, layout.theme, exprScale, pt.mode]);

  // cells with no value for the colour field are hidden instead of drawn grey
  const [hideNa, setHideNa] = useHideNa();
  const { shown: naShown, hidden: nHiddenNa } = useMemo(
    () => partitionNa(allPoints, (p) => scale.color(p) === NO_DATA, hideNa),
    [allPoints, scale, hideNa]
  );
  // gene colouring: zero cells first (optionally hidden), expressing cells ascending so high cells stay on top
  const isExpr = scale.kind === "expression";
  const points = useMemo(() => {
    if (!isExpr) return naShown;
    const kept = hideZero ? naShown.filter((p) => !scale.isZero(p)) : naShown;
    return exprDrawOrder(kept, scale.value);
  }, [isExpr, naShown, hideZero, scale]);
  const nClipped = points.filter((p) => p.clipped).length;

  /* ---- 3D ---- */
  const dimReason = !summary?.hasUmap
    ? null
    : view === "dna-umap"
    ? t("components.single-cell.umap.3d-dna-umap")
    : umap3d.status === "ok"
    ? null
    : umap3d.status === "loading"
    ? t("components.single-cell.umap.3d-loading")
    : umap3d.status === "missing"
    ? t("components.single-cell.umap.3d-missing")
    : t("components.single-cell.umap.3d-error");
  const is3d = dim === "3d" && !dimReason;
  const pts3d = useMemo(() => {
    if (!is3d) return [];
    const out = [];
    points.forEach((p) => {
      const c = umap3d.index.get(`${p.cell.rna_id}`);
      if (c) out.push({ src: p, x: c.x, y: c.y, z: c.z });
    });
    return out;
  }, [is3d, points, umap3d]);
  const drawn3d = useMemo(
    () =>
      pts3d.map((q) => {
        const p = q.src;
        const zero = isExpr && scale.isZero(p);
        return {
          x: q.x,
          y: q.y,
          z: q.z,
          rgb: parseColor(scale.color(p)) || parseColor(NO_DATA),
          hollow: !p.linked,
          selected: p.linked && selected.has(p.cell.cell_id),
          sizeMul: zero ? ZERO_STYLE[themeKey(pt.mode)].radius : 1,
        };
      }),
    [pts3d, scale, isExpr, selected, pt.mode]
  );
  const hoveredIndex3d = useMemo(() => {
    if (hover3d.index >= 0 && hover3d.index < pts3d.length) return hover3d.index;
    return hoveredCellId == null ? -1 : pts3d.findIndex((q) => q.src.linked && q.src.cell.cell_id === hoveredCellId);
  }, [hover3d.index, pts3d, hoveredCellId]);
  const tip3d = useMemo(() => {
    const q = hover3d.index >= 0 ? pts3d[hover3d.index] : null;
    if (!q) return null;
    const p = q.src;
    const value = scale.value(p);
    return {
      left: Math.min(hover3d.x + 14, width - 200),
      top: hover3d.y + 14,
      lines: [
        [t("components.single-cell.tooltip.cell"), cellLabels.full(p.id)],
        ...(p.linked ? [] : [[t("components.single-cell.umap.rna-only"), t("components.single-cell.umap.not-in-tree")]]),
        ...(value != null && value !== "" ? [[scale.title, typeof value === "number" ? Math.round(value * 1000) / 1000 : value]] : []),
      ],
    };
  }, [hover3d, pts3d, scale, width, t, cellLabels]);
  const on3dHover = (index, x, y) => {
    setHover3d((h) => (h.index === index && index < 0 ? h : { index, x, y }));
    const q = index >= 0 ? pts3d[index] : null;
    shareHover(q && q.src.linked ? q.src.cell.cell_id : null);
  };
  const on3dPick = (index, event) => {
    const q = pts3d[index];
    if (q && q.src.linked) select([q.src.cell.cell_id], event);
  };

  /* ---- drawing ---- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = Math.floor(width * pixelRatio);
    canvas.height = Math.floor(height * pixelRatio);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const r = zoomRadius(points.length > 2000 ? 2.5 : 4, zv.k);
    // Unselected first, then selected on top, then the hovered cell.
    const zs = ZERO_STYLE[themeKey(pt.mode)];
    const draw = (q, emphasis) => {
      const [sx, sy] = toScreen(zv, q.x, q.y);
      if (sx < -r - 6 || sy < -r - 6 || sx > width + r + 6 || sy > height + r + 6) return;
      const p = { ...q, x: sx, y: sy };
      const zero = isExpr && scale.isZero(p);
      ctx.globalAlpha = zero && !emphasis ? zs.alpha : 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, emphasis ? r + 1 : zero ? r * zs.radius : r, 0, 2 * Math.PI);
      if (p.linked) {
        ctx.fillStyle = scale.color(p);
        ctx.fill();
      } else {
        // RNA-only cells (no DNA cell in the tree): hollow.
        ctx.strokeStyle = scale.color(p) === NO_DATA ? pt.faint : scale.color(p);
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      if (p.clipped) {
        // pinned at the edge: a ring marks that the cell lies further out
        ctx.strokeStyle = pt.muted || pt.text;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 2.5, 0, 2 * Math.PI);
        ctx.stroke();
      }
      if (emphasis) {
        ctx.strokeStyle = pt.text;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };
    points.forEach((p) => !(p.linked && selected.has(p.cell.cell_id)) && draw(p, false));
    points.forEach((p) => p.linked && selected.has(p.cell.cell_id) && draw(p, true));
    const hovered = points.find((p) => p.linked && p.cell.cell_id === hoveredCellId);
    if (hovered) {
      ctx.strokeStyle = pt.hover;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(...toScreen(zv, hovered.x, hovered.y), r + 4, 0, 2 * Math.PI);
      ctx.stroke();
    }
    if (lasso && lasso.length > 1) {
      ctx.strokeStyle = pt.select;
      ctx.fillStyle = pt.selectFill;
      ctx.lineWidth = 1;
      ctx.beginPath();
      lasso.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }, [points, scale, isExpr, selected, hoveredCellId, lasso, width, height, pixelRatio, pt, zv, dim]);

  /* ---- interaction ---- */
  const local = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  };
  const nearest = (x, y) => {
    let best = null;
    let bestD = HIT_RADIUS;
    points.forEach((q) => {
      const [sx, sy] = toScreen(zv, q.x, q.y);
      const d = Math.hypot(sx - x, sy - y);
      if (d < bestD) {
        bestD = d;
        best = q;
      }
    });
    return best;
  };
  const shareHover = (cellId) => {
    if (hoveredRef.current === cellId) return;
    hoveredRef.current = cellId;
    dispatch(singleCellActions.updateHover(cellId));
  };
  const select = (ids, event) => {
    if (isMulti(event)) {
      const next = new Set(selectedCellIds);
      const removing = ids.length && ids.every((id) => next.has(id));
      ids.forEach((id) => (removing ? next.delete(id) : next.add(id)));
      dispatch(singleCellActions.updateSelection([...next]));
    } else if (event.shiftKey) {
      dispatch(singleCellActions.updateSelection([...selectedCellIds, ...ids]));
    } else {
      dispatch(singleCellActions.updateSelection(ids));
    }
  };

  const onMouseDown = (event) => {
    if (event.button !== 0 && event.button !== 1) return;
    if (event.button === 1) event.preventDefault();
    const panning = event.button === 1 || event.altKey || dragMode === "pan";
    dragRef.current = { start: local(event), path: [local(event)], moved: false, panning, last: local(event) };
  };
  const onMouseMove = (event) => {
    const [x, y] = local(event);
    const drag = dragRef.current;
    if (drag) {
      if (!drag.moved && Math.hypot(x - drag.start[0], y - drag.start[1]) > 4) drag.moved = true;
      if (drag.moved && drag.panning) {
        zoom.pan(x - drag.last[0], y - drag.last[1]);
        drag.last = [x, y];
        setTip(null);
        return;
      }
      if (drag.moved) {
        drag.path.push([x, y]);
        setLasso([...drag.path]);
        setTip(null);
        return;
      }
    }
    const p = nearest(x, y);
    shareHover(p && p.linked ? p.cell.cell_id : null);
    if (!p) return setTip(null);
    const value = scale.value(p);
    setTip({
      left: Math.min(x + 14, width - 200),
      top: y + 14,
      lines: [
        [t("components.single-cell.tooltip.cell"), cellLabels.full(p.id)],
        ...(p.linked ? [] : [[t("components.single-cell.umap.rna-only"), t("components.single-cell.umap.not-in-tree")]]),
        ...(value != null && value !== "" ? [[scale.title, typeof value === "number" ? Math.round(value * 1000) / 1000 : value]] : []),
      ],
    });
  };
  const onMouseUp = (event) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.moved && drag.panning) return;
    if (drag?.moved && drag.path.length > 2) {
      const ids = points
        .filter((p) => p.linked && insidePolygon(...toScreen(zv, p.x, p.y), drag.path))
        .map((p) => p.cell.cell_id);
      setLasso(null);
      select(ids, event);
      return;
    }
    setLasso(null);
    if (event.button !== 0) return;
    const [x, y] = local(event);
    const p = nearest(x, y);
    if (p && p.linked) select([p.cell.cell_id], event);
  };
  const onLeave = () => {
    setTip(null);
    shareHover(null);
    if (dragRef.current) {
      dragRef.current = null;
      setLasso(null);
    }
  };

  if (rna.status !== "ok") return null;
  const nLinked = points.filter((p) => p.linked).length;
  const colorOptions = [
    { value: "clone", label: t("components.single-cell.umap.color-clone") },
    { value: "selection", label: t("components.single-cell.umap.color-selection") },
    ...(cn.status === "ok" ? [{ value: "cn", label: t("components.single-cell.umap.color-cn") }] : []),
    ...(geneReady ? [{ value: "gene", label: t("components.single-cell.umap.color-gene", { gene: expression.gene }) }] : []),
    ...summary.fields.map((f) => ({ value: f.name, label: fieldLabel(f.name) })),
  ];

  return (
    <Wrapper>
      <Card
        size="small"
        title={
          <Space wrap>
            <DotChartOutlined />
            <span>{t("components.single-cell.umap.title")}</span><Provenance id="umap" />
            <Text type="secondary">
              {t("components.single-cell.umap.summary", { cells: points.length, linked: nLinked, genes: summary.genes.length })}
            </Text>
          </Space>
        }
        extra={
          <Space wrap>
            <Select
              size="small"
              style={{ width: 230 }}
              value={view}
              onChange={setView}
              options={[
                { value: "all", label: t("components.single-cell.umap.view-all") },
                { value: "dna", label: t("components.single-cell.umap.view-dna") },
                { value: "dna-umap", label: t("components.single-cell.umap.view-dna-umap"), disabled: !summary.hasDnaUmap },
              ]}
            />
            <Text type="secondary">{t("components.single-cell.umap.color-by")}</Text>
            <Select size="small" style={{ width: 200 }} value={colorBy} onChange={setColorBy} options={colorOptions} showSearch />
            <HideNaControl hide={hideNa} onChange={setHideNa} hidden={nHiddenNa} />
            {colorBy === "gene" && geneReady && (
              <>
                <Select
                  size="small"
                  style={{ width: 215 }}
                  value={exprScale}
                  onChange={setExprScale}
                  options={[
                    { value: "p99", label: t("components.single-cell.umap.expr-scale-p99") },
                    { value: "max", label: t("components.single-cell.umap.expr-scale-max") },
                  ]}
                />
                <Checkbox checked={hideZero} onChange={(e) => setHideZero(e.target.checked)}>
                  {t("components.single-cell.umap.expr-hide-zero")}
                </Checkbox>
              </>
            )}
            {colorBy === "cn" && (
              <AutoComplete
                size="small"
                style={{ width: 130 }}
                value={cnGene}
                placeholder={t("components.single-cell.umap.cn-gene")}
                options={cnGeneOptions}
                onChange={setCnGene}
                onSearch={(q) =>
                  setCnGeneOptions(
                    (genesState.optionsList || [])
                      .filter((o) => `${o.label}`.toUpperCase().startsWith(`${q}`.toUpperCase()))
                      .slice(0, 20)
                      .map((o) => ({ value: o.label }))
                  )
                }
              />
            )}
            <AutoComplete
              size="small"
              style={{ width: 170 }}
              placeholder={t("components.single-cell.compare.gene-placeholder")}
              options={geneOptions}
              onSearch={(q) => setGeneOptions(searchGeneNames(summary.genes, q).map((g) => ({ value: g })))}
              onSelect={(gene) => dispatch(scaActions.fetchExpression(gene))}
            />
            {expression.gene && (
              <Tag closable onClose={() => dispatch(scaActions.clearExpression())}>
                {expression.gene}
                {expression.status === "loading" ? " …" : ""}
              </Tag>
            )}
            <Select
              size="small"
              style={{ width: 70 }}
              value={k}
              onChange={setK}
              options={[2, 3, 4, 5, 6, 7, 8, 10].map((n) => ({ value: n, label: `k=${n}` }))}
            />
            <Button size="small" loading={clustering} disabled={!matrix} onClick={runClustering}>
              {t("components.single-cell.umap.cluster")}
            </Button>
            <Button size="small" onClick={() => dispatch(singleCellActions.updateSelection([]))}>
              {t("components.single-cell.selection.clear")}
            </Button>
          </Space>
        }
      >
        {!summary.hasUmap ? (
          <Text type="secondary">{t("components.single-cell.umap.no-umap")}</Text>
        ) : (
          <div ref={containerRef} className="sc-umap">
            <div className="sc-umap-plot" style={{ width, height, position: "relative", overflow: "hidden" }}>
              <UmapViewControls
                dim={is3d ? "3d" : "2d"}
                onDim={setDim}
                dimDisabledReason={dimReason}
                mode={is3d ? null : dragMode}
                onMode={setDragMode}
                onZoomIn={() => (is3d ? setView3d((v) => zoom3d(v, 1.4)) : zoom.zoomBy(1.4))}
                onZoomOut={() => (is3d ? setView3d((v) => zoom3d(v, 1 / 1.4)) : zoom.zoomBy(1 / 1.4))}
                onReset={() => (is3d ? setView3d(defaultView3d()) : zoom.reset())}
                zoom={is3d ? `${Math.round(view3d.zoom * 100)}%` : `${Math.round(zv.k * 100)}%`}
              />
              {is3d ? (
                <Umap3dCanvas
                  points={drawn3d}
                  width={width}
                  height={height}
                  view={view3d}
                  onViewChange={setView3d}
                  onHover={on3dHover}
                  onPick={on3dPick}
                  hoveredIndex={hoveredIndex3d}
                  ink={pt.text}
                  haloColor={pt.mode === "light" ? [0.08, 0.08, 0.08] : [0.95, 0.95, 0.95]}
                />
              ) : (
                <div ref={zoom.bindRef} style={{ width, height }} onDoubleClick={zoom.reset}>
                  <canvas
                    ref={canvasRef}
                    style={{ width, height, display: "block", cursor: lasso ? "crosshair" : dragMode === "pan" ? "grab" : "default" }}
                    onMouseDown={onMouseDown}
                    onMouseMove={onMouseMove}
                    onMouseUp={onMouseUp}
                    onMouseLeave={onLeave}
                  />
                </div>
              )}
              {!is3d && <div style={{ position: "absolute", left: 6, bottom: 4, fontSize: 11.5, color: "rgba(0,0,0,0.55)", pointerEvents: "none" }}>{view === "dna-umap" ? "DNA-cell UMAP 1 → · UMAP 2 ↑ (arbitrary units)" : "UMAP 1 → · UMAP 2 ↑ (arbitrary units)"}</div>}
              {is3d && tip3d && (
                <div className="sc-tooltip" style={{ left: tip3d.left, top: tip3d.top }}>
                  {tip3d.lines.map(([k, v]) => (
                    <div key={k}>
                      <span className="sc-tooltip-key">{k}</span> {`${v}`}
                    </div>
                  ))}
                </div>
              )}
              {!is3d && tip && (
                <div className="sc-tooltip" style={{ left: tip.left, top: tip.top }}>
                  {tip.lines.map(([k, v]) => (
                    <div key={k}>
                      <span className="sc-tooltip-key">{k}</span> {`${v}`}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="sc-umap-legend" style={{ width: LEGEND_WIDTH }}>
              <Text strong type="secondary">
                {scale.title}
              </Text>
              {scale.kind === "expression" ? (
                <>
                  <Text type="secondary" className="sc-hint">
                    {t("components.single-cell.umap.expr-detected", { pct: scale.model.pctDetected.toFixed(1), n: scale.model.nDetected, total: scale.model.nTotal })}
                  </Text>
                  {scale.model.nDetected > 0 ? (
                    <>
                      <div className="sc-umap-ramp" style={{ background: rampGradient(pt.mode) }} />
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <Text type="secondary" className="sc-hint">{Math.round(scale.model.min * 100) / 100}</Text>
                        <Text type="secondary" className="sc-hint">
                          {scale.model.capped ? "≥ " : ""}{Math.round(scale.model.cap * 100) / 100}
                        </Text>
                      </div>
                      <Text type="secondary" className="sc-hint">
                        {t(scale.model.capped ? "components.single-cell.umap.expr-cap-p99" : "components.single-cell.umap.expr-cap-max", { max: Math.round(scale.model.max * 100) / 100 })}
                      </Text>
                    </>
                  ) : (
                    <Text type="secondary" className="sc-hint">{t("components.single-cell.umap.expr-none")}</Text>
                  )}
                  <span className="sc-legend-item">
                    <span className="sc-legend-swatch" style={{ background: ZERO_STYLE[themeKey(pt.mode)].color }} />
                    <Text type="secondary">{t("components.single-cell.umap.expr-zero", { n: scale.model.nZero })}</Text>
                  </span>
                </>
              ) : scale.kind === "categorical" ? (
                Object.entries(scale.levels).map(([level, color]) => (
                  <span key={level} className="sc-legend-item">
                    <span className="sc-legend-swatch" style={{ background: color }} />
                    <Text type="secondary">{level}</Text>
                  </span>
                ))
              ) : (
                <>
                  <div
                    className="sc-umap-ramp"
                    style={{
                      background: `linear-gradient(to right, ${[0, 0.25, 0.5, 0.75, 1].map(viridis).join(",")})`,
                    }}
                  />
                  <Text type="secondary" className="sc-hint">
                    {scale.range.map((v) => Math.round(v * 100) / 100).join(" – ")}
                  </Text>
                </>
              )}
              <span className="sc-legend-item">
                <span className="sc-legend-swatch sc-legend-hollow" />
                <Text type="secondary">{t("components.single-cell.umap.rna-only")}</Text>
              </span>
              <span className="sc-legend-item">
                <Switch size="small" checked={clip} onChange={setClip} />
                <Text type="secondary">{t("components.single-cell.umap.clip", { count: clip ? nClipped : 0 })}</Text>
              </span>
              <Text type="secondary" className="sc-hint">
                {t("components.single-cell.umap.hint")} {t(is3d ? "components.single-cell.umap.3d-hint" : "components.single-cell.umap.zoom-hint")}
              </Text>
              {is3d && (
                <Text type="secondary" className="sc-hint">
                  {t("components.single-cell.umap.3d-cells", { n: pts3d.length })}{umap3d.method ? `: ${umap3d.method}` : ""}
                </Text>
              )}
            </div>
          </div>
        )}
      </Card>
    </Wrapper>
  );
}
