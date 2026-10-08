import React, { useMemo } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Card, Empty, Space, Tag, Typography } from "antd";
import { RadarChartOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import SvgExportButton from "../svgExportButton";
import { walkGenes, toGlobal } from "../../../helpers/singleCell/walks";

const { Text } = Typography;
const CHR_ORDER = [...d3.range(1, 23).map(String), "X", "Y"];
const chrColor = d3.scaleOrdinal(CHR_ORDER, [...d3.schemeTableau10, ...d3.schemeSet3, ...d3.schemePastel2]);
const fmtPos = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(2)} Mb` : `${(v / 1e3).toFixed(0)} kb`);

/**
 * One walk as a ring (circular walks) or a bar (linear): nodes drawn with
 * length proportional to their width, coloured by chromosome, arrowheads
 * for strand, ALT junctions marked where two non-adjacent pieces of genome
 * are joined, genes overlapping the nodes labelled outside; below, the
 * same nodes laid on their chromosomes so the genomic composition is clear.
 */
export default function WalkDiagram({ walk, colorOf, cellCount }) {
  const { t } = useTranslation("common");
  const [ref, width] = useContainerWidth(700);
  const chromoBins = useSelector((s) => s.Settings.chromoBins);
  const genesState = useSelector((s) => s.Genes);
  const genes = useMemo(() => {
    const { optionsList = [], genesStartPoint = [], genesEndPoint = [] } = genesState || {};
    return optionsList.map((o) => ({ name: o.label, start: Number(genesStartPoint[o.value]), end: Number(genesEndPoint[o.value]) })).filter((g) => Number.isFinite(g.start) && Number.isFinite(g.end));
  }, [genesState]);
  const hits = useMemo(() => (walk ? walkGenes(walk, genes, chromoBins) : []), [walk, genes, chromoBins]);
  if (!walk) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.ecdna.pick-walk")} />;
  const nodes = walk.nodes;
  const total = d3.sum(nodes, (n) => n.end - n.start + 1) || 1;
  const w = Math.max(420, width - 16);
  const size = Math.min(w, 520);
  const R = size / 2 - 70;
  const cx = size / 2;
  const cy = size / 2;
  // cumulative angle per node (circular) or x position (linear)
  let acc = 0;
  const placed = nodes.map((n, i) => {
    const len = n.end - n.start + 1;
    const a0 = (acc / total) * 2 * Math.PI;
    acc += len;
    const a1 = (acc / total) * 2 * Math.PI;
    return { ...n, i, len, a0, a1, f0: (acc - len) / total, f1: acc / total };
  });
  const alt = walk.junctions.filter((j) => j.type === "ALT");
  const genesByNode = d3.group(hits, (g) => g.node);
  // label up to ~30 genes: the walk's own genes first, then longest overlaps
  const labelled = [...hits].sort((a, b) => (walk.genes.includes(b.name) - walk.genes.includes(a.name)) || b.span - a.span).slice(0, 30);
  const arc = d3.arc();
  const chromosomes = [...new Set(nodes.map((n) => n.chromosome))].sort((a, b) => CHR_ORDER.indexOf(a) - CHR_ORDER.indexOf(b));
  const stripW = w - 40;
  return (
    <Card
      size="small"
      title={<Space><RadarChartOutlined /><span style={{ color: colorOf(walk.id) }}>{walk.label}</span><Text type="secondary">{walk.circular ? t("components.single-cell.ecdna.circular") : t("components.single-cell.ecdna.linear")} · {fmtPos(walk.span)} · {t("components.single-cell.ecdna.nodes", { count: nodes.length })} · {t("components.single-cell.ecdna.alt-junctions", { count: alt.length })}</Text></Space>}
      extra={<SvgExportButton containerRef={ref} name={`walk-${walk.label}`} />}
    >
      <div ref={ref}>
        <Space wrap size={4} style={{ marginBottom: 6 }}>
          {walk.genes.map((g) => <Tag key={g} color="volcano" style={{ margin: 0 }}>{g}</Tag>)}
          {walk.coordinates && <Text type="secondary" style={{ fontSize: 12 }}>{walk.coordinates}</Text>}
          <Text type="secondary" style={{ fontSize: 12 }}>{t("components.single-cell.ecdna.diagram-cells", { cells: walk.stats?.ncells ?? walk.ncells, total: cellCount, median: (walk.stats?.medianCn ?? walk.median_cn ?? 0).toFixed(0) })}</Text>
        </Space>
        {walk.circular ? (
          <svg width={size} height={size} style={{ display: "block", margin: "0 auto" }}>
            {placed.map((n) => {
              const path = arc({ innerRadius: R - 14, outerRadius: R, startAngle: n.a0, endAngle: n.a1 });
              const mid = (n.a0 + n.a1) / 2;
              return (
                <g key={n.i}>
                  <path d={path} fill={chrColor(n.chromosome)} stroke="#fff" strokeWidth={0.5}>
                    <title>{`${n.chromosome}:${n.start.toLocaleString()}-${n.end.toLocaleString()} (${n.strand}) · ${fmtPos(n.len)}${Number.isFinite(n.cn) ? ` · graph CN ${n.cn}` : ""}\n${(genesByNode.get(n.i) || []).map((g) => g.name).join(", ")}`}</title>
                  </path>
                  {n.a1 - n.a0 > 0.08 && (
                    <text x={cx + (R - 7) * Math.sin(mid)} y={cy - (R - 7) * Math.cos(mid)} dy="0.35em" textAnchor="middle" fontSize={8} fill="#fff" transform={`rotate(${(mid * 180) / Math.PI + (n.strand === "-" ? 180 : 0)},${cx + (R - 7) * Math.sin(mid)},${cy - (R - 7) * Math.cos(mid)})`} pointerEvents="none">▶</text>
                  )}
                </g>
              );
            })}
            {walk.junctions.map((j, k) => {
              const n = placed[j.from];
              if (!n) return null;
              const a = n.a1;
              const x = cx + R * Math.sin(a);
              const y = cy - R * Math.cos(a);
              return j.type === "ALT" ? (
                <g key={k}>
                  <circle cx={x} cy={y} r={4} fill="#cf1322" stroke="#fff" />
                  <title>{`ALT junction: ${n.chromosome}:${n.strand === "-" ? n.start : n.end}${n.strand} → ${placed[j.to]?.chromosome}:${placed[j.to]?.strand === "-" ? placed[j.to]?.end : placed[j.to]?.start}${placed[j.to]?.strand}`}</title>
                </g>
              ) : null;
            })}
            {labelled.map((g, k) => {
              const n = placed[g.node];
              const a = n.a0 + ((g.offset + g.span / 2) / Math.max(1, n.len)) * (n.a1 - n.a0);
              const r1 = R + 6;
              const r2 = R + 18 + (k % 3) * 11;
              const x1 = cx + r1 * Math.sin(a);
              const y1 = cy - r1 * Math.cos(a);
              const x2 = cx + r2 * Math.sin(a);
              const y2 = cy - r2 * Math.cos(a);
              const right = Math.sin(a) >= 0;
              return (
                <g key={g.name}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#bfbfbf" />
                  <text x={x2 + (right ? 3 : -3)} y={y2} dy="0.35em" textAnchor={right ? "start" : "end"} fontSize={walk.genes.includes(g.name) ? 11 : 9} fontWeight={walk.genes.includes(g.name) ? 700 : 400} fill={walk.genes.includes(g.name) ? "#cf1322" : "#595959"}>{g.name}</text>
                </g>
              );
            })}
            <text x={cx} y={cy - 8} textAnchor="middle" fontSize={14} fontWeight={600} fill="#262626">{walk.label}</text>
            <text x={cx} y={cy + 10} textAnchor="middle" fontSize={11} fill="#8c8c8c">{fmtPos(walk.span)}</text>
          </svg>
        ) : (
          <svg width={w} height={70}>
            {placed.map((n) => (
              <rect key={n.i} x={20 + n.f0 * (w - 40)} y={20} width={Math.max(1, (n.f1 - n.f0) * (w - 40))} height={20} fill={chrColor(n.chromosome)} stroke="#fff" strokeWidth={0.5}>
                <title>{`${n.chromosome}:${n.start}-${n.end} (${n.strand})`}</title>
              </rect>
            ))}
            {labelled.slice(0, 12).map((g, k) => {
              const n = placed[g.node];
              const x = 20 + (n.f0 + ((g.offset + g.span / 2) / Math.max(1, n.len)) * (n.f1 - n.f0)) * (w - 40);
              return <text key={g.name} x={x} y={k % 2 ? 12 : 58} textAnchor="middle" fontSize={9} fill="#595959">{g.name}</text>;
            })}
          </svg>
        )}
        {/* genomic composition: the nodes on their chromosomes */}
        <svg width={w} height={chromosomes.length * 34 + 10}>
          {chromosomes.map((chr, r) => {
            const mine = placed.filter((n) => n.chromosome === chr);
            const lo = d3.min(mine, (n) => n.start);
            const hi = d3.max(mine, (n) => n.end);
            const pad = (hi - lo) * 0.05 + 1e4;
            const x = d3.scaleLinear().domain([lo - pad, hi + pad]).range([50, 20 + stripW]);
            const chrGenes = genes.filter((g) => Number.isFinite(toGlobal(chromoBins, chr, lo)) && g.start >= toGlobal(chromoBins, chr, lo - pad) && g.end <= toGlobal(chromoBins, chr, hi + pad) && walk.genes.includes(g.name));
            return (
              <g key={chr} transform={`translate(0,${r * 34 + 6})`}>
                <text x={44} y={14} textAnchor="end" fontSize={11} fontWeight={600} fill={chrColor(chr)}>{`chr${chr}`}</text>
                <line x1={50} x2={20 + stripW} y1={14} y2={14} stroke="#d9d9d9" />
                {mine.map((n) => (
                  <rect key={n.i} x={x(n.start)} y={8} width={Math.max(1, x(n.end) - x(n.start))} height={12} fill={chrColor(n.chromosome)} fillOpacity={n.strand === "-" ? 0.55 : 1}>
                    <title>{`${n.chromosome}:${n.start.toLocaleString()}-${n.end.toLocaleString()} (${n.strand})`}</title>
                  </rect>
                ))}
                {chrGenes.map((g) => {
                  const gs = g.start - toGlobal(chromoBins, chr, 0);
                  const ge = g.end - toGlobal(chromoBins, chr, 0);
                  return <text key={g.name} x={x((gs + ge) / 2)} y={30} textAnchor="middle" fontSize={9} fill="#cf1322">{g.name}</text>;
                })}
                <text x={50} y={30} fontSize={8} fill="#8c8c8c">{fmtPos(lo)}</text>
                <text x={20 + stripW} y={30} textAnchor="end" fontSize={8} fill="#8c8c8c">{fmtPos(hi)}</text>
              </g>
            );
          })}
        </svg>
        <Text type="secondary" style={{ fontSize: 12 }}>{t("components.single-cell.ecdna.diagram-help")}</Text>
      </div>
    </Card>
  );
}
