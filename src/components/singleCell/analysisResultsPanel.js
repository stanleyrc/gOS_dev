import React, { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Alert, Button, Card, Input, Progress, Select, Space, Table, Tag, Typography } from "antd";
import { AiOutlineDownload } from "react-icons/ai";
import scaActions from "../../redux/scAnalysis/actions";
import genesActions from "../../redux/genes/actions";
import useContainerWidth from "./useContainerWidth";

const { Text } = Typography;
const SIG_Q = 0.05;
const SIG_LFC = 0.25;
const COLOR_UP = "#C2185B";
const COLOR_DOWN = "#1F5FA8";
const COLOR_NS = "#BDBDBD";

const fmtP = (p) => (p == null ? "" : p < 1e-3 ? p.toExponential(1) : p.toFixed(3));
const fmtNum = (v, digits = 2) => (v == null ? "" : Number(v).toFixed(digits));

function downloadTsv(filename, columns, rows) {
  const lines = [columns.join("\t")].concat(
    rows.map((r) => columns.map((c) => (Array.isArray(r[c]) ? r[c].join(",") : r[c] ?? "")).join("\t"))
  );
  const blob = new Blob([lines.join("\n")], { type: "text/tab-separated-values" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function Volcano({ genes, labels, selectedGene, onGene }) {
  const [ref, width] = useContainerWidth(700);
  const height = 320;
  const m = { top: 16, right: 16, bottom: 40, left: 52 };
  const points = useMemo(
    () =>
      genes.map((g) => ({
        gene: g.gene,
        x: g.avg_log2FC,
        y: -Math.log10(Math.max(g.p_val, 1e-300)),
        sig: g.q_val < SIG_Q && Math.abs(g.avg_log2FC) >= SIG_LFC,
      })),
    [genes]
  );
  const xMax = d3.max(points, (p) => Math.abs(p.x)) || 1;
  const yMax = d3.max(points, (p) => p.y) || 1;
  const x = d3.scaleLinear().domain([-xMax * 1.05, xMax * 1.05]).range([m.left, width - m.right]).nice();
  const y = d3.scaleLinear().domain([0, yMax * 1.08]).range([height - m.bottom, m.top]).nice();
  const labelled = useMemo(
    () => points.filter((p) => p.sig).sort((a, b) => b.y - a.y).slice(0, 12),
    [points]
  );
  const colour = (p) => (!p.sig ? COLOR_NS : p.x > 0 ? COLOR_UP : COLOR_DOWN);
  return (
    <div ref={ref} style={{ width: "100%" }}>
      <svg width={width} height={height} role="img" aria-label="Volcano plot">
        {x.ticks(7).map((tk) => (
          <g key={`x${tk}`}>
            <line x1={x(tk)} x2={x(tk)} y1={m.top} y2={height - m.bottom} stroke="#f0f0f0" />
            <text x={x(tk)} y={height - m.bottom + 16} textAnchor="middle" fontSize="11" fill="#8c8c8c">
              {tk}
            </text>
          </g>
        ))}
        {y.ticks(5).map((tk) => (
          <g key={`y${tk}`}>
            <line x1={m.left} x2={width - m.right} y1={y(tk)} y2={y(tk)} stroke="#f0f0f0" />
            <text x={m.left - 8} y={y(tk) + 4} textAnchor="end" fontSize="11" fill="#8c8c8c">
              {tk}
            </text>
          </g>
        ))}
        <line x1={x(0)} x2={x(0)} y1={m.top} y2={height - m.bottom} stroke="#bfbfbf" />
        <text x={(m.left + width - m.right) / 2} y={height - 6} textAnchor="middle" fontSize="12" fill="#595959">
          {`log2 fold change  (← higher in ${labels?.B || "B"} · higher in ${labels?.A || "A"} →)`}
        </text>
        <text transform={`translate(14 ${(m.top + height - m.bottom) / 2}) rotate(-90)`} textAnchor="middle" fontSize="12" fill="#595959">
          −log10 p
        </text>
        {points.map((p) => (
          <circle
            key={p.gene}
            cx={x(p.x)}
            cy={y(p.y)}
            r={p.gene === selectedGene ? 5 : p.sig ? 3 : 2}
            fill={colour(p)}
            fillOpacity={p.sig ? 0.85 : 0.5}
            stroke={p.gene === selectedGene ? "#262626" : "none"}
            style={{ cursor: "pointer" }}
            onClick={() => onGene(p.gene)}
          >
            <title>{`${p.gene}: log2FC ${p.x.toFixed(2)}`}</title>
          </circle>
        ))}
        {labelled.map((p) => (
          <text
            key={`l${p.gene}`}
            x={x(p.x) + (p.x > 0 ? 6 : -6)}
            y={y(p.y) + 4}
            textAnchor={p.x > 0 ? "start" : "end"}
            fontSize="11"
            fill="#262626"
            style={{ cursor: "pointer" }}
            onClick={() => onGene(p.gene)}
          >
            {p.gene}
          </text>
        ))}
      </svg>
    </div>
  );
}

function DeResult({ job, result, onGene, selectedGene }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const { catalogue, geneSets } = useSelector((state) => state.ScAnalysis);
  const [query, setQuery] = useState("");
  const [geneSet, setGeneSet] = useState(geneSets[0] || null);
  const [direction, setDirection] = useState("up");
  const canEnrich = catalogue.some((a) => a.id === "enrichment_ora") && geneSets.length > 0;
  const labels = result.labels || job.labels || {};
  const s = result.summary || {};
  const rows = useMemo(() => {
    const q = query.trim().toUpperCase();
    return (result.genes || []).filter((g) => !q || g.gene.toUpperCase().includes(q));
  }, [result, query]);

  const columns = [
    {
      title: t("components.single-cell.results.gene"),
      dataIndex: "gene",
      key: "gene",
      fixed: "left",
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
      render: (v) => <span style={{ color: v > 0 ? COLOR_UP : COLOR_DOWN }}>{fmtNum(v)}</span>,
    },
    ...(result.columns?.includes("pct_1")
      ? [
          { title: `% ${labels.A || "A"}`, dataIndex: "pct_1", key: "p1", render: (v) => fmtNum(v * 100, 0) },
          { title: `% ${labels.B || "B"}`, dataIndex: "pct_2", key: "p2", render: (v) => fmtNum(v * 100, 0) },
        ]
      : []),
    { title: "p", dataIndex: "p_val", key: "p", sorter: (a, b) => a.p_val - b.p_val, render: fmtP },
    { title: t("components.single-cell.results.p-adj"), dataIndex: "p_val_adj", key: "padj", render: fmtP },
    { title: "q (BH)", dataIndex: "q_val", key: "q", render: fmtP },
  ];

  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Text>
        {t("components.single-cell.results.de-summary", {
          a: labels.A || "A",
          nA: s.n_a,
          b: labels.B || "B",
          nB: s.n_b,
          tested: s.n_tested,
          sig: s.n_significant,
        })}
        {s.method ? ` · ${s.method}` : ""}
      </Text>
      {(s.warnings || []).map((w) => (
        <Alert key={w} type="warning" showIcon message={w} />
      ))}
      <Volcano genes={result.genes || []} labels={labels} selectedGene={selectedGene} onGene={onGene} />
      <Space wrap>
        <Input.Search
          allowClear
          size="small"
          placeholder={t("components.single-cell.results.filter")}
          style={{ width: 220 }}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button
          size="small"
          icon={<AiOutlineDownload />}
          onClick={() => downloadTsv(`de_${job.id}.tsv`, result.columns || [], result.genes || [])}
        >
          TSV
        </Button>
        {canEnrich && (
          <>
            <Text type="secondary">{t("components.single-cell.results.enrich")}</Text>
            <Select size="small" style={{ width: 160 }} value={geneSet} onChange={setGeneSet}
              options={geneSets.map((g) => ({ value: g, label: g }))} />
            <Select size="small" style={{ width: 170 }} value={direction} onChange={setDirection}
              options={[
                { value: "up", label: t("components.single-cell.results.higher-in", { group: labels.A || "A" }) },
                { value: "down", label: t("components.single-cell.results.higher-in", { group: labels.B || "B" }) },
                { value: "both", label: t("components.single-cell.results.both") },
              ]} />
            <Button size="small" disabled={!geneSet}
              onClick={() => dispatch(scaActions.submitJob("enrichment_ora", { gene_set: geneSet, direction }, job.id))}>
              {t("components.single-cell.compare.run")}
            </Button>
          </>
        )}
      </Space>
      <Table size="small" rowKey="gene" columns={columns} dataSource={rows}
        pagination={{ pageSize: 15, showSizeChanger: true }} scroll={{ x: true }} />
    </Space>
  );
}

function EnrichmentResult({ job, result, onGene }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const s = result.summary || {};
  const columns = [
    { title: t("components.single-cell.results.term"), dataIndex: "term", key: "term" },
    { title: t("components.single-cell.results.overlap"), key: "overlap", render: (_, r) => `${r.overlap} / ${r.size}` },
    { title: t("components.single-cell.results.expected"), dataIndex: "expected", key: "exp", render: (v) => fmtNum(v, 1) },
    { title: "p", dataIndex: "p_val", key: "p", render: fmtP },
    { title: "q (BH)", dataIndex: "q_val", key: "q", render: fmtP },
    {
      title: t("components.single-cell.results.genes"),
      dataIndex: "genes",
      key: "genes",
      render: (genes) => (
        <Space size={[2, 2]} wrap>
          {genes.slice(0, 15).map((g) => (
            <Tag key={g} style={{ cursor: "pointer" }} onClick={() => onGene(g)}>{g}</Tag>
          ))}
          {genes.length > 15 && <Text type="secondary">+{genes.length - 15}</Text>}
        </Space>
      ),
    },
  ];
  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Text>
        {t("components.single-cell.results.enrich-summary", {
          set: s.gene_set, n: s.n_selected, universe: s.n_universe, sig: s.n_significant,
        })}
        {" "}
        <Button type="link" size="small" onClick={() => dispatch(scaActions.selectJob(s.source_job))}>
          {t("components.single-cell.results.back-to-de")}
        </Button>
      </Text>
      {(s.warnings || []).map((w) => <Alert key={w} type="warning" showIcon message={w} />)}
      <Button size="small" icon={<AiOutlineDownload />} style={{ width: "fit-content" }}
        onClick={() => downloadTsv(`enrichment_${job.id}.tsv`, result.columns || [], result.terms || [])}>
        TSV
      </Button>
      <Table size="small" rowKey="term" columns={columns} dataSource={result.terms || []}
        pagination={{ pageSize: 15 }} scroll={{ x: true }} />
    </Space>
  );
}

/** Shows the selected analysis: progress while it runs, then its result. */
export default function AnalysisResultsPanel() {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const sca = useSelector((state) => state.ScAnalysis);
  const geneOptions = useSelector((state) => state.Genes.optionsList);
  const job = sca.activeJobId ? sca.jobs[sca.activeJobId] : null;
  if (!job) return null;
  const result = sca.results[job.id];

  // A gene click shows its expression beside the tree and moves the genome view to it.
  const onGene = (gene) => {
    dispatch(scaActions.fetchExpression(gene));
    const hit = (geneOptions || []).find((o) => `${o.label}`.toUpperCase() === gene.toUpperCase());
    if (hit) dispatch(genesActions.locateGenes([hit.value]));
  };

  let body;
  if (job.state === "failed") {
    body = <Alert type="error" showIcon message={t("components.single-cell.results.failed")} description={job.message} />;
  } else if (job.state !== "done") {
    body = (
      <Space direction="vertical">
        <Progress percent={Math.round((job.progress || 0) * 100)} style={{ width: 320 }} />
        <Text type="secondary">{job.message}</Text>
      </Space>
    );
  } else if (sca.resultErrors[job.id]) {
    body = <Alert type="error" showIcon message={sca.resultErrors[job.id]} />;
  } else if (!result) {
    body = <Card loading bordered={false} />;
  } else if (result.type === "enrichment") {
    body = <EnrichmentResult job={job} result={result} onGene={onGene} />;
  } else {
    body = <DeResult job={job} result={result} onGene={onGene} selectedGene={sca.expression.gene} />;
  }

  return (
    <Card size="small" title={job.title || job.request?.analysis}>
      {body}
    </Card>
  );
}
