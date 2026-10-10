import React, { useCallback, useMemo } from "react";
import { useSelector } from "react-redux";
import FigureCanvas from "./figureCanvas";
import { textRole } from "./figureKit";
import useContainerWidth from "../useContainerWidth";
import { binAt } from "../../../helpers/singleCell/matrix";
import { columnCorrelations } from "../../../helpers/singleCell/figures";

const K = 96; // positions across the windows

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
      rows.forEach((row, i) =>
        positions.forEach(({ g }, j) => {
          const b = binAt(row.binIndex, g);
          M[i * k + j] = b >= 0 ? Math.log1p(Math.max(0, row.values[b])) : 0;
        })
      );
      return { C: columnCorrelations(M, rows.length, k), n: rows.length };
    },
    [cnById, positions]
  );
  const up = useMemo(() => corr(groupA), [corr, groupA]);
  const low = useMemo(() => corr(groupB), [corr, groupB]);
  const k = positions.length;
  const cw = (width - 20) / Math.max(1, k);
  const half = (k * cw) / 2;
  const AXIS = 34;
  const height = Math.round(2 * half + AXIS + 8);
  const ax = height / 2; // axis line y
  const x0 = 10;

  const draw = useCallback(
    (ctx, c) => {
      // upper (group A) and lower (group B, mirrored) triangles: pair (i, j) at x = (i + j + 1) / 2, height (j - i) / 2
      const tri = (C, dir) => {
        for (let i = 0; i < k; i += 1) {
          for (let j = i + 1; j < k; j += 1) {
            const r = C[i * k + j];
            const t = Number.isFinite(r) ? Math.max(0, Math.min(1, (r - 0.4) / 0.6)) : 0;
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
        // outline of the triangle
        ctx.strokeStyle = c.grid;
        ctx.beginPath();
        ctx.moveTo(x0, ax - (dir * AXIS) / 2);
        ctx.lineTo(x0 + half, ax - dir * (AXIS / 2 + half));
        ctx.lineTo(x0 + 2 * half, ax - (dir * AXIS) / 2);
        ctx.stroke();
      };
      tri(up.C, 1);
      tri(low.C, -1);
      // axis band: windows, walk segments, genes
      const gx = (g) => {
        for (let j = 0; j < k - 1; j += 1) if (positions[j].g <= g && positions[j + 1].g >= g && positions[j].d === positions[j + 1].d) return x0 + (j + 0.5 + (g - positions[j].g) / (positions[j + 1].g - positions[j].g)) * cw;
        return null;
      };
      ctx.fillStyle = c.dark ? "#5a5a5a" : "#d0d0d0";
      ctx.fillRect(x0, ax - 2, 2 * half, 4);
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
      ctx.fillText(`${labelB} (${low.n})`, x0, height - 10);
      // coarse hit grid
      const hits = [];
      const step = Math.max(1, Math.floor(k / 24));
      for (let i = 0; i < k; i += step) {
        for (let j = i + step; j < k; j += step) {
          [1, -1].forEach((dir) => {
            const cx = x0 + ((i + j + 1) / 2) * cw;
            const cy = ax - dir * (AXIS / 2 + ((j - i) / 2) * cw);
            hits.push({ x0: cx - step * cw * 0.5, x1: cx + step * cw * 0.5, y0: cy - step * cw * 0.5, y1: cy + step * cw * 0.5, i, j, dir });
          });
        }
      }
      return hits;
    },
    [k, cw, ax, up, low, half, positions, walk, colorOf, chromoBins, genes, labelA, labelB, height]
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
