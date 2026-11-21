import React, { useEffect, useMemo, useRef } from "react";
import GenomePlot from "../../genomePlot";
import { dataToGenome } from "../../../helpers/utility";
import { scaleFrac } from "../../../helpers/singleCell/trackBrowser/layout";
import { bpToPx } from "../../../helpers/singleCell/trackBrowser/locus";
import { pseudobulkGenome } from "../../../helpers/singleCell/trackBrowser/pseudobulk";
import { COLORS, drawCladeRow, drawUnitRow, setupCanvas } from "./draw";
import { useTrackLocus } from "./locusContext";

// gGnome.js JSON -> the genome-graph component's genome, cached per raw object (the component compares by identity)
const genomeCache = new WeakMap();
const genomeIds = new WeakMap();
let nextGenomeId = 1;
// the component only re-renders a new genome when remounted (it compares genomes by string): key by identity
const genomeKey = (g) => {
  if (!genomeIds.has(g)) genomeIds.set(g, nextGenomeId++);
  return genomeIds.get(g);
};
export function toPlotGenome(raw, chromoBins) {
  if (!raw) return null;
  const hit = genomeCache.get(raw);
  if (hit && hit.chromoBins === chromoBins) return hit.genome;
  const genome = dataToGenome({ settings: raw.settings || {}, intervals: raw.intervals || [], connections: raw.connections || [] }, chromoBins);
  genomeCache.set(raw, { chromoBins, genome });
  return genome;
}

/** Vertical margins of graph rows drawn by the genome-graph component (the x axis lives in the header ruler). */
export const plotMarginsFor = (h, gapX) => ({ gapX, gapTop: 4, gapBottom: 4, bar: Math.max(4, Math.min(10, Math.round(h / 8))) });

/**
 * The graph sub-row of a cell or clade row with the standard gOS genome-graph component (gGnome.js look: intervals at
 * CN, colored by chromosome, junction arcs, CN axis, its own tooltips), on the track browser's windows and per-window
 * y scales. Clade rows also get an interquartile band and clip marks on a canvas underneath (no form for those in the
 * component). onJunction(junction) is called when an ALT edge is clicked.
 */
