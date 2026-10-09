import React, { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Card, InputNumber, Space, Typography } from "antd";
import useTreeView from "../useTreeView";
import useContainerWidth from "../useContainerWidth";
import singleCellActions from "../../../redux/singleCell/actions";
import { fishBands, fishClades } from "../../../helpers/singleCell/fishPlot";

const { Text } = Typography;

/**
 * Clone summary as a fish plot along molecular time: clades of the DNA tree
 * holding >= the chosen share of tumour cells, nested by ancestry. A band
 * opens where its founding branch starts (x = tree depth, SNV-scaled) and
 * reaches its sampled share of tumour cells where the branch ends. One time
 * point: order and nesting, not growth curves. Click a band to select its cells.
 */
export default function FishPlotCard() {
  const dispatch = useDispatch();
  const { cells, cloneColors } = useSelector((s) => s.SingleCell);
  const { treeLayout } = useTreeView();
  const [ref, width] = useContainerWidth(900);
  const [minPct, setMinPct] = useState(10);
  const [hover, setHover] = useState(null);
  const cloneOf = useMemo(() => new Map(cells.map((c) => [`${c.cell_id}`, c.clone_id ?? "unassigned"])), [cells]);
  const normals = useMemo(
    () => new Set(cells.filter((c) => /^normal$/i.test(`${c.clone_id || ""}`)).map((c) => `${c.cell_id}`)),
    [cells]
  );
  const clades = useMemo(
    () => fishClades(treeLayout, cloneOf, { minFrac: minPct / 100, exclude: normals }),
    [treeLayout, cloneOf, minPct, normals]
  );
  const bands = useMemo(() => fishBands(clades), [clades]);
  if (!treeLayout) return <Text type="secondary">No tree for this patient.</Text>;
  if (!clades.length) return <Text type="secondary">No tumour cells on the tree.</Text>;

  const h = 320;
  const m = { l: 16, r: 120, t: 12, b: 28 };
  const x0 = clades[0].start;
  const xMax = Math.max(...treeLayout.nodes.map((n) => n.x));
  const sx = (x) => m.l + ((x - x0) / (xMax - x0 || 1)) * (width - m.l - m.r);
  const sy = (y) => m.t + y * (h - m.t - m.b);
  const leavesOf = (c) => {
    const n = treeLayout.nodes[c.node];
    return treeLayout.leaves.slice(n.firstLeaf, n.lastLeaf + 1).filter((id) => !normals.has(`${id}`));
  };
  const shape = (i) => {
    const c = clades[i];
    const [y0, y1] = bands[i];
    const mid = (y0 + y1) / 2;
    const xs = sx(c.start);
    const xe = Math.max(sx(c.end), xs + 6);
    const xr = width - m.r;
    // tapered from a point at the founding branch's start to the full band at its end
    return `M${xs},${sy(mid)} C${(xs + xe) / 2},${sy(mid)} ${(xs + xe) / 2},${sy(y0)} ${xe},${sy(y0)} L${xr},${sy(y0)} L${xr},${sy(y1)} L${xe},${sy(y1)} C${(xs + xe) / 2},${sy(y1)} ${(xs + xe) / 2},${sy(mid)} ${xs},${sy(mid)} Z`;
  };
  return (
    <Card
      size="small"
      title="Clones along molecular time (fish plot)"
      ref={ref}
      extra={
        <Space size={4}>
          <Text style={{ fontSize: 12 }}>clades ≥</Text>
          <InputNumber size="small" min={1} max={50} value={minPct} onChange={(v) => v && setMinPct(v)} style={{ width: 64 }} />
          <Text style={{ fontSize: 12 }}>% of tumour cells</Text>
        </Space>
      }
    >
      <svg width={width} height={h} style={{ display: "block" }}>
        {clades.map((c, i) => (
          <path
            key={c.node}
            d={shape(i)}
            fill={cloneColors[c.clone] || "#999"}
            fillOpacity={hover === i ? 0.95 : 0.35 + 0.5 * Math.min(1, depthOf(clades, i) / 4)}
            stroke="#fff"
            strokeWidth={1}
            style={{ cursor: "pointer" }}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onClick={() => dispatch(singleCellActions.updateSelection(leavesOf(c)))}
          >
            <title>{`${c.n} tumour cells (${Math.round(100 * c.frac)}%) · mostly ${c.clone} · founded at depth ${c.start.toFixed(3)}–${c.end.toFixed(3)}`}</title>
          </path>
        ))}
        {clades.map((c, i) => (bands[i][1] - bands[i][0]) * (h - m.t - m.b) < 13 || (i > 0 && kidsOf(clades, i)) ? null : (
          <text key={`l${c.node}`} x={width - m.r + 6} y={sy((bands[i][0] + bands[i][1]) / 2) + 4} fontSize={11} fill="currentColor">
            {c.parent < 0 ? "all tumour" : `${c.clone} · ${c.n} (${Math.round(100 * c.frac)}%)`}
          </text>
        ))}
        <line x1={m.l} x2={width - m.r} y1={h - m.b + 4} y2={h - m.b + 4} stroke="currentColor" opacity={0.3} />
        <text x={m.l} y={h - 6} fontSize={11} fill="currentColor">
          tumour MRCA
        </text>
        <text x={width - m.r} y={h - 6} fontSize={11} textAnchor="end" fill="currentColor">
          molecular time (tree depth) → sampling
        </text>
      </svg>
      <Text type="secondary" style={{ fontSize: 11 }}>
        Bands nest by ancestry; height = share of tumour cells at sampling. The global cell filter and hidden clones apply.
      </Text>
    </Card>
  );
}

// a parent band is labelled only when it has no drawn children (their labels sit inside it)
function kidsOf(clades, i) {
  return clades.some((c) => c.parent === i);
}

function depthOf(clades, i) {
  let d = 0;
  for (let p = clades[i].parent; p >= 0; p = clades[p].parent) d += 1;
  return d;
}
