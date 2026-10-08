import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Card, Col, Empty, InputNumber, Row, Select, Space, Switch, Typography } from "antd";
import { BranchesOutlined, DotChartOutlined, TableOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import SvgExportButton from "../svgExportButton";
import { binAt } from "../../../helpers/singleCell/matrix";
import { spearman, walkStats } from "../../../helpers/singleCell/walks";
import { correlationP, formatP } from "../../../helpers/singleCell/tests";
import { BoxStrips, Swatches, patientColor } from "./charts";

const { Text } = Typography;
const asList = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const GENE_PALETTE = d3.scaleOrdinal(d3.schemeTableau10);

/** Walks of every patient (normalised) with per-patient stats over that patient's cells. */
function useCohortWalks(summaries, files, { minCells, minMedianCn, curatedOnly }) {
  return useMemo(
    () =>
      summaries.map((s, k) => {
        const file = files[s.caseReportId]?.walks;
        const cellIds = file?.cells || [];
        const walks = (file?.walks || [])
          .map((w) => ({ ...w, id: `${w.id}`, genes: asList(w.genes), driver_genes: asList(w.driver_genes), cells: w.cells || {}, stats: walkStats({ cells: w.cells || {} }, cellIds, 1) }))
          .filter((w) => w.stats.ncells >= minCells && w.stats.medianCn >= minMedianCn && (!curatedOnly || w.curated))
          .sort((a, b) => b.stats.ncells - a.stats.ncells);
        return { summary: s, k, patient: s.caseReportId, cellIds, walks, geneSet: (w) => (w.driver_genes.length ? w.driver_genes : w.genes.length ? w.genes.slice(0, 3) : [w.label]).join("+") };
      }),
    [summaries, files, minCells, minMedianCn, curatedOnly]
  );
}

/**
 * Cohort amplicons: per patient the copies of each ecDNA walk across its
 * cells (strips) with the fraction of cells carrying it, the co-occurrence
 * of driver-gene amplicons in the same cells (upset per patient), and
 * gene-level copy number of one gene against another per cell.
 */
export default function CohortAmpliconPanel({ summaries, files, cnRows = {}, chromoBins }) {
  const { t } = useTranslation("common");
  const [ref, width] = useContainerWidth(1000);
  const [minCells, setMinCells] = useState(3);
  const [minMedianCn, setMinMedianCn] = useState(4);
  const [curatedOnly, setCuratedOnly] = useState(false);
  const [minCn, setMinCn] = useState(2);
  const per = useCohortWalks(summaries, files, { minCells, minMedianCn, curatedOnly });
  const withWalks = per.filter((p) => p.walks.length);
  const w = Math.max(500, width - 16);

  // strips: one group per patient × walk
  const stripGroups = withWalks.flatMap((p) =>
    p.walks.slice(0, 6).map((wk) => ({
      key: `${p.patient}::${wk.id}`,
      label: `${p.patient} · ${wk.label}`,
      color: patientColor(p.k),
      values: p.cellIds.map((id) => Number(wk.cells[id]) || 0).filter((v) => v > 0),
      ids: p.cellIds.filter((id) => (Number(wk.cells[id]) || 0) > 0),
      fraction: wk.stats.fraction,
    }))
  );

  // upset per patient over gene sets (driver genes of each walk): combinations present per cell
  const upset = withWalks.map((p) => {
    const sets = new Map();
    p.walks.forEach((wk) => sets.set(p.geneSet(wk), [...(sets.get(p.geneSet(wk)) || []), wk]));
    const labels = [...sets.keys()];
    const combos = new Map();
    p.cellIds.forEach((id) => {
      const present = labels.filter((l) => sets.get(l).some((wk) => (Number(wk.cells[id]) || 0) >= minCn));
      if (!present.length) return;
      const key = present.join("|");
      combos.set(key, (combos.get(key) || 0) + 1);
    });
    return { ...p, labels, combos: [...combos.entries()].map(([key, n]) => ({ sets: key.split("|"), n })).sort((a, b) => b.n - a.n).slice(0, 8) };
  });
  const allSets = [...new Set(upset.flatMap((p) => p.labels))].sort((a, b) => a.split("+").length - b.split("+").length || a.localeCompare(b));

  // gene CN vs gene CN per cell (from the loaded cell CN rows and the events' gene coordinates)
  const genePositions = useMemo(() => {
    const m = new Map();
    summaries.forEach((s) =>
      (files[s.caseReportId]?.events || []).forEach((e) => {
        const g = `${e.gene || ""}`;
        const chr = `${e.seqnames || ""}`.replace(/^chr/, "");
        const bin = chromoBins?.[chr];
        if (!g || !bin || m.has(g) || !Number.isFinite(Number(e.start))) return;
        m.set(g, bin.startPlace + ((Number(e.start) + (Number(e.end) || Number(e.start))) / 2 - bin.startPoint));
      })
    );
    return m;
  }, [summaries, files, chromoBins]);
  const geneOptions = [...genePositions.keys()].sort();
  const preferred = ["EGFR", "CDK4", "MYCN", "MDM2", "PDGFRA", "MAP3K1", "RRAS2"].filter((g) => genePositions.has(g));
  const [geneA, setGeneA] = useState(null);
  const [geneB, setGeneB] = useState(null);
  const gA = geneA || preferred[0] || geneOptions[0];
  const gB = geneB || preferred[1] || geneOptions[1] || gA;
  const scatter = useMemo(() => {
    if (!gA || !gB) return [];
    const pa = genePositions.get(gA);
    const pb = genePositions.get(gB);
    return summaries.map((s, k) => {
      const pts = (cnRows[s.caseReportId]?.cellRows || [])
        .map((c) => {
          const ia = binAt(c.row.binIndex, pa);
          const ib = binAt(c.row.binIndex, pb);
          return { id: c.cellId, x: ia >= 0 ? c.row.values[ia] : NaN, y: ib >= 0 ? c.row.values[ib] : NaN };
        })
        .filter((q) => Number.isFinite(q.x) && Number.isFinite(q.y));
      const rho = spearman(pts.map((q) => q.x), pts.map((q) => q.y));
      return { patient: s.caseReportId, k, pts, rho, p: correlationP(rho, pts.length) };
    });
  }, [summaries, cnRows, genePositions, gA, gB]);
  const maxX = d3.max(scatter, (s) => d3.max(s.pts, (q) => q.x)) || 1;
  const maxY = d3.max(scatter, (s) => d3.max(s.pts, (q) => q.y)) || 1;
  const sw = Math.max(260, Math.floor(w / Math.min(3, Math.max(1, scatter.length))) - 16);
  const sh = 260;
  const M = { left: 44, right: 10, top: 14, bottom: 34 };
  const xs = d3.scaleLog().domain([1, Math.max(2, maxX)]).range([M.left, sw - M.right]).clamp(true);
  const ys = d3.scaleLog().domain([1, Math.max(2, maxY)]).range([sh - M.bottom, M.top]).clamp(true);

  if (!summaries.some((s) => files[s.caseReportId]?.walks)) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.cohort.amp-empty")} />;
  return (
    <div ref={ref}>
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card
            size="small"
            title={<Space><BranchesOutlined />{t("components.single-cell.cohort.amp-title")}</Space>}
            extra={
              <Space wrap>
                <Text type="secondary">{t("components.single-cell.ecdna.min-cells")}</Text>
                <InputNumber size="small" min={1} value={minCells} onChange={(v) => setMinCells(v ?? 1)} style={{ width: 64 }} />
                <Text type="secondary">{t("components.single-cell.ecdna.min-median")}</Text>
                <InputNumber size="small" min={0} value={minMedianCn} onChange={(v) => setMinMedianCn(v ?? 0)} style={{ width: 64 }} />
                <Switch size="small" checked={curatedOnly} onChange={setCuratedOnly} />
                <Text>{t("components.single-cell.ecdna.curated-only")}</Text>
                <SvgExportButton containerRef={ref} name="cohort-amplicons" />
              </Space>
            }
          >
            {stripGroups.length ? <BoxStrips groups={stripGroups} width={w - 8} height={320} yTitle={t("components.single-cell.cohort.amp-y")} log /> : <Text type="secondary">{t("components.single-cell.cohort.amp-none-pass")}</Text>}
            <svg width={w - 8} height={70}>
              {stripGroups.map((g, i) => {
                const bw = (w - 8 - 76) / Math.max(1, stripGroups.length);
                return (
                  <g key={g.key} transform={`translate(${64 + i * bw},0)`}>
                    <rect x={bw * 0.15} y={50 - g.fraction * 44} width={bw * 0.7} height={g.fraction * 44} fill={g.color} />
                    <text x={bw / 2} y={48 - g.fraction * 44} textAnchor="middle" fontSize={9} fill="#262626">{d3.format(".0%")(g.fraction)}</text>
                    <title>{`${g.label}: ${g.ids.length} cells (${d3.format(".0%")(g.fraction)})`}</title>
                  </g>
                );
              })}
              <text x={60} y={30} textAnchor="end" fontSize={10} fill="#595959">{t("components.single-cell.cohort.amp-pct")}</text>
            </svg>
            <Text type="secondary" style={{ fontSize: 12 }}>{t("components.single-cell.cohort.amp-help")}</Text>
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card size="small" title={<Space><TableOutlined />{t("components.single-cell.cohort.amp-upset-title")}</Space>} extra={<Space><Text type="secondary">{t("components.single-cell.ecdna.min-cn")}</Text><InputNumber size="small" min={1} value={minCn} onChange={(v) => setMinCn(v ?? 1)} style={{ width: 64 }} /></Space>}>
            {(() => {
              const LEFT = 150;
              const rowH = 18;
              const colW = 34;
              const barW = 160;
              let y = 0;
              const blocks = upset.map((p) => {
                const top = y;
                y += 20 + Math.max(1, p.combos.length) * rowH + 8;
                return { ...p, top };
              });
              return (
                <svg width={Math.max(w / 2 - 24, LEFT + allSets.length * colW + barW + 40)} height={y + 60}>
                  {allSets.map((s, j) => (
                    <text key={s} transform={`translate(${LEFT + (j + 0.5) * colW},${y + 6}) rotate(-60)`} fontSize={9} fill={GENE_PALETTE(s)} textAnchor="end" dy="0.35em">{s}</text>
                  ))}
                  {blocks.map((p) => (
                    <g key={p.patient} transform={`translate(0,${p.top})`}>
                      <rect x={0} y={0} width={4} height={14 + Math.max(1, p.combos.length) * rowH} fill={patientColor(p.k)} />
                      <text x={10} y={10} dy="0.35em" fontSize={12} fontWeight={600} fill="#262626">{p.patient}</text>
                      {p.combos.map((c, i) => {
                        const cy = 20 + (i + 0.5) * rowH;
                        const idx = c.sets.map((s) => allSets.indexOf(s)).filter((v) => v >= 0);
                        const frac = c.n / Math.max(1, p.cellIds.length);
                        return (
                          <g key={c.sets.join("|")}>
                            {allSets.map((s, j) => <circle key={s} cx={LEFT + (j + 0.5) * colW} cy={cy} r={c.sets.includes(s) ? 5 : 2.5} fill={c.sets.includes(s) ? GENE_PALETTE(s) : "#e8e8e8"} />)}
                            {idx.length > 1 && <line x1={LEFT + (Math.min(...idx) + 0.5) * colW} x2={LEFT + (Math.max(...idx) + 0.5) * colW} y1={cy} y2={cy} stroke="#262626" strokeWidth={2} />}
                            <rect x={LEFT + allSets.length * colW + 10} y={cy - 6} width={frac * barW} height={12} fill={c.sets.length === 1 ? GENE_PALETTE(c.sets[0]) : "#8c8c8c"} />
                            <text x={LEFT + allSets.length * colW + 14 + frac * barW} y={cy} dy="0.35em" fontSize={9} fill="#262626">{`${d3.format(".0%")(frac)} (${c.n})`}</text>
                          </g>
                        );
                      })}
                    </g>
                  ))}
                </svg>
              );
            })()}
            <Text type="secondary" style={{ fontSize: 12 }}>{t("components.single-cell.cohort.amp-upset-help")}</Text>
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card
            size="small"
            title={<Space><DotChartOutlined />{t("components.single-cell.cohort.amp-scatter-title")}</Space>}
            extra={
              <Space>
                <Select size="small" showSearch style={{ width: 120 }} value={gA} onChange={setGeneA} options={geneOptions.map((g) => ({ value: g, label: g }))} />
                <Text type="secondary">vs</Text>
                <Select size="small" showSearch style={{ width: 120 }} value={gB} onChange={setGeneB} options={geneOptions.map((g) => ({ value: g, label: g }))} />
              </Space>
            }
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {scatter.map((s) => (
                <svg key={s.patient} width={sw} height={sh}>
                  <text x={M.left} y={10} fontSize={11} fontWeight={600} fill={patientColor(s.k)}>{`${s.patient} · ρ ${Number.isFinite(s.rho) ? s.rho.toFixed(2) : "–"} ${formatP(s.p)}`}</text>
                  {[1, 2, 5, 10, 20, 50, 100, 200].filter((v) => v <= Math.max(2, maxX)).map((v) => <g key={`x${v}`}><line x1={xs(v)} x2={xs(v)} y1={M.top} y2={sh - M.bottom} stroke="#f0f0f0" /><text x={xs(v)} y={sh - M.bottom + 12} textAnchor="middle" fontSize={9} fill="#8c8c8c">{v}</text></g>)}
                  {[1, 2, 5, 10, 20, 50, 100, 200].filter((v) => v <= Math.max(2, maxY)).map((v) => <g key={`y${v}`}><line x1={M.left} x2={sw - M.right} y1={ys(v)} y2={ys(v)} stroke="#f0f0f0" /><text x={M.left - 4} y={ys(v)} dy="0.35em" textAnchor="end" fontSize={9} fill="#8c8c8c">{v}</text></g>)}
                  {s.pts.map((q) => <circle key={q.id} cx={xs(Math.max(1, q.x))} cy={ys(Math.max(1, q.y))} r={3} fill={patientColor(s.k)} fillOpacity={0.7}><title>{`${q.id}: ${gA} ${q.x.toFixed(1)} · ${gB} ${q.y.toFixed(1)}`}</title></circle>)}
                  <text x={(M.left + sw - M.right) / 2} y={sh - 4} textAnchor="middle" fontSize={10} fill="#595959">{`${gA} copies`}</text>
                  <text transform={`translate(10 ${(M.top + sh - M.bottom) / 2}) rotate(-90)`} textAnchor="middle" fontSize={10} fill="#595959">{`${gB} copies`}</text>
                </svg>
              ))}
            </div>
            <Swatches items={summaries.map((s, k) => ({ key: s.caseReportId, color: patientColor(k), label: s.caseReportId }))} />
            <Text type="secondary" style={{ fontSize: 12 }}>{t("components.single-cell.cohort.amp-scatter-help")}</Text>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
