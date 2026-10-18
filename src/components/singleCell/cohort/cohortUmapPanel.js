import React, { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Button, Card, Empty, Select, Space, Switch, Tag, Typography } from "antd";
import { DotChartOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import SvgExportButton from "../svgExportButton";
import datasetsActions from "../../../redux/datasets/actions";
import { tryGet } from "../../../redux/singleCell/loaders";
import { annotationColors } from "../../../helpers/singleCell/matrix";
import { themePalette } from "../../../helpers/singleCell/themes";
import { Swatches, patientColor } from "./charts";
import HintLine, { Provenance } from "../hintLine";
import useHideNa, { HideNaControl } from "../useHideNa";
import { isNaValue, partitionNa } from "../../../helpers/singleCell/hideNa";
import { INK, TYPE } from "../../../helpers/singleCell/plotTheme";
import useUmapZoom from "../useUmapZoom";
import UmapViewControls from "../umapViewControls";
import Umap3dCanvas from "../umap3dCanvas";
import { toScreen, zoomRadius } from "../../../helpers/singleCell/umapZoom";
import { defaultView3d, parseColor, zoom3d } from "../../../helpers/singleCell/umap3d";

const { Text } = Typography;
const HEIGHT = 520;

/** 3-D view of the cohort UMAP (data/_cohort/rna/umap3d.json); keeps its own camera and hover state. */
function CohortUmap3d({ shown, data3d, colorOf, selection, keyOf, width, height, onOpen, onDim, dimDisabledReason, ink, hoverText }) {
  const [view, setView] = useState(defaultView3d);
  const [hover, setHover] = useState({ index: -1, x: 0, y: 0 });
  const pts = useMemo(() => shown.filter((c) => data3d.index.has(keyOf(c))), [shown, data3d, keyOf]);
  const drawn = useMemo(
    () =>
      pts.map((c) => {
        const q = data3d.index.get(keyOf(c));
        return { x: q.x, y: q.y, z: q.z, rgb: parseColor(colorOf(c)) || [0.85, 0.85, 0.85], selected: Boolean(selection?.has(keyOf(c))), hollow: false };
      }),
    [pts, data3d, colorOf, selection, keyOf]
  );
  const h = hover.index >= 0 ? pts[hover.index] : null;
  return (
    <div style={{ position: "relative", width, height }}>
      <UmapViewControls
        dim="3d"
        onDim={onDim}
        dimDisabledReason={dimDisabledReason}
        onZoomIn={() => setView((v) => zoom3d(v, 1.4))}
        onZoomOut={() => setView((v) => zoom3d(v, 1 / 1.4))}
        onReset={() => setView(defaultView3d())}
        zoom={`${Math.round(view.zoom * 100)}%`}
      />
      <Umap3dCanvas
        points={drawn}
        width={width}
        height={height}
        view={view}
        onViewChange={setView}
        onHover={(index, x, y) => setHover((cur) => (cur.index === index && index < 0 ? cur : { index, x, y }))}
        onPick={(index) => pts[index] && onOpen(pts[index])}
        hoveredIndex={hover.index}
        baseSize={5}
        ink={ink}
      />
      {h && (
        <div style={{ position: "absolute", left: Math.min(hover.x + 12, width - 260), top: hover.y + 12, background: "rgba(0,0,0,0.82)", color: "#fff", padding: "3px 7px", borderRadius: 3, fontSize: 12, pointerEvents: "none", maxWidth: 360, zIndex: 5 }}>
          {hoverText(h)}
        </div>
      )}
      <div style={{ position: "absolute", left: 6, bottom: 4, fontSize: 11.5, opacity: 0.6, pointerEvents: "none" }}>{pts.length} / {shown.length} cells have 3D coordinates</div>
    </div>
  );
}

/**
 * Integrated UMAP of every patient's RNA cells (pipeline: merged Seurat
 * objects, Harmony on patient, UMAP; data/_cohort/rna/cells.json). Colour by
 * patient or any metadata field, hide patients, click a cell to open its
 * patient.
 */
export default function CohortUmapPanel({ summaries, datasets, overlay = null, selection = null, onSelect = null }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const layout = useSelector((s) => s.SingleCell.layout);
  const [ref, width] = useContainerWidth(900);
  // square-ish plot (width <= 1.2 x height) with the legend beside it, never stretched across the page
  const w = Math.min(Math.max(400, width - 24), Math.round(1.2 * HEIGHT));
  const zoom = useUmapZoom(w, HEIGHT);
  const zv = zoom.view;
  const [dragMode, setDragMode] = useState("select");
  const [dim, setDim] = useState("2d");
  const [data3d, setData3d] = useState({ status: "loading" });
  const [data, setData] = useState(undefined);
  const [colorBy, setColorBy] = useState("patient");
  const [hidden, setHidden] = useState([]);
  const [tumorOnly, setTumorOnly] = useState(true);
  const [hideNa, setHideNa] = useHideNa();
  // drag a box on the plot to select cells (Shift / Cmd adds to the selection)
  const svgRef = useRef(null);
  const panRef = useRef(null);
  const [drag, setDrag] = useState(null);
  // the dataset these patients belong to (the records list may hold other datasets first)
  const dataset = datasets.find((d) => summaries.some((s) => `${s.record.datasetId}` === `${d.id}`)) || datasets[0];
  useEffect(() => {
    if (!dataset) return undefined;
    let active = true;
    tryGet(`${dataset.dataPath}_cohort/rna/cells.json`).then((r) => active && setData(r.status === "ok" ? r.data : null));
    return () => {
      active = false;
    };
  }, [dataset]);
  useEffect(() => {
    if (!dataset) return undefined;
    let active = true;
    setData3d({ status: "loading" });
    tryGet(`${dataset.dataPath}_cohort/rna/umap3d.json`).then(
      (r) => active && setData3d(r.status === "ok" ? { status: "ok", index: new Map((r.data.cells || []).filter((c) => [c.x, c.y, c.z].every(Number.isFinite)).map((c) => [`${c.patient}::${c.rna_id}`, c])), method: r.data.method } : { status: r.status }),
      () => active && setData3d({ status: "error" })
    );
    return () => {
      active = false;
    };
  }, [dataset]);
  const cells = useMemo(() => (data?.cells || []).filter((c) => !tumorOnly || !c.Cell_Type || /malignant|tumou?r/i.test(`${c.Cell_Type}`)), [data, tumorOnly]);
  const fields = useMemo(() => {
    const names = new Set();
    cells.forEach((c) => Object.keys(c).forEach((k) => names.add(k)));
    return [...names].filter((k) => !["rna_id", "cell_id", "umap_1", "umap_2", "patient"].includes(k) && cells.some((c) => typeof c[k] === "string"));
  }, [cells]);
  const [hover, setHover] = useState(null); // { c, mx, my }
  if (data === undefined) return <Text type="secondary">{t("components.single-cell.loading")}</Text>;
  if (!data) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.cohort.umap-missing")} />;
  const patients = [...new Set(cells.map((c) => c.patient))].sort();
  const placed = cells.filter((c) => !hidden.includes(c.patient) && Number.isFinite(c.umap_1) && Number.isFinite(c.umap_2));
  const x0 = d3.scaleLinear().domain(d3.extent(cells, (c) => c.umap_1)).range([40, w - 12]);
  const y0 = d3.scaleLinear().domain(d3.extent(cells, (c) => c.umap_2)).range([HEIGHT - 34, 12]);
  const x = (v) => toScreen(zv, x0(v), 0)[0];
  const y = (v) => toScreen(zv, 0, y0(v))[1];
  const rBase = zoomRadius(2.6, zv.k);
  const byScore = colorBy === "__score" && overlay?.values;
  const scoreScale = byScore ? d3.scaleSequential(d3.interpolateViridis).domain(d3.extent([...overlay.values.values()].filter(Number.isFinite))) : null;
  // NA = no value for the colour field (score overlay or metadata column)
  const { shown, hidden: nHiddenNa } = partitionNa(
    placed,
    (c) => (byScore ? !Number.isFinite(overlay.values.get(`${c.patient}::${c.rna_id}`)) : colorBy !== "patient" && isNaValue(c[colorBy])),
    hideNa
  );
  const levels = colorBy === "patient" ? patients : [...new Set(cells.map((c) => c[colorBy]).filter((v) => v != null && v !== ""))].map(String).sort();
  const colors = colorBy === "patient" ? Object.fromEntries(patients.map((p, i) => [p, patientColor(i)])) : annotationColors(levels, themePalette(layout.theme));
  const dimReason = data3d.status === "ok" ? null : data3d.status === "loading" ? t("components.single-cell.umap.3d-loading") : data3d.status === "missing" ? t("components.single-cell.cohort.umap3d-missing") : t("components.single-cell.umap.3d-error");
  const is3d = dim === "3d" && !dimReason;
  const colorOf = (c) => (byScore ? (Number.isFinite(overlay.values.get(keyOf(c))) ? scoreScale(overlay.values.get(keyOf(c))) : "#d9d9d9") : colors[colorBy === "patient" ? c.patient : `${c[colorBy]}`] || "#d9d9d9");
  const open = (c) => {
    const s = summaries.find((x) => x.caseReportId === c.patient);
    if (s) dispatch(datasetsActions.openCaseReport(s.record.datasetId, s.caseReportId, { allowNewTab: true }));
  };
  const keyOf = (c) => `${c.patient}::${c.rna_id}`;
  const local = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const onDown = (e) => {
    if (e.button !== 0 && e.button !== 1) return;
    const [mx, my] = local(e);
    if (e.button === 1) e.preventDefault();
    if (e.button === 1 || e.altKey || dragMode === "pan") {
      panRef.current = { last: [mx, my], moved: false };
      return;
    }
    if (!onSelect) return;
    setDrag({ x0: mx, y0: my, x1: mx, y1: my, add: e.shiftKey || e.metaKey || e.ctrlKey });
  };
  // hover: nearest point within 8 px (quadtree), shown in an instant tooltip; native <title> is slow and easy to miss
  const tree = d3.quadtree(shown, (c) => x(c.umap_1), (c) => y(c.umap_2));
  const onMove = (e) => {
    const [mx, my] = local(e);
    if (panRef.current) {
      zoom.pan(mx - panRef.current.last[0], my - panRef.current.last[1]);
      panRef.current = { last: [mx, my], moved: true };
      setHover(null);
      return;
    }
    if (drag) {
      setDrag((d) => ({ ...d, x1: mx, y1: my }));
      return;
    }
    const c = tree.find(mx, my, 8);
    setHover(c ? { c, mx, my } : null);
  };
  const hoverText = (c) =>
    [
      c.patient,
      c.cell_id ? `cell ${c.cell_id}` : null,
      `RNA ${c.rna_id}`,
      c.state ? `state ${c.state}` : null,
      c.Phase ? `phase ${c.Phase}` : null,
      colorBy !== "patient" && colorBy !== "__score" && c[colorBy] != null ? `${colorBy}: ${c[colorBy]}` : null,
      byScore && Number.isFinite(overlay.values.get(keyOf(c))) ? `${overlay.label}: ${overlay.values.get(keyOf(c)).toFixed(2)}` : null,
    ].filter(Boolean).join(" · ");
  const onUp = () => {
    if (panRef.current) {
      panRef.current = null;
      return;
    }
    if (!drag) return;
    const [a, b] = [Math.min(drag.x0, drag.x1), Math.max(drag.x0, drag.x1)];
    const [c0, d0] = [Math.min(drag.y0, drag.y1), Math.max(drag.y0, drag.y1)];
    if (b - a > 4 && d0 - c0 > 4) onSelect(shown.filter((c) => x(c.umap_1) >= a && x(c.umap_1) <= b && y(c.umap_2) >= c0 && y(c.umap_2) <= d0).map(keyOf), drag.add);
    setDrag(null);
  };
  const nSelected = selection ? shown.filter((c) => selection.has(keyOf(c))).length : 0;
  return (
    <Card
      size="small"
      title={<Space><DotChartOutlined />{t("components.single-cell.cohort.umap-title", { count: shown.length })}<Provenance id="cohortRna" /></Space>}
      extra={
        <Space wrap>
          <Select size="small" showSearch optionFilterProp="label" style={{ width: 170 }} value={colorBy} onChange={setColorBy} options={[{ value: "patient", label: t("components.single-cell.cohort.patient") }, ...(overlay ? [{ value: "__score", label: `${t("components.single-cell.cohort.umap-score")}: ${overlay.label}` }] : []), ...fields.map((f) => ({ value: f, label: f }))]} />
          <Select size="small" mode="multiple" allowClear placeholder={t("components.single-cell.toolbar.hide-placeholder")} style={{ minWidth: 160 }} value={hidden} onChange={setHidden} options={patients.map((p) => ({ value: p, label: p }))} maxTagCount="responsive" />
          <Switch size="small" checked={tumorOnly} onChange={setTumorOnly} />
          <Text>{t("components.single-cell.rna.tumor-only")}</Text>
          <HideNaControl hide={hideNa} onChange={setHideNa} hidden={nHiddenNa} />
          {onSelect && nSelected > 0 && (
            <Tag color="blue" closable onClose={() => onSelect([], false)}>{t("components.single-cell.cohort.umap-selected", { count: nSelected })}</Tag>
          )}
          {onSelect && !nSelected && <Button size="small" type="text" disabled>{t("components.single-cell.cohort.umap-drag")}</Button>}
          <SvgExportButton containerRef={ref} name="cohort-umap" />
        </Space>
      }
    >
      <div ref={ref} style={{ position: "relative", display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
        {is3d ? (
          <CohortUmap3d shown={shown} data3d={data3d} colorOf={colorOf} selection={selection} keyOf={keyOf} width={w} height={HEIGHT} onOpen={open} onDim={setDim} dimDisabledReason={dimReason} ink={INK.text || "#555"} hoverText={hoverText} />
        ) : (
        <div ref={zoom.bindRef} style={{ position: "relative", width: w, height: HEIGHT }}>
          <UmapViewControls
            dim="2d"
            onDim={setDim}
            dimDisabledReason={dimReason}
            mode={dragMode}
            onMode={setDragMode}
            onZoomIn={() => zoom.zoomBy(1.4)}
            onZoomOut={() => zoom.zoomBy(1 / 1.4)}
            onReset={zoom.reset}
            zoom={`${Math.round(zv.k * 100)}%`}
          />
        <svg ref={svgRef} width={w} height={HEIGHT} style={{ display: "block", cursor: onSelect ? "crosshair" : undefined, userSelect: "none" }} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={() => { setDrag(null); setHover(null); panRef.current = null; }} onDoubleClick={zoom.reset}>
          <defs><clipPath id="cohort-umap-clip"><rect x={0} y={0} width={w} height={HEIGHT - 20} /></clipPath></defs>
          <g clipPath="url(#cohort-umap-clip)">
          {shown.map((c, i) => (
            <circle key={`${c.patient}-${c.rna_id}-${i}`} cx={x(c.umap_1)} cy={y(c.umap_2)} r={selection?.has(keyOf(c)) ? rBase + 0.8 : rBase} stroke={selection?.has(keyOf(c)) ? "#141414" : "none"} strokeWidth={1.2} fillOpacity={selection?.size && !selection.has(keyOf(c)) ? 0.35 : 0.85} fill={byScore ? (Number.isFinite(overlay.values.get(`${c.patient}::${c.rna_id}`)) ? scoreScale(overlay.values.get(`${c.patient}::${c.rna_id}`)) : "#d9d9d9") : colors[colorBy === "patient" ? c.patient : `${c[colorBy]}`] || "#d9d9d9"} style={{ cursor: "pointer" }} onClick={(e) => !drag && !e.shiftKey && !panRef.current && open(c)}>
              <title>{`${c.patient} · ${c.rna_id}${c.state ? ` · ${c.state}` : ""}${c.Phase ? ` · ${c.Phase}` : ""}`}</title>
            </circle>
          ))}
          {hover && !drag && <circle cx={x(hover.c.umap_1)} cy={y(hover.c.umap_2)} r={rBase + 2.4} fill="none" stroke="#141414" strokeWidth={1.5} pointerEvents="none" />}
          </g>
          <text x={(40 + w - 12) / 2} y={HEIGHT - 8} textAnchor="middle" fontSize={TYPE.tick} fill={INK.muted}>UMAP 1 (arbitrary units)</text>
          <text transform={`translate(14,${(12 + HEIGHT - 34) / 2}) rotate(-90)`} textAnchor="middle" fontSize={TYPE.tick} fill={INK.muted}>UMAP 2 (arbitrary units)</text>
          {drag && <rect x={Math.min(drag.x0, drag.x1)} y={Math.min(drag.y0, drag.y1)} width={Math.abs(drag.x1 - drag.x0)} height={Math.abs(drag.y1 - drag.y0)} fill="rgba(22,119,255,0.08)" stroke={INK.select} strokeDasharray="4 3" pointerEvents="none" />}
        </svg>
        </div>
        )}
        {hover && !drag && (
          <div style={{ position: "absolute", left: Math.min(hover.mx + 12, w - 260), top: hover.my + 12, background: "rgba(0,0,0,0.82)", color: "#fff", padding: "3px 7px", borderRadius: 3, fontSize: 12, pointerEvents: "none", maxWidth: 360, zIndex: 5 }}>
            {hoverText(hover.c)}
            <div style={{ opacity: 0.7 }}>click to open the patient</div>
          </div>
        )}
        <div style={{ flex: "1 1 220px", minWidth: 200, maxWidth: 420 }}>
        {byScore ? (
          <Space size={4} style={{ fontSize: 12.5 }}>
            <span>{scoreScale.domain()[0].toFixed(2)}</span>
            <svg width={120} height={10}>{d3.range(0, 1.001, 0.05).map((f) => <rect key={f} x={f * 120} width={6} height={10} fill={scoreScale(scoreScale.domain()[0] + f * (scoreScale.domain()[1] - scoreScale.domain()[0]))} />)}</svg>
            <span>{scoreScale.domain()[1].toFixed(2)}</span>
            <Text type="secondary">{overlay.label}</Text>
          </Space>
        ) : (
          <Swatches items={levels.map((l) => ({ key: l, color: colors[l], label: l }))} />
        )}
        <Text type="secondary" style={{ display: "block", fontSize: 12, marginTop: 6 }}>{data.method || "integrated UMAP"}</Text>
        <HintLine text={t("components.single-cell.cohort.umap-help")} />
        </div>
      </div>
    </Card>
  );
}
