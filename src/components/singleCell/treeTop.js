import React, { memo } from "react";
import { selectedInRange, selectionPrefix } from "../../helpers/singleCell/matrixZoom";

/**
 * A phylogeny drawn with the leaves along x (root at the top), to sit above
 * a matrix whose columns are cells in tree order. `layout` is a layoutTree()
 * result; `cellW` the column width; `height` the tree height in px.
 * Memoised: pass stable callbacks so hovering elsewhere does not redraw it.
 */
function TreeTop({ layout, cellW, height = 90, left = 0, leafClones = [], cloneColors = {}, selectedCols = null, hoverCol = null, onSelectRange, onHover }) {
  if (!layout) return null;
  // node height by topology (edges to its deepest leaf; ids are pre-order), leaves on the bottom
  // line: with branch lengths a long trunk squashed every split below it into a few pixels
  const above = new Int32Array(layout.nodes.length);
  for (let k = layout.nodes.length - 1; k >= 0; k -= 1) {
    const n = layout.nodes[k];
    above[k] = n.isLeaf ? 0 : 1 + Math.max(...n.children.map((c) => above[c]));
  }
  const rootK = layout.nodes.findIndex((n) => n.parent < 0);
  const top = Math.max(1, above[rootK]);
  const y = (n) => 4 + (1 - above[n.id] / top) * (height - 8);
  const cx = (leaf) => left + (leaf + 0.5) * cellW;
  const nodeX = (n) => (cx(n.firstLeaf) + cx(n.lastLeaf)) / 2;
  // prefix counts: "whole clade selected" in O(1) per node instead of a scan of its leaves
  const prefix = selectedCols && selectedCols.size ? selectionPrefix(layout.nodes.reduce((m, n) => Math.max(m, n.lastLeaf + 1), 0), selectedCols) : null;
  const picked = (n) => Boolean(prefix) && selectedInRange(prefix, n.firstLeaf, n.lastLeaf) === n.lastLeaf - n.firstLeaf + 1;
  return (
    <g>
      {layout.nodes.map((n, k) => {
        const parent = n.parent >= 0 ? layout.nodes[n.parent] : null;
        const clone = n.isLeaf ? leafClones[n.firstLeaf] : null;
        const color = clone != null && cloneColors[clone] ? cloneColors[clone] : "#8c8c8c";
        const sel = picked(n);
        return (
          <g key={k} style={{ cursor: "pointer" }} onClick={(e) => onSelectRange && onSelectRange([n.firstLeaf, n.lastLeaf], e)} onMouseEnter={() => onHover && onHover(n)}>
            {parent && <line x1={nodeX(n)} x2={nodeX(n)} y1={y(parent)} y2={y(n)} stroke={sel ? "#1677ff" : color} strokeWidth={sel ? 2 : n.isLeaf ? 1 : 1.2} />}
            {!n.isLeaf && <line x1={nodeX(layout.nodes[n.children[0]])} x2={nodeX(layout.nodes[n.children[n.children.length - 1]])} y1={y(n)} y2={y(n)} stroke={sel ? "#1677ff" : "#8c8c8c"} strokeWidth={sel ? 2 : 1.2} />}
            {!n.isLeaf && <circle cx={nodeX(n)} cy={y(n)} r={3} fill="transparent" />}
          </g>
        );
      })}
      {hoverCol != null && <rect x={cx(hoverCol) - cellW / 2} y={0} width={Math.max(1, cellW)} height={height} fill="rgba(22,119,255,0.18)" pointerEvents="none" />}
    </g>
  );
}

export default memo(TreeTop);
