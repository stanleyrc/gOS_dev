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
export default function GeneCnScatter({ cnEntry, genes, cloneColors = {}, cloneLabels = {}, width = 520, panelHeight = 230, pooled = false, fontFamily = null }) {
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
  if (pooled) return <PooledScatter points={points} ga={ga} gb={gb} cloneColors={cloneColors} cloneLabels={cloneLabels} width={width} fontFamily={fontFamily} onPick={(id) => dispatch(singleCellActions.updateSelection([id]))} />;
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

const SQRT_TICKS = [0, 25, 50, 100, 200, 300, 500];

/**
 * Fig 5E as in the paper: cells pooled into ecDNA clades (EC1, EC2, ...) and
 * the integrated clade (CI), one panel each, square-root axes, density
 * contours; ecDNA: least-squares slope and R² of the raw copy numbers, CI:
 * median gene B / gene A ratio. Without a CI clade all tumour cells form one panel.
 */
function PooledScatter({ points, ga, gb, cloneColors, cloneLabels, width, fontFamily, onPick }) {
  const labelOf = (c) => `${cloneLabels[c] || c}`;
  const hasCI = points.some((p) => labelOf(p.clone) === "CI");
  const groupOf = (p) => (!hasCI ? "Tumour cells" : labelOf(p.clone) === "CI" ? "CI" : /^EC\d/.test(labelOf(p.clone)) ? "ecDNA" : null);
  const groups = (hasCI ? ["ecDNA", "CI"] : ["Tumour cells"]).map((g) => ({ g, pts: points.filter((p) => groupOf(p) === g) })).filter((x) => x.pts.length);
  const colorFor = (g, pts) => {
    if (g === "CI") return cloneColors[pts[0]?.clone] || "#553E90";
    const ec = pts.find((p) => labelOf(p.clone) === "EC1") || pts[0];
    return g === "ecDNA" ? cloneColors[ec?.clone] || "#88171C" : INK.text;
  };
  const xm = Math.max(10, d3.max(points, (p) => p.a) * 1.05);
  const ym = Math.max(10, d3.max(points, (p) => p.b) * 1.05);
  const pw = Math.min(260, Math.floor(width / groups.length));
  const ph = 240;
  const M = { top: 24, right: 12, bottom: 40, left: 46 };
  const x = d3.scaleSqrt().domain([0, xm]).range([M.left, pw - M.right]);
  const y = d3.scaleSqrt().domain([0, ym]).range([ph - M.bottom, M.top]);
  const ff = fontFamily || undefined;
  return (
    <svg width={pw * groups.length} height={ph} role="img" aria-label={`${gb} vs ${ga} copy number, ecDNA vs integrated`} fontFamily={ff}>
      {groups.map(({ g, pts }, k) => {
        const f = fit(pts);
        const color = colorFor(g, pts);
        const contours =
          pts.length >= 5
            ? d3
                .contourDensity()
                .x((p) => x(p.a))
                .y((p) => y(p.b))
                .size([pw, ph])
                .bandwidth(9)
                .thresholds(9)(pts)
            : [];
        const xs = d3.range(0, 81).map((i) => (d3.min(pts, (p) => p.a) || 0) + (i / 80) * ((d3.max(pts, (p) => p.a) || 0) - (d3.min(pts, (p) => p.a) || 0)));
        const line = f && Number.isFinite(f.slope) && g !== "CI" ? xs.map((v) => [v, f.intercept + f.slope * v]).filter(([, v]) => v >= 0 && v <= ym) : [];
        return (
          <g key={g} transform={`translate(${k * pw},0)`}>
            <text x={pw - M.right} y={16} textAnchor="end" fontSize={TYPE.title + 2} fill={color}>{g}</text>
            <line x1={M.left - 3} x2={M.left - 3} y1={M.top} y2={ph - M.bottom} stroke={INK.text} strokeWidth={0.7} />
            <line x1={M.left} x2={pw - M.right} y1={ph - M.bottom + 3} y2={ph - M.bottom + 3} stroke={INK.text} strokeWidth={0.7} />
            {SQRT_TICKS.filter((v) => v <= ym).map((v) => (
              <g key={`y${v}`}>
                <line x1={M.left - 6} x2={M.left - 3} y1={y(v)} y2={y(v)} stroke={INK.text} strokeWidth={0.6} />
                <text x={M.left - 8} y={y(v)} dy="0.35em" textAnchor="end" fontSize={FONT.axis} fill={INK.text}>{v}</text>
              </g>
            ))}
            {SQRT_TICKS.filter((v) => v <= xm && v !== 50).map((v) => (
              <g key={`x${v}`}>
                <line x1={x(v)} x2={x(v)} y1={ph - M.bottom + 3} y2={ph - M.bottom + 6} stroke={INK.text} strokeWidth={0.6} />
                <text x={x(v)} y={ph - M.bottom + 16} textAnchor="middle" fontSize={FONT.axis} fill={INK.text}>{v}</text>
              </g>
            ))}
            <text x={(M.left + pw - M.right) / 2} y={ph - 6} textAnchor="middle" fontSize={TYPE.label} fill={INK.text}>{`${ga} CN`}</text>
            <text transform={`translate(12,${(M.top + ph - M.bottom) / 2}) rotate(-90)`} textAnchor="middle" fontSize={TYPE.label} fill={INK.text}>{`${gb} CN`}</text>
            {contours.map((cn, i) => <path key={i} d={d3.geoPath()(cn)} fill="none" stroke={color} strokeWidth={0.6} />)}
            {pts.map((p) => (
              <circle key={p.id} cx={x(Math.max(0, p.a))} cy={y(Math.max(0, p.b))} r={1.6} fill={INK.text} style={{ cursor: "pointer" }} onClick={() => onPick(p.id)}>
                <title>{`${p.id} (${labelOf(p.clone)}): ${ga} ${p.a.toFixed(1)}, ${gb} ${p.b.toFixed(1)}`}</title>
              </circle>
            ))}
            {line.length > 1 && <path d={d3.line()(line.map(([a, b]) => [x(a), y(b)]))} fill="none" stroke={INK.text} strokeWidth={0.9} />}
            <text x={M.left + 4} y={M.top + 4} fontSize={FONT.axis} fill={INK.text}>
              {g === "CI" ? (
                <tspan x={M.left + 4}>{`Ratio: ${Number.isFinite(f?.ratio) ? f.ratio.toFixed(2) : "–"}`}</tspan>
              ) : (
                <>
                  <tspan x={M.left + 4}>{`Slope: ${Number.isFinite(f?.slope) ? f.slope.toFixed(2) : "–"}`}</tspan>
                  <tspan x={M.left + 4} dy="1.2em">{`R²: ${Number.isFinite(f?.r2) ? f.r2.toFixed(2) : "–"}`}</tspan>
                </>
              )}
              <tspan x={M.left + 4} dy="1.2em">{`n = ${pts.length} cells`}</tspan>
            </text>
          </g>
        );
      })}
    </svg>
  );
}
