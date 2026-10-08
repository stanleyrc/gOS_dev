import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Card, Empty, Select, Space, Switch, Typography } from "antd";
import { DotChartOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import SvgExportButton from "../svgExportButton";
import datasetsActions from "../../../redux/datasets/actions";
import { tryGet } from "../../../redux/singleCell/loaders";
import { annotationColors } from "../../../helpers/singleCell/matrix";
import { themePalette } from "../../../helpers/singleCell/themes";
import { Swatches, patientColor } from "./charts";

const { Text } = Typography;
const HEIGHT = 520;

/**
 * Integrated UMAP of every patient's RNA cells (pipeline: merged Seurat
 * objects, Harmony on patient, UMAP; data/_cohort/rna/cells.json). Colour by
 * patient or any metadata field, hide patients, click a cell to open its
 * patient.
 */
export default function CohortUmapPanel({ summaries, datasets }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const layout = useSelector((s) => s.SingleCell.layout);
  const [ref, width] = useContainerWidth(900);
  const [data, setData] = useState(undefined);
  const [colorBy, setColorBy] = useState("patient");
  const [hidden, setHidden] = useState([]);
  const [tumorOnly, setTumorOnly] = useState(true);
  const dataset = datasets[0];
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
  const levels = colorBy === "patient" ? patients : [...new Set(cells.map((c) => c[colorBy]).filter((v) => v != null && v !== ""))].map(String).sort();
  const colors = colorBy === "patient" ? Object.fromEntries(patients.map((p, i) => [p, patientColor(i)])) : annotationColors(levels, themePalette(layout.theme));
  const open = (c) => {
    const s = summaries.find((x) => x.caseReportId === c.patient);
    if (s) dispatch(datasetsActions.openCaseReport(s.record.datasetId, s.caseReportId));
  };
  return (
    <Card
      size="small"
      title={<Space><DotChartOutlined />{t("components.single-cell.cohort.umap-title", { count: shown.length })}</Space>}
      extra={
        <Space wrap>
          <Select size="small" style={{ width: 170 }} value={colorBy} onChange={setColorBy} options={[{ value: "patient", label: t("components.single-cell.cohort.patient") }, ...fields.map((f) => ({ value: f, label: f }))]} />
          <Select size="small" mode="multiple" allowClear placeholder={t("components.single-cell.toolbar.hide-placeholder")} style={{ minWidth: 160 }} value={hidden} onChange={setHidden} options={patients.map((p) => ({ value: p, label: p }))} maxTagCount="responsive" />
          <Switch size="small" checked={tumorOnly} onChange={setTumorOnly} />
          <Text>{t("components.single-cell.rna.tumor-only")}</Text>
          <SvgExportButton containerRef={ref} name="cohort-umap" />
        </Space>
      }
    >
      <div ref={ref}>
        <svg width={w} height={HEIGHT} style={{ display: "block" }}>
          {shown.map((c, i) => (
            <circle key={`${c.patient}-${c.rna_id}-${i}`} cx={x(c.umap_1)} cy={y(c.umap_2)} r={2.6} fill={colors[colorBy === "patient" ? c.patient : `${c[colorBy]}`] || "#d9d9d9"} fillOpacity={0.85} style={{ cursor: "pointer" }} onClick={() => open(c)}>
              <title>{`${c.patient} · ${c.rna_id}${c.state ? ` · ${c.state}` : ""}${c.Phase ? ` · ${c.Phase}` : ""}`}</title>
            </circle>
          ))}
          <text x={w - 8} y={HEIGHT - 8} textAnchor="end" fontSize={11} fill="#8c8c8c">{data.method || "integrated UMAP"}</text>
        </svg>
        <Swatches items={levels.map((l) => ({ key: l, color: colors[l], label: l }))} />
        <Text type="secondary" style={{ fontSize: 12 }}>{t("components.single-cell.cohort.umap-help")}</Text>
      </div>
    </Card>
  );
}
