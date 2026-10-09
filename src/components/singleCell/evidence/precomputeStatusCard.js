import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Card, Descriptions, Space, Table, Tag, Tooltip, Typography } from "antd";
import { tryGet } from "../../../redux/singleCell/loaders";
import { PRECOMPUTE_STATUS_FILE, statusRows } from "../../../helpers/singleCell/precompute";
import { pcFile } from "./notComputed";
import { Provenance } from "../hintLine";

const { Text } = Typography;
const STATE_COLOR = { done: "green", stale: "gold", missing: "default", failed: "red", running: "blue", "n/a": "default" };

/**
 * Precompute pipeline status: every patient x step from data/_precompute/status.json
 * (written by gos_sc_precompute.py status after each job) and the open patient's
 * manifest (version, date, parameters and outputs of each step).
 */
export default function PrecomputeStatusCard() {
  const dataset = useSelector((s) => s.Settings.dataset);
  const { patient, precompute } = useSelector((s) => s.SingleCell);
  const manifest = pcFile(precompute, "manifest");
  const [status, setStatus] = useState({ status: "loading" });
  useEffect(() => {
    if (!dataset) return;
    tryGet(`${dataset.dataPath}${PRECOMPUTE_STATUS_FILE}`).then(setStatus);
  }, [dataset]);
  const { steps, rows } = statusRows(status.status === "ok" ? status.data : null);
  const stepInfo = new Map((status.data?.steps || []).map((s) => [s.id, s]));

  return (
    <Card size="small" title={<span>Precompute pipeline status <Provenance id="precomputeStatus" /></span>}>
      <Space direction="vertical" style={{ width: "100%" }} size="small">
        {status.status !== "ok" ? (
          <Text type="secondary">
            {status.status === "loading" ? "Loading…" : "No status file yet: run gos_sc_precompute.py status (srctools inst/gos_single_cell/precompute)."}
          </Text>
        ) : (
          <>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Updated {status.data.updated}. done = outputs newer than inputs with the current step version and parameters; stale = an input,
              script or parameter changed since; rerun one step for one patient with{" "}
              <code>gos_sc_precompute.py submit --patients P --steps STEP</code>.
            </Text>
            <Table
              size="small"
              rowKey="patient"
              pagination={false}
              scroll={{ x: 900 }}
              dataSource={rows}
              rowClassName={(r) => (r.patient === patient?.caseReportId ? "ant-table-row-selected" : "")}
              columns={[
                { title: "Patient", dataIndex: "patient", fixed: "left", render: (p) => <Text strong={p === patient?.caseReportId}>{p}</Text> },
                ...steps.map((s) => ({
                  title: <Tooltip title={stepInfo.get(s)?.description}>{s}</Tooltip>,
                  key: s,
                  render: (_, r) => {
                    const st = r.steps[s] || { state: "missing" };
                    return (
                      <Tooltip title={`${st.detail || ""}${st.finished ? ` · ${st.finished}` : ""}${st.job ? ` · job ${st.job}` : ""}`}>
                        <Tag color={STATE_COLOR[st.state]}>{st.state}</Tag>
                      </Tooltip>
                    );
                  },
                })),
              ]}
            />
          </>
        )}
        {manifest.ok && (
          <Descriptions size="small" column={1} bordered title={`${patient?.caseReportId}: step records`}>
            {Object.entries(manifest.data.steps || {}).map(([id, r]) => (
              <Descriptions.Item key={id} label={id}>
                <Space wrap size={[6, 2]}>
                  <Tag color={STATE_COLOR[r.status === "done" ? "done" : r.status]}>{r.status}</Tag>
                  <Text style={{ fontSize: 13 }}>
                    v{r.version} · {r.finished || r.started}
                    {r.seconds != null ? ` · ${r.seconds} s` : ""}
                  </Text>
                  {r.params && Object.keys(r.params).length > 0 && (
                    <Text type="secondary" style={{ fontSize: 12.5 }}>
                      {Object.entries(r.params)
                        .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join("/") : v}`)
                        .join(" · ")}
                    </Text>
                  )}
                  {r.error && <Text type="danger">{r.error}</Text>}
                </Space>
              </Descriptions.Item>
            ))}
          </Descriptions>
        )}
      </Space>
    </Card>
  );
}
