import React, { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Card, Checkbox, Empty, Slider, Space, Typography } from "antd";
import { HistoryOutlined } from "@ant-design/icons";
import useContainerWidth from "./useContainerWidth";
import useTreeView from "./useTreeView";
import SvgExportButton from "./svgExportButton";
import useSignatureModel from "./signatures/useSignatureModel";
import singleCellActions from "../../redux/singleCell/actions";
import filteredEventsActions from "../../redux/filteredEvents/actions";
import { cladeFitScore } from "../../helpers/singleCell/cladeFit";
import { eventClass } from "../../helpers/singleCell/cohortStats";
import { isStrongEvent } from "../../helpers/singleCell/strongEvents";
import { signatureBurden } from "../../helpers/singleCell/signatureAssign";
import { rowMap } from "../../helpers/singleCell/matrix";
import { sitesSeenInRows } from "../../helpers/singleCell/snvSites";
import { signatureColorOf } from "./signaturePanel";
import { Swatches } from "./cohort/charts";

const { Text } = Typography;
const CLASS_COLORS = { amp: "#D7191C", homdel: "#2C7BB6", fusion: "#7B3294", trunc: "#1A1A1A", splice: "#E6AB02", missense: "#1B9E77", other: "#8c8c8c" };
const PAD = { left: 16, right: 260, top: 16, bottom: 16 };

const shortLabel = (e) => {
  const cls = eventClass(e);
  const gene = e.fusion_genes || e.gene || "?";
  if (cls === "amp") return `${gene} amp`;
  if (cls === "homdel") return `${gene} del`;
  if (cls === "fusion") return `${gene}`;
  return `${gene}${e.Variant && e.Variant !== "None" ? ` ${e.Variant}` : ""}`;
};

/**
 * Clonal history: the phylogeny with every tier 1–2 alteration placed on the
 * branch above the clade its carriers fit best (trunk events at the root),
 * SNV counts per branch, and the signature that increases most on a branch
 * relative to its parent. Click an alteration for its popup, a node to
 * select the clade.
 */
