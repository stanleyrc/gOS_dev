import React from "react";
import { useDispatch, useSelector } from "react-redux";
import FilteredEventDetailsModal from "../filteredEventDetailsModal";
import filteredEventsActions from "../../redux/filteredEvents/actions";

/**
 * The alteration popup (same as a row of the Filtered Events table) rendered
 * in place on single-cell tabs: opens whenever an event is selected while
 * the Filtered Events / Overall tabs (which host their own copy) are not
 * active, so report rows, matrix names and drawers can open it anywhere.
 */
export default function ScEventModal() {
  const dispatch = useDispatch();
  const record = useSelector((s) => s.FilteredEvents.selectedFilteredEvent);
  const viewMode = useSelector((s) => s.FilteredEvents.viewMode);
  const tab = useSelector((s) => `${s.Settings.tab}`);
  const props = useSelector((s) => ({
    genome: s.Genome,
    mutations: s.Mutations,
    allelic: s.Allelic,
    chromoBins: s.Settings.chromoBins,
    genomeCoverage: s.GenomeCoverage,
    methylationBetaCoverage: s.MethylationBetaCoverage,
    methylationIntensityCoverage: s.MethylationIntensityCoverage,
    hetsnps: s.Hetsnps,
    genes: s.Genes,
    igv: s.Igv,
  }));
  // tabs 0 (Overall) and 1 (Filtered Events) render the table's own modal
  if (!record || tab === "0" || tab === "1") return null;
  return <FilteredEventDetailsModal open record={record} initialTab={viewMode || "plots"} onClose={() => dispatch(filteredEventsActions.selectFilteredEvent(null))} {...props} />;
}
