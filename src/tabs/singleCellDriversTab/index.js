import React from "react";
import DriverContrastPanel from "../../components/singleCell/drivers/driverContrastPanel";
import SingleCellWrapper from "../../components/singleCell/index.style";

/** Subclonal driver deep-dive: carriers of a driver vs matched non-carriers of the same tumor. */
export default function SingleCellDriversTab() {
  return (
    <SingleCellWrapper>
      <DriverContrastPanel />
    </SingleCellWrapper>
  );
}
