import React from "react";
import TrackBrowserPanel from "../../components/singleCell/trackBrowser/trackBrowserPanel";

/** Single-cell track browser (brief cu, M1): stacked per-cell tracks in tree order on a shared locus, reads at junctions. */
export default function SingleCellTrackBrowserTab() {
  return (
    <div style={{ padding: 8 }}>
      <TrackBrowserPanel />
    </div>
  );
}
