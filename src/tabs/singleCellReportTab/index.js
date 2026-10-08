import React from "react";
import { useSelector } from "react-redux";
import PatientReportCard from "../../components/singleCell/patientReportCard";
import SingleCellWrapper from "../../components/singleCell/index.style";
import ScEventModal from "../../components/singleCell/scEventModal";

/** Key findings of the open single-cell patient, with links into the heatmap and IGV. */
export default function SingleCellReportTab() {
  const { patient, cells, snv, signatures, cloneColors } = useSelector((state) => state.SingleCell);
  const events = useSelector((state) => state.FilteredEvents.filteredEvents);
  return (
    <SingleCellWrapper>
      <ScEventModal />
      <PatientReportCard
        patient={patient?.caseReportId}
        events={events || []}
        cells={cells}
        variants={snv.status === "ok" ? snv.data?.variants || [] : []}
        signatures={signatures.status === "ok" ? signatures.data : null}
        cloneColors={cloneColors}
        interactive
      />
    </SingleCellWrapper>
  );
}
