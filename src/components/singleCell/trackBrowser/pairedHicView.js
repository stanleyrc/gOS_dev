import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, Popover, Radio, Space, Typography } from "antd";
import { ArrowDownOutlined, ArrowUpOutlined, OrderedListOutlined } from "@ant-design/icons";
import { resolveUrl } from "../../../helpers/singleCell/trackBrowser/trackSpec";
import { graphInWindows } from "../../../helpers/singleCell/trackBrowser/trackData";
import { DEFAULT_OVERLAYS, EAGLEC_URL, filterCalls, laneArcs, markColor } from "../../../helpers/singleCell/trackBrowser/eaglec";
import { TRACK_LABELS, moveTrack, orderFor, setUnitOrder } from "../../../helpers/singleCell/trackBrowser/pairedLayout";
import { sharedLabel } from "../../../helpers/singleCell/trackBrowser/hic";
import { HIC_URL, HicControls, HicHover, HicOverlayLegend, HicUnitMap, hicHeight, overlayCountText, useEaglec, useHicColorMax, useHicIndexes } from "./hicTrack";
import { CanvasRow, GraphPlotRow, NoteRow } from "./trackRow";
import { COLORS, setupCanvas } from "./draw";
import { TrackLocusContext, useTrackLocus } from "./locusContext";

const { Text } = Typography;

/** Junction lane of one unit: graph ALT edges (blue, solid) and EagleC calls (violet; dashed = not in the graph). */
function JunctionLane({ graph, eaglec, overlays, height, width }) {
  const L = useTrackLocus();
  const ref = useRef(null);
  useEffect(() => {
    const ctx = setupCanvas(ref.current, width, height);
    if (!ctx) return;
    const left = L.geometry.gapX;
    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath();
    ctx.moveTo(left, height - 1.5);
    ctx.lineTo(width - L.geometry.gapX, height - 1.5);
    ctx.stroke();
    const ov = overlays || DEFAULT_OVERLAYS;
    const alts = ov.graph?.on !== false && graph ? graphInWindows(graph, L.slots).alts : [];
    const calls = ov.eaglec?.on && eaglec?.status === "ok" ? filterCalls(eaglec.calls, ov.eaglec) : [];
    const arcs = laneArcs(alts, calls, L.slots);
    const base = height - 2;
    arcs.forEach((a) => {
      const isE = a.kind === "eaglec";
      ctx.strokeStyle = isE ? markColor(a.item.prob) : "rgba(31,95,191,0.85)";
      ctx.lineWidth = isE ? 1.6 : 1.8;
      ctx.setLineDash(isE && !a.item.inGraph ? [3, 2] : []);
      const x1 = left + a.x1;
      if (a.x2 == null) {
        // one breakend in the windows: a tick with an open end
        ctx.beginPath();
        ctx.moveTo(x1, base);
        ctx.lineTo(x1, base - height * 0.55);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x1, base - height * 0.55 - 3, 3, 0, 2 * Math.PI);
        ctx.stroke();
      } else {
        const x2 = left + a.x2;
        const h = Math.min(height - 6, Math.max(8, (x2 - x1) / 2));
        ctx.beginPath();
        ctx.moveTo(x1, base);
        ctx.bezierCurveTo(x1, base - h * 1.33, x2, base - h * 1.33, x2, base);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    });
    ctx.fillStyle = COLORS.muted;
    ctx.font = "10px system-ui, sans-serif";
    ctx.fillText(`${alts.length} graph junction${alts.length === 1 ? "" : "s"}${ov.eaglec?.on ? ` · ${eaglec?.status === "ok" ? calls.filter((c) => laneArcs([], [c], L.slots).length).length : "n/a"} EagleC` : ""} in view`, left + 4, 11);
  }, [graph, eaglec, overlays, height, width, L.slots, L.geometry.gapX]);
  return <canvas ref={ref} style={{ display: "block" }} />;
}

