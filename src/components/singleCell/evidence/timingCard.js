import React, { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Card, Col, Row, Space, Statistic, Table, Tag, Typography } from "antd";
import useTreeView from "../useTreeView";
import useContainerWidth from "../useContainerWidth";
import useSignatureModel from "../signatures/useSignatureModel";
import singleCellActions from "../../../redux/singleCell/actions";

import { isNormalClone } from "../../../helpers/singleCell/figures";
import { rowMap } from "../../../helpers/singleCell/matrix";
import { CLOCK_SIGNATURES, cellClockBurden, cladeClockTiming, clockSites, mrcaTiming, placeByCladeSize } from "../../../helpers/singleCell/timing";
import { Swatches, XBaseline } from "../cohort/charts";

const { Text } = Typography;
const MIN_CELLS = 3;
const pct = (x) => (Number.isFinite(x) ? (x > 1 ? ">100%" : `${Math.round(100 * x)}%`) : "–");
const median = (xs) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return NaN;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/**
 * Molecular timing from clock-like mutations only (SBS1 / SBS5 assigned by
 * the patient's joint signature fit). Unlike the signature-burden tree (all
 * signatures per clade), this uses the clock signatures as a ruler: the
 * tumour MRCA's position between the zygote (0) and sampling (1), when each
 * clade was founded, and the ongoing (private, terminal-branch) clock burden
 * per clone, each corrected for the cell's detection sensitivity (share of
 * truncal sites it detects). Normal cells are excluded.
 */
