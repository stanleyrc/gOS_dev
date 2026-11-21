import { createContext, useContext } from "react";

/**
 * The track browser's shared locus state, read by every track (graph rows, coverage, header, and new track types
 * such as Hi-C heatmaps): { windows, setWindows, slots, scales, geometry: { leftW, gapX, contentW, trackLeft },
 * chromoBins, domains (gOS places per window) }. Provided by TrackBrowserPanel.
 */
export const TrackLocusContext = createContext(null);
export const useTrackLocus = () => useContext(TrackLocusContext);
