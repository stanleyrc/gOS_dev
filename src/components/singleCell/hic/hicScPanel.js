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
  DEFAULT_HIC_LOCUS, HIC_DATASET_LABEL, binAtX, binsToWindow, cellRowOrder, cnNeutralBySample, hicDataVersion, relCnRgb, xOfBin, cnBinsOf, decodeCellsCn, hicUnitList, hicWindowsFromView, mapLabel, orderUnits,
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

/**
 * Genome-wide per-cell copy number heat map (gos-hic-cellcn/1, 1 Mb bins, all chromosomes) with a sample bar and a
 * cluster bar; the Hi-C windows are outlined on it. Click a row: open its cluster's map; drag across the heat map: set
 * the Hi-C window to the brushed span (clamped to the chromosome where the drag starts).
 */
function CellCnHeatmap({ cn, units, unitOrder, sampleColor, windows, left, width, onPickUnit, onBrush }) {
  const ref = useRef(null);
  const order = useMemo(() => cellRowOrder(cn, unitOrder), [cn, unitOrder]);
  const HEAD = 16;
  const bodyH = Math.max(60, Math.min(360, order.length * 4));
  const W = Math.max(50, Math.round(width - left - 8));
  const neutral = useMemo(() => cnNeutralBySample(cn), [cn]);
  const [brush, setBrush] = useState(null);
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
  const rowOfY = (y) => order[Math.min(order.length - 1, Math.max(0, Math.floor(((y - HEAD) / bodyH) * order.length)))];
  // heat map pixels (cells x genome), drawn once per data / width
  const img = useMemo(() => {
    if (typeof document === "undefined") return null;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = bodyH;
    const ctx = c.getContext("2d");
    const im = ctx.createImageData(W, bodyH);
    const binOfX = Array.from({ length: W }, (_, x) => binAtX(cn, x + 0.5, W));
    for (let y = 0; y < bodyH; y += 1) {
      const ci = order[Math.min(order.length - 1, Math.floor(((y + 0.5) / bodyH) * order.length))];
      const nt = neutral[cn.cells[ci]?.sample ?? "all"] ?? 2;
      for (let x = 0; x < W; x += 1) {
        const [R, G, B] = relCnRgb(cn.values[ci * cn.nBins + binOfX[x]], nt);
        const o = 4 * (y * W + x);
        im.data[o] = R;
        im.data[o + 1] = G;
        im.data[o + 2] = B;
        im.data[o + 3] = 255;
      }
    }
    ctx.putImageData(im, 0, 0);
    return c;
  }, [cn, order, W, bodyH, neutral]);
  useEffect(() => {
    const ctx = setupCanvas(ref.current, width, HEAD + bodyH + 2);
    if (!ctx || !img) return;
    ctx.clearRect(0, 0, width, HEAD + bodyH + 2);
    ctx.drawImage(img, left, HEAD);
    // sample + cluster bars
    for (let y = 0; y < bodyH; y += 1) {
      const ci = order[Math.min(order.length - 1, Math.floor(((y + 0.5) / bodyH) * order.length))];
      const cell = cn.cells[ci];
      const u = unitOf.get(cell.unit);
      ctx.fillStyle = sampleColor(cell.sample || u?.sample) || "#bbb";
      ctx.fillRect(left - 26, HEAD + y, 10, 1);
      ctx.fillStyle = clusterColors[u?.id] || "#999";
      ctx.fillRect(left - 14, HEAD + y, 10, 1);
    }
    // chromosome boundaries and labels
    ctx.font = "10px system-ui, sans-serif";
    ctx.textAlign = "center";
    cn.chroms.forEach((c, i) => {
      const x0 = left + xOfBin(cn, c.startBin, W);
      const x1 = left + xOfBin(cn, c.startBin + c.nbins, W);
      if (i) {
        ctx.strokeStyle = "rgba(60,60,60,0.6)";
        ctx.beginPath();
        ctx.moveTo(x0 + 0.5, HEAD - 3);
        ctx.lineTo(x0 + 0.5, HEAD + bodyH);
        ctx.stroke();
      }
      if (x1 - x0 >= 12) {
        ctx.fillStyle = "#333";
        ctx.fillText(c.name, (x0 + x1) / 2, HEAD - 5);
      }
    });
    // the Hi-C windows, outlined
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2;
    (windows || []).forEach((w) => {
      const bins = cnBinsOf(cn, w);
      if (!bins) return;
      const x0 = left + xOfBin(cn, bins[0], W);
      const x1 = Math.max(x0 + 3, left + xOfBin(cn, bins[1] + 1, W));
      ctx.strokeRect(x0 - 1, HEAD - 1, x1 - x0 + 2, bodyH + 2);
    });
    if (brush) {
      ctx.fillStyle = "rgba(30,90,200,0.18)";
      ctx.fillRect(Math.min(brush.x0, brush.x1), HEAD, Math.abs(brush.x1 - brush.x0), bodyH);
    }
  }, [img, width, left, bodyH, cn, order, unitOf, sampleColor, clusterColors, windows, W, brush]);
  const at = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const inMap = (x) => x >= left && x <= left + W;
  return (
    <div>
      <canvas
        ref={ref}
        data-hic-cellcn
        style={{ display: "block", cursor: "crosshair" }}
        onMouseDown={(e) => {
          const [x] = at(e);
          if (inMap(x)) setBrush({ x0: x, x1: x });
        }}
        onMouseMove={(e) => {
          if (!brush) return;
          const [x] = at(e);
          setBrush((b) => (b ? { ...b, x1: Math.max(left, Math.min(left + W, x)) } : b));
        }}
        onMouseUp={(e) => {
          const b = brush;
          setBrush(null);
          const [x, y] = at(e);
          if (b && Math.abs(x - b.x0) > 4) {
            const w = binsToWindow(cn, binAtX(cn, b.x0 - left, W), binAtX(cn, Math.max(left, Math.min(left + W, x)) - left, W));
            if (w) onBrush(w);
            return;
          }
          if (y < HEAD) return;
          const ci = rowOfY(y);
          const cell = ci != null ? cn.cells[ci] : null;
          const u = cell ? unitOf.get(cell.unit) : null;
          if (u) onPickUnit(u.id, cell.id);
        }}
        onMouseLeave={() => setBrush(null)}
      />
      <div style={{ fontSize: 11, color: "#666", marginTop: 2, display: "flex", flexWrap: "wrap", gap: "2px 10px", alignItems: "center" }}>
        <span>{order.length} cells × {cn.nBins} bins of {cn.binSize / 1e6} Mb · bars: sample (left), cluster (right) · black boxes: the Hi-C windows · click a row: its cluster map · drag: set the Hi-C window</span>
        <span>
          <b>relative CN</b> (Hi-C coverage; not absolute copy number): white = the sample&apos;s median ({Object.entries(neutral).map(([s, v]) => `${s} ${v.toFixed(2)}`).join(", ")}), blue = half, red = 4× or more
          {(cn.ploidy || []).length ? ` · graph ploidy ${cn.ploidy.map((p) => `${p.sample} ${Number(p.ploidy).toFixed(2)}`).join(", ")}` : ""}
        </span>
        <span>{cn.note || ""}</span>
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
        return setCellsCn({ status: "ok", data: { ...decodeCellsCn(r.data), note: r.data.note, source: r.data.source, ploidy: r.data.ploidy || [] } });
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
          <Text type="secondary" data-hic-version style={{ fontSize: 12, fontWeight: 400 }}>data: {hicDataVersion(unitsJson.data, units)}</Text>
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
            <CellCnHeatmap cn={cellsCn.data} units={units} unitOrder={order} sampleColor={sampleColor} windows={windows} left={labelW + gapX} width={width} onPickUnit={(id, cellId) => pick(id, cellId)} onBrush={(w) => setOwn(formatLocus([w]))} />
          </TrackLocusContext.Provider>
        ) : (
          <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
            {cellsCn.status === "loading" ? "Per-cell copy number (hic/cells_cn.json, tens of MB): loading… Meanwhile the" : "Rows: the"} cluster units in the heat map above{cellsCn.status === "loading" ? " are the rows" : ` (per-cell copy number: not available; ${cellsCn.reason})`}. Select a cluster row there (or a button here), or brush a region in the genome view, to draw its contact map.
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
