import React, { useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Typography } from "antd";
import settingsActions from "../../../redux/settings/actions";
import { domainExtents } from "../../../helpers/singleCell/matrix";
import { toGlobal } from "../../../helpers/singleCell/walks";
import useContainerWidth from "../useContainerWidth";

const { Text } = Typography;
const GAP_X = 50; // same outer margin / inter-domain gap as the heatmap and the genes plot
const BAR_MAX = 12;
const FAMILY_GAP = 4; // between walk families
const ARROW = 5;
const AXIS_H = 16;
const HEAD_H = 14; // chromosome / range header above each panel
// the heatmap draws its genomic columns 10 px further right than its reported inset
const HEATMAP_OFFSET = 10;

/** PGV WalkInterval.points: a box with an arrow head on the strand side (plain box when too narrow). */
function intervalPoints(w, h, strand) {
  if (w <= ARROW) return [0, 0, w, 0, w, h, 0, h];
  if (strand === "-") return [0, h / 2, ARROW, h, w, h, w, 0, ARROW, 0];
  return [0, 0, w - ARROW, 0, w, h / 2, w - ARROW, h, 0, h];
}

/**
 * ecDNA / amplicon walks drawn the way PGV's walk plot draws them: one lane
 * per walk, each node an arrow-shaped interval (strand) on the shared
 * genome axis (the Settings domains, so the heatmap and genes track below
 * follow), ALT junctions as arcs above the lane, junctions whose partner
 * is outside every visible domain as an anchor stub (click to open that
 * region as an extra panel). Hover a walk to isolate it, click to focus,
 * double-click to zoom to it; Cmd/Ctrl + wheel zooms, drag pans.
 *
 * `labelWidth` is the room left of the genome axis (the heatmap's tree +
 * strips) where the lane labels go; the plot area itself starts at
 * labelWidth + GAP_X like the heatmap's genomic columns.
 */