export function GraphPlotRow({ raw, pb, height, width, minFrac = 0, onJunction }) {
  const L = useTrackLocus();
  const { chromoBins, slots, scales, domains, geometry } = L;
  const pbJson = useMemo(() => (pb ? pseudobulkGenome(pb, slots, minFrac) : null), [pb, slots, minFrac]);
  const genome = useMemo(() => toPlotGenome(raw || pbJson, chromoBins), [raw, pbJson, chromoBins]);
  const margins = useMemo(() => plotMarginsFor(height, geometry.gapX), [height, geometry.gapX]);
  const under = useRef(null);
  const panelH = height - margins.gapTop - margins.gapBottom;

  // underlay: clade IQR band and clip marks (values above the window's max)
  useEffect(() => {
    const ctx = setupCanvas(under.current, width, height);
    if (!ctx) return;
    const yOf = (k, v) => margins.gapTop + panelH * (1 - scaleFrac(v, scales[k]).f);
    const xOf = (k, pos) => geometry.gapX + slots[k].x0 + bpToPx(slots[k], pos);
    if (pb) {
      ctx.fillStyle = "rgba(70,110,170,0.22)";
      pb.steps.forEach((st) => {
        const a = yOf(st.slot, st.q3);
        const b = yOf(st.slot, st.q1);
        const x0 = xOf(st.slot, st.start);
        ctx.fillRect(x0, a, Math.max(1, xOf(st.slot, st.end) - x0), Math.max(1, b - a));
      });
    }
    const segs = pb ? pb.steps.map((st) => ({ slot: st.slot, start: st.start, end: st.end, cn: st.median })) : null;
    const list = segs || (raw?.intervals || []).flatMap((iv) =>
      slots.map((s, k) => (s.window.chrom === `${iv.chromosome}`.replace(/^chr/, "") && iv.endPoint >= s.window.start && iv.startPoint <= s.window.end
        ? { slot: k, start: Math.max(iv.startPoint, s.window.start), end: Math.min(iv.endPoint, s.window.end), cn: Number(iv.y) } : null)).filter(Boolean));
    ctx.fillStyle = "#c0392b";
    list.forEach((sg) => {
      if (!(sg.cn > scales[sg.slot].max)) return;
      const x = (xOf(sg.slot, sg.start) + xOf(sg.slot, sg.end)) / 2;
      ctx.beginPath();
      ctx.moveTo(x - 3, margins.gapTop + 6);
      ctx.lineTo(x, margins.gapTop + 1);
      ctx.lineTo(x + 3, margins.gapTop + 6);
      ctx.fill();
    });
  }, [pb, raw, width, height, slots, scales, margins, panelH, geometry.gapX]);

  const windowRangesY = useMemo(() => scales.map((s) => [s.min || 0, s.max]), [scales]);
  const windowLogY = useMemo(() => scales.map((s) => Boolean(s.log)), [scales]);
  const windowTickValuesY = useMemo(() => scales.map((s) => (panelH >= 40 ? [...new Set([s.min || 0, ...(s.max > 2 && (s.min || 0) < 2 ? [2] : []), s.max])] : [s.min || 0, s.max])), [scales, panelH]);
  const onConnectionClick = (c) => {
    const end = (e) => (e && e.interval ? { chrom: `${e.interval.chromosome}`.replace(/^chr/, ""), pos: e.sign > 0 ? e.interval.endPoint : e.interval.startPoint, sign: e.sign } : null);
    const a = end(c.source);
    const b = end(c.sink);
    if (a && b && onJunction) onJunction({ a, b, title: c.title, cn: c.weight });
  };
  if (!genome) return null;
  return (
    <div style={{ position: "relative", width, height }}>
      <canvas ref={under} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }} />
      <div style={{ position: "absolute", left: 0, top: 0 }}>
        <GenomePlot
          key={genomeKey(genome)}
          width={width}
          height={height}
          genome={genome}
          localDomains={domains}
          windowRangesY={windowRangesY}
          windowLogY={windowLogY}
          windowTickValuesY={windowTickValuesY}
          plotMargins={margins}
          yAxisTitle=""
          onConnectionClick={onConnectionClick}
          onDomainsChange={L.onPlotDomains}
        />
      </div>
    </div>
  );
}

/** Canvas sub-row (coverage, or the compact canvas graph style kept as an alternative). */
export function CanvasRow({ kind, unit, row, pb, graph, coverage, graphH, covH, width, minFrac, graphStatus, covStatus, missingAll }) {
  const L = useTrackLocus();
  const ref = useRef(null);
  useEffect(() => {
    const ctx = setupCanvas(ref.current, width, graphH + covH);
    if (!ctx) return;
    const o = { left: L.geometry.gapX, slots: L.slots, scales: L.scales, chromoBins: L.chromoBins, top: 0 };
    if (kind === "clade") drawCladeRow(ctx, { ...o, pb, graphH, clade: row, minFrac, missingAll });
    else drawUnitRow(ctx, { ...o, unit, graph, coverage, graphH, covH, graphStatus, covStatus });
  }, [kind, unit, row, pb, graph, coverage, graphH, covH, width, minFrac, graphStatus, covStatus, missingAll, L.slots, L.scales, L.chromoBins, L.geometry.gapX]);
  return <canvas ref={ref} style={{ display: "block" }} />;
}

/** Message row in the graph area (missing / loading), with the frame of the windows. */
export function NoteRow({ text, width, height }) {
  return (
    <div style={{ width, height, display: "flex", alignItems: "center", paddingLeft: 60, color: COLORS.muted, fontSize: 12, borderBottom: "1px solid #eee" }}>
      {text}
    </div>
  );
}
