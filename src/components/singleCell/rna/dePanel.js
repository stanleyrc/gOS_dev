import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import axios from "axios";
import * as d3 from "d3";
import {
  Alert,
  Button,
  Card,
  Col,
  Input,
  InputNumber,
  Progress,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import { AiOutlineDownload } from "react-icons/ai";
import { ExperimentOutlined } from "@ant-design/icons";
import { Volcano, downloadTsv } from "../analysisResultsPanel";
import useContainerWidth from "../useContainerWidth";
import { useViolinGroups } from "./violinPanel";
import { geneValues } from "../../../helpers/singleCell/staticRna";
import { differentialExpression, overRepresentation, parseGmt } from "../../../helpers/singleCell/rnaStats";

const { Text } = Typography;
const COLOR_UP = "#C2185B";
const COLOR_DOWN = "#1F5FA8";
const fmtP = (p) => (p == null ? "" : p < 1e-3 ? p.toExponential(1) : p.toFixed(3));
const fmt = (v, d = 2) => (v == null ? "" : Number(v).toFixed(d));
const DE_COLUMNS = ["gene", "avg_log2FC", "pct_1", "pct_2", "p_val", "p_val_adj", "q_val"];

let setIndexPromise = null;
const geneSetIndex = () => {
  if (!setIndexPromise) {
    setIndexPromise = axios.get("genesets/index.json").then((r) => r.data);
    setIndexPromise.catch(() => (setIndexPromise = null));
  }
  return setIndexPromise;
};
const gmtCache = new Map();
const loadGmt = (file) => {
  if (!gmtCache.has(file)) {
    const p = axios.get(`genesets/${file}`, { responseType: "text", transformResponse: [(d) => d] }).then((r) => parseGmt(r.data));
    p.catch(() => gmtCache.delete(file));
    gmtCache.set(file, p);
  }
  return gmtCache.get(file);
};

/** Dot plot: genes x groups, dot size = % expressing, colour = mean expression scaled per gene. */
function DotPlot({ genes, groups, summary, matrix }) {
  const [ref, width] = useContainerWidth(900);
  const cell = 22;
  const left = 150;
  const top = 70;
  const data = useMemo(() => {
    return genes.map((gene) => {
      const g = summary.geneIndex.get(gene);
      const v = g == null ? null : geneValues(matrix, summary.cells.length, g);
      const stats = groups.map((grp) => {
        const vals = grp.rows.map((r) => (v ? v[r] : 0));
        return {
          mean: d3.mean(vals) || 0,
          pct: vals.filter((x) => x > 0).length / Math.max(1, vals.length),
        };
      });
      const max = d3.max(stats, (s) => s.mean) || 1;
      return { gene, stats: stats.map((s) => ({ ...s, scaled: s.mean / max })) };
    });
  }, [genes, groups, summary, matrix]);
  const color = d3.interpolateViridis;
  const plotWidth = Math.min(width, left + groups.length * cell + 20);
  const height = top + genes.length * cell + 10;
  return (
    <div ref={ref} style={{ overflowX: "auto" }}>
      <svg width={plotWidth} height={height} role="img" aria-label="Dot plot">
        {groups.map((g, j) => (
          <text key={g.key} transform={`translate(${left + j * cell + cell / 2} ${top - 6}) rotate(-45)`} fontSize="10" fill="#595959">
            {g.label.length > 18 ? `${g.label.slice(0, 17)}…` : g.label}
          </text>
        ))}
        {data.map((row, i) => (
          <g key={row.gene}>
            <text x={left - 6} y={top + i * cell + cell / 2 + 4} textAnchor="end" fontSize="11" fill="#262626">
              {row.gene}
            </text>
            {row.stats.map((s, j) => (
              <circle
                key={j}
                cx={left + j * cell + cell / 2}
                cy={top + i * cell + cell / 2}
                r={Math.max(1, Math.sqrt(s.pct) * (cell / 2 - 1))}
                fill={color(s.scaled)}
              >
                <title>{`${row.gene} · ${groups[j].label}: mean ${s.mean.toFixed(2)}, ${Math.round(s.pct * 100)}% expressing`}</title>
              </circle>
            ))}
          </g>
        ))}
      </svg>
    </div>
  );
}

/**
 * Two-group differential expression computed in the browser from the
 * patient's rna/ matrix (Seurat FindMarkers Wilcoxon defaults), with the
 * volcano, gene table, a dot plot of top genes across groups, and gene-set
 * over-representation of the up/down genes.
 */
export default function DePanel({ summary, matrix, rowsFor, onGene, selectedGene }) {
  const { t } = useTranslation("common");
  const groups = useSelector((state) => state.ScAnalysis.groups);
  const [minPct, setMinPct] = useState(0.01);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [query, setQuery] = useState("");
  const [dotGroupBy, setDotGroupBy] = useState("clone");
  const [nDot, setNDot] = useState(10);
  const [sets, setSets] = useState([]);
  const [setId, setSetId] = useState("hallmark");
  const [direction, setDirection] = useState("up");
  const [qCut, setQCut] = useState(0.05);
  const [lfcCut, setLfcCut] = useState(0.25);
  const [enrichment, setEnrichment] = useState(null);
  const [enrichError, setEnrichError] = useState(null);
  const dotGroups = useViolinGroups(summary, rowsFor, dotGroupBy);

  useEffect(() => {
    geneSetIndex().then(setSets).catch(() => setSets([]));
  }, []);

  const idsOf = (side) => groups[side]?.groups.flatMap((g) => g.cells) || [];
  const rowsA = rowsFor(idsOf("A"));
  const rowsB = rowsFor(idsOf("B"));
  const overlap = rowsA.filter((r) => rowsB.includes(r)).length;
  const ready = matrix && rowsA.length >= 3 && rowsB.length >= 3 && !overlap;

  const run = async () => {
    setProgress(0);
    setEnrichment(null);
    const labels = { A: groups.A.label, B: groups.B.label };
    const genes = await differentialExpression(matrix, summary.genes, summary.cells.length, rowsA, rowsB, {
      minPct,
      onProgress: (f) => setProgress(Math.round(f * 100)),
    });
    setProgress(null);
    setResult({ labels, nA: rowsA.length, nB: rowsB.length, genes });
  };

  const significant = (g) => g.q_val < qCut && Math.abs(g.avg_log2FC) >= lfcCut;
  const nSig = result ? result.genes.filter(significant).length : 0;
  const rows = useMemo(() => {
    if (!result) return [];
    const q = query.trim().toUpperCase();
    return result.genes.filter((g) => !q || g.gene.toUpperCase().includes(q));
  }, [result, query]);
  const dotGenes = useMemo(() => {
    if (!result) return [];
    const up = result.genes.filter((g) => g.avg_log2FC > 0).slice(0, nDot).map((g) => g.gene);
    const down = result.genes.filter((g) => g.avg_log2FC < 0).slice(0, nDot).map((g) => g.gene);
    return [...up, ...down];
  }, [result, nDot]);

  const enrich = async () => {
    setEnrichError(null);
    try {
      const entry = sets.find((s) => s.id === setId);
      const gmt = await loadGmt(entry.file);
      const pick = result.genes.filter(
        (g) => significant(g) && (direction === "both" || (direction === "up" ? g.avg_log2FC > 0 : g.avg_log2FC < 0))
      );
      const terms = overRepresentation(
        pick.map((g) => g.gene),
        result.genes.map((g) => g.gene),
        gmt
      );
      setEnrichment({ set: entry.title, nSelected: pick.length, universe: result.genes.length, terms });
    } catch (e) {
      setEnrichError(e.message || `${e}`);
    }
  };

  const columns = [
    {
      title: t("components.single-cell.results.gene"),
      dataIndex: "gene",
      key: "gene",
      render: (gene) => (
        <Button type="link" size="small" style={{ padding: 0 }} onClick={() => onGene(gene)}>
          {gene}
        </Button>
      ),
    },
    {
      title: "log2FC",
      dataIndex: "avg_log2FC",
      key: "lfc",
      sorter: (a, b) => a.avg_log2FC - b.avg_log2FC,
      render: (v) => <span style={{ color: v > 0 ? COLOR_UP : COLOR_DOWN }}>{fmt(v)}</span>,
    },
    { title: `% ${result?.labels.A || "A"}`, dataIndex: "pct_1", key: "p1", render: (v) => fmt(v * 100, 0) },
    { title: `% ${result?.labels.B || "B"}`, dataIndex: "pct_2", key: "p2", render: (v) => fmt(v * 100, 0) },
    { title: "p", dataIndex: "p_val", key: "p", sorter: (a, b) => a.p_val - b.p_val, render: fmtP },
    { title: t("components.single-cell.results.p-adj"), dataIndex: "p_val_adj", key: "padj", render: fmtP },
    { title: "q (BH)", dataIndex: "q_val", key: "q", render: fmtP },
  ];
  const termColumns = [
    { title: t("components.single-cell.results.term"), dataIndex: "term", key: "term" },
    { title: t("components.single-cell.results.overlap"), key: "ov", render: (_, r) => `${r.overlap} / ${r.size}` },
    { title: t("components.single-cell.results.expected"), dataIndex: "expected", key: "exp", render: (v) => fmt(v, 1) },
    { title: "p", dataIndex: "p_val", key: "p", render: fmtP },
    { title: "q (BH)", dataIndex: "q_val", key: "q", render: fmtP },
    {
      title: t("components.single-cell.results.genes"),
      dataIndex: "genes",
      key: "genes",
      render: (genes) => (
        <Space size={[2, 2]} wrap>
          {genes.slice(0, 12).map((g) => (
            <Tag key={g} style={{ cursor: "pointer" }} onClick={() => onGene(g)}>
              {g}
            </Tag>
          ))}
          {genes.length > 12 && <Text type="secondary">+{genes.length - 12}</Text>}
        </Space>
      ),
    },
  ];
  const categorical = summary.fields.filter((f) => !f.numeric);

  return (
    <Card
      size="small"
      title={<Space><ExperimentOutlined />{t("components.single-cell.rna.de-title")}</Space>}
      extra={
        <Space wrap>
          <Text type="secondary">{t("components.single-cell.rna.min-pct")}</Text>
          <InputNumber size="small" min={0} max={1} step={0.05} value={minPct} onChange={(v) => setMinPct(v ?? 0.01)} style={{ width: 80 }} />
          <Button type="primary" size="small" disabled={!ready || progress != null} onClick={run}>
            {t("components.single-cell.rna.run-de")}
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        {!groups.A || !groups.B ? (
          <Text type="secondary">{t("components.single-cell.rna.need-groups")}</Text>
        ) : overlap > 0 ? (
          <Alert type="warning" showIcon message={t("components.single-cell.rna.overlap", { count: overlap })} />
        ) : (
          <Text type="secondary">
            {t("components.single-cell.rna.ready", { a: groups.A.label, nA: rowsA.length, b: groups.B.label, nB: rowsB.length })}
          </Text>
        )}
        {progress != null && <Progress percent={progress} size="small" />}
        {result && (
          <>
            <Text>
              {t("components.single-cell.rna.de-summary", {
                a: result.labels.A,
                nA: result.nA,
                b: result.labels.B,
                nB: result.nB,
                tested: result.genes.length,
                sig: nSig,
                q: qCut,
                lfc: lfcCut,
              })}
            </Text>
            {(result.nA < 20 || result.nB < 20) && (
              <Alert type="info" showIcon message={t("components.single-cell.rna.exploratory")} />
            )}
            <Row gutter={[16, 16]}>
              <Col xs={24} xl={14}>
                <Volcano genes={result.genes} labels={result.labels} selectedGene={selectedGene} onGene={onGene} />
                <Space wrap style={{ margin: "8px 0" }}>
                  <Input.Search
                    allowClear
                    size="small"
                    placeholder={t("components.single-cell.results.filter")}
                    style={{ width: 200 }}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <Button
                    size="small"
                    icon={<AiOutlineDownload />}
                    onClick={() => downloadTsv(`de_${result.labels.A}_vs_${result.labels.B}.tsv`, DE_COLUMNS, result.genes)}
                  >
                    TSV
                  </Button>
                </Space>
                <Table
                  size="small"
                  rowKey="gene"
                  columns={columns}
                  dataSource={rows}
                  pagination={{ pageSize: 12, showSizeChanger: true }}
                  scroll={{ x: true }}
                />
              </Col>
              <Col xs={24} xl={10}>
                <Space wrap style={{ marginBottom: 8 }}>
                  <Text strong>{t("components.single-cell.rna.dot-title")}</Text>
                  <Select
                    size="small"
                    style={{ width: 170 }}
                    value={dotGroupBy}
                    onChange={setDotGroupBy}
                    options={[
                      { value: "groups", label: t("components.single-cell.rna.groups-ab") },
                      { value: "clone", label: t("components.single-cell.umap.color-clone") },
                      ...categorical.map((f) => ({ value: f.name, label: f.name })),
                    ]}
                  />
                  <Select
                    size="small"
                    style={{ width: 110 }}
                    value={nDot}
                    onChange={setNDot}
                    options={[5, 10, 15, 25].map((n) => ({ value: n, label: t("components.single-cell.rna.top-n", { n }) }))}
                  />
                </Space>
                <DotPlot genes={dotGenes} groups={dotGroups} summary={summary} matrix={matrix} />
              </Col>
            </Row>
            <Space wrap>
              <Text strong>{t("components.single-cell.rna.enrich-title")}</Text>
              <Select
                size="small"
                style={{ width: 190 }}
                value={setId}
                onChange={setSetId}
                options={sets.map((s) => ({ value: s.id, label: s.title }))}
              />
              <Select
                size="small"
                style={{ width: 200 }}
                value={direction}
                onChange={setDirection}
                options={[
                  { value: "up", label: t("components.single-cell.results.higher-in", { group: result.labels.A }) },
                  { value: "down", label: t("components.single-cell.results.higher-in", { group: result.labels.B }) },
                  { value: "both", label: t("components.single-cell.results.both") },
                ]}
              />
              <Text type="secondary">q &lt;</Text>
              <InputNumber size="small" min={0} max={1} step={0.01} value={qCut} onChange={(v) => setQCut(v ?? 0.05)} style={{ width: 75 }} />
              <Text type="secondary">|log2FC| ≥</Text>
              <InputNumber size="small" min={0} step={0.25} value={lfcCut} onChange={(v) => setLfcCut(v ?? 0)} style={{ width: 75 }} />
              <Button size="small" disabled={!sets.length} onClick={enrich}>
                {t("components.single-cell.compare.run")}
              </Button>
            </Space>
            {enrichError && <Alert type="warning" showIcon message={enrichError} />}
            {enrichment && (
              <>
                <Text type="secondary">
                  {t("components.single-cell.rna.enrich-summary", {
                    set: enrichment.set,
                    n: enrichment.nSelected,
                    universe: enrichment.universe,
                    sig: enrichment.terms.filter((r) => r.q_val < 0.05).length,
                  })}
                </Text>
                <Table
                  size="small"
                  rowKey="term"
                  columns={termColumns}
                  dataSource={enrichment.terms}
                  pagination={{ pageSize: 10 }}
                  scroll={{ x: true }}
                />
              </>
            )}
          </>
        )}
      </Space>
    </Card>
  );
}
