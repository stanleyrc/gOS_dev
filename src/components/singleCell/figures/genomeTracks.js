import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { Checkbox, InputNumber, Select, Space, Typography } from "antd";
import GenesPlot from "../../genesPlotHiglass";
import WalksPlot from "../ecdna/walksPlot";
import { TrackPlot } from "../cellTracksPanel";
import { loadCellTrack } from "../../../redux/singleCell/loaders";
import { walkFamilies } from "../../../helpers/singleCell/walks";
import { Y_MODES, Y_MODE_LABELS, cellTrackRanges, parseYAxis } from "../../../helpers/singleCell/trackScale";

const { Text } = Typography;

// Geometry of the gOS panels, so their genome axis sits exactly over the
// figure's CN heatmap columns [cnX, cnX + cnW):
//  - GenomePanel / ScatterPlotPanel: card border 1 + body padding 12, then
//    a 50 px plot margin each side (the plot is 27 px narrower than the card).
//  - GenesPlot (higlass): a bare plot with 50 px margins.
//  - WalksPlot: genome starts at labelWidth + 50 + 10 and is
//    width - labelWidth - rightWidth - 100 wide.
const CARD_LEFT = 63;
const CARD_EXTRA = 127;
const GENES_H = 110;
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
  const [yAx, setYAx] = useState(() => {
    try {
      return parseYAxis(new URLSearchParams(window.location.search).get("yax")) || { mode: "shared", custom: null };
    } catch (e) {
      return { mode: "shared", custom: null };
    }
  });
  const dataset = useSelector((s) => s.Settings.dataset);
  const chromoBins = useSelector((s) => s.Settings.chromoBins);
  const domains = useSelector((s) => s.Settings.domains);
  const genesList = useSelector((s) => s.Genes?.list || []);
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

  const rangesFor = (id) => {
    const raw = data[`${id}/total`]?.data;
    const cov = data[`${id}/coverage`]?.data;
    const intervals = raw?.intervals?.map((iv) => {
      const bin = chromoBins?.[`${iv.chromosome}`];
      return bin ? { startPlace: bin.startPlace + iv.startPoint - 1, endPlace: bin.startPlace + iv.endPoint - 1, y: iv.y } : null;
    }).filter(Boolean);
    return cellTrackRanges({ intervals, covX: cov?.dataPointsX, covY: cov?.dataPointsY1, hasFit: Boolean(cov?.hasFit), windows: domains || [], mode: yAx.mode, custom: yAx.custom });
  };
  const cardStyle = { marginLeft: Math.max(0, cnX - CARD_LEFT), width: cnW + CARD_EXTRA, maxWidth: "100%" };
  const commonRangeY = null;
  return (
    <div className="sc-fig-gtracks">
      <Space size={12} wrap style={{ marginBottom: 6 }}>
        <Checkbox.Group value={tracks} onChange={setTracks} options={TRACKS} />
        <Space size={4} data-yaxis-control>
          <Text type="secondary" style={{ fontSize: 12 }}>y-axis</Text>
          <Select size="small" style={{ width: 140 }} value={yAx.mode} onChange={(mode) => setYAx({ mode, custom: mode === "custom" ? yAx.custom || 10 : null })} options={Y_MODES.map((m) => ({ value: m, label: Y_MODE_LABELS[m] }))} />
          {yAx.mode === "custom" && <InputNumber size="small" min={1} style={{ width: 70 }} value={yAx.custom} onChange={(v) => v > 0 && setYAx({ mode: "custom", custom: v })} />}
          {yAx.mode === "window" && <Text type="secondary" style={{ fontSize: 12 }}>y per window</Text>}
        </Space>
        {cellNote && <Text type="secondary" style={{ fontSize: 12 }}>{cellNote}</Text>}
      </Space>
      {tracks.includes("genes") && genesList.length > 0 && domains?.length > 0 && (
        // the report's gene track (50 px plot margins, like the heatmap's genomic columns)
        <div style={{ marginLeft: Math.max(0, cnX - 50), width: cnW + 100, height: GENES_H, position: "relative" }}>
          <GenesPlot {...{ width: cnW + 100, height: GENES_H, domains, genesList }} />
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
            const wr = rangesFor(id);
            return (
              <div key={`${id}/${t}`} style={{ ...cardStyle, marginTop: 6 }} title={why}>
                <TrackPlot cellId={id} track={t} data={res?.data} status={res ? res.status : "loading"} error={res?.error} chromoBins={chromoBins} commonRangeY={wr ? null : commonRangeY} windowRangesY={wr ? wr[t] : null} height={150} />
              </div>
            );
          })
      )}
      {!domains?.length && <Text type="secondary">No genome windows.</Text>}
    </div>
  );
}
