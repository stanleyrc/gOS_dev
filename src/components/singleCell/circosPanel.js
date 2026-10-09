import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Card, Empty, InputNumber, Progress, Segmented, Space, Switch, Typography } from "antd";
import { RadarChartOutlined } from "@ant-design/icons";
import useContainerWidth from "./useContainerWidth";
import usePixelRatio from "./usePixelRatio";
import useTreeView from "./useTreeView";
import PhylogenyCanvas from "./phylogenyCanvas";
import SvgExportButton from "./svgExportButton";
import singleCellActions from "../../redux/singleCell/actions";
import { casePath, tryGet } from "../../redux/singleCell/loaders";
import { cnColorer } from "../../helpers/singleCell/matrix";
import { medianCnRow } from "../../helpers/singleCell/cellFiles";
import HintLine from "./hintLine";
import usePlotTheme from "./usePlotTheme";

const { Text } = Typography;
const genomeCache = new Map();
const MAX_RINGS = 6;
const MAX_CLONE_CELLS = 60;
const TREE_WIDTH = 230;
const CHR_COLORS = d3.scaleOrdinal([...d3.schemeTableau10, ...d3.schemeSet3]);
const JUNCTION_COLORS = { TRA: "#7B3294", INV: "#E6AB02", DEL: "#2C7BB6", DUP: "#D7191C", other: "#1B9E77" };

async function loadGenome(dataset, cellId) {
  const key = `${dataset.id}/${cellId}`;
  if (!genomeCache.has(key)) {
    const r = await tryGet(casePath(dataset, cellId, "complex.json"));
    genomeCache.set(key, r.status === "ok" ? r.data : null);
  }
  return genomeCache.get(key);
}

/** Breakpoint pairs of a genome graph's ALT junctions in global coordinates. */
function junctionsOf(genome, toPlace) {
  if (!genome) return [];
  const byIid = new Map((genome.intervals || []).map((i) => [i.iid, i]));
  const endOf = (iid) => {
    const i = byIid.get(Math.abs(iid));
    if (!i) return null;
    return { chr: i.chromosome, pos: iid < 0 ? i.startPoint : i.endPoint, place: toPlace(i.chromosome, iid < 0 ? i.startPoint : i.endPoint) };
  };
  return (genome.connections || [])
    .filter((c) => c.type === "ALT")
    .map((c) => {
      const a = endOf(c.source);
      const b = endOf(c.sink);
      if (!a || !b || a.place == null || b.place == null) return null;
      const kind = a.chr !== b.chr ? "TRA" : /INV/i.test(c.title) ? "INV" : /DEL/i.test(c.title) ? "DEL" : /DUP/i.test(c.title) ? "DUP" : "other";
      return { a, b, kind, title: c.title, key: `${a.chr}:${Math.round(a.pos / 1e4)}-${b.chr}:${Math.round(b.pos / 1e4)}` };
    })
    .filter(Boolean);
}

/**
 * Circos next to the phylogeny. Rings are either the selected cells (click
 * cells / clades in the tree, up to 6) or pseudobulk clones (median CN of
 * the clone's cells; junctions shared by several of its cells, line width
 * = recurrence). Outer ring: chromosomes with 50 Mb ticks; inner rings: CN
 * in the heatmap palette; centre: junction arcs by type.
 */
