import React, { useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Card, Empty, Segmented, Select, Space, Typography } from "antd";
import { BarChartOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import { ActivityBars, AetiologyLegend, setSignatureTheme } from "../signaturePanel";

const { Text } = Typography;

/** Backend SBS signature fits (signatures.json) of every patient, one bar per patient, for a chosen site set. */
export default function CohortSignaturesPanel({ summaries, files }) {
  const { t } = useTranslation("common");
  const [ref, width] = useContainerWidth(800);
  const theme = useSelector((state) => state.SingleCell.layout.theme);
  setSignatureTheme(theme);
  const [set, setSet] = useState("all");
  const [mode, setMode] = useState("fraction");
  const setNames = useMemo(() => {
    const names = new Set();
    summaries.forEach((s) => (files[s.caseReportId]?.signatures?.sets || []).forEach((x) => names.add(x.name)));
    const base = ["all", "truncal", "subclonal", "private"].filter((n) => names.has(n));
    return [...base, ...[...names].filter((n) => !base.includes(n)).sort()];
  }, [summaries, files]);
  const rows = useMemo(
    () =>
      summaries
        .map((s) => {
          const entry = (files[s.caseReportId]?.signatures?.sets || []).find((x) => x.name === set);
          if (!entry) return null;
          const activities = (entry.activities || []).map((a) => ({ signature: a.signature, activity: Number(a.activity) || 0 }));
          const total = activities.reduce((acc, a) => acc + a.activity, 0) || 1;
          return {
            name: s.caseReportId,
            n: entry.n,
            activities: mode === "fraction" ? activities.map((a) => ({ ...a, activity: (100 * a.activity) / total })) : activities,
          };
        })
        .filter(Boolean),
    [summaries, files, set, mode]
  );
  if (!setNames.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.cohort.signatures-empty")} />;
  return (
    <Card
      size="small"
      title={<Space><BarChartOutlined />{t("components.single-cell.cohort.signatures-title")}</Space>}
      extra={
        <Space>
          <Text type="secondary">{t("components.single-cell.cohort.signatures-set")}</Text>
          <Select size="small" style={{ width: 170 }} value={set} onChange={setSet} options={setNames.map((n) => ({ value: n, label: n }))} />
          <Segmented
            size="small"
            value={mode}
            onChange={setMode}
            options={[
              { value: "fraction", label: t("components.segmented-filter.fraction") },
              { value: "count", label: t("components.segmented-filter.count") },
            ]}
          />
        </Space>
      }
    >
      <div ref={ref}>
        <ActivityBars rows={rows} width={Math.max(400, width - 16)} />
        <AetiologyLegend rows={rows} />
        <Text type="secondary" style={{ fontSize: 12 }}>{t("components.single-cell.cohort.signatures-help")}</Text>
      </div>
    </Card>
  );
}
