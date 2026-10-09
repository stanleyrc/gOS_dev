import React, { useCallback, useMemo, useState } from "react";
import { Typography } from "antd";
import HeatmapCanvas from "../heatmapCanvas";
import PhylogenyCanvas from "../phylogenyCanvas";
import usePixelRatio from "../usePixelRatio";
import FigureCanvas, { fitText, font } from "./figureCanvas";
import {
  annotationColors,
  binAt,
  discreteColumnLookup,
  domainExtents,
  genomicColumnLookup,
  genomicTicks,
  packRGBA,
} from "../../../helpers/singleCell/matrix";
import { AMP_LEGEND, ampliconCss, ampliconRGBA, binSnvMatrix, geneSetColor, snvTreeOrder } from "../../../helpers/singleCell/figures";

const { Text } = Typography;
const GAP = 6;
const STRIP = 9;
const HEAD = 74;
const FOOT = 34;

// VAF grey ramp (white -> black); sites without reads show the panel background.
const VAF_RGBA = Array.from({ length: 251 }, (_, v) => {
  const g = Math.round(245 - (v / 250) * 235);
  return packRGBA([g, g, g]);
});
const NO_READS = packRGBA([255, 255, 255], 0);
const WHITE = packRGBA([255, 255, 255]);

/**
 * Patient figure (paper Fig 4B / 5B / 5D): cells in tree order with clone,
 * cell state and marked-cell strips, the whole-genome SNV panel (VAF, columns
 * in tree order), copy number over the amplicon region(s), copies of each
 * ecDNA walk and stacked amplicon copies per cell. Hover any panel for the
 * cell; click a tree node to mark its clade; double-click a row to open the cell.
 */
