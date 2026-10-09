import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { Button, Card, InputNumber, Space, Table, Tag, Tooltip, Typography } from "antd";
import { geneSetIndex, loadGmt } from "./geneSets";
import { useTumourTreeWeights } from "./useHeritability";
import { stateScores } from "../../../helpers/singleCell/stateScores";
import { geneValues, topVariableGenes } from "../../../helpers/singleCell/staticRna";
import { heritabilityLabel, moranPermutation, signalTable } from "../../../helpers/singleCell/heritability";

const { Text } = Typography;
const fmt = (x, d = 3) => (x == null || !Number.isFinite(x) ? "–" : x.toFixed(d));
const fmtP = (p) => (p == null || !Number.isFinite(p) ? "–" : p < 1e-3 ? p.toExponential(1) : p.toFixed(3));
const LABEL_COLOR = { heritable: "purple", weak: "geekblue", "plastic / none": "default" };
const PROGRAM_LABEL = {
  score_MES: "MES-like",
  score_AC: "AC-like",
  score_OPC: "OPC-like",
  score_NPC: "NPC-like",
  score_G1S: "G1/S",
  score_G2M: "G2/M",
  score_cycling: "Cycling (max G1/S, G2/M)",
};

/** Small tree-ordered strip of a feature's values (leaf order), so clade-aligned states are visible. */
function Strip({ ids, values, width = 220, height = 14 }) {
  const v = ids.map((id) => values[id]).filter((x) => Number.isFinite(x));
  if (!v.length) return null;
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  const w = width / ids.length;
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      {ids.map((id, i) => {
        const x = values[id];
        const t = Number.isFinite(x) && hi > lo ? (x - lo) / (hi - lo) : 0;
        return <rect key={id} x={i * w} width={Math.max(w, 1)} height={height} fill={`rgba(114,46,209,${0.08 + 0.92 * t})`} />;
      })}
    </svg>
  );
}

/**
 * Heritable vs plastic cell state: phylogenetic signal on the DNA tree of the
 * GBM state programmes (Neftel MES / AC / OPC / NPC via 3CA), proliferation,
 * the categorical state label (one indicator per state) and the most variable
 * genes. Moran's I with inverse patristic-distance weights over tumour cells
 * with both DNA and RNA; analytic z (BH across rows) plus a 999-permutation
 * tree test for the programmes and states. Strips show each feature in tree
 * leaf order.
 */
