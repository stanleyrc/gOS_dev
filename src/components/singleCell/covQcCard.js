import React, { useMemo } from "react";
import { useDispatch } from "react-redux";
import { Button, Card, InputNumber, Space, Switch, Table, Tag, Typography } from "antd";
import singleCellActions from "../../redux/singleCell/actions";
import { useSelector } from "react-redux";
import useCovQc from "./useCovQc";
import { COV_QC_METRICS, DEFAULT_COV_QC, covQcStatus } from "../../helpers/singleCell/cellQc";

const { Text } = Typography;

/**
 * QC tab: editable coverage-QC thresholds with a live count of cells failing / hidden, and the failing cells
 * listed with their reasons. Defaults come from the gbm-sc cell distribution (analysis/cell_qc).
 */
export default function CovQcCard() {
  const dispatch = useDispatch();
  const cells = useSelector((s) => s.SingleCell.cells);
  const { hide, setHide, thresholds, setThresholds, available, failed, counts, total } = useCovQc();
  const rows = useMemo(
    () =>
      cells
        .map((c) => ({ c, s: covQcStatus(c, thresholds) }))
        .filter((r) => r.s.has && !r.s.pass)
        .map((r) => ({ key: `${r.c.cell_id}`, id: `${r.c.cell_id}`, clone: r.c.clone_id, reason: r.s.reasons.join(", "),
          ...Object.fromEntries(COV_QC_METRICS.map((m) => [m.key, r.c[m.field]])) })),
    [cells, thresholds]
  );
  if (!available) {
    return (
      <Card size="small" title="Coverage QC thresholds">
        <Text type="secondary">Not available: this patient's cells carry no coverage QC metrics (qc_* fields in each cell's metadata.json).</Text>
      </Card>
    );
  }
  const edited = COV_QC_METRICS.some((m) => thresholds[m.key] !== DEFAULT_COV_QC[m.key]);
  const set = (key, v) => v != null && setThresholds({ ...thresholds, [key]: v });
  return (
    <Card
      size="small"
      title="Coverage QC thresholds"
      extra={
        <Space>
          <Switch size="small" checked={hide} onChange={setHide} />
          <Text>Hide low-QC cells</Text>
          <Tag color={failed ? "orange" : "default"}>{hide ? `${failed} of ${total} hidden` : `${failed} of ${total} fail`}</Tag>
        </Space>
      }
    >
      <Space wrap size="large" align="start">
        {COV_QC_METRICS.map((m) => (
          <Space key={m.key} direction="vertical" size={2}>
            <Text type="secondary">{m.label} ({m.dir === "max" ? "fail above" : "fail below"})</Text>
            <Space size={6}>
              <InputNumber size="small" style={{ width: 96 }} min={0} step={m.step} value={thresholds[m.key]} onChange={(v) => set(m.key, v)} />
              <Tag color={counts[m.key] ? "orange" : "default"}>{counts[m.key]} cells</Tag>
            </Space>
          </Space>
        ))}
        <Button size="small" disabled={!edited} onClick={() => setThresholds(null)}>
          Reset to defaults
        </Button>
        <Button
          size="small"
          disabled={!rows.length}
          onClick={() => dispatch(singleCellActions.updateSelection(rows.map((r) => r.id)))}
        >
          Select failing cells ({rows.length})
        </Button>
      </Space>
      {rows.length > 0 && (
        <Table
          style={{ marginTop: 8 }}
          size="small"
          pagination={rows.length > 12 ? { pageSize: 12, size: "small" } : false}
          dataSource={rows}
          columns={[
            { title: "Cell", dataIndex: "id" },
            { title: "Clone", dataIndex: "clone" },
            { title: "Reason", dataIndex: "reason" },
            ...COV_QC_METRICS.map((m) => ({
              title: m.label,
              dataIndex: m.key,
              render: (v) => (v == null ? "" : (+v).toFixed(m.digits)),
              sorter: (a, b) => (a[m.key] ?? 0) - (b[m.key] ?? 0),
            })),
          ]}
        />
      )}
    </Card>
  );
}
