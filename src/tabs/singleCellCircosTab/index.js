import React from "react";
import CircosPanel from "../../components/singleCell/circosPanel";
import SingleCellWrapper from "../../components/singleCell/index.style";

/** Circos view of a single cell's genome graph. */
export default function SingleCellCircosTab() {
  return (
    <SingleCellWrapper>
      <CircosPanel />
    </SingleCellWrapper>
  );
}
