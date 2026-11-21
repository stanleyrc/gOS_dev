import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Alert, Button, Card, Input, Space, Tag, Typography } from "antd";
import useContainerWidth from "../useContainerWidth";
import singleCellActions from "../../../redux/singleCell/actions";
import { casePath, tryGet } from "../../../redux/singleCell/loaders";
import { resolveUrl } from "../../../helpers/singleCell/trackBrowser/trackSpec";
import { formatLocus, layoutWindows, parseLocus, placesToWindow, windowToPlaces } from "../../../helpers/singleCell/trackBrowser/locus";
import { DEFAULT_OVERLAYS, EAGLEC_URL } from "../../../helpers/singleCell/trackBrowser/eaglec";
import { hicStateFromTrack, sharedLabel } from "../../../helpers/singleCell/trackBrowser/hic";
import {
  DEFAULT_HIC_LOCUS, HIC_DATASET_LABEL, cellRowOrder, cnBinsOf, decodeCellsCn, hicUnitList, hicWindowsFromView, mapLabel, orderUnits,
  reportHasHic, sampleColors, samplesOf, unitsForSelection, validateCellsCn, validateUnits,
} from "../../../helpers/singleCell/hicUnits";
import { TrackLocusContext } from "../trackBrowser/locusContext";
import { HIC_URL, HicControls, HicHover, HicOverlayLegend, HicUnitMap, hicHeight, overlayCountText, useEaglec, useHicColorMax, useHicIndexes } from "../trackBrowser/hicTrack";
import { setupCanvas } from "../trackBrowser/draw";

const { Text } = Typography;

function urlParam(name) {
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch (e) {
    return null;
  }
}

// copy-number colors of the per-cell heat map (relative CN: 2 = white)
function cnRgb(v) {
  if (!Number.isFinite(v)) return [235, 235, 235];
  if (v < 2) {
    const t = Math.max(0, Math.min(1, (2 - v) / 2));
    return [Math.round(255 - 180 * t), Math.round(255 - 130 * t), 255];
  }
  const t = Math.max(0, Math.min(1, Math.log2(v / 2) / 3));
  return [255, Math.round(255 - 200 * t), Math.round(255 - 220 * t)];
}

/**
 * Per-cell copy number heat map (gos-hic-cellcn/1) with a cluster bar and a sample bar, over the panel's windows.
 * Click a row: select its cluster; drag across a window: set the region to the brushed span.
 */
function CellCnHeatmap({ cn, units, unitOrder, sampleColor, slots, left, width, onPickUnit, onBrush }) {
  const ref = useRef(null);
  const order = useMemo(() => cellRowOrder(cn, unitOrder), [cn, unitOrder]);
  const rowH = Math.max(1, Math.min(4, Math.floor(360 / Math.max(1, order.length))));
  const H = Math.max(40, order.length * rowH);
  const unitOf = useMemo(() => {
    const m = new Map();
    units.forEach((u) => {
      m.set(u.id, u);
      m.set(u.folder, u);
    });
    return m;
  }, [units]);
  const clusterColors = useMemo(() => {
    const pal = ["#4e79a7", "#f28e2b", "#59a14f", "#e15759", "#b07aa1", "#76b7b2", "#edc948", "#ff9da7", "#9c755f", "#bab0ac"];
    const out = {};
    unitOrder.forEach((u, i) => {
      out[u] = pal[i % pal.length];
    });
    return out;
  }, [unitOrder]);
  useEffect(() => {
    const ctx = setupCanvas(ref.current, width, H);
    if (!ctx) return;
    ctx.clearRect(0, 0, width, H);
    order.forEach((ci, r) => {
      const cell = cn.cells[ci];
      const u = unitOf.get(cell.unit);
      const y = r * rowH;
      ctx.fillStyle = sampleColor(cell.sample || u?.sample) || "#bbb";
      ctx.fillRect(left - 26, y, 10, rowH);
      ctx.fillStyle = clusterColors[u?.id] || "#999";
      ctx.fillRect(left - 14, y, 10, rowH);
      slots.forEach((s) => {
        const bins = cnBinsOf(cn, s.window);
        if (!bins) return;
        const [b0, b1] = bins;
        const n = b1 - b0 + 1;
        for (let b = b0; b <= b1; b += 1) {
          const x0 = left + s.x0 + ((b - b0) / n) * s.width;
          const [R, G, B] = cnRgb(cn.values[ci * cn.nBins + b]);
          ctx.fillStyle = `rgb(${R},${G},${B})`;
          ctx.fillRect(x0, y, Math.max(1, s.width / n + 0.5), rowH);
        }
      });
    });
  }, [cn, order, rowH, H, width, left, slots, unitOf, sampleColor, clusterColors]);
  const drag = useRef(null);
  const at = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const slotAt = (x) => slots.findIndex((s) => x >= left + s.x0 && x <= left + s.x0 + s.width);
  return (
    <div>
      <canvas
        ref={ref}
        data-hic-cellcn
        style={{ display: "block", cursor: "crosshair" }}
        onMouseDown={(e) => {
          const [x, y] = at(e);
          drag.current = { x, y, k: slotAt(x) };
        }}
        onMouseUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d) return;
          const [x, y] = at(e);
          if (Math.abs(x - d.x) > 6 && d.k >= 0) {
            const s = slots[d.k];
            const bp = (px) => Math.round(s.window.start + ((Math.max(left + s.x0, Math.min(left + s.x0 + s.width, px)) - left - s.x0) / s.width) * (s.window.end - s.window.start));
            onBrush({ chrom: s.window.chrom, start: Math.min(bp(d.x), bp(x)), end: Math.max(bp(d.x), bp(x)) });
            return;
          }
          const ci = order[Math.floor(y / rowH)];
          const cell = ci != null ? cn.cells[ci] : null;
          const u = cell ? unitOf.get(cell.unit) : null;
          if (u) onPickUnit(u.id, cell.id);
        }}
      />
      <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
        {order.length} cells · bars: sample (left), cluster (right) · click a row to open its cluster map · drag across a window to zoom the region · {cn.note || "relative copy number"}
        {cn.source ? ` · source: ${cn.source}` : ""}
      </div>
    </div>
  );
}

