import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import axios from "axios";
import * as d3 from "d3";
import { Alert, Button, Card, Col, Empty, Radio, Row, Space, Tooltip, Typography } from "antd";
import { BarChartOutlined } from "@ant-design/icons";
import { SBS96, SBS_COLORS, fitSignatures, parseCosmic, sbs96Counts } from "../../helpers/singleCell/signatures";
import { filterSnvColumns, sitesSeenInRows } from "../../helpers/singleCell/snvSites";
import { rowMap } from "../../helpers/singleCell/matrix";
import useContainerWidth from "./useContainerWidth";

const { Text } = Typography;
const COSMIC_FILE = "COSMIC_v3.4_SBS_GRCh38.txt";
const BAR_HEIGHT = 18;
const PROFILE_HEIGHT = 110;

let cosmicPromise = null;
/** COSMIC v3.4 SBS GRCh38 reference from the app's public folder (fetched once). */
function loadCosmic() {
  if (!cosmicPromise) {
    const base = window.location.href.split("?")[0].replace(/\/[^/]*$/, "");
    cosmicPromise = axios
      .get(`${base}/${COSMIC_FILE}`, { responseType: "text" })
      .then((r) => parseCosmic(r.data));
    cosmicPromise.catch(() => {
      cosmicPromise = null;
    });
  }
  return cosmicPromise;
}

const signatureColor = d3.scaleOrdinal([...d3.schemeTableau10, ...d3.schemeSet3, ...d3.schemePastel1]);

