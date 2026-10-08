import React from "react";

/**
 * A phylogeny drawn with the leaves along x (root at the top), to sit above
 * a matrix whose columns are cells in tree order. `layout` is a layoutTree()
 * result; `cellW` the column width; `height` the tree height in px.
 */
export default function TreeTop({ layout, cellW, height = 90, left = 0, leafClones = [], cloneColors = {}, selectedCols = null, hoverCol = null, onSelectRange, onHover }) {
  if (!layout) return null;
  const span = Math.max(layout.maxX, 1e-9);
  const y = (x) => 4 + (x / span) * (height - 8);
  const cx = (leaf) => left + (leaf + 0.5) * cellW;
  const nodeX = (n) => (cx(n.firstLeaf) + cx(n.lastLeaf)) / 2;
  const picked = (n) => selectedCols && selectedCols.size && Array.from({ length: n.lastLeaf - n.firstLeaf + 1 }, (_, i) => n.firstLeaf + i).every((c) => selectedCols.has(c));
  return (
    <g>
      {layout.nodes.map((n, k) => {
        const parent = n.parent >= 0 ? layout.nodes[n.parent] : null;
        const clone = n.isLeaf ? leafClones[n.firstLeaf] : null;
        const color = clone != null && cloneColors[clone] ? cloneColors[clone] : "#8c8c8c";
        const sel = picked(n);
        return (
          <g key={k} style={{ cursor: "pointer" }} onClick={(e) => onSelectRange && onSelectRange([n.firstLeaf, n.lastLeaf], e)} onMouseEnter={() => onHover && onHover(n)}>
            {parent && <line x1={nodeX(n)} x2={nodeX(n)} y1={y(parent.x)} y2={y(n.x)} stroke={sel ? "#1677ff" : color} strokeWidth={sel ? 2 : n.isLeaf ? 1 : 1.2} />}
            {!n.isLeaf && <line x1={nodeX(layout.nodes[n.children[0]])} x2={nodeX(layout.nodes[n.children[n.children.length - 1]])} y1={y(n.x)} y2={y(n.x)} stroke={sel ? "#1677ff" : "#8c8c8c"} strokeWidth={sel ? 2 : 1.2} />}
            {!n.isLeaf && <circle cx={nodeX(n)} cy={y(n.x)} r={3} fill="transparent" />}
          </g>
        );
      })}
      {hoverCol != null && <rect x={cx(hoverCol) - cellW / 2} y={0} width={Math.max(1, cellW)} height={height} fill="rgba(22,119,255,0.18)" pointerEvents="none" />}
    </g>
  );
}
