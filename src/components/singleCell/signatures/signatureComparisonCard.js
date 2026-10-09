import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Button, Card, Col, Empty, Progress, Row, Segmented, Space, Typography } from "antd";
import { SwapOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import { ActivityBars, AetiologyLegend, loadCosmic } from "../signaturePanel";
import { fitSignatures, nnls } from "../../../helpers/singleCell/signatures";
import { profileSimilarity, setProfile, signatureSiteSets } from "../../../helpers/singleCell/signatureSets";
import HintLine, { Provenance } from "../hintLine";
import { SC_GUTTER } from "../density";
import usePlotTheme from "../usePlotTheme";
import { inkOn } from "../../../helpers/singleCell/plotTheme";

const { Text } = Typography;
const pct = d3.format(".0%");

/**
 * Every site set side by side: backend fits where they exist, browser fits
 * (NNLS on the patient's signatures) for the rest, as fractions or counts,
 * plus the cosine similarity between the sets' SBS96 profiles.
 */
export default function SignatureComparisonCard() {
  const pt = usePlotTheme();
  const { t } = useTranslation("common");
  const { snv, signatures, cells, selectedCellIds, layout } = useSelector((state) => state.SingleCell);
  const [ref, width] = useContainerWidth(900);
  const snvData = snv.status === "ok" ? snv.data : null;
  const sets = useMemo(() => signatureSiteSets(snvData, { cells, selectedCellIds, layout }), [snvData, cells, selectedCellIds, layout]);
  const profiles = useMemo(() => (snvData ? sets.map((s) => ({ key: s.key, name: s.name, ...setProfile(snvData, s.columns) })) : []), [snvData, sets]);
  const backend = useMemo(() => (signatures.status === "ok" ? signatures.data.sets || [] : []), [signatures]);
  const [mode, setMode] = useState("fraction");
  const [fits, setFits] = useState({});
  const [progress, setProgress] = useState(null);
  const setsKey = sets.map((s) => `${s.key}:${s.columns.length}`).join("|");

  // fit the sets the backend doesn't cover, one at a time
  const runFits = async () => {
    const reference = await loadCosmic();
    const known = new Set(backend.flatMap((s) => (s.activities || []).map((a) => a.signature)));
    const subset = reference.names.map((n, j) => [n, j]).filter(([n]) => known.has(n));
    const out = {};
    setProgress(0);
    for (let i = 0; i < profiles.length; i += 1) {
      const p = profiles[i];
      if (p.used >= 10) {
        if (subset.length >= 2) {
          const x = nnls(subset.map(([, j]) => reference.columns[j]), p.counts);
          out[p.key] = subset.map(([n], k) => ({ signature: n, activity: x[k] })).filter((a) => a.activity > 0);
        } else {
          out[p.key] = fitSignatures(p.counts, reference).activities;
        }
      }
      setProgress(Math.round((100 * (i + 1)) / profiles.length));
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    setFits(out);
    setProgress(null);
  };
  useEffect(() => setFits({}), [setsKey]);

  const rows = useMemo(
    () =>
      profiles
        .map((p) => {
          const b = backend.find((s) => s.name === p.name);
          const activities = b?.activities?.length ? b.activities.map((a) => ({ signature: a.signature, activity: Number(a.activity) || 0 })) : fits[p.key];
          if (!activities?.length) return null;
          const total = activities.reduce((s, a) => s + a.activity, 0) || 1;
          return { name: `${p.name}${b ? "" : " *"}`, n: p.used, activities: mode === "fraction" ? activities.map((a) => ({ ...a, activity: (100 * a.activity) / total })) : activities };
        })
        .filter(Boolean),
    [profiles, backend, fits, mode]
  );
  const sim = useMemo(() => profileSimilarity(profiles.filter((p) => p.used >= 10)), [profiles]);
  if (!snvData || !sets.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.signatures.no-contexts")} />;
  const color = d3.scaleSequential(pt.mode === "dark" ? d3.interpolateRgb(pt.panelAlt, "#69b1ff") : d3.interpolateBlues).domain([0.5, 1]);
  const missing = profiles.filter((p) => p.used >= 10 && !backend.find((s) => s.name === p.name) && !fits[p.key]).length;

  return (
    <Card
      size="small"
      title={<Space><SwapOutlined />{t("components.single-cell.signatures.compare-title")}<Provenance id="signatureCompare" /></Space>}
      extra={
        <Space>
          {missing > 0 && (
            <Button size="small" onClick={runFits} loading={progress != null}>
              {t("components.single-cell.signatures.fit-missing", { count: missing })}
            </Button>
          )}
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
        <Row gutter={SC_GUTTER}>
          <Col xs={24} xl={14}>
            {progress != null && <Progress percent={progress} size="small" />}
            {rows.length ? (
              <>
                <ActivityBars rows={rows} width={Math.max(320, (width >= 1200 ? (width * 14) / 24 : width) - 24)} />
                <AetiologyLegend rows={rows} />
                <HintLine text={t("components.single-cell.signatures.compare-help")} />
              </>
            ) : (
              <Text type="secondary">{t("components.single-cell.signatures.compare-empty")}</Text>
            )}
          </Col>
          <Col xs={24} xl={10}>
            <Text strong>{t("components.single-cell.signatures.similarity-title")}</Text>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", fontSize: 12.5, marginTop: 6 }}>
                <thead>
                  <tr>
                    <th />
                    {sim.keys.map((k) => (
                      <th key={k} style={{ padding: "2px 4px", writingMode: "vertical-rl", transform: "rotate(180deg)", fontWeight: 500, textAlign: "left" }}>
                        {profiles.find((p) => p.key === k)?.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sim.keys.map((k, i) => (
                    <tr key={k}>
                      <td style={{ padding: "2px 6px", whiteSpace: "nowrap" }}>{profiles.find((p) => p.key === k)?.name}</td>
                      {sim.keys.map((k2, j) => (
                        <td key={k2} style={{ width: 34, height: 24, textAlign: "center", background: color(sim.matrix[i][j]), color: inkOn(color(sim.matrix[i][j])) }} title={`${profiles.find((p) => p.key === k)?.name} vs ${profiles.find((p) => p.key === k2)?.name}: cosine ${sim.matrix[i][j].toFixed(3)}`}>
                          {i === j ? "" : pct(sim.matrix[i][j])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <HintLine text={t("components.single-cell.signatures.similarity-help")} />
          </Col>
        </Row>
      </div>
    </Card>
  );
}
