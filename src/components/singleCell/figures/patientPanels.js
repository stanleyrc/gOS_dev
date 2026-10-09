import React, { useCallback, useMemo } from "react";
import FigureCanvas, { font } from "./figureCanvas";
import { binAt, domainExtents } from "../../../helpers/singleCell/matrix";
import { columnCorrelations } from "../../../helpers/singleCell/figures";

/**
 * Fig 5C: correlation of segment copy number across cells along the
 * amplicon region(s): upper triangle in the marked cells (e.g. carriers of
 * a recombined ecDNA), lower triangle in the other tumour cells. Blocks of
 * high correlation between distant segments = segments carried together.
 */
export function SegmentCorrelation({ width, cnEntry, domains, carriers, others, m = 90, chromoBins }) {
  const size = Math.min(width, 260);
  const positions = useMemo(() => {
    const ext = domainExtents(domains, m, 0);
    const out = [];
    ext.forEach(([a, b, d]) => {
      for (let x = a; x < b; x += 1) out.push(d[0] + ((x + 0.5 - a) / (b - a)) * (d[1] - d[0]));
    });
    return out;
  }, [domains, m]);
  const matrices = useMemo(() => {
    const rows = new Map((cnEntry?.cellRows || []).map((c) => [c.cellId, c.row]));
    const build = (ids) => {
      const list = ids.map((id) => rows.get(id)).filter(Boolean);
      const k = positions.length;
      const M = new Float32Array(list.length * k);
      list.forEach((row, i) =>
        positions.forEach((g, j) => {
          const b = binAt(row.binIndex, g);
          M[i * k + j] = b >= 0 ? Math.log1p(Math.max(0, row.values[b])) : 0;
        })
      );
      return { C: columnCorrelations(M, list.length, k), n: list.length };
    };
    return { up: build([...carriers]), low: build([...others]) };
  }, [cnEntry, positions, carriers, others]);
  const k = positions.length;
  const cell = size / Math.max(1, k);
  const draw = useCallback(
    (ctx, c) => {
      for (let i = 0; i < k; i += 1) {
        for (let j = 0; j < k; j += 1) {
          if (i === j) continue;
          const r = (j > i ? matrices.up : matrices.low).C[i * k + j];
          const t = Number.isFinite(r) ? Math.max(0, Math.min(1, (r - 0.5) / 0.5)) : 0;
          ctx.fillStyle = t > 0 ? `rgba(200,16,30,${t.toFixed(2)})` : c.panel;
          ctx.fillRect(j * cell, i * cell, Math.ceil(cell), Math.ceil(cell));
        }
      }
      ctx.strokeStyle = c.muted;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(size, size);
      ctx.stroke();
      ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
      // region boundaries
      const ext = domainExtents(domains, m, 0);
      ext.slice(1).forEach(([a]) => {
        ctx.fillStyle = c.text;
        ctx.fillRect(a * cell, 0, 1, size);
        ctx.fillRect(0, a * cell, size, 1);
      });
      ctx.font = font(10);
      ctx.fillStyle = c.text;
      ctx.textAlign = "right";
      ctx.fillText(`marked (${matrices.up.n})`, size - 4, 8);
      ctx.textAlign = "left";
      ctx.fillText(`others (${matrices.low.n})`, 4, size - 8);
      // a coarse hit grid is enough for reading values
      const hits = [];
      const step = Math.max(1, Math.floor(k / 15));
      for (let i = 0; i < k; i += step) {
        for (let j = 0; j < k; j += step) {
          if (i !== j) hits.push({ x0: j * cell, y0: i * cell, x1: (j + step) * cell, y1: (i + step) * cell, i, j });
        }
      }
      return hits;
    },
    [matrices, k, cell, size, domains, m]
  );
  if (!k || !carriers.size) return null;
  const label = (g) => {
    const chr = Object.keys(chromoBins).find((key) => chromoBins[key].startPlace <= g && chromoBins[key].endPlace >= g);
    return chr ? `chr${chr}:${((g - chromoBins[chr].startPlace) / 1e6).toFixed(2)} Mb` : "";
  };
  return (
    <FigureCanvas
      width={size}
      height={size}
      draw={draw}
      ariaLabel="Segment copy-number correlation in marked and other cells"
      tooltip={(h) => {
        const up = h.j > h.i;
        const r = (up ? matrices.up : matrices.low).C[h.i * k + h.j];
        return [up ? "Marked cells" : "Other tumour cells", ["Segment A", label(positions[h.i])], ["Segment B", label(positions[h.j])], ["Pearson r (log CN)", Number.isFinite(r) ? r.toFixed(2) : "–"]];
      }}
    />
  );
}
