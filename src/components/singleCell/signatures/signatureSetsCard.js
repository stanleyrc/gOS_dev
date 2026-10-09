import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Alert, Button, Card, Col, Empty, Row, Segmented, Select, Space, Table, Typography } from "antd";
import { BarChartOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import { ActivityBars, AetiologyLegend, FitCatalogs, Profile, loadCosmic } from "../signaturePanel";
import { bootstrapShares, decomposeFit, fitSignatures } from "../../../helpers/singleCell/signatures";
import { setProfile, signatureSiteSets } from "../../../helpers/singleCell/signatureSets";
import { SC_GUTTER } from "../density";

const { Text } = Typography;
const pct = d3.format(".0%");

/**
 * One site set at a time (tree position, clone, selection, heatmap filter):
 * its SBS96 catalog, the backend SigProfiler fit when the set has one, a
 * browser fit with bootstrap intervals, and the decomposed catalogs.
 */
export default function SignatureSetsCard() {
  const { t } = useTranslation("common");
  const { snv, signatures, cells, selectedCellIds, layout } = useSelector((state) => state.SingleCell);
  const [ref, width] = useContainerWidth(900);
  const snvData = snv.status === "ok" ? snv.data : null;
  const sets = useMemo(() => signatureSiteSets(snvData, { cells, selectedCellIds, layout }), [snvData, cells, selectedCellIds, layout]);
  const [key, setKey] = useState("all");
  const set = sets.find((s) => s.key === key) || sets[0];
  const profile = useMemo(() => (snvData && set ? setProfile(snvData, set.columns) : null), [snvData, set]);
  const backend = signatures.status === "ok" ? (signatures.data.sets || []).find((s) => s.name === set?.name) : null;
  const [fit, setFit] = useState(null);
  const [ci, setCi] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [view, setView] = useState("fit");
  useEffect(() => {
    setFit(null);
    setCi(null);
  }, [set?.key, profile]);

  const runFit = async () => {
    if (!profile) return;
    setBusy(true);
    setError(null);
    try {
      const reference = await loadCosmic();
      await new Promise((resolve) => setTimeout(resolve, 20));
      const result = fitSignatures(profile.counts, reference);
      setFit({ ...result, counts: profile.counts, used: profile.used, decomposition: decomposeFit(profile.counts, reference, result.activities) });
      setBusy(false);
      // intervals after the plot is up
      setTimeout(() => {
        setCi(bootstrapShares(profile.contexts, reference, result.activities.map((a) => a.signature), 100));
      }, 30);
    } catch (e) {
      setError(e.message || `${e}`);
      setBusy(false);
    }
  };

  if (!snvData || !sets.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.signatures.no-contexts")} />;
  const plotWidth = Math.max(320, width - 24);
  const backendRow = backend?.activities?.length ? [{ name: `${t("components.single-cell.signatures.backend-short")} · ${set.name}`, n: backend.n, activities: backend.activities.map((a) => ({ signature: a.signature, activity: Number(a.activity) || 0 })) }] : [];
  const fitRow = fit ? [{ name: `${t("components.single-cell.signatures.browser-short")} · ${set.name}`, n: fit.used, activities: fit.activities }] : [];
  const total = fit ? fit.activities.reduce((s, a) => s + a.activity, 0) || 1 : 1;

  return (
    <Card
      size="small"
      title={<Space><BarChartOutlined />{t("components.single-cell.signatures.sets-title")}</Space>}
      extra={
        <Space wrap>
          <Text type="secondary">{t("components.single-cell.signatures.set")}</Text>
          <Select
            size="small"
            style={{ width: 240 }}
            value={set.key}
            onChange={setKey}
            options={sets.map((s) => ({ value: s.key, label: `${s.name} (${s.columns.length})` }))}
          />
          <Button size="small" type="primary" loading={busy} disabled={!profile || profile.used < 10} onClick={runFit}>
            {t("components.single-cell.signatures.fit", { count: profile?.used ?? 0 })}
          </Button>
          <Segmented
            size="small"
            value={view}
            onChange={setView}
            options={[
              { value: "fit", label: t("components.single-cell.signatures.view-fit") },
              { value: "catalog", label: t("components.single-cell.signatures.view-catalog") },
            ]}
          />
        </Space>
      }
    >
      <div ref={ref}>
        {error && <Alert type="warning" showIcon message={error} />}
        {view === "catalog" && profile && (
          <Profile counts={profile.counts} reconstruction={fit ? fit.reconstruction : new Float64Array(96)} width={plotWidth} />
        )}
        {view === "fit" && (
          <Row gutter={SC_GUTTER}>
            <Col span={24}>
              {backendRow.length + fitRow.length ? (
                <>
                  <ActivityBars rows={[...backendRow, ...fitRow]} width={plotWidth} />
                  <AetiologyLegend rows={[...backendRow, ...fitRow]} />
                </>
              ) : (
                <Text type="secondary">{t("components.single-cell.signatures.sets-help")}</Text>
              )}
            </Col>
            {fit && (
              <Col span={24}>
                <Text type="secondary">
                  {t("components.single-cell.signatures.fit-summary", { n: fit.used, cosine: fit.cosine.toFixed(3) })}
                  {ci ? ` · ${t("components.single-cell.signatures.ci-note")}` : ` · ${t("components.single-cell.signatures.ci-pending")}`}
                </Text>
                <Table
                  size="small"
                  rowKey="signature"
                  pagination={false}
                  style={{ maxWidth: 560 }}
                  dataSource={fit.activities}
                  columns={[
                    { title: t("components.single-cell.signatures.signature"), dataIndex: "signature", width: 90 },
                    { title: t("components.single-cell.signatures.mutations"), dataIndex: "activity", width: 100, render: (v) => Math.round(v) },
                    { title: t("components.single-cell.signatures.share"), dataIndex: "activity", key: "share", width: 90, render: (v) => pct(v / total) },
                    {
                      title: "95% CI",
                      key: "ci",
                      render: (_, a) => (ci?.[a.signature] ? `${pct(ci[a.signature].lo)} – ${pct(ci[a.signature].hi)}` : "…"),
                    },
                    {
                      title: t("components.single-cell.signatures.backend-short"),
                      key: "backend",
                      render: (_, a) => {
                        const b = backend?.activities?.find((x) => x.signature === a.signature);
                        const bt = backend?.activities?.reduce((s, x) => s + (Number(x.activity) || 0), 0) || 1;
                        return b ? pct((Number(b.activity) || 0) / bt) : "–";
                      },
                    },
                  ]}
                />
              </Col>
            )}
            {fit && fit.used > 0 && (
              <Col span={24}>
                <FitCatalogs fit={fit} />
              </Col>
            )}
          </Row>
        )}
      </div>
    </Card>
  );
}
