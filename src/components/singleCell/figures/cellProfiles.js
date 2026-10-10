import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Space, Typography } from "antd";
import FigureCanvas from "./figureCanvas";
import { textRole } from "./figureKit";
import useContainerWidth from "../useContainerWidth";
import singleCellActions from "../../../redux/singleCell/actions";
import { loadCellTrack } from "../../../redux/singleCell/loaders";
import { isNormalClone } from "../../../helpers/singleCell/figures";
import { niceTicks } from "../../../helpers/singleCell/figureMath";

const { Text } = Typography;
const H = 140;
const PAD = { left: 40, right: 10, top: 34, bottom: 16 };

/** Breakpoint (global) of a signed gGnome JSON connection end: + = interval end, - = start (source); the reverse for sink. */
function breakend(intervals, signed, isSource, chromoBins) {
  const iv = intervals.get(Math.abs(signed));
  if (!iv) return null;
  const bin = chromoBins?.[`${iv.chromosome}`.replace(/^chr/, "")];
  if (!bin) return null;
  const atEnd = isSource ? signed > 0 : signed < 0;
  return bin.startPlace + (atEnd ? iv.endPoint : iv.startPoint);
}

/**
 * Fig 4E, live: copy-number profiles of a few cells across the figure's
 * region: read-depth dots (coverage), the cell's JaBbA segments and its ALT
 * junctions as arcs. Shows the selected cells (up to 3), else a high and a
 * median carrier of the focused variant and a tumour non-carrier.
 */
