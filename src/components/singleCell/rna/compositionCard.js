import React, { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Card, Empty, Segmented, Select, Space, Typography } from "antd";
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
import { linkAppliesTo, readDeepLink, readViewLink } from "../../../helpers/singleCell/deepLink";

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
  const { cells, cloneColors, layout, patient } = useSelector((s) => s.SingleCell);
  const [ref, width] = useContainerWidth(900);
  const fields = (summary?.fields || []).filter((f) => !f.numeric).map((f) => f.name);
  // ?comp=<field>&compby=<clone|groups|field>&compcount=1 (for this patient's link)
  const link = useMemo(() => {
    const deep = readDeepLink();
    return linkAppliesTo(deep, patient?.caseReportId) ? { ...readViewLink(), groups: deep.groups } : {};
  }, [patient?.caseReportId]);
  const [field, setField] = useState(() => (link.composition && fields.includes(link.composition) ? link.composition : ["state", "Phase", "Cell_Type"].find((f) => fields.includes(f)) || fields[0]));
  const [groupBy, setGroupBy] = useState(() => link.compositionBy || "clone");
  const [counts, setCounts] = useState(() => !!link.compositionCounts);
  // a link's scsel names which saved groups to compare (others saved in this browser are left out)
  const savedGroups = useMemo(() => {
    const all = layout.savedGroups?.[patient?.caseReportId] || [];
    const named = link.groups?.length ? all.filter((g) => link.groups.includes(g.name)) : [];
    return named.length ? link.groups.map((n) => named.find((g) => g.name === n)).filter(Boolean) : all;
  }, [layout.savedGroups, patient?.caseReportId, link]);
  const cloneOf = useMemo(() => new Map(cells.map((c) => [c.cell_id, c.clone_id])), [cells]);
  // saved groups may overlap: a cell counts in every group that holds it
  const groupsOfCell = useMemo(() => {
    const m = new Map();
    savedGroups.forEach((g) => g.cells.forEach((id) => m.set(`${id}`, [...(m.get(`${id}`) || []), g.name])));
    return m;
  }, [savedGroups]);
  const groupsOf = (c) => {
    if (groupBy === "groups") return c.cell_id ? groupsOfCell.get(c.cell_id) || [] : [];
    const g = groupBy === "clone" ? (c.cell_id ? cloneOf.get(c.cell_id) : null) : c[groupBy];
    return g == null || g === "" ? [] : [g];
  };
  const data = useMemo(() => {
    if (!summary || !field) return null;
    const levels = [...new Set(summary.cells.map((c) => c[field]).filter((v) => v != null && v !== ""))].map(String).sort();
    const groups = new Map();
    summary.cells.forEach((c) => {
      if (c[field] == null || c[field] === "") return;
      groupsOf(c).forEach((g) => {
        if (!groups.has(`${g}`)) groups.set(`${g}`, { total: 0, counts: Object.fromEntries(levels.map((l) => [l, 0])), ids: [] });
        const e = groups.get(`${g}`);
        e.total += 1;
        e.counts[`${c[field]}`] += 1;
        e.ids.push(c.cell_id || c.displayId);
      });
    });
    const order = groupBy === "groups" ? savedGroups.map((g) => g.name) : null;
    const keys = [...groups.keys()].sort((a, b) => (order ? order.indexOf(a) - order.indexOf(b) : a.localeCompare(b, undefined, { numeric: true })));
    const p = keys.length >= 2 ? chiSquareTable(keys.map((k) => levels.map((l) => groups.get(k).counts[l]))) : NaN;
    return { levels, groups, keys, p };
  }, [summary, field, groupBy, cloneOf, groupsOfCell]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!summary || !fields.length || !data) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  // distinct colour per level (fixed annotation colours can collide, e.g. two "Non-Enhancing" regions)
  const levelColors = (() => {
    const base = annotationColors(data.levels, themePalette(layout.theme));
    const spare = themePalette(layout.theme).filter((c) => !Object.values(base).includes(c));
    const used = new Set();
    const out = {};
    data.levels.forEach((l) => {
      out[l] = used.has(base[l]) && spare.length ? spare.shift() : base[l];
      used.add(out[l]);
    });
    return out;
  })();
  const groupColors = groupBy === "clone" ? cloneColors : annotationColors(data.keys, themePalette(layout.theme));
  const maxTotal = Math.max(1, ...data.keys.map((k) => data.groups.get(k).total));
  const rotateLabels = data.keys.length > 8;
  const M = { top: 14, right: 12, bottom: rotateLabels ? 60 : 32, left: 44 };
  const x = d3.scaleBand().domain(data.keys).range([M.left, width - 24 - M.right]).padding(0.25);
  const y = d3.scaleLinear().domain([0, counts ? maxTotal : 1]).nice().range([HEIGHT - M.bottom, M.top]);
  return (
    <Card
      id="sc-composition"
      size="small"
      title={<Space><PieChartOutlined />{t("components.single-cell.rna.composition-title")}<Provenance id="rnaComposition" /></Space>}
      extra={
        <Space wrap>
          <Select size="small" style={{ width: 160 }} value={field} onChange={setField} options={fields.map((f) => ({ value: f, label: fieldLabel(f) }))} />
          <Text type="secondary">{t("components.single-cell.qc.group-by")}</Text>
          <Select size="small" style={{ width: 160 }} value={groupBy} onChange={setGroupBy} options={[{ value: "clone", label: t("components.single-cell.umap.color-clone") }, ...(savedGroups.length ? [{ value: "groups", label: "Saved groups" }] : []), ...fields.filter((f) => f !== field).map((f) => ({ value: f, label: fieldLabel(f) }))]} />
          <Segmented size="small" value={counts ? "n" : "pct"} onChange={(v) => setCounts(v === "n")} options={[{ value: "pct", label: "%" }, { value: "n", label: "Cells" }]} />
          <SvgExportButton containerRef={ref} name={`composition-${field}`} />
        </Space>
      }
    >
      <div ref={ref}>
        <svg width={width - 24} height={HEIGHT}>
          {y.ticks(5).map((v) => (
            <g key={v} transform={`translate(0,${y(v)})`}>
              <line x1={M.left} x2={width - 24 - M.right} stroke={INK.grid} />
              <text x={M.left - 6} dy="0.35em" textAnchor="end" fontSize={FONT.axis} fill={INK.textSecondary}>{counts ? v : d3.format(".0%")(v)}</text>
            </g>
          ))}
          {data.keys.map((k) => {
            const g = data.groups.get(k);
            let acc = 0;
            return (
              <g key={k} style={{ cursor: "pointer" }} onClick={() => dispatch(singleCellActions.updateSelection(g.ids.filter(Boolean)))}>
                {data.levels.map((l) => {
                  const v = counts ? g.counts[l] : g.counts[l] / g.total;
                  const top = y(acc + v);
                  const h = y(acc) - top;
                  acc += v;
                  return (
                    <g key={l}>
                      <rect x={x(k)} y={top} width={x.bandwidth()} height={Math.max(0, h)} fill={levelColors[l]} stroke={INK.panel} strokeWidth={0.5}>
                        <title>{`${k} · ${l}: ${g.counts[l]} of ${g.total} (${d3.format(".0%")(g.counts[l] / g.total)})`}</title>
                      </rect>
                      {counts && g.counts[l] > 0 && h >= 12 && (
                        <text x={x(k) + x.bandwidth() / 2} y={top + h / 2} dy="0.35em" textAnchor="middle" fontSize={FONT.axis} fill={INK.text} pointerEvents="none">{g.counts[l]}</text>
                      )}
                    </g>
                  );
                })}
                <rect x={x(k)} y={HEIGHT - M.bottom + 2} width={x.bandwidth()} height={5} fill={groupColors[k] || INK.faint} />
                <text x={x(k) + x.bandwidth() / 2} y={M.top - 2} textAnchor="middle" fontSize={11} fill={INK.muted}>{`n=${g.total}`}</text>
              </g>
            );
          })}
          <XBandLabels scale={x} y={HEIGHT - M.bottom + 22} rotate={rotateLabels} />
        </svg>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Swatches items={data.levels.map((l) => ({ key: l, color: levelColors[l], label: l }))} />
          {Number.isFinite(data.p) && (
            <Text style={{ fontSize: FONT.axis, color: data.p < 0.05 ? INK.danger : INK.muted }}>
              {`Chi-square ${data.p < 1e-4 ? "p < 1e-4" : `p = ${data.p.toFixed(3)}`}`}
            </Text>
          )}
        </div>
        <HintLine text={t("components.single-cell.rna.composition-help")} />
      </div>
    </Card>
  );
}
