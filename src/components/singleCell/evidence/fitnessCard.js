import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { Card, Space, Table, Tag, Typography } from "antd";
import useTreeView from "../useTreeView";
import useRnaData from "../rna/useRnaData";
import { geneSetIndex, loadGmt } from "../rna/geneSets";
import { stateScores } from "../../../helpers/singleCell/stateScores";
import { leafLbi } from "../../../helpers/singleCell/treeFitness";
import { PC_NUMERIC_LABELS, spearman } from "../../../helpers/singleCell/precompute";
import { correlationP, formatP } from "../../../helpers/singleCell/tests";
import { bh } from "../../../helpers/singleCell/heritability";

const { Text } = Typography;
const PROGRAM_LABEL = { score_MES: "MES-like", score_AC: "AC-like", score_OPC: "OPC-like", score_NPC: "NPC-like", score_G1S: "G1/S", score_G2M: "G2/M", score_cycling: "Cycling" };
const median = (v) => {
  const s = v.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return NaN;
  const k = s.length >> 1;
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
};

/**
 * Fitness from tree shape: the local branching index (LBI) of every tumour
 * cell, i.e. how bushy its neighbourhood of the DNA tree is (high = recently
 * expanding lineage), by clone and correlated with per-cell features: GBM
 * state programmes and proliferation from RNA, and DNA-side measurements
 * (S-phase, telomeres, mtDNA, QC as a confound check). Spearman rho with BH q.
 */
export default function FitnessCard() {
  const { cells, cloneColors } = useSelector((s) => s.SingleCell);
  const { treeLayout } = useTreeView();
  const { summary, matrix } = useRnaData();
  const [scores, setScores] = useState(null);
  useEffect(() => {
    if (!summary || !matrix) return undefined;
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

  const normal = useMemo(() => new Set(cells.filter((c) => /^normal$/i.test(`${c.clone_id || ""}`)).map((c) => `${c.cell_id}`)), [cells]);
  const lbi = useMemo(() => (treeLayout ? leafLbi(treeLayout) : {}), [treeLayout]);
  const tumour = useMemo(() => Object.keys(lbi).filter((id) => !normal.has(id)), [lbi, normal]);

  const byClone = useMemo(() => {
    const m = new Map();
    cells.forEach((c) => {
      const id = `${c.cell_id}`;
      if (normal.has(id) || lbi[id] == null) return;
      const k = c.clone_id ?? "unassigned";
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(lbi[id]);
    });
    return [...m.entries()].map(([clone, v]) => ({ clone, n: v.length, median: median(v) })).sort((a, b) => b.median - a.median);
  }, [cells, lbi, normal]);

  const rows = useMemo(() => {
    const feats = [];
    Object.entries(scores || {}).forEach(([k, values]) => feats.push({ key: k, label: PROGRAM_LABEL[k] || k, kind: "RNA programme", get: (id) => values[id] }));
    const cellById = new Map(cells.map((c) => [`${c.cell_id}`, c]));
    Object.entries(PC_NUMERIC_LABELS).forEach(([k, label]) => {
      if (cells.some((c) => Number.isFinite(c[k]))) feats.push({ key: k, label, kind: /ado|mapd|loh|resid/.test(k) ? "QC (confound check)" : "DNA", get: (id) => cellById.get(id)?.[k] });
    });
    const out = feats.map((f) => {
      const pairs = tumour.map((id) => [lbi[id], Number(f.get(id))]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
      const rho = pairs.length >= 8 ? spearman(pairs.map((p) => p[0]), pairs.map((p) => p[1])) : null;
      return { ...f, n: pairs.length, rho, p: rho == null ? NaN : correlationP(rho, pairs.length) };
    });
    const q = bh(out.map((r) => r.p));
    return out.map((r, i) => ({ ...r, q: q[i] }));
  }, [scores, cells, tumour, lbi]);

  if (!treeLayout) return <Text type="secondary">No tree for this patient.</Text>;
  return (
    <Card size="small" title="Fitness from tree shape (local branching index)">
      <Space direction="vertical" style={{ width: "100%" }} size="small">
        <Text type="secondary" style={{ fontSize: 12 }}>
          LBI: exponentially discounted tree length around each tumour cell (τ = 1/16 of the mean root-to-tip depth). High LBI = the cell sits
          in a recently expanding, bushy lineage. A single sample cannot separate selection from sampling, so read correlations as hypotheses.
        </Text>
        <Table
          size="small"
          rowKey="clone"
          pagination={false}
          dataSource={byClone}
          columns={[
            { title: "Clone", dataIndex: "clone", render: (c) => <Tag color={cloneColors[c]}>{c}</Tag> },
            { title: "Cells", dataIndex: "n" },
            { title: "Median LBI", dataIndex: "median", render: (x) => (Number.isFinite(x) ? x.toFixed(4) : "–") },
          ]}
        />
        <Table
          size="small"
          rowKey="key"
          pagination={false}
          dataSource={rows}
          locale={{ emptyText: "No per-cell features yet (RNA or precomputed DNA)" }}
          columns={[
            { title: "Feature", dataIndex: "label" },
            { title: "Kind", dataIndex: "kind", filters: ["RNA programme", "DNA", "QC (confound check)"].map((v) => ({ value: v, text: v })), onFilter: (v, r) => r.kind === v },
            { title: "Cells", dataIndex: "n" },
            {
              title: "rho with LBI",
              dataIndex: "rho",
              sorter: (a, b) => (a.rho ?? 0) - (b.rho ?? 0),
              render: (r) => (r == null ? "–" : <span style={{ color: r > 0 ? "#cf1322" : "#1d39c4" }}>{r.toFixed(2)}</span>),
            },
            { title: "p", dataIndex: "p", render: (p) => formatP(p) || "–" },
            { title: "q (BH)", dataIndex: "q", defaultSortOrder: "ascend", sorter: (a, b) => (a.q ?? 1) - (b.q ?? 1), render: (q) => (Number.isFinite(q) ? q.toFixed(3) : "–") },
          ]}
        />
      </Space>
    </Card>
  );
}