export default function CellProfiles({ order = [], focusWalk, domains = [], cellById }) {
  const dispatch = useDispatch();
  const dataset = useSelector((s) => s.Settings.dataset);
  const chromoBins = useSelector((s) => s.Settings.chromoBins);
  const selectedIds = useSelector((s) => s.SingleCell.selectedCellIds);
  const [ref, measured] = useContainerWidth(900);
  const width = Math.max(420, measured);

  const cells = useMemo(() => {
    if (selectedIds?.length && selectedIds.length <= 6) return selectedIds.slice(0, 3).map((id) => ({ id, why: "selected" }));
    if (!focusWalk) return [];
    const cn = (id) => Number(focusWalk.cells?.[id]) || 0;
    const carriers = order.filter((id) => cn(id) >= 1).sort((a, b) => cn(b) - cn(a));
    const non = order.filter((id) => cn(id) < 1 && !isNormalClone(cellById?.get(id)?.clone_id));
    const out = [];
    if (carriers.length) out.push({ id: carriers[0], why: `highest ${focusWalk.label || "variant"} copies` });
    if (carriers.length > 2) out.push({ id: carriers[Math.floor(carriers.length / 2)], why: "median carrier" });
    if (non.length) out.push({ id: non[0], why: `no ${focusWalk.label || "variant"}` });
    return out;
  }, [selectedIds, focusWalk, order, cellById]);

  const [tracks, setTracks] = useState({});
  useEffect(() => {
    let alive = true;
    if (!dataset) return undefined;
    cells.forEach(({ id }) => {
      if (tracks[id]) return;
      Promise.all([loadCellTrack(dataset, id, "total", chromoBins), loadCellTrack(dataset, id, "coverage", chromoBins)]).then(([g, cov]) => {
        if (alive) setTracks((t) => ({ ...t, [id]: { g, cov } }));
      });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells.map((c) => c.id).join("|"), dataset, chromoBins]);

  const x0 = PAD.left;
  const x1 = width - PAD.right;
  const gap = 8;
  const ext = useMemo(() => {
    const share = (x1 - x0 - gap * Math.max(0, domains.length - 1)) / Math.max(1, domains.length);
    return domains.map((d, k) => [x0 + k * (share + gap), x0 + k * (share + gap) + share, d]);
  }, [domains, x0, x1]);
  const gx = useCallback((g) => {
    const e = ext.find(([, , d]) => g >= d[0] && g <= d[1]);
    return e ? e[0] + ((g - e[2][0]) / (e[2][1] - e[2][0])) * (e[1] - e[0]) : null;
  }, [ext]);

  const profiles = useMemo(
    () =>
      cells.map(({ id, why }) => {
        const t = tracks[id];
        const raw = t?.g?.status === "ok" ? t.g.data : null;
        const intervals = new Map((raw?.intervals || []).map((iv) => [iv.iid, iv]));
        const segs = [];
        intervals.forEach((iv) => {
          const bin = chromoBins?.[`${iv.chromosome}`.replace(/^chr/, "")];
          if (!bin) return;
          const a = bin.startPlace + iv.startPoint;
          const b = bin.startPlace + iv.endPoint;
          if (domains.some(([d0, d1]) => b >= d0 && a <= d1)) segs.push({ a, b, y: Number(iv.y) });
        });
        const alts = (raw?.connections || [])
          .filter((c) => c.type === "ALT")
          .map((c) => ({ c, s: breakend(intervals, c.source, true, chromoBins), e: breakend(intervals, c.sink, false, chromoBins) }))
          .filter(({ s, e }) => (s != null && gx(s) != null) || (e != null && gx(e) != null));
        const cov = t?.cov?.status === "ok" ? t.cov.data : null;
        const pts = [];
        if (cov) {
          const xs = cov.dataPointsX;
          const ys = cov.dataPointsY1;
          for (let k = 0; k < xs.length; k += 1) if (gx(xs[k]) != null && Number.isFinite(ys[k])) pts.push([xs[k], ys[k]]);
        }
        const ymax = Math.max(4, ...segs.map((s) => s.y).filter(Number.isFinite)) * 1.15;
        return { id, why, segs, alts, pts, ymax, loading: !t };
      }),
    [cells, tracks, chromoBins, domains, gx]
  );
  const height = profiles.length * H + 4;

  const draw = useCallback(
    (ctx, c) => {
      const hits = [];
      profiles.forEach((p, k) => {
        const top = k * H;
        const y0 = top + PAD.top;
        const y1 = top + H - PAD.bottom;
        const sy = (v) => y1 - (Math.min(v, p.ymax) / p.ymax) * (y1 - y0);
        // title
        const cell = cellById?.get(p.id) || {};
        textRole(ctx, c, "label", "text");
        ctx.textAlign = "left";
        ctx.font = ctx.font.replace(/^(\d+ )?/, "600 ");
        ctx.fillText(p.id, x0, top + 9);
        const tw = ctx.measureText(p.id).width;
        textRole(ctx, c, "caption");
        ctx.textAlign = "left";
        ctx.fillText(`${cell.clone_id ?? ""} · ${cell.state ?? ""} · ${p.why}${p.loading ? " · loading…" : ""}`, x0 + tw + 8, top + 9);
        hits.push({ x0: x0, x1: x0 + tw, y0: top, y1: top + 16, kind: "title", p });
        // axis + grid
        textRole(ctx, c, "tick");
        ctx.textAlign = "right";
        niceTicks(0, p.ymax, 3).forEach((v) => {
          ctx.fillStyle = c.grid;
          ctx.fillRect(x0, Math.round(sy(v)), x1 - x0, 1);
          textRole(ctx, c, "tick");
          ctx.textAlign = "right";
          ctx.fillText(`${v}`, x0 - 4, sy(v));
        });
        ext.forEach(([a, b]) => {
          ctx.strokeStyle = c.grid;
          ctx.strokeRect(a + 0.5, y0 + 0.5, b - a - 1, y1 - y0 - 1);
        });
        // coverage dots
        ctx.fillStyle = c.dark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.32)";
        p.pts.forEach(([g, v]) => {
          const x = gx(g);
          if (x != null) ctx.fillRect(x - 0.7, sy(Math.max(0, v)) - 0.7, 1.4, 1.4);
        });
        // segments
        ctx.strokeStyle = c.text;
        ctx.lineWidth = 2.4;
        p.segs.forEach(({ a, b, y }) => {
          const xa = gx(Math.max(a, ext[0]?.[2][0] ?? a)) ?? gx(a);
          const xb = gx(Math.min(b, ext[ext.length - 1]?.[2][1] ?? b)) ?? gx(b);
          if (xa == null || xb == null) return;
          ctx.beginPath();
          ctx.moveTo(xa, sy(y));
          ctx.lineTo(xb, sy(y));
          ctx.stroke();
          hits.push({ x0: xa, x1: xb, y0: sy(y) - 4, y1: sy(y) + 4, kind: "seg", p, y, a, b });
        });
        ctx.lineWidth = 1;
        // junction arcs
        p.alts.forEach(({ c: con, s, e }) => {
          const xs = s != null ? gx(s) : null;
          const xe = e != null ? gx(e) : null;
          ctx.strokeStyle = "#d32f2f";
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          if (xs != null && xe != null) {
            // arc above the plot, height growing with the span (kept under the title)
            const lift = Math.min(PAD.top - 14, 6 + Math.abs(xe - xs) * 0.08);
            ctx.moveTo(xs, y0 + 2);
            ctx.quadraticCurveTo((xs + xe) / 2, y0 - 2 * lift, xe, y0 + 2);
          } else {
            const x = xs ?? xe;
            ctx.moveTo(x, y0 + 2);
            ctx.lineTo(x + (xs != null ? 6 : -6), y0 - 6);
          }
          ctx.stroke();
          ctx.lineWidth = 1;
          const x = xs ?? xe;
          hits.push({ x0: Math.min(x, xe ?? x) - 3, x1: Math.max(x, xe ?? x) + 3, y0: y0 - 12, y1: y0 + 6, kind: "alt", p, con, s, e });
        });
      });
      return hits;
    },
    [profiles, ext, gx, x0, x1, cellById]
  );
  if (!cells.length) return <Text type="secondary">Select 1–3 cells (or focus an ecDNA variant) to show their copy-number profiles.</Text>;
  const mb = (g) => {
    const chr = Object.keys(chromoBins || {}).find((k) => chromoBins[k].startPlace <= g && chromoBins[k].endPlace >= g);
    return chr ? `chr${chr}:${((g - chromoBins[chr].startPlace) / 1e6).toFixed(2)} Mb` : "–";
  };
  return (
    <div ref={ref}>
      <FigureCanvas
        width={width}
        height={height}
        draw={draw}
        ariaLabel="Copy-number profiles with junctions of representative cells"
        tooltip={(h) => {
          if (h.kind === "seg") return [h.p.id, ["Segment CN", h.y.toFixed(1)], ["From", mb(h.a)], ["To", mb(h.b)]];
          if (h.kind === "alt") return [`${h.con.title || "ALT"} junction`, ["Copies", `${h.con.weight ?? "–"}`], ["Breakends", `${h.s != null ? mb(h.s) : "–"} → ${h.e != null ? mb(h.e) : "–"}`]];
          if (h.kind === "title") return [h.p.id, ["Click", "select this cell"]];
          return null;
        }}
        onClick={(h) => h.kind === "title" && dispatch(singleCellActions.updateSelection([h.p.id]))}
      />
      <Space size={12} className="sc-fig-keys">
        <span className="sc-fig-key"><span className="sc-fig-swatch" style={{ background: "#262626", height: 3 }} />JaBbA segment CN</span>
        <span className="sc-fig-key"><span className="sc-fig-swatch" style={{ background: "rgba(0,0,0,0.35)", width: 4, height: 4 }} />read depth (CN units)</span>
        <span className="sc-fig-key"><span className="sc-fig-swatch" style={{ background: "#d32f2f", height: 2 }} />ALT junction</span>
      </Space>
    </div>
  );
}