export default function TimingCard() {
  const dispatch = useDispatch();
  const { snv, cloneColors } = useSelector((s) => s.SingleCell);
  const { order, treeLayout, cellById } = useTreeView();
  const model = useSignatureModel();
  const [ref, width] = useContainerWidth(900);

  const res = useMemo(() => {
    if (!treeLayout || snv.status !== "ok" || !model.ready) return null;
    const data = snv.data;
    const clock = clockSites(model.assignment.signature);
    const rows = rowMap(order, data.cells);
    const tumourRows = order.map((id, r) => (isNormalClone(cellById.get(id)?.clone_id) ? -1 : rows[r]));
    const burdens = cellClockBurden(data, tumourRows, clock);
    const mrca = mrcaTiming(data, clock, burdens);
    // subclonal SNVs placed on the node whose tumour-cell count matches the site's mapped clade size
    // (the backend anchors do not always resolve to the mapped node)
    const leafRows = treeLayout.leaves.map((id) => {
      const k = order.indexOf(id);
      return k >= 0 ? tumourRows[k] : -1;
    });
    const placed = placeByCladeSize(treeLayout, data, leafRows);
    const nTumour = order.filter((id) => !isNormalClone(cellById.get(id)?.clone_id)).length;
    const tumourLeavesUnder = (node) => {
      const n = treeLayout.nodes[node];
      let k = 0;
      for (let i = n.firstLeaf; i <= n.lastLeaf; i += 1) if (!isNormalClone(cellById.get(treeLayout.leaves[i])?.clone_id)) k += 1;
      return k;
    };
    const gains = new Map();
    treeLayout.nodes.forEach((n, node) => {
      if (n.isLeaf || n.parent < 0) return;
      const cells = tumourLeavesUnder(node);
      if (cells < Math.max(MIN_CELLS, 0.05 * nTumour) || cells === nTumour) return;
      gains.set(node, { gained: (placed.get(node) || []).filter((c) => data.variants[c]?.category !== "truncal"), cells });
    });
    // cumulative clock sums run over ancestors' branches too, so pass every internal branch for the sums
    const allGains = new Map();
    placed.forEach((list, node) => allGains.set(node, { gained: list.filter((c) => data.variants[c]?.category !== "truncal"), cells: 0 }));
    const timed = cladeClockTiming(treeLayout, allGains, clock, mrca);
    const timedOf = new Map(timed.map((t) => [t.node, t]));
    const clades = [...gains.entries()]
      .map(([node, g]) => ({ ...timedOf.get(node), node, cells: g.cells, gained: g.gained.length }))
      .filter((c) => Number.isFinite(c.foundedAt))
      .sort((a, b) => a.foundedAt - b.foundedAt)
      .slice(0, 30);
    const cloneOfLeaves = (node) => {
      const n = treeLayout.nodes[node];
      const m = new Map();
      for (let i = n.firstLeaf; i <= n.lastLeaf; i += 1) {
        const c = cellById.get(treeLayout.leaves[i])?.clone_id;
        if (isNormalClone(c)) continue;
        m.set(c, (m.get(c) || 0) + 1);
      }
      return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    };
    clades.forEach((c) => (c.clone = cloneOfLeaves(c.node)));
    const byClone = new Map();
    order.forEach((id, r) => {
      const b = burdens[r];
      if (!b) return;
      const k = cellById.get(id)?.clone_id ?? "unassigned";
      if (!byClone.has(k)) byClone.set(k, []);
      byClone.get(k).push(b);
    });
    const perClone = [...byClone.entries()].map(([clone, bs]) => ({
      clone,
      n: bs.length,
      sensitivity: median(bs.map((b) => b.sensitivity)),
      post: median(bs.map((b) => b.postClockCorrected)),
      privateClock: median(bs.map((b) => b.privateClockCorrected)),
    }));
    return { clock, mrca, clades, perClone, sens: median(burdens.filter(Boolean).map((b) => b.sensitivity)) };
  }, [treeLayout, snv, model, order, cellById]);

  if (snv.status !== "ok") return <Text type="secondary">No SNV matrix for this patient.</Text>;
  if (!model.ready) return <Text type="secondary">Waiting for the signature fit (needs SBS96 contexts on the SNVs)…</Text>;
  if (!res) return <Text type="secondary">No tree for this patient.</Text>;

  const h = 34 + 14 * res.clades.length;
  const m = { l: 16, r: 16, t: 18, b: 22 };
  const sx = (t) => m.l + Math.min(1, t) * (width - m.l - m.r);
  const leavesOf = (node) => {
    const n = treeLayout.nodes[node];
    return treeLayout.leaves.slice(n.firstLeaf, n.lastLeaf + 1).filter((id) => !isNormalClone(cellById.get(id)?.clone_id));
  };
  const clones = [...new Set(res.clades.map((c) => c.clone).filter(Boolean))];
  return (
    <Card size="small" title="Molecular timing from clock-like mutations (SBS1 / SBS5)" ref={ref}>
      <Space direction="vertical" style={{ width: "100%" }} size="small">
        <Text type="secondary" style={{ fontSize: 12 }}>
          A ruler, not a signature mix: only mutations assigned to {CLOCK_SIGNATURES.join(" / ")} (accumulating at a roughly constant rate) by
          the patient&apos;s joint signature fit ({model.source}) are counted. The signature tree in the Signatures tab shows all signatures per
          clade; here the clock signatures time events. Per-cell counts are divided by the cell&apos;s sensitivity (share of truncal sites
          detected), since PTA dropout hides mutations. Normal cells excluded.
        </Text>
        <Row gutter={16}>
          <Col>
            <Statistic title="Clock-like SNVs" value={res.clock.length} />
          </Col>
          <Col>
            <Statistic title="Truncal clock SNVs" value={res.mrca.truncalClock} />
          </Col>
          <Col>
            <Statistic title="Post-trunk clock SNVs per cell (median, corrected)" value={Number.isFinite(res.mrca.postClockMedian) ? res.mrca.postClockMedian.toFixed(0) : "–"} />
          </Col>
          <Col>
            <Statistic title="MRCA in molecular time" value={pct(res.mrca.mrcaFraction)} />
          </Col>
          <Col>
            <Statistic title="Median sensitivity" value={pct(res.sens)} />
          </Col>
        </Row>
        <svg width={width} height={h} style={{ display: "block" }}>
          <rect x={sx(0)} y={m.t - 10} width={sx(res.mrca.mrcaFraction) - sx(0)} height={6} fill="currentColor" opacity={0.25} />
          <line x1={sx(res.mrca.mrcaFraction)} x2={sx(res.mrca.mrcaFraction)} y1={m.t - 12} y2={h - m.b} stroke="currentColor" strokeDasharray="3,3" opacity={0.6} />
          <text x={sx(res.mrca.mrcaFraction) + 4} y={m.t - 4} fontSize={11} fill="currentColor">
            tumor MRCA
          </text>
          {res.clades.map((c, i) => (
            <g key={c.node} style={{ cursor: "pointer" }} onClick={() => dispatch(singleCellActions.updateSelection(leavesOf(c.node)))}>
              <line x1={sx(res.mrca.mrcaFraction)} x2={sx(c.foundedAt)} y1={m.t + 8 + i * 14} y2={m.t + 8 + i * 14} stroke={cloneColors[c.clone] || "#999"} opacity={0.35} />
              <circle cx={sx(c.foundedAt)} cy={m.t + 8 + i * 14} r={Math.min(7, 2 + Math.sqrt(c.cells))} fill={cloneColors[c.clone] || "#999"}>
                <title>{`${c.cells} cells (${c.clone}) · founded at ${pct(c.foundedAt)} of molecular time · ${c.clockGained} clock SNVs on its branch`}</title>
              </circle>
            </g>
          ))}
          <XBaseline x0={sx(0)} x1={sx(1)} y={h - m.b} />
          <text x={sx(0)} y={h - 6} fontSize={11} fill="currentColor">
            zygote
          </text>
          <text x={sx(1)} y={h - 6} fontSize={11} textAnchor="end" fill="currentColor">
            sampling
          </text>
        </svg>
        <Swatches items={clones.map((c) => ({ key: c, color: cloneColors[c] || "#999", label: c }))} />
        <Table
          size="small"
          rowKey="clone"
          pagination={false}
          dataSource={res.perClone}
          columns={[
            { title: "Clone", dataIndex: "clone", render: (c) => <Tag color={cloneColors[c]}>{c}</Tag> },
            { title: "Cells", dataIndex: "n" },
            { title: "Sensitivity (median)", dataIndex: "sensitivity", render: pct },
            { title: "Post-trunk clock SNVs (corrected)", dataIndex: "post", render: (x) => (Number.isFinite(x) ? x.toFixed(0) : "–") },
            { title: "Ongoing: private clock SNVs (corrected)", dataIndex: "privateClock", render: (x) => (Number.isFinite(x) ? x.toFixed(0) : "–") },
          ]}
        />
        <Table
          size="small"
          rowKey="node"
          dataSource={res.clades}
          pagination={{ pageSize: 10, size: "small" }}
          onRow={(r) => ({ onClick: () => dispatch(singleCellActions.updateSelection(leavesOf(r.node))), style: { cursor: "pointer" } })}
          columns={[
            { title: "Clade (majority clone)", dataIndex: "clone", render: (c) => <Tag color={cloneColors[c]}>{c}</Tag> },
            { title: "Cells", dataIndex: "cells" },
            { title: "SNVs gained on branch", dataIndex: "gained" },
            { title: "… clock-like", dataIndex: "clockGained" },
            { title: "Founded at (molecular time)", dataIndex: "foundedAt", defaultSortOrder: "ascend", sorter: (a, b) => a.foundedAt - b.foundedAt, render: pct },
          ]}
        />
        <Text type="secondary" style={{ fontSize: 11 }}>
          Clades with ≥ 5% of tumor cells. Founding = (truncal + clock SNVs on the branches from the MRCA down to the clade) / (truncal + the
          median cell&apos;s post-trunk clock SNVs); a lineage with more clock SNVs than the median cell can exceed 100% (shown as &gt;100%).
          Copy-number timing (WGD, chr7 gain / chr10 loss) from SNV multiplicity is not shown yet; amplification timing is in the Report tab.
        </Text>
      </Space>
    </Card>
  );
}
