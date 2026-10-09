import React, { useCallback, useMemo } from "react";
import FigureCanvas, { fitText } from "./figureCanvas";
import { textRole } from "./figureKit";
import useContainerWidth from "../useContainerWidth";
import { binAt, domainExtents, annotationColors } from "../../../helpers/singleCell/matrix";
import { AMP_LEGEND, ampliconCss, ampliconRGBA, binSnvMatrix, geneSetColor, isNormalClone, snvTreeOrder } from "../../../helpers/singleCell/figures";
import { compressLongBranches, figureRows, leavesUnder, pruneLayout } from "../../../helpers/singleCell/figureMath";
import { selectMode } from "./cellSelection";

const TOP = 28;
const BOTTOM = 46;
const STRIP = 9;
const GAP = 6;
const NO_READS = 0xffffffff; // white
const NO_CN = 0xffeeeeee;

const mb = (bp) => `${(bp / 1e6).toFixed(bp >= 1e7 ? 0 : 1)}`;
const pickChrom = (chromoBins, g) => {
  const chr = Object.keys(chromoBins || {}).find((k) => chromoBins[k].startPlace <= g && chromoBins[k].endPlace >= g);
  return chr ? { chr, pos: g - chromoBins[chr].startPlace } : null;
};

/** ImageData (cols x rows) painted with `color(row, col)` (packed RGBA). */
function paintImage(cols, rows, color) {
  if (typeof ImageData === "undefined" || cols <= 0 || rows <= 0) return null;
  const img = new ImageData(cols, rows);
  const px = new Uint32Array(img.data.buffer);
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) px[r * cols + c] = color(r, c);
  return img;
}
const toCanvas = (img) => {
  if (!img || typeof document === "undefined") return null;
  const cv = document.createElement("canvas");
  cv.width = img.width;
  cv.height = img.height;
  cv.getContext("2d")?.putImageData(img, 0, 0);
  return cv;
};
const grayRGBA = (vaf) => {
  const v = Math.round(255 - (Math.min(250, vaf) / 250) * 235);
  return ((255 << 24) | (v << 16) | (v << 8) | v) >>> 0;
};

/**
 * Fig 4B / 5B / 5D: one patient's cells in tree order: phylogeny, clade and
 * cell-state strips, whole-genome SNV VAFs, copy number across the amplicon
 * region(s) and per-cell copies of each amplicon. Drag across rows, click a
 * tree node or a row to select cells (Shift adds, Alt removes).
 */
