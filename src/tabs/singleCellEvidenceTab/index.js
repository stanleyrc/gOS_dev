import React, { useState } from "react";
import { Space, Tabs } from "antd";
import SingleCellWrapper from "../../components/singleCell/index.style";
import ErrorBoundary from "../../components/singleCell/errorBoundary";
import ReadSlicePanel from "../../components/singleCell/evidence/readSlicePanel";
import CellCycleCard from "../../components/singleCell/evidence/cellCycleCard";
import TelomereCard from "../../components/singleCell/evidence/telomereCard";
import PrecomputeStatusCard from "../../components/singleCell/evidence/precomputeStatusCard";
import CellFilterControl from "../../components/singleCell/evidence/cellFilterControl";
import FishPlotCard from "../../components/singleCell/evidence/fishPlotCard";
import ConvergenceCard from "../../components/singleCell/evidence/convergenceCard";
import MtdnaCard from "../../components/singleCell/evidence/mtdnaCard";
import FitnessCard from "../../components/singleCell/evidence/fitnessCard";
import RnaCloneCard from "../../components/singleCell/evidence/rnaCloneCard";
import IncoherenceCard from "../../components/singleCell/evidence/incoherenceCard";
import ControlsCard from "../../components/singleCell/evidence/controlsCard";
import TimingCard from "../../components/singleCell/evidence/timingCard";

const VIEWS = [
  { value: "reads", label: "Reads & genotypes" },
  { value: "cycle", label: "Cell cycle" },
  { value: "telomeres", label: "TERT & telomeres" },
  { value: "clones", label: "Clone growth" },
  { value: "timing", label: "Timing" },
  { value: "convergence", label: "Convergent events" },
  { value: "incoherence", label: "Amplicon incoherence" },
  { value: "mtdna", label: "mtDNA" },
  { value: "fitness", label: "Fitness" },
  { value: "rnaclone", label: "RNA → clone" },
  { value: "controls", label: "Normal-cell controls" },
  { value: "status", label: "Pipeline status" },
];

/** Precomputed evidence for a single-cell patient: read slices, targeted genotypes, S-phase, telomeres, pipeline status. */
export default function SingleCellEvidenceTab() {
  const [view, setView] = useState("reads");
  return (
    <SingleCellWrapper>
      <Space direction="vertical" style={{ width: "100%" }} size="small">
        <CellFilterControl />
        {/* tabs (not a segmented control): they scroll / fold into a menu instead of overflowing the page */}
        <Tabs size="small" activeKey={view} onChange={setView} items={VIEWS.map((v) => ({ key: v.value, label: v.label }))} style={{ marginBottom: -8 }} />
        <ErrorBoundary>
          {view === "reads" && <ReadSlicePanel />}
          {view === "cycle" && <CellCycleCard />}
          {view === "telomeres" && <TelomereCard />}
          {view === "clones" && <FishPlotCard />}
          {view === "timing" && <TimingCard />}
          {view === "convergence" && <ConvergenceCard />}
          {view === "incoherence" && <IncoherenceCard />}
          {view === "mtdna" && <MtdnaCard />}
          {view === "fitness" && <FitnessCard />}
          {view === "rnaclone" && <RnaCloneCard />}
          {view === "controls" && <ControlsCard />}
          {view === "status" && <PrecomputeStatusCard />}
        </ErrorBoundary>
      </Space>
    </SingleCellWrapper>
  );
}
