import React, { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { AutoComplete, Button, Card, Col, Empty, Progress, Row, Space, Table, Typography } from "antd";
import { DotChartOutlined } from "@ant-design/icons";
import { dosagePoints, dosageRanking, geneLocus } from "../../../helpers/singleCell/dosage";
import { correlationP, formatP } from "../../../helpers/singleCell/tests";
import { searchGeneNames } from "../../../helpers/singleCell/staticRna";
import singleCellActions from "../../../redux/singleCell/actions";
import useContainerWidth from "../useContainerWidth";

const { Text } = Typography;
const HEIGHT = 480;
const M = { top: 12, right: 12, bottom: 36, left: 46 };
const NO_CLONE = "#8c8c8c";

/** CN (x, jittered) vs expression (y) per cell, coloured by clone. */
function DosageScatter({ points, width, cloneOf, cloneColors, onCell, selected }) {
  const w = width - M.left - M.right;
  const h = HEIGHT - M.top - M.bottom;
  const x = d3.scaleLinear().domain([0, Math.max(4, d3.max(points, (p) => p.cn) || 4)]).nice().range([0, w]);
  const y = d3.scaleLinear().domain([0, Math.max(0.5, d3.max(points, (p) => p.expr) || 0.5)]).nice().range([h, 0]);
  const jitter = (id) => {
    let s = 0;
    for (let i = 0; i < id.length; i += 1) s = (s * 31 + id.charCodeAt(i)) % 9973;
    return ((s / 9973) - 0.5) * 0.35;
  };
  return (
    <svg width={width} height={HEIGHT}>
      <g transform={`translate(${M.left},${M.top})`}>
        {x.ticks(6).map((v) => (
          <g key={`x${v}`} transform={`translate(${x(v)},0)`}>
            <line y1={0} y2={h} stroke="#f0f0f0" />
            <text y={h + 14} textAnchor="middle" fontSize={10}>{v}</text>
          </g>
        ))}
        {y.ticks(5).map((v) => (
          <g key={`y${v}`} transform={`translate(0,${y(v)})`}>
            <line x1={0} x2={w} stroke="#f0f0f0" />
            <text x={-6} dy="0.35em" textAnchor="end" fontSize={10}>{v}</text>
          </g>
        ))}
        <text x={w / 2} y={h + 30} textAnchor="middle" fontSize={11}>copy number at locus</text>
        <text transform={`translate(${-34},${h / 2}) rotate(-90)`} textAnchor="middle" fontSize={11}>expression (log-normalized)</text>
        {points.map((p) => {
          const clone = cloneOf.get(p.id);
          const isSel = selected.has(p.id);
          return (
            <circle
              key={p.id}
              cx={x(p.cn + jitter(p.id))}
              cy={y(p.expr)}
              r={isSel ? 4.5 : 3.2}
              fill={(clone != null && cloneColors[clone]) || NO_CLONE}
              fillOpacity={0.8}
              stroke={isSel ? "#000" : "none"}
              style={{ cursor: "pointer" }}
              onClick={() => onCell(p.id)}
            >
              <title>{`${p.id}\nCN ${p.cn.toFixed(2)} · expression ${p.expr.toFixed(2)}${clone != null ? ` · ${clone}` : ""}`}</title>
            </circle>
          );
        })}
      </g>
    </svg>
  );
}

/**
 * Dosage vs expression in the same cells: CN at a gene's locus (from each
 * cell's genome graph) against its expression, with Spearman rho and slope,
 * and a genome-wide ranking of dosage-sensitive genes.
 */
export default function DosagePanel({ summary, matrix, rowOfId }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const { cn, cells, cloneColors, selectedCellIds } = useSelector((s) => s.SingleCell);
  const genesState = useSelector((s) => s.Genes);
  const [containerRef, width] = useContainerWidth(700);
  const [gene, setGene] = useState("EGFR");
  const [options, setOptions] = useState([]);
  const [ranking, setRanking] = useState(null);
  const [progress, setProgress] = useState(null);

  const cloneOf = useMemo(() => new Map(cells.map((c) => [c.cell_id, c.clone_id])), [cells]);
  const selected = useMemo(() => new Set(selectedCellIds), [selectedCellIds]);
  const cnData = cn.status === "ok" ? cn.data : null;
  const locus = useMemo(() => geneLocus(genesState, gene), [genesState, gene]);
  const geneIndex = summary?.geneIndex.get(gene) ?? summary?.geneIndex.get(`${gene}`.toUpperCase());
  const result = useMemo(
    () => dosagePoints({ cn: cnData, summary, matrix, rowOfId, locus, geneIndex }),
    [cnData, summary, matrix, rowOfId, locus, geneIndex]
  );

  const rank = async () => {
    setProgress(0);
    const rows = await dosageRanking({ cn: cnData, summary, matrix, rowOfId, genesState, onProgress: (f) => setProgress(Math.round(f * 100)) });
    setProgress(null);
    setRanking(rows);
  };

  if (!summary || !cnData) return null;
  // xl: plot column is 15/24 of the card
  const plotWidth = Math.max(320, (width >= 1200 ? (width * 15) / 24 : width) - 24);
  const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "–");
  const columns = [
    {
      title: t("components.single-cell.results.gene"),
      dataIndex: "gene",
      key: "gene",
      width: 110,
      render: (g) => (
        <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setGene(g)}>
          {g}
        </Button>
      ),
    },
    { title: "ρ", dataIndex: "rho", key: "rho", width: 64, sorter: (a, b) => a.rho - b.rho, defaultSortOrder: "descend", render: (v) => fmt(v) },
    { title: "q", dataIndex: "q", key: "q", width: 70, sorter: (a, b) => (a.q ?? 1) - (b.q ?? 1), render: (v) => (Number.isFinite(v) ? (v < 1e-4 ? "<1e-4" : v.toFixed(3)) : "–") },
    { title: t("components.single-cell.dosage.slope"), dataIndex: "slope", key: "slope", width: 72, sorter: (a, b) => a.slope - b.slope, render: (v) => fmt(v) },
    { title: t("components.single-cell.dosage.mean-cn"), dataIndex: "meanCn", key: "cn", width: 84, sorter: (a, b) => a.meanCn - b.meanCn, render: (v) => fmt(v, 1) },
    { title: "n", dataIndex: "n", key: "n", width: 56 },
  ];

  return (
    <Card
      size="small"
      title={
        <Space>
          <DotChartOutlined />
          {t("components.single-cell.dosage.title")}
        </Space>
      }
      extra={
        <Space>
          <AutoComplete
            size="small"
            style={{ width: 150 }}
            value={gene}
            options={options}
            onChange={setGene}
            onSearch={(q) => setOptions(searchGeneNames(summary.genes, q).map((g) => ({ value: g })))}
          />
          <Button size="small" onClick={rank} loading={progress != null} disabled={!matrix}>
            {t("components.single-cell.dosage.rank")}
          </Button>
        </Space>
      }
    >
      <div ref={containerRef}>
        <Row gutter={[24, 12]}>
          <Col xs={24} xl={15}>
            {!locus || geneIndex == null ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.dosage.no-gene", { gene })} />
            ) : (
              <>
                <Text type="secondary">
                  {t("components.single-cell.dosage.summary", {
                    gene: locus.gene,
                    n: result.points.length,
                    rho: fmt(result.rho),
                    slope: fmt(result.slope),
                  })}
                  {` · ${formatP(correlationP(result.rho, result.points.length))}`}
                </Text>
                <DosageScatter
                  points={result.points}
                  width={plotWidth}
                  cloneOf={cloneOf}
                  cloneColors={cloneColors}
                  selected={selected}
                  onCell={(id) => dispatch(singleCellActions.updateSelection([id]))}
                />
              </>
            )}
          </Col>
          <Col xs={24} xl={9}>
            {progress != null && <Progress percent={progress} size="small" />}
            {ranking ? (
              <>
                <Text type="secondary">{t("components.single-cell.dosage.rank-help", { count: ranking.length })}</Text>
                <Table size="small" rowKey="gene" columns={columns} dataSource={ranking} tableLayout="fixed" style={{ maxWidth: 420 }} pagination={{ pageSize: 15, size: "small", showSizeChanger: false }} />
              </>
            ) : (
              <Text type="secondary">{t("components.single-cell.dosage.rank-intro")}</Text>
            )}
          </Col>
        </Row>
      </div>
    </Card>
  );
}
