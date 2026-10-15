import React from "react";
import QcPanel from "../../components/singleCell/qcPanel";
import SingleCellWrapper from "../../components/singleCell/index.style";
import CovQcCard from "../../components/singleCell/covQcCard";
import CellFilterControl from "../../components/singleCell/evidence/cellFilterControl";

/** Per-cell QC of a single-cell patient (library metrics and copy-number metrics). */
export default function SingleCellQcTab() {
  return (
    <SingleCellWrapper>
      <CellFilterControl />
      <div style={{ height: 8 }} />
      <CovQcCard />
      <div style={{ height: 8 }} />
      <QcPanel />
    </SingleCellWrapper>
  );
}