/** One stacked bar per set: each signature's share of the set's mutations. */
function ActivityBars({ rows, width }) {
  const labelWidth = 150;
  const barWidth = Math.max(80, width - labelWidth - 70);
  return (
    <svg width={width} height={rows.length * (BAR_HEIGHT + 6) + 4}>
      {rows.map((row, i) => {
        const total = row.activities.reduce((s, a) => s + a.activity, 0) || 1;
        let x = labelWidth;
        return (
          <g key={row.name} transform={`translate(0, ${i * (BAR_HEIGHT + 6) + 2})`}>
            <text x={labelWidth - 6} y={BAR_HEIGHT / 2} dy="0.35em" textAnchor="end" fontSize={11}>
              {row.name.length > 22 ? `${row.name.slice(0, 21)}…` : row.name}
            </text>
            {row.activities.map((a) => {
              const w = (a.activity / total) * barWidth;
              const rect = (
                <rect key={a.signature} x={x} y={0} width={Math.max(0, w - 0.5)} height={BAR_HEIGHT} fill={signatureColor(a.signature)}>
                  <title>{`${a.signature}: ${Math.round(a.activity)} mutations (${((100 * a.activity) / total).toFixed(0)}%)`}</title>
                </rect>
              );
              const label =
                w > 34 ? (
                  <text key={`${a.signature}-l`} x={x + w / 2} y={BAR_HEIGHT / 2} dy="0.35em" textAnchor="middle" fontSize={10} fill="#fff" pointerEvents="none">
                    {a.signature}
                  </text>
                ) : null;
              x += w;
              return [rect, label];
            })}
            <text x={labelWidth + barWidth + 6} y={BAR_HEIGHT / 2} dy="0.35em" fontSize={11} fill="#8c8c8c">
              {`n=${row.n}`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** 96-channel profile: observed counts as bars, the fitted reconstruction as dots. */
function Profile({ counts, reconstruction, width }) {
  const max = Math.max(1, ...counts, ...reconstruction);
  const left = 28;
  const w = (width - left - 4) / 96;
  const y = (v) => PROFILE_HEIGHT - 14 - (v / max) * (PROFILE_HEIGHT - 26);
  return (
    <svg width={width} height={PROFILE_HEIGHT}>
      {Object.entries(SBS_COLORS).map(([sub, color], k) => (
        <g key={sub}>
          <rect x={left + k * 16 * w} y={0} width={16 * w - 1} height={8} fill={color} />
          <text x={left + (k + 0.5) * 16 * w} y={PROFILE_HEIGHT - 2} textAnchor="middle" fontSize={10}>
            {sub}
          </text>
        </g>
      ))}
      <text x={left - 4} y={y(max)} dy="0.35em" textAnchor="end" fontSize={9} fill="#8c8c8c">
        {Math.round(max)}
      </text>
      {SBS96.map((ch, i) => (
        <g key={ch}>
          <rect
            x={left + i * w}
            y={y(counts[i])}
            width={Math.max(1, w - 1)}
            height={PROFILE_HEIGHT - 14 - y(counts[i])}
            fill={SBS_COLORS[ch.slice(2, 5)]}
          >
            <title>{`${ch}: ${counts[i]} observed, ${reconstruction[i].toFixed(1)} fitted`}</title>
          </rect>
          <circle cx={left + (i + 0.5) * w} cy={y(reconstruction[i])} r={1.6} fill="#262626" />
        </g>
      ))}
    </svg>
  );
}

/**
 * SBS signatures of the patient's SNVs: SigProfilerAssignment fits of preset
 * sets computed in the backend (signatures.json), and a quick fit in the
 * browser (NNLS on COSMIC v3.4 GRCh38) of the sites shown in the SNV heatmap
 * or the sites with alt reads in the selected cells.
 */
export default function SignaturePanel() {
  const { t } = useTranslation("common");
  const { snv, signatures, selectedCellIds, layout } = useSelector((state) => state.SingleCell);
  const [containerRef, width] = useContainerWidth(700);
  const [source, setSource] = useState("filtered");
  const [fit, setFit] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const snvData = snv.status === "ok" ? snv.data : null;
  const hasContexts = useMemo(() => Boolean(snvData?.variants.some((v) => v.context)), [snvData]);
  const backendSets = signatures.status === "ok" ? signatures.data.sets.filter((s) => s.activities?.length) : [];

  // The sites a browser fit would use, and how many have a trinucleotide context.
  const chosen = useMemo(() => {
    if (!snvData) return [];
    const all = snvData.variants.map((_, c) => c);
    if (source === "selected") {
      const rows = rowMap(selectedCellIds, snvData.cells).filter((p) => p >= 0);
      const seen = sitesSeenInRows(snvData, rows);
      return filterSnvColumns(snvData, all, layout).filter((c) => seen.has(c));
    }
    return filterSnvColumns(snvData, all, layout);
  }, [snvData, source, selectedCellIds, layout]);
  const contexts = useMemo(() => chosen.map((c) => snvData.variants[c].context).filter(Boolean), [chosen, snvData]);
  useEffect(() => setFit(null), [chosen]);

  const runFit = async () => {
    setBusy(true);
    setError(null);
    try {
      const reference = await loadCosmic();
      const { counts, used } = sbs96Counts(contexts);
      // let the button repaint before the (sub-second) fit
      await new Promise((resolve) => setTimeout(resolve, 20));
      const result = fitSignatures(counts, reference);
      setFit({ ...result, counts, used });
    } catch (e) {
      setError(e.message || `${e}`);
    }
    setBusy(false);
  };

  if (!snvData || (!backendSets.length && !hasContexts)) return null;
  const filterNote = [
    layout.snvCategories?.length ? layout.snvCategories.map((k) => t(`components.single-cell.snv.category-${k}`)).join(", ") : null,
    layout.snvCellphyOnly ? t("components.single-cell.snv.cellphy-only") : null,
    layout.snvDriversOnly ? t("components.single-cell.snv.drivers-only", { count: "" }).replace(" ()", "") : null,
  ].filter(Boolean);

  return (
    <Card
      size="small"
      title={
        <Space>
          <BarChartOutlined />
          {t("components.single-cell.signatures.title")}
          <Text type="secondary">
            {signatures.status === "ok"
              ? t("components.single-cell.signatures.reference", { version: signatures.data.cosmic_version, genome: signatures.data.genome })
              : ""}
          </Text>
        </Space>
      }
    >
      <div ref={containerRef}>
        <Row gutter={[24, 12]}>
          <Col xs={24} xl={12}>
            <Text strong>{t("components.single-cell.signatures.backend")}</Text>
            <div>
              <Text type="secondary">{t("components.single-cell.signatures.backend-help")}</Text>
            </div>
            {backendSets.length ? (
              <ActivityBars rows={backendSets} width={Math.max(300, (width >= 1200 ? width / 2 : width) - 24)} />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.signatures.no-backend")} />
            )}
          </Col>
          <Col xs={24} xl={12}>
            <Text strong>{t("components.single-cell.signatures.browser")}</Text>
            <div style={{ margin: "4px 0 8px" }}>
              <Space wrap>
                <Radio.Group size="small" value={source} onChange={(e) => setSource(e.target.value)}>
                  <Radio.Button value="filtered">{t("components.single-cell.signatures.src-filtered")}</Radio.Button>
                  <Tooltip title={selectedCellIds.length ? null : t("components.single-cell.signatures.need-selection")}>
                    <Radio.Button value="selected" disabled={!selectedCellIds.length}>
                      {t("components.single-cell.signatures.src-selected", { count: selectedCellIds.length })}
                    </Radio.Button>
                  </Tooltip>
                </Radio.Group>
                <Button size="small" type="primary" loading={busy} disabled={!hasContexts || contexts.length < 10} onClick={runFit}>
                  {t("components.single-cell.signatures.fit", { count: contexts.length })}
                </Button>
              </Space>
              <div>
                <Text type="secondary">
                  {filterNote.length
                    ? t("components.single-cell.signatures.filter-note", { filter: filterNote.join(" · ") })
                    : t("components.single-cell.signatures.no-filter-note")}
                </Text>
              </div>
            </div>
            {!hasContexts && <Alert type="info" showIcon message={t("components.single-cell.signatures.no-contexts")} />}
            {error && <Alert type="warning" showIcon message={error} />}
            {fit && (
              <>
                <Text type="secondary">
                  {t("components.single-cell.signatures.fit-summary", { n: fit.used, cosine: fit.cosine.toFixed(3) })}
                </Text>
                <ActivityBars
                  rows={[{ name: t("components.single-cell.signatures.this-fit"), n: fit.used, activities: fit.activities }]}
                  width={Math.max(300, (width >= 1200 ? width / 2 : width) - 24)}
                />
                <Profile counts={fit.counts} reconstruction={fit.reconstruction} width={Math.max(300, (width >= 1200 ? width / 2 : width) - 24)} />
              </>
            )}
          </Col>
        </Row>
      </div>
    </Card>
  );
}
