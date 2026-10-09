import { useMemo } from "react";
import { useSelector } from "react-redux";
import { geneValues } from "../../../helpers/singleCell/staticRna";
import { heritabilityLabel, signalTable, treeWeights } from "../../../helpers/singleCell/heritability";

/**
 * Tree weights over the tumour cells that have both a place on the DNA tree and
 * an RNA profile (normal cells excluded: they would make every tumour-vs-normal
 * gene look heritable). Null without a tree or with fewer than 8 such cells.
 */
export function useTumourTreeWeights(summary) {
  const { tree, cells } = useSelector((s) => s.SingleCell);
  const layout = tree?.status === "ok" ? tree.data?.layout : null;
  return useMemo(() => {
    if (!layout || !summary) return null;
    const normal = new Set(cells.filter((c) => /^normal$/i.test(`${c.clone_id || ""}`)).map((c) => `${c.cell_id}`));
    const withRna = new Set(summary.cells.map((c) => `${c.displayId}`));
    const ids = layout.leaves.map(String).filter((id) => !normal.has(id) && withRna.has(id));
    if (ids.length < 8) return null;
    return treeWeights(layout, ids);
  }, [layout, summary, cells]);
}

/**
 * Phylogenetic signal (Moran's I on the DNA tree, analytic test, BH across the
 * genes asked for) of each gene's expression: Map gene -> { I, z, p, q, label }.
 * Capped at `max` genes to keep the table responsive.
 */
export default function useGeneHeritability(summary, matrix, genes, { max = 400 } = {}) {
  const w = useTumourTreeWeights(summary);
  const key = genes.slice(0, max).join("|");
  return useMemo(() => {
    const out = new Map();
    if (!w || !matrix || !summary || !genes.length) return out;
    const rowOf = new Map(summary.cells.map((c, k) => [`${c.displayId}`, k]));
    const rows = w.ids.map((id) => rowOf.get(id));
    const feats = genes.slice(0, max).map((gene) => {
      const g = summary.geneIndex.get(gene);
      if (g == null) return { key: gene, values: {} };
      const dense = geneValues(matrix, summary.cells.length, g);
      const values = {};
      w.ids.forEach((id, i) => (values[id] = dense[rows[i]]));
      return { key: gene, values };
    });
    signalTable(w, feats).forEach((r) => out.set(r.key, { ...r, label: heritabilityLabel(r) }));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, matrix, summary, key]);
}
