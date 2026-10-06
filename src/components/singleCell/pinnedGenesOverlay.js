import React, { useMemo } from "react";
import { useSelector } from "react-redux";
import { domainExtents } from "../../helpers/singleCell/matrix";

const DOMAIN_GAP = 50;

/**
 * Pinned genes as labelled vertical lines over a genomic area of `width`
 * pixels starting at `left` (the heatmap columns, or the cell tracks' plots),
 * using the same region layout as the genome plots.
 */
export default function PinnedGenesOverlay({ left, width, top = 0, bottom = 0, showLabels = true }) {
  const pinned = useSelector((state) => state.SingleCell.layout.pinnedGenes || []);
  const domains = useSelector((state) => state.Settings.domains);
  const { optionsList, genesStartPoint, genesEndPoint } = useSelector((state) => state.Genes);
  const indexOf = useMemo(() => new Map((optionsList || []).map((o) => [o.label, o.value])), [optionsList]);

  const marks = useMemo(() => {
    const extents = domainExtents(domains, width, DOMAIN_GAP);
    const out = [];
    pinned.forEach((gene) => {
      const i = indexOf.get(gene);
      if (i == null) return;
      const mid = (Number(genesStartPoint[i]) + Number(genesEndPoint[i])) / 2;
      extents.forEach(([px0, px1, d], k) => {
        if (mid < d[0] || mid > d[1]) return;
        out.push({ key: `${gene}-${k}`, gene, x: px0 + ((mid - d[0]) / (d[1] - d[0])) * (px1 - px0) });
      });
    });
    return out;
  }, [pinned, indexOf, genesStartPoint, genesEndPoint, domains, width]);

  if (!marks.length) return null;
  return (
    <div className="sc-pinned-overlay" style={{ left, width, top, bottom }}>
      {marks.map((m) => (
        <div key={m.key} className="sc-pinned-line" style={{ left: m.x }}>
          {showLabels && <span className="sc-pinned-label">{m.gene}</span>}
        </div>
      ))}
    </div>
  );
}
