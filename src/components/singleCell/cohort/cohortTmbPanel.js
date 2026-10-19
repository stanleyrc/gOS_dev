import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Card, Empty, Segmented, Skeleton, Space, Table, Tag, Typography } from "antd";
import { DotChartOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import useCohortExport from "./useCohortExport";
import { BoxStrips, patientColor } from "./charts";
import HintLine, { Provenance } from "../hintLine";
import { cladeTmbIndex, cohortTmbRows, fmtTmb } from "../../../helpers/singleCell/tmb";

const { Text } = Typography;

/**
 * Cohort TMB view (SNVs & signatures): a box/strip of per-cell tumour mutational burden per patient
 * (dropout-corrected or raw mutations per callable Mb), the truncal / subclonal / private table, and the
 * clade-specific burden of the called clades, linked to the cohort Clades view.
 */
export default function CohortTmbPanel({ dataset, summaries = [], onOpen, onView }) {
  const { t } = useTranslation("common");
  const { status, data } = useCohortExport(dataset, "tmb.json");
  const [ref, width] = useContainerWidth(800);
  const [key, setKey] = useState("tmb_corrected");
  const [log, setLog] = useState(false);
  const rows = useMemo(() => cohortTmbRows(data, key), [data, key]);
  const clades = useMemo(() => [...cladeTmbIndex(data).values()].filter((c) => !c.is_trunk).sort((a, b) => (b.tmb_corrected ?? -1) - (a.tmb_corrected ?? -1)), [data]);
  if (status === "loading") return <Skeleton active />;
  if (!rows.length) return <Card size="small"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.tmb.empty")} /></Card>;
  const patients = rows.map((r) => r.patient);
  const groups = rows.map((r) => ({
    key: r.patient,
    label: r.noisy ? `${r.patient} (${t("components.single-cell.tmb.noisy-tag")})` : r.patient,
    color: patientColor(patients.indexOf(r.patient)),
    values: r.values,
    ids: r.cells.filter((c) => Number.isFinite(c[key])).map((c) => c.cell_id),
  }));
  const open = (p) => {
    const s = summaries.find((x) => `${x.caseReportId}` === `${p}`);
    if (s && onOpen) onOpen(s);
  };
  const cls = (r, k) => r.summary?.[k] || {};
  const columns = [
    { title: "Patient", dataIndex: "patient", render: (p, r) => <a onClick={() => open(p)}>{p}{r.noisy ? <Tag color="orange" style={{ marginLeft: 6 }}>{t("components.single-cell.tmb.noisy-tag")}</Tag> : null}</a> },
    { title: "Cells", dataIndex: "values", align: "right", render: (v) => v.length },
    { title: "Median cell", align: "right", render: (_, r) => fmtTmb(r.box.median), sorter: (a, b) => a.box.median - b.box.median },
    { title: "Truncal raw / corr.", align: "right", render: (_, r) => `${fmtTmb(cls(r, "truncal").tmb_raw)} / ${fmtTmb(cls(r, "truncal").tmb_corrected)}` },
    { title: "Subclonal raw / corr.", align: "right", render: (_, r) => `${fmtTmb(cls(r, "subclonal").tmb_raw)} / ${fmtTmb(cls(r, "subclonal").tmb_corrected)}` },
    { title: "Private raw / corr. (lower bound)", align: "right", render: (_, r) => `${fmtTmb(cls(r, "private").tmb_raw)} / ${fmtTmb(cls(r, "private").tmb_corrected)}` },
    { title: "Sensitivity", align: "right", render: (_, r) => (r.summary?.median_sensitivity == null ? "n/a" : `${Math.round(r.summary.median_sensitivity * 100)}%`) },
  ];
  const cladeColumns = [
    { title: "Patient", dataIndex: "patient" },
    { title: "Clade", dataIndex: "id", render: (v) => v.replace(/^.*_/, "") },
    { title: "Cells", dataIndex: "n_cells", align: "right" },
    { title: "Private SNVs", dataIndex: "n_private_snv", align: "right" },
    { title: "Callable Mb", dataIndex: "callable_mb", align: "right", render: (v) => (v == null ? "n/a" : Math.round(v).toLocaleString()) },
    { title: "TMB raw", dataIndex: "tmb_raw", align: "right", render: fmtTmb },
    { title: "TMB corrected", dataIndex: "tmb_corrected", align: "right", render: (v) => <b>{fmtTmb(v)}</b> },
    { title: "Per 1000 sites (old)", dataIndex: "burden_per_1000_sites", align: "right", render: (v) => (v == null ? "n/a" : v.toFixed(1)) },
  ];
  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Card
        size="small"
        title={<Space><DotChartOutlined />{t("components.single-cell.tmb.cohort-title")}<Provenance id="tmbCalls" /></Space>}
        extra={
          <Space>
            <Segmented size="small" value={key} onChange={setKey} options={[{ value: "tmb_corrected", label: "Corrected" }, { value: "tmb_raw", label: "Raw" }]} />
            <Segmented size="small" value={log ? "log" : "lin"} onChange={(v) => setLog(v === "log")} options={[{ value: "lin", label: "Linear" }, { value: "log", label: "Log" }]} />
          </Space>
        }
      >
        {rows.some((r) => r.noisy) && <Alert type="warning" showIcon style={{ marginBottom: 8 }} message={rows.find((r) => r.noisy).caveats[0]} />}
        <div ref={ref}>
          <BoxStrips groups={groups} width={width} height={280} yTitle={t("components.single-cell.tmb.y")} log={log} onPoint={(g) => open(g.key)} metric="TMB" unit="mutations per callable Mb" noun="tumour cells" clickHint="Click to open the patient" />
        </div>
        <Table size="small" rowKey="patient" pagination={false} dataSource={[...rows].reverse()} columns={columns} />
        <HintLine text={t("components.single-cell.tmb.cohort-help")} />
      </Card>
      {clades.length > 0 && (
        <Card
          size="small"
          title={t("components.single-cell.tmb.clade-title")}
          extra={onView ? <Button size="small" onClick={() => onView("clades")}>{t("components.single-cell.tmb.open-clades")}</Button> : null}
        >
          <Table size="small" rowKey="id" dataSource={clades} columns={cladeColumns} pagination={{ pageSize: 10, showSizeChanger: false }} />
          <Text type="secondary" style={{ fontSize: 12 }}>Clade-specific SNVs (clades.json) per Mb of territory callable in at least two clade cells; corrected for the clade's per-cell dropout.</Text>
        </Card>
      )}
    </Space>
  );
}
