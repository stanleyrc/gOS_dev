import React, { useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { AutoComplete, Button, Card, Col, Empty, Progress, Row, Segmented, Space, Table, Tag, Typography } from "antd";
import { DotChartOutlined } from "@ant-design/icons";
import { dosageByChromosome, dosagePoints, dosageRanking, geneLocus } from "../../../helpers/singleCell/dosage";
import { correlationP, formatP } from "../../../helpers/singleCell/tests";
import { searchGeneNames } from "../../../helpers/singleCell/staticRna";
import singleCellActions from "../../../redux/singleCell/actions";
import useContainerWidth from "../useContainerWidth";
import SvgExportButton from "../svgExportButton";

const { Text } = Typography;
const M = { top: 14, right: 14, bottom: 52, left: 60 };
const NO_CLONE = "#8c8c8c";
const MAX_GENES = 12;
const DEFAULT_GENES = ["EGFR", "CDK4", "MDM2", "PDGFRA", "CDKN2A", "PTEN"];

/**
 * CN (x, jittered) vs expression (y) per cell for one gene, coloured by
 * clone. Click a point to select the cell; drag a rectangle to select the
 * cells inside it (Shift adds to the selection).
 */
function DosageScatter({ gene, result, width, height, cloneOf, cloneColors, selected, hovered, onSelect, onHover }) {
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
      style={{ cursor: "crosshair", userSelect: "none" }}
    >
      <text x={M.left} y={11} fontSize={14} fontWeight={600} fill="#262626">{gene}</text>
      <text x={width - M.right} y={11} textAnchor="end" fontSize={12} fill={Number.isFinite(p) && p < 0.05 ? "#cf1322" : "#8c8c8c"}>
        {`ρ ${Number.isFinite(result.rho) ? result.rho.toFixed(2) : "–"} · slope ${Number.isFinite(result.slope) ? result.slope.toFixed(2) : "–"} · n ${points.length} · ${formatP(p)}`}
      </text>
      <g transform={`translate(${M.left},${M.top})`}>
        {x.ticks(6).map((v) => (
          <g key={`x${v}`} transform={`translate(${x(v)},0)`}>
            <line y1={0} y2={h} stroke="#f0f0f0" />
            <text y={h + 16} textAnchor="middle" fontSize={11} fill="#595959">{v}</text>
          </g>
        ))}
        {y.ticks(5).map((v) => (
          <g key={`y${v}`} transform={`translate(0,${y(v)})`}>
            <line x1={0} x2={w} stroke="#f0f0f0" />
            <text x={-8} dy="0.35em" textAnchor="end" fontSize={11} fill="#595959">{v}</text>
          </g>
        ))}
        <text x={w / 2} y={h + 38} textAnchor="middle" fontSize={12} fill="#262626">{`DNA copy number at the ${gene} locus (per cell)`}</text>
        <text transform={`translate(${-44},${h / 2}) rotate(-90)`} textAnchor="middle" fontSize={12} fill="#262626">{`${gene} expression (log-normalized)`}</text>
        {points.map((pt) => {
          const clone = cloneOf.get(pt.id);
          const isSel = selected.has(pt.id);
          const isHov = hovered === pt.id;
          return (
            <circle
              key={pt.id}
              cx={px(pt)}
              cy={py(pt)}
              r={isHov ? 6 : isSel ? 4.8 : 3.4}
              fill={(clone != null && cloneColors[clone]) || NO_CLONE}
              fillOpacity={selected.size && !isSel ? 0.35 : 0.85}
              stroke={isSel || isHov ? "#000" : "none"}
              strokeWidth={isHov ? 2 : 1}
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
        {drag && (
          <rect x={Math.min(drag.x0, drag.x1)} y={Math.min(drag.y0, drag.y1)} width={Math.abs(drag.x1 - drag.x0)} height={Math.abs(drag.y1 - drag.y0)} fill="rgba(22,119,255,0.12)" stroke="#1677ff" strokeDasharray="4 2" />
        )}
      </g>
    </svg>
  );
}

/**
 * Dosage vs expression in the same cells, for several genes at once: CN at
 * each gene's locus (from the cells' genome graphs) against its expression,
 * with Spearman rho / slope / p, selection shared with the tree and UMAP,
 * and a genome-wide ranking of dosage-sensitive genes.
 */
export default function DosagePanel({ summary, matrix, rowOfId }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const { cn, cells, cloneColors, selectedCellIds, hoveredCellId } = useSelector((s) => s.SingleCell);
  const genesState = useSelector((s) => s.Genes);
  const chromoBins = useSelector((s) => s.Settings.chromoBins);
  const [containerRef, width] = useContainerWidth(1000);
  const [genes, setGenes] = useState(() => DEFAULT_GENES.filter((g) => summary?.geneIndex.has(g)).slice(0, 6));
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState([]);
  const [ranking, setRanking] = useState(null);
  const [progress, setProgress] = useState(null);
  const [cols, setCols] = useState("auto");

  const cloneOf = useMemo(() => new Map(cells.map((c) => [c.cell_id, c.clone_id])), [cells]);
  const selected = useMemo(() => new Set(selectedCellIds), [selectedCellIds]);
  const cnData = cn.status === "ok" ? cn.data : null;
  const results = useMemo(
    () =>
      genes.map((gene) => {
        const locus = geneLocus(genesState, gene);
        const geneIndex = summary?.geneIndex.get(gene) ?? summary?.geneIndex.get(`${gene}`.toUpperCase());
        return { gene, result: locus && geneIndex != null ? dosagePoints({ cn: cnData, summary, matrix, rowOfId, locus, geneIndex }) : null };
      }),
    [genes, genesState, summary, matrix, rowOfId, cnData]
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
    setGenes((cur) => [...cur.filter((x) => x !== gene), gene].slice(-MAX_GENES));
    setQuery("");
  };
  const onSelect = (ids, add) => dispatch(singleCellActions.updateSelection(add ? [...new Set([...selectedCellIds, ...ids])] : ids));
  const onHover = (id) => dispatch(singleCellActions.updateHover(id));

  if (!summary || !cnData) return null;
  const nCols = cols === "auto" ? (width >= 1500 ? 3 : width >= 900 ? 2 : 1) : Number(cols);
  const plotW = Math.floor((width - 16 * (nCols - 1)) / nCols) - 8;
  const plotH = Math.max(300, Math.min(440, Math.round(plotW * 0.72)));
  const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "–");
  const columns = [
    { title: t("components.single-cell.results.gene"), dataIndex: "gene", key: "gene", width: 110, render: (g) => <Button type="link" size="small" style={{ padding: 0 }} onClick={() => addGene(g)}>{g}</Button> },
    { title: "ρ", dataIndex: "rho", key: "rho", width: 64, sorter: (a, b) => a.rho - b.rho, defaultSortOrder: "descend", render: (v) => fmt(v) },
    { title: "q", dataIndex: "q", key: "q", width: 70, sorter: (a, b) => (a.q ?? 1) - (b.q ?? 1), render: (v) => (Number.isFinite(v) ? (v < 1e-4 ? "<1e-4" : v.toFixed(3)) : "–") },
    { title: t("components.single-cell.dosage.slope"), dataIndex: "slope", key: "slope", width: 72, sorter: (a, b) => a.slope - b.slope, render: (v) => fmt(v) },
    { title: t("components.single-cell.dosage.mean-cn"), dataIndex: "meanCn", key: "cn", width: 84, sorter: (a, b) => a.meanCn - b.meanCn, render: (v) => fmt(v, 1) },
    { title: "n", dataIndex: "n", key: "n", width: 56 },
  ];

  return (
    <Card
      size="small"
      title={<Space><DotChartOutlined />{t("components.single-cell.dosage.title")}</Space>}
      extra={
        <Space wrap>
          <AutoComplete
            size="small"
            style={{ width: 170 }}
            value={query}
            options={options}
            placeholder={t("components.single-cell.dosage.add-gene")}
            onChange={setQuery}
            onSelect={addGene}
            onSearch={(q) => setOptions(searchGeneNames(summary.genes, q).map((g) => ({ value: g })))}
            onKeyDown={(e) => e.key === "Enter" && addGene(query)}
          />
          <Segmented size="small" value={cols} onChange={setCols} options={[{ value: "auto", label: "auto" }, { value: "1", label: "1" }, { value: "2", label: "2" }, { value: "3", label: "3" }]} />
          <Button size="small" onClick={rank} loading={progress != null} disabled={!matrix}>
            {t("components.single-cell.dosage.rank")}
          </Button>
          {selectedCellIds.length > 0 && (
            <Button size="small" type="text" onClick={() => dispatch(singleCellActions.updateSelection([]))}>
              {t("components.single-cell.selection.clear")}
            </Button>
          )}
          <SvgExportButton containerRef={containerRef} name="dosage" />
        </Space>
      }
    >
      <div ref={containerRef}>
        <Space size={[4, 4]} wrap style={{ marginBottom: 8 }}>
          {genes.map((g) => (
            <Tag key={g} closable onClose={() => setGenes((cur) => cur.filter((x) => x !== g))}>
              {g}
            </Tag>
          ))}
          <Text type="secondary">{t("components.single-cell.dosage.help")}</Text>
        </Space>
        {!genes.length ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.dosage.add-gene")} />
        ) : (
          <Row gutter={[16, 16]}>
            {results.map(({ gene, result }) => (
              <Col key={gene} span={24 / nCols}>
                {!result ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.dosage.no-gene", { gene })} />
                ) : (
                  <DosageScatter gene={gene} result={result} width={plotW} height={plotH} cloneOf={cloneOf} cloneColors={cloneColors} selected={selected} hovered={hoveredCellId} onSelect={onSelect} onHover={onHover} />
                )}
              </Col>
            ))}
          </Row>
        )}
        <Row gutter={[24, 12]} style={{ marginTop: 16 }}>
          <Col xs={24} xl={12}>
            {progress != null && <Progress percent={progress} size="small" />}
            {ranking ? (
              <>
                <Text type="secondary">{t("components.single-cell.dosage.rank-help", { count: ranking.length })}</Text>
                <Table size="small" rowKey="gene" columns={columns} dataSource={ranking} tableLayout="fixed" style={{ maxWidth: 480 }} pagination={{ pageSize: 15, size: "small", showSizeChanger: false }} />
              </>
            ) : (
              <Text type="secondary">{t("components.single-cell.dosage.rank-intro")}</Text>
            )}
          </Col>
          <Col xs={24} xl={12}>
            {byChromosome.length > 0 && (
              <div>
                <Text strong>{t("components.single-cell.dosage.by-chromosome")}</Text>
                <svg width={Math.min(520, width / 2 - 24)} height={byChromosome.length * 16 + 20}>
                  {byChromosome.map((c, i) => {
                    const w = Math.min(460, width / 2 - 90);
                    return (
                      <g key={c.chromosome} transform={`translate(0,${i * 16 + 4})`}>
                        <text x={28} y={11} textAnchor="end" fontSize={11} fill="#262626">{c.chromosome}</text>
                        <rect x={34} y={2} width={w - 34} height={11} fill="#f0f0f0" />
                        <rect x={34} y={2} width={(w - 34) * c.fracSensitive} height={11} fill={c.medianRho >= 0.3 ? "#D7191C" : "#4E79A7"} />
                        <text x={w + 4} y={11} fontSize={10} fill="#8c8c8c">{`${Math.round(100 * c.fracSensitive)}% · n=${c.n}`}</text>
                        <title>{`chr${c.chromosome}: ${c.n} genes, median ρ ${c.medianRho.toFixed(2)}, ${Math.round(100 * c.fracSensitive)}% with ρ ≥ 0.3`}</title>
                      </g>
                    );
                  })}
                </svg>
                <div><Text type="secondary" style={{ fontSize: 12 }}>{t("components.single-cell.dosage.by-chromosome-help")}</Text></div>
              </div>
            )}
          </Col>
        </Row>
      </div>
    </Card>
  );
}
