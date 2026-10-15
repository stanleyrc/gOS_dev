import React, { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { AutoComplete, Button, Card, Col, Select, Space, Table, Tooltip, Typography } from "antd";
import { DataSwatch } from "../neutralTag";
import { EnvironmentOutlined, InfoCircleOutlined } from "@ant-design/icons";
import singleCellActions from "../../../redux/singleCell/actions";
import useContainerWidth from "../useContainerWidth";
import usePixelRatio from "../usePixelRatio";
import usePlotTheme from "../usePlotTheme";
import Wrapper from "../index.style";
import { annotationColors } from "../../../helpers/singleCell/matrix";
import { themePalette } from "../../../helpers/singleCell/themes";
import { cnAtPosition, geneLocus } from "../../../helpers/singleCell/dosage";
import useHideNa, { HideNaControl } from "../useHideNa";
import { partitionNa } from "../../../helpers/singleCell/hideNa";
import { fieldLabel } from "../../../helpers/singleCell/fieldLabels";
import {
  distanceProfile,
  fmtP,
  labelClustering,
  neighbourhoodEnrichment,
  nicheEnrichment,
  placeTissue,
  spatialHeadlines,
  spatialWeights,
  treeSpaceMantel,
  valueClustering,
} from "../../../helpers/singleCell/spatial";
import useSpatial from "./useSpatial";
import { SpatialSection, useSpatialLayout } from "./spatialLayoutContext";

const { Text } = Typography;
const LEGEND_WIDTH = 240;
const PAD = 16;
const HIT_RADIUS = 9;
const NO_DATA = "#D9D9D9";
const isMulti = (event) => event.metaKey || event.ctrlKey;

// English defaults; keys live under components.single-cell.spatial so they can be translated later.
const TEXT = {
  title: "Tissue map (Slide-tags)",
  summary: "{{placed}} positions · {{dna}} cells in the tree",
  "color-by": "Colour by",
  "group-by": "Test groups",
  neighbours: "{{k}} neighbours",
  clone: "Clone",
  selection: "Selection",
  cn: "Copy number at gene",
  "cn-title": "{{gene}} copy number",
  "no-dna": "Position only (no DNA)",
  "sel-in": "Selected",
  "sel-out": "Not selected",
  clear: "Clear selection",
  hint: "Hover a cell to find it in the tree and heatmap; click to select (⌘/Ctrl toggles, Shift adds); drag to lasso. Cells selected in the tree or heatmap are outlined here.",
  "stats-title": "Spatial statistics",
  "stats-method": "kNN graph (k = {{k}}, symmetric) over all placed nuclei; Moran's I of each group's 0/1 indicator with a {{perm}}-permutation p; neighbourhood enrichment = kNN edges between two groups against label permutations (z); niche = mean RNA score of a cell's neighbours; Mantel = Pearson r of tree (patristic) vs physical distance, cell-permutation p.",
  clustering: "Is each group spatially clustered?",
  enrichment: "Neighbourhood enrichment (z, observed vs shuffled labels)",
  niche: "Clone × niche (mean score of each cell's neighbours)",
  mantel: "Tree distance vs physical distance",
  "mantel-none": "Needs a tree and at least 5 placed cells.",
  "selection-stat": "Current selection ({{n}} cells): Moran's I = {{I}}, p = {{p}}",
  "click-row": "Click a row to select its cells.",
  "none-found": "Not enough placed cells for statistics.",
  "profile-head": "Mean tree distance by physical-distance bin (near → far):",
  notes: "Notes",
};

// Viridis stops, as in the UMAP panel.
const VIRIDIS = [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]];
function viridis(t) {
  const x = Math.max(0, Math.min(1, t)) * (VIRIDIS.length - 1);
  const k = Math.min(VIRIDIS.length - 2, Math.floor(x));
  const f = x - k;
  const c = VIRIDIS[k].map((v, i) => Math.round(v + (VIRIDIS[k + 1][i] - v) * f));
  return `rgb(${c.join(",")})`;
}
// Diverging blue-white-red for z-scores (clamped at |z| = 4).
function divergent(z) {
  const t = Math.max(-1, Math.min(1, (Number.isFinite(z) ? z : 0) / 4));
  const lo = [33, 102, 172];
  const hi = [178, 24, 43];
  const mid = [247, 247, 247];
  const end = t < 0 ? lo : hi;
  const a = Math.abs(t);
  return `rgb(${mid.map((m, i) => Math.round(m + (end[i] - m) * a)).join(",")})`;
}

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
 * Tissue positions of a slide-tag patient's cells (data/<patient>/spatial.json),
 * linked to the tree and heatmap through the shared selection / hover, with
 * spatial statistics and a plain-language headline. Renders nothing for
 * patients without spatial.json.
 */
