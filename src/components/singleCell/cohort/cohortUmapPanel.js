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
import { INK, TYPE } from "../../../helpers/singleCell/plotTheme";

const { Text } = Typography;
const HEIGHT = 520;

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
  const [data, setData] = useState(undefined);
  const [colorBy, setColorBy] = useState("patient");
  const [hidden, setHidden] = useState([]);
  const [tumorOnly, setTumorOnly] = useState(true);
  // drag a box on the plot to select cells (Shift / Cmd adds to the selection)
  const svgRef = useRef(null);
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
  const cells = useMemo(() => (data?.cells || []).filter((c) => !tumorOnly || !c.Cell_Type || /malignant|tumou?r/i.test(`${c.Cell_Type}`)), [data, tumorOnly]);
  const fields = useMemo(() => {
    const names = new Set();
    cells.forEach((c) => Object.keys(c).forEach((k) => names.add(k)));
    return [...names].filter((k) => !["rna_id", "cell_id", "umap_1", "umap_2", "patient"].includes(k) && cells.some((c) => typeof c[k] === "string"));
  }, [cells]);
  if (data === undefined) return <Text type="secondary">{t("components.single-cell.loading")}</Text>;
  if (!data) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.cohort.umap-missing")} />;
  const patients = [...new Set(cells.map((c) => c.patient))].sort();
  const shown = cells.filter((c) => !hidden.includes(c.patient) && Number.isFinite(c.umap_1) && Number.isFinite(c.umap_2));
  const w = Math.max(400, width - 24);
  const x = d3.scaleLinear().domain(d3.extent(cells, (c) => c.umap_1)).range([12, w - 12]);
  const y = d3.scaleLinear().domain(d3.extent(cells, (c) => c.umap_2)).range([HEIGHT - 12, 12]);
  const byScore = colorBy === "__score" && overlay?.values;
  const scoreScale = byScore ? d3.scaleSequential(d3.interpolateViridis).domain(d3.extent([...overlay.values.values()].filter(Number.isFinite))) : null;
  const levels = colorBy === "patient" ? patients : [...new Set(cells.map((c) => c[colorBy]).filter((v) => v != null && v !== ""))].map(String).sort();
  const colors = colorBy === "patient" ? Object.fromEntries(patients.map((p, i) => [p, patientColor(i)])) : annotationColors(levels, themePalette(layout.theme));
  const open = (c) => {
    const s = summaries.find((x) => x.caseReportId === c.patient);
    if (s) dispatch(datasetsActions.openCaseReport(s.record.datasetId, s.caseReportId));
  };
  const keyOf = (c) => `${c.patient}::${c.rna_id}`;
  const local = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const onDown = (e) => {
    if (!onSelect || e.button !== 0) return;
    const [mx, my] = local(e);
    setDrag({ x0: mx, y0: my, x1: mx, y1: my, add: e.shiftKey || e.metaKey || e.ctrlKey });
  };
  const onMove = (e) => drag && setDrag((d) => ({ ...d, x1: local(e)[0], y1: local(e)[1] }));
  const onUp = () => {
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
          <Select size="small" style={{ width: 170 }} value={colorBy} onChange={setColorBy} options={[{ value: "patient", label: t("components.single-cell.cohort.patient") }, ...(overlay ? [{ value: "__score", label: `${t("components.single-cell.cohort.umap-score")}: ${overlay.label}` }] : []), ...fields.map((f) => ({ value: f, label: f }))]} />
          <Select size="small" mode="multiple" allowClear placeholder={t("components.single-cell.toolbar.hide-placeholder")} style={{ minWidth: 160 }} value={hidden} onChange={setHidden} options={patients.map((p) => ({ value: p, label: p }))} maxTagCount="responsive" />
          <Switch size="small" checked={tumorOnly} onChange={setTumorOnly} />
          <Text>{t("components.single-cell.rna.tumor-only")}</Text>
          {onSelect && nSelected > 0 && (
            <Tag color="blue" closable onClose={() => onSelect([], false)}>{t("components.single-cell.cohort.umap-selected", { count: nSelected })}</Tag>
          )}
          {onSelect && !nSelected && <Button size="small" type="text" disabled>{t("components.single-cell.cohort.umap-drag")}</Button>}
          <SvgExportButton containerRef={ref} name="cohort-umap" />
        </Space>
      }
    >
      <div ref={ref}>
        <svg ref={svgRef} width={w} height={HEIGHT} style={{ display: "block", cursor: onSelect ? "crosshair" : undefined, userSelect: "none" }} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={() => setDrag(null)}>
          {shown.map((c, i) => (
            <circle key={`${c.patient}-${c.rna_id}-${i}`} cx={x(c.umap_1)} cy={y(c.umap_2)} r={selection?.has(keyOf(c)) ? 3.4 : 2.6} stroke={selection?.has(keyOf(c)) ? "#141414" : "none"} strokeWidth={1.2} fillOpacity={selection?.size && !selection.has(keyOf(c)) ? 0.35 : 0.85} fill={byScore ? (Number.isFinite(overlay.values.get(`${c.patient}::${c.rna_id}`)) ? scoreScale(overlay.values.get(`${c.patient}::${c.rna_id}`)) : "#d9d9d9") : colors[colorBy === "patient" ? c.patient : `${c[colorBy]}`] || "#d9d9d9"} style={{ cursor: "pointer" }} onClick={(e) => !drag && !e.shiftKey && open(c)}>
              <title>{`${c.patient} · ${c.rna_id}${c.state ? ` · ${c.state}` : ""}${c.Phase ? ` · ${c.Phase}` : ""}`}</title>
            </circle>
          ))}
          <text x={w - 8} y={HEIGHT - 8} textAnchor="end" fontSize={TYPE.tick} fill={INK.muted}>{data.method || "integrated UMAP"}</text>
          {drag && <rect x={Math.min(drag.x0, drag.x1)} y={Math.min(drag.y0, drag.y1)} width={Math.abs(drag.x1 - drag.x0)} height={Math.abs(drag.y1 - drag.y0)} fill="rgba(22,119,255,0.08)" stroke={INK.select} strokeDasharray="4 3" pointerEvents="none" />}
        </svg>
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
        <HintLine text={t("components.single-cell.cohort.umap-help")} />
      </div>
    </Card>
  );
}