export default function HeritabilityCard({ summary, matrix }) {
  const w = useTumourTreeWeights(summary);
  const cells = useSelector((s) => s.SingleCell.cells);
  const [scores, setScores] = useState(null);
  const [nGenes, setNGenes] = useState(200);
  const [genesOn, setGenesOn] = useState(false);

  useEffect(() => {
    if (!summary || !matrix) return;
    let live = true;
    (async () => {
      const entry = (await geneSetIndex()).find((c) => c.id === "gbm_3ca");
      const sets = entry ? new Map((await loadGmt(entry.file)).map((x) => [x.term, x.genes])) : new Map();
      if (live) setScores(stateScores(summary, matrix, sets));
    })().catch(() => live && setScores({}));
    return () => {
      live = false;
    };
  }, [summary, matrix]);

  const stateField = useMemo(() => {
    const byId = new Map(cells.map((c) => [`${c.cell_id}`, c.state]));
    (summary?.cells || []).forEach((c) => c.state != null && !byId.get(`${c.displayId}`) && byId.set(`${c.displayId}`, c.state));
    return byId;
  }, [cells, summary]);

  const rows = useMemo(() => {
    if (!w || !scores) return [];
    const feats = [];
    Object.entries(scores).forEach(([k, values]) => feats.push({ key: k, label: PROGRAM_LABEL[k] || k, kind: "programme", values, perm: true }));
    const levels = [...new Set(w.ids.map((id) => stateField.get(id)).filter((x) => x != null && x !== ""))];
    if (levels.length >= 2 && levels.length <= 8)
      levels.forEach((lv) => {
        const values = {};
        w.ids.forEach((id) => (values[id] = stateField.get(id) == null ? NaN : stateField.get(id) === lv ? 1 : 0));
        feats.push({ key: `state:${lv}`, label: `state = ${lv}`, kind: "state", values, perm: true });
      });
    if (genesOn && summary && matrix) {
      const rowOf = new Map(summary.cells.map((c, k) => [`${c.displayId}`, k]));
      topVariableGenes(summary, matrix, nGenes).forEach((gene) => {
        const g = summary.geneIndex.get(gene);
        const dense = geneValues(matrix, summary.cells.length, g);
        const values = {};
        w.ids.forEach((id) => (values[id] = dense[rowOf.get(id)]));
        feats.push({ key: `gene:${gene}`, label: gene, kind: "gene", values, perm: false });
      });
    }
    const table = signalTable(w, feats);
    return table.map((r, i) => {
      const f = feats[i];
      const perm = f.perm ? moranPermutation(w.ids.map((id) => f.values[id]), w, { nPerm: 999 }) : null;
      return { ...r, label: f.label, kind: f.kind, values: f.values, permP: perm?.p ?? null, call: heritabilityLabel(r) };
    });
  }, [w, scores, stateField, genesOn, nGenes, summary, matrix]);

  if (!summary) return null;
  return (
    <Card size="small" title="Heritable vs plastic cell state (phylogenetic signal on the DNA tree)">
      <Space direction="vertical" style={{ width: "100%" }} size="small">
        {!w ? (
          <Text type="secondary">Needs the DNA tree and at least 8 tumour cells with both DNA and RNA.</Text>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>
            Moran&apos;s I over {w.n} tumour cells with DNA and RNA (inverse patristic distance; E[I] = {fmt(-1 / (w.n - 1))}). Heritable: q &lt;
            0.05 with I &gt; 0, i.e. related cells share the state; plastic: no tree structure. Permutation p shuffles values over the leaves (999
            permutations).
          </Text>
        )}
        <Space size="small">
          <Button size="small" onClick={() => setGenesOn((x) => !x)} disabled={!w}>
            {genesOn ? "Hide genes" : "Add most variable genes"}
          </Button>
          {genesOn && (
            <>
              <InputNumber size="small" min={20} max={1000} step={50} value={nGenes} onChange={(v) => v && setNGenes(v)} />
              <Text style={{ fontSize: 12 }}>genes</Text>
            </>
          )}
        </Space>
        <Table
          size="small"
          rowKey="key"
          dataSource={rows}
          pagination={{ pageSize: 15, size: "small" }}
          scroll={{ x: 900 }}
          columns={[
            { title: "Feature", dataIndex: "label", render: (l, r) => (r.kind === "gene" ? <Text code>{l}</Text> : l) },
            {
              title: "Kind",
              dataIndex: "kind",
              width: 100,
              filters: ["programme", "state", "gene"].map((v) => ({ value: v, text: v })),
              onFilter: (v, r) => r.kind === v,
            },
            { title: "On the tree (leaf order)", key: "strip", render: (_, r) => <Strip ids={w?.ids || []} values={r.values} /> },
            { title: "Moran's I", dataIndex: "I", width: 90, sorter: (a, b) => a.I - b.I, render: (x) => fmt(x) },
            { title: "z", dataIndex: "z", width: 70, defaultSortOrder: "descend", sorter: (a, b) => (a.z || -99) - (b.z || -99), render: (x) => fmt(x, 1) },
            { title: "q (BH)", dataIndex: "q", width: 80, render: fmtP },
            { title: <Tooltip title="Tree permutation test (programmes and states)">perm p</Tooltip>, dataIndex: "permP", width: 80, render: fmtP },
            { title: "Call", dataIndex: "call", width: 120, render: (c) => <Tag color={LABEL_COLOR[c]}>{c}</Tag> },
          ]}
        />
      </Space>
    </Card>
  );
}
