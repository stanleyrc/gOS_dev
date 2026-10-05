import React, { useEffect, useMemo, useRef } from "react";

const PAD_LEFT = 6;
const PAD_RIGHT = 4;
const HIT_RADIUS = 7;

/**
 * Rectangular phylogeny drawn on canvas, rows aligned with the heatmap.
 * layout: output of layoutTree (leaf rows 0..leaves-1); nRows may exceed the
 * number of leaves when some cells are not in the tree (drawn as empty rows).
 * Branches whose leaves all share a clone take that clone's colour.
 * Drawn at device resolution (pixelRatio); hoverRow and selectedRows mark
 * leaves picked in any linked view (heatmap, cell browser, UMAP).
 */
export default function PhylogenyCanvas({
  layout,
  nRows,
  width,
  height,
  leafClones = [],
  cloneColors = {},
  selectedLeafRange = null,
  selectedRows = null,
  hoverRow = null,
  pixelRatio = 1,
  onSelectRange,
  onHoverNode,
}) {
  const ref = useRef(null);

  const nodeClones = useMemo(() => {
    if (!layout) return [];
    const out = new Array(layout.nodes.length).fill(null);
    for (let k = layout.nodes.length - 1; k >= 0; k -= 1) {
      const n = layout.nodes[k];
      if (n.isLeaf) {
        out[k] = leafClones[n.firstLeaf] ?? null;
      } else {
        const first = out[n.children[0]];
        out[k] =
          first != null && n.children.every((c) => out[c] === first)
            ? first
            : null;
      }
    }
    return out;
  }, [layout, leafClones]);

  const geometry = useMemo(() => {
    if (!layout || !nRows) return null;
    const rowH = height / nRows;
    const span = Math.max(layout.maxX, 1e-9);
    const usable = Math.max(1, width - PAD_LEFT - PAD_RIGHT);
    return {
      px: (x) => PAD_LEFT + (x / span) * usable,
      py: (y) => (y + 0.5) * rowH,
    };
  }, [layout, nRows, width, height]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !layout || !geometry) return;
    canvas.width = Math.floor(width * pixelRatio);
    canvas.height = Math.floor(height * pixelRatio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const { px, py } = geometry;

    if (selectedLeafRange) {
      ctx.fillStyle = "rgba(24,144,255,0.12)";
      const y0 = (selectedLeafRange[0] * height) / nRows;
      const y1 = ((selectedLeafRange[1] + 1) * height) / nRows;
      ctx.fillRect(0, y0, width, y1 - y0);
    }

    const lineWidth = nRows > 400 ? 0.6 : 1;
    ctx.lineWidth = lineWidth;
    layout.nodes.forEach((n, k) => {
      const color = nodeClones[k] != null ? cloneColors[nodeClones[k]] : null;
      ctx.strokeStyle = color || "#8c8c8c";
      if (n.parent >= 0) {
        const parent = layout.nodes[n.parent];
        ctx.beginPath();
        ctx.moveTo(px(parent.x), py(n.y));
        ctx.lineTo(px(n.x), py(n.y));
        ctx.stroke();
      }
      if (!n.isLeaf) {
        const first = layout.nodes[n.children[0]];
        const last = layout.nodes[n.children[n.children.length - 1]];
        ctx.beginPath();
        ctx.moveTo(px(n.x), py(first.y));
        ctx.lineTo(px(n.x), py(last.y));
        ctx.stroke();
      }
    });

    // Selected and hovered leaves: a dot at the tip, plus a row band for hover.
    const leafX = new Map();
    layout.nodes.forEach((n) => n.isLeaf && leafX.set(n.firstLeaf, px(n.x)));
    const dot = (row, color, r) => {
      if (!leafX.has(row)) return;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(leafX.get(row), py(row), r, 0, 2 * Math.PI);
      ctx.fill();
    };
    const rowH = height / nRows;
    const dotR = Math.max(1.5, Math.min(3, rowH / 2));
    if (selectedRows) selectedRows.forEach((row) => dot(row, "#1677ff", dotR));
    if (hoverRow != null && hoverRow >= 0) {
      ctx.fillStyle = "rgba(22,119,255,0.18)";
      ctx.fillRect(0, hoverRow * rowH, width, Math.max(1, rowH));
      dot(hoverRow, "#fa541c", dotR + 1);
    }
  }, [layout, geometry, nodeClones, cloneColors, width, height, nRows, selectedLeafRange, selectedRows, hoverRow, pixelRatio]);

  const nodeAt = (event) => {
    const canvas = ref.current;
    if (!canvas || !geometry || !layout) return null;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let best = null;
    let bestD = HIT_RADIUS;
    layout.nodes.forEach((n) => {
      if (n.isLeaf) return;
      const d = Math.hypot(geometry.px(n.x) - x, geometry.py(n.y) - y);
      if (d <= bestD) {
        bestD = d;
        best = n;
      }
    });
    if (best) return best;
    // Otherwise the leaf on this row, if the row belongs to the tree.
    const row = Math.floor((y / height) * nRows);
    return layout.nodes.find((n) => n.isLeaf && n.firstLeaf === row) || null;
  };

  if (!layout) return <div style={{ width, height }} />;

  return (
    <canvas
      ref={ref}
      style={{ display: "block", width, height, cursor: "pointer" }}
      onClick={(e) => {
        const n = nodeAt(e);
        if (n && onSelectRange) onSelectRange([n.firstLeaf, n.lastLeaf], e);
      }}
      onMouseMove={(e) => onHoverNode && onHoverNode(nodeAt(e), e)}
      onMouseLeave={() => onHoverNode && onHoverNode(null)}
    />
  );
}
