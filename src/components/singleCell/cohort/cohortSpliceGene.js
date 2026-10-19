import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, Space, Tag, Typography } from "antd";
import { compressedLayout, describeEvent, domainContext, junctionArcs, junctionGeometry, zoomView } from "../../../helpers/singleCell/spliceContext";
import { junctionColor } from "../../../helpers/singleCell/rnaColors";
import { TYPE } from "../../../helpers/singleCell/plotTheme";

const { Text } = Typography;
const ROW = 22;
const ARC_TOP = 70;

/** One-line facts about the event, relative to the whole gene (exon x of N, event type, distance to the canonical site, frame, domain). */
export function EventFacts({ ctx, cluster, event, model, patientFrame = null }) {
  const d = useMemo(() => describeEvent(ctx, cluster, event), [ctx, cluster, event]);
  const dom = domainContext(model, cluster.gene);
  if (!ctx) return <Text type="secondary">Gene model not available for {cluster.gene} (no exon annotation in splice_exons.json), so exon numbers and distances to the canonical splice sites cannot be shown.</Text>;
  const frame = patientFrame && patientFrame !== "unknown" ? `${patientFrame.replace("_", " ")} (from the patient events)` : d.frame;
  const bits = [
    ["Affected", d.exonLabel || "exon not resolved"],
    ["Event", d.eventType],
    d.site ? ["Site", d.site] : ["Distance to canonical site", d.nearestBp === 0 ? "0 bp (junction joins canonical splice sites)" : "not available"],
    d.lengthChange != null && d.lengthChange !== 0 ? ["Transcript length change", `${d.lengthChange > 0 ? "+" : ""}${d.lengthChange} bp`] : null,
    frame ? ["Reading frame", frame] : ["Reading frame", "not available"],
    ["Protein domain", dom.available ? "see exon annotation" : `not available (${dom.reason})`],
  ].filter(Boolean);
  return (
    <Space size={[14, 2]} wrap data-testid="splice-event-facts">
      {bits.map(([k, v]) => (
        <Text key={k} style={{ fontSize: 12 }}>
          <Text type="secondary">{k}: </Text>
          <Text strong>{v}</Text>
        </Text>
      ))}
    </Space>
  );
}

/**
 * Whole-gene model of a cluster: the canonical transcript with exon numbers, the other transcripts collapsed, the
 * cluster's junctions as arcs on an intron-compressed axis, the affected exon(s) highlighted. Wheel to zoom, drag to pan.
 */
