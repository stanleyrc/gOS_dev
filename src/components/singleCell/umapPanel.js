import React, { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { AutoComplete, Button, Card, Select, Space, Switch, Tag, Typography } from "antd";
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
import { linkAppliesTo, readDeepLink } from "../../helpers/singleCell/deepLink";

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
  const inTree = useMemo(() => new Set(order), [order]);
  const cloneOf = useMemo(() => new Map(cells.map((c) => [c.cell_id, c.clone_id])), [cells]);
  const selected = useMemo(() => new Set(selectedCellIds), [selectedCellIds]);
  const geneReady = expression.status === "ok" && Boolean(expression.values);

  useEffect(() => {
    if (geneReady) setColorBy("gene");
    else setColorBy((current) => (current === "gene" ? "clone" : current));
  }, [geneReady, expression.gene]);

  // ?umap=cn:<GENE> | gene:<GENE> | <field> opens the UMAP with that colouring, once per patient
  const patientId = useSelector((s) => s.SingleCell.patient?.caseReportId);
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

  const points = useMemo(() => {
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
  const nClipped = points.filter((p) => p.clipped).length;

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
      return {
        kind: "numeric",
        color: (p) => {
          const v = expression.values[p.id];
          return Number.isFinite(v) ? viridis(v / (expression.max || 1)) : NO_DATA;
        },
        value: (p) => expression.values[p.id],
        range: [0, expression.max],
        title: expression.gene,
      };
    }
    if (field && field.numeric) {
      const values = points.map((p) => p.cell[field.name]).filter(Number.isFinite);
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
  }, [colorBy, geneReady, expression, field, points, cloneOf, cloneColors, t, cnOfCell, cnLocus, cnGene, selectedCellIds, layout.theme]);

  /* ---- drawing ---- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = Math.floor(width * pixelRatio);
    canvas.height = Math.floor(height * pixelRatio);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const r = points.length > 2000 ? 2.5 : 4;
    // Unselected first, then selected on top, then the hovered cell.
    const draw = (p, emphasis) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, emphasis ? r + 1 : r, 0, 2 * Math.PI);
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
    };
    points.forEach((p) => !(p.linked && selected.has(p.cell.cell_id)) && draw(p, false));
    points.forEach((p) => p.linked && selected.has(p.cell.cell_id) && draw(p, true));
    const hovered = points.find((p) => p.linked && p.cell.cell_id === hoveredCellId);
    if (hovered) {
      ctx.strokeStyle = pt.hover;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(hovered.x, hovered.y, r + 4, 0, 2 * Math.PI);
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
  }, [points, scale, selected, hoveredCellId, lasso, width, height, pixelRatio, pt]);

  /* ---- interaction ---- */
  const local = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  };
  const nearest = (x, y) => {
    let best = null;
    let bestD = HIT_RADIUS;
    points.forEach((p) => {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) {
        bestD = d;
        best = p;
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
    if (event.button !== 0) return;
    dragRef.current = { start: local(event), path: [local(event)], moved: false };
  };
  const onMouseMove = (event) => {
    const [x, y] = local(event);
    const drag = dragRef.current;
    if (drag) {
      if (!drag.moved && Math.hypot(x - drag.start[0], y - drag.start[1]) > 4) drag.moved = true;
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
        [t("components.single-cell.tooltip.cell"), p.id],
        ...(p.linked ? [] : [[t("components.single-cell.umap.rna-only"), t("components.single-cell.umap.not-in-tree")]]),
        ...(value != null && value !== "" ? [[scale.title, typeof value === "number" ? Math.round(value * 1000) / 1000 : value]] : []),
      ],
    });
  };
  const onMouseUp = (event) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.moved && drag.path.length > 2) {
      const ids = points
        .filter((p) => p.linked && insidePolygon(p.x, p.y, drag.path))
        .map((p) => p.cell.cell_id);
      setLasso(null);
      select(ids, event);
      return;
    }
    setLasso(null);
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
            <div className="sc-umap-plot" style={{ width, height }}>
              <canvas
                ref={canvasRef}
                style={{ width, height, display: "block", cursor: lasso ? "crosshair" : "default" }}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onLeave}
              />
              {tip && (
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
              {scale.kind === "categorical" ? (
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
                {t("components.single-cell.umap.hint")}
              </Text>
            </div>
          </div>
        )}
      </Card>
    </Wrapper>
  );
}
