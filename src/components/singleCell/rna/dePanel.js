import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Input,
  InputNumber,
  Progress,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { AiOutlineDownload } from "react-icons/ai";
import { ExperimentOutlined } from "@ant-design/icons";
import { downloadTsv } from "../analysisResultsPanel";
import scaActions from "../../../redux/scAnalysis/actions";
import singleCellActions from "../../../redux/singleCell/actions";
import settingsActions from "../../../redux/settings/actions";
import VolcanoPlot, { COLOR_DOWN, COLOR_UP } from "./volcanoPlot";
import GeneInfoCard from "./geneInfoCard";
import { geneSetIndex, loadGmt } from "./geneSets";
import useContainerWidth from "../useContainerWidth";
import { useViolinGroups } from "./violinPanel";
import useGeneHeritability from "./useHeritability";
import { geneValues } from "../../../helpers/singleCell/staticRna";
import { binAt } from "../../../helpers/singleCell/matrix";
import { differentialExpression, overRepresentation } from "../../../helpers/singleCell/rnaStats";
import { SC_GUTTER_INNER } from "../density";
import { INK, TYPE } from "../../../helpers/singleCell/plotTheme";
import { Provenance } from "../hintLine";
import { fieldLabel } from "../../../helpers/singleCell/fieldLabels";

const { Text } = Typography;
const fmtP = (p) => (p == null ? "" : p < 1e-3 ? p.toExponential(1) : p.toFixed(3));
const fmt = (v, d = 2) => (v == null ? "" : Number(v).toFixed(d));
const DE_COLUMNS = ["gene", "avg_log2FC", "pct_1", "pct_2", "cn_1", "cn_2", "p_val", "p_val_adj", "q_val"];