export default function CohortSpliceGene({ ctx, cluster, event, width }) {
  const ref = useRef(null);
  const [view, setView] = useState({ k: 1, tx: 0 });
  const [drag, setDrag] = useState(null);
  const W = Math.max(520, width);
  useEffect(() => setView({ k: 1, tx: 0 }), [cluster.id]);
  const layout = useMemo(() => (ctx ? compressedLayout(ctx.backbone, W) : null), [ctx, W]);
  const arcs = useMemo(() => (layout ? junctionArcs(layout, cluster) : []), [layout, cluster]);
  const desc = useMemo(() => (ctx ? describeEvent(ctx, cluster, event) : null), [ctx, cluster, event]);
  const arcLabel = desc ? `${desc.eventType}${desc.frame ? `, ${desc.frame.replace(" (estimated)", "")}` : ""}` : "";
  const hot = useMemo(() => {
    if (!ctx) return new Set();
    const d = describeEvent(ctx, cluster, event);
    const set = new Set();
    if (d.exonN != null) set.add(d.exonN);
    const ab = cluster.junctions?.[d.junction];
    const g = ab ? junctionGeometry(ctx, ab) : null;
    (g?.skipped || []).forEach((n) => set.add(n));
    return set;
  }, [ctx, cluster, event]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setView((v) => zoomView(v, e.deltaY < 0 ? 1.25 : 0.8, e.clientX - r.left, W));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [W, ctx]);
  if (!ctx || !layout) return null;
  const sx = (x) => x * view.k + view.tx;
  const exonRect = (e) => ({ x0: sx(layout.x(e.start)), x1: sx(layout.x(e.end + 1)) });
  const canonY = ARC_TOP + 6;
  const othersY = canonY + ROW + 10;
  const H = othersY + ROW + 24;
  const segsOthers = (ctx.backbone || []).filter((b) => !ctx.canonical.exons.some((e) => e.start <= b.start && e.end >= b.end));
  const strandArrow = ctx.strand === "-" ? "◀" : "▶";
  return (
    <div>
      <Space size={8} style={{ marginBottom: 2 }} wrap>
        <Button size="small" onClick={() => setView((v) => zoomView(v, 1.5, W / 2, W))}>+</Button>
        <Button size="small" onClick={() => setView((v) => zoomView(v, 1 / 1.5, W / 2, W))}>−</Button>
        <Button size="small" onClick={() => setView({ k: 1, tx: 0 })}>Reset</Button>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {`${ctx.gene} chr${`${ctx.chromosome}`.replace(/^chr/, "")}:${ctx.start.toLocaleString("en-US")}-${ctx.end.toLocaleString("en-US")} (${ctx.strand} strand ${strandArrow}), canonical ${ctx.canonical.id}, ${ctx.nExons} exons, introns compressed. Wheel to zoom, drag to pan.`}
        </Text>
      </Space>
      <svg
        ref={ref}
        width={W}
        height={H}
        style={{ display: "block", cursor: drag ? "grabbing" : "grab", touchAction: "none" }}
        fontSize={TYPE.tick}
        data-testid="splice-gene-svg"
        onMouseDown={(e) => setDrag({ x: e.clientX, tx: view.tx })}
        onMouseMove={(e) => drag && setView((v) => zoomView({ ...v, tx: drag.tx + e.clientX - drag.x }, 1, 0, W))}
        onMouseUp={() => setDrag(null)}
        onMouseLeave={() => setDrag(null)}
      >
        <defs>
          <clipPath id="sgclip">
            <rect x={0} y={0} width={W} height={H} />
          </clipPath>
        </defs>
        <g clipPath="url(#sgclip)">
          {/* intron lines */}
          {ctx.canonical.exons.slice(0, -1).map((e, i) => {
            const nx = ctx.canonical.exons[i + 1];
            return <line key={`i${i}`} x1={exonRect(e).x1} x2={exonRect(nx).x0} y1={canonY + ROW / 2} y2={canonY + ROW / 2} stroke="currentColor" opacity={0.35} />;
          })}
          {ctx.canonical.exons.map((e) => {
            const r = exonRect(e);
            const on = hot.has(e.n);
            const w = Math.max(1, r.x1 - r.x0);
            return (
              <g key={e.n}>
                <rect x={r.x0} y={canonY} width={w} height={ROW} fill={on ? "#d4380d" : "#6b7280"} stroke={on ? "#820014" : "none"} strokeWidth={on ? 1.5 : 0}>
                  <title>{`${ctx.gene} exon ${e.n} of ${ctx.nExons}: chr${ctx.chromosome}:${e.start.toLocaleString("en-US")}-${e.end.toLocaleString("en-US")} (${e.end - e.start + 1} bp)`}</title>
                </rect>
                {(w > 14 || on) && (
                  <text x={(r.x0 + r.x1) / 2} y={canonY + ROW + 11} textAnchor="middle" fontSize={TYPE.micro} fill="currentColor" fontWeight={on ? 700 : 400}>
                    {e.n}
                  </text>
                )}
              </g>
            );
          })}
          <text x={4} y={canonY - 4} fontSize={TYPE.micro} fill="currentColor" opacity={0.7}>
            {`canonical ${ctx.canonical.id}`}
          </text>
          {segsOthers.map((b, i) => {
            const r = { x0: sx(layout.x(b.start)), x1: sx(layout.x(b.end + 1)) };
            return <rect key={`o${i}`} x={r.x0} y={othersY + 4} width={Math.max(1, r.x1 - r.x0)} height={ROW - 8} fill="#9ca3af" opacity={0.7} />;
          })}
          <text x={4} y={othersY + ROW + 8} fontSize={TYPE.micro} fill="currentColor" opacity={0.7}>
            {`other transcripts collapsed (${ctx.others.length}): exons outside the canonical model`}
          </text>
          {/* junction arcs */}
          {arcs.map((a) => {
            const x1 = sx(a.xa);
            const x2 = sx(a.xb);
            const h = Math.min(ARC_TOP - 14, 16 + 16 * Math.log2(1 + (a.xb - a.xa) / 40));
            const col = junctionColor(a.k);
            const base = canonY;
            return (
              <g key={`a${a.k}`}>
                <path d={`M${x1},${base} C${x1},${base - h} ${x2},${base - h} ${x2},${base}`} fill="none" stroke={col} strokeWidth={a.aberrant ? 2.6 : 1.6} strokeDasharray={a.aberrant ? "0" : "4 3"}>
                  <title>{`junction ${a.k + 1} (${cluster.junctions[a.k].type || "annotated"}) chr${cluster.chromosome}:${Number(cluster.junctions[a.k].start).toLocaleString("en-US")}-${Number(cluster.junctions[a.k].end).toLocaleString("en-US")}`}</title>
                </path>
                <text x={(x1 + x2) / 2} y={base - h * 0.75 - 2} textAnchor="middle" fontSize={TYPE.micro} fill={col} fontWeight={700} paintOrder="stroke" stroke="var(--sc-plot-bg, #fff)" strokeWidth={3}>
                  {desc && a.k === desc.junction ? `${a.k + 1} · ${arcLabel}` : a.k + 1}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      <Space size={6} wrap style={{ marginTop: 2 }}>
        <Tag color="#d4380d">affected / skipped exons</Tag>
        <Text type="secondary" style={{ fontSize: 12 }}>solid arc = aberrant junction, dashed = annotated; arc numbers match the junction legend below the sashimi plot.</Text>
      </Space>
    </div>
  );
}
