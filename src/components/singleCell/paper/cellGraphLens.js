import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { Button, Typography } from "antd";
import { CloseOutlined, ExportOutlined } from "@ant-design/icons";
import GenomePlot from "../../genomePlot";
import { dataToGenome } from "../../../helpers/utility";
import { lensGraph, lensYMax, subgraphForWindows, windowsToDomains } from "../../../helpers/singleCell/paperCellGraph";
import { loadCellGraph } from "./genomeTrackLayer";

const { Text } = Typography;
// genome plot layout (components/genomePlot margins): stage inset gapX left / right, gap on top, 3 x gap in height
const GAP_X = 50;
const GAP = 24;

const genomeCache = new WeakMap(); // raw graph -> Map(key -> gOS genome)
function genomeFor(raw, chromoBins, wins) {
  let m = genomeCache.get(raw);
  if (!m || m.chromoBins !== chromoBins) {
    m = { chromoBins, byKey: new Map() };
    genomeCache.set(raw, m);
  }
  const key = JSON.stringify(wins);
  if (!m.byKey.has(key)) {
    if (m.byKey.size > 40) m.byKey.clear();
    m.byKey.set(key, dataToGenome(subgraphForWindows(raw, wins), chromoBins));
  }
  return m.byKey.get(key);
}

const fmtWin = (w) => `chr${w.chr}:${(w.from / 1e6).toFixed(3)}–${(w.to / 1e6).toFixed(3)} Mb`;

/**
 * One cell's genome graph for the paper lens, drawn by gOS's own genome plot (components/genomePlot: intervals at CN
 * with the CN axis, REF / ALT / loose connectors with the genome view's geometry, hover tooltips with JCN) on the
 * lens window(s), with the cell's coverage (CN units) behind it, and a link to the same cell and locus in the
 * Single-Cell genome view. wins: [{ chr, from, to }] (several for broken axes); href: that link.
 */
export default function CellGraphLens({ cell, patient, wins, width, height = 260, href, onClose }) {
  const dataset = useSelector((s) => s.Settings?.dataset);
  const chromoBins = useSelector((s) => s.Settings?.chromoBins);
  const [data, setData] = useState(null);
  const cvRef = useRef(null);
  const rootRef = useRef(null);
  // the page zooms the figure on wheel: inside the graph the wheel scrolls the page instead
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    const stop = (e) => e.stopPropagation();
    el.addEventListener("wheel", stop);
    return () => el.removeEventListener("wheel", stop);
  }, []);
  useEffect(() => {
    let live = true;
    setData(null);
    loadCellGraph(dataset, cell, chromoBins).then((d) => live && setData(d || { graph: null, coverage: null }));
    return () => {
      live = false;
    };
  }, [dataset, cell, chromoBins]);
  const winKey = JSON.stringify(wins);
  const domains = useMemo(() => windowsToDomains(chromoBins, wins), [chromoBins, winKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const covIn = useMemo(() => {
    const c = data?.coverage;
    if (!c || !domains.length) return { xs: [], ys: [] };
    const xs = [];
    const ys = [];
    for (let i = 0; i < c.dataPointsX.length; i += 1) {
      const x = c.dataPointsX[i];
      if (domains.some((d) => x >= d[0] && x <= d[1])) {
        xs.push(x);
        ys.push(c.dataPointsY1[i]);
      }
    }
    return { xs, ys };
  }, [data, domains]);
  const lg = useMemo(() => (data?.graph ? lensGraph(data.graph, wins) : null), [data, winKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const yMax = useMemo(() => lensYMax(lg?.segs || [], covIn.ys, wins), [lg, covIn, winKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const windowRangesY = useMemo(() => domains.map(() => [0, yMax]), [domains, yMax]);
  const genome = useMemo(() => (data?.graph && chromoBins ? genomeFor(data.graph, chromoBins, wins) : null), [data, chromoBins, winKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const plotH = height - 30;
  // coverage behind the plot, on the plot's own panels and CN scale
  useEffect(() => {
    const cv = cvRef.current;
    if (!cv || !domains.length) return;
    const pr = window.devicePixelRatio || 1;
    cv.width = Math.round(width * pr);
    cv.height = Math.round(plotH * pr);
    const ctx = cv.getContext("2d");
    ctx.setTransform(pr, 0, 0, pr, 0, 0);
    ctx.clearRect(0, 0, width, plotH);
    const stageW = width - 2 * GAP_X;
    const panelH = plotH - 3 * GAP;
    const panelW = (stageW - (domains.length - 1) * GAP_X) / domains.length;
    ctx.fillStyle = "rgba(70,70,70,0.5)";
    for (let i = 0; i < covIn.xs.length; i += 1) {
      const x = covIn.xs[i];
      const di = domains.findIndex((d) => x >= d[0] && x <= d[1]);
      if (di < 0) continue;
      const d = domains[di];
      const px = GAP_X + di * (panelW + GAP_X) + ((x - d[0]) / (d[1] - d[0])) * panelW;
      const py = GAP + panelH * (1 - Math.min(1, Math.max(0, covIn.ys[i] / yMax)));
      ctx.fillRect(px - 0.8, py - 0.8, 1.6, 1.6);
    }
  }, [covIn, domains, yMax, width, plotH]);
  const counts = lg ? `${lg.segs.length} intervals · ${lg.alts.length} junctions · ${lg.loose.length} loose ends in view` : "";
  return (
    <div ref={rootRef} className="sc-cellgraph-lens" style={{ width }}>
      <div className="sc-cellgraph-head">
        <Text strong style={{ fontSize: 12 }}>{cell}</Text>
        <Text type="secondary" style={{ fontSize: 11 }}>{`${patient ? `${patient} · ` : ""}${wins.map(fmtWin).join(" | ")}${counts ? ` · ${counts}` : ""} · CN axis 0–${yMax}`}</Text>
        <span style={{ flex: 1 }} />
        {href && (
          <a href={href} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>
            <ExportOutlined /> Open this cell at this locus in the genome view
          </a>
        )}
        {onClose && <Button size="small" type="text" icon={<CloseOutlined />} onClick={onClose} aria-label="close" />}
      </div>
      <div style={{ position: "relative", width, height: plotH }}>
        {!data && <Text type="secondary" style={{ position: "absolute", left: GAP_X, top: GAP, fontSize: 12 }}>Loading the cell's genome graph…</Text>}
        {data && !data.graph && <Text type="secondary" style={{ position: "absolute", left: GAP_X, top: GAP, fontSize: 12 }}>not available (no complex.json for this cell)</Text>}
        <canvas ref={cvRef} style={{ position: "absolute", left: 0, top: 0, width, height: plotH, pointerEvents: "none" }} />
        {genome && domains.length > 0 && (
          <div style={{ position: "absolute", left: 0, top: 0 }}>
            <GenomePlot width={width} height={plotH} genome={genome} localDomains={domains} windowRangesY={windowRangesY} yAxisTitle="CN" />
          </div>
        )}
      </div>
    </div>
  );
}