/** Dot plot: genes x groups, dot size = % expressing, colour = mean expression scaled per gene. */
function DotPlot({ genes, groups, summary, matrix, onGene, selectedGene }) {
  const [ref, width] = useContainerWidth(900);
  const cell = 26;
  const left = 110;
  const top = 96;
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
  // Seurat DotPlot's default: light grey (low) to blue (high).
  const color = d3.interpolateRgb("#E3E3E3", "#1F4E99");
  const legendX = left + groups.length * cell + 24;
  const plotWidth = Math.max(Math.min(width, legendX + 150), legendX + 150);
  const height = Math.max(top + genes.length * cell + 10, top + 170);
  return (
    <div ref={ref} style={{ overflowX: "auto" }}>
      <svg width={plotWidth} height={height} role="img" aria-label="Dot plot">
        {groups.map((g, j) => (
          <text key={g.key} transform={`translate(${left + j * cell + cell / 2} ${top - 6}) rotate(-45)`} fontSize={11} fill={INK.textSecondary}>
            {g.label.length > 18 ? `${g.label.slice(0, 17)}…` : g.label}
          </text>
        ))}
        {data.map((row, i) => (
          <g key={row.gene}>
            <text
              x={left - 6}
              y={top + i * cell + cell / 2 + 4}
              textAnchor="end"
              fontSize={TYPE.tick}
              fontWeight={row.gene === selectedGene ? 700 : 400}
              fill={INK.text}
              style={{ cursor: onGene ? "pointer" : "default" }}
              onClick={() => onGene?.(row.gene)}
            >
              <title>{`${row.gene}: click for what it does and its role in GBM`}</title>
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
        {/* legends: dot size = % expressing, colour = mean scaled per gene */}
        <g transform={`translate(${legendX} ${top})`}>
          <text fontSize={TYPE.tick} fill={INK.textSecondary} fontWeight="600">% expressing</text>
          {[0.25, 0.5, 1].map((f, k) => (
            <g key={f} transform={`translate(${12 + k * 34} 22)`}>
              <circle r={Math.sqrt(f) * (cell / 2 - 1)} fill={INK.faint} />
              <text y={24} textAnchor="middle" fontSize={11} fill={INK.muted}>{`${f * 100}%`}</text>
            </g>
          ))}
          <text y={78} fontSize={TYPE.tick} fill={INK.textSecondary} fontWeight="600">mean (scaled)</text>
          <defs>
            <linearGradient id="dotplot-ramp" x1="0" x2="1">
              {[0, 0.25, 0.5, 0.75, 1].map((f) => (
                <stop key={f} offset={f} stopColor={color(f)} />
              ))}
            </linearGradient>
          </defs>
          <rect y={86} width={110} height={10} fill="url(#dotplot-ramp)" rx={2} />
          <text y={110} fontSize={11} fill={INK.muted}>0</text>
          <text x={110} y={110} fontSize={11} fill={INK.muted} textAnchor="end">max</text>
        </g>
      </svg>
    </div>
  );
}

/** Horizontal bars of -log10 q for the top enriched sets. */
function EnrichmentBars({ terms, onTerm }) {
  const [ref, width] = useContainerWidth(700);
  const top = terms.slice(0, 12);
  const labelW = Math.min(360, Math.max(180, width * 0.45));
  const barW = Math.max(120, width - labelW - 70);
  const max = d3.max(top, (r) => -Math.log10(Math.max(r.q_val, 1e-300))) || 1;
  const x = d3.scaleLinear().domain([0, max]).range([0, barW]).nice();
  const rowH = 22;
  return (
    <div ref={ref}>
      <svg width={width} height={top.length * rowH + 30} role="img" aria-label="Enrichment bars">
        {top.map((r, i) => {
          const v = -Math.log10(Math.max(r.q_val, 1e-300));
          return (
            <g key={r.term} transform={`translate(0 ${i * rowH})`} style={{ cursor: "pointer" }} onClick={() => onTerm(r)}>
              <text x={labelW - 8} y={rowH / 2 + 4} textAnchor="end" fontSize={TYPE.tick} fill={INK.text}>
                {r.term.replace(/^HALLMARK_|^REACTOME_|^GOBP_/, "").replace(/_/g, " ").toLowerCase().slice(0, 52)}
              </text>
              <rect x={labelW} y={4} width={Math.max(1, x(v))} height={rowH - 8} rx={2} fill={r.q_val < 0.05 ? "#722ED1" : "#D3ADF7"} />
              <text x={labelW + x(v) + 6} y={rowH / 2 + 4} fontSize={11} fill={INK.muted}>
                {`${r.overlap}/${r.size}`}
              </text>
            </g>
          );
        })}
        <line x1={labelW + x(-Math.log10(0.05))} x2={labelW + x(-Math.log10(0.05))} y1={0} y2={top.length * rowH} stroke={INK.axis} strokeDasharray="4 4" />
        <text x={labelW + barW / 2} y={top.length * rowH + 22} textAnchor="middle" fontSize={TYPE.tick} fill={INK.textSecondary}>
          −log10 q (dashed: q = 0.05)
        </text>
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

/**
 * Differential expression across several groups (clones, or the levels of
 * any cell metadata field): each group against the rest of the chosen groups
 * (as Seurat FindAllMarkers) and/or every pair of groups (FindMarkers per
 * pair). Results are listed per comparison; "View" opens one in the volcano,
 * table and enrichment views below, and a dot plot shows each group's top
 * markers.
 */
function MultiGroupDe({ summary, matrix, rowsFor, minPct, significant, onView, viewing }) {
  const { t } = useTranslation("common");
  const categorical = summary.fields.filter((f) => !f.numeric);
  const [field, setField] = useState("clone");
  const groups = useViolinGroups(summary, rowsFor, field);
  const usable = groups.filter((g) => g.rows.length >= 3);
  const [chosen, setChosen] = useState(null); // null = every group with >= 3 cells
  const [modes, setModes] = useState(["rest", "pairs"]);
  const [progress, setProgress] = useState(null);
  const [results, setResults] = useState([]);
  const [nMarkers, setNMarkers] = useState(5);
  useEffect(() => {
    setChosen(null);
    setResults([]);
  }, [field]);
  const picked = usable.filter((g) => !chosen || chosen.includes(g.key));
  const nComparisons =
    (modes.includes("rest") && picked.length >= 2 ? picked.length : 0) +
    (modes.includes("pairs") ? (picked.length * (picked.length - 1)) / 2 : 0);

  const run = async () => {
    const comparisons = [];
    if (modes.includes("rest")) {
      picked.forEach((g) => {
        const rest = picked.filter((h) => h !== g).flatMap((h) => h.rows);
        comparisons.push({ type: "rest", key: `${g.key} vs rest`, A: g, B: { label: "rest", rows: rest } });
      });
    }
    if (modes.includes("pairs")) {
      picked.forEach((g, i) =>
        picked.slice(i + 1).forEach((h) => comparisons.push({ type: "pair", key: `${g.key} vs ${h.key}`, A: g, B: h }))
      );
    }
    const out = [];
    setProgress(0);
    for (let k = 0; k < comparisons.length; k += 1) {
      const c = comparisons[k];
      // eslint-disable-next-line no-await-in-loop
      const genes = await differentialExpression(matrix, summary.genes, summary.cells.length, c.A.rows, c.B.rows, {
        minPct,
        onProgress: (f) => setProgress(Math.round((100 * (k + f)) / comparisons.length)),
      });
      out.push({
        key: c.key,
        type: c.type,
        group: c.A.key,
        labels: { A: c.A.label, B: c.B.label },
        nA: c.A.rows.length,
        nB: c.B.rows.length,
        genes,
        multi: true,
      });
    }
    setProgress(null);
    setResults(out);
  };

  const markerGenes = useMemo(() => {
    const seen = new Set();
    results
      .filter((r) => r.type === "rest")
      .forEach((r) =>
        r.genes
          .filter((g) => g.avg_log2FC > 0 && significant(g))
          .slice(0, nMarkers)
          .forEach((g) => seen.add(g.gene))
      );
    return [...seen];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, nMarkers, significant]);

  const downloadAll = () =>
    downloadTsv(
      `de_${field}_all_comparisons.tsv`,
      ["comparison", "type", ...DE_COLUMNS.filter((c) => !c.startsWith("cn_"))],
      results.flatMap((r) => r.genes.map((g) => ({ ...g, comparison: r.key, type: r.type })))
    );

  const columns = [
    { title: t("components.single-cell.rna.multi-comparison"), dataIndex: "key", key: "key" },
    {
      title: t("components.single-cell.rna.multi-cells"),
      key: "n",
      render: (_, r) => `${r.nA} / ${r.nB}`,
    },
    {
      title: t("components.single-cell.rna.multi-sig"),
      key: "sig",
      sorter: (a, b) => a.genes.filter(significant).length - b.genes.filter(significant).length,
      render: (_, r) => {
        const sig = r.genes.filter(significant);
        return `${sig.filter((g) => g.avg_log2FC > 0).length} up · ${sig.filter((g) => g.avg_log2FC < 0).length} down`;
      },
    },
    {
      title: t("components.single-cell.rna.multi-top"),
      key: "top",
      render: (_, r) => (
        <Space size={[2, 2]} wrap>
          {r.genes
            .filter((g) => g.avg_log2FC > 0 && significant(g))
            .slice(0, 6)
            .map((g) => (
              <Tag key={g.gene} color="red">{g.gene}</Tag>
            ))}
        </Space>
      ),
    },
    {
      title: "",
      key: "view",
      render: (_, r) => (
        <Button size="small" type={viewing === r.key ? "primary" : "default"} onClick={() => onView(r)}>
          {t("components.single-cell.rna.multi-view")}
        </Button>
      ),
    },
  ];

  return (
    <div className="sc-multi-de">
      <Space wrap style={{ marginBottom: 8 }}>
        <Text strong>{t("components.single-cell.rna.multi-title")}</Text>
        <Select
          size="small"
          style={{ width: 170 }}
          value={field}
          onChange={setField}
          options={[
            { value: "clone", label: t("components.single-cell.umap.color-clone") },
            ...categorical.map((f) => ({ value: f.name, label: fieldLabel(f.name) })),
          ]}
        />
        <Select
          size="small"
          mode="multiple"
          allowClear
          maxTagCount="responsive"
          style={{ minWidth: 240 }}
          placeholder={t("components.single-cell.rna.multi-all-groups", { count: usable.length })}
          value={chosen || []}
          onChange={(v) => setChosen(v.length ? v : null)}
          options={usable.map((g) => ({ value: g.key, label: `${g.label} (${g.rows.length})` }))}
        />
        <Checkbox.Group
          value={modes}
          onChange={setModes}
          options={[
            { value: "rest", label: t("components.single-cell.rna.multi-rest") },
            { value: "pairs", label: t("components.single-cell.rna.multi-pairs") },
          ]}
        />
        <Button size="small" type="primary" disabled={!matrix || picked.length < 2 || !nComparisons || progress != null} onClick={run}>
          {t("components.single-cell.rna.multi-run", { count: nComparisons })}
        </Button>
        {results.length > 0 && (
          <Button size="small" icon={<AiOutlineDownload />} onClick={downloadAll}>
            TSV
          </Button>
        )}
      </Space>
      {groups.length > usable.length && (
        <div>
          <Text type="secondary">{t("components.single-cell.rna.multi-small", { count: groups.length - usable.length })}</Text>
        </div>
      )}
      {progress != null && <Progress percent={progress} size="small" />}
      {results.length > 0 && (
        <Row gutter={SC_GUTTER_INNER}>
          <Col xs={24} xl={14}>
            <Table size="small" rowKey="key" columns={columns} dataSource={results} pagination={{ pageSize: 8 }} scroll={{ x: true }} />
          </Col>
          <Col xs={24} xl={10}>
            {results.some((r) => r.type === "rest") && (
              <>
                <Space wrap style={{ marginBottom: 8 }}>
                  <Text strong>{t("components.single-cell.rna.multi-markers")}</Text>
                  <Select
                    size="small"
                    style={{ width: 120 }}
                    value={nMarkers}
                    onChange={setNMarkers}
                    options={[3, 5, 10, 20].map((n) => ({ value: n, label: t("components.single-cell.rna.multi-per-group", { n }) }))}
                  />
                </Space>
                <DotPlot genes={markerGenes} groups={picked} summary={summary} matrix={matrix} />
              </>
            )}
          </Col>
        </Row>
      )}
    </div>
  );
}

export default function DePanel({ summary, matrix, rowsFor, onGene, selectedGene, onViolins }) {
  const dispatch = useDispatch();
  const geneList = useSelector((state) => state.ScAnalysis.geneList);
  const cn = useSelector((state) => state.SingleCell.cn);
  const { optionsList: geneOptions, genesStartPoint, genesEndPoint } = useSelector((state) => state.Genes);
  const setGeneList = (genes) => dispatch(scaActions.setGeneList(genes));
  const showOnTree = () => {
    dispatch(singleCellActions.updateLayout({ showGenePanel: true }));
    dispatch(settingsActions.updateTab("7"));
  };
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
  const [pCut, setPCut] = useState(1);
  const [lfcCut, setLfcCut] = useState(0.25);
  const [onlyPassing, setOnlyPassing] = useState(false);
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

  // Mean total copy number at each gene's locus in group A and B (cells with
  // a DNA profile only), from the cells' genome graphs.
  const cnByGene = useMemo(() => {
    // CN columns are for the A / B selection groups, not multi-group comparisons
    if (!result || result.multi || cn.status !== "ok" || !geneOptions?.length) return null;
    const rowOfCell = new Map(cn.data.cells.map((id, k) => [id, cn.data.rows[k]]));
    const groupRows = (side) =>
      (groups[side]?.groups.flatMap((g) => g.cells) || []).map((id) => rowOfCell.get(id)).filter(Boolean);
    const rowsA = groupRows("A");
    const rowsB = groupRows("B");
    const geneIndex = new Map(geneOptions.map((o) => [o.label, o.value]));
    const mean = (rows, g) => {
      let sum = 0;
      let n = 0;
      rows.forEach((row) => {
        const b = binAt(row.binIndex, g);
        if (b >= 0 && Number.isFinite(row.values[b])) {
          sum += row.values[b];
          n += 1;
        }
      });
      return n ? sum / n : null;
    };
    const out = new Map();
    result.genes.forEach((r) => {
      const i = geneIndex.get(r.gene);
      if (i == null) return;
      const mid = (Number(genesStartPoint[i]) + Number(genesEndPoint[i])) / 2;
      out.set(r.gene, [mean(rowsA, mid), mean(rowsB, mid)]);
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, cn, geneOptions, genesStartPoint, genesEndPoint]);

  // One set of cutoffs drives the table, volcano, enrichment and the tree heatmap.
  const significant = (g) => g.q_val < qCut && g.p_val < pCut && Math.abs(g.avg_log2FC) >= lfcCut;
  const nSig = result ? result.genes.filter(significant).length : 0;
  const rows = useMemo(() => {
    if (!result) return [];
    const q = query.trim().toUpperCase();
    return result.genes.filter((g) => (!q || g.gene.toUpperCase().includes(q)) && (!onlyPassing || significant(g)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, query, onlyPassing, qCut, pCut, lfcCut]);

  // Phylogenetic signal of the passing genes on the DNA tree (heritable vs plastic expression)
  const heritability = useGeneHeritability(summary, matrix, result ? result.genes.filter(significant).map((g) => g.gene) : []);

  // Every passing gene, by p value, up and down; the tree heatmap takes its top N.
  useEffect(() => {
    if (!result) return;
    const passing = result.genes.filter(significant);
    const top = (sign) => passing.filter((g) => Math.sign(g.avg_log2FC) === sign).map((g) => g.gene);
    dispatch(scaActions.setDeTop({ labels: result.labels, up: top(1), down: top(-1) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, qCut, pCut, lfcCut]);
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
    ...(cnByGene
      ? [
          {
            title: `CN ${result?.labels.A || "A"}`,
            key: "cn1",
            sorter: (a, b) => (cnByGene.get(a.gene)?.[0] ?? -1) - (cnByGene.get(b.gene)?.[0] ?? -1),
            render: (_, r) => fmt(cnByGene.get(r.gene)?.[0], 1),
          },
          {
            title: `CN ${result?.labels.B || "B"}`,
            key: "cn2",
            sorter: (a, b) => (cnByGene.get(a.gene)?.[1] ?? -1) - (cnByGene.get(b.gene)?.[1] ?? -1),
            render: (_, r) => fmt(cnByGene.get(r.gene)?.[1], 1),
          },
        ]
      : []),
    { title: "p", dataIndex: "p_val", key: "p", sorter: (a, b) => a.p_val - b.p_val, render: fmtP },
    { title: t("components.single-cell.results.p-adj"), dataIndex: "p_val_adj", key: "padj", render: fmtP },
    { title: "q (BH)", dataIndex: "q_val", key: "q", render: fmtP },
    ...(heritability.size
      ? [
          {
            title: (
              <Tooltip title="Phylogenetic signal of the gene's expression on the DNA tree (Moran's I, inverse patristic distance; tumor cells with DNA and RNA; BH over the passing genes). Heritable = similar in related cells; plastic = not. Computed for passing genes only.">
                Heritability
              </Tooltip>
            ),
            key: "herit",
            sorter: (a, b) => (heritability.get(a.gene)?.z ?? -99) - (heritability.get(b.gene)?.z ?? -99),
            render: (_, r) => {
              const h = heritability.get(r.gene);
              if (!h) return "–";
              const color = h.label === "heritable" ? "purple" : h.label === "weak" ? "geekblue" : "default";
              return (
                <Tooltip title={`I = ${fmt(h.I, 3)}, z = ${fmt(h.z, 1)}, q = ${fmtP(h.q)}`}>
                  <Tag color={color} style={{ marginRight: 0 }}>
                    {h.label}
                  </Tag>
                </Tooltip>
              );
            },
          },
        ]
      : []),
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
      title={<Space><ExperimentOutlined />{t("components.single-cell.rna.de-title")}<Provenance id="de" /></Space>}
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
        ) : result ? null : (
          <Text type="secondary">
            {t("components.single-cell.rna.ready", { a: groups.A.label, nA: rowsA.length, b: groups.B.label, nB: rowsB.length })}
          </Text>
        )}
        {progress != null && <Progress percent={progress} size="small" />}
        <MultiGroupDe
          summary={summary}
          matrix={matrix}
          rowsFor={rowsFor}
          minPct={minPct}
          significant={significant}
          viewing={result?.multi ? result.key : null}
          onView={(r) => {
            setEnrichment(null);
            setResult(r);
          }}
        />
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
                p: pCut,
                lfc: lfcCut,
              })}
            </Text>
            {(result.nA < 20 || result.nB < 20) && (
              <Alert type="info" showIcon message={t("components.single-cell.rna.exploratory")} />
            )}
            <Row gutter={SC_GUTTER_INNER}>
              <Col xs={24} xl={14}>
                <VolcanoPlot
                  genes={result.genes}
                  labels={result.labels}
                  qCut={qCut}
                  lfcCut={lfcCut}
                  selectedGene={selectedGene}
                  selectedGenes={geneList}
                  onSelectGenes={setGeneList}
                  onGene={onGene}
                />
                <div className="sc-picked">
                  <Text strong>{t("components.single-cell.rna.picked", { count: geneList.length })}</Text>
                  {geneList.length === 0 ? (
                    <Text type="secondary">{t("components.single-cell.rna.pick-help")}</Text>
                  ) : (
                    <>
                      <Space size={[4, 4]} wrap style={{ maxHeight: 64, overflow: "auto" }}>
                        {geneList.slice(0, 40).map((g) => (
                          <Tag key={g} closable onClose={() => setGeneList(geneList.filter((x) => x !== g))}>
                            {g}
                          </Tag>
                        ))}
                        {geneList.length > 40 && <Text type="secondary">+{geneList.length - 40}</Text>}
                      </Space>
                      <Space wrap>
                        <Button size="small" type="primary" onClick={showOnTree}>
                          {t("components.single-cell.rna.show-on-tree")}
                        </Button>
                        <Button size="small" onClick={() => onViolins(geneList.slice(0, 48))}>
                          {t("components.single-cell.rna.violins-for")}
                        </Button>
                        <Button size="small" onClick={() => navigator.clipboard?.writeText(geneList.join("\n"))}>
                          {t("components.single-cell.rna.copy")}
                        </Button>
                        <Button size="small" type="text" onClick={() => setGeneList([])}>
                          {t("components.single-cell.selection.clear")}
                        </Button>
                      </Space>
                    </>
                  )}
                </div>
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
                      ...categorical.map((f) => ({ value: f.name, label: fieldLabel(f.name) })),
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
                <DotPlot genes={dotGenes} groups={dotGroups} summary={summary} matrix={matrix} onGene={onGene} selectedGene={selectedGene} />
                <GeneInfoCard gene={selectedGene} row={result.genes.find((g) => g.gene === selectedGene)} labels={result.labels} />
              </Col>
              <Col span={24}>
                <Space wrap style={{ marginBottom: 8 }}>
                  <Input.Search
                    allowClear
                    size="small"
                    placeholder={t("components.single-cell.results.filter")}
                    style={{ width: 200 }}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <Text type="secondary">p &lt;</Text>
                  <InputNumber size="small" min={0} max={1} step={0.01} value={pCut} onChange={(v) => setPCut(v ?? 1)} style={{ width: 80 }} />
                  <Text type="secondary">q &lt;</Text>
                  <InputNumber size="small" min={0} max={1} step={0.01} value={qCut} onChange={(v) => setQCut(v ?? 0.05)} style={{ width: 80 }} />
                  <Text type="secondary">|log2FC| ≥</Text>
                  <InputNumber size="small" min={0} step={0.25} value={lfcCut} onChange={(v) => setLfcCut(v ?? 0)} style={{ width: 75 }} />
                  <Checkbox checked={onlyPassing} onChange={(e) => setOnlyPassing(e.target.checked)}>
                    {t("components.single-cell.rna.only-passing", { count: nSig })}
                  </Checkbox>
                  <Button
                    size="small"
                    icon={<AiOutlineDownload />}
                    onClick={() =>
                      downloadTsv(
                        `de_${result.labels.A}_vs_${result.labels.B}.tsv`,
                        DE_COLUMNS,
                        result.genes.map((g) => ({
                          ...g,
                          cn_1: cnByGene?.get(g.gene)?.[0]?.toFixed(2) ?? "",
                          cn_2: cnByGene?.get(g.gene)?.[1]?.toFixed(2) ?? "",
                        }))
                      )
                    }
                  >
                    TSV
                  </Button>
                </Space>
                <Table
                  size="small"
                  rowKey="gene"
                  columns={columns}
                  dataSource={rows}
                  pagination={{ pageSize: 10, showSizeChanger: true }}
                  scroll={{ x: true }}
                  rowClassName={(r) => (r.gene === selectedGene ? "sc-row-active" : "")}
                  rowSelection={{
                    selectedRowKeys: geneList,
                    preserveSelectedRowKeys: true,
                    onChange: (keys) => setGeneList(keys),
                  }}
                />
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
              <Text type="secondary">{t("components.single-cell.rna.enrich-uses-cutoffs", { count: nSig })}</Text>
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
                <EnrichmentBars terms={enrichment.terms} onTerm={(r) => r.genes[0] && onGene(r.genes[0])} />
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
