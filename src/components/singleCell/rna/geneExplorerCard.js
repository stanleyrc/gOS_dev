import React, { useCallback, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { AutoComplete, Card, Col, Empty, Row, Select, Space, Typography } from "antd";
import { ExperimentOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import SvgExportButton from "../svgExportButton";
import singleCellActions from "../../../redux/singleCell/actions";
import { geneValues, searchGeneNames } from "../../../helpers/singleCell/staticRna";
import { compareGroups, formatP } from "../../../helpers/singleCell/tests";
import { annotationColors } from "../../../helpers/singleCell/matrix";
import { themePalette } from "../../../helpers/singleCell/themes";
import { BoxStrips } from "../cohort/charts";
import { SC_GUTTER } from "../density";
import { INK, TYPE } from "../../../helpers/singleCell/plotTheme";
import { Provenance } from "../hintLine";

const { Text } = Typography;
const UMAP_H = 300;

/**
 * One gene at a glance: expression on the UMAP, by clone / state / region
 * (with a rank test), and the share of cells expressing it. Selection and
 * hover are shared with every other view.
 */
export default function GeneExplorerCard({ summary, matrix, defaultGene = "EGFR" }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const { cells, cloneColors, selectedCellIds, hoveredCellId, layout } = useSelector((s) => s.SingleCell);
  const [ref, width] = useContainerWidth(1000);
  const [gene, setGene] = useState(defaultGene);
  const [options, setOptions] = useState([]);
  const [groupBy, setGroupBy] = useState("clone");
  const cloneOf = useMemo(() => new Map(cells.map((c) => [c.cell_id, c.clone_id])), [cells]);
  const gi = summary?.geneIndex.get(gene) ?? summary?.geneIndex.get(`${gene}`.toUpperCase());
  const values = useMemo(() => (matrix && gi != null ? geneValues(matrix, summary.cells.length, gi) : null), [matrix, gi, summary]);
  const fields = (summary?.fields || []).filter((f) => !f.numeric).map((f) => f.name);
  const groupOf = useCallback((c) => (groupBy === "clone" ? (c.cell_id ? cloneOf.get(c.cell_id) : null) : c[groupBy]), [groupBy, cloneOf]);
  const levels = useMemo(() => [...new Set((summary?.cells || []).map(groupOf).filter((v) => v != null && v !== ""))].map(String).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [summary, groupOf]);
  const colors = groupBy === "clone" ? cloneColors : annotationColors(levels, themePalette(layout.theme));
  const groups = useMemo(() => {
    if (!values) return [];
    return levels.map((lv) => {
      const idx = summary.cells.map((c, k) => (`${groupOf(c) ?? ""}` === lv ? k : -1)).filter((k) => k >= 0);
      return { key: lv, label: lv, color: colors[lv] || INK.faint, values: idx.map((k) => values[k]), ids: idx.map((k) => summary.cells[k].cell_id || summary.cells[k].displayId), pct: idx.length ? idx.filter((k) => values[k] > 0).length / idx.length : 0 };
    });
  }, [values, levels, summary, colors, groupOf]);
  const test = useMemo(() => (groups.length >= 2 ? compareGroups(groups.map((g) => ({ key: g.key, values: g.values }))) : null), [groups]);

  if (!summary) return null;
  const half = Math.max(320, Math.floor(width / 2) - 20);
  const hasUmap = summary.hasUmap && values;
  const pts = hasUmap ? summary.cells.map((c, k) => ({ c, k, x: c.umap_1, y: c.umap_2, v: values[k] })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) : [];
  const xs = d3.scaleLinear().domain(d3.extent(pts, (p) => p.x)).range([10, half - 10]);
  const ys = d3.scaleLinear().domain(d3.extent(pts, (p) => p.y)).range([UMAP_H - 10, 10]);
  const vmax = d3.max(pts, (p) => p.v) || 1;
  const col = d3.scaleSequential(d3.interpolateViridis).domain([0, vmax]);
  const selected = new Set(selectedCellIds);
  const pctExpr = values ? values.filter((v) => v > 0).length / values.length : 0;

  return (
    <Card
      size="small"
      title={<Space><ExperimentOutlined />{t("components.single-cell.rna.explorer-title")}<Provenance id="geneExplorer" /></Space>}
      extra={
        <Space wrap>
          <AutoComplete size="small" style={{ width: 160 }} value={gene} options={options} onChange={setGene} onSearch={(q) => setOptions(searchGeneNames(summary.genes, q).map((g) => ({ value: g })))} placeholder={t("components.single-cell.bars.gene")} />
          <Select size="small" style={{ width: 170 }} value={groupBy} onChange={setGroupBy} options={[{ value: "clone", label: t("components.single-cell.umap.color-clone") }, ...fields.map((f) => ({ value: f, label: f }))]} />
          <SvgExportButton containerRef={ref} name={`gene-${gene}`} />
        </Space>
      }
    >
      <div ref={ref}>
        {gi == null ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.rna.unknown-gene", { gene })} />
        ) : (
          <Row gutter={SC_GUTTER}>
            <Col xs={24} xl={12}>
              <Text strong>{gene}</Text> <Text type="secondary">{t("components.single-cell.rna.explorer-pct", { pct: d3.format(".0%")(pctExpr), n: values.length })}</Text>
              {hasUmap ? (
                <svg width={half} height={UMAP_H} style={{ display: "block" }} onMouseLeave={() => dispatch(singleCellActions.updateHover(null))}>
                  {pts
                    .slice()
                    .sort((a, b) => a.v - b.v)
                    .map((p) => {
                      const id = p.c.cell_id || p.c.displayId;
                      const sel = selected.has(id);
                      const hov = hoveredCellId === id;
                      return (
                        <circle key={p.k} cx={xs(p.x)} cy={ys(p.y)} r={hov ? 5 : sel ? 4 : 2.6} fill={p.v > 0 ? col(p.v) : "#e8e8e8"} stroke={sel || hov ? "#000" : "none"} style={{ cursor: "pointer" }} onClick={(e) => dispatch(singleCellActions.updateSelection(e.shiftKey ? [...selectedCellIds, id] : [id]))} onMouseEnter={() => dispatch(singleCellActions.updateHover(id))}>
                          <title>{`${id}\n${gene}: ${p.v.toFixed(2)}`}</title>
                        </circle>
                      );
                    })}
                  <text x={half - 8} y={UMAP_H - 8} textAnchor="end" fontSize={TYPE.tick} fill={INK.muted}>UMAP</text>
                </svg>
              ) : (
                <Text type="secondary">{t("components.single-cell.umap.no-umap")}</Text>
              )}
            </Col>
            <Col xs={24} xl={12}>
              <Text type="secondary">{test ? `${test.test === "kruskal-wallis" ? "Kruskal–Wallis" : "Mann–Whitney"} ${formatP(test.p)}` : ""}</Text>
              <BoxStrips groups={groups} width={half} height={UMAP_H} yTitle={`${gene} (log-normalized)`} onPoint={(g, i) => dispatch(singleCellActions.updateSelection([g.ids[i]]))} />
              <Space wrap size={[8, 2]} style={{ fontSize: 12.5 }}>
                {groups.map((g) => (
                  <span key={g.key}><span className="sc-swatch" style={{ background: g.color }} />{`${g.label}: ${d3.format(".0%")(g.pct)} expressing`}</span>
                ))}
              </Space>
            </Col>
          </Row>
        )}
      </div>
    </Card>
  );
}
