import React, { useCallback, useMemo } from "react";
import FigureCanvas, { font } from "./figureCanvas";
import { binAt, domainExtents, naturalCompare } from "../../../helpers/singleCell/matrix";
import { cloneFractions, columnCorrelations, geneSetColor, isNormalClone, linearFit, quantiles } from "../../../helpers/singleCell/figures";

const pct = (f) => `${Math.round(100 * f)}%`;

/** Fig 4F: fraction of each clone's cells carrying each amplicon gene set (copies >= minCn). */
export function CloneCarrierBars({ width, height = 210, groups, cells, cloneColors, minCn = 1 }) {
  const clones = useMemo(() => [...new Set(cells.map((c) => c.clone_id ?? "NA"))].filter((c) => !isNormalClone(c)).sort(naturalCompare), [cells]);
  const data = useMemo(
    () =>
      groups.map((g) => {
        const carriers = new Set(g.cellIds.filter((id, k) => g.cn[k] >= minCn));
        const fr = cloneFractions(cells, carriers);
        return { g, byClone: new Map(fr.map((f) => [f.clone, f])) };
      }),
    [groups, cells, minCn]
  );
  const M = { l: 34, r: 8, t: 10, b: 34 };
  const draw = useCallback(
    (ctx, c) => {
      const hits = [];
      const y = (f) => height - M.b - f * (height - M.t - M.b);
      ctx.font = font(10);
      ctx.textAlign = "right";
      [0, 0.25, 0.5, 0.75, 1].forEach((f) => {
        ctx.fillStyle = c.muted;
        ctx.fillText(f.toFixed(2), M.l - 4, y(f));
        ctx.fillStyle = c.grid;
        ctx.fillRect(M.l, Math.round(y(f)), width - M.l - M.r, 1);
      });
      const cw = (width - M.l - M.r) / Math.max(1, clones.length);
      const bw = Math.min(22, (cw * 0.8) / Math.max(1, data.length));
      clones.forEach((clone, i) => {
        const cx = M.l + (i + 0.5) * cw;
        data.forEach((d, j) => {
          const f = d.byClone.get(clone);
          if (!f) return;
          const x = cx - (data.length * bw) / 2 + j * bw;
          ctx.fillStyle = geneSetColor(d.g.key);
          ctx.fillRect(x, y(f.fraction), bw - 1, y(0) - y(f.fraction));
          hits.push({ x0: x, x1: x + bw, y0: M.t, y1: y(0), clone, f, g: d.g });
        });
        ctx.fillStyle = cloneColors[clone] || c.muted;
        ctx.fillRect(cx - cw * 0.4, height - M.b + 4, cw * 0.8, 3);
        ctx.fillStyle = c.text;
        ctx.textAlign = "center";
        ctx.fillText(clone, cx, height - M.b + 16);
      });
      return hits;
    },
    [width, height, clones, data, cloneColors] // eslint-disable-line react-hooks/exhaustive-deps
  );
  if (!groups.length || !clones.length) return null;
  return <FigureCanvas width={width} height={height} draw={draw} ariaLabel="Fraction of each clone carrying each amplicon" tooltip={(h) => [`${h.clone} · ec${h.g.key}`, ["Carriers", `${h.f.carriers} of ${h.f.n} (${pct(h.f.fraction)})`]]} />;
}

/**
 * Fig 5E: copy number of gene A against gene B in each cell, coloured by
 * clone, with a least-squares line, R² and the median B/A ratio per clone
 * (ecDNA co-amplification gives a tight line; integration a fixed ratio).
 */
