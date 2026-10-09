import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Empty } from "antd";
import settingsActions from "../../../redux/settings/actions";
import { domainExtents } from "../../../helpers/singleCell/matrix";
import { toGlobal } from "../../../helpers/singleCell/walks";
import { fmtSpan, laneEmphasis, panDomain, shortLabel, wheelDx, wheelIntent, wheelZoomFactor, zoomDomain } from "../../../helpers/singleCell/walkPlotState";
import useContainerWidth from "../useContainerWidth";
import { INK, TYPE } from "../../../helpers/singleCell/plotTheme";

const GAP_X = 50; // same outer margin / inter-domain gap as the heatmap and the genes plot
const BAR_MAX = 12;
const FAMILY_GAP = 7; // between walk families (with a hairline divider)
const ARROW = 5;
const AXIS_H = 18;
const HEAD_H = 18; // chromosome / range header above each panel (and the label column header)
// the heatmap draws its genomic columns 10 px further right than its reported inset
const HEATMAP_OFFSET = 10;
// label column: name, then right-aligned carriers / median copies / size
const META_COLS = [
  { key: "cells", w: 40 },
  { key: "copies", w: 52 },
  { key: "size", w: 48 },
];
const META_W = META_COLS.reduce((s, c) => s + c.w, 0);
const CHAR_W = 6.4; // average glyph width of a 12 px label, for truncation
const TIP_W = 300;

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
 * region as an extra panel).
 *
 * Interaction: hovering a lane marks it (band + tooltip) without moving
 * the highlight; clicking a lane focuses (highlights) it and fades the
 * others until it is clicked again; double-click zooms to it. Plain wheel
 * scrolls the page; Ctrl / Cmd + wheel (or a pinch) zooms the panel under
 * the pointer; Shift + wheel, a horizontal swipe or a drag pans it.
 *
 * `labelWidth` is the room left of the genome axis (the heatmap's tree +
 * strips) where the lane labels go; the plot area itself starts at
 * labelWidth + GAP_X like the heatmap's genomic columns. `hover` is the
 * walk hovered elsewhere (the walk chips above), marked like a hovered lane.
 */
