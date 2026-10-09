import React, { useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { AutoComplete, Button, Card, Col, Empty, Progress, Row, Segmented, Space, Statistic, Table, Tag, Typography } from "antd";
import { DotChartOutlined, OrderedListOutlined } from "@ant-design/icons";
import { dosageByChromosome, dosagePoints, dosageRanking, geneLocus } from "../../../helpers/singleCell/dosage";
import { correlationP, formatP } from "../../../helpers/singleCell/tests";
import { searchGeneNames } from "../../../helpers/singleCell/staticRna";
import { eventClass } from "../../../helpers/singleCell/cohortStats";
import { isStrongEvent } from "../../../helpers/singleCell/strongEvents";
import singleCellActions from "../../../redux/singleCell/actions";
import useContainerWidth from "../useContainerWidth";
import SvgExportButton from "../svgExportButton";
import { FONT, YAxis } from "../cohort/charts";
import HintLine, { Provenance } from "../hintLine";
import { SC_GUTTER, SC_GUTTER_INNER } from "../density";
import { INK, TYPE } from "../../../helpers/singleCell/plotTheme";

const { Text } = Typography;
const M = { top: 30, right: 16, bottom: 58, left: 66 };
const NO_CLONE = "#8c8c8c";
const MAX_GENES = 12;
const FALLBACK_GENES = ["EGFR", "CDK4", "MDM2", "PDGFRA", "CDKN2A", "PTEN"];

/** One gene: CN (x, jittered) vs expression (y), coloured by clone; click selects, drag-box selects (Shift adds). */
function DosageScatter({ gene, result, width, height, cloneOf, cloneColors, selected, hovered, onSelect, onHover, badge }) {
  const svgRef = useRef(null);
  const [drag, setDrag] = useState(null);
  const w = width - M.left - M.right;
  const h = height - M.top - M.bottom;
  const points = result.points;
  const x = d3.scaleLinear().domain([0, Math.max(4, d3.max(points, (p) => p.cn) || 4)]).nice().range([0, w]);
  const y = d3.scaleLinear().domain([0, Math.max(0.5, d3.max(points, (p) => p.expr) || 0.5)]).nice().range([h, 0]);
  const jitter = (id) => {
    let s = 0;
    for (let i = 0; i < id.length; i += 1) s = (s * 31 + id.charCodeAt(i)) % 9973;
    return (s / 9973 - 0.5) * 0.35;
  };
  const px = (p) => x(p.cn + jitter(p.id));
  const py = (p) => y(p.expr);
  const local = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return [e.clientX - r.left - M.left, e.clientY - r.top - M.top];
  };
  const onDown = (e) => {
    if (e.button !== 0) return;
    const [mx, my] = local(e);
    setDrag({ x0: mx, y0: my, x1: mx, y1: my, add: e.shiftKey || e.metaKey || e.ctrlKey });
  };
  const onMove = (e) => drag && setDrag((d) => ({ ...d, x1: local(e)[0], y1: local(e)[1] }));
  const onUp = () => {
    if (!drag) return;
    const [a, b] = [Math.min(drag.x0, drag.x1), Math.max(drag.x0, drag.x1)];
    const [c, d] = [Math.min(drag.y0, drag.y1), Math.max(drag.y0, drag.y1)];
    if (b - a > 4 && d - c > 4) onSelect(points.filter((p) => px(p) >= a && px(p) <= b && py(p) >= c && py(p) <= d).map((p) => p.id), drag.add);
    setDrag(null);
  };
  const p = correlationP(result.rho, points.length);
  const sig = Number.isFinite(p) && p < 0.05;
  // linear fit line (least squares on the raw points)
  const mx = d3.mean(points, (q) => q.cn);
  const my = d3.mean(points, (q) => q.expr);
  const slope = result.slope;
  const fit = Number.isFinite(slope) && points.length > 2 ? [[x.domain()[0], my + slope * (x.domain()[0] - mx)], [x.domain()[1], my + slope * (x.domain()[1] - mx)]] : null;
  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      onMouseDown={onDown}
      onMouseMove={onMove}
      onMouseUp={onUp}
      onMouseLeave={() => {
        setDrag(null);
        onHover(null);
      }}
      style={{ cursor: "crosshair", userSelect: "none", display: "block" }}
    >
      <rect x={0} y={0} width={width} height={height} fill={INK.panel} rx={6} />
      <text x={M.left} y={18} fontSize={16} fontWeight={600} fill={INK.text}>{gene}</text>
      {badge && (
        <text x={M.left + gene.length * 10 + 10} y={18} fontSize={TYPE.label} fill={badge.color}>{badge.text}</text>
      )}
      <text x={width - M.right} y={18} textAnchor="end" fontSize={TYPE.label} fill={sig ? "#cf1322" : "#8c8c8c"}>
        {Number.isFinite(result.rho) ? `ρ ${result.rho.toFixed(2)} · ${formatP(p)} · n ${points.length}` : `no variation to correlate · n ${points.length}`}
      </text>
      <g transform={`translate(${M.left},${M.top})`}>
        <rect x={0} y={0} width={w} height={h} fill={INK.panelAlt} />
        {x.ticks(5).map((v) => (
          <g key={`x${v}`} transform={`translate(${x(v)},0)`}>
            <line y1={0} y2={h} stroke={INK.grid} />
            <text y={h + 16} textAnchor="middle" fontSize={TYPE.label} fill={INK.textSecondary}>{v}</text>
          </g>
        ))}
        {y.ticks(4).map((v) => (
          <g key={`y${v}`} transform={`translate(0,${y(v)})`}>
            <line x1={0} x2={w} stroke={INK.grid} />
            <text x={-8} dy="0.35em" textAnchor="end" fontSize={TYPE.label} fill={INK.textSecondary}>{v}</text>
          </g>
        ))}
        <text x={w / 2} y={h + 40} textAnchor="middle" fontSize={TYPE.body} fill={INK.textSecondary}>{`copy number at ${gene} (per cell)`}</text>
        <text transform={`translate(${-48},${h / 2}) rotate(-90)`} textAnchor="middle" fontSize={TYPE.body} fill={INK.textSecondary}>{`${gene} expression (log-normalized)`}</text>
        {fit && <line x1={x(fit[0][0])} y1={y(Math.max(0, fit[0][1]))} x2={x(fit[1][0])} y2={y(Math.max(0, fit[1][1]))} stroke={INK.textSecondary} strokeDasharray="4 3" strokeOpacity={0.6} />}
        {points.map((pt) => {
          const clone = cloneOf.get(pt.id);
          const isSel = selected.has(pt.id);
          const isHov = hovered === pt.id;
          return (
            <circle
              key={pt.id}
              cx={px(pt)}
              cy={py(pt)}
              r={isHov ? 6 : isSel ? 4.6 : 3.2}
              fill={(clone != null && cloneColors[clone]) || NO_CLONE}
              fillOpacity={selected.size && !isSel ? 0.3 : 0.85}
              stroke={isSel || isHov ? "#000" : "#fff"}
              strokeWidth={isHov ? 2 : 0.6}
              onClick={(e) => {
                e.stopPropagation();
                onSelect([pt.id], e.shiftKey || e.metaKey || e.ctrlKey);
              }}
              onMouseEnter={() => onHover(pt.id)}
            >
              <title>{`${pt.id}\nCN ${pt.cn.toFixed(2)} · expression ${pt.expr.toFixed(2)}${clone != null ? ` · ${clone}` : ""}`}</title>
            </circle>
          );
        })}
        {drag && <rect x={Math.min(drag.x0, drag.x1)} y={Math.min(drag.y0, drag.y1)} width={Math.abs(drag.x1 - drag.x0)} height={Math.abs(drag.y1 - drag.y0)} fill="rgba(22,119,255,0.12)" stroke={INK.select} strokeDasharray="4 2" />}
      </g>
    </svg>
  );
}

