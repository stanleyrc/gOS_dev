import React, { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Alert, Button, Card, Col, Descriptions, Empty, Row, Space, Statistic, Tag, Tooltip, Typography } from "antd";
import { AimOutlined, ExperimentOutlined, FileSearchOutlined, SelectOutlined } from "@ant-design/icons";
import singleCellActions from "../../redux/singleCell/actions";
import settingsActions from "../../redux/settings/actions";
import { buildPatientReport } from "../../helpers/singleCell/patientReport";
import { eventSnvSiteId } from "../../helpers/singleCell/snvSites";
import { locationToDomains } from "../../helpers/utility";
import { padDomains } from "../../helpers/singleCell/eventDomains";
import { signatureColorOf } from "./signaturePanel";
import { formatP } from "../../helpers/singleCell/tests";
import signatureMetadata from "../../translations/en/signatures.json";

const { Text, Paragraph, Title } = Typography;
const CLASS_COLORS = { amp: "#D7191C", homdel: "#2C7BB6", fusion: "#7B3294", trunc: "#1A1A1A", splice: "#E6AB02", missense: "#1B9E77", other: "#8c8c8c" };
const aetiology = (sig) => (signatureMetadata.metadata[sig]?.full || "").replace(/<[^>]+>/g, "").replace(/^\S+\s*-\s*/, "");

/** One driver line with actions: select carriers, zoom the heatmap, view reads. */
function DriverRow({ d, cloneColors, interactive, onSelect, onZoom, onIgv, onSites }) {
  const { t } = useTranslation("common");
  const pct = d3.format(".0%");
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "4px 0", borderBottom: "1px solid #f0f0f0" }}>
      <span style={{ width: 10, height: 10, marginTop: 5, borderRadius: 2, background: CLASS_COLORS[d.class], flex: "0 0 auto" }} />
      <div style={{ flex: 1 }}>
        <Space size={6} wrap>
          <Text strong>{d.label}</Text>
          {d.tier != null && <Tag>{`Tier ${d.tier}`}</Tag>}
          {d.role && <Tag color={/oncogene/i.test(d.role) ? "volcano" : "geekblue"}>{d.role}</Tag>}
          {d.effect && <Text type="secondary">{d.effect}</Text>}
          {d.unverified && (
            <Tooltip title={t("components.single-cell.report.unverified-help")}>
              <Tag color="warning">{t("components.single-cell.report.unverified")}</Tag>
            </Tooltip>
          )}
        </Space>
        <div>
          <Text type="secondary">{t("components.single-cell.report.in-cells", { cells: d.cells, pct: pct(d.fraction) })}</Text>
          {Object.entries(d.fractions)
            .filter(([, f]) => f.n > 0)
            .sort((a, b) => b[1].fraction - a[1].fraction)
            .map(([clone, f]) => (
              <Tooltip key={clone} title={t("components.single-cell.report.clone-fisher", { p: formatP(f.p), or: Number.isFinite(f.oddsRatio) ? f.oddsRatio.toFixed(1) : "∞" })}>
                <Tag color={cloneColors[clone]} style={{ marginLeft: 6, fontWeight: f.p < 0.01 && f.fraction > 0.5 ? 600 : 400 }}>
                  {`${clone} ${f.n}/${f.size}${f.p < 0.01 && f.fraction > 0.5 ? " *" : ""}`}
                </Tag>
              </Tooltip>
            ))}
        </div>
      </div>
      {interactive && (
        <Space size={2}>
          <Tooltip title={t("components.single-cell.report.select-cells")}>
            <Button size="small" type="text" icon={<SelectOutlined />} onClick={() => onSelect(d)} />
          </Tooltip>
          <Tooltip title={t("components.single-cell.report.zoom")}>
            <Button size="small" type="text" icon={<AimOutlined />} onClick={() => onZoom(d)} />
          </Tooltip>
          {d.class !== "amp" && d.class !== "homdel" && d.class !== "fusion" && (
            <Tooltip title={t("components.single-cell.report.igv")}>
              <Button size="small" type="text" icon={<FileSearchOutlined />} onClick={() => onIgv(d)} />
            </Tooltip>
          )}
          {eventSnvSiteId(d.event) && (
            <Tooltip title={t("components.single-cell.report.show-site")}>
              <Button size="small" type="text" icon={<ExperimentOutlined />} onClick={() => onSites(d)} />
            </Tooltip>
          )}
        </Space>
      )}
    </div>
  );
}

