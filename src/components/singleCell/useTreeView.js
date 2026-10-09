import { useMemo } from "react";
import { useSelector } from "react-redux";
import { clipLongBranches, longBranchCap, treeForCells } from "../../helpers/singleCell/newick";
import { excludedCellIds } from "../../helpers/singleCell/precompute";

/**
 * Displayed tree and row order, shared by every view aligned to the
 * phylogeny: hidden clones and QC-excluded cells (global cell filter) removed
 * (tree re-pruned) and long branches shortened, following the layout preferences.
 */
export default function useTreeView() {
  const { order: fullOrder, cells, tree, layout } = useSelector((state) => state.SingleCell);
  const cellById = useMemo(() => new Map(cells.map((c) => [c.cell_id, c])), [cells]);
  const excluded = useMemo(
    () => excludedCellIds(cells, layout.qcExcludeRules, layout.excludedCells),
    [cells, layout.qcExcludeRules, layout.excludedCells]
  );
  const hiddenKey = `${(layout.hiddenClones || []).join("|")}#${[...excluded].join("|")}`;
  return useMemo(() => {
    const hidden = new Set(layout.hiddenClones || []);
    let rows = fullOrder;
    let treeLayout = tree.status === "ok" ? tree.data?.layout || null : null;
    if (hidden.size || excluded.size) {
      rows = fullOrder.filter((id) => !hidden.has(cellById.get(id)?.clone_id) && !excluded.has(`${id}`));
      if (tree.status === "ok" && tree.data?.source) {
        const built = treeForCells(tree.data.source, rows);
        treeLayout = built.layout;
        rows = [...(built.layout?.leaves || []), ...rows.filter((id) => built.unplaced.includes(id))];
      }
    }
    if (treeLayout && layout.clipBranches) treeLayout = clipLongBranches(treeLayout, longBranchCap(treeLayout));
    return { order: rows, treeLayout, cellById, excluded };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullOrder, tree, cellById, hiddenKey, layout.clipBranches]);
}
