import React from "react";
import Wrapper from "./index.style";
import ScEventsPanel from "../../components/singleCell/scEventsPanel";

/** Filtered events; single-cell patients get the clade-fit column, strong-events switch and heatmap picks. */
export default function FilteredEventsTab() {
  return (
    <Wrapper>
      <ScEventsPanel />
    </Wrapper>
  );
}
