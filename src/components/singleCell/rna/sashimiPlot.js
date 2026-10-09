import React from "react";
import { sashimiArcs, sashimiAxis, junctionType } from "../../../helpers/singleCell/sashimi";
import { junctionLabel } from "../../../helpers/singleCell/splicing";
import { junctionColor } from "../../../helpers/singleCell/rnaColors";
import { TYPE } from "../../../helpers/singleCell/plotTheme";

const fmtPct = (p) => (Number.isFinite(p) ? `${Math.round(p * 100)}%` : "–");
const fmtPos = (v) => Number(v).toLocaleString("en-US");
export const TYPE_LABELS = {
  annotated: "annotated",
  exon_skip: "exon skip",
  novel_combination: "novel pair",
  novel_donor: "novel donor",
  novel_acceptor: "novel acceptor",
  novel: "novel",
};

/**
 * Sashimi plot of one intron cluster: the gene's collapsed exons (from the
 * GTF) on a collapsed-intron axis, then one track per group (clone, state,
 * patient, ...) with the cluster's junctions as arcs between the exon ends
 * they join. Arc width = reads (shared scale across tracks), label = reads
 * and PSI within the track, colour = the junction (the same in every track
 * and in the tables), dashed = not an annotated intron. Arcs alternate above
 * and below the track so nested junctions stay readable. Plain SVG (d3-free).
 *
 * tracks: [{ key, label, sublabel, counts: [per junction] }]
 */
