import React, { useMemo } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Typography } from "antd";
import useContainerWidth from "../useContainerWidth";
import { chromosomeSpans, domainExtents } from "../../../helpers/singleCell/matrix";
import { toGlobal, walkContainment } from "../../../helpers/singleCell/walks";

const { Text } = Typography;
// the heatmap card's border + body padding, and its genome panels' inner margin
const CARD_PAD = 13;
const GENOME_MARGIN = 50;
const DOMAIN_GAP = 50;
const ROW_H = 24;
const GENES_H = 34;
const AXIS_H = 22;

/**
 * Walks as a genome track (PGV-style), aligned to the single-cell heatmap
 * below: one row per walk, its nodes drawn on the shared genomic axis
 * (lighter = reverse strand), ALT junctions as red arcs joining the pieces
 * (the closing junction of a circle too); longest walk at the bottom so
 * nested variants read as the stack of ecDNA species in the figure. Genes
 * above, chromosome / Mb axis below. Click a row to focus that walk.
 */
export default function WalksTrack({ walks, colorOf, focus, onFocus }) {
  const { t } = useTranslation("common");
  const [ref, colWidth] = useContainerWidth(1000);
  const { domains, chromoBins } = useSelector((s) => s.Settings);
  const insets = useSelector((s) => s.SingleCell.plotInsets);
  const genesState = useSelector((s) => s.Genes);
  const marginLeft = (insets?.left || 0) + CARD_PAD + GENOME_MARGIN;
  const marginRight = (insets?.right || 0) + CARD_PAD + GENOME_MARGIN;
  const width = Math.max(200, colWidth - marginLeft - marginRight);
  const extents = useMemo(() => domainExtents(domains, width, DOMAIN_GAP), [domains, width]);
  const px = (g) => {
    const e = extents.find(([, , d]) => g >= d[0] && g <= d[1]);
    if (!e) return NaN;
    const [px0, px1, d] = e;
    return marginLeft + px0 + ((g - d[0]) / Math.max(1, d[1] - d[0])) * (px1 - px0);
  };
  const clipX = (g) => {
    // positions outside every domain are clamped to the nearest domain edge
    if (!extents.length) return NaN;
    const v = px(g);
    if (Number.isFinite(v)) return v;
    let best = extents[0];
    let bd = Infinity;
    extents.forEach((e) => {
      const d = Math.min(Math.abs(g - e[2][0]), Math.abs(g - e[2][1]));
      if (d < bd) {
        bd = d;
        best = e;
      }
    });
    return marginLeft + (g < best[2][0] ? best[0] : best[1]);
  };
  const rows = useMemo(() => {
    const { lengths } = walkContainment(walks);
    return walks.map((w, i) => ({ walk: w, length: lengths[i] })).sort((a, b) => a.length - b.length); // shortest first (top)
  }, [walks]);
  const genes = useMemo(() => {
    const { optionsList = [], genesStartPoint = [], genesEndPoint = [] } = genesState || {};
    return optionsList.map((o) => ({ name: o.label, start: Number(genesStartPoint[o.value]), end: Number(genesEndPoint[o.value]) })).filter((g) => Number.isFinite(g.start) && domains.some((d) => g.end >= d[0] && g.start <= d[1]));
  }, [genesState, domains]);
  const spans = useMemo(() => chromosomeSpans(chromoBins, extents), [chromoBins, extents]);
  if (!walks.length) return <Text type="secondary">{t("components.single-cell.ecdna.none-selected")}</Text>;
  const walkGeneNames = new Set(walks.flatMap((w) => w.genes));
  const height = GENES_H + rows.length * ROW_H + AXIS_H;
  const labelFor = (w) => `${w.label} · ${w.stats?.ncells ?? w.ncells} cells · ${(w.stats?.medianCn ?? w.median_cn ?? 0).toFixed(0)}×`;
  const geneLabelEvery = Math.max(1, Math.ceil(genes.length / 30));
  return (
    <div ref={ref} style={{ width: "100%" }}>
      <svg width={colWidth} height={height} style={{ display: "block" }}>
        {/* genes */}
        {genes.map((g, k) => {
          const x0 = px(g.start);
          const x1 = px(g.end);
          if (!Number.isFinite(x0) && !Number.isFinite(x1)) return null;
          const a = Number.isFinite(x0) ? x0 : clipX(g.start);
          const b = Number.isFinite(x1) ? x1 : clipX(g.end);
          const mine = walkGeneNames.has(g.name);
          return (
            <g key={g.name}>
              <rect x={Math.min(a, b)} y={GENES_H - 10} width={Math.max(1.5, Math.abs(b - a))} height={5} fill={mine ? "#cf1322" : "#8c8c8c"} />
              {(mine || k % geneLabelEvery === 0) && (
                <text x={(a + b) / 2} y={GENES_H - 14 - (mine ? 0 : (k % 2) * 10)} textAnchor="middle" fontSize={mine ? 12 : 10} fontWeight={mine ? 700 : 400} fill={mine ? "#cf1322" : "#595959"}>{g.name}</text>
              )}
              <title>{g.name}</title>
            </g>
          );
        })}
        <text x={marginLeft - 8} y={GENES_H - 8} textAnchor="end" fontSize={11} fill="#8c8c8c">{t("components.single-cell.event-cells.genes")}</text>
        {/* walks */}
        {rows.map(({ walk: w }, i) => {
          const y = GENES_H + i * ROW_H;
          const cy = y + ROW_H / 2;
          const color = colorOf(w.id);
          const focused = focus === w.id;
          const endOf = (n) => (n.strand === "-" ? clipX(toGlobal(chromoBins, n.chromosome, n.start)) : clipX(toGlobal(chromoBins, n.chromosome, n.end)));
          const startOf = (n) => (n.strand === "-" ? clipX(toGlobal(chromoBins, n.chromosome, n.end)) : clipX(toGlobal(chromoBins, n.chromosome, n.start)));
          return (
            <g key={w.id} style={{ cursor: "pointer" }} onClick={() => onFocus && onFocus(w.id)}>
              <rect x={0} y={y} width={colWidth} height={ROW_H} fill={focused ? "#e6f4ff" : i % 2 ? "#fafafa" : "transparent"} />
              <text x={marginLeft - 8} y={cy} dy="0.35em" textAnchor="end" fontSize={12} fontWeight={focused ? 700 : 500} fill={color}>{labelFor(w)}</text>
              {w.nodes.map((n, k) => {
                const a = clipX(toGlobal(chromoBins, n.chromosome, n.start));
                const b = clipX(toGlobal(chromoBins, n.chromosome, n.end));
                if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
                return (
                  <rect key={k} x={Math.min(a, b)} y={cy - 6} width={Math.max(1, Math.abs(b - a))} height={12} fill={color} fillOpacity={n.strand === "-" ? 0.5 : 0.95}>
                    <title>{`${w.label} · node ${k + 1}/${w.nodes.length}: ${n.chromosome}:${n.start.toLocaleString()}-${n.end.toLocaleString()} (${n.strand})`}</title>
                  </rect>
                );
              })}
              {w.junctions.filter((j) => j.type === "ALT").map((j, k) => {
                const a = w.nodes[j.from];
                const b = w.nodes[j.to];
                if (!a || !b) return null;
                const x1 = endOf(a);
                const x2 = startOf(b);
                if (!Number.isFinite(x1) || !Number.isFinite(x2)) return null;
                const lift = Math.min(ROW_H * 0.9, Math.max(6, Math.abs(x2 - x1) / 8));
                return (
                  <path key={k} d={`M${x1},${cy - 6} Q${(x1 + x2) / 2},${cy - 6 - lift} ${x2},${cy - 6}`} fill="none" stroke="#cf1322" strokeWidth={1.5}>
                    <title>{`ALT junction: ${a.chromosome}:${a.strand === "-" ? a.start : a.end}${a.strand} → ${b.chromosome}:${b.strand === "-" ? b.end : b.start}${b.strand}`}</title>
                  </path>
                );
              })}
            </g>
          );
        })}
        {/* axis */}
        {spans.map((s) => (
          <g key={s.chromosome}>
            <line x1={marginLeft + s.x0} x2={marginLeft + s.x1} y1={height - AXIS_H + 4} y2={height - AXIS_H + 4} stroke="#8c8c8c" />
            <text x={marginLeft + (s.x0 + s.x1) / 2} y={height - 4} textAnchor="middle" fontSize={11} fill="#262626">{`chr${s.chromosome}`}</text>
          </g>
        ))}
        {extents.map(([px0, px1, d], k) => {
          const chr = spans.find((s) => s.x0 <= px0 + 1 && s.x1 >= px1 - 1)?.chromosome;
          const bin = chr ? chromoBins?.[chr] : null;
          const toMb = (g) => (bin ? ((g - bin.startPlace + bin.startPoint) / 1e6).toFixed(2) : "");
          return (
            <g key={k}>
              <text x={marginLeft + px0} y={height - AXIS_H + 15} fontSize={10} fill="#8c8c8c">{`${toMb(d[0])} Mb`}</text>
              <text x={marginLeft + px1} y={height - AXIS_H + 15} textAnchor="end" fontSize={10} fill="#8c8c8c">{`${toMb(d[1])} Mb`}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