export default function CircosPanel() {
  const pt = usePlotTheme();
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const { cells, cn, selectedCellIds, hoveredCellId, cloneColors, palette } = useSelector((s) => s.SingleCell);
  const { chromoBins, genomeLength, dataset } = useSelector((s) => s.Settings);
  const { order, treeLayout, cellById } = useTreeView();
  const pixelRatio = usePixelRatio();
  const [ref, width] = useContainerWidth(1100);
  const [mode, setMode] = useState("cells");
  const [showCn, setShowCn] = useState(true);
  const [minShare, setMinShare] = useState(0.2);
  const [junctionData, setJunctionData] = useState({});
  const [progress, setProgress] = useState(null);
  const [hoverRange, setHoverRange] = useState(null);

  const chromosomes = useMemo(() => Object.keys(chromoBins || {}), [chromoBins]);
  const toPlace = (chr, pos) => (chromoBins[chr] ? chromoBins[chr].startPlace + pos - chromoBins[chr].startPoint : null);
  const cnRowOf = useMemo(() => {
    const m = new Map();
    if (cn.status === "ok" && cn.data) cn.data.cells.forEach((id, k) => m.set(id, cn.data.rows[k]));
    return m;
  }, [cn]);

  // ring sources
  const sources = useMemo(() => {
    if (mode === "cells") {
      const ids = (selectedCellIds.length ? selectedCellIds : order.slice(0, 1)).slice(0, MAX_RINGS);
      return ids.map((id) => ({ key: id, label: id, color: cloneColors[cellById.get(id)?.clone_id] || "#8c8c8c", cellIds: [id], row: cnRowOf.get(id) || null }));
    }
    const byClone = new Map();
    cells.forEach((c) => {
      if (c.clone_id == null || /^normal$/i.test(`${c.clone_id}`)) return;
      if (!byClone.has(c.clone_id)) byClone.set(c.clone_id, []);
      byClone.get(c.clone_id).push(c.cell_id);
    });
    return [...byClone.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, MAX_RINGS)
      .map(([clone, ids]) => ({
        key: `clone:${clone}`,
        label: `${clone} (${ids.length})`,
        color: cloneColors[clone] || "#8c8c8c",
        cellIds: ids,
        row: medianCnRow(ids.map((id) => cnRowOf.get(id)).filter(Boolean), chromoBins),
      }));
  }, [mode, selectedCellIds, order, cells, cloneColors, cellById, cnRowOf, chromoBins]);

  // junctions per source (fetch complex.json of the cells, capped per clone)
  const sourcesKey = sources.map((s) => `${s.key}:${s.cellIds.length}`).join("|");
  useEffect(() => {
    if (!dataset || !sources.length) return undefined;
    let active = true;
    (async () => {
      const out = {};
      let done = 0;
      const total = sources.reduce((s, src) => s + Math.min(MAX_CLONE_CELLS, src.cellIds.length), 0);
      setProgress(0);
      for (const src of sources) {
        const ids = src.cellIds.slice(0, MAX_CLONE_CELLS);
        const counts = new Map();
        for (let i = 0; i < ids.length; i += 4) {
          // eslint-disable-next-line no-await-in-loop
          const genomes = await Promise.all(ids.slice(i, i + 4).map((id) => loadGenome(dataset, id)));
          genomes.forEach((g) => {
            const seen = new Set();
            junctionsOf(g, toPlace).forEach((j) => {
              if (seen.has(j.key)) return;
              seen.add(j.key);
              const cur = counts.get(j.key) || { ...j, n: 0 };
              cur.n += 1;
              counts.set(j.key, cur);
            });
          });
          done += genomes.length;
          if (!active) return;
          setProgress(Math.round((100 * done) / Math.max(1, total)));
        }
        out[src.key] = { junctions: [...counts.values()], nCells: ids.length };
      }
      if (!active) return;
      setJunctionData(out);
      setProgress(null);
    })().catch(() => active && setProgress(null));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourcesKey, dataset]);

  /* ---- geometry ---- */
  const size = Math.min(Math.max(480, width - TREE_WIDTH - 40), 880);
  const R = size / 2;
  const total = genomeLength || d3.max(chromosomes, (c) => chromoBins[c].endPlace) || 1;
  const gap = 0.012;
  const angle = useMemo(() => (place) => {
    const k = chromosomes.findIndex((c) => place >= chromoBins[c].startPlace && place <= chromoBins[c].endPlace);
    return -Math.PI / 2 + (place / total) * (2 * Math.PI - gap * chromosomes.length) + gap * (Math.max(0, k) + 0.5);
  }, [chromosomes, chromoBins, total]);
  const arc = (a0, a1, r0, r1) => d3.arc()({ innerRadius: r0, outerRadius: r1, startAngle: a0 + Math.PI / 2, endAngle: a1 + Math.PI / 2 });
  const color = useMemo(() => cnColorer(palette, "total"), [palette]);
  const rgb = (packed) => `rgb(${packed & 255},${(packed >> 8) & 255},${(packed >> 16) & 255})`;
  const ideo = [R - 34, R - 18];
  const ringW = showCn ? Math.min(42, Math.max(16, (R - 110) / Math.max(1, sources.length))) : 0;
  const ringR = (i) => [ideo[0] - 8 - (i + 1) * ringW, ideo[0] - 8 - i * ringW - 3];
  const innerR = ideo[0] - 12 - sources.length * ringW;
  if (!chromosomes.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />;

  const nRows = order.length;
  const rowOf = new Map(order.map((id, i) => [id, i]));
  const selectedRows = new Set(selectedCellIds.map((id) => rowOf.get(id)).filter((r) => r != null));
  const leafClones = order.map((id) => cellById.get(id)?.clone_id ?? null);
  const treeHeight = Math.max(360, Math.min(size, nRows * 4));

  return (
    <Card
      size="small"
      title={<Space><RadarChartOutlined />{t("components.single-cell.circos.title2")}</Space>}
      extra={
        <Space wrap>
          <Segmented size="small" value={mode} onChange={setMode} options={[{ value: "cells", label: t("components.single-cell.circos.mode-cells") }, { value: "clones", label: t("components.single-cell.circos.mode-clones") }]} />
          {mode === "clones" && (
            <Space size={4}>
              <Text type="secondary">{t("components.single-cell.circos.min-share")}</Text>
              <InputNumber size="small" min={0} max={1} step={0.1} value={minShare} onChange={(v) => setMinShare(v ?? 0)} style={{ width: 70 }} />
            </Space>
          )}
          <Switch size="small" checked={showCn} onChange={setShowCn} />
          <Text>{t("components.single-cell.circos.cn-ring")}</Text>
          <SvgExportButton containerRef={ref} name="circos" />
        </Space>
      }
    >
      <div ref={ref} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        {treeLayout && (
          <div style={{ flex: "none" }}>
            <HintLine text={t("components.single-cell.circos.tree-help")} />
            <PhylogenyCanvas
              layout={treeLayout}
              nRows={nRows}
              width={TREE_WIDTH}
              height={treeHeight}
              pixelRatio={pixelRatio}
              leafClones={leafClones}
              cloneColors={cloneColors}
              selectedRows={selectedRows}
              hoverRow={hoveredCellId != null && rowOf.has(hoveredCellId) ? rowOf.get(hoveredCellId) : null}
              hoverRange={hoverRange}
              onSelectRange={([a, b], e) => {
                const ids = order.slice(a, b + 1);
                dispatch(singleCellActions.updateSelection(e.metaKey || e.ctrlKey || e.shiftKey ? [...selectedCellIds, ...ids] : ids));
                setMode("cells");
              }}
              onHoverNode={(node) => {
                setHoverRange(node && !node.isLeaf ? [node.firstLeaf, node.lastLeaf] : null);
                dispatch(singleCellActions.updateHover(node && node.isLeaf ? order[node.firstLeaf] : null));
              }}
            />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          {progress != null && <Progress percent={progress} size="small" style={{ width: 240 }} />}
          <svg width={size} height={size} style={{ display: "block", margin: "0 auto" }}>
            <defs>
              <radialGradient id="circos-bg" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={pt.panel} stopOpacity={0} />
                <stop offset="100%" stopColor={pt.empty} stopOpacity={pt.mode === "dark" ? 0.35 : 0.6} />
              </radialGradient>
            </defs>
            <g transform={`translate(${R},${R})`}>
              <circle r={ideo[0]} fill="url(#circos-bg)" />
              {chromosomes.map((chr, i) => {
                const c = chromoBins[chr];
                const a0 = angle(c.startPlace);
                const a1 = angle(c.endPlace);
                const mid = (a0 + a1) / 2;
                const ticks = d3.range(0, c.endPoint - c.startPoint, 5e7).slice(1);
                return (
                  <g key={chr}>
                    <path d={arc(a0, a1, ideo[0], ideo[1])} fill={CHR_COLORS(i)} fillOpacity={0.85} stroke="#fff" strokeWidth={0.8} />
                    {ticks.map((tk) => {
                      const a = angle(c.startPlace + tk);
                      return <line key={tk} x1={Math.cos(a) * ideo[1]} y1={Math.sin(a) * ideo[1]} x2={Math.cos(a) * (ideo[1] + 4)} y2={Math.sin(a) * (ideo[1] + 4)} stroke="#595959" strokeWidth={0.8} />;
                    })}
                    <text x={Math.cos(mid) * (R - 6)} y={Math.sin(mid) * (R - 6)} dy="0.35em" textAnchor="middle" fontSize={11} fontWeight={600} fill="#262626" transform={`rotate(${(mid * 180) / Math.PI + 90} ${Math.cos(mid) * (R - 6)} ${Math.sin(mid) * (R - 6)})`}>
                      {chr}
                    </text>
                  </g>
                );
              })}
              {showCn &&
                sources.map((src, i) => {
                  const [r0, r1] = ringR(i);
                  const row = src.row;
                  const y = d3.scaleLinear().domain([0, 6]).range([r0, r1]).clamp(true);
                  return (
                    <g key={src.key}>
                      <circle r={(r0 + r1) / 2} fill="none" stroke={src.color} strokeWidth={r1 - r0} strokeOpacity={0.08} />
                      <circle r={y(2)} fill="none" stroke="#bfbfbf" strokeWidth={0.6} strokeDasharray="2 3" />
                      {row &&
                        d3.range(row.binIndex.n).map((b) => {
                          const v = row.values[b];
                          if (!Number.isFinite(v)) return null;
                          const g0 = row.binIndex.gStart[b];
                          const g1 = row.binIndex.gEnd[b];
                          return <path key={b} d={arc(angle(g0), angle(Math.max(g1, g0 + 1)), r0, y(v))} fill={rgb(color(v))} />;
                        })}
                      <text x={-R + 8} y={-(r0 + r1) / 2 + 3} fontSize={10} fill={src.color} style={{ pointerEvents: "none" }} />
                    </g>
                  );
                })}
              {sources.map((src) => {
                const data = junctionData[src.key];
                if (!data) return null;
                const shown = mode === "clones" ? data.junctions.filter((j) => j.n / Math.max(1, data.nCells) >= minShare) : data.junctions;
                return shown.map((j) => {
                  const r = innerR - 2;
                  const [x0, y0] = [Math.cos(angle(j.a.place)) * r, Math.sin(angle(j.a.place)) * r];
                  const [x1, y1] = [Math.cos(angle(j.b.place)) * r, Math.sin(angle(j.b.place)) * r];
                  const dist = Math.hypot(x1 - x0, y1 - y0);
                  const pull = Math.min(0.92, dist / (2 * r));
                  const [cx, cy] = [((x0 + x1) / 2) * (1 - pull), ((y0 + y1) / 2) * (1 - pull)];
                  const w = mode === "clones" ? 0.8 + 3 * (j.n / Math.max(1, data.nCells)) : 1.3;
                  return (
                    <path key={`${src.key}-${j.key}`} d={`M${x0},${y0} Q${cx},${cy} ${x1},${y1}`} fill="none" stroke={JUNCTION_COLORS[j.kind]} strokeWidth={w} strokeOpacity={mode === "clones" ? 0.75 : 0.6}>
                      <title>{`${src.label} · ${j.title} · ${j.a.chr}:${j.a.pos.toLocaleString()} → ${j.b.chr}:${j.b.pos.toLocaleString()}${mode === "clones" ? ` · ${j.n}/${data.nCells} cells` : ""}`}</title>
                    </path>
                  );
                });
              })}
              <text x={0} y={-6} textAnchor="middle" fontSize={13} fontWeight={600} fill="#262626">{mode === "cells" ? t("components.single-cell.circos.centre-cells", { count: sources.length }) : t("components.single-cell.circos.centre-clones", { count: sources.length })}</text>
              <text x={0} y={12} textAnchor="middle" fontSize={11} fill="#595959">{t("components.single-cell.circos.centre-junctions", { count: d3.sum(sources, (s) => (junctionData[s.key] ? (mode === "clones" ? junctionData[s.key].junctions.filter((j) => j.n / Math.max(1, junctionData[s.key].nCells) >= minShare).length : junctionData[s.key].junctions.length) : 0)) })}</text>
            </g>
          </svg>
          <Space wrap size={[12, 4]} style={{ marginTop: 6, fontSize: 12 }}>
            {sources.map((src, i) => (
              <span key={src.key} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 12, height: 12, background: src.color, borderRadius: 2 }} />
                {`${t("components.single-cell.circos.ring", { n: i + 1 })} ${src.label}`}
              </span>
            ))}
          </Space>
          <Space wrap size={[12, 4]} style={{ marginTop: 4, fontSize: 12 }}>
            {Object.entries(JUNCTION_COLORS).map(([k, c]) => (
              <span key={k}><span className="sc-swatch" style={{ background: c }} />{k}</span>
            ))}
            <Text type="secondary">{t("components.single-cell.circos.help2")}</Text>
          </Space>
        </div>
      </div>
    </Card>
  );
}