/** Histogram of Spearman rho over the ranked genes. */
function RhoHistogram({ ranking, width, height = 150 }) {
  const Mm = { top: 10, right: 10, bottom: 34, left: 44 };
  const bins = d3.bin().domain([-1, 1]).thresholds(40)(ranking.map((r) => r.rho));
  const x = d3.scaleLinear().domain([-1, 1]).range([Mm.left, width - Mm.right]);
  const y = d3.scaleLinear().domain([0, d3.max(bins, (b) => b.length) || 1]).nice().range([height - Mm.bottom, Mm.top]);
  return (
    <svg width={width} height={height}>
      <YAxis scale={y} x0={Mm.left} x1={width - Mm.right} ticks={3} format={d3.format("~s")} />
      {bins.map((b, i) => (
        <rect key={i} x={x(b.x0) + 0.5} y={y(b.length)} width={Math.max(0, x(b.x1) - x(b.x0) - 1)} height={y(0) - y(b.length)} fill={b.x0 >= 0.3 ? "#D7191C" : b.x1 <= -0.3 ? "#2C7BB6" : "#bfbfbf"} />
      ))}
      {[-1, -0.5, 0, 0.5, 1].map((v) => (
        <text key={v} x={x(v)} y={height - Mm.bottom + 14} textAnchor="middle" fontSize={FONT.axis - 1} fill={INK.textSecondary}>{v}</text>
      ))}
      <text x={(Mm.left + width - Mm.right) / 2} y={height - 4} textAnchor="middle" fontSize={FONT.axis} fill={INK.text}>Spearman ρ (CN vs expression) per gene</text>
    </svg>
  );
}

