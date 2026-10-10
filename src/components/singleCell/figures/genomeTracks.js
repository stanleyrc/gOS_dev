import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { Checkbox, Space, Typography } from "antd";
import GenesPanel from "../../genesPanel";
import WalksPlot from "../ecdna/walksPlot";
import { TrackPlot } from "../cellTracksPanel";
import { loadCellTrack } from "../../../redux/singleCell/loaders";
import { walkFamilies } from "../../../helpers/singleCell/walks";

const { Text } = Typography;

// Geometry of the gOS panels, so their genome axis sits exactly over the
// figure's CN heatmap columns [cnX, cnX + cnW):
//  - GenesPanel / GenomePanel / ScatterPlotPanel: card border 1 + body
//    padding 12, then a 50 px plot margin each side (GenomePanel's plot is
//    27 px narrower than its card body; Genes' is not, hence +1 on the right).
//  - WalksPlot: genome starts at labelWidth + 50 + 10 and is
//    width - labelWidth - rightWidth - 100 wide.
const CARD_LEFT = 63;
const CARD_EXTRA = 127;
const TRACKS = [
  { value: "genes", label: "Genes" },
  { value: "walks", label: "ecDNA walks" },
  { value: "total", label: "CN graph (JaBbA)" },
  { value: "coverage", label: "Coverage (large files)" },
];

/**
 * Figure panel B: the report's own genome tracks (genes, PGV-style walk
 * lanes, each cell's JaBbA genome graph and read-depth coverage) for the
 * figure's genome windows (the Settings domains), drawn so their genome axis
 * lines up with the CN heatmap above. Tracks toggle; the cells are the
 * selection (up to 3) or the given representatives.
 */
export default function GenomeTracks({ width, cnX, cnW, walks = [], colorOf, nameOf, cells = [], cellNote, focusId, onFocus }) {
  const [tracks, setTracks] = useState(["genes", "walks", "total"]);
  const dataset = useSelector((s) => s.Settings.dataset);
  const chromoBins = useSelector((s) => s.Settings.chromoBins);
  const domains = useSelector((s) => s.Settings.domains);
  // display names for the walk lanes (the paper's names where mapped)
  const lanes = useMemo(() => walks.map((w) => ({ ...w, label: nameOf ? nameOf(w) : w.label })), [walks, nameOf]);
  const families = useMemo(() => walkFamilies(lanes), [lanes]);

  const [data, setData] = useState({});
  const cellKey = cells.map((c) => c.id).join("|");
  useEffect(() => {
    let alive = true;
    if (!dataset) return undefined;
    cells.forEach(({ id }) =>
      ["total", "coverage"]
        .filter((t) => tracks.includes(t) && !data[`${id}/${t}`])
        .forEach((t) =>
          loadCellTrack(dataset, id, t, chromoBins).then((res) => {
            if (alive) setData((d) => ({ ...d, [`${id}/${t}`]: res }));
          })
        )
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cellKey, tracks.join("|"), dataset, chromoBins]);
  // the gOS panels measure their width on mount / window resize only
  useEffect(() => {
    const frame = requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    return () => cancelAnimationFrame(frame);
  }, [cnX, cnW, width, tracks.length, cellKey]);

  const cardStyle = { marginLeft: Math.max(0, cnX - CARD_LEFT), width: cnW + CARD_EXTRA, maxWidth: "100%" };
  const commonRangeY = null;
  return (
    <div className="sc-fig-gtracks">
      <Space size={12} wrap style={{ marginBottom: 6 }}>
        <Checkbox.Group value={tracks} onChange={setTracks} options={TRACKS} />
        {cellNote && <Text type="secondary" style={{ fontSize: 12 }}>{cellNote}</Text>}
      </Space>
      {tracks.includes("genes") && (
        <div style={cardStyle}>
          <GenesPanel />
        </div>
      )}
      {tracks.includes("walks") && lanes.length > 0 && (
        <div style={{ width }}>
          <WalksPlot walks={lanes} families={families} colorOf={colorOf} focus={focusId} onFocus={onFocus} labelWidth={Math.max(0, cnX - 60)} rightWidth={Math.max(0, width - cnX - cnW - 40)} laneHeight={18} />
        </div>
      )}
      {cells.map(({ id, why }) =>
        ["total", "coverage"]
          .filter((t) => tracks.includes(t))
          .map((t) => {
            const res = data[`${id}/${t}`];
            return (
              <div key={`${id}/${t}`} style={{ ...cardStyle, marginTop: 6 }} title={why}>
                <TrackPlot cellId={id} track={t} data={res?.data} status={res ? res.status : "loading"} error={res?.error} chromoBins={chromoBins} commonRangeY={commonRangeY} height={150} />
              </div>
            );
          })
      )}
      {!domains?.length && <Text type="secondary">No genome windows.</Text>}
    </div>
  );
}
