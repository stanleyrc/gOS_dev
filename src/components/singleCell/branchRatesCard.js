import React, { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Card, Space, Table, Tag, Typography } from "antd";
import { RiseOutlined } from "@ant-design/icons";
import useTreeView from "./useTreeView";
import singleCellActions from "../../redux/singleCell/actions";
import { branchGains, cladeRateTest, privateCountsPerRow } from "../../helpers/singleCell/branchBurden";
import { callableMbOf } from "../../helpers/singleCell/cohortStats";
import { rowMap } from "../../helpers/singleCell/matrix";
import { formatP } from "../../helpers/singleCell/tests";

const { Text } = Typography;
const MIN_CELLS = 3;

/**
 * Mutation rates along the tree: for every clade of ≥ 3 cells, the SNV
 * sites gained on the branch above it (per callable Mb of its cells) and
 * the private-SNV rate of its cells against the rest of the tumour
 * (Mann-Whitney), flagging clades that mutate faster or slower.
 */
export default function BranchRatesCard() {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const { order, treeLayout, cellById } = useTreeView();
  const { snv, cloneColors, selectedCellIds } = useSelector((s) => s.SingleCell);
  const rows = useMemo(() => {
    if (!treeLayout || snv.status !== "ok" || !order.length) return [];
    const matrixRows = rowMap(order, snv.data.cells);
    const gains = branchGains(treeLayout, snv.data, matrixRows, { minCells: MIN_CELLS });
    const privCounts = privateCountsPerRow(snv.data);
    const mbOf = (id) => callableMbOf([cellById.get(id)].filter(Boolean));
    const rate = order.map((id, r) => {
      const p = matrixRows[r];
      const mb = mbOf(id);
      return p >= 0 && Number.isFinite(mb) && mb > 0 ? privCounts[p] / mb : NaN;
    });
    return [...gains.entries()]
      .filter(([id]) => !treeLayout.nodes[id].isLeaf)
      .map(([id, g]) => {
        const n = treeLayout.nodes[id];
        const ids = order.slice(n.firstLeaf, n.lastLeaf + 1);
        const inClade = order.map((_, r) => r >= n.firstLeaf && r <= n.lastLeaf);
        const test = cladeRateTest(rate, inClade);
        const mb = d3.median(ids.map(mbOf).filter(Number.isFinite));
        const clones = new Set(ids.map((c) => cellById.get(c)?.clone_id).filter((c) => c != null));
        return { key: id, node: id, cells: g.cells, clone: clones.size === 1 ? [...clones][0] : null, nClones: clones.size, gained: g.gained.length, gainedPerMb: Number.isFinite(mb) && mb > 0 ? g.gained.length / mb : NaN, ...test, ids };
      })
      .sort((a, b) => (Number.isFinite(a.p) ? a.p : 2) - (Number.isFinite(b.p) ? b.p : 2) || b.cells - a.cells);
  }, [treeLayout, snv, order, cellById]);
  if (!rows.length) return null;
  const verdict = (r) => {
    if (!(r.p < 0.01)) return null;
    if (r.fold >= 1.5) return <Tag color="volcano">{t("components.single-cell.rates.faster")}</Tag>;
    if (r.fold <= 1 / 1.5) return <Tag color="geekblue">{t("components.single-cell.rates.slower")}</Tag>;
    return null;
  };
  const select = (r, e) => dispatch(singleCellActions.updateSelection(e?.shiftKey || e?.metaKey ? [...new Set([...selectedCellIds, ...r.ids])] : r.ids));
  const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "–");
  const columns = [
    { title: t("components.single-cell.rates.clade"), key: "clade", width: 150, render: (_, r) => <Space size={4}>{r.clone != null && <span style={{ width: 10, height: 10, borderRadius: 5, background: cloneColors[r.clone] || "#8c8c8c", display: "inline-block" }} />}<span>{r.clone != null ? r.clone : t("components.single-cell.rates.mixed", { count: r.nClones })}</span></Space> },
    { title: t("components.single-cell.cohort.cells"), dataIndex: "cells", width: 70, sorter: (a, b) => a.cells - b.cells },
    { title: t("components.single-cell.rates.gained"), dataIndex: "gained", width: 90, sorter: (a, b) => a.gained - b.gained },
    { title: t("components.single-cell.rates.gained-mb"), dataIndex: "gainedPerMb", width: 100, sorter: (a, b) => (a.gainedPerMb || 0) - (b.gainedPerMb || 0), render: (v) => fmt(v, 3) },
    { title: t("components.single-cell.rates.private-in"), dataIndex: "medianIn", width: 110, render: (v) => fmt(v, 3) },
    { title: t("components.single-cell.rates.private-out"), dataIndex: "medianOut", width: 110, render: (v) => fmt(v, 3) },
    { title: t("components.single-cell.rates.fold"), dataIndex: "fold", width: 80, sorter: (a, b) => (a.fold || 0) - (b.fold || 0), render: (v) => (v === Infinity ? "∞" : fmt(v)) },
    { title: "p", dataIndex: "p", width: 90, sorter: (a, b) => (a.p || 1) - (b.p || 1), render: (p, r) => <Space size={4}><span>{formatP(p)}</span>{verdict(r)}</Space> },
  ];
  return (
    <Card size="small" title={<Space><RiseOutlined />{t("components.single-cell.rates.title")}</Space>}>
      <Table size="small" className="sc-events-table" columns={columns} dataSource={rows} pagination={{ pageSize: 12, size: "small", hideOnSinglePage: true }} onRow={(r) => ({ onClick: (e) => select(r, e), style: { cursor: "pointer" } })} />
      <Text type="secondary" style={{ fontSize: 12 }}>{t("components.single-cell.rates.help")}</Text>
    </Card>
  );
}
