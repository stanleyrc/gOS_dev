import React, { useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Button, Card, Col, Empty, Row, Segmented, Select, Space, Statistic, Switch, Table, Tag, Typography } from "antd";
import { ExperimentOutlined } from "@ant-design/icons";
import useContainerWidth from "./useContainerWidth";
import useRnaData from "./rna/useRnaData";
import singleCellActions from "../../redux/singleCell/actions";
import datasetsActions from "../../redux/datasets/actions";
import { cnRowQc, medianMad, robustOutliers } from "../../helpers/singleCell/cohortStats";
import { annotationColors } from "../../helpers/singleCell/matrix";
import { themePalette } from "../../helpers/singleCell/themes";
import { BoxStrips, FONT, YAxis } from "./cohort/charts";
import { spearman } from "../../helpers/singleCell/dosage";
import { correlationP, formatP } from "../../helpers/singleCell/tests";
import { CELL_QC_METRICS } from "./cohort/cohortQcPanel";
import SvgExportButton from "./svgExportButton";
import HintLine from "./hintLine";
import { SC_GUTTER, SC_GUTTER_INNER } from "./density";

const { Text } = Typography;

// [key, label, log scale, outlier side, section]
const DNA_METRICS = [
  ["fga", "Fraction of genome altered (vs ploidy)", false, "high", "cn"],
  ["segments", "Copy-number segments", true, "high", "cn"],
  ["ploidy", "Ploidy", false, "both", "cn"],
  ["chrXMeanCn", "Mean CN on chrX", false, "both", "cn"],
  ["snv_count", "SNVs called per cell", true, "both", "calls"],
  ["junction_count", "Junctions per cell", true, "high", "calls"],
  ...CELL_QC_METRICS.filter(([k]) => !["ploidy", "snv_count", "junction_count"].includes(k)).map(([k, l, log]) => [k, l, log, "both", "library"]),
];
// Precomputed per-cell QC, S-phase and telomere metrics (srctools precompute; merged into the cell records)
const PRECOMPUTE_METRICS = [
  ["pc_ado", "Allelic dropout at germline hets", false, "high", "precompute"],
  ["pc_mapd", "MAPD (500 kb bins)", false, "high", "precompute"],
  ["pc_loh_het_rate", "Biallelic hets inside LOH (doublet signal)", false, "high", "precompute"],
  ["pc_cn_resid", "Coverage vs JaBbA CN residual", false, "high", "precompute"],
  ["pc_rt_cor", "Coverage vs replication timing (S-phase)", false, "high", "precompute"],
  ["pc_tel_rel", "Telomere content (× normal cells)", false, "both", "precompute"],
];
const RNA_METRICS = [
  ["nCount_RNA", "RNA counts per cell", true, "both", "rna"],
  ["nFeature_RNA", "Genes detected per cell", true, "both", "rna"],
  ["percent_mt", "Mitochondrial reads (%)", false, "high", "rna"],
];
const SECTIONS = ["cn", "calls", "library", "precompute", "rna"];

/**
 * QC of one patient's cells: copy-number metrics computed here from each
 * cell's CN graph (FGA relative to ploidy, segments, chrX), call counts,
 * library metrics exported by the pipeline, and RNA QC from the Seurat
 * metadata. Grouped by clone / region / state; outliers (3 MADs within the
 * patient) flagged, listed and selectable.
 */
