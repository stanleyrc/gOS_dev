import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Card, Col, Row, Space, Statistic, Table, Tag, Tooltip, Typography } from "antd";
import { DotChartOutlined } from "@ant-design/icons";
import { Provenance } from "./hintLine";
import usePatientTmb from "./usePatientTmb";
import { fmtTmb, patientTmbRows } from "../../helpers/singleCell/tmb";
import { SC_GUTTER_INNER } from "./density";

const { Text } = Typography;

/**
 * Patient Summary card: truncal / subclonal / private tumour mutational burden per callable Mb
 * (raw and dropout-corrected) from data/<patient>/tmb.json (srctools gos_sc_tmb.R).
 */
export default function TmbCard() {
  const { t } = useTranslation("common");
  const { status, data } = usePatientTmb();
  const rows = useMemo(() => patientTmbRows(data), [data]);
  if (status !== "ok" || !rows.length) return null;
  const s = data.patient_summary;
  const columns = [
    { title: t("components.single-cell.tmb.class"), dataIndex: "key", render: (k) => t(`components.single-cell.snv.category-${k}`) },
    { title: t("components.single-cell.tmb.sites"), dataIndex: "nSites", align: "right", render: (v) => (v == null ? "n/a" : v.toLocaleString()) },
    { title: t("components.single-cell.tmb.callable"), dataIndex: "callableMb", align: "right", render: (v, r) => (v == null ? (r.lowerBound ? t("components.single-cell.tmb.per-cell") : "n/a") : `${Math.round(v).toLocaleString()} Mb`) },
    { title: t("components.single-cell.tmb.raw"), dataIndex: "raw", align: "right", render: (v) => fmtTmb(v) },
    {
      title: t("components.single-cell.tmb.corrected"),
      dataIndex: "corrected",
      align: "right",
      render: (v, r) => (
        <Tooltip title={r.lowerBound ? t("components.single-cell.tmb.private-bound") : undefined}>
          <b>{fmtTmb(v)}</b>
          {r.lowerBound ? " (lower bound)" : ""}
        </Tooltip>
      ),
    },
  ];
  return (
    <Card size="small" style={{ marginBottom: 16 }} title={<Space><DotChartOutlined />{t("components.single-cell.tmb.title")}<Provenance id="tmbCalls" /></Space>} extra={<Text type="secondary">{t("components.single-cell.tmb.unit")}</Text>}>
      {data.noisy && <Alert type="warning" showIcon style={{ marginBottom: 8 }} message={(data.caveats || [])[0] || t("components.single-cell.tmb.noisy")} />}
      <Row gutter={SC_GUTTER_INNER}>
        <Col xs={24} lg={8}>
          <Space size="large" wrap>
            <Statistic title={t("components.single-cell.tmb.cell-median")} value={fmtTmb(s?.cell_tmb_corrected?.median)} suffix="/Mb" />
            <Statistic title={t("components.single-cell.tmb.cell-range")} value={`${fmtTmb(s?.cell_tmb_corrected?.min)}–${fmtTmb(s?.cell_tmb_corrected?.max)}`} valueStyle={{ fontSize: 16 }} />
            <Statistic title={t("components.single-cell.tmb.sensitivity")} value={s?.median_sensitivity == null ? "n/a" : `${Math.round(s.median_sensitivity * 100)}%`} valueStyle={{ fontSize: 16 }} />
          </Space>
        </Col>
        <Col xs={24} lg={16}>
          <Table size="small" rowKey="key" pagination={false} dataSource={rows} columns={columns} />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t("components.single-cell.tmb.method", { depth: data.params?.min_depth ?? 4, territory: Math.round(s?.territory_mb ?? 0).toLocaleString() })}
          </Text>
          <div>{(data.caveats || []).slice(data.noisy ? 1 : 0).map((c) => <Tag key={c} style={{ whiteSpace: "normal", marginTop: 4 }}>{c}</Tag>)}</div>
        </Col>
      </Row>
    </Card>
  );
}