export default function CloneFigure({
  patient,
  layout,
  cells,
  groups = [],
  snv,
  cnEntry,
  domains = [],
  chromoBins,
  genes = [],
  cloneColors = {},
  selected,
  onSelect,
  maxPlotHeight = 620,
  minWidth = 640,
  showSnv = true,
}) {
  const [ref, measured] = useContainerWidth(1100);
  const width = Math.max(minWidth, measured);
  const info = useMemo(() => new Map(cells.map((c) => [c.cell_id, c])), [cells]);
  const cellIds = useMemo(() => cells.map((c) => c.cell_id), [cells]);
  const tree = useMemo(() => (layout ? pruneLayout(layout, new Set(cellIds)) : null), [layout, cellIds]);
  const { rows, nTree } = useMemo(() => figureRows(tree, cellIds), [tree, cellIds]);
  const n = rows.length;
  const rh = Math.max(1, Math.min(7, maxPlotHeight / Math.max(1, n)));
  const plotH = rh * n;
  const height = TOP + plotH + BOTTOM;
  const stateColors = useMemo(() => annotationColors(cells.map((c) => c.state).filter((s) => s != null && s !== "")), [cells]);
  const shownGroups = groups.slice(0, 5);
  const hasSnv = showSnv && !!snv?.packed && snv.nVariants > 0;
  const hasCn = !!cnEntry?.cellRows?.length && domains.length > 0;

  // column layout
  const L = useMemo(() => {
    const treeW = tree ? Math.round(Math.max(110, Math.min(240, width * 0.17))) : 0;
    const clade = treeW + (tree ? 4 : 0);
    const state = clade + STRIP + 2;
    const data0 = state + STRIP + GAP + 2;
    const barsW = shownGroups.length ? Math.max(56 * shownGroups.length, Math.min(90 * shownGroups.length, width * 0.24)) : 0;
    const rest = width - data0 - barsW - (shownGroups.length ? GAP * 2 : 0) - 4;
    const snvW = hasSnv ? Math.round(rest * (hasCn ? 0.36 : 1)) : 0;
    const cnW = hasCn ? Math.round(rest - snvW - (hasSnv ? GAP : 0)) : 0;
    const snvX = data0;
    const cnX = data0 + snvW + (hasSnv ? GAP : 0);
    const barsX = cnX + cnW + (shownGroups.length ? GAP * 2 : 0);
    const barW = shownGroups.length ? (barsW - GAP * (shownGroups.length - 1)) / shownGroups.length : 0;
    return { treeW, clade, state, data0, snvX, snvW, cnX, cnW, barsX, barW };
  }, [tree, width, hasSnv, hasCn, shownGroups.length]);

  // SNV panel: variants ordered along the tree, max VAF per pixel column
  const snvImg = useMemo(() => {
    if (!hasSnv || L.snvW < 4) return null;
    const rowOf = new Map(rows.map((id, i) => [id, i]));
    const order = snvTreeOrder(snv.packed, rowOf, snv.nVariants);
    if (!order.length) return null;
    const cols = Math.max(4, Math.min(Math.floor(L.snvW), order.length));
    const m = binSnvMatrix(snv.packed, rows, order, cols);
    return { canvas: toCanvas(paintImage(cols, n, (r, c) => (m[r * cols + c] < 0 ? NO_READS : grayRGBA(m[r * cols + c])))), nSites: order.length };
  }, [hasSnv, snv, rows, n, L.snvW]);

  // copy number across the region(s), one pixel column per position
  const cnImg = useMemo(() => {
    if (!hasCn || L.cnW < 4) return null;
    const cols = Math.floor(L.cnW);
    const ext = domainExtents(domains, cols, 3);
    const gOf = new Float64Array(cols).fill(NaN);
    ext.forEach(([a, b, d]) => {
      for (let x = a; x < b; x += 1) gOf[x] = d[0] + ((x + 0.5 - a) / (b - a)) * (d[1] - d[0]);
    });
    const byId = new Map(cnEntry.cellRows.map((c) => [c.cellId, c.row]));
    const img = paintImage(cols, n, () => 0);
    if (!img) return null;
    const px = new Uint32Array(img.data.buffer);
    rows.forEach((id, r) => {
      const row = byId.get(id);
      for (let x = 0; x < cols; x += 1) {
        if (!Number.isFinite(gOf[x])) {
          px[r * cols + x] = 0; // gap between regions: transparent
          continue;
        }
        if (!row) {
          px[r * cols + x] = NO_CN;
          continue;
        }
        const b = binAt(row.binIndex, gOf[x]);
        px[r * cols + x] = b >= 0 ? ampliconRGBA(row.values[b]) : NO_CN;
      }
    });
    return { canvas: toCanvas(img), ext, gOf, byId };
  }, [hasCn, cnEntry, domains, rows, n, L.cnW]);

  const groupCn = useMemo(
    () =>
      shownGroups.map((g) => {
        const idx = new Map(g.cellIds.map((id, i) => [id, i]));
        const vals = new Float32Array(n);
        let max = 0;
        rows.forEach((id, r) => {
          const i = idx.get(id);
          vals[r] = i == null ? NaN : g.cn[i];
          if (vals[r] > max) max = vals[r];
        });
        return { g, vals, max: max || 1 };
      }),
    [shownGroups, rows, n]
  );

  // selection as a row mask + whether each tree node's leaves are all selected
  const selMask = useMemo(() => {
    if (!selected?.size) return null;
    const m = new Uint8Array(n);
    rows.forEach((id, r) => (m[r] = selected.has(id) ? 1 : 0));
    return m;
  }, [selected, rows, n]);

  // long branches (e.g. normals vs tumour) drawn shortened with a "//" break
  const nodePx = useMemo(() => {
    if (!tree) return [];
    const { x, broken, maxX } = compressLongBranches(tree);
    const sx = (L.treeW - 8) / Math.max(1e-9, maxX);
    return tree.nodes.map((nd, i) => ({ nd, x: 4 + x[i] * sx, y: TOP + (nd.y + 0.5) * rh, broken: broken[i] === 1 }));
  }, [tree, L.treeW, rh]);

  const draw = useCallback(
    (ctx, c) => {
      ctx.imageSmoothingEnabled = false;
      // tree: one path; branches whose leaves are all selected drawn again in the accent
      if (tree) {
        const allSel = selMask
          ? (() => {
              const pre = new Int32Array(n + 1);
              for (let r = 0; r < n; r += 1) pre[r + 1] = pre[r] + selMask[r];
              return (nd) => pre[nd.lastLeaf + 1] - pre[nd.firstLeaf] === nd.lastLeaf - nd.firstLeaf + 1;
            })()
          : null;
        const stroke = (filter, color, w) => {
          ctx.beginPath();
          nodePx.forEach(({ nd, x, y }) => {
            if (nd.parent < 0 || (filter && !filter(nd))) return;
            const p = nodePx[nd.parent];
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x, y);
            ctx.lineTo(x, y);
          });
          ctx.strokeStyle = color;
          ctx.lineWidth = w;
          ctx.stroke();
        };
        stroke(null, c.dark ? "rgba(220,220,220,0.75)" : "rgba(40,40,40,0.75)", rh >= 3 ? 1 : 0.75);
        if (allSel) stroke(allSel, c.dark ? "#69b1ff" : "#1677ff", 1.6);
        // "//" on shortened branches
        ctx.strokeStyle = c.text;
        ctx.lineWidth = 1;
        nodePx.forEach(({ nd, x, y, broken }) => {
          if (!broken || nd.parent < 0) return;
          const mx = (nodePx[nd.parent].x + x) / 2;
          ctx.fillStyle = c.panel;
          ctx.fillRect(mx - 3, y - 4, 6, 8);
          ctx.beginPath();
          ctx.moveTo(mx - 4, y + 4);
          ctx.lineTo(mx - 1, y - 4);
          ctx.moveTo(mx + 1, y + 4);
          ctx.lineTo(mx + 4, y - 4);
          ctx.stroke();
        });
        // leaf ticks to the strips
        ctx.fillStyle = c.dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)";
        if (rh >= 3) nodePx.forEach(({ nd, x, y }) => nd.isLeaf && ctx.fillRect(x, y - 0.25, L.clade - x - 1, 0.5));
        if (nTree < n) {
          textRole(ctx, c, "caption");
          ctx.textAlign = "right";
          ctx.fillText(`${n - nTree} not on the tree`, L.treeW - 2, TOP + (nTree + (n - nTree) / 2) * rh);
        }
      }
      // clade and state strips
      rows.forEach((id, r) => {
        const cell = info.get(id) || {};
        const y = TOP + r * rh;
        const h = Math.max(1, rh - (rh >= 4 ? 0.5 : 0));
        ctx.fillStyle = cloneColors[cell.clone_id] || (isNormalClone(cell.clone_id) ? "#9e9e9e" : "#d9d9d9");
        ctx.fillRect(L.clade, y, STRIP, h);
        ctx.fillStyle = cell.state != null && cell.state !== "" ? stateColors[`${cell.state}`] || "#d9d9d9" : c.dark ? "#3a3a3a" : "#ededed";
        ctx.fillRect(L.state, y, STRIP, h);
      });
      // heatmaps (pre-rendered, scaled to the rows)
      if (snvImg?.canvas) {
        ctx.drawImage(snvImg.canvas, L.snvX, TOP, L.snvW, plotH);
        ctx.strokeStyle = c.grid;
        ctx.strokeRect(L.snvX + 0.5, TOP + 0.5, L.snvW - 1, plotH - 1);
      }
      if (cnImg?.canvas) {
        ctx.drawImage(cnImg.canvas, L.cnX, TOP, L.cnW, plotH);
        cnImg.ext.forEach(([a, b]) => {
          ctx.strokeStyle = c.grid;
          ctx.strokeRect(L.cnX + a + 0.5, TOP + 0.5, b - a - 1, plotH - 1);
        });
      }
      // per-amplicon copies as bars
      groupCn.forEach(({ g, vals, max }, k) => {
        const x0 = L.barsX + k * (L.barW + GAP);
        ctx.fillStyle = c.dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.025)";
        ctx.fillRect(x0, TOP, L.barW, plotH);
        ctx.fillStyle = geneSetColor(g.key);
        const bh = Math.max(1, rh * 0.82);
        for (let r = 0; r < n; r += 1) {
          const v = vals[r];
          if (!(v > 0)) continue;
          ctx.fillRect(x0, TOP + r * rh + (rh - bh) / 2, Math.max(1, (v / max) * (L.barW - 2)), bh);
        }
        ctx.strokeStyle = c.axis || c.grid;
        ctx.beginPath();
        ctx.moveTo(x0 + 0.5, TOP);
        ctx.lineTo(x0 + 0.5, TOP + plotH);
        ctx.stroke();
      });
      // shade cells outside the selection (data columns only), mark selected rows
      if (selMask) {
        ctx.fillStyle = c.dark ? "rgba(20,20,20,0.62)" : "rgba(255,255,255,0.66)";
        let r = 0;
        while (r < n) {
          if (selMask[r]) {
            r += 1;
            continue;
          }
          let e = r;
          while (e < n && !selMask[e]) e += 1;
          ctx.fillRect(L.clade, TOP + r * rh, width - L.clade, (e - r) * rh);
          r = e;
        }
        ctx.fillStyle = c.dark ? "#69b1ff" : "#1677ff";
        for (let k = 0; k < n; k += 1) if (selMask[k]) ctx.fillRect(L.clade - 3, TOP + k * rh, 2, Math.max(1, rh));
      }
      // top: gene markers over the CN panel; column heads
      textRole(ctx, c, "label", "text");
      if (cnImg) {
        // amplicon genes first; a label is dropped (marker kept) when it would overlap a placed one
        const ampGenes = new Set(shownGroups.flatMap((g) => g.genes || []));
        const placed = [];
        const marks = genes
          .map(({ name, g }) => {
            const ext = cnImg.ext.find(([, , d]) => g >= d[0] && g <= d[1]);
            if (!ext) return null;
            const [a, b, d] = ext;
            return { name, x: L.cnX + a + ((g - d[0]) / (d[1] - d[0])) * (b - a), amp: ampGenes.has(name) };
          })
          .filter(Boolean)
          .sort((u, v) => v.amp - u.amp);
        marks.forEach(({ name, x, amp }) => {
          ctx.fillStyle = amp ? c.text : c.muted;
          ctx.beginPath();
          ctx.moveTo(x - 4, TOP - 9);
          ctx.lineTo(x + 4, TOP - 9);
          ctx.lineTo(x, TOP - 3);
          ctx.closePath();
          ctx.fill();
          ctx.font = ctx.font.replace(/^(\d+ )?/, amp ? "italic 600 " : "italic 400 ");
          const w = ctx.measureText(name).width;
          const box = [x - w / 2 - 3, x + w / 2 + 3];
          if (placed.some(([l, r]) => box[0] < r && box[1] > l)) return textRole(ctx, c, "label", "text");
          placed.push(box);
          ctx.textAlign = "center";
          ctx.fillText(name, x, TOP - 17);
          textRole(ctx, c, "label", "text");
        });
      }
      // bottom: titles and axes
      const yb = TOP + plotH + 4;
      textRole(ctx, c, "tick");
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText("C", L.clade + STRIP / 2, yb);
      ctx.fillText("S", L.state + STRIP / 2, yb);
      if (snvImg) {
        textRole(ctx, c, "head");
        ctx.textBaseline = "top";
        ctx.textAlign = "center";
        ctx.fillText(fitText(ctx, `Whole-genome SNVs (${snvImg.nSites.toLocaleString()} sites)`, L.snvW), L.snvX + L.snvW / 2, yb + 14);
      }
      if (cnImg) {
        textRole(ctx, c, "tick");
        ctx.textBaseline = "top";
        cnImg.ext.forEach(([a, b, d]) => {
          const p0 = pickChrom(chromoBins, d[0]);
          const p1 = pickChrom(chromoBins, d[1]);
          if (!p0) return;
          ctx.textAlign = "left";
          ctx.fillText(mb(p0.pos), L.cnX + a + 1, yb);
          ctx.textAlign = "right";
          if (p1) ctx.fillText(`${mb(p1.pos)} Mb`, L.cnX + b - 1, yb);
          textRole(ctx, c, "head");
          ctx.textBaseline = "top";
          ctx.textAlign = "center";
          ctx.fillText(`chr${p0.chr}`, L.cnX + (a + b) / 2, yb + 14);
          textRole(ctx, c, "tick");
          ctx.textBaseline = "top";
        });
      }
      groupCn.forEach(({ g, max }, k) => {
        const x0 = L.barsX + k * (L.barW + GAP);
        textRole(ctx, c, "tick");
        ctx.textBaseline = "top";
        ctx.textAlign = "left";
        ctx.fillText("0", x0 + 1, yb);
        ctx.textAlign = "right";
        ctx.fillText(`${Math.round(max)}`, x0 + L.barW, yb);
        textRole(ctx, c, "head");
        ctx.textBaseline = "top";
        ctx.textAlign = "center";
        ctx.fillStyle = geneSetColor(g.key) === "#9B8AAE" ? c.textSecondary : geneSetColor(g.key);
        ctx.fillText(fitText(ctx, `ec${g.key}`, L.barW + GAP), x0 + L.barW / 2, yb + 14);
      });
      if (groupCn.length) {
        textRole(ctx, c, "caption");
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const xa = L.barsX;
        const xb = L.barsX + groupCn.length * (L.barW + GAP) - GAP;
        ctx.fillText("copies per cell", (xa + xb) / 2, yb + 30);
      }
      ctx.textBaseline = "middle";
      return [];
    },
    [tree, nodePx, selMask, n, nTree, rh, rows, info, cloneColors, stateColors, L, snvImg, cnImg, groupCn, plotH, width, genes, chromoBins, shownGroups]
  );

  const rowAt = (y) => {
    const r = Math.floor((y - TOP) / rh);
    return r >= 0 && r < n ? r : -1;
  };
  const hitTest = (x, y) => {
    if (tree && x < L.treeW + 2) {
      let best = null;
      let bd = 49;
      nodePx.forEach((p) => {
        if (p.nd.isLeaf) return;
        const d = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (d < bd) {
          bd = d;
          best = p;
        }
      });
      if (best) return { kind: "node", nd: best.nd };
    }
    const r = rowAt(y);
    if (r < 0) return null;
    return { kind: "row", r, id: rows[r], x };
  };
  const tooltip = (h) => {
    if (h.kind === "node") {
      const ids = leavesUnder(tree, h.nd.id);
      const clones = new Map();
      ids.forEach((id) => {
        const k = info.get(id)?.clone_id ?? "NA";
        clones.set(k, (clones.get(k) || 0) + 1);
      });
      return [`Clade of ${ids.length} cells`, ...[...clones.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => [k, v]), ["Click", "select these cells (Shift adds)"]];
    }
    const cell = info.get(h.id) || {};
    const lines = [h.id, ["Clone", cell.clone_id ?? "–"], ["State", cell.state ?? "–"]];
    groupCn.forEach(({ g, vals }) => lines.push([`ec${g.key}`, Number.isFinite(vals[h.r]) ? vals[h.r].toFixed(1) : "–"]));
    if (cnImg && h.x >= L.cnX && h.x < L.cnX + L.cnW) {
      const col = Math.floor(h.x - L.cnX);
      const g = cnImg.gOf[col];
      const row = cnImg.byId.get(h.id);
      if (Number.isFinite(g) && row) {
        const b = binAt(row.binIndex, g);
        const p = pickChrom(chromoBins, g);
        if (p) lines.push([`CN at chr${p.chr}:${(p.pos / 1e6).toFixed(2)} Mb`, b >= 0 ? row.values[b].toFixed(1) : "–"]);
      }
    }
    return lines;
  };
  const pick = (ids, label, event) => onSelect?.(ids, { label, mode: selectMode(event) });

  return (
    <div ref={ref}>
      <FigureCanvas
        width={width}
        height={height}
        draw={draw}
        hitTest={hitTest}
        tooltip={tooltip}
        ariaLabel={`${patient}: cells in tree order with clade, state, SNVs, region copy number and amplicon copies`}
        onClick={(h, event) => {
          if (h.kind === "node") {
            const ids = leavesUnder(tree, h.nd.id);
            pick(ids, `clade of ${ids.length} cells`, event);
          } else if (h.kind === "row") pick([h.id], h.id, event);
        }}
        onDragStart={(x) => (x >= L.clade - 4 ? { mode: "band-y", x0: L.clade, x1: width, y0: TOP, y1: TOP + plotH } : null)}
        onDragEnd={({ a, b }, event) => {
          const r0 = Math.max(0, rowAt(Math.min(a[1], b[1])) < 0 ? 0 : rowAt(Math.min(a[1], b[1])));
          const r1 = rowAt(Math.max(a[1], b[1])) < 0 ? n - 1 : rowAt(Math.max(a[1], b[1]));
          if (r1 >= r0) pick(rows.slice(r0, r1 + 1), `${r1 - r0 + 1} rows (brushed)`, event);
        }}
      />
      <CloneFigureLegend cells={cells} cloneColors={cloneColors} stateColors={stateColors} hasSnv={!!snvImg} hasCn={!!cnImg} noSnv={showSnv && !snv?.packed} />
    </div>
  );
}