export default function QcPanel() {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const [ref, width] = useContainerWidth(1000);
  const plotsRef = useRef(null);
  const { cells, cn, cloneColors, layout, patient } = useSelector((state) => state.SingleCell);
  const { summary: rna } = useRnaData();
  const [groupBy, setGroupBy] = useState("clone_id");
  const [tumorOnly, setTumorOnly] = useState(true);
  const [section, setSection] = useState("all");

  const cnQc = useMemo(() => {
    const out = new Map();
    if (cn.status !== "ok" || !cn.data) return out;
    const ploidyOf = new Map(cells.map((c) => [c.cell_id, c.ploidy]));
    cn.data.cells.forEach((id, k) => {
      const qc = cnRowQc(cn.data.rows[k], ploidyOf.get(id));
      if (qc) out.set(id, qc);
    });
    return out;
  }, [cn, cells]);
  const rnaById = useMemo(() => {
    const out = new Map();
    (rna?.cells || []).forEach((c) => c.cell_id && out.set(c.cell_id, c));
    return out;
  }, [rna]);

  const rows = useMemo(
    () =>
      cells
        .filter((c) => !tumorOnly || !/^normal$/i.test(`${c.clone_id || ""}`))
        .map((c) => {
          const r = rnaById.get(c.cell_id);
          return { ...c, ...(cnQc.get(c.cell_id) || {}), nCount_RNA: r?.nCount_RNA, nFeature_RNA: r?.nFeature_RNA, percent_mt: r?.percent_mt };
        }),
    [cells, cnQc, tumorOnly, rnaById]
  );
  const metrics = useMemo(
    () => [...DNA_METRICS, ...PRECOMPUTE_METRICS, ...RNA_METRICS].filter(([k]) => rows.some((r) => Number.isFinite(Number(r[k])))),
    [rows]
  );
  const shownMetrics = metrics.filter(([, , , , sec]) => section === "all" || sec === section);
  const groupFields = useMemo(() => ["clone_id", "region", "state", "Region_Annotation", "Phase"].filter((f) => cells.some((c) => c[f] != null && c[f] !== "")), [cells]);
  const levels = useMemo(() => [...new Set(rows.map((r) => `${r[groupBy] ?? "NA"}`))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [rows, groupBy]);
  const colors = useMemo(() => (groupBy === "clone_id" ? cloneColors : annotationColors(levels, themePalette(layout.theme))), [groupBy, cloneColors, levels, layout.theme]);

  const flags = useMemo(() => {
    const byCell = new Map();
    metrics.forEach(([k, label, , side]) => {
      const values = rows.map((r) => Number(r[k]));
      robustOutliers(values, { k: 3, side }).forEach((i) => {
        const id = rows[i].cell_id;
        if (!byCell.has(id)) byCell.set(id, []);
        byCell.get(id).push(label);
      });
    });
    return byCell;
  }, [metrics, rows]);

  if (!cells.length || !metrics.length) return <Empty description={t("components.single-cell.qc.empty")} />;

  const groupsFor = (key) =>
    levels.map((lv) => {
      const sub = rows.filter((r) => `${r[groupBy] ?? "NA"}` === lv);
      return { key: lv, label: lv, color: colors[lv] || "#8c8c8c", values: sub.map((r) => Number(r[key])), ids: sub.map((r) => r.cell_id), cells: sub };
    });
  const flaggedIds = new Set(flags.keys());
  const flaggedRows = rows.filter((r) => flaggedIds.has(r.cell_id));
  const cols = width >= 1600 ? 4 : width >= 1100 ? 3 : width >= 700 ? 2 : 1;
  const plotWidth = Math.floor((width - 12 * (cols - 1)) / cols) - 26;
  const PAIRS = [["qc_depth", "snv_count"], ["ploidy", "fga"], ["segments", "qc_mad"], ["nCount_RNA", "nFeature_RNA"], ["fga", "snv_count"], ["qc_breadth", "junction_count"]].filter(([a, b]) => metrics.some((m) => m[0] === a) && metrics.some((m) => m[0] === b));
  const labelOf = (k) => (metrics.find((m) => m[0] === k) || [k, k])[1];
  const groupMedians = levels.map((lv) => {
    const sub = rows.filter((r) => `${r[groupBy] ?? "NA"}` === lv);
    const row = { key: lv, group: lv, n: sub.length };
    metrics.forEach(([k]) => (row[k] = medianMad(sub.map((r) => Number(r[k]))).median));
    return row;
  });
  const openCell = (id) => patient && dispatch(datasetsActions.openCaseReport(patient.datasetId, id));
  const fmt = (v, d = 2) => (Number.isFinite(Number(v)) ? d3.format(`.${d}~f`)(Number(v)) : "–");
  const med = (k) => medianMad(rows.map((r) => Number(r[k]))).median;
  const withRna = rows.filter((r) => Number.isFinite(Number(r.nCount_RNA))).length;

  return (
    <div ref={ref}>
      <Row gutter={SC_GUTTER}>
        <Col span={24}>
          <Card
            size="small"
            title={<Space><ExperimentOutlined />{t("components.single-cell.qc.title")}</Space>}
            extra={
              <Space wrap>
                <Segmented
                  size="small"
                  value={section}
                  onChange={setSection}
                  options={[{ value: "all", label: t("components.single-cell.qc.section-all") }, ...SECTIONS.filter((s) => metrics.some((m) => m[4] === s)).map((s) => ({ value: s, label: t(`components.single-cell.qc.section-${s}`) }))]}
                />
                <Text type="secondary">{t("components.single-cell.qc.group-by")}</Text>
                <Select size="small" style={{ width: 160 }} value={groupBy} onChange={setGroupBy} options={groupFields.map((f) => ({ value: f, label: f === "clone_id" ? t("components.single-cell.umap.color-clone") : f }))} />
                <Switch size="small" checked={tumorOnly} onChange={setTumorOnly} />
                <Text>{t("components.single-cell.qc.tumor-only")}</Text>
                {flaggedRows.length > 0 && (
                  <Button size="small" onClick={() => dispatch(singleCellActions.updateSelection(flaggedRows.map((r) => r.cell_id)))}>
                    {t("components.single-cell.qc.select-flagged", { count: flaggedRows.length })}
                  </Button>
                )}
                <SvgExportButton containerRef={plotsRef} name="qc" />
              </Space>
            }
          >
            <Space size="large" wrap>
              <Statistic title={t("components.single-cell.qc.stat-cells")} value={rows.length} />
              <Statistic title={t("components.single-cell.qc.stat-flagged")} value={flaggedRows.length} valueStyle={{ color: flaggedRows.length ? "#cf1322" : undefined }} />
              {Number.isFinite(med("fga")) && <Statistic title={t("components.single-cell.qc.stat-fga")} value={d3.format(".0%")(med("fga"))} />}
              {Number.isFinite(med("ploidy")) && <Statistic title={t("components.single-cell.qc.stat-ploidy")} value={fmt(med("ploidy"))} />}
              {Number.isFinite(med("snv_count")) && <Statistic title={t("components.single-cell.qc.stat-snvs")} value={fmt(med("snv_count"), 0)} />}
              {Number.isFinite(med("qc_depth")) && <Statistic title={t("components.single-cell.qc.stat-depth")} value={`${fmt(med("qc_depth"), 1)}×`} />}
              {withRna > 0 && <Statistic title={t("components.single-cell.qc.stat-rna")} value={`${withRna}/${rows.length}`} />}
            </Space>
            <HintLine text={t("components.single-cell.qc.help")} />
          </Card>
        </Col>
        <Col span={24}>
          <div ref={plotsRef}>
            <Row gutter={SC_GUTTER}>
              {shownMetrics.map(([k, label, log]) => (
                <Col key={k} span={24 / cols}>
                  <Card size="small" title={<span style={{ fontSize: 12 }}>{label}</span>} extra={<Text type="secondary" style={{ fontSize: 11 }}>{t("components.single-cell.qc.median", { value: fmt(med(k), k === "fga" ? 3 : 2) })}</Text>} bodyStyle={{ padding: "2px 6px" }} headStyle={{ minHeight: 26 }}>
                    <BoxStrips groups={groupsFor(k)} width={plotWidth} height={140} log={log} flagged={flaggedIds} onPoint={(g, i) => dispatch(singleCellActions.updateSelection([g.ids[i]]))} />
                  </Card>
                </Col>
              ))}
            </Row>
          </div>
        </Col>
        {(section === "all") && PAIRS.length > 0 && (
          <Col span={24}>
            <Card size="small" title={t("components.single-cell.qc.correlations")} bodyStyle={{ padding: "4px 8px" }}>
              <Row gutter={SC_GUTTER_INNER}>
                {PAIRS.map(([a, b]) => {
                  const pts = rows.filter((r) => Number.isFinite(Number(r[a])) && Number.isFinite(Number(r[b]))).map((r) => ({ id: r.cell_id, x: Number(r[a]), y: Number(r[b]), g: `${r[groupBy] ?? "NA"}` }));
                  if (pts.length < 5) return null;
                  const w = plotWidth;
                  const h = 190;
                  const Mm = { top: 10, right: 10, bottom: 40, left: 56 };
                  const xs = d3.scaleLinear().domain(d3.extent(pts, (p) => p.x)).nice().range([Mm.left, w - Mm.right]);
                  const ys = d3.scaleLinear().domain(d3.extent(pts, (p) => p.y)).nice().range([h - Mm.bottom, Mm.top]);
                  const rho = spearman(pts.map((p) => p.x), pts.map((p) => p.y));
                  return (
                    <Col key={`${a}-${b}`} span={24 / cols}>
                      <svg width={w} height={h}>
                        <YAxis scale={ys} x0={Mm.left} x1={w - Mm.right} title={labelOf(b).length > 24 ? `${labelOf(b).slice(0, 23)}…` : labelOf(b)} ticks={4} format={d3.format("~g")} />
                        {xs.ticks(4).map((v) => (
                          <text key={v} x={xs(v)} y={h - Mm.bottom + 14} textAnchor="middle" fontSize={FONT.axis - 1} fill="#595959">{d3.format("~g")(v)}</text>
                        ))}
                        <text x={(Mm.left + w - Mm.right) / 2} y={h - 6} textAnchor="middle" fontSize={FONT.axis} fill="#262626">{labelOf(a)}</text>
                        {pts.map((p) => (
                          <circle key={p.id} cx={xs(p.x)} cy={ys(p.y)} r={flaggedIds.has(p.id) ? 3.5 : 2.6} fill={colors[p.g] || "#8c8c8c"} fillOpacity={0.8} stroke={flaggedIds.has(p.id) ? "#cf1322" : "none"} style={{ cursor: "pointer" }} onClick={() => dispatch(singleCellActions.updateSelection([p.id]))}>
                            <title>{`${p.id}
${labelOf(a)}: ${d3.format("~g")(p.x)}
${labelOf(b)}: ${d3.format("~g")(p.y)}`}</title>
                          </circle>
                        ))}
                        <text x={w - Mm.right} y={Mm.top + 2} textAnchor="end" fontSize={11} fill="#595959">{`ρ ${Number.isFinite(rho) ? rho.toFixed(2) : "–"} · ${formatP(correlationP(rho, pts.length))}`}</text>
                      </svg>
                    </Col>
                  );
                })}
              </Row>
            </Card>
          </Col>
        )}
        <Col span={24}>
          <Card size="small" title={t("components.single-cell.qc.medians-title")} bodyStyle={{ padding: 0 }}>
            <Table
              size="small"
              rowKey="key"
              pagination={false}
              scroll={{ x: true }}
              dataSource={groupMedians}
              columns={[
                { title: groupBy === "clone_id" ? t("components.single-cell.umap.color-clone") : groupBy, dataIndex: "group", fixed: "left", width: 140, render: (g) => <Tag color={colors[g]}>{g}</Tag> },
                { title: "n", dataIndex: "n", width: 60 },
                ...metrics.map(([k, label]) => ({ title: <span style={{ fontSize: 11 }}>{label}</span>, dataIndex: k, width: 120, render: (v) => (k === "fga" ? (Number.isFinite(v) ? d3.format(".1%")(v) : "–") : fmt(v, 2)) })),
              ]}
            />
          </Card>
        </Col>
        <Col span={24}>
          <Card size="small" title={t("components.single-cell.qc.flagged-title", { count: flaggedRows.length })}>
            <Table
              size="small"
              rowKey="cell_id"
              dataSource={flaggedRows}
              pagination={{ pageSize: 10, size: "small" }}
              columns={[
                { title: t("components.single-cell.tooltip.cell"), dataIndex: "cell_id", render: (id) => <Button type="link" size="small" style={{ padding: 0 }} onClick={() => openCell(id)}>{id}</Button> },
                { title: t("components.single-cell.tooltip.clone"), dataIndex: "clone_id", render: (c) => (c ? <Tag color={cloneColors[c]}>{c}</Tag> : "–") },
                { title: t("components.single-cell.qc.flags"), dataIndex: "cell_id", key: "flags", render: (id) => (flags.get(id) || []).join(", ") },
                { title: "Ploidy", dataIndex: "ploidy", render: (v) => fmt(v) },
                { title: "FGA", dataIndex: "fga", render: (v) => (Number.isFinite(v) ? d3.format(".0%")(v) : "–") },
                { title: t("components.single-cell.qc.segments"), dataIndex: "segments" },
                { title: "SNVs", dataIndex: "snv_count" },
                { title: "", key: "select", render: (_, r) => <Button size="small" onClick={() => dispatch(singleCellActions.updateSelection([r.cell_id]))}>{t("components.single-cell.qc.select")}</Button> },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
