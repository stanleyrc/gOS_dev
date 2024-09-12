import actions from "./actions";
import { domainsToLocation, locationToDomains } from "../../helpers/utility";

const initState = {
  loading: false,
  filteredEvents: [],
  selectedFilteredEvent: null,
  error: null,
};

export default function appReducer(state = initState, action) {
  switch (action.type) {
    case actions.FETCH_FILTERED_EVENTS_REQUEST:
      return {
        ...state,
        pair: action.pair,
        error: null,
        filteredEvents: [],
        loading: true,
      };
    case actions.FETCH_FILTERED_EVENTS_SUCCESS:
      return {
        ...state,
        filteredEvents: action.filteredEvents,
        loading: false,
      };
    case actions.FETCH_FILTERED_EVENTS_FAILED:
      return {
        ...state,
        error: action.error,
        loading: false,
      };
    case actions.SELECT_FILTERED_EVENT:
      let urlGene = new URL(decodeURI(document.location));
      let selectedFilteredEvent = action.filteredEvent;
      if (selectedFilteredEvent) {
        let loc = `${selectedFilteredEvent.chromosome}:${selectedFilteredEvent.startPoint}-${selectedFilteredEvent.chromosome}:${selectedFilteredEvent.endPoint}`;
        let domsGene = locationToDomains(state.chromoBins, loc);
        // eliminate domains that are smaller than 10 bases wide
        if (domsGene.length > 1) {
          domsGene = domsGene.filter((d) => d[1] - d[0] > 10);
        }
        urlGene.searchParams.set("gene", selectedFilteredEvent.gene);
        urlGene.searchParams.set(
          "location",
          domainsToLocation(state.chromoBins, domsGene)
        );
        window.history.replaceState(
          unescape(urlGene.toString()),
          "Case Report",
          unescape(urlGene.toString())
        );
        return {
          ...state,
          selectedFilteredEvent,
          domains: domsGene,
          loading: false,
        };
      } else {
        // Remove the query parameter
        urlGene.searchParams.delete("gene");
        // Update the URL in the browser's history
        window.history.replaceState(
          null,
          "Case Report",
          unescape(urlGene.toString())
        );
        return {
          ...state,
          ...action.properties,
          selectedFilteredEvent: null,
          loading: false,
        };
      }
    default:
      return state;
  }
}