/** Clade, state, VAF and copy-number keys under the clone figure (DOM, cheap). */
export function CloneFigureLegend({ cells, cloneColors, stateColors, hasSnv, hasCn, noSnv }) {
  const clones = [...new Set(cells.map((c) => c.clone_id).filter((v) => v != null))].sort((a, b) => `${a}`.localeCompare(`${b}`, undefined, { numeric: true }));
  const sw = (color) => <span className="sc-fig-swatch" style={{ background: color }} />;
  const cnStops = AMP_LEGEND.map((v, k) => `${ampliconCss(v)} ${(100 * k) / (AMP_LEGEND.length - 1)}%`).join(",");
  return (
    <div className="sc-fig-keys">
      <span className="sc-fig-key">
        <b>Clade</b>
        {clones.slice(0, 12).map((k) => (
          <span key={k}>
            {sw(cloneColors[k] || (isNormalClone(k) ? "#9e9e9e" : "#d9d9d9"))}
            {k}
          </span>
        ))}
        {clones.length > 12 && <span>+{clones.length - 12}</span>}
      </span>
      {Object.keys(stateColors).length > 0 && (
        <span className="sc-fig-key">
          <b>State</b>
          {Object.entries(stateColors).map(([k, col]) => (
            <span key={k}>
              {sw(col)}
              {k}
            </span>
          ))}
        </span>
      )}
      {hasSnv && (
        <span className="sc-fig-key">
          <b>VAF</b>
          <span className="sc-fig-ramp" style={{ background: "linear-gradient(90deg,#fff,#141414)" }} />
          <span>0 – 1</span>
        </span>
      )}
      {hasCn && (
        <span className="sc-fig-key">
          <b>CN</b>
          <span className="sc-fig-ramp" style={{ background: `linear-gradient(90deg,${cnStops})` }} />
          <span>{AMP_LEGEND.join(" · ")}</span>
        </span>
      )}
      {noSnv && <span className="sc-fig-key">No SNV matrix exported for this patient (snv_matrix.json), so the SNV panel is left out.</span>}
    </div>
  );
}
