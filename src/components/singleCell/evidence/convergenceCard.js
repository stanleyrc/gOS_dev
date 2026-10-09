import React, { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Button, Card, Space, Table, Typography } from "antd";
import useTreeView from "../useTreeView";
import singleCellActions from "../../../redux/singleCell/actions";
import { armsFromCytobands, convergentEvents, eventCarriers } from "../../../helpers/singleCell/convergence";
import ColorTag from "../colorTag";

const { Text } = Typography;

/**
 * Convergent evolution in this patient: arm-level gains / losses and focal
 * amplifications / homozygous deletions of GBM driver genes that the tree
 * says arose more than once (two or more carrier clades whose common ancestor
 * mostly lacks the event). Mirrored allelic imbalance (loss of different
 * parental haplotypes) needs phased allelic CN and is not shown yet.
 */
export default function ConvergenceCard() {
  const dispatch = useDispatch();
  const { cn, cells, cloneColors } = useSelector((s) => s.SingleCell);
  const chromoBins = useSelector((s) => s.Settings.chromoBins);
  const cytobands = useSelector((s) => s.Cytobands?.data);
  const { optionsList: geneOptions, genesStartPoint, genesEndPoint } = useSelector((s) => s.Genes);
  const { treeLayout } = useTreeView();
  const normals = useMemo(() => new Set(cells.filter((c) => /^normal$/i.test(`${c.clone_id || ""}`)).map((c) => `${c.cell_id}`)), [cells]);
  const cloneOf = useMemo(() => new Map(cells.map((c) => [`${c.cell_id}`, c.clone_id ?? "unassigned"])), [cells]);
  const genePos = useMemo(() => {
    const m = new Map();
    (geneOptions || []).forEach((o) => m.set(o.label, (Number(genesStartPoint[o.value]) + Number(genesEndPoint[o.value])) / 2));
    return m;
  }, [geneOptions, genesStartPoint, genesEndPoint]);
  const arms = useMemo(() => armsFromCytobands(cytobands, chromoBins || {}), [cytobands, chromoBins]);
  const rows = useMemo(() => {
    if (cn.status !== "ok" || !treeLayout || !arms.length) return [];
    const carriers = eventCarriers(cn.data, arms, genePos);
    return convergentEvents(treeLayout, carriers, { exclude: normals });
  }, [cn, treeLayout, arms, genePos, normals]);

  const leavesOf = (node) => {
    const n = treeLayout.nodes[node];
    return treeLayout.leaves.slice(n.firstLeaf, n.lastLeaf + 1).filter((id) => !normals.has(`${id}`));
  };
  const majority = (ids) => {
    const m = new Map();
    ids.forEach((id) => m.set(cloneOf.get(`${id}`), (m.get(cloneOf.get(`${id}`)) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  };

  if (cn.status !== "ok") return <Text type="secondary">No copy-number profiles for this patient.</Text>;
  return (
    <Card size="small" title="Convergent evolution (same event on independent branches)">
      <Space direction="vertical" style={{ width: "100%" }} size="small">
        <Text type="secondary" style={{ fontSize: 12 }}>
          An event is convergent when ≥ 2 clades (≥ 3 cells, ≥ 80% carriers) carry it and their common ancestor clade has &lt; 60% carriers.
          Arm calls: median CN over the arm vs the cell&apos;s baseline (±0.75); focal: amplification (≥ baseline + 3 and ≥ 2× baseline) or CN 0 at
          driver genes. Mirrored allelic imbalance needs phased allelic CN: not shown yet.
        </Text>
        <Table
          size="small"
          rowKey="event"
          dataSource={rows}
          pagination={false}
          locale={{ emptyText: "No convergent events found" }}
          columns={[
            { title: "Event", dataIndex: "event", render: (e) => <Text strong>{e}</Text> },
            { title: "Independent clades", key: "n", render: (_, r) => r.hits.length },
            {
              title: "Clades (majority clone · cells)",
              key: "hits",
              render: (_, r) => (
                <Space size={[4, 4]} wrap>
                  {r.hits.map((h) => {
                    const ids = leavesOf(h.node);
                    const c = majority(ids);
                    return (
                      <ColorTag key={h.node} color={cloneColors[c]} style={{ cursor: "pointer" }} onClick={() => dispatch(singleCellActions.updateSelection(ids))}>
                        {c} · {h.n}
                      </ColorTag>
                    );
                  })}
                </Space>
              ),
            },
            { title: "Carriers in common ancestor", dataIndex: "lcaFrac", render: (f) => `${Math.round(100 * f)}%` },
            {
              title: "",
              key: "sel",
              render: (_, r) => (
                <Button size="small" onClick={() => dispatch(singleCellActions.updateSelection(r.hits.flatMap((h) => leavesOf(h.node))))}>
                  select all hits
                </Button>
              ),
            },
          ]}
        />
      </Space>
    </Card>
  );
}
