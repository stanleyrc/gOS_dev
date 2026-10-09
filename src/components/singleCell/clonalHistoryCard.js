import React, { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Card, Checkbox, Empty, InputNumber, Slider, Space, Typography } from "antd";
import { HistoryOutlined } from "@ant-design/icons";
import useContainerWidth from "./useContainerWidth";
import useTreeView from "./useTreeView";
import SvgExportButton from "./svgExportButton";
import useSignatureModel from "./signatures/useSignatureModel";
import singleCellActions from "../../redux/singleCell/actions";
import filteredEventsActions from "../../redux/filteredEvents/actions";
import { cladeFitScore } from "../../helpers/singleCell/cladeFit";
import { eventClass, eventTooltipLines } from "../../helpers/singleCell/cohortStats";
import { isStrongEvent } from "../../helpers/singleCell/strongEvents";
import { signatureBurden } from "../../helpers/singleCell/signatureAssign";
import { rowMap } from "../../helpers/singleCell/matrix";
import { sitesSeenInRows } from "../../helpers/singleCell/snvSites";
import { collapseTree, dominantValue, placeLabels } from "../../helpers/singleCell/collapsedTree";
import { signatureColorOf } from "./signaturePanel";
import { Swatches } from "./cohort/charts";
import HintLine from "./hintLine";
import usePlotTheme from "./usePlotTheme";
import { TYPE, alterationClassColors } from "../../helpers/singleCell/plotTheme";

const { Text } = Typography;
const PAD = { left: 12, right: 150, top: 18, bottom: 12 };
const ROOT_STUB = 150; // trunk branch drawn left of the root, room for truncal alterations
const WEDGE = 46; // collapsed-clade wedge length with equal branch lengths
const CHIP_H = 15;
const CHIP_FONT = TYPE.tick;
const chipWidth = (s, font = CHIP_FONT) => s.length * font * 0.6 + 12;

const shortLabel = (e) => {
  const cls = eventClass(e);
  const gene = e.fusion_genes || e.gene || "?";
  if (cls === "amp") return `${gene} amp`;
  if (cls === "homdel") return `${gene} del`;
  if (cls === "fusion") return `${gene}`;
  return `${gene}${e.Variant && e.Variant !== "None" ? ` ${e.Variant}` : ""}`;
};

/**
 * Clonal history: the phylogeny collapsed to clades of at least a minimum
 * size (one row per collapsed clade), with every tier 1–2 alteration placed
 * on the branch above the clade its carriers fit best (trunk events on the
 * root stem), SNVs gained per branch, and the signature that increases most
 * on a branch relative to its parent. Labels are de-overlapped. Click an
 * alteration for its popup, a node or clade to select its cells.
 */
