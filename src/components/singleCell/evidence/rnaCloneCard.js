import React, { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Button, Card, Col, Row, Space, Statistic, Table, Tag, Typography } from "antd";
import useRnaData from "../rna/useRnaData";
import singleCellActions from "../../../redux/singleCell/actions";
import { pca, scaledExpression } from "../../../helpers/singleCell/rnaStats";
import { topVariableGenes } from "../../../helpers/singleCell/staticRna";
import { armsFromCytobands } from "../../../helpers/singleCell/convergence";
import { baselineAccuracy, dnaArmCn, knnAssign, looAccuracy, rnaArmScores } from "../../../helpers/singleCell/rnaClones";
import { spearman } from "../../../helpers/singleCell/precompute";
import { correlationP, formatP } from "../../../helpers/singleCell/tests";

const { Text } = Typography;
const pct = (x) => (Number.isFinite(x) ? `${Math.round(100 * x)}%` : "–");
const K = 7;

/**
 * DNA-anchored clone assignment: cells with both DNA (clone from the tree)
 * and RNA train a k-nearest-neighbour classifier on the principal components
 * of the most variable genes; leave-one-out accuracy says how well expression
 * alone recovers the DNA clone, and RNA-only cells get a clone with a vote
 * share. Below, an inferCNV-style benchmark: per arm, centred expression of
 * the arm's genes vs the DNA copy number of the same cells.
 */
