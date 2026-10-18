import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { Alert, Typography } from "antd";
import { SingleCellEventTracks } from "../eventCellTracks";
import { loadCellTrack } from "../../../redux/singleCell/loaders";
import { carrierCells, chooseCarrierCell, footprintLocation, junctionSupport, MAX_SCANNED_CARRIERS, parseFootprint, EVENT_JUNCTION_COLOR } from "../../../helpers/singleCell/complexZoom";

const { Text } = Typography;

/**
 * "Zoom to a carrier cell" for a complex SV driver (rDelDup, DM, TIC ...):
 * the genome graph, coverage and (toggle) reads of one carrier cell over the
 * event footprint, as for fusions. The default cell is the one the event was
 * called in when it carries it, else the carrier with the most ALT junction
 * weight in the footprint (scanned over the first carriers' complex.json).
 */
export default function ComplexCellZoom({ event }) {
  const dataset = useSelector((s) => s.Settings.dataset);
  const chromoBins = useSelector((s) => s.Settings.chromoBins);
  const carriers = useMemo(() => carrierCells(event), [event]);
  const location = useMemo(() => footprintLocation(event?.Genome_Location), [event]);
  const [support, setSupport] = useState(null);
  useEffect(() => {
    let alive = true;
    setSupport(null);
    if (!dataset || !carriers.length || !location) return undefined;
    const scan = carriers.slice(0, MAX_SCANNED_CARRIERS);
    Promise.all(scan.map((id) => loadCellTrack(dataset, id, "total", chromoBins).then((res) => [id, res.status === "ok" ? junctionSupport(res.data, location) : null]))).then((rows) => {
      if (alive) setSupport(new Map(rows.filter((r) => r[1])));
    });
    return () => {
      alive = false;
    };
  }, [dataset, carriers, location, chromoBins]);
  const notes = useMemo(() => new Map([...(support || new Map())].map(([id, s]) => [id, `${s.count} event junction${s.count === 1 ? "" : "s"}${s.weight ? `, CN ${Math.round(s.weight * 10) / 10}` : ""}`])), [support]);
  const record = useMemo(() => ({ ...event, location, actualLocation: location }), [event, location]);
  if (!carriers.length) return <Alert type="info" showIcon message="Genome graph not available (no carrier cells are listed for this event)." />;
  if (!parseFootprint(event?.Genome_Location).length) return <Alert type="info" showIcon message={`Genome graph not available (cannot read the event footprint "${event?.Genome_Location || ""}").`} />;
  if (!support) return <Text type="secondary">Scanning carrier cells' genome graphs...</Text>;
  const focus = chooseCarrierCell(event, carriers, support);
  return (
    <div data-complex-zoom>
      <Text type="secondary" style={{ display: "block", marginBottom: 6 }}>
        {`${event.vartype || "Complex event"} footprint ${parseFootprint(event.Genome_Location).map((iv) => `chr${iv.chromosome}:${iv.start.toLocaleString()}-${iv.end.toLocaleString()}`).join(", ")}. `}
        {support.size < Math.min(carriers.length, MAX_SCANNED_CARRIERS) ? `${Math.min(carriers.length, MAX_SCANNED_CARRIERS) - support.size} carrier(s) have no genome graph. ` : ""}
        <span style={{ color: EVENT_JUNCTION_COLOR, fontWeight: 600 }}>purple = this event's junctions</span> (ALT junctions with a breakpoint inside the footprint); other ALT junctions stay red, REF grey.
      </Text>
      <SingleCellEventTracks record={record} focusCell={focus} cellNotes={notes} />
    </div>
  );
}
