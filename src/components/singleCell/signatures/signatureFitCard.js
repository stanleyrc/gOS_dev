import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Alert, Card, Col, Empty, Row, Segmented, Space, Table, Tag, Tooltip, Typography } from "antd";
import { CheckCircleOutlined, ExclamationCircleOutlined, WarningOutlined } from "@ant-design/icons";
import BarPlotPanel from "../../barPlotPanel";
import { SBS96, SBS_COLORS } from "../../../helpers/singleCell/signatures";
import { setProfile, signatureSiteSets } from "../../../helpers/singleCell/signatureSets";
import { evaluateBackendSet, fitClass } from "../../../helpers/singleCell/signatureFit";
import { mutationFilterTypes, mutationsColorPalette, mutationsGroups } from "../../../helpers/utility";
import { TYPE } from "../../../helpers/singleCell/plotTheme";
import { aetiologyText, catalogPoints, loadCosmic, signatureColorOf } from "../signaturePanel";
import useContainerWidth from "../useContainerWidth";
import usePlotTheme from "../usePlotTheme";
import HintLine, { Provenance } from "../hintLine";
import { SC_GUTTER } from "../density";

const { Text } = Typography;
const pct = d3.format(".0%");
const fmt3 = d3.format(".3f");
const CLASS_ICON = { success: <CheckCircleOutlined />, warning: <ExclamationCircleOutlined />, error: <WarningOutlined /> };

/** Cosine similarity as the bulk tab's Tag: colour by fit class, with an icon so it is not colour alone. */
export function CosineTag({ value, prefix = "cosine" }) {
  if (value == null || Number.isNaN(value)) return <Tag bordered={false}>–</Tag>;
  const cls = fitClass(value);
  return (
    <Tag bordered={false} color={cls} icon={CLASS_ICON[cls]}>
      {prefix ? `${prefix} ` : ""}
      <strong>{fmt3(value)}</strong>
    </Tag>
  );
}

/** SigProfiler's fit statistics in one line of tags. */
export function FitStatsLine({ stats, source }) {
  const { t } = useTranslation("common");
  if (!stats) return null;
  return (
    <Space size={4} wrap>
      <CosineTag value={stats.cosine} />
      <Tooltip title={t("components.single-cell.signatures.fit-l1-tip")}>
        <Tag bordered={false}>{`L1 ${d3.format(".1f")(stats.l1Pct)}%`}</Tag>
      </Tooltip>
      <Tooltip title={t("components.single-cell.signatures.fit-l2-tip")}>
        <Tag bordered={false}>{`L2 ${d3.format(".1f")(stats.l2Pct)}%`}</Tag>
      </Tooltip>
      <Tooltip title={t("components.single-cell.signatures.fit-kl-tip")}>
        <Tag bordered={false}>{`KL ${d3.format(".3f")(stats.kl)}`}</Tag>
      </Tooltip>
      <Tooltip title={t("components.single-cell.signatures.fit-r-tip")}>
        <Tag bordered={false}>{`r ${d3.format(".3f")(stats.correlation)}`}</Tag>
      </Tooltip>
      <Text type="secondary" style={{ fontSize: TYPE.tick }}>
        {source === "sigprofiler" ? t("components.single-cell.signatures.fit-stats-sigprofiler") : t("components.single-cell.signatures.fit-stats-browser")}
      </Text>
    </Space>
  );
}

const RESIDUAL_HEIGHT = 210;

