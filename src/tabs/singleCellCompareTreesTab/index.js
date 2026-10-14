import React from "react";
import CompareTreesPanel from "../../components/singleCell/compareTrees/compareTreesPanel";
import SingleCellWrapper from "../../components/singleCell/index.style";

/** Two phylogenies of the same cells side by side (tanglegram), with the same mutations painted on both. */
export default function SingleCellCompareTreesTab() {
  return (
    <SingleCellWrapper>
      <CompareTreesPanel />
    </SingleCellWrapper>
  );
}