/**
 * Hi-C on the Single-Cell page (public droplet Hi-C reports only): rows are the report's cells (per-cell CN from
 * hic/cells_cn.json) or its cluster units (the heat map above); selecting a row or cluster, or brushing a region in
 * the genome view, opens the cluster's contact map(s) over the region(s) with the graph and EagleC overlays (the track
 * browser's Hi-C components). Per-cell contact maps are not exported: a selected cell shows its cluster pseudobulk.
 * Renders nothing for reports without Hi-C.
 */
export default function HicScPanel() {
  const dispatch = useDispatch();
  const dataset = useSelector((s) => s.Settings.dataset);
  const chromoBins = useSelector((s) => s.Settings.chromoBins);
  const domains = useSelector((s) => s.Settings.domains);
  const { patient, cells, selectedCellIds, cellFiles } = useSelector((s) => s.SingleCell);
  const patientId = patient?.caseReportId ? `${patient.caseReportId}` : null;
  const hasHic = reportHasHic(cells);
  const [wrapRef, width] = useContainerWidth(1200);
  const narrow = width < 700;

  const [unitsJson, setUnitsJson] = useState({ status: "loading" });
  const [cellsCn, setCellsCn] = useState({ status: "loading" });
  useEffect(() => {
    if (!hasHic || !patientId || !dataset) return;
    tryGet(casePath(dataset, patientId, "hic/units.json")).then((r) => {
      const errors = r.status === "ok" ? validateUnits(r.data) : [];
      setUnitsJson(r.status === "ok" && !errors.length ? { status: "ok", data: r.data } : { status: "missing", reason: errors.join("; ") || `hic/units.json ${r.status}` });
    });
    tryGet(casePath(dataset, patientId, "hic/cells_cn.json")).then((r) => {
      if (r.status !== "ok") return setCellsCn({ status: "missing", reason: `per-cell copy number not exported for this report (hic/cells_cn.json ${r.status})` });
      const errors = validateCellsCn(r.data);
      if (errors.length) return setCellsCn({ status: "error", reason: errors.join("; ") });
      try {
        return setCellsCn({ status: "ok", data: { ...decodeCellsCn(r.data), note: r.data.note, source: r.data.source } });
      } catch (e) {
        return setCellsCn({ status: "error", reason: e.message });
      }
    });
  }, [hasHic, patientId, dataset]);

  const units = useMemo(() => hicUnitList(cells, unitsJson.data).filter((u) => u.hasHic), [cells, unitsJson]);
  const order = useMemo(() => orderUnits(units, { groupBy: "sample" }), [units]);
  const multi = samplesOf(units).length > 1;
  const sColors = useMemo(() => sampleColors(units, unitsJson.data), [units, unitsJson]);
  const sampleColor = useCallback((smp) => sColors[smp], [sColors]);
  const unitById = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const groupOf = useCallback((id) => unitById.get(id)?.sample ?? "all", [unitById]);

  // selection: the heat map's selected rows (units, or cells of cells_cn via their unit), or a pick in this panel
  const [localPick, setLocalPick] = useState(() => {
    const p = urlParam("hicunit");
    return p ? { units: p.split(",").filter(Boolean), viaCell: null } : null;
  });
  const fromHeatmap = useMemo(() => unitsForSelection(selectedCellIds, units, cellsCn.data?.cells), [selectedCellIds, units, cellsCn]);
  const shownUnits = localPick?.units?.length ? localPick.units.filter((id) => unitById.has(id)) : fromHeatmap;
  const viaCell = localPick?.viaCell || null;

  // region: hiclocus link / brushed in this panel > the genome view's region (if narrow enough) > the EGFR amplicon
  const viewWindows = useMemo(() => (domains || []).map((d) => placesToWindow(chromoBins, d)).filter(Boolean), [domains, chromoBins]);
  const fromView = hicWindowsFromView(viewWindows);
  const [own, setOwn] = useState(() => urlParam("hiclocus"));
  const [locusText, setLocusText] = useState("");
  const ownWindows = useMemo(() => (own && chromoBins ? parseLocus(own, chromoBins).windows : []), [own, chromoBins]);
  const fallback = useMemo(() => (chromoBins ? parseLocus(DEFAULT_HIC_LOCUS, chromoBins).windows : []), [chromoBins]);
  const rawWindows = ownWindows.length ? ownWindows : fromView.windows || fallback;
  const windowsKey = formatLocus(rawWindows);
  // stable identity per locus string (the maps refetch and redraw on a new windows array)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const windows = useMemo(() => rawWindows, [windowsKey]);
  const regionNote = ownWindows.length ? "region set here" : fromView.windows ? "region from the genome view above" : `EGFR amplicon shown (${fromView.reason})`;
  useEffect(() => setLocusText(windowsKey), [windowsKey]);

  const [hic, setHic] = useState(() => ({ ...hicStateFromTrack({}), shareMax: false }));
  useEffect(() => {
    if (multi) setHic((h) => (h.shareMax === false ? { ...h, shareMax: "per_sample" } : h));
  }, [multi]);

  const labelW = narrow ? 96 : 170;
  const gapX = narrow ? 24 : 36;
  const contentW = Math.max(160, width - labelW);
  const slots = useMemo(() => layoutWindows(windows, contentW - 2 * gapX, gapX), [windows, contentW, gapX]);
  const locus = useMemo(
    () => ({
      windows,
      setWindows: (next) => setOwn(formatLocus(next)),
      slots,
      scales: [],
      domains: windows.map((w) => windowToPlaces(chromoBins, w)).filter(Boolean),
      chromoBins,
      onPlotDomains: () => {},
      geometry: { leftW: labelW, gapX, contentW, trackLeft: labelW + gapX },
    }),
    [windows, slots, chromoBins, labelW, gapX, contentW]
  );

  const genome = dataset?.reference || "hg38";
  const dataPath = dataset?.dataPath || "";
  const urlOf = (id) => resolveUrl(HIC_URL, { dataPath, patient: patientId, unit: id, genome });
  const eUrlOf = (id) => resolveUrl(EAGLEC_URL, { dataPath, patient: patientId, unit: id, genome });
  const indexes = useHicIndexes(shownUnits, urlOf);
  const ov = hic.overlays || DEFAULT_OVERLAYS;
  const eaglec = useEaglec(shownUnits, eUrlOf, Boolean(ov.eaglec?.on));
  const { maxOf, onAutoMax } = useHicColorMax(shownUnits, hic.shareMax, groupOf);
  // graphs: the heat map's per-unit complex.json (already loaded), else fetched
  const [graphs, setGraphs] = useState(() => new Map());
  useEffect(() => {
    shownUnits.forEach((id) => {
      if (graphs.has(id)) return;
      const cached = cellFiles?.[id]?.genome;
      if (cached) setGraphs((m) => new Map(m).set(id, cached));
      else tryGet(casePath(dataset, id, "complex.json")).then((r) => r.status === "ok" && setGraphs((m) => new Map(m).set(id, r.data)));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownUnits.join(","), cellFiles]);
  const [hover, setHover] = useState(null);
  const mapW = Math.max(10, contentW - 2 * gapX);
  const first = shownUnits.map((id) => indexes.get(id)).find((v) => v?.status === "ok")?.index || null;
  const resList = first ? first.resolutions.map((r) => r.res).sort((a, b) => a - b) : [];
  const height = hicHeight(hic, mapW, narrow);

  if (!hasHic || !patientId) return null; // cohort datasets: nothing changes

  const pick = (id, cellId = null) => {
    setLocalPick({ units: [id], viaCell: cellId });
    if (!cellId) dispatch(singleCellActions.updateSelection([id]));
  };
  const toggleUnit = (id) => {
    const cur = shownUnits.includes(id) ? shownUnits.filter((x) => x !== id) : [...shownUnits, id].slice(-6);
    setLocalPick({ units: order.filter((x) => cur.includes(x)), viaCell: null });
  };

  return (
    <Card
      size="small"
      data-hic-sc-panel
      style={{ marginTop: 8 }}
      title={
        <Space wrap>
          <span>Hi-C contact maps</span>
          <Tag color="gold" style={{ whiteSpace: "normal" }}>{unitsJson.data?.data_label || HIC_DATASET_LABEL}</Tag>
        </Space>
      }
    >
      <div ref={wrapRef} style={{ width: "100%" }}>
        <Space wrap size={[6, 4]} style={{ marginBottom: 6 }}>
          <Text strong>Clusters</Text>
          {order.map((id) => {
            const u = unitById.get(id);
            const on = shownUnits.includes(id);
            return (
              <Button key={id} size="small" type={on ? "primary" : "default"} data-hic-unit-button={id} onClick={() => toggleUnit(id)} onDoubleClick={() => pick(id)} style={multi ? { borderLeft: `5px solid ${sColors[u.sample] || "#999"}` } : undefined}>
                {multi ? `${u.sample} ` : ""}{u.cluster ?? id}{u.nCells ? ` (${u.nCells})` : ""}
              </Button>
            );
          })}
        </Space>
        <Space wrap size={[6, 4]} style={{ marginBottom: 6 }}>
          <Input.Search size="small" style={{ width: narrow ? Math.max(200, width - 10) : 420 }} value={locusText} onChange={(e) => setLocusText(e.target.value)} onSearch={(v) => setOwn(v || null)} enterButton="Go" placeholder={DEFAULT_HIC_LOCUS} />
          {own && <Button size="small" onClick={() => setOwn(null)}>follow the genome view</Button>}
          <Text type="secondary" style={{ fontSize: 12 }}>{regionNote}</Text>
        </Space>
        {cellsCn.status === "ok" ? (
          <TrackLocusContext.Provider value={locus}>
            <CellCnHeatmap cn={cellsCn.data} units={units} unitOrder={order} sampleColor={sampleColor} slots={slots} left={labelW + gapX} width={width} onPickUnit={(id, cellId) => pick(id, cellId)} onBrush={(w) => setOwn(formatLocus([w]))} />
          </TrackLocusContext.Provider>
        ) : (
          <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
            Rows: the cluster units in the heat map above (per-cell copy number: not available; {cellsCn.reason || "loading"}). Select a cluster row there (or a button here), or brush a region in the genome view, to draw its contact map.
          </div>
        )}
        {!shownUnits.length ? (
          <Alert type="info" showIcon message="Select a cluster (a row of the heat map above, or a cluster button) to open its Hi-C contact map over the region." />
        ) : (
          <TrackLocusContext.Provider value={locus}>
            <HicControls state={hic} setState={setHic} units={[]} shown={shownUnits} resList={resList} mapW={mapW} height={height} narrow={narrow} perSample={multi} showUnits={false} />
            <HicOverlayLegend state={hic} setState={setHic} counts={ov.eaglec?.on ? overlayCountText(shownUnits, eaglec, ov) : null} rule={shownUnits.map((id) => eaglec.get(id)?.meta?.rule).find(Boolean) || null} />
            <div style={{ fontSize: 12, color: "#555", marginBottom: 4 }}>
              Cluster pseudobulk contact maps over {formatLocus(windows)} (windows side by side; trans blocks between windows off the diagonal). Per-cell contact maps are not exported: a selected cell shows its cluster&apos;s map. Hi-C color max: {sharedLabel(hic.shareMax)}. Drag to pan, wheel to zoom.
            </div>
            {shownUnits.map((id) => {
              const u = unitById.get(id);
              const isCell = viaCell && localPick?.units?.[0] === id;
              return (
                <div key={id} data-hic-sc-map={id} style={{ borderBottom: "1px solid #eee", padding: "2px 0" }}>
                  <HicUnitMap
                    id={id}
                    label={multi ? `${u.sample} ${u.cluster ?? id}` : `${u.cluster ?? id}`}
                    sublabel={mapLabel(u, Boolean(isCell)) + (isCell ? ` · selected cell ${viaCell}` : "")}
                    index={indexes.get(id)}
                    urlOf={urlOf}
                    state={hic}
                    graph={graphs.get(id) || null}
                    eaglec={eaglec.get(id) || null}
                    height={height}
                    onHover={setHover}
                    sharedMax={maxOf(id)}
                    onAutoMax={onAutoMax}
                    maxNote={hic.shareMax === "per_sample" ? `shared within ${groupOf(id)}` : null}
                  />
                </div>
              );
            })}
          </TrackLocusContext.Provider>
        )}
        <HicHover hover={hover} />
      </div>
    </Card>
  );
}
