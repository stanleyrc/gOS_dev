import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Button, Card, Space, Table, Tag, Typography } from "antd";
import singleCellActions from "../../../redux/singleCell/actions";
import { loadRnaMatrix } from "../../../redux/singleCell/loaders";
import { pca, scaledExpression } from "../../../helpers/singleCell/rnaStats";
import { topVariableGenes } from "../../../helpers/singleCell/staticRna";
import { PC_NUMERIC_LABELS } from "../../../helpers/singleCell/precompute";
import { alteredFraction, noiseFloor, normalNeighbourFraction } from "../../../helpers/singleCell/controls";

const { Text } = Typography;
const fmt = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : "–");
const isNormalClone = (c) => /^normal$/i.test(`${c?.clone_id || ""}`);
const isMalignantType = (t) => /malignant|tumou?r/i.test(`${t || ""}`);

/**
 * Non-tumour cells as internal controls. (1) Noise floor: per-cell metrics in
 * the diploid normal cells against the tumour cells; the fraction of the genome
 * called altered in a normal cell estimates the false-positive copy-number
 * rate, its dropout and MAPD the technical floor. (2) Tumour cells (by DNA)
 * whose expression is closer to the non-malignant cells than to the other
 * malignant cells: infiltrating tumour cells that RNA alone would call normal.
 */