export default function ClonalHistoryCard() {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const [ref, width] = useContainerWidth(1000);
  const { order, treeLayout, cellById } = useTreeView();
  const { snv, cloneColors, selectedCellIds, layout } = useSelector((s) => s.SingleCell);
  const eventsState = useSelector((s) => s.FilteredEvents.filteredEvents);
  const model = useSignatureModel();
  const [minFit, setMinFit] = useState(0.5);
  const [showSigs, setShowSigs] = useState(true);
  const height = layout.historyHeight || 520;

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

  // SNVs and signature shift per internal node (sites seen in the clade but not in its parent's other children)
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
    treeLayout.nodes.forEach((n, id) => {
      if (n.isLeaf || n.parent < 0) return;
      const mine = seen(id);
      // sites gained on this branch: in all? no - present in this clade, absent from the sibling clades
      const siblings = treeLayout.nodes[n.parent].children.filter((c) => c !== id);
      const gained = [...mine].filter((c) => siblings.every((sib) => !seen(sib).has(c)) && snv.data.variants[c].category !== "truncal");
      const b = signatureBurden(gained, model.assignment);
      const parentB = signatureBurden([...seen(n.parent)], model.assignment);
      let shift = null;
      if (b.assigned >= 15) {
        const pTot = parentB.assigned || 1;
        shift = Object.entries(b.counts)
          .map(([s, c]) => ({ signature: s, delta: c / b.assigned - (parentB.counts[s] || 0) / pTot, share: c / b.assigned }))
          .sort((a, c) => c.delta - a.delta)[0];
        if (shift.delta < 0.1) shift = null;
      }
      out.set(id, { gained: gained.length, shift });
    });
    return out;
  }, [treeLayout, snv, model, order]);

  if (!treeLayout || !order.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.tree.none")} />;
  const nRows = order.length;
  const span = Math.max(treeLayout.maxX, 1e-9);
  const usable = Math.max(100, width - PAD.left - PAD.right);
  const px = (x) => PAD.left + (x / span) * usable;
  const rowH = (height - PAD.top - PAD.bottom) / nRows;
  const py = (leafY) => PAD.top + (leafY + 0.5) * rowH;
  const selected = new Set(selectedCellIds);
  const byNode = d3.group(placed, (d) => d.fit.node);
  const cloneOfNode = (n) => {
    const clones = new Set(d3.range(n.firstLeaf, n.lastLeaf + 1).map((r) => cellById.get(order[r])?.clone_id));
    return clones.size === 1 ? [...clones][0] : null;
  };
  const selectNode = (n, e) => {
    const ids = order.slice(n.firstLeaf, n.lastLeaf + 1);
    dispatch(singleCellActions.updateSelection(e?.shiftKey || e?.metaKey ? [...new Set([...selectedCellIds, ...ids])] : ids));
  };

  return (
    <Card
      size="small"
      title={<Space><HistoryOutlined />{t("components.single-cell.history.title")}</Space>}
      extra={
        <Space wrap>
          <Text type="secondary">{t("components.single-cell.history.min-fit")}</Text>
          <Slider min={0} max={1} step={0.05} value={minFit} onChange={setMinFit} style={{ width: 110, margin: "0 6px" }} />
          <Checkbox checked={showSigs} onChange={(e) => setShowSigs(e.target.checked)}>{t("components.single-cell.history.show-sigs")}</Checkbox>
          <Text type="secondary">{t("components.single-cell.signatures.height")}</Text>
          <Slider min={300} max={1400} step={20} value={height} onChange={(v) => dispatch(singleCellActions.updateLayout({ historyHeight: v }))} style={{ width: 110, margin: "0 6px" }} />
          <SvgExportButton containerRef={ref} name="clonal-history" />
        </Space>
      }
    >
      <div ref={ref}>
        <svg width={width} height={height} style={{ display: "block" }}>
          {treeLayout.nodes.map((n, id) => {
            const parent = n.parent >= 0 ? treeLayout.nodes[n.parent] : null;
            const clone = n.isLeaf ? cellById.get(order[n.firstLeaf])?.clone_id : cloneOfNode(n);
            const color = (clone != null && cloneColors[clone]) || "#8c8c8c";
            const sel = selected.size && d3.range(n.firstLeaf, n.lastLeaf + 1).every((r) => selected.has(order[r]));
            return (
              <g key={id}>
                {parent && <line x1={px(parent.x)} x2={px(n.x)} y1={py(n.y)} y2={py(n.y)} stroke={sel ? "#1677ff" : color} strokeWidth={sel ? 2.2 : n.isLeaf ? 0.8 : 1.4} />}
                {!n.isLeaf && <line x1={px(n.x)} x2={px(n.x)} y1={py(treeLayout.nodes[n.children[0]].y)} y2={py(treeLayout.nodes[n.children[n.children.length - 1]].y)} stroke={sel ? "#1677ff" : color} strokeWidth={sel ? 2.2 : 1.4} />}
                {!n.isLeaf && <circle cx={px(n.x)} cy={py(n.y)} r={byNode.has(id) ? 5 : 3} fill={byNode.has(id) ? "#262626" : "#bfbfbf"} stroke="#fff" style={{ cursor: "pointer" }} onClick={(e) => selectNode(n, e)}><title>{`${n.lastLeaf - n.firstLeaf + 1} cells${branchInfo.get(id) ? ` · ${branchInfo.get(id).gained} SNVs gained on this branch` : ""}`}</title></circle>}
                {!n.isLeaf && parent && branchInfo.get(id)?.gained > 0 && (px(n.x) - px(parent.x) > 26) && (
                  <text x={(px(parent.x) + px(n.x)) / 2} y={py(n.y) - 3} textAnchor="middle" fontSize={9} fill="#8c8c8c">{branchInfo.get(id).gained}</text>
                )}
                {showSigs && !n.isLeaf && branchInfo.get(id)?.shift && (
                  <g transform={`translate(${px(n.x) + 7},${py(n.y) + 12})`}>
                    <rect x={-2} y={-9} width={branchInfo.get(id).shift.signature.length * 6.4 + 10} height={12} rx={3} fill={signatureColorOf(branchInfo.get(id).shift.signature)} fillOpacity={0.9} />
                    <text x={3} y={0} fontSize={9} fill="#fff">{`${branchInfo.get(id).shift.signature} ↑`}</text>
                    <title>{t("components.single-cell.history.shift", { signature: branchInfo.get(id).shift.signature, share: d3.format(".0%")(branchInfo.get(id).shift.share), delta: d3.format("+.0%")(branchInfo.get(id).shift.delta) })}</title>
                  </g>
                )}
              </g>
            );
          })}
          {[...byNode.entries()].map(([nodeId, list]) => {
            const n = treeLayout.nodes[nodeId];
            const x = n.parent >= 0 ? (px(treeLayout.nodes[n.parent].x) + px(n.x)) / 2 : px(n.x) + 8;
            const y0 = py(n.y) - (list.length * 14) / 2 - 8;
            return list
              .sort((a, b) => b.fraction - a.fraction)
              .map((d, k) => (
                <g key={d.label} transform={`translate(${x},${y0 + k * 14})`} style={{ cursor: "pointer" }} onClick={() => dispatch(filteredEventsActions.selectFilteredEvent(d.event, "plots"))}>
                  <rect x={-3} y={-10} width={d.label.length * 6.6 + 10} height={13} rx={3} fill="#fff" stroke={CLASS_COLORS[d.cls]} />
                  <rect x={-3} y={-10} width={4} height={13} fill={CLASS_COLORS[d.cls]} />
                  <text x={4} y={0} fontSize={10} fill="#262626">{d.label}</text>
                  <title>{`${shortLabel(d.event)} · ${d.event.cells} cells (${d3.format(".0%")(d.fraction)}) · clade fit ${d.fit.score.toFixed(2)}\n${t("components.single-cell.history.click")}`}</title>
                </g>
              ));
          })}
          {treeLayout.nodes.filter((n) => n.isLeaf).length <= 80 &&
            treeLayout.nodes.filter((n) => n.isLeaf).map((n) => (
              <text key={n.name} x={px(n.x) + 4} y={py(n.y)} dy="0.35em" fontSize={Math.min(10, rowH - 1)} fill="#8c8c8c">{n.name}</text>
            ))}
        </svg>
        <Swatches style={{ marginTop: 6 }} items={Object.entries(CLASS_COLORS).filter(([k]) => k !== "other" && placed.some((d) => d.cls === k)).map(([k, c]) => ({ key: k, color: c, label: t(`components.single-cell.cohort.class-${k}`) }))} />
        <Text type="secondary" style={{ fontSize: 12 }}>{t("components.single-cell.history.help", { count: placed.length })}</Text>
      </div>
    </Card>
  );
}
