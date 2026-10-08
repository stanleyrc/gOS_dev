import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import axios from "axios";
import * as d3 from "d3";
import { Alert, Button, Card, Col, Empty, Radio, Row, Space, Tooltip, Typography } from "antd";
import { BarChartOutlined } from "@ant-design/icons";
import { SBS96, SBS_COLORS, decomposeFit, fitSignatures, parseCosmic, sbs96Counts } from "../../helpers/singleCell/signatures";
import BarPlotPanel from "../barPlotPanel";
import { themePalette } from "../../helpers/singleCell/themes";
import { mutationFilterTypes, mutationsColorPalette, mutationsGroups, nucleotideMutationText } from "../../helpers/utility";
import { filterSnvColumns, sitesSeenInRows } from "../../helpers/singleCell/snvSites";
import { rowMap } from "../../helpers/singleCell/matrix";
import useContainerWidth from "./useContainerWidth";
import signatureMetadata from "../../translations/en/signatures.json";

const { Text } = Typography;
const COSMIC_FILE = "COSMIC_v3.4_SBS_GRCh38.txt";
const BAR_HEIGHT = 18;
const PROFILE_HEIGHT = 110;

let cosmicPromise = null;
/** COSMIC v3.4 SBS GRCh38 reference from the app's public folder (fetched once). */
export function loadCosmic() {
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

/** COSMIC aetiology of a signature, as plain text and as the bulk views' HTML (with the COSMIC link). */
const aetiologyHtml = (sig) => signatureMetadata.metadata[sig]?.full || null;
const aetiologyText = (sig) => (aetiologyHtml(sig) || "").replace(/<[^>]+>/g, "").replace(/^\S+\s*-\s*/, "") || "";

/** Every signature in the given fits, with its aetiology (as in the bulk Signatures tab). */
export function AetiologyLegend({ rows }) {
  const sigs = [...new Set(rows.flatMap((r) => r.activities.map((a) => a.signature)))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );
  if (!sigs.length) return null;
  return (
    <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "14px 1fr", columnGap: 6, rowGap: 2, fontSize: 12 }}>
      {sigs.map((sig) => (
        <React.Fragment key={sig}>
          <span style={{ width: 12, height: 12, marginTop: 3, background: signatureColor(sig), display: "inline-block", borderRadius: 2 }} />
          {aetiologyHtml(sig) ? (
            // eslint-disable-next-line react/no-danger
            <span dangerouslySetInnerHTML={{ __html: aetiologyHtml(sig) }} />
          ) : (
            <span>{sig}</span>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// COSMIC signature colours: the theme first, then d3 schemes for long tails
let signatureColor = d3.scaleOrdinal([...d3.schemeTableau10, ...d3.schemeSet3, ...d3.schemePastel1]);
export const signatureColorOf = (sig) => signatureColor(sig);
export const setSignatureTheme = (theme) => {
  signatureColor = d3.scaleOrdinal([...themePalette(theme), ...d3.schemeSet3, ...d3.schemePastel1]);
};

/** One stacked bar per set: each signature's share of the set's mutations. */
export function ActivityBars({ rows, width }) {
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
                  <title>{`${a.signature}: ${Math.round(a.activity)} mutations (${((100 * a.activity) / total).toFixed(0)}%)${aetiologyText(a.signature) ? `\n${aetiologyText(a.signature)}` : ""}`}</title>
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
export function Profile({ counts, reconstruction, width }) {
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

/** SBS96 values as the bulk tab's catalog points (BarPlotPanel). */
const catalogPoints = (values, tag) =>
  SBS96.map((ch, i) => ({
    id: `${tag}-${i}`,
    type: ch,
    mutations: Math.round(values[i] * 10) / 10,
    mutationType: ch.slice(2, 5),
    variantType: "sbs",
    label: nucleotideMutationText(ch),
    group: mutationsGroups()[ch.slice(2, 5)],
  }));

/**
 * Bulk-style mutation catalog of the fitted sites (fitted profile overlaid),
 * or one decomposed catalog per signature against its COSMIC profile.
 */
export function FitCatalogs({ fit }) {
  const { t } = useTranslation("common");
  const [mode, setMode] = useState("catalog");
  const legend = mutationFilterTypes().sbs.map((key) => ({
    id: key,
    group: mutationsGroups()[key],
    color: mutationsColorPalette()[key],
    title: t(`metadata.mutation-catalog-titles.${key}`),
    header: t(`metadata.mutation-catalog-headers.${mutationsGroups()[key]}`),
    subtitle: t(`metadata.mutation-catalog-subtitles.${mutationsGroups()[key]}`),
  }));
  const common = {
    loading: false,
    legend,
    xTitle: "",
    xVariable: "type",
    xFormat: null,
    yTitle: t("components.mutation-catalog-panel.y-title"),
    yVariable: "mutations",
    yFormat: "~s",
    colorVariable: "mutationType",
    xAxisRotation: -90,
    segmentedOptions: [
      { label: t("components.single-cell.signatures.catalog"), value: "catalog" },
      { label: t("components.segmented-filter.decomposed-mode"), value: "decomposed" },
    ],
    segmentedValue: mode,
    handleSegmentedChange: setMode,
  };
  return (
    <Space direction="vertical" size="middle" style={{ display: "flex" }}>
      {mode === "catalog" ? (
        <BarPlotPanel
          {...common}
          title={t("components.single-cell.signatures.catalog-title", { n: fit.used })}
          dataPoints={catalogPoints(fit.counts, "obs")}
          referenceDataPoints={catalogPoints(fit.reconstruction, "fit")}
        />
      ) : (
        fit.decomposition.map((d) => (
          <BarPlotPanel
            key={d.signature}
            {...common}
            title={`${d.signature} · ${aetiologyText(d.signature) || ""} · ${Math.round(d.activity)} mutations · cosine ${d3.format(".0%")(d.cosine)}`}
            dataPoints={catalogPoints(d.decomposed, `${d.signature}-dec`)}
            referenceDataPoints={catalogPoints(d.expected, `${d.signature}-ref`)}
          />
        ))
      )}
      <Text type="secondary">{t("components.single-cell.signatures.catalog-help")}</Text>
    </Space>
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
      setFit({ ...result, counts, used, decomposition: decomposeFit(counts, reference, result.activities) });
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
              <>
                <ActivityBars rows={backendSets} width={Math.max(300, (width >= 1200 ? width / 2 : width) - 24)} />
                <AetiologyLegend rows={backendSets} />
              </>
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
                <AetiologyLegend rows={[{ activities: fit.activities }]} />
                <Profile counts={fit.counts} reconstruction={fit.reconstruction} width={Math.max(300, (width >= 1200 ? width / 2 : width) - 24)} />
              </>
            )}
          </Col>
          {fit && fit.used > 0 && (
            <Col span={24}>
              <FitCatalogs fit={fit} />
            </Col>
          )}
        </Row>
      </div>
    </Card>
  );
}
