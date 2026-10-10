import React, { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import * as d3 from "d3";
import { Typography } from "antd";
import { geneLocus } from "../../../helpers/singleCell/dosage";
import { locusCn } from "../../../helpers/singleCell/cnExpression";
import { isNormalClone } from "../../../helpers/singleCell/figures";
import { naturalCompare } from "../../../helpers/singleCell/matrix";
import singleCellActions from "../../../redux/singleCell/actions";
import { FONT } from "../cohort/charts";
import { INK, TYPE } from "../../../helpers/singleCell/plotTheme";

const { Text } = Typography;

function fit(points) {
  const n = points.length;
  if (n < 3) return null;
  const mx = d3.mean(points, (p) => p.a);
  const my = d3.mean(points, (p) => p.b);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  points.forEach((p) => {
    sxy += (p.a - mx) * (p.b - my);
    sxx += (p.a - mx) ** 2;
    syy += (p.b - my) ** 2;
  });
  const slope = sxx > 0 ? sxy / sxx : NaN;
  return { n, slope, intercept: my - slope * mx, r2: sxx > 0 && syy > 0 ? (sxy * sxy) / (sxx * syy) : NaN, ratio: d3.median(points.filter((p) => p.a > 0), (p) => p.b / p.a) };
}

/**
 * Copy number of gene B vs gene A per cell (each cell's genome graph), one
 * panel per clone group, coloured by clone, with slope / R² / B:A ratio:
 * co-amplified genes on one ecDNA rise together (slope ~ ratio, high R²);
 * a chromosomally integrated copy sits at a fixed ratio with little spread.
 * Click a point to select the cell.
 */
export default function GeneCnScatter({ cnEntry, genes, cloneColors = {}, cloneLabels = {}, width = 520, panelHeight = 230 }) {
  const dispatch = useDispatch();
  const genesState = useSelector((s) => s.Genes);
  const [ga, gb] = genes;
  const la = geneLocus(genesState, ga);
  const lb = geneLocus(genesState, gb);
  const points = useMemo(() => {
    if (!la || !lb) return [];
    return (cnEntry?.cellRows || [])
      .filter((c) => !isNormalClone(c.clone))
      .map((c) => ({ id: c.cellId, clone: c.clone || "Unassigned", a: locusCn(c.row, la.start, la.end), b: locusCn(c.row, lb.start, lb.end) }))
      .filter((p) => Number.isFinite(p.a) && Number.isFinite(p.b));
  }, [cnEntry, la?.start, lb?.start]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!la || !lb) return <Text type="secondary">{`Pick two genes (${ga || "?"}, ${gb || "?"} not found).`}</Text>;
  if (!points.length) return <Text type="secondary">Loading cell copy number…</Text>;
  const clones = [...new Set(points.map((p) => p.clone))].sort(naturalCompare);
  const top = Math.max(10, d3.quantile(points.map((p) => Math.max(p.a, p.b)).sort(d3.ascending), 0.99) * 1.05);
  const cols = Math.min(clones.length, Math.max(1, Math.floor(width / 190)));
  const panelW = Math.floor(width / cols);
  const rows = Math.ceil(clones.length / cols);
  const M = { top: 22, right: 10, bottom: 34, left: 40 };
  const x = d3.scaleLinear().domain([0, top]).nice().range([M.left, panelW - M.right]);
  const ph = panelHeight;
  const y = d3.scaleLinear().domain([0, top]).nice().range([ph - M.bottom, M.top]);
  return (
    <svg width={width} height={rows * ph} role="img" aria-label={`${gb} vs ${ga} copy number per clone`}>
      {clones.map((clone, k) => {
        const pts = points.filter((p) => p.clone === clone);
        const f = fit(pts);
        const color = cloneColors[clone] || INK.text;
        const ox = (k % cols) * panelW;
        const oy = Math.floor(k / cols) * ph;
        return (
          <g key={clone} transform={`translate(${ox},${oy})`}>
            <text x={(M.left + panelW - M.right) / 2} y={14} textAnchor="middle" fontSize={TYPE.label + 1} fontWeight={700} fill={color}>{`${cloneLabels[clone] || clone} (${pts.length})`}</text>
            <line x1={M.left} x2={panelW - M.right} y1={y.range()[0]} y2={y.range()[0]} stroke={INK.axis} />
            <line x1={M.left} x2={M.left} y1={M.top} y2={y.range()[0]} stroke={INK.axis} />
            {x.ticks(4).map((v) => <text key={`x${v}`} x={x(v)} y={y.range()[0] + 13} textAnchor="middle" fontSize={FONT.axis} fill={INK.textSecondary}>{v}</text>)}
            {y.ticks(4).map((v) => <text key={`y${v}`} x={M.left - 4} y={y(v)} dy="0.35em" textAnchor="end" fontSize={FONT.axis} fill={INK.textSecondary}>{v}</text>)}
            <text x={(M.left + panelW - M.right) / 2} y={y.range()[0] + 28} textAnchor="middle" fontSize={TYPE.label} fill={INK.text}>{`${ga} CN`}</text>
            <text transform={`translate(10,${(M.top + y.range()[0]) / 2}) rotate(-90)`} textAnchor="middle" fontSize={TYPE.label} fill={INK.text}>{`${gb} CN`}</text>
            {f && Number.isFinite(f.slope) && (
              <line x1={x(0)} x2={x(top)} y1={y(Math.max(0, Math.min(top, f.intercept)))} y2={y(Math.max(0, Math.min(top, f.intercept + f.slope * top)))} stroke={color} strokeWidth={1.5} opacity={0.7} />
            )}
            {pts.map((p) => (
              <circle key={p.id} cx={x(Math.min(p.a, top))} cy={y(Math.min(p.b, top))} r={3} fill={color} fillOpacity={0.75} stroke={INK.panel} strokeWidth={0.5} style={{ cursor: "pointer" }} onClick={() => dispatch(singleCellActions.updateSelection([p.id]))}>
                <title>{`${p.id}: ${ga} ${p.a.toFixed(1)}, ${gb} ${p.b.toFixed(1)}`}</title>
              </circle>
            ))}
            {f && (
              <text x={M.left + 6} y={M.top + 10} fontSize={FONT.axis + 0.5} fill={INK.text}>
                <tspan x={M.left + 6}>{`slope ${Number.isFinite(f.slope) ? f.slope.toFixed(2) : "–"}  R² ${Number.isFinite(f.r2) ? f.r2.toFixed(2) : "–"}`}</tspan>
                <tspan x={M.left + 6} dy="1.2em">{`ratio ${Number.isFinite(f.ratio) ? f.ratio.toFixed(2) : "–"}  CV ${(d3.deviation(pts, (p) => p.a) / d3.mean(pts, (p) => p.a)).toFixed(2)}`}</tspan>
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