/** Per-unit track order editor: arrows on the default order ("same order for all units") or on this unit's override. */
function OrderEditor({ unit, layout, setLayout }) {
  const own = Boolean(layout.unitOrder?.per_unit?.[unit]);
  const [scope, setScope] = useState(own ? "unit" : "all");
  const order = scope === "unit" ? orderFor(layout.unitOrder, unit) : orderFor({ default: layout.unitOrder?.default }, null);
  const move = (t, dir) =>
    setLayout((l) => {
      if (scope === "unit") return { ...l, unitOrder: setUnitOrder(l.unitOrder, unit, moveTrack(orderFor(l.unitOrder, unit), t, dir)) };
      return { ...l, unitOrder: { ...l.unitOrder, default: moveTrack(l.unitOrder?.default, t, dir) } };
    });
  return (
    <div style={{ width: 250 }}>
      <Radio.Group
        size="small"
        value={scope}
        onChange={(e) => {
          setScope(e.target.value);
          if (e.target.value === "all") setLayout((l) => ({ ...l, unitOrder: setUnitOrder(l.unitOrder, unit, null) }));
          else setLayout((l) => ({ ...l, unitOrder: setUnitOrder(l.unitOrder, unit, orderFor(l.unitOrder, unit)) }));
        }}
      >
        <Radio value="all">same order for all units</Radio>
        <Radio value="unit">this unit only</Radio>
      </Radio.Group>
      <div style={{ marginTop: 6 }}>
        {order.map((t, i) => (
          <div key={t} style={{ display: "flex", alignItems: "center", gap: 4, padding: "1px 0" }}>
            <Button size="small" icon={<ArrowUpOutlined />} disabled={i === 0} onClick={() => move(t, -1)} aria-label={`move ${t} up`} />
            <Button size="small" icon={<ArrowDownOutlined />} disabled={i === order.length - 1} onClick={() => move(t, 1)} aria-label={`move ${t} down`} />
            <Text style={{ fontSize: 12 }}>{TRACK_LABELS[t]}</Text>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * "Hi-C with each graph": one row group per Hi-C unit, its contact map directly above (or in the chosen order with)
 * its genome graph, coverage and junction / EagleC lane, on the shared windows. Maps keep the shared x; the per-map
 * height slider applies. scalesFor(unitId) gives the graph y scales of the unit (per sample or shared).
 */
export default function PairedHicView({
  units, state, setState, layout, setLayout, dataPath, patient, genome, data, showGraph, showCov, graphH, covH, scalesFor,
  unitOf, narrow, sampleColor, groupOf, order, minFrac, onJunction, dataLabel, yNote,
}) {
  const L = useTrackLocus();
  const { geometry } = L;
  const { leftW, contentW } = geometry;
  const urlOf = (id) => resolveUrl(HIC_URL, { dataPath, patient, unit: id, genome });
  const eUrlOf = (id) => resolveUrl(EAGLEC_URL, { dataPath, patient, unit: id, genome });
  const picked = state.units.length ? state.units.filter((id) => units.some((u) => u.id === id)) : [];
  const shown = order ? [...picked].sort((a, b) => order.indexOf(a) - order.indexOf(b)) : picked;
  const indexes = useHicIndexes(shown, urlOf);
  const ov = state.overlays || DEFAULT_OVERLAYS;
  const eaglec = useEaglec(shown, eUrlOf, Boolean(ov.eaglec?.on));
  const groupFn = useMemo(() => groupOf || (() => "all"), [groupOf]);
  const { maxOf, onAutoMax } = useHicColorMax(shown, state.shareMax, groupFn);
  const [hover, setHover] = useState(null);
  const mapW = Math.max(10, contentW - 2 * geometry.gapX);
  const first = shown.map((id) => indexes.get(id)).find((v) => v?.status === "ok")?.index || null;
  const resList = first ? first.resolutions.map((r) => r.res).sort((a, b) => a - b) : [];
  const height = hicHeight(state, mapW, narrow);
  const samples = new Set(shown.map((id) => groupFn(id)));
  const rule = shown.map((id) => eaglec.get(id)?.meta?.rule).find(Boolean) || null;
  const laneH = 56;

  const track = (t, u) => {
    const id = u.id;
    if (t === "hic")
      return (
        <HicUnitMap key="hic" id={id} label={u.label} sublabel={u.sublabel} index={indexes.get(id)} urlOf={urlOf} state={state} graph={data.graphs.get(id) || null} eaglec={eaglec.get(id) || null} height={height} onHover={setHover} sharedMax={maxOf(id)} onAutoMax={onAutoMax} maxNote={state.shareMax === "per_sample" ? `shared within ${groupFn(id)}` : null} />
      );
    const body = (() => {
      if (t === "graph") {
        if (!showGraph) return null;
        const st = data.status.get(`graph:${id}`);
        if (st !== "ok") return <NoteRow text={st === "loading" || !st ? "graph: loading" : `graph not available (${u.notAvailable?.graph || "no complex.json for this unit"})`} width={contentW} height={32} />;
        return (
          <TrackLocusContext.Provider value={{ ...L, scales: scalesFor(id) }}>
            <GraphPlotRow raw={data.graphs.get(id)} height={graphH} width={contentW} minFrac={minFrac} onJunction={(j) => onJunction && onJunction(j, id)} />
          </TrackLocusContext.Provider>
        );
      }
      if (t === "coverage") {
        if (!showCov) return null;
        const st = data.status.get(`cov:${id}`);
        if (st && st !== "ok" && st !== "loading") return <NoteRow text={`coverage not available (${u.notAvailable?.coverage || "no coverage.arrow exported for this unit"})`} width={contentW} height={24} />;
        return <CanvasRow kind="cell" unit={unitOf(id)} row={{ id, group: u.cluster }} graph={data.graphs.get(id)} coverage={data.coverage.get(id)} graphH={0} covH={covH} width={contentW} covStatus={st} />;
      }
      if (t === "junctions") return <JunctionLane graph={data.graphs.get(id) || null} eaglec={eaglec.get(id) || null} overlays={ov} height={laneH} width={contentW} />;
      return null;
    })();
    if (!body) return null;
    return (
      <div key={t} style={{ position: "relative" }}>
        <div style={{ position: "absolute", left: 4, top: 2, width: leftW - 8, fontSize: 11, color: COLORS.muted, textAlign: "right" }}>{TRACK_LABELS[t]}</div>
        <div style={{ marginLeft: leftW }}>{body}</div>
      </div>
    );
  };

  return (
    <div data-hic-paired style={{ borderTop: "2px solid #c0392b", marginTop: 4, paddingTop: 4 }}>
      <Space wrap size={[8, 4]} style={{ marginBottom: 4 }}>
        <Text strong>Hi-C with each graph</Text>
        {dataLabel && <Text type="secondary">{dataLabel}</Text>}
      </Space>
      <HicControls state={state} setState={setState} units={units} shown={shown} resList={resList} mapW={mapW} height={height} narrow={narrow} perSample={samples.size > 1} />
      <HicOverlayLegend state={state} setState={setState} counts={ov.eaglec?.on ? overlayCountText(shown, eaglec, ov) : null} rule={rule} />
      <div style={{ fontSize: 12, color: "#555", marginBottom: 4 }}>
        Each unit&apos;s contact map sits with its own genome graph{showCov ? ", coverage" : ""} and junction lane on the shared windows (same x). Change the order with the order button of a unit (same order for all units, or this unit only). Hi-C color max: {sharedLabel(state.shareMax)}. {yNote}
      </div>
      {shown.map((id) => {
        const u = units.find((x) => x.id === id) || { id, label: id };
        return (
          <div key={id} data-hic-unit={id} style={{ border: "1px solid #e4e4e4", borderLeft: `6px solid ${sampleColor(u.sample) || "#999"}`, borderRadius: 3, margin: "6px 0", padding: "2px 0" }}>
            <Space size={8} style={{ padding: "0 6px" }}>
              <Text strong style={{ fontSize: 12 }}>{u.label}</Text>
              {u.sublabel && <Text type="secondary" style={{ fontSize: 12 }}>{u.sublabel}</Text>}
              <Popover trigger="click" title={`Track order · ${u.label}`} content={<OrderEditor unit={id} layout={layout} setLayout={setLayout} />}>
                <Button size="small" icon={<OrderedListOutlined />} data-order-button>{layout.unitOrder?.per_unit?.[id] ? "order (this unit)" : "order"}</Button>
              </Popover>
            </Space>
            {orderFor(layout.unitOrder, id).map((t) => track(t, u))}
          </div>
        );
      })}
      <HicHover hover={hover} />
    </div>
  );
}