export default function RnaCloneCard() {
  const dispatch = useDispatch();
  const { cells, cloneColors, cn } = useSelector((s) => s.SingleCell);
  const chromoBins = useSelector((s) => s.Settings.chromoBins);
  const cytobands = useSelector((s) => s.Cytobands?.data);
  const { optionsList: geneOptions, genesStartPoint, genesEndPoint } = useSelector((s) => s.Genes);
  const { summary, matrix } = useRnaData();
  const [nGenes] = useState(500);

  const cloneOf = useMemo(() => new Map(cells.map((c) => [`${c.cell_id}`, c.clone_id])), [cells]);
  const model = useMemo(() => {
    if (!summary || !matrix) return null;
    const n = summary.cells.length;
    const genes = topVariableGenes(summary, matrix, nGenes);
    const idx = genes.map((g) => summary.geneIndex.get(g)).filter((g) => g != null);
    if (idx.length < 50) return null;
    const X = scaledExpression(matrix, idx, n);
    const P = pca(X, n, idx.length, 15).scores;
    const labels = summary.cells.map((c) => {
      const k = c.cell_id ? cloneOf.get(`${c.cell_id}`) : null;
      return k && !/^(normal|unassigned)$/i.test(`${k}`) ? `${k}` : null;
    });
    const train = labels.map((l, i) => (l ? i : -1)).filter((i) => i >= 0);
    const query = summary.cells.map((c, i) => (!c.cell_id ? i : -1)).filter((i) => i >= 0);
    if (train.length < 10) return { n, train, query, too_few: true };
    const loo = looAccuracy(P, train, labels, K);
    const calls = knnAssign(P, train, labels, query, K);
    return { n, train, query, labels, loo, baseline: baselineAccuracy(train, labels), calls };
  }, [summary, matrix, cloneOf, nGenes]);

  const bench = useMemo(() => {
    if (!summary || !matrix || cn.status !== "ok") return [];
    const arms = armsFromCytobands(cytobands, chromoBins || {});
    if (!arms.length) return [];
    const genePos = new Map();
    (geneOptions || []).forEach((o) => genePos.set(o.label, (Number(genesStartPoint[o.value]) + Number(genesEndPoint[o.value])) / 2));
    const rna = rnaArmScores(summary, matrix, genePos, arms);
    const dna = dnaArmCn(cn.data, arms);
    const armIdx = new Map(arms.map((a, i) => [a.name, i]));
    return rna.arms.map((name, j) => {
      const pairs = [];
      summary.cells.forEach((c, i) => {
        const d = c.cell_id ? dna.get(`${c.cell_id}`) : null;
        if (d && Number.isFinite(d[armIdx.get(name)])) pairs.push([rna.scores[j][i], d[armIdx.get(name)]]);
      });
      const sdDna = (() => {
        const v = pairs.map((p) => p[1]);
        const m = v.reduce((s, x) => s + x, 0) / Math.max(1, v.length);
        return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, v.length - 1));
      })();
      const rho = pairs.length >= 10 ? spearman(pairs.map((p) => p[0]), pairs.map((p) => p[1])) : null;
      return { arm: name, genes: rna.nGenes[j], n: pairs.length, rho, p: rho == null ? NaN : correlationP(rho, pairs.length), sdDna };
    });
  }, [summary, matrix, cn, cytobands, chromoBins, geneOptions, genesStartPoint, genesEndPoint]);

  if (!summary) return <Text type="secondary">No RNA for this patient.</Text>;
  if (!model) return <Text type="secondary">Not enough variable genes for a classifier.</Text>;

  const confident = (model.calls || []).filter((c) => c.conf >= 0.7);
  const assignedBy = {};
  confident.forEach((c) => (assignedBy[c.label] = (assignedBy[c.label] || 0) + 1));
  const addField = () => {
    const values = {};
    summary.cells.forEach((c, i) => {
      if (model.labels?.[i]) values[c.displayId] = model.labels[i];
    });
    (model.calls || []).forEach((c) => (values[summary.cells[c.idx].displayId] = c.conf >= 0.7 ? `${c.label} (RNA)` : "uncertain (RNA)"));
    dispatch(singleCellActions.addRnaField("clone_dna_or_rna", values, false));
  };
  const informative = bench.filter((b) => b.sdDna >= 0.3);
  const medRho = (() => {
    const v = informative.map((b) => b.rho).filter(Number.isFinite).sort((a, b) => a - b);
    return v.length ? v[v.length >> 1] : null;
  })();

  return (
    <Card size="small" title="DNA-anchored clone assignment from RNA">
      <Space direction="vertical" style={{ width: "100%" }} size="small">
        {model.too_few ? (
          <Text type="secondary">Fewer than 10 cells with both DNA clone and RNA: no classifier.</Text>
        ) : (
          <>
            <Row gutter={16}>
              <Col>
                <Statistic title="Training cells (DNA + RNA)" value={model.train.length} />
              </Col>
              <Col>
                <Statistic title={`Leave-one-out accuracy (k = ${K})`} value={pct(model.loo.accuracy)} />
              </Col>
              <Col>
                <Statistic title="Majority-clone baseline" value={pct(model.baseline)} />
              </Col>
              <Col>
                <Statistic title="RNA-only cells" value={model.query.length} />
              </Col>
              <Col>
                <Statistic title="… assigned (vote ≥ 70%)" value={confident.length} />
              </Col>
            </Row>
            <Space wrap size={[4, 4]}>
              {Object.entries(model.loo.perClone).map(([c, r]) => (
                <Tag key={c} color={cloneColors[c]}>
                  {c}: {r.correct}/{r.n} recovered
                </Tag>
              ))}
              {Object.entries(assignedBy).map(([c, k]) => (
                <Tag key={`a${c}`}>
                  RNA-only → {c}: {k}
                </Tag>
              ))}
              <Button size="small" onClick={addField} disabled={!model.calls?.length}>
                Add as UMAP colouring (clone_dna_or_rna)
              </Button>
            </Space>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Features: PCs 1–15 of the {nGenes} most variable genes. Accuracy near the baseline means the clones are not separable from
              expression, and the RNA-only assignments should not be used.
            </Text>
          </>
        )}
        <Text strong>RNA-inferred vs DNA copy number (same cells), per arm</Text>
        <Text type="secondary" style={{ fontSize: 12 }}>
          RNA score: mean centred log expression of the arm&apos;s expressed genes; DNA: arm CN minus the cell&apos;s baseline. Arms whose DNA CN
          varies (SD ≥ 0.3 copies) are the informative ones; median rho over them: {medRho == null ? "–" : medRho.toFixed(2)}.
        </Text>
        <Table
          size="small"
          rowKey="arm"
          dataSource={bench}
          pagination={{ pageSize: 12, size: "small" }}
          columns={[
            { title: "Arm", dataIndex: "arm" },
            { title: "Genes", dataIndex: "genes" },
            { title: "Cells", dataIndex: "n" },
            { title: "DNA CN SD", dataIndex: "sdDna", sorter: (a, b) => a.sdDna - b.sdDna, render: (x) => x.toFixed(2) },
            {
              title: "rho (RNA vs DNA)",
              dataIndex: "rho",
              defaultSortOrder: "descend",
              sorter: (a, b) => (a.rho ?? -2) - (b.rho ?? -2),
              render: (r, row) => (r == null ? "–" : <span style={{ opacity: row.sdDna >= 0.3 ? 1 : 0.5 }}>{r.toFixed(2)}</span>),
            },
            { title: "p", dataIndex: "p", render: (p) => formatP(p) || "–" },
          ]}
        />
      </Space>
    </Card>
  );
}