/** Observed - fitted per SBS96 channel, bars from a zero line, coloured by substitution. */
export function ResidualPlot({ evaluation, width }) {
  const pt = usePlotTheme();
  const left = 44;
  const right = 8;
  const top = 18;
  const bottom = 30;
  const w = (width - left - right) / 96;
  const values = SBS96.map((_, i) => evaluation.counts[i] - evaluation.reconstruction[i]);
  const max = Math.max(1, ...values.map(Math.abs));
  const y = d3.scaleLinear().domain([-max, max]).range([RESIDUAL_HEIGHT - bottom, top]).nice();
  const ticks = y.ticks(5);
  return (
    <svg width={width} height={RESIDUAL_HEIGHT} role="img" aria-label="SBS96 residuals (observed minus fitted)">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={left} x2={width - right} y1={y(v)} y2={y(v)} stroke={v === 0 ? pt.axis : pt.grid} strokeWidth={v === 0 ? 1 : 0.6} />
          <text x={left - 4} y={y(v)} dy="0.35em" textAnchor="end" fontSize={TYPE.tick} fill={pt.muted}>
            {d3.format("~s")(v)}
          </text>
        </g>
      ))}
      <text transform={`translate(11, ${(top + RESIDUAL_HEIGHT - bottom) / 2}) rotate(-90)`} textAnchor="middle" fontSize={TYPE.tick} fill={pt.textSecondary}>
        observed − fitted
      </text>
      {Object.entries(SBS_COLORS).map(([sub, color], k) => (
        <g key={sub}>
          <rect x={left + k * 16 * w} y={0} width={16 * w - 1} height={8} fill={color} />
          <text x={left + (k + 0.5) * 16 * w} y={RESIDUAL_HEIGHT - 8} textAnchor="middle" fontSize={TYPE.tick} fill={pt.textSecondary}>
            {sub}
          </text>
        </g>
      ))}
      {SBS96.map((ch, i) => {
        const v = values[i];
        const y0 = y(0);
        const y1 = y(v);
        return (
          <g key={ch}>
            <rect
              x={left + i * w + 0.5}
              y={Math.min(y0, y1)}
              width={Math.max(1, w - 1.5)}
              height={Math.max(0.5, Math.abs(y1 - y0))}
              fill={SBS_COLORS[ch.slice(2, 5)]}
              stroke={ch.slice(2, 5) === "T>G" || ch.slice(2, 5) === "T>A" ? pt.axis : "none"}
              strokeWidth={0.4}
            />
            <rect x={left + i * w} y={top} width={w} height={RESIDUAL_HEIGHT - top - bottom} fill="transparent">
              <title>{`${ch}: ${evaluation.counts[i]} observed, ${evaluation.reconstruction[i].toFixed(1)} fitted, residual ${v >= 0 ? "+" : ""}${v.toFixed(1)}`}</title>
            </rect>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Fit evaluation of one fit, as the bulk Signatures tab: the observed SBS96
 * catalog with the reconstruction as the reference outline, the residual per
 * channel, or each signature's decomposed catalog against its COSMIC profile
 * with the cosine between them; plus a per-signature table.
 */
export function FitEvaluation({ evaluation, title }) {
  const { t } = useTranslation("common");
  const [mode, setMode] = useState("catalog");
  const [ref, width] = useContainerWidth(900);
  const legend = mutationFilterTypes().sbs.map((key) => ({
    id: key,
    group: mutationsGroups()[key],
    color: mutationsColorPalette()[key],
    title: t(`metadata.mutation-catalog-titles.${key}`),
    header: t(`metadata.mutation-catalog-headers.${mutationsGroups()[key]}`),
    subtitle: t(`metadata.mutation-catalog-subtitles.${mutationsGroups()[key]}`),
  }));
  const options = [
    { label: t("components.single-cell.signatures.fit-mode-catalog"), value: "catalog" },
    { label: t("components.single-cell.signatures.fit-mode-residual"), value: "residual" },
    { label: t("components.segmented-filter.decomposed-mode"), value: "decomposed", disabled: !evaluation.decomposition.length },
  ];
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
    segmentedOptions: options,
    segmentedValue: mode,
    handleSegmentedChange: setMode,
  };
  const worst = evaluation.residuals.slice(0, 4);
  return (
    <div ref={ref}>
    <Space direction="vertical" size="middle" style={{ display: "flex" }}>
      {mode === "catalog" && (
        <BarPlotPanel
          {...common}
          title={
            <Space size={6}>
              <span>{title || t("components.mutation-catalog-panel.title")}</span>
              <span>{t("general.mutation", { count: Math.round(evaluation.total) }).replace(/<[^>]+>/g, "")}</span>
              <CosineTag value={evaluation.stats.cosine} />
            </Space>
          }
          dataPoints={catalogPoints(evaluation.counts, "obs")}
          referenceDataPoints={catalogPoints(evaluation.reconstruction, "fit")}
        />
      )}
      {mode === "residual" && (
        <Card
          size="small"
          title={
            <Space size={6}>
              <span>{t("components.single-cell.signatures.fit-residual-title")}</span>
              <CosineTag value={evaluation.stats.cosine} />
            </Space>
          }
          extra={<Segmented size="small" options={options} value={mode} onChange={setMode} />}
        >
          <ResidualPlot evaluation={evaluation} width={Math.max(320, width - 26)} />
          <Text type="secondary">
            {t("components.single-cell.signatures.fit-worst", {
              list: worst.map((r) => `${r.channel} ${r.residual >= 0 ? "+" : ""}${r.residual.toFixed(1)} (${r.observed} vs ${r.fitted.toFixed(1)})`).join(" · "),
            })}
          </Text>
        </Card>
      )}
      {mode === "decomposed" &&
        evaluation.decomposition.map((d) => (
          <BarPlotPanel
            key={d.signature}
            {...common}
            title={
              <Space size={6}>
                <span>{d.signature}</span>
                <Text type="secondary">{aetiologyText(d.signature)}</Text>
                <span>{`${Math.round(d.activity)} mutations (${pct(d.share)})`}</span>
                <CosineTag value={d.cosine} />
              </Space>
            }
            dataPoints={catalogPoints(d.decomposed, `${d.signature}-dec`)}
            referenceDataPoints={catalogPoints(d.expected, `${d.signature}-ref`)}
          />
        ))}
      {evaluation.decomposition.length > 0 && (
        <Table
          size="small"
          rowKey="signature"
          pagination={false}
          dataSource={evaluation.decomposition}
          columns={[
            {
              title: t("components.single-cell.signatures.signature"),
              dataIndex: "signature",
              width: 110,
              render: (s) => (
                <Space size={6}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: signatureColorOf(s), display: "inline-block" }} />
                  {s}
                </Space>
              ),
            },
            { title: t("components.single-cell.signatures.aetiology"), dataIndex: "signature", key: "aet", render: (s) => <Text type="secondary">{aetiologyText(s)}</Text> },
            { title: t("components.single-cell.signatures.mutations"), dataIndex: "activity", width: 100, align: "right", render: (v) => Math.round(v) },
            { title: t("components.single-cell.signatures.share"), dataIndex: "share", width: 80, align: "right", render: (v) => pct(v) },
            {
              title: (
                <Tooltip title={t("components.single-cell.signatures.fit-sig-cos-tip")}>
                  {t("components.single-cell.signatures.fit-sig-cos")}
                </Tooltip>
              ),
              dataIndex: "cosine",
              width: 150,
              render: (v) => <CosineTag value={v} prefix="" />,
            },
          ]}
        />
      )}
      <HintLine text={t("components.single-cell.signatures.fit-help")} />
    </Space>
    </div>
  );
}

/**
 * Goodness of fit of every precomputed SigProfilerAssignment fit (as the bulk
 * Signatures tab's cosine tags and observed / decomposed catalogs): one row
 * per site set with SigProfiler's statistics, and the selected set in depth.
 */
export default function SignatureFitCard() {
  const { t } = useTranslation("common");
  const { snv, signatures, cells, selectedCellIds, layout } = useSelector((state) => state.SingleCell);
  const snvData = snv.status === "ok" ? snv.data : null;
  const [reference, setReference] = useState(null);
  const [refError, setRefError] = useState(null);
  useEffect(() => {
    let active = true;
    loadCosmic()
      .then((r) => active && setReference(r))
      .catch((e) => active && setRefError(e.message || `${e}`));
    return () => {
      active = false;
    };
  }, []);
  const backend = useMemo(() => (signatures.status === "ok" ? (signatures.data.sets || []).filter((s) => s.activities?.length) : []), [signatures]);
  const channels = signatures.status === "ok" ? signatures.data.channels : null;
  // browser profiles of the same site sets, for signatures.json without exported catalogs
  const siteSets = useMemo(() => signatureSiteSets(snvData, { cells, selectedCellIds, layout }), [snvData, cells, selectedCellIds, layout]);
  const evaluations = useMemo(
    () =>
      backend
        .map((set) => {
          const site = siteSets.find((s) => s.name === set.name);
          const profileCounts = !Array.isArray(set.counts) && site && snvData ? setProfile(snvData, site.columns).counts : null;
          return evaluateBackendSet(set, { channels, profileCounts, reference });
        })
        .filter(Boolean),
    [backend, channels, siteSets, snvData, reference]
  );
  const [key, setKey] = useState("all");
  const selected = evaluations.find((e) => e.name === key) || evaluations[0];

  if (signatures.status !== "ok" || !backend.length) {
    return (
      <Card size="small" title={t("components.single-cell.signatures.fit-title")}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.signatures.no-backend")} />
      </Card>
    );
  }
  const exported = evaluations.some((e) => e.countsSource === "export");

  return (
    <Card
      size="small"
      title={
        <Space>
          <CheckCircleOutlined />
          {t("components.single-cell.signatures.fit-title")}
          <Provenance id="signatureFit" />
        </Space>
      }
    >
      {!exported && <Alert type="info" showIcon style={{ marginBottom: 8 }} message={t("components.single-cell.signatures.fit-no-export")} />}
      {refError && <Alert type="warning" showIcon style={{ marginBottom: 8 }} message={refError} />}
      {!evaluations.length ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.signatures.model-loading")} />
      ) : (
        <Row gutter={SC_GUTTER}>
          <Col span={24}>
            <Table
              size="small"
              rowKey="name"
              pagination={false}
              dataSource={evaluations}
              rowClassName={(e) => (e.name === selected?.name ? "ant-table-row-selected" : "")}
              onRow={(e) => ({ onClick: () => setKey(e.name), style: { cursor: "pointer" } })}
              columns={[
                { title: t("components.single-cell.signatures.set"), dataIndex: "name", render: (v, e) => `${v}${e.countsSource === "browser" ? " *" : ""}` },
                { title: "SNVs", dataIndex: "total", align: "right", width: 70, render: (v) => Math.round(v) },
                {
                  title: t("components.single-cell.signatures.signatures"),
                  key: "sigs",
                  render: (_, e) => (
                    <Space size={2} wrap>
                      {e.activities.map((a) => (
                        <Tag key={a.signature} bordered={false} style={{ marginInlineEnd: 0, borderLeft: `3px solid ${signatureColorOf(a.signature)}` }}>
                          {a.signature}
                        </Tag>
                      ))}
                    </Space>
                  ),
                },
                { title: t("components.single-cell.signatures.fit-cosine"), key: "cos", width: 120, render: (_, e) => <CosineTag value={e.stats.cosine} prefix="" /> },
                { title: <Tooltip title={t("components.single-cell.signatures.fit-l1-tip")}>L1 %</Tooltip>, key: "l1", align: "right", width: 70, render: (_, e) => d3.format(".1f")(e.stats.l1Pct) },
                { title: <Tooltip title={t("components.single-cell.signatures.fit-l2-tip")}>L2 %</Tooltip>, key: "l2", align: "right", width: 70, render: (_, e) => d3.format(".1f")(e.stats.l2Pct) },
                { title: <Tooltip title={t("components.single-cell.signatures.fit-kl-tip")}>KL</Tooltip>, key: "kl", align: "right", width: 70, render: (_, e) => d3.format(".3f")(e.stats.kl) },
                { title: <Tooltip title={t("components.single-cell.signatures.fit-r-tip")}>r</Tooltip>, key: "r", align: "right", width: 60, render: (_, e) => d3.format(".2f")(e.stats.correlation) },
                {
                  title: t("components.single-cell.signatures.fit-worst-col"),
                  key: "worst",
                  render: (_, e) => {
                    const r = e.residuals[0];
                    return r ? <Text type="secondary">{`${r.channel} ${r.residual >= 0 ? "+" : ""}${r.residual.toFixed(1)}`}</Text> : null;
                  },
                },
              ]}
            />
            <HintLine text={t("components.single-cell.signatures.fit-table-help")} />
          </Col>
          {selected && (
            <Col span={24}>
              <div style={{ margin: "4px 0 8px" }}>
                <Space wrap>
                  <Text strong>{selected.name}</Text>
                  <FitStatsLine stats={selected.stats} source={selected.statsSource} />
                </Space>
                {selected.nMismatch && (
                  <Alert type="warning" showIcon style={{ marginTop: 6 }} message={t("components.single-cell.signatures.fit-n-mismatch", { n: selected.n, m: Math.round(selected.total) })} />
                )}
              </div>
              <FitEvaluation key={selected.name} evaluation={selected} title={t("components.single-cell.signatures.fit-catalog-title", { set: selected.name })} />
            </Col>
          )}
        </Row>
      )}
    </Card>
  );
}
