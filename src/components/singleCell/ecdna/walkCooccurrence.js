import React, { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Card, Col, Empty, InputNumber, Row, Select, Space, Typography } from "antd";
import { DotChartOutlined, TableOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import SvgExportButton from "../svgExportButton";
import singleCellActions from "../../../redux/singleCell/actions";
import { spearman, walkCombinations } from "../../../helpers/singleCell/walks";
import { correlationP, formatP } from "../../../helpers/singleCell/tests";
import { Swatches } from "../cohort/charts";

const { Text } = Typography;

/** Upset-style co-occurrence of the selected walks in cells (sets present at >= minCn copies). */
export function WalkUpset({ walks, cellIds, colorOf }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const [ref, width] = useContainerWidth(600);
  const [minCn, setMinCn] = useState(2);
  const combos = useMemo(() => walkCombinations(walks, cellIds, minCn).filter((c) => c.walks.length).slice(0, 16), [walks, cellIds, minCn]);
  if (!walks.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.ecdna.none-selected")} />;
  const LEFT = 150;
  const rowH = 22;
  const colW = Math.max(26, Math.min(60, (width - LEFT - 80) / Math.max(1, combos.length)));
  const barH = 110;
  const top = barH + 14;
  const h = top + walks.length * rowH + 10;
  const max = d3.max(combos, (c) => c.n) || 1;
  const y = d3.scaleLinear().domain([0, max]).range([barH, 18]);
  return (
    <Card size="small" title={<Space><TableOutlined />{t("components.single-cell.ecdna.upset-title")}</Space>} extra={<Space><Text type="secondary">{t("components.single-cell.ecdna.min-cn")}</Text><InputNumber size="small" min={1} value={minCn} onChange={(v) => setMinCn(v ?? 1)} style={{ width: 70 }} /><SvgExportButton containerRef={ref} name="ecdna-cooccurrence" /></Space>}>
      <div ref={ref}>
        <svg width={Math.max(width - 8, LEFT + combos.length * colW + 80)} height={h}>
          {combos.map((c, j) => (
            <g key={c.walks.join("|")} style={{ cursor: "pointer" }} onClick={() => dispatch(singleCellActions.updateSelection(c.cells))}>
              <rect x={LEFT + j * colW + 4} y={y(c.n)} width={colW - 8} height={barH - y(c.n)} fill={c.walks.length === 1 ? colorOf(c.walks[0]) : "#8c8c8c"} />
              <text x={LEFT + (j + 0.5) * colW} y={y(c.n) - 3} textAnchor="middle" fontSize={10} fill="#262626">{`${c.n} (${d3.format(".0%")(c.n / cellIds.length)})`}</text>
              {walks.map((w, i) => {
                const on = c.walks.includes(w.id);
                return <circle key={w.id} cx={LEFT + (j + 0.5) * colW} cy={top + (i + 0.5) * rowH} r={on ? 6 : 3.5} fill={on ? colorOf(w.id) : "#e8e8e8"} />;
              })}
              {c.walks.length > 1 && (() => {
                const idx = c.walks.map((id) => walks.findIndex((w) => w.id === id)).filter((i) => i >= 0);
                return <line x1={LEFT + (j + 0.5) * colW} x2={LEFT + (j + 0.5) * colW} y1={top + (Math.min(...idx) + 0.5) * rowH} y2={top + (Math.max(...idx) + 0.5) * rowH} stroke="#262626" strokeWidth={2} />;
              })()}
              <title>{`${c.walks.map((id) => walks.find((w) => w.id === id)?.label).join(" + ")}: ${c.n} cells\n${t("components.single-cell.ecdna.upset-click")}`}</title>
            </g>
          ))}
          {walks.map((w, i) => (
            <g key={w.id}>
              <rect x={0} y={top + i * rowH} width={LEFT + combos.length * colW + 20} height={rowH} fill={i % 2 ? "#fafafa" : "transparent"} />
              <text x={LEFT - 8} y={top + (i + 0.5) * rowH} dy="0.35em" textAnchor="end" fontSize={11} fill={colorOf(w.id)} fontWeight={600}>{w.label}</text>
              <text x={LEFT + combos.length * colW + 6} y={top + (i + 0.5) * rowH} dy="0.35em" fontSize={9} fill="#8c8c8c">{`${cellIds.filter((id) => (Number(w.cells[id]) || 0) >= minCn).length}`}</text>
            </g>
          ))}
        </svg>
        <Text type="secondary" style={{ fontSize: 12 }}>{t("components.single-cell.ecdna.upset-help")}</Text>
      </div>
    </Card>
  );
}

/** Copies of one walk against another per cell, coloured by clone. */
export function WalkScatter({ walks, cellIds, colorOf }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const [ref, width] = useContainerWidth(500);
  const { cloneColors, cells, selectedCellIds } = useSelector((s) => s.SingleCell);
  const cloneOf = useMemo(() => new Map(cells.map((c) => [c.cell_id, c.clone_id])), [cells]);
  const [xa, setXa] = useState(null);
  const [yb, setYb] = useState(null);
  const A = walks.find((w) => w.id === xa) || walks[0];
  const B = walks.find((w) => w.id === yb) || walks[1] || walks[0];
  if (!A || !B) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.ecdna.none-selected")} />;
  const pts = cellIds.map((id) => ({ id, x: Number(A.cells[id]) || 0, y: Number(B.cells[id]) || 0, clone: cloneOf.get(id) }));
  const rho = spearman(pts.map((p) => p.x), pts.map((p) => p.y));
  const p = correlationP(rho, pts.length);
  const w = Math.max(320, width - 16);
  const h = 320;
  const M = { left: 48, right: 12, top: 12, bottom: 40 };
  const x = d3.scaleLinear().domain([0, Math.max(1, d3.max(pts, (q) => q.x))]).nice().range([M.left, w - M.right]);
  const y = d3.scaleLinear().domain([0, Math.max(1, d3.max(pts, (q) => q.y))]).nice().range([h - M.bottom, M.top]);
  const selected = new Set(selectedCellIds);
  const opts = walks.map((wk) => ({ value: wk.id, label: wk.label }));
  return (
    <Card size="small" title={<Space><DotChartOutlined />{t("components.single-cell.ecdna.scatter-title")}</Space>} extra={<SvgExportButton containerRef={ref} name="ecdna-cn-vs-cn" />}>
      <Space wrap style={{ marginBottom: 6 }}>
        <Text type="secondary">x</Text>
        <Select size="small" style={{ width: 160 }} value={A.id} onChange={setXa} options={opts} />
        <Text type="secondary">y</Text>
        <Select size="small" style={{ width: 160 }} value={B.id} onChange={setYb} options={opts} />
        <Text type="secondary">{`Spearman ρ ${Number.isFinite(rho) ? rho.toFixed(2) : "–"} · ${formatP(p)} · ${t("components.single-cell.ecdna.scatter-both", { count: pts.filter((q) => q.x > 0 && q.y > 0).length })}`}</Text>
      </Space>
      <div ref={ref}>
        <svg width={w} height={h}>
          {x.ticks(6).map((tk) => <g key={`x${tk}`}><line x1={x(tk)} x2={x(tk)} y1={M.top} y2={h - M.bottom} stroke="#f0f0f0" /><text x={x(tk)} y={h - M.bottom + 14} textAnchor="middle" fontSize={10} fill="#8c8c8c">{tk}</text></g>)}
          {y.ticks(6).map((tk) => <g key={`y${tk}`}><line x1={M.left} x2={w - M.right} y1={y(tk)} y2={y(tk)} stroke="#f0f0f0" /><text x={M.left - 6} y={y(tk)} dy="0.35em" textAnchor="end" fontSize={10} fill="#8c8c8c">{tk}</text></g>)}
          {pts.map((q) => (
            <circle key={q.id} cx={x(q.x)} cy={y(q.y)} r={selected.has(q.id) ? 5 : 3.5} fill={(q.clone != null && cloneColors[q.clone]) || "#8c8c8c"} fillOpacity={0.8} stroke={selected.has(q.id) ? "#141414" : "none"} style={{ cursor: "pointer" }} onClick={(e) => dispatch(singleCellActions.updateSelection(e.shiftKey || e.metaKey ? [...new Set([...selectedCellIds, q.id])] : [q.id]))}>
              <title>{`${q.id}${q.clone != null ? ` · ${q.clone}` : ""}\n${A.label}: ${q.x} · ${B.label}: ${q.y}`}</title>
            </circle>
          ))}
          <text x={(M.left + w - M.right) / 2} y={h - 6} textAnchor="middle" fontSize={11} fill={colorOf(A.id)} fontWeight={600}>{`${A.label} copies`}</text>
          <text transform={`translate(12 ${(M.top + h - M.bottom) / 2}) rotate(-90)`} textAnchor="middle" fontSize={11} fill={colorOf(B.id)} fontWeight={600}>{`${B.label} copies`}</text>
        </svg>
        <Swatches items={[...new Set(pts.map((q) => q.clone).filter((c) => c != null))].map((c) => ({ key: c, color: cloneColors[c], label: c }))} />
        <Text type="secondary" style={{ fontSize: 12 }}>{t("components.single-cell.ecdna.scatter-help")}</Text>
      </div>
    </Card>
  );
}

export default function WalkCooccurrence(props) {
  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} xl={14}><WalkUpset {...props} /></Col>
      <Col xs={24} xl={10}><WalkScatter {...props} /></Col>
    </Row>
  );
}