export function GeneCnScatter({ width, height = 230, xs, ys, ids, cells, cloneColors, geneA, geneB, marked }) {
  const rec = useMemo(() => new Map(cells.map((c) => [c.cell_id, c])), [cells]);
  const pts = useMemo(() => ids.map((id, k) => ({ id, x: xs[k], y: ys[k], clone: rec.get(id)?.clone_id ?? "NA" })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)), [ids, xs, ys, rec]);
  const fits = useMemo(() => {
    const by = new Map();
    pts.forEach((p) => {
      if (!by.has(p.clone)) by.set(p.clone, []);
      by.get(p.clone).push(p);
    });
    return [...by.entries()].sort(([a], [b]) => naturalCompare(a, b)).map(([clone, list]) => ({ clone, ...linearFit(list.map((p) => p.x), list.map((p) => p.y)) }));
  }, [pts]);
  const M = { l: 38, r: 8, t: 8, b: 30 };
  const LEG = 128;
  const maxX = Math.max(4, quantiles(pts.map((p) => p.x), [0.995])[0] * 1.05 || 4);
  const maxY = Math.max(4, quantiles(pts.map((p) => p.y), [0.995])[0] * 1.05 || 4);
  const px = (v) => M.l + (Math.min(v, maxX) / maxX) * (width - LEG - M.l - M.r);
  const py = (v) => height - M.b - (Math.min(v, maxY) / maxY) * (height - M.t - M.b);
  const draw = useCallback(
    (ctx, c) => {
      const hits = [];
      ctx.font = font(10);
      const tick = (m) => [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * m));
      ctx.textAlign = "center";
      tick(maxX).forEach((v) => {
        ctx.fillStyle = c.grid;
        ctx.fillRect(Math.round(px(v)), M.t, 1, height - M.t - M.b);
        ctx.fillStyle = c.muted;
        ctx.fillText(`${v}`, px(v), height - M.b + 10);
      });
      ctx.textAlign = "right";
      tick(maxY).forEach((v) => {
        ctx.fillStyle = c.grid;
        ctx.fillRect(M.l, Math.round(py(v)), width - LEG - M.l - M.r, 1);
        ctx.fillStyle = c.muted;
        ctx.fillText(`${v}`, M.l - 4, py(v));
      });
      ctx.fillStyle = c.text;
      ctx.textAlign = "center";
      ctx.fillText(`${geneA} CN`, (M.l + width - LEG) / 2, height - 6);
      ctx.save();
      ctx.translate(10, (M.t + height - M.b) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(`${geneB} CN`, 0, 0);
      ctx.restore();
      pts.forEach((p) => {
        const x = px(p.x);
        const y = py(p.y);
        const isMarked = marked?.cells?.has(p.id);
        ctx.fillStyle = cloneColors[p.clone] || c.muted;
        ctx.globalAlpha = marked?.cells?.size && !isMarked ? 0.3 : 0.85;
        ctx.beginPath();
        ctx.arc(x, y, isMarked ? 3.5 : 2.6, 0, 2 * Math.PI);
        ctx.fill();
        if (isMarked) {
          ctx.strokeStyle = c.text;
          ctx.stroke();
        }
        hits.push({ x0: x - 4, x1: x + 4, y0: y - 4, y1: y + 4, p });
      });
      ctx.globalAlpha = 1;
      // fit lines and stats
      ctx.textAlign = "left";
      fits.forEach((f, k) => {
        if (!Number.isFinite(f.slope) || f.n < 5) return;
        const col = cloneColors[f.clone] || c.muted;
        const x0 = 0;
        const x1 = maxX;
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(px(x0), py(Math.max(0, f.intercept + f.slope * x0)));
        ctx.lineTo(px(x1), py(Math.max(0, f.intercept + f.slope * x1)));
        ctx.stroke();
        ctx.lineWidth = 1;
        const ty = M.t + 6 + k * 30;
        ctx.fillStyle = col;
        ctx.fillRect(width - LEG + 4, ty - 4, 8, 8);
        ctx.fillStyle = c.text;
        ctx.font = font(11, 600);
        ctx.fillText(f.clone, width - LEG + 16, ty);
        ctx.font = font(10);
        ctx.fillStyle = c.muted;
        ctx.fillText(`slope ${f.slope.toFixed(2)} · R² ${f.r2.toFixed(2)} · ratio ${f.ratio.toFixed(2)}`.slice(0, 40), width - LEG + 4, ty + 12);
        hits.push({ x0: width - LEG, x1: width, y0: ty - 8, y1: ty + 18, f });
      });
      return hits;
    },
    [pts, fits, width, height, maxX, maxY, cloneColors, geneA, geneB, marked] // eslint-disable-line react-hooks/exhaustive-deps
  );
  if (!pts.length) return null;
  return (
    <FigureCanvas
      width={width}
      height={height}
      draw={draw}
      ariaLabel={`${geneA} against ${geneB} copy number per cell`}
      tooltip={(h) =>
        h.p
          ? [h.p.id, ["Clone", h.p.clone], [geneA, h.p.x.toFixed(1)], [geneB, h.p.y.toFixed(1)]]
          : [h.f.clone, ["Cells", h.f.n], ["Slope", h.f.slope.toFixed(2)], ["R²", h.f.r2.toFixed(2)], [`Median ${geneB}/${geneA}`, h.f.ratio.toFixed(2)]]
      }
    />
  );
}

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
