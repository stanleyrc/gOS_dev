import React, { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Button, Card, Col, Empty, Row, Select, Space, Switch, Table, Tag, Typography } from "antd";
import { ExperimentOutlined } from "@ant-design/icons";
import useContainerWidth from "./useContainerWidth";
import singleCellActions from "../../redux/singleCell/actions";
import datasetsActions from "../../redux/datasets/actions";
import { cnRowQc, robustOutliers } from "../../helpers/singleCell/cohortStats";
import { annotationColors } from "../../helpers/singleCell/matrix";
import { themePalette } from "../../helpers/singleCell/themes";
import { BoxStrips } from "./cohort/charts";
import { CELL_QC_METRICS } from "./cohort/cohortQcPanel";

const { Text } = Typography;

// Metrics computed in the browser from each cell's copy-number graph.
const CN_METRICS = [
  ["fractionAltered", "Fraction of genome off the modal CN", false, "high"],
  ["segments", "CN segments (state changes)", true, "high"],
  ["meanCn", "Mean CN", false, "both"],
  ["chrXMeanCn", "Mean CN on chrX", false, "both"],
];

/**
 * QC of one patient's cells: library metrics exported by the pipeline plus
 * copy-number metrics computed here, per clone / region, with MAD outliers
 * flagged and listed.
 */
export default function QcPanel() {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const [ref, width] = useContainerWidth(900);
  const { cells, cn, cloneColors, layout, patient } = useSelector((state) => state.SingleCell);
  const [groupBy, setGroupBy] = useState("clone_id");
  const [tumorOnly, setTumorOnly] = useState(true);

  const cnQc = useMemo(() => {
    const out = new Map();
    if (cn.status !== "ok" || !cn.data) return out;
    cn.data.cells.forEach((id, k) => {
      const qc = cnRowQc(cn.data.rows[k]);
      if (qc) out.set(id, qc);
    });
    return out;
  }, [cn]);

  const rows = useMemo(
    () =>
      cells
        .filter((c) => !tumorOnly || !/^normal$/i.test(`${c.clone_id || ""}`))
        .map((c) => ({ ...c, ...(cnQc.get(c.cell_id) || {}) })),
    [cells, cnQc, tumorOnly]
  );
  const metrics = useMemo(() => {
    const lib = CELL_QC_METRICS.filter(([k]) => rows.some((r) => Number.isFinite(Number(r[k])))).map(([k, label, log]) => [k, label, log, "both"]);
    const cnm = cnQc.size ? CN_METRICS : [];
    return [...cnm, ...lib];
  }, [rows, cnQc]);
  const groupFields = useMemo(() => {
    const fields = ["clone_id", "region", "state", "Region_Annotation", "Phase"].filter((f) => cells.some((c) => c[f] != null && c[f] !== ""));
    return fields;
  }, [cells]);
  const levels = useMemo(() => [...new Set(rows.map((r) => `${r[groupBy] ?? "NA"}`))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [rows, groupBy]);
  const colors = useMemo(() => (groupBy === "clone_id" ? cloneColors : annotationColors(levels, themePalette(layout.theme))), [groupBy, cloneColors, levels, layout.theme]);

  // Outliers per metric across the patient's (tumor) cells.
  const flags = useMemo(() => {
    const byCell = new Map();
    metrics.forEach(([k, label, , side]) => {
      const values = rows.map((r) => Number(r[k]));
      robustOutliers(values, { k: 3, side }).forEach((i) => {
        const id = rows[i].cell_id;
        if (!byCell.has(id)) byCell.set(id, []);
        byCell.get(id).push(label);
      });
    });
    return byCell;
  }, [metrics, rows]);

  if (!cells.length) return <Empty description={t("components.single-cell.qc.empty")} />;
  if (!metrics.length) return <Empty description={t("components.single-cell.qc.empty")} />;

  const groupsFor = (key) =>
    levels.map((lv) => {
      const sub = rows.filter((r) => `${r[groupBy] ?? "NA"}` === lv);
      return { key: lv, label: lv, color: colors[lv] || "#8c8c8c", values: sub.map((r) => Number(r[key])), ids: sub.map((r) => r.cell_id), cells: sub };
    });
  const flaggedIds = new Set(flags.keys());
  const flaggedRows = rows.filter((r) => flaggedIds.has(r.cell_id));
  const cols = Math.max(1, Math.min(2, Math.floor(width / 520)));
  const plotWidth = Math.floor((width - 16 * (cols - 1)) / cols) - 24;
  const openCell = (id) => patient && dispatch(datasetsActions.openCaseReport(patient.datasetId, id));

  return (
    <div ref={ref}>
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card
            size="small"
            title={<Space><ExperimentOutlined />{t("components.single-cell.qc.title")}</Space>}
            extra={
              <Space wrap>
                <Text type="secondary">{t("components.single-cell.qc.group-by")}</Text>
                <Select size="small" style={{ width: 170 }} value={groupBy} onChange={setGroupBy} options={groupFields.map((f) => ({ value: f, label: f === "clone_id" ? t("components.single-cell.umap.color-clone") : f }))} />
                <Switch size="small" checked={tumorOnly} onChange={setTumorOnly} />
                <Text>{t("components.single-cell.qc.tumor-only")}</Text>
                {flaggedRows.length > 0 && (
                  <Button size="small" onClick={() => dispatch(singleCellActions.updateSelection(flaggedRows.map((r) => r.cell_id)))}>
                    {t("components.single-cell.qc.select-flagged", { count: flaggedRows.length })}
                  </Button>
                )}
              </Space>
            }
          >
            <Text type="secondary">{t("components.single-cell.qc.help")}</Text>
          </Card>
        </Col>
        {metrics.map(([k, label, log]) => (
          <Col key={k} span={24 / cols}>
            <Card size="small" title={label}>
              <BoxStrips groups={groupsFor(k)} width={plotWidth} height={260} log={log} flagged={flaggedIds} onPoint={(g, i) => dispatch(singleCellActions.updateSelection([g.ids[i]]))} />
            </Card>
          </Col>
        ))}
        <Col span={24}>
          <Card size="small" title={t("components.single-cell.qc.flagged-title", { count: flaggedRows.length })}>
            <Table
              size="small"
              rowKey="cell_id"
              dataSource={flaggedRows}
              pagination={{ pageSize: 10, size: "small" }}
              columns={[
                {
                  title: t("components.single-cell.tooltip.cell"),
                  dataIndex: "cell_id",
                  render: (id) => (
                    <Button type="link" size="small" style={{ padding: 0 }} onClick={() => openCell(id)}>
                      {id}
                    </Button>
                  ),
                },
                { title: t("components.single-cell.tooltip.clone"), dataIndex: "clone_id", render: (c) => (c ? <Tag color={cloneColors[c]}>{c}</Tag> : "–") },
                { title: t("components.single-cell.qc.flags"), dataIndex: "cell_id", key: "flags", render: (id) => (flags.get(id) || []).join(", ") },
                { title: "Ploidy", dataIndex: "ploidy", render: (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(2) : "–") },
                { title: "Altered", dataIndex: "fractionAltered", render: (v) => (Number.isFinite(v) ? `${Math.round(v * 100)}%` : "–") },
                { title: "Segments", dataIndex: "segments" },
                {
                  title: "",
                  key: "select",
                  render: (_, r) => (
                    <Button size="small" onClick={() => dispatch(singleCellActions.updateSelection([r.cell_id]))}>
                      {t("components.single-cell.qc.select")}
                    </Button>
                  ),
                },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
