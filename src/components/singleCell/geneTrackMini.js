import React, { useMemo } from "react";
import { useSelector } from "react-redux";
import { Typography } from "antd";
import { domainExtents } from "../../helpers/singleCell/matrix";
import { TYPE } from "../../helpers/singleCell/plotTheme";

const { Text } = Typography;
const H = 44;

/**
 * Compact gene track over the current genome domains (same split as the
 * heatmap / cell tracks): gene bodies as bars, names when they fit.
 */
export default function GeneTrackMini({ width, highlight = null }) {
  const genesState = useSelector((s) => s.Genes);
  const domains = useSelector((s) => s.Settings.domains);
  const genes = useMemo(() => {
    const { optionsList = [], genesStartPoint = [], genesEndPoint = [] } = genesState || {};
    return optionsList.map((o) => ({ name: o.label, start: Number(genesStartPoint[o.value]), end: Number(genesEndPoint[o.value]) })).filter((g) => Number.isFinite(g.start) && Number.isFinite(g.end));
  }, [genesState]);
  if (!width || !domains?.length) return null;
  const extents = domainExtents(domains, width, 6);
  const shown = [];
  extents.forEach(([px0, px1, d]) => {
    const scale = (g) => px0 + ((g - d[0]) / (d[1] - d[0])) * (px1 - px0);
    genes.filter((g) => g.end >= d[0] && g.start <= d[1]).forEach((g) => shown.push({ ...g, x0: Math.max(px0, scale(g.start)), x1: Math.min(px1, scale(g.end)) }));
  });
  if (!shown.length) return <Text type="secondary" style={{ fontSize: 12.5 }}>no genes in view</Text>;
  // two lanes to reduce overlaps
  const lanes = [[], []];
  const placed = shown
    .sort((a, b) => a.x0 - b.x0)
    .map((g) => {
      const lane = lanes[0].every((o) => o.x1 + 4 < g.x0) ? 0 : 1;
      lanes[lane].push(g);
      return { ...g, lane };
    });
  return (
    <svg width={width} height={H} style={{ display: "block" }}>
      {placed.map((g) => {
        const hl = highlight && `${highlight}`.toUpperCase() === g.name.toUpperCase();
        const y = 4 + g.lane * 20;
        const w = Math.max(1.5, g.x1 - g.x0);
        return (
          <g key={`${g.name}-${g.x0}`}>
            <rect x={g.x0} y={y + 4} width={w} height={8} fill={hl ? "#D7191C" : "#7a9cc6"} rx={2} />
            {w > 24 && <text x={g.x0 + 2} y={y + 1} fontSize={TYPE.micro} fill={hl ? "#D7191C" : "#595959"} fontWeight={hl ? 700 : 400}>{g.name}</text>}
            <title>{g.name}</title>
          </g>
        );
      })}
    </svg>
  );
}