export default function ControlsCard() {
  const dispatch = useDispatch();
  const { cells, cn, rna, cloneColors, patient } = useSelector((s) => s.SingleCell);
  const dataset = useSelector((s) => s.Settings.dataset);
  const chromoBins = useSelector((s) => s.Settings.chromoBins);
  const [matrix, setMatrix] = useState(null);
  const summary = rna?.status === "ok" ? rna.data : null;
  useEffect(() => {
    if (!summary || !patient || !dataset) return undefined;
    let live = true;
    loadRnaMatrix(dataset, patient.caseReportId).then((m) => live && setMatrix(m)).catch(() => {});
    return () => {
      live = false;
    };
  }, [summary, patient, dataset]);

  const fga = useMemo(() => (cn.status === "ok" && chromoBins ? alteredFraction(cn.data, chromoBins) : new Map()), [cn, chromoBins]);
  const floor = useMemo(() => {
    const metrics = [
      { key: "fga", label: "Genome altered vs baseline (false-positive CN rate in normals)", get: (c) => fga.get(`${c.cell_id}`) },
      { key: "snv_count", label: "SNVs called" },
      { key: "junction_count", label: "Junctions called" },
      ...Object.entries(PC_NUMERIC_LABELS).map(([key, label]) => ({ key, label })),
    ];
    return noiseFloor(cells, metrics, isNormalClone).filter((r) => r.nNormal > 0 && r.nTumour > 0);
  }, [cells, fga]);
  const nNormal = cells.filter(isNormalClone).length;

  const likeness = useMemo(() => {
    if (!summary || !matrix) return null;
    const n = summary.cells.length;
    const byId = new Map(cells.map((c) => [`${c.cell_id}`, c]));
    const normalRows = [];
    const tumourRows = [];
    const query = [];
    summary.cells.forEach((c, i) => {
      const dna = c.cell_id ? byId.get(`${c.cell_id}`) : null;
      if (dna && isNormalClone(dna)) normalRows.push(i);
      else if (!dna && c.Cell_Type && !isMalignantType(c.Cell_Type)) normalRows.push(i);
      if (dna && !isNormalClone(dna)) {
        tumourRows.push(i);
        query.push(i);
      }
    });
    if (normalRows.length < 3 || tumourRows.length < 5) return { normalRows, tumourRows, rows: [] };
    const genes = topVariableGenes(summary, matrix, 500);
    const idx = genes.map((g) => summary.geneIndex.get(g)).filter((g) => g != null);
    const X = scaledExpression(matrix, idx, n);
    const P = pca(X, n, idx.length, 15).scores;
    const res = normalNeighbourFraction(P, normalRows, tumourRows, query, 15).map((r) => ({ ...r, score: r.fraction }));
    const rows = res
      .map((r) => {
        const c = summary.cells[r.row];
        const dna = byId.get(`${c.cell_id}`);
        return { id: `${c.cell_id}`, clone: dna?.clone_id, cellType: c.Cell_Type, ...r, fga: fga.get(`${c.cell_id}`) };
      })
      .sort((a, b) => b.score - a.score);
    return { normalRows, tumourRows, rows };
  }, [summary, matrix, cells, fga]);

  const flagged = (likeness?.rows || []).filter((r) => r.score >= 0.5);
  return (
    <Card size="small" title="Non-tumour cells as internal controls">
      <Space direction="vertical" style={{ width: "100%" }} size="small">
        <Text strong>Noise floor ({nNormal} normal cells by DNA)</Text>
        {nNormal > 0 && !floor.some((r) => r.key === "fga") && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            The normal cells have no copy-number profiles (no JaBbA graphs), so the false-positive copy-number rate cannot be measured here.
          </Text>
        )}
        {nNormal === 0 ? (
          <Text type="secondary">No normal cells on the DNA tree for this patient.</Text>
        ) : (
          <Table
            size="small"
            rowKey="key"
            pagination={false}
            dataSource={floor}
            columns={[
              { title: "Metric", dataIndex: "label" },
              { title: "Normal cells (median)", key: "n", render: (_, r) => `${fmt(r.normal)} (n = ${r.nNormal})` },
              { title: "Tumour cells (median)", key: "t", render: (_, r) => `${fmt(r.tumour)} (n = ${r.nTumour})` },
              { title: "Tumour / normal", key: "r", render: (_, r) => (r.normal > 0 ? fmt(r.tumour / r.normal, 2) : "–") },
            ]}
          />
        )}
        <Text strong>Tumour cells that look normal by expression</Text>
        {!summary ? (
          <Text type="secondary">No RNA for this patient.</Text>
        ) : !likeness ? (
          <Text type="secondary">Loading the expression matrix…</Text>
        ) : likeness.normalRows.length < 3 ? (
          <Text type="secondary">
            Fewer than 3 non-malignant cells with RNA ({likeness.normalRows.length}): no normal reference profile for this patient.
          </Text>
        ) : (
          <>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Score = share of non-malignant cells among the cell&apos;s 15 nearest neighbours in expression space (PCs 1–15 of the 500 most
              variable genes); reference: {likeness.normalRows.length} non-malignant cells (DNA normal or RNA cell type),{" "}
              {likeness.tumourRows.length} DNA-tumour cells. ≥ 0.5 = the cell sits among normal cells; with an altered genome these are tumour
              cells RNA alone would miss.
            </Text>
            <Space>
              <Tag color={flagged.length ? "orange" : "default"}>{flagged.length} DNA-tumour cells among normal cells by expression</Tag>
              <Button size="small" disabled={!flagged.length} onClick={() => dispatch(singleCellActions.updateSelection(flagged.map((r) => r.id)))}>
                select them
              </Button>
            </Space>
            <Table
              size="small"
              rowKey="id"
              dataSource={likeness.rows}
              pagination={{ pageSize: 10, size: "small" }}
              columns={[
                { title: "Cell", dataIndex: "id", ellipsis: true },
                { title: "Clone (DNA)", dataIndex: "clone", render: (c) => <Tag color={cloneColors[c]}>{c}</Tag> },
                { title: "RNA cell type", dataIndex: "cellType", render: (t) => t || "–" },
                { title: "Genome altered", dataIndex: "fga", render: (x) => fmt(x, 2) },
                {
                  title: "Normal neighbours",
                  dataIndex: "score",
                  defaultSortOrder: "descend",
                  sorter: (a, b) => a.score - b.score,
                  render: (x) => <Text type={x >= 0.5 ? "warning" : undefined}>{Number.isFinite(x) ? `${Math.round(100 * x)}%` : "–"}</Text>,
                },
              ]}
            />
          </>
        )}
      </Space>
    </Card>
  );
}
