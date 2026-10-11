import React, { useCallback, useMemo } from "react";
import { useSelector } from "react-redux";
import FigureCanvas, { fitText } from "./figureCanvas";
import { textRole } from "./figureKit";
import useContainerWidth from "../useContainerWidth";
import { variantNesting, walkDomains } from "../../../helpers/singleCell/figureMath";
import { selectMode } from "./cellSelection";

const ROW = 30;
const TOP = 8;
const LEFT = 26;
const RIGHT = 190;

/**
 * Fig 4C, live: the ecDNA variants of one amplicon family as a derivation
 * tree. Circular walks are rings over the genome axis (segments as thick
 * blocks on the ring), linear walks bars with their junction arcs (e.g. the
 * excision scar); each row is indented under the smallest walk that holds
 * it. Click a variant to focus it everywhere and select its carriers.
 */
export default function VariantTree({ family = [], order = [], colorOf, focusId, onFocus, onSelect, events = [] }) {
  const [ref, measured] = useContainerWidth(700);
  const width = Math.max(420, measured);
  const chromoBins = useSelector((s) => s.Settings.chromoBins);
  const { parent, depth, order: rows } = useMemo(() => variantNesting(family), [family]);
  const domains = useMemo(() => walkDomains(family, chromoBins, { pad: 2e5, frac: 0.06 }), [family, chromoBins]);
  const carriers = useMemo(() => family.map((w) => order.filter((id) => (Number(w.cells?.[id]) || 0) >= 1)), [family, order]);
  const maxDepth = Math.max(0, ...Array.from(depth));
  const x0 = LEFT + 14 * maxDepth + 12;
  const x1 = width - RIGHT;
  const gap = 10;
  const ext = useMemo(() => {
    const share = (x1 - x0 - gap * Math.max(0, domains.length - 1)) / Math.max(1, domains.length);
    return domains.map((d, k) => [x0 + k * (share + gap), x0 + k * (share + gap) + share, d]);
  }, [domains, x0, x1]);
  const gx = useCallback(
    (chr, pos) => {
      const b = chromoBins?.[`${chr}`.replace(/^chr/, "")];
      if (!b) return null;
      const g = b.startPlace + pos;
      const e = ext.find(([, , d]) => g >= d[0] - 1 && g <= d[1] + 1);
      return e ? e[0] + ((g - e[2][0]) / (e[2][1] - e[2][0])) * (e[1] - e[0]) : null;
    },
    [chromoBins, ext]
  );
  const genes = useMemo(() => {
    const amp = new Set(family.flatMap((w) => w.driver_genes || []));
    const seen = new Set();
    return events
      .filter((e) => amp.has(`${e.gene}`) && Number.isFinite(Number(e.start)))
      .filter((e) => (seen.has(e.gene) ? false : seen.add(e.gene)))
      .map((e) => ({ gene: e.gene, x: gx(e.seqnames, (Number(e.start) + (Number(e.end) || Number(e.start))) / 2) }))
      .filter((g) => g.x != null);
  }, [events, family, gx]);
  const height = TOP + (rows.length + 1) * ROW + 30;

  const draw = useCallback(
    (ctx, c) => {
      // derivation elbows
      ctx.strokeStyle = c.muted;
      ctx.lineWidth = 1;
      rows.forEach((i, k) => {
        const p = parent[i];
        if (p < 0) return;
        const kp = rows.indexOf(p);
        const xp = LEFT + 14 * depth[p] + 4;
        const yp = TOP + kp * ROW + ROW / 2;
        const y = TOP + k * ROW + ROW / 2;
        const xc = LEFT + 14 * depth[i];
        ctx.beginPath();
        ctx.moveTo(xp, yp + 5);
        ctx.lineTo(xp, y);
        ctx.lineTo(xc, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(xc, y);
        ctx.lineTo(xc - 4, y - 3);
        ctx.lineTo(xc - 4, y + 3);
        ctx.closePath();
        ctx.fillStyle = c.muted;
        ctx.fill();
      });
      rows.forEach((i, k) => {
        const w = family[i];
        const y = TOP + k * ROW + ROW / 2;
        const col = colorOf(w.id);
        const focus = w.id === `${focusId}`;
        if (focus) {
          ctx.fillStyle = c.selectFill;
          ctx.fillRect(0, y - ROW / 2 + 1, width, ROW - 2);
        }
        const segs = (w.nodes || [])
          .map((nd) => [gx(nd.chromosome, Math.min(nd.start, nd.end)), gx(nd.chromosome, Math.max(nd.start, nd.end))])
          .filter(([a, b]) => a != null && b != null);
        if (!segs.length) return;
        const xa = Math.min(...segs.map((s) => s[0]));
        const xb = Math.max(...segs.map((s) => s[1]));
        const circ = `${w.circular}`.toLowerCase() === "true";
        ctx.strokeStyle = col;
        ctx.lineWidth = focus ? 2 : 1.3;
        if (circ) {
          // ring: an ellipse around the walk's extent, segments on its upper edge
          ctx.beginPath();
          ctx.ellipse((xa + xb) / 2, y + 2, Math.max(6, (xb - xa) / 2 + 4), 8, 0, 0, 2 * Math.PI);
          ctx.stroke();
          ctx.fillStyle = col;
          segs.forEach(([a, b]) => ctx.fillRect(a, y - 9, Math.max(2, b - a), 5));
        } else {
          ctx.beginPath();
          ctx.moveTo(xa, y + 2);
          ctx.lineTo(xb, y + 2);
          ctx.stroke();
          ctx.fillStyle = col;
          segs.forEach(([a, b]) => ctx.fillRect(a, y - 1, Math.max(2, b - a), 6));
          // junction arcs between consecutive segments (scar / rearrangement)
          ctx.strokeStyle = "#d32f2f";
          ctx.lineWidth = 1.4;
          for (let s = 1; s < segs.length; s += 1) {
            const from = segs[s - 1][1];
            const to = segs[s][0];
            ctx.beginPath();
            ctx.moveTo(from, y - 1);
            ctx.quadraticCurveTo((from + to) / 2, y - 14, to, y - 1);
            ctx.stroke();
          }
        }
        ctx.lineWidth = 1;
        textRole(ctx, c, "label", "text");
        ctx.font = ctx.font.replace(/^(\d+ )?/, focus ? "700 " : "500 ");
        ctx.fillStyle = col;
        ctx.textAlign = "left";
        ctx.fillText(fitText(ctx, w.label || w.name || `walk ${w.id}`, RIGHT - 70), x1 + 12, y);
        textRole(ctx, c, "tick", "textSecondary");
        ctx.textAlign = "right";
        ctx.fillText(`${carriers[i].length} cells`, width - 4, y);
      });
      // reference and genes
      const yr = TOP + rows.length * ROW + ROW / 2;
      ext.forEach(([a, b]) => {
        ctx.fillStyle = c.dark ? "#5a5a5a" : "#bdbdbd";
        ctx.fillRect(a, yr - 2, b - a, 5);
      });
      textRole(ctx, c, "label", "textSecondary");
      ctx.textAlign = "left";
      ctx.fillText("Ref", x1 + 12, yr);
      genes.forEach(({ gene, x }) => {
        ctx.fillStyle = c.text;
        ctx.beginPath();
        ctx.moveTo(x - 4, yr + 12);
        ctx.lineTo(x + 4, yr + 12);
        ctx.lineTo(x, yr + 6);
        ctx.closePath();
        ctx.fill();
        textRole(ctx, c, "label", "text");
        ctx.font = ctx.font.replace(/^(\d+ )?/, "italic 600 ");
        ctx.textAlign = "center";
        ctx.fillText(gene, x, yr + 21);
      });
      return rows.map((i, k) => ({ x0: 0, x1: width, y0: TOP + k * ROW, y1: TOP + (k + 1) * ROW, i }));
    },
    [rows, parent, depth, family, colorOf, focusId, gx, x1, width, carriers, ext, genes]
  );
  if (!family.length) return <div ref={ref} />;
  return (
    <div ref={ref}>
      <FigureCanvas
        width={width}
        height={height}
        draw={draw}
        ariaLabel="ecDNA variants of the amplicon family as a derivation tree"
        tooltip={(h) => {
          const w = family[h.i];
          const span = (w.nodes || []).reduce((s, nd) => s + Math.abs(nd.end - nd.start), 0);
          return [w.label || w.name || `walk ${w.id}`, ["Carriers", `${carriers[h.i].length} cells`], ["Structure", `${`${w.circular}`.toLowerCase() === "true" ? "circular" : "linear"} · ${(w.nodes || []).length} segments · ${(span / 1e6).toFixed(2)} Mb`], ["Derived from", parent[h.i] >= 0 ? family[parent[h.i]].label || `walk ${family[parent[h.i]].id}` : "–"], ["Click", "focus and select carriers"]];
        }}
        onClick={(h, event) => {
          const w = family[h.i];
          onFocus?.(w.id);
          onSelect?.(carriers[h.i], { label: `${w.label || "walk " + w.id} carriers`, mode: selectMode(event) });
        }}
      />
    </div>
  );
}