export default function ClonalHistoryCard() {
  const pt = usePlotTheme();
  const CLASS_COLORS = alterationClassColors(pt);
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const [ref, width] = useContainerWidth(1000);
  const { order, treeLayout, cellById } = useTreeView();
  const { snv, cloneColors, selectedCellIds, layout } = useSelector((s) => s.SingleCell);
  const eventsState = useSelector((s) => s.FilteredEvents.filteredEvents);
  const model = useSignatureModel();
  const [minFit, setMinFit] = useState(0.5);
  const [showSigs, setShowSigs] = useState(true);
  const [equalBranches, setEqualBranches] = useState(true);
  const [minCladeInput, setMinCladeInput] = useState(null);
  const rowH = layout.historyRowH || 30;
  const minClade = minCladeInput ?? Math.max(4, Math.round(order.length * 0.03));

  const collapsed = useMemo(() => collapseTree(treeLayout, minClade), [treeLayout, minClade]);

  const placed = useMemo(() => {
    if (!treeLayout) return [];
    return (eventsState || [])
      .filter((e) => Number(e.Tier ?? 9) <= 2 && isStrongEvent(e))
      .map((e) => {
        const carriers = `${e.cell_ids || ""}`.split(",").filter(Boolean);
        const fit = cladeFitScore(carriers, treeLayout);
        return { event: e, label: shortLabel(e), cls: eventClass(e), fit, fraction: Number(e.cell_fraction) || 0 };
      })
      .filter((d) => Number.isFinite(d.fit.score) && d.fit.score >= minFit && d.fit.node != null);
  }, [eventsState, treeLayout, minFit]);

  // SNVs and signature shift per drawn branch
  const branchInfo = useMemo(() => {
    if (!treeLayout || snv.status !== "ok" || !model.ready) return new Map();
    const rows = rowMap(order, snv.data.cells);
    const seenOf = new Map();
    const seen = (node) => {
      if (!seenOf.has(node)) {
        const n = treeLayout.nodes[node];
        seenOf.set(node, sitesSeenInRows(snv.data, d3.range(n.firstLeaf, n.lastLeaf + 1).map((r) => rows[r]).filter((r) => r >= 0)));
      }
      return seenOf.get(node);
    };
    const out = new Map();
    collapsed.nodes.forEach((c, id) => {
      if (c.parent < 0) return;
      const n = treeLayout.nodes[c.top];
      const p = treeLayout.nodes[c.parent];
      // the drawn branch may span a merged chain: gained = seen in the chain's clade, absent from the rest of the drawn parent's clade
      const rest = sitesSeenInRows(snv.data, [...d3.range(p.firstLeaf, n.firstLeaf), ...d3.range(n.lastLeaf + 1, p.lastLeaf + 1)].map((r) => rows[r]).filter((r) => r >= 0));
      const gained = [...seen(c.top)].filter((k) => !rest.has(k) && snv.data.variants[k].category !== "truncal");
      const b = signatureBurden(gained, model.assignment);
      const parentB = signatureBurden([...seen(c.parent)], model.assignment);
      let shift = null;
      if (b.assigned >= 15) {
        const pTot = parentB.assigned || 1;
        shift = Object.entries(b.counts)
          .map(([s, k]) => ({ signature: s, delta: k / b.assigned - (parentB.counts[s] || 0) / pTot, share: k / b.assigned }))
          .sort((a, k) => k.delta - a.delta)[0];
        if (shift.delta < 0.1) shift = null;
      }
      out.set(id, { gained: gained.length, shift });
    });
    return out;
  }, [treeLayout, collapsed, snv, model, order]);

  if (!treeLayout || !order.length || !collapsed.rows) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.tree.none")} />;

  const rootId = treeLayout.nodes.findIndex((n) => n.parent < 0);
  const x0 = PAD.left + ROOT_STUB;
  const usable = Math.max(200, width - x0 - PAD.right);
  const step = (usable - WEDGE) / Math.max(1, collapsed.maxDepth);
  const span = Math.max(collapsed.maxX, 1e-9);
  const X = (c) => (equalBranches ? x0 + c.depth * step : x0 + (c.x / span) * usable);
  const tipEnd = (c) => (equalBranches ? X(c) + WEDGE : Math.max(X(c) + 10, x0 + (c.tipX / span) * usable));
  const Y = (c) => PAD.top + (c.row + 0.5) * rowH;
  const selected = new Set(selectedCellIds);
  const cloneOf = (c) => {
    const n = treeLayout.nodes[c.id];
    return dominantValue(n.firstLeaf, n.lastLeaf, (r) => cellById.get(order[r])?.clone_id, 0.8);
  };
  const colorOf = (c) => {
    const clone = cloneOf(c);
    return (clone != null && cloneColors[clone]) || pt.branch;
  };
  const isSel = (c) => {
    if (!selected.size) return false;
    const n = treeLayout.nodes[c.id];
    return d3.range(n.firstLeaf, n.lastLeaf + 1).every((r) => selected.has(order[r]));
  };
  const selectNode = (c, e) => {
    const n = treeLayout.nodes[c.id];
    const ids = order.slice(n.firstLeaf, n.lastLeaf + 1);
    dispatch(singleCellActions.updateSelection(e?.shiftKey || e?.metaKey ? [...new Set([...selectedCellIds, ...ids])] : ids));
  };

  // alterations grouped onto drawn nodes (a clade below the cut goes to its collapsed ancestor)
  const byNode = d3.group(placed, (d) => collapsed.shownOf(d.fit.node));
  const nodes = [...collapsed.nodes.values()];

  // label boxes: alteration chips stacked above the branch end, SNV count + signature below
  const boxes = [];
  nodes.forEach((c) => {
    const right = X(c) - 6;
    const list = (byNode.get(c.id) || []).sort((a, b) => b.fraction - a.fraction);
    if (list.length) {
      const w = Math.max(...list.map((d) => chipWidth(d.label)));
      const h = list.length * (CHIP_H + 2) - 2;
      boxes.push({ kind: "events", node: c.id, list, x: right - w, w, h, y: Y(c) - 4 - h, ax: right, ay: Y(c), prio: 1, dir: -1 });
    }
    const info = branchInfo.get(c.id);
    const sig = showSigs && info?.shift ? info.shift : null;
    if (info?.gained > 0 || sig) {
      const num = info?.gained > 0 ? `${info.gained}` : "";
      const w = num.length * 6 + (sig ? chipWidth(`${sig.signature} ↑`, 10) + (num ? 4 : 0) : 0);
      boxes.push({ kind: "branch", node: c.id, num, sig, x: right - w, w, h: 13, y: Y(c) + 3, ax: right, ay: Y(c) });
    }
  });
  const labels = placeLabels(boxes);
  const contentBottom = Math.max(PAD.top + collapsed.rows * rowH, ...labels.map((b) => b.y + b.h));
  const contentTop = Math.min(0, ...labels.map((b) => b.y - 2));
  const height = contentBottom - contentTop + PAD.bottom;

  const root = collapsed.nodes.get(rootId);
  const nodeTitle = (c) => {
    const info = branchInfo.get(c.id);
    return [
      `${c.size} cells${cloneOf(c) != null ? ` · ${cloneOf(c)}` : ""}`,
      info ? `${info.gained} SNVs gained on this branch` : null,
      !c.tip && c.folded ? t("components.single-cell.history.folded", { count: c.folded }) : null,
      t("components.single-cell.history.select"),
    ].filter(Boolean).join("\n");
  };

  return (
    <Card
      size="small"
      title={<Space><HistoryOutlined />{t("components.single-cell.history.title")}</Space>}
      extra={
        <Space wrap size={6}>
          <Text type="secondary">{t("components.single-cell.history.min-clade")}</Text>
          <InputNumber size="small" min={1} max={Math.max(2, order.length)} value={minClade} onChange={(v) => setMinCladeInput(v || null)} style={{ width: 64 }} />
          <Text type="secondary">{t("components.single-cell.history.min-fit")}</Text>
          <Slider min={0} max={1} step={0.05} value={minFit} onChange={setMinFit} style={{ width: 90, margin: "0 6px" }} />
          <Checkbox checked={equalBranches} onChange={(e) => setEqualBranches(e.target.checked)}>{t("components.single-cell.history.equal")}</Checkbox>
          <Checkbox checked={showSigs} onChange={(e) => setShowSigs(e.target.checked)}>{t("components.single-cell.history.show-sigs")}</Checkbox>
          <Text type="secondary">{t("components.single-cell.history.row-height")}</Text>
          <Slider min={18} max={70} step={2} value={rowH} onChange={(v) => dispatch(singleCellActions.updateLayout({ historyRowH: v }))} style={{ width: 90, margin: "0 6px" }} />
          <SvgExportButton containerRef={ref} name="clonal-history" />
        </Space>
      }
    >
      <div ref={ref}>
        <svg width={width} height={height} viewBox={`0 ${contentTop} ${width} ${height}`} style={{ display: "block", fontFamily: "inherit" }}>
          {/* root stem */}
          <line x1={PAD.left} x2={X(root)} y1={Y(root)} y2={Y(root)} stroke={pt.branch} strokeWidth={2} />
          {nodes.map((c) => {
            const parent = c.parent >= 0 ? collapsed.nodes.get(c.parent) : null;
            const sel = isSel(c);
            const color = sel ? pt.select : colorOf(c);
            const sw = sel ? 3 : 2;
            const kids = c.children.map((k) => collapsed.nodes.get(k));
            const half = Math.min(rowH * 0.42, 3 + Math.log2(c.size + 1) * 2.2);
            return (
              <g key={c.id}>
                {parent && <line x1={X(parent)} x2={X(c)} y1={Y(c)} y2={Y(c)} stroke={color} strokeWidth={sw} />}
                {kids.length > 0 && <line x1={X(c)} x2={X(c)} y1={Y(kids[0])} y2={Y(kids[kids.length - 1])} stroke={color} strokeWidth={sw} />}
                {c.tip && (
                  <g style={{ cursor: "pointer" }} onClick={(e) => selectNode(c, e)}>
                    <path d={`M${X(c)},${Y(c)} L${tipEnd(c)},${Y(c) - half} L${tipEnd(c)},${Y(c) + half} Z`} fill={color} fillOpacity={0.3} stroke={color} strokeWidth={1.2} />
                    <text x={tipEnd(c) + 6} y={Y(c)} dy="0.35em" fontSize={TYPE.tick} fill={pt.textSecondary}>
                      {`${c.size} cells`}
                      {cloneOf(c) != null && <tspan fill={colorOf(c)} fontWeight={600}>{` · ${cloneOf(c)}`}</tspan>}
                    </text>
                    <title>{nodeTitle(c)}</title>
                  </g>
                )}
                {!c.tip && (
                  <circle cx={X(c)} cy={Y(c)} r={byNode.has(c.id) ? 5 : 3.5} fill={byNode.has(c.id) ? pt.text : pt.panel} stroke={byNode.has(c.id) ? pt.panel : color} strokeWidth={1.5} style={{ cursor: "pointer" }} onClick={(e) => selectNode(c, e)}>
                    <title>{nodeTitle(c)}</title>
                  </circle>
                )}
              </g>
            );
          })}
          {labels.map((b) => (
            <g key={`${b.kind}-${b.node}`}>
              {Math.abs(b.shifted) > 1 && <line x1={b.ax} y1={b.ay} x2={b.x + b.w} y2={b.kind === "events" ? b.y + b.h : b.y + 6} stroke={pt.axis} strokeDasharray="2,2" />}
              {b.kind === "events" &&
                b.list.map((d, k) => (
                  <g key={d.label} transform={`translate(${b.x + b.w - chipWidth(d.label)},${b.y + k * (CHIP_H + 2)})`} style={{ cursor: "pointer" }} onClick={() => dispatch(filteredEventsActions.selectFilteredEvent(d.event, "plots"))}>
                    <rect width={chipWidth(d.label)} height={CHIP_H} rx={3} fill={pt.raised} stroke={CLASS_COLORS[d.cls]} />
                    <rect width={4} height={CHIP_H} rx={1} fill={CLASS_COLORS[d.cls]} />
                    <text x={8} y={CHIP_H / 2} dy="0.35em" fontSize={CHIP_FONT} fill={pt.text}>{d.label}</text>
                    <title>{[shortLabel(d.event), ...eventTooltipLines(d.event), `clade F1 ${d.fit.score.toFixed(2)} (best clade ${d.fit.clade} cells)`, t("components.single-cell.history.click")].join("\n")}</title>
                  </g>
                ))}
              {b.kind === "branch" && (
                <g transform={`translate(${b.x},${b.y})`}>
                  {b.num && <text x={0} y={6.5} dy="0.35em" fontSize={TYPE.micro} fill={pt.muted}>{b.num}<title>{t("components.single-cell.history.gained", { count: Number(b.num) })}</title></text>}
                  {b.sig && (
                    <g transform={`translate(${b.num ? b.num.length * 6 + 4 : 0},0)`}>
                      <rect width={chipWidth(`${b.sig.signature} ↑`, 10)} height={13} rx={3} fill={signatureColorOf(b.sig.signature)} fillOpacity={0.9} />
                      <text x={6} y={6.5} dy="0.35em" fontSize={TYPE.micro} fill="#fff">{`${b.sig.signature} ↑`}</text>
                      <title>{t("components.single-cell.history.shift", { signature: b.sig.signature, share: d3.format(".0%")(b.sig.share), delta: d3.format("+.0%")(b.sig.delta) })}</title>
                    </g>
                  )}
                </g>
              )}
            </g>
          ))}
        </svg>
        <Swatches style={{ marginTop: 6 }} items={Object.entries(CLASS_COLORS).filter(([k]) => k !== "other" && placed.some((d) => d.cls === k)).map(([k, c]) => ({ key: k, color: c, label: t(`components.single-cell.cohort.class-${k}`) }))} />
        <HintLine text={t("components.single-cell.history.help", { count: placed.length, min: minClade })} />
      </div>
    </Card>
  );
}
