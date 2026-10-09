import React, { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Card, Empty, Select, Space, Typography } from "antd";
import { PieChartOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import SvgExportButton from "../svgExportButton";
import singleCellActions from "../../../redux/singleCell/actions";
import { annotationColors } from "../../../helpers/singleCell/matrix";
import { themePalette } from "../../../helpers/singleCell/themes";
import { chiSquareUpper } from "../../../helpers/singleCell/tests";
import { FONT, Swatches, XBandLabels } from "../cohort/charts";
import HintLine, { Provenance } from "../hintLine";
import { INK } from "../../../helpers/singleCell/plotTheme";
import { fieldLabel } from "../../../helpers/singleCell/fieldLabels";

const { Text } = Typography;
const HEIGHT = 260;

function chiSquareTable(table) {
  const rows = table.length;
  const cols = table[0]?.length || 0;
  const rowSum = table.map((r) => d3.sum(r));
  const colSum = d3.range(cols).map((j) => d3.sum(table, (r) => r[j]));
  const n = d3.sum(rowSum);
  if (!n || rows < 2 || cols < 2) return NaN;
  let x2 = 0;
  table.forEach((r, i) => r.forEach((v, j) => {
    const e = (rowSum[i] * colSum[j]) / n;
    if (e > 0) x2 += ((v - e) ** 2) / e;
  }));
  return chiSquareUpper(x2, (rows - 1) * (cols - 1));
}

/** Composition of a categorical RNA field (cell state, phase, …) within clones or another grouping, with a chi-square test. */
export default function CompositionCard({ summary }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const { cells, cloneColors, layout } = useSelector((s) => s.SingleCell);
  const [ref, width] = useContainerWidth(900);
  const fields = (summary?.fields || []).filter((f) => !f.numeric).map((f) => f.name);
  const [field, setField] = useState(() => ["state", "Phase", "Cell_Type"].find((f) => fields.includes(f)) || fields[0]);
  const [groupBy, setGroupBy] = useState("clone");
  const cloneOf = useMemo(() => new Map(cells.map((c) => [c.cell_id, c.clone_id])), [cells]);
  const groupOf = (c) => (groupBy === "clone" ? (c.cell_id ? cloneOf.get(c.cell_id) : null) : c[groupBy]);
  const data = useMemo(() => {
    if (!summary || !field) return null;
    const levels = [...new Set(summary.cells.map((c) => c[field]).filter((v) => v != null && v !== ""))].map(String).sort();
    const groups = new Map();
    summary.cells.forEach((c) => {
      const g = groupOf(c);
      if (g == null || g === "" || c[field] == null || c[field] === "") return;
      if (!groups.has(`${g}`)) groups.set(`${g}`, { total: 0, counts: Object.fromEntries(levels.map((l) => [l, 0])), ids: [] });
      const e = groups.get(`${g}`);
      e.total += 1;
      e.counts[`${c[field]}`] += 1;
      e.ids.push(c.cell_id || c.displayId);
    });
    const keys = [...groups.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const p = keys.length >= 2 ? chiSquareTable(keys.map((k) => levels.map((l) => groups.get(k).counts[l]))) : NaN;
    return { levels, groups, keys, p };
  }, [summary, field, groupBy, cloneOf]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!summary || !fields.length || !data) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  const levelColors = annotationColors(data.levels, themePalette(layout.theme));
  const groupColors = groupBy === "clone" ? cloneColors : annotationColors(data.keys, themePalette(layout.theme));
  const M = { top: 12, right: 12, bottom: 56, left: 44 };
  const x = d3.scaleBand().domain(data.keys).range([M.left, width - 24 - M.right]).padding(0.25);
  const y = d3.scaleLinear().domain([0, 1]).range([HEIGHT - M.bottom, M.top]);
  return (
    <Card
      size="small"
      title={<Space><PieChartOutlined />{t("components.single-cell.rna.composition-title")}<Provenance id="rnaComposition" /></Space>}
      extra={
        <Space wrap>
          <Select size="small" style={{ width: 160 }} value={field} onChange={setField} options={fields.map((f) => ({ value: f, label: fieldLabel(f) }))} />
          <Text type="secondary">{t("components.single-cell.qc.group-by")}</Text>
          <Select size="small" style={{ width: 160 }} value={groupBy} onChange={setGroupBy} options={[{ value: "clone", label: t("components.single-cell.umap.color-clone") }, ...fields.filter((f) => f !== field).map((f) => ({ value: f, label: fieldLabel(f) }))]} />
          <SvgExportButton containerRef={ref} name={`composition-${field}`} />
        </Space>
      }
    >
      <div ref={ref}>
        <svg width={width - 24} height={HEIGHT}>
          {y.ticks(5).map((v) => (
            <g key={v} transform={`translate(0,${y(v)})`}>
              <line x1={M.left} x2={width - 24 - M.right} stroke={INK.grid} />
              <text x={M.left - 6} dy="0.35em" textAnchor="end" fontSize={FONT.axis} fill={INK.textSecondary}>{d3.format(".0%")(v)}</text>
            </g>
          ))}
          {data.keys.map((k) => {
            const g = data.groups.get(k);
            let acc = 0;
            return (
              <g key={k} style={{ cursor: "pointer" }} onClick={() => dispatch(singleCellActions.updateSelection(g.ids.filter(Boolean)))}>
                {data.levels.map((l) => {
                  const v = g.counts[l] / g.total;
                  const top = y(acc + v);
                  const h = y(acc) - top;
                  acc += v;
                  return (
                    <rect key={l} x={x(k)} y={top} width={x.bandwidth()} height={Math.max(0, h)} fill={levelColors[l]} stroke={INK.panel} strokeWidth={0.5}>
                      <title>{`${k} · ${l}: ${g.counts[l]} of ${g.total} (${d3.format(".0%")(v)})`}</title>
                    </rect>
                  );
                })}
                <rect x={x(k)} y={HEIGHT - M.bottom + 2} width={x.bandwidth()} height={5} fill={groupColors[k] || INK.faint} />
                <text x={x(k) + x.bandwidth() / 2} y={M.top - 2} textAnchor="middle" fontSize={11} fill={INK.muted}>{`n=${g.total}`}</text>
              </g>
            );
          })}
          <XBandLabels scale={x} y={HEIGHT - M.bottom + 22} rotate={data.keys.length > 8} />
          <text x={width - 24 - M.right} y={M.top + 2} textAnchor="end" fontSize={FONT.axis} fill={Number.isFinite(data.p) && data.p < 0.05 ? "#cf1322" : "#8c8c8c"}>
            {Number.isFinite(data.p) ? `chi-square ${data.p < 1e-4 ? "p < 1e-4" : `p = ${data.p.toFixed(3)}`}` : ""}
          </text>
        </svg>
        <Swatches items={data.levels.map((l) => ({ key: l, color: levelColors[l], label: l }))} />
        <HintLine text={t("components.single-cell.rna.composition-help")} />
      </div>
    </Card>
  );
}
