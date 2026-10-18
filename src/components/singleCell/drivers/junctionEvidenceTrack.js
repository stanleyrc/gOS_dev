import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { Alert, Button, Typography } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import { loadCellTrack } from "../../../redux/singleCell/loaders";
import { footprintLocation } from "../../../helpers/singleCell/complexZoom";
import { buildJunctionEvidence, evidenceSummary } from "../../../helpers/singleCell/junctionEvidence";

const { Text } = Typography;
const CELL_W = 6;
const ROW_H = 16;
const LABEL_W = 340;
const GAP = 14;
const COLORS = { nograph: "#d9d9d9", zero: "#f5f5f5", low: "#c9b6e4", high: "#7B4FA8" };
const cnColor = (cn, max) => {
  const t = Math.min(1, Math.max(0, cn / (max || 1)));
  const lerp = (a, b) => Math.round(a + (b - a) * t);
  return `rgb(${lerp(0xc9, 0x7b)},${lerp(0xb6, 0x4f)},${lerp(0xe4, 0xa8)})`;
};

/**
 * Junction evidence per cell: one row per junction of the event, one column per tumour cell (carriers, a gap, then
 * non-carriers; each in tree order). Colour = junction copy number from the cell's JaBbA graph (not a read count: no
 * per-cell split / discordant read count is exported). Hatched grey = no genome graph for the cell; pale = graph
 * present but the junction is not in it (0), with the breakpoint bin's CN in the tooltip so "no copies there" shows.
 */
export default function JunctionEvidenceTrack({ event, carriers, tumorIds, treeLayout }) {
  const dataset = useSelector((s) => s.Settings.dataset);
  const chromoBins = useSelector((s) => s.Settings.chromoBins);
  const location = useMemo(() => footprintLocation(event?.Genome_Location), [event]);
  const [graphs, setGraphs] = useState(null);
  const svgRef = useRef(null);
  const cellIds = useMemo(() => [...new Set([...(carriers || []), ...(tumorIds || [])])], [carriers, tumorIds]);
  useEffect(() => {
    let alive = true;
    setGraphs(null);
    if (!dataset || !cellIds.length) return undefined;
    Promise.all(cellIds.map((id) => loadCellTrack(dataset, id, "total", chromoBins).then((r) => [id, r.status === "ok" ? r.data : null]))).then((rows) => alive && setGraphs(new Map(rows)));
    return () => {
      alive = false;
    };
  }, [dataset, cellIds, chromoBins]);
  const ev = useMemo(() => (graphs ? buildJunctionEvidence({ location, carriers, cellIds, cellOrder: treeLayout?.leaves || [], graphs }) : null), [graphs, location, carriers, cellIds, treeLayout]);
  if (!location) return <Alert type="info" showIcon message="Junction evidence not available (cannot read the event footprint)." />;
  if (!cellIds.length) return <Alert type="info" showIcon message="Junction evidence not available (no carrier cells)." />;
  if (!ev) return <Text type="secondary">{`Loading ${cellIds.length} cell genome graphs...`}</Text>;
  if (!ev.rows.length) return <Alert type="info" showIcon message="Junction evidence not available (no junction shared by two carrier cells' genome graphs falls in the footprint)." />;
  const summary = evidenceSummary(ev);
  const nCar = ev.cells.filter((c) => c.carrier).length;
  const x = (j) => LABEL_W + j * CELL_W + (j >= nCar ? GAP : 0);
  const width = x(ev.cells.length) + 10;
  const height = 34 + ev.rows.length * ROW_H + 30;
  const max = Math.max(2, ...ev.values.flat().map((v) => v.cn || 0).filter((v) => v < 1e6));
  const exportSvg = () => {
    const node = svgRef.current;
    if (!node) return;
    const blob = new Blob([new XMLSerializer().serializeToString(node)], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `junction_evidence_${`${event.Variant || event.vartype || "event"}`.replace(/[^\w]+/g, "_")}.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div data-junction-evidence>
      <div style={{ marginBottom: 6 }}>
        <Text type="secondary">
          Junction copy number per tumour cell (JaBbA graph, not a read count: per-cell split / discordant read counts are not exported). Carriers left, non-carriers right, each in tree order. Hatched = no genome graph; pale = graph present, junction absent (tooltip shows the breakpoint bins' CN).
        </Text>{" "}
        <Button size="small" icon={<DownloadOutlined />} onClick={exportSvg}>Export SVG</Button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" width={width} height={height} style={{ fontFamily: "sans-serif", fontSize: 11 }}>
          <defs>
            <pattern id="je-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="4" height="4" fill="#eee" />
              <line x1="0" y1="0" x2="0" y2="4" stroke="#bbb" strokeWidth="1.5" />
            </pattern>
          </defs>
          <text x={LABEL_W} y={12} fontWeight="600">{`carriers (${nCar})`}</text>
          <text x={x(nCar)} y={12} fontWeight="600">{`non-carriers (${ev.cells.length - nCar})`}</text>
          {ev.cells.map((c, j) => (
            <rect key={c.id} x={x(j)} y={18} width={CELL_W - 1} height={6} fill={c.carrier ? "#7B4FA8" : "#8c8c8c"}>
              <title>{`${c.id} (${c.carrier ? "carrier" : "non-carrier"})`}</title>
            </rect>
          ))}
          {ev.rows.map((r, i) => {
            const sm = summary[i];
            return (
              <g key={r.key} transform={`translate(0,${30 + i * ROW_H})`}>
                <text x={LABEL_W - 6} y={11} textAnchor="end">
                  {`${r.breakpoints.join(" ↔ ").replace(/[+-](?= |$)/g, "")} (${sm.carrierHit}/${sm.carrierGraph} · ${sm.otherHit}/${sm.otherGraph})`}
                </text>
                {ev.cells.map((c, j) => {
                  const v = ev.values[i][j];
                  const fill = v.state === "nograph" ? "url(#je-hatch)" : v.state === "zero" ? COLORS.zero : cnColor(v.cn, max);
                  const tip = v.state === "nograph" ? "no genome graph for this cell" : v.state === "zero" ? `junction not in the graph (0); breakpoint bins CN ${v.binCn == null ? "n/a" : v.binCn}` : `junction CN ${v.cn}; breakpoint bins CN ${v.binCn == null ? "n/a" : v.binCn}`;
                  return (
                    <rect key={c.id} x={x(j)} y={0} width={CELL_W - 1} height={ROW_H - 2} fill={fill} stroke={v.state === "zero" ? "#e0e0e0" : "none"} strokeWidth={0.5}>
                      <title>{`${c.id} (${c.carrier ? "carrier" : "non-carrier"}) · ${r.breakpoints.join(" ↔ ")} · ${tip}`}</title>
                    </rect>
                  );
                })}
              </g>
            );
          })}
          <text x={4} y={height - 6} fill="#666">row label: (carriers with junction / carriers with graph · non-carriers with / with graph)</text>
        </svg>
      </div>
    </div>
  );
}
