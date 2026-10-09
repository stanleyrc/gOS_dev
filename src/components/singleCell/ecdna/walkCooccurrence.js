import React, { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Card, Col, Empty, Row, Select, Space, Typography } from "antd";
import { DotChartOutlined, TableOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import SvgExportButton from "../svgExportButton";
import singleCellActions from "../../../redux/singleCell/actions";
import { spearman, walkCombinations } from "../../../helpers/singleCell/walks";
import { bestPair, foldRareWalks, splitRare, MIN_PAIR_N } from "../../../helpers/singleCell/walkPanels";
import RareControl, { useRareMax } from "./rareControl";
import { correlationP, formatP } from "../../../helpers/singleCell/tests";
import { Swatches } from "../cohort/charts";
import HintLine from "../hintLine";
import { SC_GUTTER } from "../density";

const { Text } = Typography;
const MUTED = "#8c8c8c";

/**
 * Upset-style co-occurrence of the selected walks in cells (sets present at
 * >= minCn copies, the shared "Carrier >= copies" filter). Rare walks
 * (shared threshold) are folded into one row per family.
 */
export function WalkUpset({ walks, families, cellIds, colorOf, minCn = 1 }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const [ref, width] = useContainerWidth(600);
  const rareMax = useRareMax();
  const rows = useMemo(() => foldRareWalks(families && families.length ? families : [walks], cellIds, rareMax, minCn), [families, walks, cellIds, rareMax, minCn]);
  const combos = useMemo(() => walkCombinations(rows, cellIds, minCn).filter((c) => c.walks.length && c.n >= 2).slice(0, 24), [rows, cellIds, minCn]);
  if (!walks.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.ecdna.none-selected")} />;
  const rowColor = (w) => (w.rare ? MUTED : colorOf(w.id));
  const LEFT = 170;
  const RIGHT = 44;
  const rowH = 24;
  const colW = Math.max(22, Math.min(110, (width - LEFT - RIGHT - 8) / Math.max(1, combos.length)));
  const barW = Math.max(10, Math.min(46, colW * 0.62));
  const barH = 150;
  const top = barH + 16;
  const h = top + rows.length * rowH + 6;
  const max = d3.max(combos, (c) => c.n) || 1;
  const y = d3.scaleLinear().domain([0, max]).range([barH, 18]);
  const plotW = LEFT + combos.length * colW;
  const nCarry = (w) => cellIds.filter((id) => (Number(w.cells[id]) || 0) >= minCn && (Number(w.cells[id]) || 0) > 0).length;
  return (
    <Card size="small" title={<Space size={6}><TableOutlined />{t("components.single-cell.ecdna.upset-title")}<HintLine inline text={t("components.single-cell.ecdna.upset-help")} /></Space>} extra={<Space size={8}><RareControl /><SvgExportButton containerRef={ref} name="ecdna-cooccurrence" /></Space>}>
      <div ref={ref}>
        <svg width={Math.max(width - 4, plotW + RIGHT)} height={h} style={{ display: "block" }}>
          {y.ticks(4).map((tk) => (
            <g key={`t${tk}`}>
              <line x1={LEFT - 4} x2={plotW} y1={y(tk)} y2={y(tk)} stroke={MUTED} strokeOpacity={0.15} />
              <text x={LEFT - 8} y={y(tk)} dy="0.35em" textAnchor="end" fontSize={10} fill={MUTED}>{tk}</text>
            </g>
          ))}
          <text x={LEFT - 8} y={8} textAnchor="end" fontSize={10} fill={MUTED}>{t("components.single-cell.ecdna.upset-cells")}</text>
          {rows.map((w, i) => (
            <g key={w.id}>
              <rect x={0} y={top + i * rowH} width={plotW + RIGHT} height={rowH} fill={i % 2 ? "rgba(128,128,128,0.06)" : "transparent"} />
              <text x={LEFT - 10} y={top + (i + 0.5) * rowH} dy="0.35em" textAnchor="end" fontSize={12} fill={rowColor(w)} fontWeight={w.rare ? 400 : 600} fontStyle={w.rare ? "italic" : "normal"}>
                {w.label.length > 24 ? `${w.label.slice(0, 23)}…` : w.label}
                <title>{w.rare ? w.members.map((m) => m.label).join(", ") : w.label}</title>
              </text>
              <text x={plotW + 6} y={top + (i + 0.5) * rowH} dy="0.35em" fontSize={11} fill={MUTED}>{nCarry(w)}</text>
            </g>
          ))}
          <text x={plotW + 6} y={top - 4} fontSize={9} fill={MUTED}>{t("components.single-cell.ecdna.upset-carriers")}</text>
          {combos.map((c, j) => {
            const cx = LEFT + (j + 0.5) * colW;
            const idx = c.walks.map((id) => rows.findIndex((w) => w.id === id)).filter((i) => i >= 0);
            const single = c.walks.length === 1 ? rows.find((w) => w.id === c.walks[0]) : null;
            return (
              <g key={c.walks.join("|")} style={{ cursor: "pointer" }} onClick={() => dispatch(singleCellActions.updateSelection(c.cells))}>
                <rect x={cx - colW / 2} y={0} width={colW} height={h} fill="transparent" />
                <rect x={cx - barW / 2} y={y(c.n)} width={barW} height={barH - y(c.n)} fill={single ? rowColor(single) : MUTED} rx={2} />
                <text x={cx} y={y(c.n) - 4} textAnchor="middle" fontSize={12} fontWeight={600} fill="currentColor">{c.n}</text>
                {idx.length > 1 && <line x1={cx} x2={cx} y1={top + (Math.min(...idx) + 0.5) * rowH} y2={top + (Math.max(...idx) + 0.5) * rowH} stroke={MUTED} strokeWidth={2.5} />}
                {rows.map((w, i) => {
                  const on = c.walks.includes(w.id);
                  return <circle key={w.id} cx={cx} cy={top + (i + 0.5) * rowH} r={on ? 7 : 3.5} fill={on ? rowColor(w) : MUTED} fillOpacity={on ? 1 : 0.25} />;
                })}
                <title>{`${c.walks.map((id) => rows.find((w) => w.id === id)?.label).join(" + ")}: ${c.n} cells\n${t("components.single-cell.ecdna.upset-click")}`}</title>
              </g>
            );
          })}
        </svg>
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
  const rareMax = useRareMax();
  const { common, rare, carriers } = useMemo(() => splitRare(walks, cellIds, rareMax), [walks, cellIds, rareMax]);
  // default: the pair with the most co-carrying cells, among well-supported walks first
  const pair = useMemo(() => bestPair(common.length >= 2 ? common : walks, cellIds), [common, walks, cellIds]);
  const A = walks.find((w) => w.id === xa) || walks.find((w) => w.id === pair?.a) || walks[0];
  const B = walks.find((w) => w.id === yb) || walks.find((w) => w.id === pair?.b) || walks[1] || walks[0];
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
  const opt = (wk) => ({ value: wk.id, label: `${wk.label} · ${carriers.get(wk.id) || 0}` });
  const opts = rare.length
    ? [{ label: t("components.single-cell.ecdna.scatter-common"), options: common.map(opt) }, { label: t("components.single-cell.ecdna.scatter-rare", { k: rareMax }), options: rare.map(opt) }]
    : common.map(opt);
  const nBoth = pts.filter((q) => q.x > 0 && q.y > 0).length;
  const enough = nBoth >= MIN_PAIR_N;
  return (
    <Card size="small" title={<Space><DotChartOutlined />{t("components.single-cell.ecdna.scatter-title")}</Space>} extra={<SvgExportButton containerRef={ref} name="ecdna-cn-vs-cn" />}>
      <Space wrap style={{ marginBottom: 6 }}>
        <Text type="secondary">x</Text>
        <Select size="small" style={{ width: 190 }} value={A.id} onChange={setXa} options={opts} />
        <Text type="secondary">y</Text>
        <Select size="small" style={{ width: 190 }} value={B.id} onChange={setYb} options={opts} />
        {enough ? (
          <Text type="secondary">{`Spearman ρ ${Number.isFinite(rho) ? rho.toFixed(2) : "–"} · ${formatP(p)} · ${t("components.single-cell.ecdna.scatter-both", { count: nBoth })}`}</Text>
        ) : (
          <Text type="secondary" style={{ opacity: 0.6 }}>{t("components.single-cell.ecdna.scatter-too-few", { count: nBoth, min: MIN_PAIR_N })}</Text>
        )}
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
        <HintLine text={t("components.single-cell.ecdna.scatter-help")} />
      </div>
    </Card>
  );
}

export default function WalkCooccurrence(props) {
  return (
    <Row gutter={SC_GUTTER}>
      <Col xs={24} xl={14}><WalkUpset {...props} /></Col>
      <Col xs={24} xl={10}><WalkScatter {...props} /></Col>
    </Row>
  );
}