export default function ClonalAmpliconView({
  width,
  layout,
  cells,
  groups,
  cnEntry,
  snvPacked,
  nVariants,
  domains,
  regionLabel,
  chromoBins,
  cloneColors,
  marked,
  onMark,
  onOpenCell,
}) {
  const pr = usePixelRatio();
  const [hover, setHover] = useState(null); // { row, text }
  const rec = useMemo(() => new Map(cells.map((c) => [c.cell_id, c])), [cells]);
  const rowIds = useMemo(() => (layout ? layout.leaves : cells.map((c) => c.cell_id)), [layout, cells]);
  const n = rowIds.length;
  const height = Math.max(300, Math.min(560, n * 3.4));
  const stateColors = useMemo(() => annotationColors(cells.map((c) => c.state).filter(Boolean)), [cells]);

  const walks = useMemo(() => groups.flatMap((g) => g.walks.map((w) => ({ ...w, group: g.key }))), [groups]);
  const hasSnv = Boolean(snvPacked && nVariants);
  // column widths
  const TREE = layout ? 150 : 0;
  const strips = STRIP * 3 + 4;
  const rest = Math.max(300, width - TREE - strips - GAP * 5 - 8);
  const BARS = groups.length ? 80 : 0;
  const WALK = walks.length ? Math.min(Math.max(walks.length * 12, 48), Math.round(rest * 0.18)) : 0;
  const SNV = hasSnv ? Math.round((rest - BARS - WALK) * 0.36) : 0;
  const CN = rest - BARS - WALK - SNV;
  const xTree = 0;
  const xStrips = xTree + TREE + (TREE ? GAP : 0);
  const xSnv = xStrips + strips + GAP;
  const xCn = xSnv + SNV + (SNV ? GAP : 0);
  const xWalk = xCn + CN + GAP;
  const xBars = xWalk + WALK + (WALK ? GAP : 0);

  const markedRows = useMemo(() => {
    if (!marked?.cells?.size) return null;
    const s = new Set();
    rowIds.forEach((id, r) => marked.cells.has(id) && s.add(r));
    return s;
  }, [marked, rowIds]);

  /* ---- SNV panel: max VAF per pixel column bin ---- */
  const snv = useMemo(() => {
    if (!hasSnv || SNV <= 0) return null;
    const rowOf = new Map(rowIds.map((id, r) => [id, r]));
    const order = snvTreeOrder(snvPacked, rowOf, nVariants);
    const nBins = Math.max(1, Math.floor((SNV - 2) * pr));
    const M = binSnvMatrix(snvPacked, rowIds, order, nBins);
    const cols = discreteColumnLookup(nBins, nBins);
    return { M, nBins, cols, nSites: order.length, colorAt: (r, c) => (M[r * nBins + c] < 0 ? NO_READS : VAF_RGBA[M[r * nBins + c]]) };
  }, [hasSnv, snvPacked, nVariants, rowIds, SNV, pr]);

  /* ---- CN over the region(s) ---- */
  const cnByCell = useMemo(() => new Map((cnEntry?.cellRows || []).map((c) => [c.cellId, c.row])), [cnEntry]);
  const cn = useMemo(() => {
    const wpx = Math.max(1, Math.floor(CN * pr));
    const cache = new Map();
    const colsFor = (r) => {
      const row = cnByCell.get(rowIds[r]);
      if (!row) return null;
      if (!cache.has(r)) cache.set(r, genomicColumnLookup(row.binIndex, domains, wpx, GAP * pr).cols);
      return cache.get(r);
    };
    return { cols: colsFor, colorAt: (r, c) => ampliconRGBA(cnByCell.get(rowIds[r]).values[c]), extents: domainExtents(domains, CN, GAP) };
  }, [cnByCell, rowIds, domains, CN, pr]);

  /* ---- walk copies ---- */
  const walkHeat = useMemo(() => {
    if (!WALK) return null;
    const cols = discreteColumnLookup(walks.length, Math.floor(WALK * pr));
    return {
      cols,
      colorAt: (r, c) => {
        const v = Number(walks[c].cells?.[rowIds[r]]) || 0;
        return v > 0 ? ampliconRGBA(v) : WHITE;
      },
    };
  }, [walks, rowIds, WALK, pr]);

  const rowH = height / Math.max(1, n);
  const describe = useCallback(
    (r, extra) => {
      const id = rowIds[r];
      const c = rec.get(id);
      const parts = [id, c?.clone_id, c?.state].filter(Boolean);
      return `${parts.join(" · ")}${extra ? ` · ${extra}` : ""}`;
    },
    [rowIds, rec]
  );

  /* ---- strips (clone, state, marked) ---- */
  const drawStrips = useCallback(
    (ctx, c) => {
      const hits = [];
      rowIds.forEach((id, r) => {
        const cell = rec.get(id);
        const y = r * rowH;
        const h = Math.max(1, rowH + 0.3);
        ctx.fillStyle = cloneColors[cell?.clone_id] || c.empty;
        ctx.fillRect(0, y, STRIP, h);
        ctx.fillStyle = stateColors[cell?.state] || c.empty;
        ctx.fillRect(STRIP + 2, y, STRIP, h);
        if (markedRows?.has(r)) {
          ctx.fillStyle = c.text;
          ctx.fillRect(2 * STRIP + 4, y, STRIP, h);
        }
        hits.push({ x0: 0, y0: y, x1: strips, y1: y + rowH, r });
      });
      return hits;
    },
    [rowIds, rec, rowH, cloneColors, stateColors, markedRows, strips]
  );

  /* ---- stacked copies per cell ---- */
  const maxCopies = useMemo(() => {
    let m = 1;
    rowIds.forEach((id) => {
      let s = 0;
      groups.forEach((g) => {
        const k = g.cellIds.indexOf(id);
        if (k >= 0) s += g.cn[k];
      });
      m = Math.max(m, s);
    });
    return m;
  }, [rowIds, groups]);
  const groupIndex = useMemo(() => groups.map((g) => new Map(g.cellIds.map((id, k) => [id, k]))), [groups]);
  const drawBars = useCallback(
    (ctx) => {
      const hits = [];
      rowIds.forEach((id, r) => {
        let x = 0;
        const y = r * rowH;
        const parts = [];
        groups.forEach((g, gi) => {
          const k = groupIndex[gi].get(id);
          const v = k == null ? 0 : g.cn[k];
          if (!(v > 0)) return;
          const w = (v / maxCopies) * (BARS - 4);
          ctx.fillStyle = geneSetColor(g.key);
          ctx.fillRect(x, y, w, Math.max(1, rowH - (rowH > 3 ? 0.6 : 0)));
          x += w;
          parts.push(`${g.key} ${v.toFixed(0)}`);
        });
        hits.push({ x0: 0, y0: y, x1: BARS, y1: y + rowH, r, text: parts.join(", ") || "no amplicon copies" });
      });
      return hits;
    },
    [rowIds, rowH, groups, groupIndex, maxCopies, BARS]
  );

  /* ---- header: titles and walk labels; footer: region axis and legends ---- */
  const drawHeader = useCallback(
    (ctx, c) => {
      ctx.font = font(12, 600);
      ctx.fillStyle = c.text;
      ctx.textAlign = "center";
      if (TREE) ctx.fillText("Phylogeny", xTree + TREE / 2, HEAD - 10);
      ctx.save();
      ctx.font = font(10);
      [["Clone", 0], ["State", STRIP + 2], ["Marked", 2 * STRIP + 4]].forEach(([label, dx]) => {
        ctx.save();
        ctx.translate(xStrips + dx + STRIP / 2, HEAD - 4);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = "left";
        ctx.fillText(label, 0, 0);
        ctx.restore();
      });
      ctx.restore();
      if (SNV) ctx.fillText(`Whole-genome SNVs (${snv?.nSites ?? 0})`, xSnv + SNV / 2, HEAD - 10);
      ctx.fillText(fitText(ctx, `Copy number · ${regionLabel}`, CN), xCn + CN / 2, HEAD - 10);
      if (BARS) ctx.fillText("Copies", xBars + BARS / 2, HEAD - 10);
      if (WALK) {
        ctx.font = font(10);
        const cw = WALK / walks.length;
        walks.forEach((w, k) => {
          if (cw < 7 && k % Math.ceil(7 / cw)) return;
          ctx.save();
          ctx.translate(xWalk + (k + 0.5) * cw, HEAD - 4);
          ctx.rotate(-Math.PI / 2);
          ctx.textAlign = "left";
          ctx.fillStyle = geneSetColor(w.group) === "#9B8AAE" ? c.text : geneSetColor(w.group);
          ctx.fillText(fitText(ctx, w.label || w.name || w.id, HEAD - 8), 0, 0);
          ctx.restore();
        });
      }
      return walks.length && WALK ? walks.map((w, k) => ({ x0: xWalk + (k * WALK) / walks.length, x1: xWalk + ((k + 1) * WALK) / walks.length, y0: 0, y1: HEAD, w })) : [];
    },
    [TREE, SNV, CN, WALK, BARS, xStrips, xSnv, xCn, xWalk, xBars, walks, regionLabel, snv]
  );
  const drawFooter = useCallback(
    (ctx, c) => {
      ctx.font = font(10);
      ctx.fillStyle = c.muted;
      ctx.textAlign = "center";
      const ticks = genomicTicks(chromoBins, cn.extents, { minSpan: 40, spacing: 70 });
      ticks.forEach((t) => {
        ctx.fillRect(xCn + t.x, 0, 1, 4);
        ctx.fillText(t.label.replace(" Mb", ""), xCn + t.x, 11);
      });
      cn.extents.forEach(([a, b, d]) => {
        const chr = Object.keys(chromoBins).find((k) => chromoBins[k].startPlace <= d[0] && chromoBins[k].endPlace >= d[0]);
        ctx.fillStyle = c.text;
        ctx.fillText(`chr${chr} (Mb)`, xCn + (a + b) / 2, 25);
      });
      // amplicon CN legend under the SNV panel (or tree)
      const lx = SNV ? xSnv : xStrips;
      ctx.textAlign = "left";
      ctx.fillStyle = c.text;
      ctx.fillText("CN", lx, 9);
      AMP_LEGEND.forEach((v, k) => {
        ctx.fillStyle = ampliconCss(v);
        ctx.fillRect(lx + 20 + k * 22, 2, 22, 8);
        ctx.fillStyle = c.muted;
        ctx.fillText(`${v}`, lx + 20 + k * 22, 20);
      });
      if (SNV) {
        const vx = lx + 20 + AMP_LEGEND.length * 22 + 14;
        ctx.fillStyle = c.text;
        ctx.fillText("VAF", vx, 9);
        for (let k = 0; k < 40; k += 1) {
          const g = Math.round(245 - (k / 39) * 235);
          ctx.fillStyle = `rgb(${g},${g},${g})`;
          ctx.fillRect(vx + 26 + k * 1.5, 2, 1.6, 8);
        }
        ctx.fillStyle = c.muted;
        ctx.fillText("0", vx + 26, 20);
        ctx.fillText("1", vx + 26 + 57, 20);
      }
      return [];
    },
    [chromoBins, cn.extents, xCn, SNV, xSnv, xStrips]
  );

  const onCnHover = ({ row, col }) => {
    const r = cnByCell.get(rowIds[row]);
    const v = r && col >= 0 ? r.values[col] : null;
    const pos = r && col >= 0 ? `${r.binIndex.chromosome[col]}:${(r.binIndex.start[col] / 1e6).toFixed(2)}-${(r.binIndex.end[col] / 1e6).toFixed(2)} Mb` : "";
    setHover({ row, text: describe(row, v != null ? `CN ${Number(v).toFixed(1)} at ${pos}` : "") });
  };
  const onWalkHover = ({ row, col }) => {
    const w = walks[col];
    if (!w) return;
    setHover({ row, text: describe(row, `${w.label || w.id}: ${Number(w.cells?.[rowIds[row]]) || 0} copies`) });
  };
  const onSnvHover = ({ row, col }) => {
    const v = snv?.M[row * snv.nBins + col];
    setHover({ row, text: describe(row, v == null || v < 0 ? "no reads in this SNV bin" : `max VAF ${(v / 250).toFixed(2)} in bin`) });
  };
  const leave = () => setHover(null);
  const open = ({ row }) => rowIds[row] && onOpenCell?.(rowIds[row]);
  const leafClones = useMemo(() => rowIds.map((id) => rec.get(id)?.clone_id ?? null), [rowIds, rec]);
  // heatmap rows to outline: the marked cells, drawn only when few enough to read
  const outline = markedRows && markedRows.size <= 40 ? markedRows : null;

  return (
    <div style={{ position: "relative" }}>
      <div style={{ height: 18, fontSize: 12, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {hover ? <Text>{hover.text}</Text> : <Text type="secondary">Hover a row for the cell; click a tree node to mark its clade; double-click a row to open the cell.</Text>}
      </div>
      <FigureCanvas width={width} height={HEAD} draw={drawHeader} tooltip={(h) => [h.w.label || h.w.id, ["Gene set", h.w.group], ["Cells", h.w.ncells ?? "–"], ["Span", h.w.span ? `${(h.w.span / 1e3).toFixed(0)} kb` : "–"], ["Coordinates", h.w.coordinates || "–"]]} />
      <div style={{ display: "flex", alignItems: "flex-start", height }}>
        {TREE > 0 && (
          <div style={{ width: TREE, marginRight: GAP }}>
            <PhylogenyCanvas
              layout={layout}
              nRows={n}
              width={TREE}
              height={height}
              leafClones={leafClones}
              cloneColors={cloneColors}
              selectedRows={markedRows}
              hoverRow={hover?.row ?? null}
              pixelRatio={pr}
              showScaleBar={false}
              onSelectRange={([a, b]) => onMark?.({ cells: new Set(rowIds.slice(Math.min(a, b), Math.max(a, b) + 1)), label: `clade of ${Math.abs(b - a) + 1} cells` })}
            />
          </div>
        )}
        <div style={{ marginRight: GAP }}>
          <FigureCanvas width={strips} height={height} draw={drawStrips} onHover={(h) => (h ? setHover({ row: h.r, text: describe(h.r) }) : leave())} />
        </div>
        {snv && (
          <div style={{ marginRight: GAP, border: "1px solid rgba(127,127,127,0.35)" }}>
            <HeatmapCanvas pixelRatio={pr} width={SNV - 2} height={height} nRows={n} cols={snv.cols} colorAt={snv.colorAt} onHover={onSnvHover} onLeave={leave} onDoubleClick={open} />
          </div>
        )}
        <div style={{ marginRight: GAP }}>
          <HeatmapCanvas pixelRatio={pr} width={CN} height={height} nRows={n} cols={cn.cols} colorAt={cn.colorAt} separators={cn.extents.slice(1).map(([a]) => a - GAP / 2)} highlightRows={outline} onHover={onCnHover} onLeave={leave} onDoubleClick={open} />
        </div>
        {walkHeat && (
          <div style={{ marginRight: GAP, border: "1px solid rgba(127,127,127,0.35)" }}>
            <HeatmapCanvas pixelRatio={pr} width={WALK - 2} height={height} nRows={n} cols={walkHeat.cols} colorAt={walkHeat.colorAt} onHover={onWalkHover} onLeave={leave} onDoubleClick={open} />
          </div>
        )}
        {BARS > 0 && <FigureCanvas width={BARS} height={height} draw={drawBars} onHover={(h) => (h ? setHover({ row: h.r, text: describe(h.r, h.text) }) : leave())} />}
      </div>
      <FigureCanvas width={width} height={FOOT} draw={drawFooter} />
    </div>
  );
}

/** Copy number of every cell at a global position (NaN when no segment covers it). */
export function cnAt(cnEntry, g) {
  const out = new Map();
  (cnEntry?.cellRows || []).forEach((c) => {
    const b = binAt(c.row.binIndex, g);
    out.set(c.cellId, b >= 0 ? c.row.values[b] : NaN);
  });
  return out;
}