export default function WalksPlot({ walks, families, colorOf, focus, onFocus, hover: hoverProp = null, labelWidth, rightWidth = 0, laneHeight = 18, colorBy = "walk" }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const [ref, width] = useContainerWidth(1200);
  const { domains, chromoBins, defaultDomain } = useSelector((s) => s.Settings);
  const [tip, setTip] = useState(null); // { walkId, lines } — the lane under the pointer
  const [dragging, setDragging] = useState(false);
  const svgRef = useRef(null);
  const tipRef = useRef(null);
  const BAR = Math.max(6, Math.min(BAR_MAX, Math.round(laneHeight * 0.45)));
  // anchor stub length: stays inside the lane
  const stub = Math.max(3, Math.min(8, laneHeight / 2 - BAR / 2 - 4));

  const stageW = Math.max(200, width - labelWidth - rightWidth - 2 * GAP_X);
  const x0 = labelWidth + GAP_X + HEATMAP_OFFSET;
  const labelRight = x0 - 10; // right edge of the label column
  const showMeta = labelRight > META_W + 120;
  const nameChars = Math.max(8, Math.floor((labelRight - (showMeta ? META_W : 0) - 26) / CHAR_W));
  const extents = useMemo(() => domainExtents(domains, stageW, GAP_X), [domains, stageW]);
  const panelOf = (g) => extents.findIndex(([, , d]) => g >= d[0] && g <= d[1]);
  const px = (g, k = panelOf(g)) => {
    if (k < 0) return NaN;
    const [a, b, d] = extents[k];
    return x0 + a + ((g - d[0]) / Math.max(1, d[1] - d[0])) * (b - a);
  };
  // lanes: families in order, separated by a small gap and a divider
  const lanes = useMemo(() => {
    const out = [];
    const dividers = [];
    let y = HEAD_H + 2;
    families.forEach((fam, f) => {
      if (f > 0) {
        dividers.push(y + FAMILY_GAP / 2);
        y += FAMILY_GAP;
      }
      fam.forEach((w) => {
        out.push({ walk: w, y, family: f });
        y += laneHeight;
      });
    });
    return { rows: out, dividers, height: y + 2 };
  }, [families, laneHeight]);
  const height = lanes.height + AXIS_H;
  const chrColor = (chr) => chromoBins?.[`${chr}`]?.color || INK.faint;

  // ---- zoom / pan on the shared domains (batched to one store update per frame) ----
  const genomeEnd = defaultDomain?.[1] || Infinity;
  const pending = useRef(null);
  const frame = useRef(0);
  const setDomain = (k, d) => {
    const base = pending.current || domains;
    const target = extents[k]?.[2];
    // extents skip empty domains: find this panel's slot in the domains list
    const slot = target ? base.findIndex((x) => x === target || (x[0] === target[0] && x[1] === target[1])) : -1;
    const idx = slot >= 0 ? slot : k;
    pending.current = base.map((x, i) => (i === idx ? d : x));
    if (!frame.current) {
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        if (pending.current) dispatch(settingsActions.updateDomains(pending.current));
        pending.current = null;
      });
    }
  };
  useEffect(() => () => frame.current && cancelAnimationFrame(frame.current), []);

  const local = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const panelAtX = (x) => extents.findIndex(([a, b]) => x >= x0 + a && x <= x0 + b);

  // React registers wheel listeners as passive, so preventDefault() there is
  // ignored and Ctrl/Cmd + wheel (or a trackpad pinch) zoomed the whole page
  // along with the plot. A native non-passive listener, reading the latest
  // render through a ref, captures only the gestures the plot handles.
  const hasWalks = walks.length > 0;
  const live = useRef(null);
  live.current = { extents, x0, genomeEnd, setDomain, panelAtX };
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      const intent = wheelIntent(e);
      if (intent === "scroll") return;
      const L = live.current;
      const r = el.getBoundingClientRect();
      const k = L.panelAtX(e.clientX - r.left);
      if (k < 0) return;
      e.preventDefault();
      const [a, b, d] = L.extents[k];
      if (intent === "zoom") {
        const anchor = d[0] + ((e.clientX - r.left - L.x0 - a) / Math.max(1, b - a)) * (d[1] - d[0]);
        L.setDomain(k, zoomDomain(d, anchor, wheelZoomFactor(e), { hi: L.genomeEnd }));
      } else {
        const shift = (wheelDx(e) / Math.max(1, b - a)) * (d[1] - d[0]);
        L.setDomain(k, panDomain(d, shift, { hi: L.genomeEnd }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [hasWalks]); // the svg mounts only once there are walks to draw

  // drag to pan: follow the pointer on the window so a drag that leaves the plot keeps going and always ends
  const dragMoved = useRef(false);
  const onDown = (e) => {
    if (e.button !== 0) return;
    const [mx] = local(e);
    const k = panelAtX(mx);
    dragMoved.current = false;
    if (k < 0) return;
    const start = { k, x: mx, d: extents[k][2], span: extents[k][1] - extents[k][0] };
    const move = (ev) => {
      const [x] = local(ev);
      const dx = x - start.x;
      if (!dragMoved.current && Math.abs(dx) < 3) return;
      if (!dragMoved.current) {
        dragMoved.current = true;
        setDragging(true);
        setTip(null);
      }
      setDomain(start.k, panDomain(start.d, (-dx / Math.max(1, start.span)) * (start.d[1] - start.d[0]), { hi: genomeEnd }));
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setDragging(false);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
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

  // ---- hover: one lane at a time, cleared when the pointer leaves it or the page scrolls ----
  // the tooltip follows the pointer by moving its element directly (no re-render of every lane per mousemove)
  const placeTip = (e) => {
    const el = tipRef.current;
    if (!el || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const tw = el.offsetWidth || TIP_W;
    el.style.left = `${x + tw + 24 > r.width ? Math.max(0, x - tw - 12) : x + 16}px`;
    el.style.top = `${y + 16}px`;
  };
  const lastEvent = useRef(null);
  const enterLane = (e, w, lines) => {
    if (dragging) return;
    lastEvent.current = { clientX: e.clientX, clientY: e.clientY };
    setTip((p) => (p && p.walkId === w.id && p.lines === lines ? p : { walkId: w.id, lines }));
  };
  const leaveLane = () => setTip(null);
  useLayoutEffect(() => {
    if (tip && lastEvent.current) placeTip(lastEvent.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tip]);
  const tipOn = !!tip;
  useEffect(() => {
    if (!tipOn) return undefined;
    // the page moving under a still pointer would otherwise leave a stale lane highlighted
    const clear = () => setTip(null);
    window.addEventListener("scroll", clear, { capture: true, passive: true });
    return () => window.removeEventListener("scroll", clear, { capture: true });
  }, [tipOn]);
  const hoverId = tip?.walkId ?? hoverProp;

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
  // right edges of the meta columns
  const metaX = META_COLS.map((_, i) => labelRight - META_COLS.slice(i + 1).reduce((s, c) => s + c.w, 0));
  const fs = laneHeight < 16 ? 11 : TYPE.label - 0.5;
  const fsMeta = laneHeight < 16 ? 10 : TYPE.tick - 0.5;
  const headStyle = { textTransform: "uppercase", letterSpacing: 0.4 };

  if (!walks.length) {
    return (
      <div ref={ref} style={{ padding: "18px 0" }}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.ecdna.none-selected")} />
      </div>
    );
  }
  return (
    <div ref={ref} className="sc-walks-plot" style={{ position: "relative", width: "100%" }} onMouseMove={(e) => tip && placeTip(e)}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{ display: "block", userSelect: "none", cursor: dragging ? "grabbing" : "default" }}
        onMouseDown={onDown}
        onMouseLeave={leaveLane}
      >
        <defs>
          {extents.map(([a, b], k) => (
            <clipPath key={k} id={`walks-clip-${k}`}>
              <rect x={x0 + a} y={0} width={b - a} height={height} />
            </clipPath>
          ))}
        </defs>
        {/* label column header */}
        <text x={22} y={HEAD_H / 2} dy="0.35em" fontSize={TYPE.micro} fill={INK.muted} style={headStyle}>{t("components.single-cell.ecdna.col-walk")}</text>
        {showMeta &&
          META_COLS.map((c, i) => (
            <text key={c.key} x={metaX[i]} y={HEAD_H / 2} dy="0.35em" textAnchor="end" fontSize={TYPE.micro} fill={INK.muted} style={headStyle}>
              {t(`components.single-cell.ecdna.lane-${c.key}`)}
            </text>
          ))}
        {/* panel headers: chromosome and visible range */}
        {ticks.map(({ k, scale, chr }) => {
          const [ga, gb] = scale.domain();
          const [xa, xb] = scale.range();
          return (
            <g key={`h${k}`}>
              <rect x={xa} y={0} width={xb - xa} height={HEAD_H} fill={chr?.color || INK.empty} fillOpacity={0.14} />
              <rect x={xa} y={HEAD_H - 2} width={xb - xa} height={2} fill={chr?.color || INK.faint} fillOpacity={0.8} />
              <text x={(xa + xb) / 2} y={HEAD_H / 2 - 1} dy="0.35em" textAnchor="middle" fontSize={TYPE.tick} fill={INK.text}>
                <tspan fontWeight={700}>{chr ? `chr${chr.chromosome}` : ""}</tspan>
                {chr && xb - xa > 150 ? <tspan fill={INK.textSecondary}>{`  ${fmtPos(ga, chr)} – ${fmtPos(gb, chr)}`}</tspan> : null}
              </text>
            </g>
          );
        })}
        {/* panel frames + grid */}
        {extents.map(([a, b], k) => (
          <rect key={`f${k}`} x={x0 + a} y={HEAD_H} width={b - a} height={lanes.height - HEAD_H} fill="none" stroke={INK.border} />
        ))}
        {ticks.map(({ k, vals, scale }) => vals.map((v) => <line key={`g${k}-${v}`} x1={scale(v)} x2={scale(v)} y1={HEAD_H} y2={lanes.height} stroke={INK.grid} />))}
        {/* family dividers */}
        {lanes.dividers.map((y) => (
          <line key={`div${y}`} x1={4} x2={width - 4} y1={y} y2={y} stroke={INK.border} strokeDasharray="3 3" />
        ))}
        {lanes.rows.map(({ walk: w, y }, i) => {
          const cy = y + laneHeight / 2;
          const color = colorOf(w.id);
          const { opacity, focused, hovered } = laneEmphasis(w.id, { hover: hoverId, focus });
          const ncells = w.stats?.ncells ?? w.ncells ?? 0;
          const median = w.stats?.medianCn ?? w.median_cn ?? 0;
          const meta = `${ncells} cells · median ${median.toFixed(0)} copies`;
          const laneLines = [
            w.label,
            `${w.circular ? "circular" : "linear"} · ${fmtSpan(w.span)} · ${w.nodes.length} segments${w.n_nodes_raw > w.nodes.length ? ` (${w.n_nodes_raw} graph nodes)` : ""} · ${w.junctions.filter((j) => j.type === "ALT").length} ALT junctions`,
            meta,
            w.genes.length ? `genes: ${w.genes.slice(0, 8).join(", ")}${w.genes.length > 8 ? ` +${w.genes.length - 8}` : ""}` : null,
            w.curated ? "curated (pipeline cn_filter)" : null,
            focused ? t("components.single-cell.ecdna.plot-click-off") : t("components.single-cell.ecdna.plot-click"),
          ].filter(Boolean);
          const nodeEnd = (n, side) => toGlobal(chromoBins, n.chromosome, side === "end" ? (n.strand === "-" ? n.start : n.end) : n.strand === "-" ? n.end : n.start);
          const backToLane = (e) => enterLane(e, w, laneLines);
          return (
            <g
              key={w.id}
              data-walk-lane={w.id}
              data-focused={focused ? "1" : undefined}
              data-hovered={hovered ? "1" : undefined}
              style={{ cursor: "pointer" }}
              onMouseEnter={backToLane}
              onMouseLeave={leaveLane}
              onClick={() => !dragMoved.current && onFocus && onFocus(w.id)}
              onDoubleClick={() => zoomToWalk(w)}
            >
              {/* lane band: focus = walk tint + accent bar, hover = neutral band, else zebra */}
              <rect
                x={0}
                y={y}
                width={width}
                height={laneHeight}
                style={{ fill: focused ? color : hovered ? "var(--sc-hover-fill, rgba(250,84,28,0.08))" : i % 2 ? "var(--sc-panel-alt, #fafafa)" : "transparent", fillOpacity: focused ? 0.14 : 1 }}
              />
              {focused && <rect x={0} y={y} width={3} height={laneHeight} fill={color} />}
              <g opacity={opacity}>
                {/* label: name and curated tick, then carriers / median copies / size in aligned columns */}
                <circle cx={12} cy={cy} r={Math.min(4.5, laneHeight / 3.5)} fill={color} />
                <text x={22} y={cy} dy="0.35em" fontSize={fs} fill={INK.text} fontWeight={focused ? 700 : hovered ? 650 : 500}>
                  {shortLabel(w.label, nameChars - (w.curated ? 2 : 0))}
                  {w.curated && <tspan fill={INK.ok} fontWeight={700}>{" ✓"}</tspan>}
                </text>
                {showMeta && (
                  <g fontSize={fsMeta} fill={INK.muted} style={{ fontVariantNumeric: "tabular-nums" }}>
                    <text x={metaX[0]} y={cy} dy="0.35em" textAnchor="end">{ncells}</text>
                    <text x={metaX[1]} y={cy} dy="0.35em" textAnchor="end">{`${median.toFixed(0)}×`}</text>
                    <text x={metaX[2]} y={cy} dy="0.35em" textAnchor="end">{fmtSpan(w.span)}</text>
                  </g>
                )}
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
                      const nodeLines = [`${w.label} · segment ${ni + 1}/${w.nodes.length}`, `${n.chromosome}:${n.start.toLocaleString()}-${n.end.toLocaleString()} (${n.strand})`, `${d3.format(",")(n.end - n.start + 1)} bp`, meta];
                      return (
                        <polygon
                          key={ni}
                          transform={`translate(${xs},${cy - BAR / 2})`}
                          points={intervalPoints(Math.max(1, xe - xs), BAR, n.strand).join(",")}
                          fill={fill}
                          stroke={d3.rgb(fill).darker(focused ? 1.4 : 0.8).toString()}
                          strokeWidth={focused ? 1.3 : 0.8}
                          onMouseEnter={(e) => enterLane(e, w, nodeLines)}
                          onMouseLeave={backToLane}
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
                    return Math.abs(xb - xa) > 2 ? <line key={ji} x1={xa} x2={xb} y1={cy} y2={cy} stroke={INK.axis} strokeDasharray="2 2" /> : null;
                  }
                  const tipText = `ALT junction: ${A.chromosome}:${(A.strand === "-" ? A.start : A.end).toLocaleString()}${A.strand} → ${B.chromosome}:${(B.strand === "-" ? B.end : B.start).toLocaleString()}${B.strand}${j.via ? ` (via ${j.via})` : ""}`;
                  if (ka >= 0 && kb >= 0) {
                    const xa = px(ga, ka);
                    const xb = px(gb, kb);
                    // keep the arc inside its own lane: long junctions get flatter, not taller
                    const lift = Math.min(laneHeight * 0.4, 4 + Math.abs(xb - xa) / 12);
                    const top = cy - BAR / 2;
                    return (
                      <path
                        key={ji}
                        d={`M${xa},${top} C${xa},${top - lift} ${xb},${top - lift} ${xb},${top}`}
                        fill="none"
                        stroke={INK.danger}
                        strokeWidth={focused ? 2.2 : 1.6}
                        strokeOpacity={0.9}
                        onMouseEnter={(e) => enterLane(e, w, [tipText, w.label])}
                        onMouseLeave={backToLane}
                      />
                    );
                  }
                  // one end visible: anchor stub pointing to the hidden partner (click opens it)
                  const visible = ka >= 0 ? { g: ga, k: ka, other: B, otherPos: B.strand === "-" ? B.end : B.start } : kb >= 0 ? { g: gb, k: kb, other: A, otherPos: A.strand === "-" ? A.start : A.end } : null;
                  if (!visible) return null;
                  const xv = px(visible.g, visible.k);
                  return (
                    <g
                      key={ji}
                      onClick={(e) => {
                        e.stopPropagation();
                        addAnchorDomain(visible.other.chromosome, visible.otherPos);
                      }}
                      onMouseEnter={(e) => enterLane(e, w, [tipText, t("components.single-cell.ecdna.plot-anchor")])}
                      onMouseLeave={backToLane}
                    >
                      <line x1={xv} x2={xv} y1={cy - BAR / 2} y2={cy - BAR / 2 - stub} stroke={INK.danger} strokeWidth={1.4} />
                      <circle cx={xv} cy={cy - BAR / 2 - stub - 2} r={laneHeight < 22 ? 2.5 : 3.5} fill={chrColor(visible.other.chromosome)} stroke={INK.danger} />
                    </g>
                  );
                })}
              </g>
            </g>
          );
        })}
        {/* axis */}
        {ticks.map(({ k, vals, scale, chr }) => (
          <g key={`ax${k}`}>
            <line x1={scale.range()[0]} x2={scale.range()[1]} y1={lanes.height + 2} y2={lanes.height + 2} stroke={INK.axis} />
            {vals.map((v) => (
              <g key={v}>
                <line x1={scale(v)} x2={scale(v)} y1={lanes.height + 2} y2={lanes.height + 6} stroke={INK.axis} />
                <text x={scale(v)} y={lanes.height + 15} textAnchor="middle" fontSize={TYPE.tick - 0.5} fill={INK.textSecondary}>{fmtPos(v, chr)}</text>
              </g>
            ))}
          </g>
        ))}
      </svg>
      {tip && !dragging && (
        <div ref={tipRef} className="sc-tooltip" style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", zIndex: 5, whiteSpace: "nowrap" }}>
          {tip.lines.map((l, i) => (
            <div key={i} style={{ fontWeight: i === 0 ? 600 : 400 }}>{l}</div>
          ))}
        </div>
      )}
    </div>
  );
}
