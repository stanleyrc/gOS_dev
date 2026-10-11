import React from "react";
import { useSelector } from "react-redux";
import { Collapse } from "antd";
import PatientReportCard from "../../components/singleCell/patientReportCard";
import SingleCellWrapper from "../../components/singleCell/index.style";
import ScEventModal from "../../components/singleCell/scEventModal";
import ClonalHistoryCard from "../../components/singleCell/clonalHistoryCard";
import AmpTimingCard from "../../components/singleCell/ampTimingCard";
import BranchRatesCard from "../../components/singleCell/branchRatesCard";
import HelpDrawer from "../../components/singleCell/helpDrawer";
import { selectMergedEvents } from "../../redux/interpretations/selectors";
import PatientVignette from "../../components/singleCell/vignette/patientVignette";
import VignetteWrapper from "../../components/singleCell/vignette/vignette.style";

/** The open single-cell patient in brief (ranked, evidence-linked vignette), then the full driver report on demand. */
export default function SingleCellReportTab() {
  const { patient, cells, snv, signatures, cloneColors } = useSelector((state) => state.SingleCell);
  // events with the user's re-tiering applied; selectedEventUids is null until
  // "Add to report" is ticked in the Filtered Events table (then it decides the drivers)
  const events = useSelector((state) => selectMergedEvents(state).filteredEvents);
  const selectedUids = useSelector((state) => state.FilteredEvents.selectedEventUids);
  return (
    <SingleCellWrapper>
      <ScEventModal />
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <HelpDrawer />
      </div>
      <VignetteWrapper>
        <PatientVignette />
      </VignetteWrapper>
      <Collapse
        size="small"
        style={{ marginTop: 16 }}
        items={[
          {
            key: "full",
            label: "Full driver report: all tier 1-2 drivers, clone table, burden, signatures, RNA findings",
            children: (
              <PatientReportCard
                patient={patient?.caseReportId}
                events={events || []}
                cells={cells}
                variants={snv.status === "ok" ? snv.data?.variants || [] : []}
                signatures={signatures.status === "ok" ? signatures.data : null}
                cloneColors={cloneColors}
                selectedUids={selectedUids}
                interactive
              />
            ),
          },
        ]}
      />
      <div style={{ marginTop: 16 }}>
        <ClonalHistoryCard />
      </div>
      <div style={{ marginTop: 16 }}>
        <AmpTimingCard />
      </div>
      <div style={{ marginTop: 16 }}>
        <BranchRatesCard />
      </div>
    </SingleCellWrapper>
  );
}