export default function SashimiPlot({ cluster, tracks, width = 800, trackH = 96, labelW = 132, highlight = null, svgRef = null, transcripts = null, event = null, junctionIndex = null }) {
  const junctions = cluster?.junctions || [];
  // junctionIndex: original cluster index of each drawn junction (keeps colours / numbers when a subset is drawn)
  const gj = (j) => (junctionIndex ? junctionIndex[j] : j);
  // with exon models (helpers/singleCell/spliceEvents clusterTranscripts): one row per transcript
  // (canonical first, at most 4) instead of the cluster's collapsed exon blocks
  const txRows = (transcripts || []).slice(0, 4);
  const TX_ROW = 15;
  const geneH = txRows.length ? 30 + txRows.length * TX_ROW : 38;
  const top = 6;
  const height = top + geneH + tracks.length * trackH + 8;
  const x0 = labelW;
  const x1 = width - 10;
  const modelExons = txRows.length
    ? [...new Map(txRows.flatMap((t) => t.exons).map((e) => [`${e.start}-${e.end}`, { start: e.start, end: e.end }])).values()]
    : cluster?.exons || [];
  const axis = sashimiAxis({ exons: modelExons, junctions }, x0, x1);
  const isEventExon = (e) => event?.exon && e.start <= event.exon.end && e.end >= event.exon.start;
  const arcs = sashimiArcs(junctions, axis.x);
  const maxCount = Math.max(1, ...tracks.flatMap((t) => t.counts || []).map((v) => Number(v) || 0));
  const minus = cluster?.strand === "-";
  const geneY = top + geneH / 2;
  const arrows = [];
  axis.segments.forEach((s) => {
    if (s.exonic || s.x1 - s.x0 < 26) return;
    for (let x = s.x0 + 12; x < s.x1 - 8; x += 26) arrows.push(x);
  });
  return (
    <svg ref={svgRef} width={width} height={height} style={{ display: "block", overflow: "visible" }} role="img" fontSize={TYPE.tick}>
      {/* gene model */}
      <text x={0} y={txRows.length ? top + 10 : geneY - 4} fontSize={TYPE.label} fontWeight={600} fill="currentColor">
        {cluster?.gene || "?"} {minus ? "(−)" : "(+)"}
      </text>
      <text x={0} y={txRows.length ? top + 25 : geneY + 11} fill="currentColor" opacity={0.6}>
        chr{`${cluster?.chromosome || ""}`.replace(/^chr/, "")}
      </text>
      {txRows.length > 0 &&
        txRows.map((tx, r) => {
          const ty = top + 14 + r * TX_ROW;
          const xs = tx.exons.map((e) => [axis.x(e.start), axis.x(e.end + 1)]);
          const lx = Math.min(...xs.map((v) => v[0]));
          const rx = Math.max(...xs.map((v) => v[1]));
          return (
            <g key={tx.id}>
              <line x1={lx} x2={rx} y1={ty} y2={ty} stroke="currentColor" opacity={0.4}>
                <title>{`${tx.id}${tx.canonical ? " (Ensembl canonical)" : ""}`}</title>
              </line>
              {tx.exons.map((e, k) => {
                const ex0 = axis.x(e.start);
                const ex1 = axis.x(e.end + 1);
                const hot = isEventExon(e);
                return (
                  <g key={k}>
                    <rect x={ex0} y={ty - 5} width={Math.max(2, ex1 - ex0)} height={10} rx={1.5} fill={hot ? "#d4380d" : "currentColor"} opacity={hot ? 0.9 : tx.canonical ? 0.6 : 0.4}>
                      <title>{`${tx.id} exon ${e.n}: ${fmtPos(e.start)}-${fmtPos(e.end)} (${e.end - e.start + 1} bp)`}</title>
                    </rect>
                    {r === 0 && ex1 - ex0 >= 10 && (
                      <text x={(ex0 + ex1) / 2} y={ty - 7} textAnchor="middle" fill={hot ? "#d4380d" : "currentColor"} opacity={hot ? 1 : 0.7} fontSize={TYPE.tick} fontWeight={hot ? 700 : 400}>
                        {e.n}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      {!txRows.length && <line x1={x0} x2={x1} y1={geneY} y2={geneY} stroke="currentColor" opacity={0.45} />}
      {!txRows.length && arrows.map((x) => (
        <path key={x} d={minus ? `M${x + 3},${geneY - 3} L${x},${geneY} L${x + 3},${geneY + 3}` : `M${x - 3},${geneY - 3} L${x},${geneY} L${x - 3},${geneY + 3}`} fill="none" stroke="currentColor" opacity={0.45} />
      ))}
      {!txRows.length && axis.exons.map((e) => (
        <rect
          key={`${e.start}-${e.end}`}
          x={e.x0}
          y={geneY - 7}
          width={Math.max(2, e.x1 - e.x0)}
          height={14}
          rx={1.5}
          fill={e.pseudo ? "none" : "currentColor"}
          stroke="currentColor"
          strokeDasharray={e.pseudo ? "2 2" : undefined}
          opacity={e.pseudo ? 0.5 : 0.55}
        >
          <title>{`${e.pseudo ? "unannotated exon end " : "exon "}${fmtPos(e.start)}-${fmtPos(e.end)} (${e.end - e.start + 1} bp)`}</title>
        </rect>
      ))}
      <text x={x0} y={top + geneH - 1} fill="currentColor" opacity={0.6}>
        {fmtPos(axis.lo)}
      </text>
      <text x={x1} y={top + geneH - 1} textAnchor="end" fill="currentColor" opacity={0.6}>
        {fmtPos(axis.hi)}
      </text>
      {/* tracks */}
      {tracks.map((t, ti) => {
        const y0 = top + geneH + ti * trackH;
        const base = y0 + trackH / 2;
        const total = (t.counts || []).reduce((a, v) => a + (Number(v) || 0), 0);
        const room = trackH / 2 - 12;
        return (
          <g key={t.key ?? t.label}>
            {ti % 2 === 1 && <rect x={0} y={y0} width={width} height={trackH} fill="currentColor" opacity={0.03} />}
            {t.swatch && <rect x={0} y={base - 14} width={10} height={10} rx={2} fill={t.swatch} />}
            <text x={t.swatch ? 14 : 0} y={base - 4} fontSize={TYPE.label} fontWeight={600} fill="currentColor">
              {`${t.label}`.length > 17 ? `${`${t.label}`.slice(0, 16)}…` : `${t.label}`}
            </text>
            {t.sublabel && (
              <text x={0} y={base + 11} fill="currentColor" opacity={0.65}>
                {t.sublabel}
              </text>
            )}
            <line x1={x0} x2={x1} y1={base} y2={base} stroke="currentColor" opacity={0.25} />
            {axis.exons.map((e) => (
              <rect key={`${e.start}-${e.end}`} x={e.x0} y={base - 4} width={Math.max(2, e.x1 - e.x0)} height={8} fill="currentColor" opacity={e.pseudo ? 0.12 : 0.3} />
            ))}
            {arcs.map((a) => {
              const c = Number(t.counts?.[a.j]) || 0;
              if (c <= 0) return null;
              const p = total > 0 ? c / total : NaN;
              const span = Math.max(8, a.xb - a.xa);
              const h = Math.min(room, 14 + span * 0.35);
              const dir = a.above ? -1 : 1;
              const ctrlY = base + dir * h * 1.33;
              const apexY = base + dir * h;
              const dim = highlight != null && highlight !== a.j;
              return (
                <g key={a.j} opacity={dim ? 0.25 : 1}>
                  <path
                    d={`M${a.xa},${base} C${a.xa},${ctrlY} ${a.xb},${ctrlY} ${a.xb},${base}`}
                    fill="none"
                    stroke={junctionColor(gj(a.j))}
                    strokeWidth={1 + 7 * Math.sqrt(c / maxCount)}
                    strokeDasharray={junctionType(junctions[a.j]) === "annotated" ? undefined : "6 3"}
                    strokeLinecap="round"
                    opacity={0.85}
                  >
                    <title>{`${t.label} · junction ${gj(a.j) + 1} (${TYPE_LABELS[junctionType(junctions[a.j])]}) ${junctionLabel(cluster.chromosome, junctions[a.j])}: ${c} reads, PSI ${fmtPct(p)}`}</title>
                  </path>
                  <text
                    x={(a.xa + a.xb) / 2}
                    y={apexY + (a.above ? -3 : 11)}
                    textAnchor="middle"
                    fill="currentColor"
                    fontWeight={600}
                    paintOrder="stroke"
                    stroke="var(--sc-plot-bg, #fff)"
                    strokeWidth={3}
                  >
                    {`${c} · ${fmtPct(p)}`}
                  </text>
                </g>
              );
            })}
            {total === 0 && (
              <text x={(x0 + x1) / 2} y={base - 6} textAnchor="middle" fill="currentColor" opacity={0.5}>
                no reads
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
