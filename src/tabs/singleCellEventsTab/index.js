import React from "react";
import SingleCellWrapper from "../../components/singleCell/index.style";
import ScErrorBoundary from "../../components/singleCell/errorBoundary";
import PatientEventsCatalog from "../../components/singleCell/events/patientEventsCatalog";

/** Per-patient Events tab: every amplification, deletion, SNV, fusion, complex SV and ecDNA walk of the open patient, searchable. */
export default function SingleCellEventsTab() {
  return (
    <SingleCellWrapper>
      <ScErrorBoundary>
        <PatientEventsCatalog />
      </ScErrorBoundary>
    </SingleCellWrapper>
  );
}