export default function WalksPlot({ walks, families, colorOf, focus, onFocus, labelWidth, rightWidth = 0, laneHeight = 18, colorBy = "walk" }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const [ref, width] = useContainerWidth(1200);
  const { domains, chromoBins, defaultDomain } = useSelector((s) => s.Settings);
  const [hover, setHover] = useState(null); // { walkId, x, y, lines }
  const drag = useRef(null);
  const svgRef = useRef(null);
  const BAR = Math.max(6, Math.min(BAR_MAX, Math.round(laneHeight * 0.45)));
  // anchor stub length: stays inside the lane
  const stub = Math.max(3, Math.min(8, laneHeight / 2 - BAR / 2 - 4));

  const stageW = Math.max(200, width - labelWidth - rightWidth - 2 * GAP_X);
  const x0 = labelWidth + GAP_X + HEATMAP_OFFSET;
  const extents = useMemo(() => domainExtents(domains, stageW, GAP_X), [domains, stageW]);
  const panelOf = (g) => extents.findIndex(([, , d]) => g >= d[0] && g <= d[1]);
  const px = (g, k = panelOf(g)) => {
    if (k < 0) return NaN;
    const [a, b, d] = extents[k];
    return x0 + a + ((g - d[0]) / Math.max(1, d[1] - d[0])) * (b - a);
  };
  // lanes: families in order, separated by a small gap
  const lanes = useMemo(() => {
    const out = [];
    let y = HEAD_H + 2;
    families.forEach((fam, f) => {
      if (f > 0) y += FAMILY_GAP;
      fam.forEach((w) => {
        out.push({ walk: w, y, family: f });
        y += laneHeight;
      });
    });
    return { rows: out, height: y + 2 };
  }, [families, laneHeight]);
  const height = lanes.height + AXIS_H;
  const chrColor = (chr) => chromoBins?.[`${chr}`]?.color || "#8c8c8c";

  // ---- zoom / pan on the shared domains ----
  const genomeEnd = defaultDomain?.[1] || Infinity;
  const setDomain = (k, d) => {
    const next = domains.map((x, i) => (i === k ? [Math.max(1, Math.round(d[0])), Math.min(genomeEnd, Math.round(d[1]))] : x));
    if (next[k][1] - next[k][0] < 1000) return;
    dispatch(settingsActions.updateDomains(next));
  };
  const local = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const panelAtX = (x) => extents.findIndex(([a, b]) => x >= x0 + a && x <= x0 + b);
  const onWheel = (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    e.preventDefault();
    const [mx] = local(e);
    const k = panelAtX(mx);
    if (k < 0) return;
    const [a, b, d] = extents[k];
    const anchor = d[0] + ((mx - x0 - a) / Math.max(1, b - a)) * (d[1] - d[0]);
    const f = Math.exp(Math.max(-1, Math.min(1, e.deltaY / 300)));
    setDomain(k, [anchor - (anchor - d[0]) * f, anchor + (d[1] - anchor) * f]);
  };
  const onDown = (e) => {
    if (e.button !== 0) return;
    const [mx] = local(e);
    const k = panelAtX(mx);
    if (k >= 0) drag.current = { k, x: mx, d: extents[k][2], moved: false };
  };
  const onMove = (e) => {
    const g = drag.current;
    if (!g) return;
    const [mx] = local(e);
    const dx = mx - g.x;
    if (Math.abs(dx) < 3 && !g.moved) return;
    g.moved = true;
    const [a, b] = extents[g.k];
    const shift = (-dx / Math.max(1, b - a)) * (g.d[1] - g.d[0]);
    setDomain(g.k, [g.d[0] + shift, g.d[1] + shift]);
  };
  const onUp = () => {
    setTimeout(() => (drag.current = null), 0);
  };
  const zoomToWalk = (w) => {
    const byChr = d3.group(w.nodes, (n) => n.chromosome);
    const ds = [...byChr.entries()]
      .map(([chr, nodes]) => {
        const g0 = toGlobal(chromoBins, chr, d3.min(nodes, (n) => n.start));
        const g1 = toGlobal(chromoBins, chr, d3.max(nodes, (n) => n.end));
        const pad = Math.max(5e4, (g1 - g0) * 0.08);
        return Number.isFinite(g0) ? [Math.max(1, Math.round(g0 - pad)), Math.round(g1 + pad)] : null;
      })
      .filter(Boolean)
      .sort((a, b) => a[0] - b[0]);
    if (ds.length) dispatch(settingsActions.updateDomains(ds));
  };
  const addAnchorDomain = (chr, pos) => {
    const g = toGlobal(chromoBins, chr, pos);
    if (!Number.isFinite(g)) return;
    dispatch(settingsActions.updateDomains([...domains, [Math.max(1, Math.round(g - 2.5e5)), Math.round(g + 2.5e5)]].sort((a, b) => a[0] - b[0])));
  };

  const showTip = (e, walk, lines) => {
    const r = ref.current.getBoundingClientRect();
    setHover({ walkId: walk.id, x: e.clientX - r.left + 14, y: e.clientY - r.top + 14, lines });
  };
  const active = hover?.walkId || null;
  const dimmed = (w) => (active ? w.id !== active : focus ? w.id !== focus : false);

  // genomic axis ticks per panel
  const ticks = extents.map(([a, b, d], k) => {
    const chr = Object.values(chromoBins || {}).find((c) => d[0] >= c.startPlace && d[0] <= c.endPlace);
    const scale = d3.scaleLinear().domain(d).range([x0 + a, x0 + b]);
    const vals = scale.ticks(Math.max(2, Math.floor((b - a) / 110)));
    return { k, chr, scale, vals };
  });
  const fmtPos = (g, chr) => {
    if (!chr) return "";
    const p = g - chr.startPlace + chr.startPoint;
    return p >= 1e6 ? `${(p / 1e6).toFixed(p >= 1e7 ? 1 : 2)} Mb` : `${(p / 1e3).toFixed(0)} kb`;
  };

  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }} onMouseLeave={() => setHover(null)}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{ display: "block", userSelect: "none", cursor: drag.current?.moved ? "grabbing" : "default" }}
        onWheel={onWheel}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={onUp}
      >
        <defs>
          {extents.map(([a, b], k) => (
            <clipPath key={k} id={`walks-clip-${k}`}>
              <rect x={x0 + a} y={0} width={b - a} height={height} />
            </clipPath>
          ))}
        </defs>
        {/* panel headers: chromosome and visible range */}
        {ticks.map(({ k, scale, chr }) => {
          const [ga, gb] = scale.domain();
          const [xa, xb] = scale.range();
          return (
            <g key={`h${k}`}>
              <rect x={xa} y={0} width={xb - xa} height={HEAD_H} fill={chr?.color || "#d9d9d9"} fillOpacity={0.18} />
              <text x={(xa + xb) / 2} y={HEAD_H / 2} dy="0.35em" textAnchor="middle" fontSize={10.5} fill="#262626">
                <tspan fontWeight={700}>{chr ? `chr${chr.chromosome}` : ""}</tspan>
                {chr && xb - xa > 140 ? `  ${fmtPos(ga, chr)} – ${fmtPos(gb, chr)}` : ""}
              </text>
            </g>
          );
        })}
        {/* panel frames */}
        {extents.map(([a, b], k) => (
          <rect key={`f${k}`} x={x0 + a} y={0} width={b - a} height={lanes.height} fill="none" stroke="#91caff" strokeOpacity={0.6} />
        ))}
        {/* grid */}
        {ticks.map(({ k, vals, scale }) => vals.map((v) => <line key={`g${k}-${v}`} x1={scale(v)} x2={scale(v)} y1={0} y2={lanes.height} stroke="#f0f0f0" />))}
        {lanes.rows.map(({ walk: w, y }, i) => {
          const cy = y + laneHeight / 2;
          const color = colorOf(w.id);
          const isFocus = focus === w.id;
          const off = dimmed(w);
          const meta = `${w.stats?.ncells ?? w.ncells} cells · ${(w.stats?.medianCn ?? w.median_cn ?? 0).toFixed(0)}×`;
          const nodeEnd = (n, side) => toGlobal(chromoBins, n.chromosome, side === "end" ? (n.strand === "-" ? n.start : n.end) : n.strand === "-" ? n.end : n.start);
          return (
            <g
              key={w.id}
              opacity={off ? 0.22 : 1}
              style={{ cursor: "pointer" }}
              onMouseEnter={(e) => showTip(e, w, [w.label, `${w.circular ? "circular" : "linear"} · ${d3.format(".3s")(w.span)}b · ${w.nodes.length} segments${w.n_nodes_raw > w.nodes.length ? ` (${w.n_nodes_raw} graph nodes)` : ""} · ${w.junctions.filter((j) => j.type === "ALT").length} ALT junctions`, meta, w.genes.length ? `genes: ${w.genes.join(", ")}` : null, t("components.single-cell.ecdna.plot-click")].filter(Boolean))}
              onMouseMove={(e) => hover && showTip(e, w, hover.lines)}
              onClick={() => !drag.current?.moved && onFocus && onFocus(w.id)}
              onDoubleClick={() => zoomToWalk(w)}
            >
              <rect x={0} y={y} width={width} height={laneHeight} fill={isFocus ? "#e6f4ff" : i % 2 ? "#fafafa" : "#fff"} fillOpacity={0.9} />
              {/* label */}
              {/* label: name, curated tick and cells / copies / size on one line (full detail in the tooltip) */}
              <circle cx={10} cy={cy} r={Math.min(5, laneHeight / 3.5)} fill={color} />
              <text x={20} y={cy} dy="0.35em" fontSize={laneHeight < 16 ? 10.5 : 11.5} fill="#262626">
                <tspan fontWeight={isFocus ? 700 : 600}>{w.label.length > 22 ? `${w.label.slice(0, 21)}…` : w.label}</tspan>
                {w.curated && <tspan fill="#389e0d" fontWeight={600}>{" ✓"}</tspan>}
                {labelWidth > 180 && <tspan fill="#8c8c8c" fontSize={laneHeight < 16 ? 9.5 : 10.5}>{`  ${meta} · ${d3.format(".2s")(w.span)}b`}</tspan>}
              </text>
              {/* nodes */}
              {extents.map(([a, b, d], k) => (
                <g key={k} clipPath={`url(#walks-clip-${k})`}>
                  {w.nodes.map((n, ni) => {
                    const g0 = toGlobal(chromoBins, n.chromosome, n.start);
                    const g1 = toGlobal(chromoBins, n.chromosome, n.end);
                    if (!(g1 >= d[0] && g0 <= d[1])) return null;
                    const xs = x0 + a + ((g0 - d[0]) / (d[1] - d[0])) * (b - a);
                    const xe = x0 + a + ((g1 - d[0]) / (d[1] - d[0])) * (b - a);
                    const fill = colorBy === "chromosome" ? chrColor(n.chromosome) : color;
                    return (
                      <polygon
                        key={ni}
                        transform={`translate(${xs},${cy - BAR / 2})`}
                        points={intervalPoints(Math.max(1, xe - xs), BAR, n.strand).join(",")}
                        fill={fill}
                        stroke={d3.rgb(fill).darker(0.8).toString()}
                        strokeWidth={0.8}
                        onMouseEnter={(e) => showTip(e, w, [`${w.label} · node ${ni + 1}/${w.nodes.length}`, `${n.chromosome}:${n.start.toLocaleString()}-${n.end.toLocaleString()} (${n.strand})`, `${d3.format(",")(n.end - n.start + 1)} bp`, meta])}
                      />
                    );
                  })}
                </g>
              ))}
              {/* junctions */}
              {w.junctions.map((j, ji) => {
                const A = w.nodes[j.from];
                const B = w.nodes[j.to];
                if (!A || !B) return null;
                const ga = nodeEnd(A, "end");
                const gb = nodeEnd(B, "start");
                const ka = panelOf(ga);
                const kb = panelOf(gb);
                if (j.type === "REF") {
                  // adjacent in the reference: nothing to draw unless the walk skips a gap
                  if (ka < 0 || kb < 0 || Math.abs(gb - ga) < 2) return null;
                  const xa = px(ga, ka);
                  const xb = px(gb, kb);
                  return Math.abs(xb - xa) > 2 ? <line key={ji} x1={xa} x2={xb} y1={cy} y2={cy} stroke="#8c8c8c" strokeDasharray="2 2" /> : null;
                }
                const tip = `ALT junction: ${A.chromosome}:${(A.strand === "-" ? A.start : A.end).toLocaleString()}${A.strand} → ${B.chromosome}:${(B.strand === "-" ? B.end : B.start).toLocaleString()}${B.strand}${j.via ? ` (via ${j.via})` : ""}`;
                if (ka >= 0 && kb >= 0) {
                  const xa = px(ga, ka);
                  const xb = px(gb, kb);
                  // keep the arc inside its own lane: long junctions get flatter, not taller
                  const lift = Math.min(laneHeight * 0.4, 4 + Math.abs(xb - xa) / 12);
                  const top = cy - BAR / 2;
                  return (
                    <path key={ji} d={`M${xa},${top} C${xa},${top - lift} ${xb},${top - lift} ${xb},${top}`} fill="none" stroke="#cf1322" strokeWidth={1.8} strokeOpacity={0.9} onMouseEnter={(e) => showTip(e, w, [tip, w.label])}>
                      <title>{tip}</title>
                    </path>
                  );
                }
                // one end visible: anchor stub pointing to the hidden partner (click opens it)
                const visible = ka >= 0 ? { g: ga, k: ka, other: B, otherPos: B.strand === "-" ? B.end : B.start } : kb >= 0 ? { g: gb, k: kb, other: A, otherPos: A.strand === "-" ? A.start : A.end } : null;
                if (!visible) return null;
                const xv = px(visible.g, visible.k);
                return (
                  <g key={ji} onClick={(e) => { e.stopPropagation(); addAnchorDomain(visible.other.chromosome, visible.otherPos); }}>
                    <line x1={xv} x2={xv} y1={cy - BAR / 2} y2={cy - BAR / 2 - stub} stroke="#cf1322" strokeWidth={1.4} />
                    <circle cx={xv} cy={cy - BAR / 2 - stub - 2} r={laneHeight < 22 ? 2.5 : 3.5} fill={chrColor(visible.other.chromosome)} stroke="#cf1322" />
                    <title>{`${tip}\n${t("components.single-cell.ecdna.plot-anchor")}`}</title>
                  </g>
                );
              })}
            </g>
          );
        })}
        {/* family brackets on the left edge */}
        {families.length > 1 &&
          families.map((fam, f) => {
            const rows = lanes.rows.filter((r) => r.family === f);
            if (rows.length < 2) return null;
            const y0 = rows[0].y + 4;
            const y1 = rows[rows.length - 1].y + laneHeight - 4;
            return <line key={`fam${f}`} x1={2} x2={2} y1={y0} y2={y1} stroke="#bfbfbf" strokeWidth={2} />;
          })}
        {/* axis */}
        {ticks.map(({ k, vals, scale, chr }) => (
          <g key={`ax${k}`}>
            <line x1={scale.range()[0]} x2={scale.range()[1]} y1={lanes.height + 2} y2={lanes.height + 2} stroke="#8c8c8c" />
            {vals.map((v) => (
              <g key={v}>
                <line x1={scale(v)} x2={scale(v)} y1={lanes.height + 2} y2={lanes.height + 6} stroke="#8c8c8c" />
                <text x={scale(v)} y={lanes.height + 14} textAnchor="middle" fontSize={9.5} fill="#595959">{fmtPos(v, chr)}</text>
              </g>
            ))}

          </g>
        ))}
      </svg>
      {hover && (
        <div className="sc-tooltip" style={{ position: "absolute", left: Math.min(hover.x, width - 280), top: hover.y, pointerEvents: "none", zIndex: 5 }}>
          {hover.lines.map((l, i) => (
            <div key={i} style={{ fontWeight: i === 0 ? 600 : 400 }}>{l}</div>
          ))}
        </div>
      )}
      {!walks.length && <Text type="secondary">{t("components.single-cell.ecdna.none-selected")}</Text>}
    </div>
  );
}
