import React, { useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { AutoComplete, Card, Empty, Select, Space, Tag, Typography } from "antd";
import { BoxPlotOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import { CLONE_PALETTE } from "../../../helpers/singleCell/matrix";
import { geneValues, searchGeneNames } from "../../../helpers/singleCell/staticRna";
import { kernelDensity, quartiles } from "../../../helpers/singleCell/rnaStats";

const { Text } = Typography;
const ROW_HEIGHT = 200;
const M = { top: 18, right: 12, bottom: 46, left: 44 };
const GROUP_COLORS = { A: "#C2185B", B: "#1F5FA8" };
const MAX_GENES = 8;

// Deterministic jitter so points don't move between renders.
const jitter = (k) => (((Math.sin(k * 12.9898) * 43758.5453) % 1) + 1) % 1 - 0.5;

/** Groups of matrix rows to compare: A/B, clones, or levels of a metadata field. */
export function useViolinGroups(summary, rowsFor, groupBy) {
  const { cells, cloneColors } = useSelector((state) => state.SingleCell);
  const abGroups = useSelector((state) => state.ScAnalysis.groups);
  return useMemo(() => {
    if (!summary) return [];
    if (groupBy === "groups") {
      return ["A", "B"]
        .filter((side) => abGroups[side])
        .map((side) => ({
          key: side,
          label: `${side}: ${abGroups[side].label}`,
          color: GROUP_COLORS[side],
          rows: rowsFor(abGroups[side].groups.flatMap((g) => g.cells)),
        }));
    }
    const cloneOf = new Map(cells.map((c) => [c.cell_id, c.clone_id]));
    const valueOf = (c) => (groupBy === "clone" ? (c.cell_id ? cloneOf.get(c.cell_id) : null) : c[groupBy]);
    const byLevel = new Map();
    summary.cells.forEach((c, k) => {
      const v = valueOf(c);
      if (v == null || v === "") return;
      if (!byLevel.has(`${v}`)) byLevel.set(`${v}`, []);
      byLevel.get(`${v}`).push(k);
    });
    return [...byLevel.entries()]
      .sort((a, b) => `${a[0]}`.localeCompare(`${b[0]}`, undefined, { numeric: true }))
      .map(([level, rows], k) => ({
        key: level,
        label: level,
        color: (groupBy === "clone" && cloneColors[level]) || CLONE_PALETTE[k % CLONE_PALETTE.length],
        rows,
      }));
  }, [summary, rowsFor, groupBy, abGroups, cells, cloneColors]);
}

function GeneViolins({ gene, values, groups, width }) {
  const plotW = width - M.left - M.right;
  const ymax = Math.max(0.5, d3.max(groups, (g) => d3.max(g.rows, (r) => values[r])) || 0);
  const y = d3.scaleLinear().domain([0, ymax * 1.05]).range([ROW_HEIGHT - M.bottom, M.top]).nice();
  const band = d3.scaleBand().domain(groups.map((g) => g.key)).range([M.left, M.left + plotW]).padding(0.2);
  const grid = d3.range(0, 61).map((i) => (y.domain()[1] * i) / 60);
  const shapes = groups.map((g) => {
    const v = g.rows.map((r) => values[r]);
    return { g, v, density: kernelDensity(v, grid), stats: quartiles(v), pct: v.filter((x) => x > 0).length / Math.max(1, v.length) };
  });
  // Each violin is scaled to its own width (Seurat's VlnPlot default), so a
  // group that is mostly zeros doesn't flatten the others.
  const half = Math.min(band.bandwidth() / 2, 70);
  return (
    <svg width={width} height={ROW_HEIGHT} role="img" aria-label={`${gene} violin plot`}>
      <text x={M.left} y={12} fontSize="12" fontWeight="600" fill="#262626">
        {gene}
      </text>
      {y.ticks(4).map((tk) => (
        <g key={tk}>
          <line x1={M.left} x2={M.left + plotW} y1={y(tk)} y2={y(tk)} stroke="#f0f0f0" />
          <text x={M.left - 6} y={y(tk) + 4} textAnchor="end" fontSize="10" fill="#8c8c8c">
            {tk}
          </text>
        </g>
      ))}
      {shapes.map(({ g, v, density, stats, pct }) => {
        const cx = band(g.key) + band.bandwidth() / 2;
        const dmax = d3.max(density) || 1;
        const area = d3
          .area()
          .x0((d) => cx - (d.d / dmax) * half)
          .x1((d) => cx + (d.d / dmax) * half)
          .y((d) => y(d.x))
          .curve(d3.curveBasis);
        return (
          <g key={g.key}>
            <rect x={cx - band.bandwidth() / 2} y={M.top} width={band.bandwidth()} height={ROW_HEIGHT - M.top - M.bottom} fill="#FAFAFA" rx={4} />
            <path d={area(grid.map((x, i) => ({ x, d: density[i] })))} fill={g.color} fillOpacity={0.25} stroke={g.color} />
            {v.map((val, k) => {
              // Spread points by the density at their value so they fill the violin.
              const at = density[Math.max(0, Math.min(grid.length - 1, Math.round((val / grid[grid.length - 1]) * (grid.length - 1))))] / dmax;
              return <circle key={k} cx={cx + jitter(k + 1) * half * 1.7 * at} cy={y(val)} r={1.7} fill={g.color} fillOpacity={0.75} />;
            })}
            <rect x={cx - 3} y={y(stats.q3)} width={6} height={Math.max(1, y(stats.q1) - y(stats.q3))} fill="#262626" fillOpacity={0.6} />
            <line x1={cx - 8} x2={cx + 8} y1={y(stats.median)} y2={y(stats.median)} stroke="#262626" strokeWidth={2} />
            <title>{`${g.label}: n=${v.length}, median ${stats.median.toFixed(2)}, ${Math.round(pct * 100)}% expressing`}</title>
            <text x={cx} y={ROW_HEIGHT - M.bottom + 14} textAnchor="middle" fontSize="11" fill="#595959">
              {g.label.length > 22 ? `${g.label.slice(0, 21)}…` : g.label}
            </text>
            <text x={cx} y={ROW_HEIGHT - M.bottom + 28} textAnchor="middle" fontSize="10" fill="#8c8c8c">
              {`n=${v.length} · ${Math.round(pct * 100)}%`}
            </text>
          </g>
        );
      })}
      <text transform={`translate(12 ${(M.top + ROW_HEIGHT - M.bottom) / 2}) rotate(-90)`} textAnchor="middle" fontSize="11" fill="#8c8c8c">
        log-normalized
      </text>
    </svg>
  );
}

/** Violin plots of chosen genes across groups (no test: distributions only). */
export default function ViolinPanel({ summary, matrix, rowsFor, genes, onGenesChange }) {
  const { t } = useTranslation("common");
  const [ref, width] = useContainerWidth(900);
  const [groupBy, setGroupBy] = useState("clone");
  const [options, setOptions] = useState([]);
  const groups = useViolinGroups(summary, rowsFor, groupBy);
  const categorical = summary.fields.filter((f) => !f.numeric);

  const valuesFor = useMemo(() => {
    const cache = new Map();
    return (gene) => {
      if (!matrix) return null;
      if (!cache.has(gene)) {
        const g = summary.geneIndex.get(gene) ?? summary.geneIndex.get(gene.toUpperCase());
        cache.set(gene, g == null ? null : geneValues(matrix, summary.cells.length, g));
      }
      return cache.get(gene);
    };
  }, [matrix, summary]);

  return (
    <Card
      size="small"
      title={<Space><BoxPlotOutlined />{t("components.single-cell.rna.violin-title")}</Space>}
      extra={
        <Space wrap>
          <Text type="secondary">{t("components.single-cell.rna.group-by")}</Text>
          <Select
            size="small"
            style={{ width: 190 }}
            value={groupBy}
            onChange={setGroupBy}
            options={[
              { value: "groups", label: t("components.single-cell.rna.groups-ab") },
              { value: "clone", label: t("components.single-cell.umap.color-clone") },
              ...categorical.map((f) => ({ value: f.name, label: f.name })),
            ]}
          />
          <AutoComplete
            size="small"
            style={{ width: 170 }}
            placeholder={t("components.single-cell.rna.add-gene")}
            options={options}
            value=""
            onSearch={(q) => setOptions(searchGeneNames(summary.genes, q).map((g) => ({ value: g })))}
            onSelect={(gene) => onGenesChange([...genes.filter((g) => g !== gene), gene].slice(-MAX_GENES))}
          />
        </Space>
      }
    >
      <Space size={[4, 4]} wrap style={{ marginBottom: 8 }}>
        {genes.map((g) => (
          <Tag key={g} closable onClose={() => onGenesChange(genes.filter((x) => x !== g))}>
            {g}
          </Tag>
        ))}
      </Space>
      <div ref={ref}>
        {!genes.length || !groups.length ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={!groups.length ? t("components.single-cell.rna.no-groups") : t("components.single-cell.rna.no-genes")}
          />
        ) : !matrix ? (
          <Text type="secondary">{t("components.single-cell.rna.loading-matrix")}</Text>
        ) : (
          // Small multiples: each gene's plot is sized to its groups (~120 px
          // each) and the plots wrap side by side.
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 24px" }}>
            {genes.map((gene) => {
              const values = valuesFor(gene);
              const plotWidth = Math.min(width, Math.max(240, groups.length * 120 + M.left + M.right));
              return values ? (
                <GeneViolins key={gene} gene={gene} values={values} groups={groups} width={plotWidth} />
              ) : (
                <Text key={gene} type="danger">{t("components.single-cell.rna.unknown-gene", { gene })}</Text>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