export default function SpatialPanel({ bare = false }) {
  const { t } = useTranslation("common");
  const tx = (key, vars = {}) => t(`components.single-cell.spatial.${key}`, { defaultValue: TEXT[key], ...vars });
  const pt = usePlotTheme();
  const sp = useSpatialLayout();
  const beside = bare && sp.mode === "beside";
  const dispatch = useDispatch();
  const dataset = useSelector((s) => s.Settings.dataset);
  const { patient, cells, cloneColors, selectedCellIds, hoveredCellId, cn, tree, layout } = useSelector((s) => s.SingleCell);
  const genesState = useSelector((s) => s.Genes);
  const spatial = useSpatial(dataset, patient?.caseReportId);
  const [containerRef, containerWidth] = useContainerWidth();
  const pixelRatio = usePixelRatio();
  const canvasRef = useRef(null);
  const [colorBy, setColorBy] = useState("clone");
  const [groupBy, setGroupBy] = useState("clone");
  const [k, setK] = useState(6);
  const [cnGene, setCnGene] = useState("EGFR");
  const [cnGeneOptions, setCnGeneOptions] = useState([]);
  const [tip, setTip] = useState(null);
  const [lasso, setLasso] = useState(null);
  const dragRef = useRef(null);
  const hoveredRef = useRef(null);

  const data = spatial.status === "ok" ? spatial.data : null;
  const cloneOf = useMemo(() => new Map(cells.map((c) => [`${c.cell_id}`, c.clone_id])), [cells]);
  const inPatient = useMemo(() => new Set(cells.map((c) => `${c.cell_id}`)), [cells]);
  const selected = useMemo(() => new Set(selectedCellIds.map(String)), [selectedCellIds]);
  const cnLocus = useMemo(() => geneLocus(genesState, cnGene), [genesState, cnGene]);
  const cnOfCell = useMemo(
    () => (cn.status === "ok" && cnLocus ? cnAtPosition(cn.data, cnLocus.mid) : new Map()),
    [cn, cnLocus]
  );

  // points: linked = the cell is one of the patient's DNA cells (in the tree / heatmap)
  const basePoints = useMemo(
    () => (data ? data.points.map((p) => ({ ...p, linked: inPatient.has(p.id) })) : []),
    [data, inPatient]
  );
  const plotWidth = beside ? Math.max(240, containerWidth - 4) : Math.max(260, Math.min(720, containerWidth - LEGEND_WIDTH - 22));
  const plotHeight = useMemo(() => {
    if (!basePoints.length) return 360;
    const xs = basePoints.map((p) => p.x);
    const ys = basePoints.map((p) => p.y);
    const aspect = (Math.max(...ys) - Math.min(...ys) || 1) / (Math.max(...xs) - Math.min(...xs) || 1);
    return Math.round(Math.max(300, Math.min(beside ? 900 : 640, plotWidth * aspect)));
  }, [basePoints, plotWidth, beside]);
  const points = useMemo(() => {
    const placed = placeTissue(basePoints, plotWidth, plotHeight, PAD);
    return basePoints.map((p, i) => ({ ...p, px: placed[i].px, py: placed[i].py }));
  }, [basePoints, plotWidth, plotHeight]);

  const categoricalFields = useMemo(() => (data ? data.fields.filter((f) => !f.numeric && !["barcode", "dna"].includes(f.name) && f.levels.length <= 30) : []), [data]);
  const numericFields = useMemo(() => (data ? data.fields.filter((f) => f.numeric) : []), [data]);
  const nicheFields = useMemo(() => numericFields.filter((f) => f.name.startsWith("score_")), [numericFields]);

  // group labels for the statistics: the patient's clones, or any categorical field of spatial.json
  const groupOf = useMemo(() => {
    if (groupBy === "clone") return (p) => (p.linked ? cloneOf.get(p.id) ?? p.fields.clone_id ?? null : null);
    return (p) => (p.fields[groupBy] != null ? `${p.fields[groupBy]}` : null);
  }, [groupBy, cloneOf]);

  /* ---- statistics ---- */
  const weights = useMemo(() => (points.length >= 6 ? spatialWeights(points, k) : null), [points, k]);
  const labels = useMemo(() => points.map(groupOf), [points, groupOf]);
  const clustering = useMemo(() => (weights ? labelClustering(weights, labels, { nPerm: 999 }) : []), [weights, labels]);
  const enrichment = useMemo(() => (weights ? neighbourhoodEnrichment(weights, labels, { nPerm: 499 }) : null), [weights, labels]);
  const niche = useMemo(
    () =>
      weights
        ? nicheFields.map((f) => ({
            score: f.name.replace(/^score_/, ""),
            rows: nicheEnrichment(weights, labels, points.map((p) => (Number.isFinite(+p.fields[f.name]) ? +p.fields[f.name] : NaN)), { nPerm: 499 }),
          }))
        : [],
    [weights, labels, points, nicheFields]
  );
  const layoutTree = tree.status === "ok" ? tree.data.layout : null;
  const mantelRes = useMemo(() => (layoutTree ? treeSpaceMantel(layoutTree, points.filter((p) => p.linked), { nPerm: 999 }) : null), [layoutTree, points]);
  const profile = useMemo(() => (layoutTree ? distanceProfile(layoutTree, points.filter((p) => p.linked), 5) : []), [layoutTree, points]);
  const selectionStat = useMemo(() => {
    const n = points.filter((p) => selected.has(p.id)).length;
    if (!weights || n < 3 || n > points.length - 3) return null;
    const r = valueClustering(weights, points.map((p) => (selected.has(p.id) ? 1 : 0)), { nPerm: 499 });
    return r ? { ...r, n } : null;
  }, [weights, points, selected]);
  const headlines = useMemo(
    () => spatialHeadlines({ clustering, mantel: mantelRes, enrichment, niche }),
    [clustering, mantelRes, enrichment, niche]
  );

  /* ---- colour scale ---- */
  const scale = useMemo(() => {
    const numeric = (valueOf, title, fixedLo = null) => {
      const vals = points.map(valueOf).filter(Number.isFinite).sort((a, b) => a - b);
      const lo = fixedLo ?? (vals[0] ?? 0);
      const hi = Math.max(lo + 1e-9, vals[Math.floor(0.98 * (vals.length - 1))] ?? 1);
      return {
        kind: "numeric",
        color: (p) => {
          const v = valueOf(p);
          return Number.isFinite(v) ? viridis((v - lo) / (hi - lo)) : NO_DATA;
        },
        value: valueOf,
        range: [lo, hi],
        title,
      };
    };
    if (colorBy === "cn") return numeric((p) => cnOfCell.get(p.id), tx("cn-title", { gene: cnLocus?.gene || cnGene }), 0);
    if (colorBy === "selection") {
      const levels = { [tx("sel-in")]: "#d4380d", [tx("sel-out")]: "#91caff" };
      return {
        kind: "categorical",
        color: (p) => (selected.has(p.id) ? levels[tx("sel-in")] : levels[tx("sel-out")]),
        value: (p) => (selected.has(p.id) ? tx("sel-in") : tx("sel-out")),
        levels,
        title: tx("selection"),
      };
    }
    const field = data?.fields.find((f) => f.name === colorBy);
    if (field?.numeric) return numeric((p) => (p.fields[field.name] == null ? NaN : +p.fields[field.name]), fieldLabel(field.name), field.name.startsWith("cn_") ? 0 : null);
    if (field) {
      const colors = annotationColors(field.levels, themePalette(layout.theme));
      return {
        kind: "categorical",
        color: (p) => colors[`${p.fields[field.name]}`] || NO_DATA,
        value: (p) => p.fields[field.name],
        levels: colors,
        title: fieldLabel(field.name),
      };
    }
    const present = [...new Set(points.map((p) => cloneOf.get(p.id)).filter((c) => c != null))];
    return {
      kind: "categorical",
      color: (p) => {
        const c = p.linked ? cloneOf.get(p.id) : null;
        return c != null && cloneColors[c] ? cloneColors[c] : NO_DATA;
      },
      value: (p) => (p.linked ? cloneOf.get(p.id) : null),
      levels: Object.fromEntries(present.map((c) => [c, cloneColors[c] || NO_DATA])),
      title: tx("clone"),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorBy, points, cnOfCell, cnLocus, cnGene, selected, data, layout.theme, cloneOf, cloneColors, t]);

  // spots with no value for the colour field are hidden instead of drawn grey (statistics keep every spot)
  const [hideNa, setHideNa] = useHideNa();
  const { shown: drawPoints, hidden: nHiddenNa } = useMemo(
    () => partitionNa(points, (p) => scale.color(p) === NO_DATA, hideNa),
    [points, scale, hideNa]
  );

  /* ---- drawing ---- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = Math.floor(plotWidth * pixelRatio);
    canvas.height = Math.floor(plotHeight * pixelRatio);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, plotWidth, plotHeight);
    const r = 5;
    const anySelected = selected.size > 0;
    const draw = (p, emphasis) => {
      ctx.beginPath();
      ctx.arc(p.px, p.py, emphasis ? r + 1.5 : r, 0, 2 * Math.PI);
      const c = scale.color(p);
      ctx.globalAlpha = anySelected && !emphasis ? 0.45 : 1;
      if (p.linked) {
        ctx.fillStyle = c;
        ctx.fill();
      } else {
        ctx.strokeStyle = c === NO_DATA ? pt.faint : c;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (emphasis) {
        ctx.strokeStyle = pt.select;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    };
    drawPoints.forEach((p) => !selected.has(p.id) && draw(p, false));
    drawPoints.forEach((p) => selected.has(p.id) && draw(p, true));
    const hovered = drawPoints.find((p) => p.id === `${hoveredCellId}`);
    if (hovered) {
      ctx.strokeStyle = pt.hover;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(hovered.px, hovered.py, r + 5, 0, 2 * Math.PI);
      ctx.stroke();
    }
    if (lasso && lasso.length > 1) {
      ctx.strokeStyle = pt.select;
      ctx.fillStyle = pt.selectFill;
      ctx.lineWidth = 1;
      ctx.beginPath();
      lasso.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }, [drawPoints, scale, selected, hoveredCellId, lasso, plotWidth, plotHeight, pixelRatio, pt]);

  /* ---- interaction ---- */
  const local = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  };
  const nearest = (x, y) => {
    let best = null;
    let bestD = HIT_RADIUS;
    drawPoints.forEach((p) => {
      const d = Math.hypot(p.px - x, p.py - y);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    });
    return best;
  };
  const shareHover = (id) => {
    if (hoveredRef.current === id) return;
    hoveredRef.current = id;
    dispatch(singleCellActions.updateHover(id));
  };
  const select = (ids, event = {}) => {
    if (isMulti(event)) {
      const next = new Set(selectedCellIds);
      const removing = ids.length && ids.every((id) => next.has(id));
      ids.forEach((id) => (removing ? next.delete(id) : next.add(id)));
      dispatch(singleCellActions.updateSelection([...next]));
    } else if (event.shiftKey) {
      dispatch(singleCellActions.updateSelection([...new Set([...selectedCellIds, ...ids])]));
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
    shareHover(p && p.linked ? p.id : null);
    if (!p) return setTip(null);
    const value = scale.value(p);
    setTip({
      left: Math.min(x + 14, plotWidth - 200),
      top: y + 14,
      lines: [
        [t("components.single-cell.tooltip.cell", { defaultValue: "Cell" }), p.id],
        ...(p.linked ? [[tx("clone"), cloneOf.get(p.id) ?? "–"]] : [[tx("no-dna"), p.fields.barcode ?? ""]]),
        ...(p.fields.cell_type ? [[fieldLabel("cell_type"), p.fields.cell_type]] : []),
        ...(value != null && value !== "" && colorBy !== "clone" ? [[scale.title, typeof value === "number" ? Math.round(value * 100) / 100 : value]] : []),
      ],
    });
  };
  const onMouseUp = (event) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.moved && drag.path.length > 2) {
      const ids = drawPoints.filter((p) => p.linked && insidePolygon(p.px, p.py, drag.path)).map((p) => p.id);
      setLasso(null);
      select(ids, event);
      return;
    }
    setLasso(null);
    const [x, y] = local(event);
    const p = nearest(x, y);
    if (p && p.linked) select([p.id], event);
  };
  const onLeave = () => {
    setTip(null);
    shareHover(null);
    if (dragRef.current) {
      dragRef.current = null;
      setLasso(null);
    }
  };
  const selectGroup = (label) => select(points.filter((p, i) => p.linked && labels[i] === label).map((p) => p.id));

  if (spatial.status !== "ok" || !data || !data.points.length) return null;

  const nLinked = points.filter((p) => p.linked).length;
  const colorOptions = [
    { value: "clone", label: tx("clone") },
    { value: "selection", label: tx("selection") },
    ...(cn.status === "ok" ? [{ value: "cn", label: tx("cn") }] : []),
    ...data.fields.filter((f) => f.name !== "barcode" && f.name !== "dna").map((f) => ({ value: f.name, label: fieldLabel(f.name) })),
  ];
  const groupOptions = [
    { value: "clone", label: tx("clone") },
    ...categoricalFields.filter((f) => f.name !== "clone_id").map((f) => ({ value: f.name, label: fieldLabel(f.name) })),
  ];
  const r2 = (v) => (Number.isFinite(v) ? (Math.round(v * 100) / 100).toFixed(2) : "–");

  const controls = (
            <Space wrap>
              <Text type="secondary">{tx("color-by")}</Text>
              <Select size="small" style={{ width: 190 }} value={colorBy} onChange={setColorBy} options={colorOptions} showSearch data-testid="spatial-color" />
              <HideNaControl hide={hideNa} onChange={setHideNa} hidden={nHiddenNa} noun="spots" />
              {colorBy === "cn" && (
                <AutoComplete
                  size="small"
                  style={{ width: 120 }}
                  value={cnGene}
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
              <Text type="secondary">{tx("group-by")}</Text>
              <Select size="small" style={{ width: 150 }} value={groupBy} onChange={setGroupBy} options={groupOptions} />
              <Select size="small" style={{ width: 120 }} value={k} onChange={setK} options={[4, 6, 8, 10].map((n) => ({ value: n, label: tx("neighbours", { k: n }) }))} />
              <Button size="small" onClick={() => dispatch(singleCellActions.updateSelection([]))}>
                {tx("clear")}
              </Button>
            </Space>
  );

  const card = (
      <Wrapper>
        <Card
          size="small"
          className="sc-spatial"
          title={
            <Space wrap>
              <EnvironmentOutlined />
              <span>{tx("title")}</span>
              <Tooltip title={`data/${patient?.caseReportId}/spatial.json · ${data.source || ""}`}>
                <InfoCircleOutlined className="sc-hint-icon" />
              </Tooltip>
              <Text type="secondary">{tx("summary", { placed: points.length, dna: nLinked })}</Text>
            </Space>
          }
          extra={beside ? undefined : controls}
        >
          {beside && <div style={{ marginBottom: 8 }}>{controls}</div>}
          {nLinked === 0 && (
            <div data-testid="spatial-no-dna" style={{ marginBottom: 8 }}>
              <Text type="warning">{`None of the ${points.length} placed positions is a cell in this patient's DNA tree, so there is nothing to link to the phylogeny or heatmap; the map shows positions only (hollow). Hover and selection linking are unavailable.`}</Text>
            </div>
          )}
          {headlines.length > 0 && (
            <SpatialSection k="headline">
            <div className="sc-spatial-headline" data-testid="spatial-headline" style={{ marginBottom: 10 }}>
              {headlines.slice(0, 4).map((h) => (
                <div key={h.key}>
                  <Text strong={h.strong} type={h.strong ? undefined : "secondary"}>
                    {h.text}
                  </Text>
                </div>
              ))}
            </div>
            </SpatialSection>
          )}
          <div ref={containerRef} className="sc-umap" style={beside ? { display: "block" } : undefined}>
            <div className="sc-umap-plot" style={{ width: plotWidth, height: plotHeight }}>
              <canvas
                ref={canvasRef}
                data-testid="spatial-canvas"
                style={{ width: plotWidth, height: plotHeight, display: "block", cursor: lasso ? "crosshair" : "default" }}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onLeave}
              />
              {tip && (
                <div className="sc-tooltip" style={{ left: tip.left, top: tip.top }}>
                  {tip.lines.map(([key, v]) => (
                    <div key={key}>
                      <span className="sc-tooltip-key">{key}</span> {`${v}`}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <SpatialSection k="legend">
            <div className="sc-umap-legend" style={beside ? { width: "100%", marginTop: 8 } : { width: LEGEND_WIDTH }}>
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
                  <div className="sc-umap-ramp" style={{ background: `linear-gradient(to right, ${[0, 0.25, 0.5, 0.75, 1].map(viridis).join(",")})` }} />
                  <Text type="secondary" className="sc-hint">
                    {scale.range.map((v) => Math.round(v * 100) / 100).join(" – ")}
                  </Text>
                </>
              )}
              <span className="sc-legend-item">
                <span className="sc-legend-swatch sc-legend-hollow" />
                <Text type="secondary">{tx("no-dna")}</Text>
              </span>
              {selectionStat && (
                <Text type="secondary" className="sc-hint">
                  {tx("selection-stat", { n: selectionStat.n, I: r2(selectionStat.I), p: fmtP(selectionStat.pPerm) })}
                </Text>
              )}
              <Text type="secondary" className="sc-hint">
                {tx("hint")}
              </Text>
              {data.units && <Text type="secondary" className="sc-hint">{`Coordinates: ${data.units}`}</Text>}
            </div>
            </SpatialSection>
          </div>

          {["clustering", "enrichment", "niche", "mantel", "notes"].some((k) => !sp.hidden.includes(k)) && (
          <div style={{ marginTop: 12 }} data-testid="spatial-stats">
            <Text strong>{tx("stats-title")}</Text>
            <Tooltip title={tx("stats-method", { k, perm: 999 })}>
              <InfoCircleOutlined className="sc-hint-icon" style={{ marginLeft: 6 }} />
            </Tooltip>
            {!weights ? (
              <Text type="secondary" className="sc-none">{tx("none-found")}</Text>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 6 }}>
                <SpatialSection k="clustering">
                <div style={{ flex: "1 1 320px", minWidth: 300 }}>
                  <Text type="secondary">{tx("clustering")}</Text>
                  <Table
                    size="small"
                    pagination={false}
                    rowKey="label"
                    dataSource={clustering}
                    onRow={(r) => ({ onClick: () => selectGroup(r.label), style: { cursor: "pointer" } })}
                    columns={[
                      {
                        title: groupBy === "clone" ? tx("clone") : fieldLabel(groupBy),
                        dataIndex: "label",
                        render: (v) =>
                          groupBy === "clone" && cloneColors[v] ? <DataSwatch color={cloneColors[v]}>{v}</DataSwatch> : v,
                      },
                      { title: "Cells", dataIndex: "n", width: 60 },
                      { title: "Moran's I", dataIndex: "I", width: 90, render: r2 },
                      { title: "p", dataIndex: "pPerm", width: 70, render: fmtP },
                    ]}
                  />
                  <Text type="secondary" className="sc-hint">{tx("click-row")}</Text>
                </div>
                </SpatialSection>
                {enrichment && (
                  <SpatialSection k="enrichment">
                  <div style={{ flex: "0 1 auto" }}>
                    <Text type="secondary">{tx("enrichment")}</Text>
                    <table className="sc-spatial-enrich" style={{ borderCollapse: "collapse", marginTop: 4, fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th />
                          {enrichment.labels.map((l) => (
                            <th key={l} style={{ padding: "2px 6px", fontWeight: 500, writingMode: "vertical-rl", transform: "rotate(180deg)", maxHeight: 120 }}>
                              {l}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {enrichment.labels.map((a, i) => (
                          <tr key={a}>
                            <th style={{ padding: "2px 6px", fontWeight: 500, textAlign: "right", whiteSpace: "nowrap" }}>{a}</th>
                            {enrichment.labels.map((b, j) => (
                              <td
                                key={b}
                                title={`${a} – ${b}: ${enrichment.observed[i][j]} edges, expected ${r2(enrichment.mean[i][j])}, z = ${r2(enrichment.z[i][j])}`}
                                style={{ width: 34, height: 26, textAlign: "center", background: divergent(enrichment.z[i][j]), color: Math.abs(enrichment.z[i][j]) > 2.6 ? "#fff" : "#262626" }}
                              >
                                {r2(enrichment.z[i][j])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  </SpatialSection>
                )}
                {niche.some((n) => n.rows.length) && (
                  <SpatialSection k="niche">
                  <div style={{ flex: "1 1 320px", minWidth: 300 }}>
                    <Text type="secondary">{tx("niche")}</Text>
                    <Table
                      size="small"
                      pagination={false}
                      rowKey={(r) => `${r.score}-${r.label}`}
                      dataSource={niche.flatMap((n) => n.rows.map((r) => ({ ...r, score: n.score })))}
                      columns={[
                        { title: "Niche", dataIndex: "score", width: 90 },
                        { title: groupBy === "clone" ? tx("clone") : fieldLabel(groupBy), dataIndex: "label" },
                        { title: "Group", dataIndex: "mean", width: 70, render: r2 },
                        { title: "Others", dataIndex: "background", width: 70, render: r2 },
                        { title: "p", dataIndex: "p", width: 70, render: fmtP },
                      ]}
                    />
                  </div>
                  </SpatialSection>
                )}
                <SpatialSection k="mantel">
                <div style={{ flex: "1 1 260px", minWidth: 240 }}>
                  <Text type="secondary">{tx("mantel")}</Text>
                  {mantelRes ? (
                    <div data-testid="spatial-mantel">
                      <div>
                        <Text>{`Mantel r = ${r2(mantelRes.r)}, p = ${fmtP(mantelRes.p)} (${mantelRes.cells} cells${tree.method && tree.method !== "file" ? `, ${tree.method} tree` : ""})`}</Text>
                      </div>
                      {profile.length > 0 && (
                        <div>
                          <Text type="secondary" className="sc-hint">{tx("profile-head")}</Text>
                          <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 48, marginTop: 4 }}>
                            {profile.map((b, i) => {
                              const max = Math.max(...profile.map((q) => q.tree)) || 1;
                              return (
                                <div
                                  key={i}
                                  title={`${Math.round(b.from)}–${Math.round(b.to)} apart: mean tree distance ${r2(b.tree)} (${b.pairs} pairs)`}
                                  style={{ width: 28, height: Math.max(2, (44 * b.tree) / max), background: pt.select, opacity: 0.75 }}
                                />
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <Text type="secondary" className="sc-none">{tx("mantel-none")}</Text>
                  )}
                </div>
                </SpatialSection>
              </div>
            )}
            {data.notes.length > 0 && (
              <SpatialSection k="notes">
              <div style={{ marginTop: 8 }}>
                {data.notes.map((n) => (
                  <Text key={n} type="secondary" className="sc-hint" style={{ display: "block" }}>
                    {n}
                  </Text>
                ))}
              </div>
              </SpatialSection>
            )}
          </div>
          )}
        </Card>
      </Wrapper>
  );
  return bare ? card : <Col span={24}>{card}</Col>;
}