/**
 * Dosage vs expression in the same cells. Card 1: one panel per gene
 * (defaults: this patient's copy-number drivers), selection shared with the
 * tree / heatmap / UMAP. Card 2: genome-wide ranking of dosage-sensitive
 * genes with BH q-values, the distribution of rho, and sensitivity per
 * chromosome.
 */
export default function DosagePanel({ summary, matrix, rowOfId }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const { cn, cells, cloneColors, selectedCellIds, hoveredCellId } = useSelector((s) => s.SingleCell);
  const events = useSelector((s) => s.FilteredEvents.filteredEvents);
  const genesState = useSelector((s) => s.Genes);
  const chromoBins = useSelector((s) => s.Settings.chromoBins);
  const [containerRef, width] = useContainerWidth(1100);
  const rankRef = useRef(null);
  // default genes: the patient's amplified / deleted tier 1-2 drivers, else common GBM genes
  const driverGenes = useMemo(() => {
    const cnEvents = (events || []).filter((e) => Number(e.Tier ?? 9) <= 2 && isStrongEvent(e) && ["amp", "homdel"].includes(eventClass(e)));
    const genes = [...new Set(cnEvents.sort((a, b) => Number(b.cell_fraction) - Number(a.cell_fraction)).map((e) => `${e.gene}`.split("::")[0]))];
    return genes.filter((g) => summary?.geneIndex.has(g));
  }, [events, summary]);
  const [genes, setGenes] = useState(null);
  const shownGenes = genes ?? (driverGenes.length ? driverGenes.slice(0, 6) : FALLBACK_GENES.filter((g) => summary?.geneIndex.has(g)).slice(0, 6));
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState([]);
  const [ranking, setRanking] = useState(null);
  const [progress, setProgress] = useState(null);
  const [cols, setCols] = useState("auto");

  const cloneOf = useMemo(() => new Map(cells.map((c) => [c.cell_id, c.clone_id])), [cells]);
  const selected = useMemo(() => new Set(selectedCellIds), [selectedCellIds]);
  const cnData = cn.status === "ok" ? cn.data : null;
  const eventOfGene = useMemo(() => {
    const m = new Map();
    (events || []).forEach((e) => {
      const cls = eventClass(e);
      if (!["amp", "homdel"].includes(cls)) return;
      const g = `${e.gene}`.split("::")[0];
      if (!m.has(g) || Number(e.cell_fraction) > Number(m.get(g).cell_fraction)) m.set(g, e);
    });
    return m;
  }, [events]);
  const results = useMemo(
    () =>
      shownGenes.map((gene) => {
        const locus = geneLocus(genesState, gene);
        const geneIndex = summary?.geneIndex.get(gene) ?? summary?.geneIndex.get(`${gene}`.toUpperCase());
        return { gene, result: locus && geneIndex != null ? dosagePoints({ cn: cnData, summary, matrix, rowOfId, locus, geneIndex }) : null };
      }),
    [shownGenes, genesState, summary, matrix, rowOfId, cnData]
  );
  const byChromosome = useMemo(() => (ranking ? dosageByChromosome(ranking, genesState, chromoBins) : []), [ranking, genesState, chromoBins]);

  const rank = async () => {
    setProgress(0);
    const rows = await dosageRanking({ cn: cnData, summary, matrix, rowOfId, genesState, onProgress: (f) => setProgress(Math.round(f * 100)) });
    setProgress(null);
    setRanking(rows);
  };
  const addGene = (g) => {
    const gene = `${g || ""}`.trim();
    if (!gene) return;
    setGenes([...shownGenes.filter((x) => x !== gene), gene].slice(-MAX_GENES));
    setQuery("");
  };
  const onSelect = (ids, add) => dispatch(singleCellActions.updateSelection(add ? [...new Set([...selectedCellIds, ...ids])] : ids));
  const onHover = (id) => dispatch(singleCellActions.updateHover(id));

  if (!summary || !cnData) return null;
  const nCols = cols === "auto" ? (width >= 1500 ? 3 : width >= 900 ? 2 : 1) : Number(cols);
  const plotW = Math.floor((width - 16 * (nCols - 1)) / nCols);
  const plotH = Math.max(280, Math.min(380, Math.round(plotW * 0.7)));
  const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "–");
  const pct = d3.format(".0%");
  const nSensitive = ranking ? ranking.filter((r) => r.rho >= 0.3 && r.q < 0.05).length : null;
  const columns = [
    { title: t("components.single-cell.results.gene"), dataIndex: "gene", key: "gene", width: 110, render: (g) => <Button type="link" size="small" style={{ padding: 0 }} onClick={() => addGene(g)}>{g}</Button> },
    { title: "ρ", dataIndex: "rho", key: "rho", width: 64, sorter: (a, b) => a.rho - b.rho, defaultSortOrder: "descend", render: (v) => fmt(v) },
    { title: "q", dataIndex: "q", key: "q", width: 72, sorter: (a, b) => (a.q ?? 1) - (b.q ?? 1), render: (v) => (Number.isFinite(v) ? (v < 1e-4 ? "<1e-4" : v.toFixed(3)) : "–") },
    { title: t("components.single-cell.dosage.slope"), dataIndex: "slope", key: "slope", width: 72, sorter: (a, b) => a.slope - b.slope, render: (v) => fmt(v) },
    { title: t("components.single-cell.dosage.mean-cn"), dataIndex: "meanCn", key: "cn", width: 84, sorter: (a, b) => a.meanCn - b.meanCn, render: (v) => fmt(v, 1) },
    { title: "n", dataIndex: "n", key: "n", width: 56 },
  ];
  const clonesShown = [...new Set(results.flatMap((r) => (r.result ? r.result.points.map((p) => cloneOf.get(p.id)) : [])))].filter((c) => c != null);

  return (
    <Row gutter={SC_GUTTER}>
      <Col span={24}>
        <Card
          size="small"
          title={<Space><DotChartOutlined />{t("components.single-cell.dosage.title")}<Provenance id="dosage" /></Space>}
          extra={
            <Space wrap>
              <AutoComplete size="small" style={{ width: 170 }} value={query} options={options} placeholder={t("components.single-cell.dosage.add-gene")} onChange={setQuery} onSelect={addGene} onSearch={(q) => setOptions(searchGeneNames(summary.genes, q).map((g) => ({ value: g })))} onKeyDown={(e) => e.key === "Enter" && addGene(query)} />
              {driverGenes.length > 0 && (
                <Button size="small" onClick={() => setGenes(driverGenes.slice(0, MAX_GENES))}>{t("components.single-cell.dosage.use-drivers", { count: Math.min(driverGenes.length, MAX_GENES) })}</Button>
              )}
              <Segmented size="small" value={cols} onChange={setCols} options={[{ value: "auto", label: "auto" }, { value: "1", label: "1" }, { value: "2", label: "2" }, { value: "3", label: "3" }]} />
              {selectedCellIds.length > 0 && (
                <Button size="small" type="text" onClick={() => dispatch(singleCellActions.updateSelection([]))}>{t("components.single-cell.selection.clear")}</Button>
              )}
              <SvgExportButton containerRef={containerRef} name="dosage" />
            </Space>
          }
        >
          <div ref={containerRef}>
            <Space size={[4, 4]} wrap style={{ marginBottom: 8 }}>
              {shownGenes.map((g) => {
                const ev = eventOfGene.get(g);
                return (
                  <Tag key={g} closable onClose={() => setGenes(shownGenes.filter((x) => x !== g))} color={ev ? (eventClass(ev) === "amp" ? "red" : "blue") : undefined}>
                    {g}{ev ? ` · ${eventClass(ev) === "amp" ? "amp" : "del"} ${pct(Number(ev.cell_fraction) || 0)}` : ""}
                  </Tag>
                );
              })}
              <HintLine text={t("components.single-cell.dosage.help")} />
            </Space>
            {!shownGenes.length ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.dosage.add-gene")} />
            ) : (
              <Row gutter={SC_GUTTER}>
                {results.map(({ gene, result }) => {
                  const ev = eventOfGene.get(gene);
                  return (
                    <Col key={gene} span={24 / nCols}>
                      {!result ? (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.dosage.no-gene", { gene })} />
                      ) : (
                        <div style={{ border: "1px solid var(--sc-border-soft)", borderRadius: 6 }}>
                          <DosageScatter gene={gene} result={result} width={plotW - 2} height={plotH} cloneOf={cloneOf} cloneColors={cloneColors} selected={selected} hovered={hoveredCellId} onSelect={onSelect} onHover={onHover} badge={ev ? { text: `${eventClass(ev) === "amp" ? "amplified" : "deleted"} in ${ev.cells}`, color: eventClass(ev) === "amp" ? "#D7191C" : "#2C7BB6" } : null} />
                        </div>
                      )}
                    </Col>
                  );
                })}
              </Row>
            )}
            <Space wrap size={[12, 2]} style={{ marginTop: 8, fontSize: 13 }}>
              {clonesShown.sort().map((c) => (
                <span key={c}><span className="sc-swatch" style={{ background: cloneColors[c] || NO_CLONE }} />{c}</span>
              ))}
              <Text type="secondary">{t("components.single-cell.dosage.legend-note")}</Text>
            </Space>
          </div>
        </Card>
      </Col>
      <Col span={24}>
        <Card
          size="small"
          title={<Space><OrderedListOutlined />{t("components.single-cell.dosage.rank-title")}<Provenance id="dosage" /></Space>}
          extra={
            <Space>
              <Button size="small" type="primary" onClick={rank} loading={progress != null} disabled={!matrix}>{t("components.single-cell.dosage.rank")}</Button>
              <SvgExportButton containerRef={rankRef} name="dosage-ranking" />
            </Space>
          }
        >
          <div ref={rankRef}>
            {progress != null && <Progress percent={progress} size="small" />}
            {!ranking ? (
              <Text type="secondary">{t("components.single-cell.dosage.rank-intro")}</Text>
            ) : (
              <Row gutter={SC_GUTTER_INNER}>
                <Col span={24}>
                  <Space size="large" wrap>
                    <Statistic title={t("components.single-cell.dosage.stat-genes")} value={ranking.length} />
                    <Statistic title={t("components.single-cell.dosage.stat-sensitive")} value={nSensitive} suffix={`(${pct(nSensitive / Math.max(1, ranking.length))})`} />
                    <Statistic title={t("components.single-cell.dosage.stat-median")} value={fmt(d3.median(ranking, (r) => r.rho))} />
                  </Space>
                </Col>
                <Col xs={24} xl={10}>
                  <Text strong>{t("components.single-cell.dosage.rank-help", { count: ranking.length })}</Text>
                  <Table size="small" rowKey="gene" columns={columns} dataSource={ranking} tableLayout="fixed" pagination={{ pageSize: 12, size: "small", showSizeChanger: false }} style={{ marginTop: 6 }} />
                </Col>
                <Col xs={24} xl={14}>
                  <Text strong>{t("components.single-cell.dosage.rho-dist")}</Text>
                  <RhoHistogram ranking={ranking} width={Math.max(320, Math.min(720, width * 0.55))} />
                  <Text strong style={{ display: "block", marginTop: 10 }}>{t("components.single-cell.dosage.by-chromosome")}</Text>
                  {(() => {
                    const w = Math.max(320, Math.min(720, width * 0.55));
                    const rowH = 14;
                    const x = d3.scaleLinear().domain([0, 1]).range([40, w - 110]);
                    return (
                      <svg width={w} height={byChromosome.length * rowH + 24}>
                        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
                          <g key={v} transform={`translate(${x(v)},0)`}>
                            <line y1={0} y2={byChromosome.length * rowH} stroke={INK.grid} />
                            <text y={byChromosome.length * rowH + 14} textAnchor="middle" fontSize={11} fill={INK.textSecondary}>{pct(v)}</text>
                          </g>
                        ))}
                        {byChromosome.map((c, i) => (
                          <g key={c.chromosome} transform={`translate(0,${i * rowH})`}>
                            <text x={32} y={rowH / 2} dy="0.35em" textAnchor="end" fontSize={11} fill={INK.text}>{c.chromosome}</text>
                            <rect x={x(0)} y={2} width={x(c.fracSensitive) - x(0)} height={rowH - 4} fill={c.medianRho >= 0.3 ? "#D7191C" : "#4E79A7"} />
                            <text x={w - 104} y={rowH / 2} dy="0.35em" fontSize={11} fill={INK.muted}>{`${pct(c.fracSensitive)} · median ρ ${c.medianRho.toFixed(2)} · n ${c.n}`}</text>
                            <title>{`chr${c.chromosome}: ${c.n} genes, median ρ ${c.medianRho.toFixed(2)}, ${pct(c.fracSensitive)} with ρ ≥ 0.3`}</title>
                          </g>
                        ))}
                      </svg>
                    );
                  })()}
                  <HintLine text={t("components.single-cell.dosage.by-chromosome-help")} />
                </Col>
              </Row>
            )}
          </div>
        </Card>
      </Col>
    </Row>
  );
}