function SignatureBar({ items, width = 320 }) {
  if (!items.length) return <Text type="secondary">–</Text>;
  let x = 0;
  return (
    <svg width={width} height={18}>
      {items.map((s) => {
        const w = width * s.share;
        const rect = (
          <g key={s.signature}>
            <rect x={x} y={0} width={Math.max(0, w - 0.5)} height={18} fill={signatureColorOf(s.signature)} />
            {w > 36 && (
              <text x={x + w / 2} y={9} dy="0.35em" textAnchor="middle" fontSize={10} fill="#fff">
                {s.signature}
              </text>
            )}
            <title>{`${s.signature}: ${d3.format(".0%")(s.share)}${aetiology(s.signature) ? `\n${aetiology(s.signature)}` : ""}`}</title>
          </g>
        );
        x += w;
        return rect;
      })}
    </svg>
  );
}

/**
 * Key findings of a single-cell patient as an interactive report: clonal
 * (truncal) drivers, subclonal drivers and the clones they define, mutation
 * burden by tree position, signatures, and caveats. `interactive` enables
 * the heatmap / IGV actions (only on the patient's own page).
 */
export default function PatientReportCard({ patient, events, cells, variants, signatures, cloneColors = {}, interactive = false, onOpen = null }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const { chromoBins, genomeLength } = useSelector((state) => state.Settings);
  const report = useMemo(() => buildPatientReport({ patient, events: events || [], cells: cells || [], variants: variants || [], signatures }), [patient, events, cells, variants, signatures]);
  const pct = d3.format(".0%");

  const onSelect = (d) => dispatch(singleCellActions.updateSelection(`${d.event.cell_ids || ""}`.split(",").filter(Boolean)));
  const onZoom = (d) => {
    const loc = d.event.Genome_Location || `${d.event.seqnames}:${d.event.start}-${d.event.end}`;
    try {
      const domains = padDomains(locationToDomains(chromoBins, loc, { clampRanges: true }), 2.5e5, genomeLength);
      if (domains) {
        dispatch(settingsActions.updateDomains(domains));
        dispatch(settingsActions.updateTab("7"));
      }
    } catch (error) {
      // bad coordinates: nothing to zoom to
    }
  };
  const onIgv = (d) => {
    const carriers = `${d.event.cell_ids || ""}`.split(",").filter(Boolean).slice(0, 6);
    const position = Number(d.event.start);
    if (!carriers.length || !Number.isFinite(position)) return;
    dispatch(singleCellActions.openIgv({ cellIds: carriers, chromosome: `${d.event.seqnames}`, position, label: d.label }));
    dispatch(settingsActions.updateTab("7"));
  };
  const onSites = (d) => {
    const id = eventSnvSiteId(d.event);
    if (id) {
      dispatch(singleCellActions.updateLayout({ snvSiteIds: [id] }));
      dispatch(settingsActions.updateTab("7"));
    }
  };
  const rowProps = { cloneColors, interactive, onSelect, onZoom, onIgv, onSites };

  if (!events && !cells?.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />;

  const summary = [
    t("components.single-cell.report.summary-cells", { tumor: report.nTumorCells, normal: report.nNormalCells, clones: report.clones.length }),
    report.clonal.length
      ? t("components.single-cell.report.summary-clonal", { list: report.clonal.slice(0, 4).map((d) => d.label).join(", ") })
      : t("components.single-cell.report.summary-no-clonal"),
    report.subclonal.length ? t("components.single-cell.report.summary-subclonal", { count: report.subclonal.length }) : null,
    report.signatures.all.length ? t("components.single-cell.report.summary-signatures", { list: report.signatures.all.slice(0, 3).map((s) => `${s.signature} ${pct(s.share)}`).join(", ") }) : null,
  ].filter(Boolean);

  return (
    <Card
      size="small"
      title={
        <Space>
          <FileSearchOutlined />
          {t("components.single-cell.report.title", { patient })}
          {onOpen && (
            <Button size="small" type="link" onClick={onOpen}>
              {t("components.single-cell.cohort.open")}
            </Button>
          )}
        </Space>
      }
    >
      <Paragraph style={{ fontSize: 14 }}>{summary.join(" ")}</Paragraph>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Title level={5}>{t("components.single-cell.report.clonal-title", { count: report.clonal.length })}</Title>
          <Text type="secondary">{t("components.single-cell.report.clonal-help", { pct: pct(0.85) })}</Text>
          {report.clonal.length ? report.clonal.map((d) => <DriverRow key={d.label} d={d} {...rowProps} />) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.report.none")} />}
          <Title level={5} style={{ marginTop: 16 }}>{t("components.single-cell.report.subclonal-title", { count: report.subclonal.length })}</Title>
          <Text type="secondary">{t("components.single-cell.report.subclonal-help")}</Text>
          {report.subclonal.length ? report.subclonal.map((d) => <DriverRow key={d.label} d={d} {...rowProps} />) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.report.none")} />}
          {report.rare.length > 0 && (
            <Text type="secondary" style={{ display: "block", marginTop: 8 }}>
              {t("components.single-cell.report.rare", { count: report.rare.length, list: report.rare.slice(0, 6).map((d) => `${d.label} (${d.cells})`).join("; ") })}
            </Text>
          )}
        </Col>
        <Col xs={24} lg={10}>
          <Title level={5}>{t("components.single-cell.report.clones-title")}</Title>
          {report.clones.map((c) => (
            <div key={c.clone} style={{ marginBottom: 8 }}>
              <Space size={6} wrap>
                <Tag color={cloneColors[c.clone]}>{c.clone}</Tag>
                <Text>{t("components.single-cell.report.clone-size", { n: c.size, pct: pct(c.fraction) })}</Text>
                {interactive && (
                  <Button size="small" type="link" style={{ padding: 0 }} onClick={() => dispatch(singleCellActions.updateSelection((cells || []).filter((x) => `${x.clone_id}` === c.clone).map((x) => x.cell_id)))}>
                    {t("components.single-cell.report.select-clone")}
                  </Button>
                )}
              </Space>
              <div style={{ paddingLeft: 8 }}>
                {c.defining.length ? (
                  <Text>{t("components.single-cell.report.clone-defining", { list: c.defining.map((d) => d.label).join(", ") })}</Text>
                ) : (
                  <Text type="secondary">{t("components.single-cell.report.clone-no-defining")}</Text>
                )}
                {c.carried.length > 0 && <div><Text type="secondary">{t("components.single-cell.report.clone-carried", { list: c.carried.map((d) => d.label).join(", ") })}</Text></div>}
              </div>
            </div>
          ))}
          <Title level={5} style={{ marginTop: 16 }}>{t("components.single-cell.report.burden-title")}</Title>
          <Space size="large">
            <Statistic title={t("components.single-cell.snv.category-truncal")} value={report.burden.truncal} />
            <Statistic title={t("components.single-cell.snv.category-subclonal")} value={report.burden.subclonal} />
            <Statistic title={t("components.single-cell.snv.category-private")} value={report.burden.private} />
            <Statistic title={t("components.single-cell.report.snv-drivers")} value={report.snvDrivers.length} />
          </Space>
          <Title level={5} style={{ marginTop: 16 }}>{t("components.single-cell.report.signatures-title")}</Title>
          <Descriptions size="small" column={1} colon={false}>
            <Descriptions.Item label={t("components.single-cell.report.sig-all", { n: report.signatures.n ?? "" })}><SignatureBar items={report.signatures.all} /></Descriptions.Item>
            <Descriptions.Item label={t("components.single-cell.snv.category-truncal")}><SignatureBar items={report.signatures.truncal} /></Descriptions.Item>
            <Descriptions.Item label={t("components.single-cell.snv.category-subclonal")}><SignatureBar items={report.signatures.subclonal} /></Descriptions.Item>
          </Descriptions>
          {report.signatures.emerging.length > 0 && (
            <Alert
              type="info"
              showIcon
              message={t("components.single-cell.report.emerging", { list: report.signatures.emerging.map((s) => `${s.signature} (${pct(s.share)}${aetiology(s.signature) ? `, ${aetiology(s.signature)}` : ""})`).join("; ") })}
            />
          )}
        </Col>
        {report.caveats.length > 0 && (
          <Col span={24}>
            <Alert type="warning" showIcon message={t("components.single-cell.report.caveats")} description={report.caveats.map((c) => t(`components.single-cell.report.caveat-${c}`)).join(" ")} />
          </Col>
        )}
      </Row>
    </Card>
  );
}
