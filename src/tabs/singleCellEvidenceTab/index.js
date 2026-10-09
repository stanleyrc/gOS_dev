import React, { useState } from "react";
import { Segmented, Space } from "antd";
import SingleCellWrapper from "../../components/singleCell/index.style";
import ErrorBoundary from "../../components/singleCell/errorBoundary";
import ReadSlicePanel from "../../components/singleCell/evidence/readSlicePanel";
import CellCycleCard from "../../components/singleCell/evidence/cellCycleCard";
import TelomereCard from "../../components/singleCell/evidence/telomereCard";
import PrecomputeStatusCard from "../../components/singleCell/evidence/precomputeStatusCard";

const VIEWS = [
  { value: "reads", label: "Reads & genotypes" },
  { value: "cycle", label: "Cell cycle (DNA vs RNA)" },
  { value: "telomeres", label: "TERT & telomeres" },
  { value: "status", label: "Pipeline status" },
];

/** Precomputed evidence for a single-cell patient: read slices, targeted genotypes, S-phase, telomeres, pipeline status. */
export default function SingleCellEvidenceTab() {
  const [view, setView] = useState("reads");
  return (
    <SingleCellWrapper>
      <Space direction="vertical" style={{ width: "100%" }} size="small">
        <Segmented options={VIEWS} value={view} onChange={setView} />
        <ErrorBoundary>
          {view === "reads" && <ReadSlicePanel />}
          {view === "cycle" && <CellCycleCard />}
          {view === "telomeres" && <TelomereCard />}
          {view === "status" && <PrecomputeStatusCard />}
        </ErrorBoundary>
      </Space>
    </SingleCellWrapper>
  );
}
