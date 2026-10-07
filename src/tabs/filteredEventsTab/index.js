import React, { useState } from "react";
import Wrapper from "./index.style";
import FilteredEventsListPanel from "../../components/filteredEventsListPanel";
import {
  EventsToHeatmapBar,
  selectEventColumn,
  useIsSingleCellPatient,
} from "../../components/singleCell/eventsToHeatmap";

/**
 * Filtered events. On a single-cell patient's report the events can be picked
 * and shown on the Single-Cell heatmap.
 */
export default function FilteredEventsTab() {
  const singleCell = useIsSingleCellPatient();
  const [picked, setPicked] = useState(new Map()); // uid -> event
  const toggle = (record, on) =>
    setPicked((prev) => {
      const next = new Map(prev);
      if (on) next.set(record.uid, record);
      else next.delete(record.uid);
      return next;
    });
  if (!singleCell) {
    return (
      <Wrapper>
        <FilteredEventsListPanel />
      </Wrapper>
    );
  }
  return (
    <Wrapper>
      <EventsToHeatmapBar picked={picked} onClear={() => setPicked(new Map())} />
      <FilteredEventsListPanel additionalColumns={selectEventColumn(new Set(picked.keys()), toggle)} />
    </Wrapper>
  );
}
