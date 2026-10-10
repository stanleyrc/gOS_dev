import React, { useCallback, useMemo } from "react";
import { useSelector } from "react-redux";
import FigureCanvas from "./figureCanvas";
import { textRole } from "./figureKit";
import useContainerWidth from "../useContainerWidth";
import { binAt } from "../../../helpers/singleCell/matrix";
import { columnCorrelations } from "../../../helpers/singleCell/figures";

const K = 96; // positions across the windows
const MIN_GROUP = 8; // fewer cells than this: no correlation drawn

/**
 * Fig 5C, live: correlation of log copy number between positions across the
 * figure's windows, as a triangle (pairs at 45°): the carriers / selected
 * cells above the axis, the other tumour cells mirrored below, the walk's
 * segments and genes along the axis. Red off-diagonal blocks = segments that
 * rise and fall together, i.e. carried on the same molecule.
 */
export default function TriangleCorrelation({ order = [], cnById, domains = [], groupA = [], groupB = [], labelA = "carriers", labelB = "others", walk, colorOf, genes = [] }) {
  const [ref, measured] = useContainerWidth(700);
  const width = Math.max(360, measured);
  const chromoBins = useSelector((s) => s.Settings.chromoBins);
  const positions = useMemo(() => {
    const total = domains.reduce((s, [a, b]) => s + (b - a), 0);
    const out = [];
    domains.forEach(([a, b], k) => {
      const n = Math.max(2, Math.round((K * (b - a)) / Math.max(1, total)));
      for (let i = 0; i < n; i += 1) out.push({ g: a + ((i + 0.5) / n) * (b - a), d: k });
    });
    return out;
  }, [domains]);
  const corr = useCallback(
    (ids) => {
      const rows = ids.map((id) => cnById.get(id)).filter(Boolean);
      const k = positions.length;
      const M = new Float32Array(rows.length * k);
      rows.forEach((row, i) => {
        let sum = 0;
        positions.forEach(({ g }, j) => {
          const b = binAt(row.binIndex, g);
          M[i * k + j] = b >= 0 ? Math.log1p(Math.max(0, row.values[b])) : 0;
          sum += M[i * k + j];
        });
        // centre each cell on its own mean: removes cell-wide scaling (ploidy, depth), so only segments that move together stay correlated
        const mean = sum / Math.max(1, k);
        for (let j = 0; j < k; j += 1) M[i * k + j] -= mean;
      });
      return { C: columnCorrelations(M, rows.length, k), n: rows.length };
    },
    [cnById, positions]
  );
  const up = useMemo(() => corr(groupA), [corr, groupA]);
  const low = useMemo(() => corr(groupB), [corr, groupB]);
  const showLow = groupB.length >= MIN_GROUP;
  const k = positions.length;
  const spans = useMemo(() => {
    const out = [];
    positions.forEach((p, i) => {
      if (!out.length || positions[i - 1].d !== p.d) out.push([i, i]);
      else out[out.length - 1][1] = i;
    });
    return out;
  }, [positions]);
  const cw = (width - 20) / Math.max(1, k);
  const AXIS = 34;
  const maxSpan = Math.max(1, ...spans.map(([a, b]) => b - a + 1));
  const half = (maxSpan * cw) / 2; // tallest window triangle
  const height = Math.round(half + AXIS + 26 + (groupB.length >= MIN_GROUP ? half : 50));
  const ax = 26 + half + AXIS / 2; // axis line y
  const x0 = 10;

  const draw = useCallback(
    (ctx, c) => {
      // upper (group A) and lower (group B, mirrored) triangles: pair (i, j) at x = (i + j + 1) / 2, height (j - i) / 2
      const tri = (C, dir) => {
        for (let i = 0; i < k; i += 1) {
          for (let j = i + 1; j < k; j += 1) {
            if (positions[i].d !== positions[j].d) break; // one triangle per window, as in the paper
            const r = C[i * k + j];
            const t = Number.isFinite(r) ? Math.max(0, Math.min(1, (r - 0.5) / 0.5)) : 0;
            if (t <= 0.02) continue;
            const cx = x0 + ((i + j + 1) / 2) * cw;
            const cy = ax - dir * (AXIS / 2 + ((j - i) / 2) * cw);
            ctx.fillStyle = `rgba(200,16,30,${t.toFixed(2)})`;
            ctx.beginPath();
            ctx.moveTo(cx, cy - (dir * cw) / 2);
            ctx.lineTo(cx + cw / 2, cy);
            ctx.lineTo(cx, cy + (dir * cw) / 2);
            ctx.lineTo(cx - cw / 2, cy);
            ctx.closePath();
            ctx.fill();
          }
        }
        // outline of each window's triangle
        ctx.strokeStyle = c.dark ? "#8c8c8c" : "#595959";
        ctx.lineWidth = 0.8;
        spans.forEach(([a, b]) => {
          const xa = x0 + a * cw;
          const xb = x0 + (b + 1) * cw;
          ctx.beginPath();
          ctx.moveTo(xa, ax - (dir * AXIS) / 2);
          ctx.lineTo((xa + xb) / 2, ax - dir * (AXIS / 2 + (xb - xa) / 2));
          ctx.lineTo(xb, ax - (dir * AXIS) / 2);
          ctx.closePath();
          ctx.stroke();
        });
        ctx.lineWidth = 1;
      };
      tri(up.C, 1);
      if (showLow) tri(low.C, -1);
      else {
        textRole(ctx, c, "caption");
        ctx.textAlign = "center";
        ctx.fillText(`Only ${groupB.length} other tumour cell${groupB.length === 1 ? "" : "s"}: too few to correlate. Select a clade to compare it with the rest.`, x0 + (k * cw) / 2, ax + AXIS / 2 + 30);
      }
      // colour key
      const kx = width - 96;
      const g = ctx.createLinearGradient(kx, 0, kx + 80, 0);
      g.addColorStop(0, "rgba(200,16,30,0)");
      g.addColorStop(1, "rgba(200,16,30,1)");
      ctx.fillStyle = g;
      ctx.fillRect(kx, 18, 80, 7);
      ctx.strokeStyle = c.grid;
      ctx.strokeRect(kx + 0.5, 18.5, 79, 6);
      textRole(ctx, c, "tick");
      ctx.textAlign = "left";
      ctx.fillText("0.5", kx, 32);
      ctx.textAlign = "right";
      ctx.fillText("1", kx + 80, 32);
      textRole(ctx, c, "label", "text");
      ctx.textAlign = "right";
      ctx.fillText("Segment CN correlation (r)", kx + 80, 10);
      // axis band: windows, walk segments, genes
      const gx = (g) => {
        for (let j = 0; j < k - 1; j += 1) if (positions[j].g <= g && positions[j + 1].g >= g && positions[j].d === positions[j + 1].d) return x0 + (j + 0.5 + (g - positions[j].g) / (positions[j + 1].g - positions[j].g)) * cw;
        return null;
      };
      ctx.fillStyle = c.dark ? "#5a5a5a" : "#d0d0d0";
      ctx.fillRect(x0, ax - 2, k * cw, 4);
      if (walk) {
        ctx.fillStyle = colorOf ? colorOf(walk.id) : "#2e7d32";
        (walk.nodes || []).forEach((nd) => {
          const bin = chromoBins?.[`${nd.chromosome}`.replace(/^chr/, "")];
          if (!bin) return;
          const a = gx(bin.startPlace + Math.min(nd.start, nd.end));
          const b = gx(bin.startPlace + Math.max(nd.start, nd.end));
          if (a != null && b != null) ctx.fillRect(a, ax - 5, Math.max(2, b - a), 10);
        });
      }
      genes.forEach(({ name, g }) => {
        const x = gx(g);
        if (x == null) return;
        textRole(ctx, c, "label", "text");
        ctx.font = ctx.font.replace(/^(\d+ )?/, "italic 600 ");
        ctx.textAlign = "center";
        ctx.fillText(name, x, ax + 13);
      });
      textRole(ctx, c, "label", "text");
      ctx.textAlign = "left";
      ctx.fillText(`${labelA} (${up.n})`, x0, 10);
      if (showLow) ctx.fillText(`${labelB} (${low.n})`, x0, height - 10);
      // coarse hit grid
      const hits = [];
      const step = Math.max(1, Math.floor(k / 24));
      for (let i = 0; i < k; i += step) {
        for (let j = i + step; j < k; j += step) {
          [1, -1].forEach((dir) => {
            const cx = x0 + ((i + j + 1) / 2) * cw;
            const cy = ax - dir * (AXIS / 2 + ((j - i) / 2) * cw);
            if (positions[i].d !== positions[j].d || (dir < 0 && !showLow)) return;
            hits.push({ x0: cx - step * cw * 0.5, x1: cx + step * cw * 0.5, y0: cy - step * cw * 0.5, y1: cy + step * cw * 0.5, i, j, dir });
          });
        }
      }
      return hits;
    },
    [k, cw, ax, up, low, spans, showLow, groupB.length, width, positions, walk, colorOf, chromoBins, genes, labelA, labelB, height]
  );
  if (!domains.length || !groupA.length) return <div ref={ref} className="sc-fig-empty">Select cells (or focus a variant) to compare their co-variation with the rest.</div>;
  const pos = (g) => {
    const chr = Object.keys(chromoBins || {}).find((key) => chromoBins[key].startPlace <= g && chromoBins[key].endPlace >= g);
    return chr ? `chr${chr}:${((g - chromoBins[chr].startPlace) / 1e6).toFixed(2)} Mb` : "–";
  };
  return (
    <div ref={ref}>
      <FigureCanvas
        width={width}
        height={height}
        draw={draw}
        ariaLabel="Segment copy-number co-variation triangles"
        tooltip={(h) => {
          const r = (h.dir > 0 ? up : low).C[h.i * k + h.j];
          return [h.dir > 0 ? labelA : labelB, ["Segment A", pos(positions[h.i].g)], ["Segment B", pos(positions[h.j].g)], ["Pearson r (log CN)", Number.isFinite(r) ? r.toFixed(2) : "–"]];
        }}
      />
    </div>
  );
}
