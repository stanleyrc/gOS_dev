import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Card, Select, Space, Typography } from "antd";
import { TableOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import SvgExportButton from "../svgExportButton";
import { chiSquareTable } from "../../../helpers/singleCell/tests";
import { Swatches } from "./charts";
import HintLine from "../hintLine";

const { Text } = Typography;
const pct = d3.format(".0%");
const pFmt = (p) => (!Number.isFinite(p) ? "" : p < 1e-4 ? "p < 1e-4" : `p = ${p.toPrecision(2)}`);

/**
 * Small multiples, one per patient: the RNA composition (fill field, e.g.
 * state) of each group of the row field (e.g. clone), with a chi-square test
 * of independence per patient. Shows whether clones differ in their
 * transcriptional programs within each tumour and whether that repeats
 * across patients.
 */
export default function CohortStateClonePanel({ groups, fields, defaultFill = "state", colorsFor }) {
  const { t } = useTranslation("common");
  const [ref, width] = useContainerWidth(1000);
  const rowChoices = fields.filter((f) => f !== defaultFill);
  const [rowField, setRowField] = useState(() => ["clone_id", "Clone_Annotation", "seurat_clusters"].find((f) => rowChoices.includes(f)) || rowChoices[0]);
  const [fillField, setFillField] = useState(defaultFill);
  const rowF = fields.includes(rowField) ? rowField : rowChoices[0];
  const fillF = fields.includes(fillField) ? fillField : fields[0];
  const data = useMemo(() => {
    if (!rowF || !fillF) return null;
    const levels = [...new Set(groups.flatMap((g) => g.cells.map((c) => c[fillF]).filter((v) => v != null && v !== "")))].map(String).sort();
    const per = groups.map((g) => {
      const cells = g.cells.filter((c) => c[rowF] != null && c[rowF] !== "" && c[fillF] != null && c[fillF] !== "");
      const rowsMap = d3.rollup(cells, (v) => v.length, (c) => `${c[rowF]}`, (c) => `${c[fillF]}`);
      const rows = [...rowsMap.entries()]
        .map(([key, m]) => ({ key, n: d3.sum([...m.values()]), counts: levels.map((l) => m.get(l) || 0) }))
        .filter((r) => r.n >= 3)
        .sort((a, b) => b.n - a.n);
      const table = rows.map((r) => r.counts).filter((row) => d3.sum(row) > 0);
      const keep = levels.map((_, j) => table.some((row) => row[j] > 0));
      const trimmed = table.map((row) => row.filter((_, j) => keep[j]));
      const p = trimmed.length >= 2 && trimmed[0].length >= 2 ? chiSquareTable(trimmed) : NaN;
      return { ...g, rows, p, n: cells.length };
    });
    return { levels, per: per.filter((p) => p.rows.length) };
  }, [groups, rowF, fillF]);
  if (!data || !data.per.length) return null;
  const colors = colorsFor(data.levels);
  const cols = Math.max(1, Math.min(data.per.length, Math.floor(width / 320)));
  const cellW = Math.floor((width - 8) / cols);
  const rowH = 16;
  const LEFT = 110;
  const heights = data.per.map((p) => 30 + p.rows.length * (rowH + 3) + 8);
  const rowsOfCells = d3.range(Math.ceil(data.per.length / cols)).map((i) => d3.max(heights.slice(i * cols, (i + 1) * cols)));
  const total = d3.sum(rowsOfCells);
  return (
    <Card
      size="small"
      title={<Space><TableOutlined />{t("components.single-cell.cohort.sc-title")}</Space>}
      extra={
        <Space wrap>
          <Text type="secondary">{t("components.single-cell.cohort.sc-rows")}</Text>
          <Select size="small" style={{ width: 150 }} value={rowF} onChange={setRowField} options={rowChoices.map((f) => ({ value: f, label: f }))} />
          <Text type="secondary">{t("components.single-cell.cohort.sc-fill")}</Text>
          <Select size="small" style={{ width: 150 }} value={fillF} onChange={setFillField} options={fields.map((f) => ({ value: f, label: f }))} />
          <SvgExportButton containerRef={ref} name="cohort-state-by-clone" />
        </Space>
      }
    >
      <div ref={ref}>
        <svg width={width} height={total}>
          {data.per.map((p, i) => {
            const x0 = (i % cols) * cellW;
            const y0 = d3.sum(rowsOfCells.slice(0, Math.floor(i / cols)));
            const barW = cellW - LEFT - 60;
            return (
              <g key={p.patient} transform={`translate(${x0},${y0})`}>
                <rect x={0} y={4} width={4} height={heights[i] - 12} fill={p.color} />
                <text x={10} y={12} dy="0.35em" fontSize={12} fontWeight={600} fill="#262626">{p.patient}</text>
                <text x={cellW - 8} y={12} dy="0.35em" textAnchor="end" fontSize={10} fill={p.p < 0.01 ? "#d4380d" : "#8c8c8c"}>{`${t("components.single-cell.cohort.sc-chi")} ${pFmt(p.p)}`}</text>
                {p.rows.map((r, k) => {
                  const y = 28 + k * (rowH + 3);
                  let cx = LEFT;
                  return (
                    <g key={r.key}>
                      <text x={LEFT - 6} y={y + rowH / 2} dy="0.35em" textAnchor="end" fontSize={10} fill="#595959">{r.key.length > 16 ? `${r.key.slice(0, 15)}…` : r.key}<title>{r.key}</title></text>
                      {r.counts.map((c, j) => {
                        const w = (c / r.n) * barW;
                        const el = c > 0 && (
                          <g key={data.levels[j]}>
                            <rect x={cx} y={y} width={Math.max(0, w - 0.5)} height={rowH} fill={colors[data.levels[j]] || "#d9d9d9"} rx={1} />
                            {w > 30 && <text x={cx + w / 2} y={y + rowH / 2} dy="0.35em" textAnchor="middle" fontSize={9} fill="#fff" pointerEvents="none">{pct(c / r.n)}</text>}
                            <title>{`${p.patient} · ${r.key} · ${data.levels[j]}: ${c} / ${r.n} (${pct(c / r.n)})`}</title>
                          </g>
                        );
                        cx += w;
                        return el;
                      })}
                      <text x={LEFT + barW + 4} y={y + rowH / 2} dy="0.35em" fontSize={9} fill="#8c8c8c">{`n=${r.n}`}</text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
        <Swatches style={{ marginTop: 6 }} items={data.levels.map((l) => ({ key: l, color: colors[l], label: l }))} />
        <HintLine text={t("components.single-cell.cohort.sc-help")} />
      </div>
    </Card>
  );
}
