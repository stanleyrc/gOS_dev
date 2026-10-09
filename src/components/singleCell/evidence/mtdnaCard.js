import React, { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Card, Space, Table, Tag, Tooltip, Typography } from "antd";
import useTreeView from "../useTreeView";
import singleCellActions from "../../../redux/singleCell/actions";
import { heritabilityLabel, signalTable, treeWeights } from "../../../helpers/singleCell/heritability";
import NotComputed, { pcFile } from "./notComputed";

const { Text } = Typography;
const median = (v) => {
  const s = v.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const k = s.length >> 1;
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
};

/**
 * mtDNA as an independent lineage check: copies per cell (chrM vs autosome
 * read density) by clone, and heteroplasmic chrM sites with each site's
 * phylogenetic signal on the nuclear DNA tree (Moran's I of the VAF). Sites
 * that follow the tree are lineage markers agreeing with the nuclear phylogeny;
 * sites that do not are drift, artefacts or NUMT reads.
 */
export default function MtdnaCard() {
  const dispatch = useDispatch();
  const { precompute, cells, cloneColors } = useSelector((s) => s.SingleCell);
  const { treeLayout } = useTreeView();
  const mt = pcFile(precompute, "mtdna");
  const normals = useMemo(() => new Set(cells.filter((c) => /^normal$/i.test(`${c.clone_id || ""}`)).map((c) => `${c.cell_id}`)), [cells]);

  const byClone = useMemo(() => {
    if (!mt.ok) return [];
    const m = new Map();
    mt.data.cells.forEach((c) => {
      const k = c.clone_id ?? "unassigned";
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(c.mt_cn);
    });
    return [...m.entries()].map(([clone, v]) => ({ clone, n: v.length, median: median(v), min: median(v.slice().sort((a, b) => a - b).slice(0, Math.max(1, v.length >> 2))) }));
  }, [mt.ok, mt.data]);

  const sites = useMemo(() => {
    if (!mt.ok || !treeLayout) return [];
    const ids = mt.data.cell_ids;
    const w = treeWeights(treeLayout, treeLayout.leaves.filter((id) => !normals.has(`${id}`)).map(String));
    const feats = (mt.data.sites || []).map((s) => {
      const v = mt.data.site_vaf?.[`${s.pos}`]?.vaf || [];
      const values = {};
      ids.forEach((id, i) => (values[id] = v[i]));
      return { key: `${s.pos}`, values };
    });
    const sig = new Map(signalTable(w, feats).map((r) => [r.key, r]));
    return (mt.data.sites || []).map((s) => {
      const r = sig.get(`${s.pos}`);
      return { ...s, I: r?.I, z: r?.z, q: r?.q, call: heritabilityLabel(r) };
    });
  }, [mt.ok, mt.data, treeLayout, normals]);

  if (!mt.ok) return <NotComputed what="mtDNA" step="mtdna" status={mt.status} />;
  const selectHet = (s) => {
    const v = mt.data.site_vaf?.[`${s.pos}`]?.vaf || [];
    dispatch(singleCellActions.updateSelection(mt.data.cell_ids.filter((id, i) => v[i] != null && v[i] >= (mt.data.params?.min_vaf ?? 0.03))));
  };
  return (
    <Card size="small" title="mtDNA: copy number and heteroplasmy (independent lineage check)">
      <Space direction="vertical" style={{ width: "100%" }} size="small">
        <Table
          size="small"
          rowKey="clone"
          pagination={false}
          dataSource={byClone}
          columns={[
            { title: "Clone", dataIndex: "clone", render: (c) => <Tag color={cloneColors[c]}>{c}</Tag> },
            { title: "Cells", dataIndex: "n" },
            { title: "mtDNA copies per cell (median)", dataIndex: "median", render: (x) => (x == null ? "–" : Math.round(x)) },
          ]}
        />
        <Text type="secondary" style={{ fontSize: 12 }}>
          {sites.length} heteroplasmic sites (VAF {mt.data.params?.min_vaf ?? 0.03}–{1 - (mt.data.params?.min_vaf ?? 0.03)} at depth ≥{" "}
          {mt.data.params?.min_depth ?? 100} in ≥ {mt.data.params?.min_cells ?? 2} cells). Signal on the tree: Moran&apos;s I of the site&apos;s VAF
          over tumor cells; click a row to select the cells carrying it.
        </Text>
        <Table
          size="small"
          rowKey="pos"
          dataSource={sites}
          pagination={{ pageSize: 15, size: "small" }}
          onRow={(r) => ({ onClick: () => selectHet(r), style: { cursor: "pointer" } })}
          columns={[
            { title: "Site", key: "s", render: (_, s) => `m.${s.pos}${s.ref}>${s.alt}` },
            { title: "Cells heteroplasmic", dataIndex: "n_het", sorter: (a, b) => a.n_het - b.n_het, defaultSortOrder: "descend" },
            { title: "Cells covered", dataIndex: "n_cov" },
            { title: "Pooled VAF", dataIndex: "pooled_vaf", render: (x) => x?.toFixed(3) },
            { title: "Moran's I", dataIndex: "I", render: (x) => (x == null || !Number.isFinite(x) ? "–" : x.toFixed(3)) },
            {
              title: <Tooltip title="heritable = VAF follows the nuclear tree (a lineage marker)">On the tree</Tooltip>,
              dataIndex: "call",
              render: (c) => <Tag color={c === "heritable" ? "purple" : c === "weak" ? "geekblue" : "default"}>{c}</Tag>,
            },
          ]}
        />
      </Space>
    </Card>
  );
}
