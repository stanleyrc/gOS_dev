import React from "react";
import SignaturePanel from "../../components/singleCell/signaturePanel";
import SingleCellWrapper from "../../components/singleCell/index.style";

/**
 * SBS signatures of a single-cell patient's SNVs: precomputed
 * SigProfilerAssignment fits and quick fits in the browser of the sites
 * chosen in the SNV heatmap or seen in the selected cells.
 */
export default function SingleCellSignaturesTab() {
  return (
    <SingleCellWrapper>
      <SignaturePanel />
    </SingleCellWrapper>
  );
}
