import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { Alert, Button, Card, Input, InputNumber, Segmented, Select, Space, Switch, Tag, Tooltip, Typography } from "antd";
import { DownloadOutlined, LeftOutlined, RightOutlined, ZoomInOutlined, ZoomOutOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import useEnsureGeneList from "../cohort/useEnsureGeneList";
import CellIgvPanel from "../cellIgvPanel";
import { casePath, tryGet } from "../../../redux/singleCell/loaders";
import { SC_MAX_TRACK_CELLS } from "../../../redux/singleCell/actions";
import { treeForCells } from "../../../helpers/singleCell/newick";
import {
  chromLength, formatLocus, layoutWindows, panWindow, parseLocus, pxToBp, toGlobal, zoomWindow,
} from "../../../helpers/singleCell/trackBrowser/locus";
import { graphInWindows, junctionCarriers, lowerBound, maxSegmentCn } from "../../../helpers/singleCell/trackBrowser/trackData";
import { autoCnMax, visibleRows } from "../../../helpers/singleCell/trackBrowser/scales";
import { expectedDepth, foregroundFromCn, unitFit } from "../../../helpers/singleCell/trackBrowser/coverageAxes";
import { buildSpec, interimTracks, resolveUrl, unitsFromCells, validateSpec } from "../../../helpers/singleCell/trackBrowser/trackSpec";
import useUnitData from "./useUnitData";
import { COLORS, drawGenes, drawJunctions, drawRuler, drawTree, drawUnitRow, hitTest, setupCanvas } from "./draw";

const { Text } = Typography;
const TREE_W = 130;
const LABEL_W = 92;
const AXIS_L = 26;
const AXIS_R = 30;
const HEADER = { ruler: 26, genes: 34, junctions: 64 };
const ROW_GAP = 3;
const VIEW_H = 620;
const HIGHLIGHT_GENES = ["CDK4", "MDM2", "GLI1", "DDIT3", "HMGA2", "FRS2", "LRIG3", "WIF1", "EGFR", "PDGFRA", "MYCN", "CDKN2A", "TSPAN31", "YEATS4", "CPM"];
export const DEFAULT_LOCI = {
  MGH303: [
    { label: "12q amplicon", locus: "chr12:55,500,000-72,500,000" },
    { label: "12q + chr11 partner", locus: "chr12:55,500,000-72,500,000 | chr11:39,200,000-39,700,000" },
    { label: "CDK4 · MDM2", locus: "chr12:57,600,000-58,400,000 | chr12:68,600,000-69,400,000" },
  ],
};
const FALLBACK_PRESETS = [{ label: "chr12", locus: "chr12" }];
const MIN_JUNCTION_CELLS = 10;

function urlParam(name) {
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch (e) {
    return null;
  }
}
function setUrlParam(name, value) {
  try {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(name, value);
    else url.searchParams.delete(name);
    window.history.replaceState(window.history.state, "", url.toString());
  } catch (e) {
    // no URL sync (tests)
  }
}

const parseJunctionId = (j) => ({
  id: j.id,
  a: { chrom: `${j.chrA}`.replace(/^chr/, ""), pos: Number(j.posA), sign: j.strA === "+" ? 1 : -1 },
  b: { chrom: `${j.chrB}`.replace(/^chr/, ""), pos: Number(j.posB), sign: j.strB === "+" ? 1 : -1 },
  cls: j.class,
  nCells: Number(j.n_cells_tumour) || 0,
  nReads: Number(j.n_reads_tumour) || 0,
  nNormal: Number(j.n_cells_normal) || 0,
  tier: j.tier,
  genes: j.genes,
});

/**
 * Track browser (brief cu, milestone M1): one shared locus model (one or more split windows), units stacked in tree
 * order with the tree at the left, and per-unit tracks (genome graph, two-axis coverage) that all follow the locus.
 * Clicking a junction (patient arcs or a cell's ALT edge) opens igv.js reads at both breakends, split view.
 * The view is a gos-track-spec (docs/track_spec.md): it can be exported, and ?trackspec=<url> opens one.
 */
export default function TrackBrowserPanel() {
  const dataset = useSelector((s) => s.Settings.dataset);
  const chromoBins = useSelector((s) => s.Settings.chromoBins);
  const genes = useSelector((s) => s.Genes);
  const { patient, cells, order, tree, cloneColors, cellFiles } = useSelector((s) => s.SingleCell);
  useEnsureGeneList();
  const patientId = patient?.caseReportId ? `${patient.caseReportId}` : null;
  const presets = DEFAULT_LOCI[patientId] || FALLBACK_PRESETS;
  const haveBins = Object.keys(chromoBins || {}).length > 0;

  const [spec, setSpec] = useState({ status: "default" });
  const [locusText, setLocusText] = useState(() => urlParam("tblocus") || presets[1]?.locus || presets[0].locus);
  const [windows, setWindows] = useState([]);
  const [locusError, setLocusError] = useState(null);
  const [showGraph, setShowGraph] = useState(true);
  const [showCov, setShowCov] = useState(true);
  const [scale, setScale] = useState("log");
  const [cnMaxUser, setCnMaxUser] = useState(null);
  const [graphH, setGraphH] = useState(30);
  const [covH, setCovH] = useState(34);
  const [groups, setGroups] = useState([]);
  const [cladeIds, setCladeIds] = useState(null); // units of a clicked tree clade
  const [hideNormal, setHideNormal] = useState(false);
  const [reads, setReads] = useState(null);
  const [hover, setHover] = useState(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [wrapRef, width] = useContainerWidth(1200);

  // ?trackspec=<url>: a spec written by gCells (or exported here) sets loci, selection and track visibility
  useEffect(() => {
    const url = urlParam("trackspec");
    if (!url) return;
    tryGet(url).then((r) => {
      if (r.status !== "ok") return setSpec({ status: "error", error: `track spec not available (${r.status} at ${url})` });
      const errors = validateSpec(r.data);
      if (errors.length) return setSpec({ status: "error", error: `track spec not readable: ${errors.join("; ")}` });
      const s = r.data;
      setSpec({ status: "ok", data: s, url });
      setLocusText(s.loci.join(" | "));
      const byType = (t) => (s.tracks || []).find((x) => x.type === t);
      setShowGraph(Boolean(byType("graph")) && byType("graph").visible !== false);
      setShowCov(Boolean(byType("coverage")) && byType("coverage").visible !== false);
      if (byType("graph")?.height) setGraphH(byType("graph").height);
      if (byType("coverage")?.height) setCovH(byType("coverage").height);
      if (byType("coverage")?.y?.scale) setScale(byType("coverage").y.scale);
      if (Number.isFinite(byType("coverage")?.y?.max)) setCnMaxUser(byType("coverage").y.max);
      if (s.selection?.clades) setGroups(s.selection.clades);
      if (s.selection?.units) setCladeIds(s.selection.units);
      return null;
    });
  }, []);

  const tracks = spec.status === "ok" ? spec.data.tracks : interimTracks();
  const trackOf = (type) => tracks.find((t) => t.type === type) || null;
  const graphTrack = trackOf("graph");
  const coverageTrack = trackOf("coverage");
  const readsTrack = trackOf("reads");
  const junctionTrack = trackOf("junctions");
  const specBase = spec.status === "ok" ? spec.url : null;
  const dataPath = dataset?.dataPath || "";
  const genome = dataset?.reference || "hg38";

  // locus text -> windows (also from presets / zoom / pan)
  useEffect(() => {
    if (!haveBins) return;
    const { windows: w, errors } = parseLocus(locusText, chromoBins);
    if (w.length) {
      setWindows(w);
      setUrlParam("tblocus", formatLocus(w));
    }
    setLocusError(errors.length ? `could not read: ${errors.join(", ")}` : null);
  }, [locusText, haveBins, chromoBins]);
  const applyWindows = useCallback((next) => {
    setWindows(next);
    setLocusText(formatLocus(next));
  }, []);

  // units in tree order (cells of the patient), then the selection
  const allUnits = useMemo(() => unitsFromCells(cells, order, cloneColors), [cells, order, cloneColors]);
  const groupOptions = useMemo(() => Object.keys(allUnits.groups).map((g) => ({ label: g, value: g })), [allUnits]);
  const units = useMemo(() => {
    let list = allUnits.list;
    if (hideNormal) list = list.filter((u) => !u.normal);
    if (groups.length) list = list.filter((u) => groups.includes(u.group));
    if (cladeIds) {
      const keep = new Set(cladeIds);
      list = list.filter((u) => keep.has(u.id));
    }
    return list;
  }, [allUnits, groups, cladeIds, hideNormal]);
  const unitIds = useMemo(() => units.map((u) => u.id), [units]);
  const unitById = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);

  // tree pruned to the shown units; rows follow its leaf order
  const treeLayout = useMemo(() => {
    const source = tree?.data?.source;
    if (!source || !unitIds.length) return { layout: null, rows: unitIds };
    const built = treeForCells(source, unitIds);
    if (!built.layout) return { layout: null, rows: unitIds };
    return { layout: built.layout, rows: [...built.layout.leaves, ...built.unplaced] };
  }, [tree, unitIds]);
  const rows = treeLayout.rows;
  const rowH = (showGraph ? graphH : 0) + (showCov ? covH : 0) + ROW_GAP;
  const rowIndex = useMemo(() => new Map(rows.map((id, i) => [id, i])), [rows]);
  const bodyH = Math.min(VIEW_H, Math.max(rowH, rows.length * rowH));
  const [first, last] = visibleRows(scrollTop, bodyH, rowH, rows.length, 0);
  const [pf, pl] = visibleRows(scrollTop, bodyH, rowH, rows.length, 8);
  const coverageIds = useMemo(() => (showCov ? rows.slice(pf, pl + 1) : []), [rows, pf, pl, showCov]);

  const data = useUnitData({ dataPath, patient: patientId, genome, unitIds, coverageIds, graphTrack, coverageTrack, cellFiles });

  // patient junction table and the pooled junction slices' regions (reads)
  const [junctions, setJunctions] = useState({ status: "loading", list: [] });
  const [sliceRegions, setSliceRegions] = useState(null);
  useEffect(() => {
    if (!patientId || !junctionTrack) return;
    const url = resolveUrl(junctionTrack.url, { dataPath, patient: patientId, genome, base: specBase });
    tryGet(url).then((r) => {
      if (r.status !== "ok") return setJunctions({ status: r.status, list: [] });
      const min = junctionTrack.min?.n_cells_tumour ?? MIN_JUNCTION_CELLS;
      return setJunctions({ status: "ok", list: (r.data.junctions || []).map(parseJunctionId).filter((j) => j.nCells >= min) });
    });
    tryGet(casePath(dataset, patientId, "slices/regions.json")).then((r) => setSliceRegions(r.status === "ok" ? r.data : null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, junctionTrack?.url, dataPath]);

  const trackLeft = TREE_W + LABEL_W + AXIS_L;
  const trackW = Math.max(200, width - trackLeft - AXIS_R);
  const slots = useMemo(() => layoutWindows(windows, trackW, 10), [windows, trackW]);

  // shared CN max: user value, else a high quantile of the per-unit maxima in the windows
  const autoMax = useMemo(() => {
    const maxima = unitIds.map((id) => {
      const g = data.graphs.get(id);
      return g ? maxSegmentCn(graphInWindows(g, slots).segments) : null;
    });
    return autoCnMax(maxima);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitIds, slots, data.version]);
  const cnMax = cnMaxUser || autoMax;

  // reads (split igv.js view, one frame per locus): at both breakends of a junction, or at SNV / positions.
  // Grouped by cell, by clade (pooled RG-tagged slices) or all cells pooled (docs/track_spec.md, reads.group_by).
  const [readsGroupBy, setReadsGroupBy] = useState("unit");
  const [snvText, setSnvText] = useState("");
  const pooledFor = useCallback(
    (points) => {
      const sets = sliceRegions?.sets || {};
      const inSet = (name) =>
        (sets[name]?.regions || []).length > 0 &&
        points.every((e) => sets[name].regions.some((r) => `${r.chrom}`.replace(/^chr/, "") === e.chrom && e.pos >= r.start - 200 && e.pos <= r.end + 200));
      const name = ["junctions", "drivers"].find(inSet);
      return name && sets[name].dna ? { patientId, file: `slices/${sets[name].dna}`, set: name } : null;
    },
    [sliceRegions, patientId]
  );
  const openReadsAt = useCallback(
    ({ points, ranked, label, flank, kind, carriersNote, groupBy = readsGroupBy }) => {
      const max = Math.min(readsTrack?.max_units || SC_MAX_TRACK_CELLS, SC_MAX_TRACK_CELLS);
      const pooled = pooledFor(points);
      let cellIds = ranked.slice(0, max);
      let pooledView = pooled;
      let note = pooled ? `pooled ${pooled.set} slices (RG = cell)` : "per-cell reads.bam slices";
      let mode = groupBy;
      if (groupBy !== "unit" && !pooled) {
        mode = "unit";
        note = "grouped reads not available (no pooled slice covers these loci): per-cell panes";
      } else if (groupBy === "group") {
        const members = {};
        rows.forEach((id) => {
          const g = unitById.get(id)?.group ?? "no clone";
          (members[g] = members[g] || []).push(id);
        });
        const keys = Object.keys(members).slice(0, max).map((g) => [`${g} (${members[g].length} cells)`, members[g]]);
        cellIds = keys.map(([k]) => k);
        pooledView = { ...pooled, groups: Object.fromEntries(keys) };
        note = `by clone, tree order · ${note}`;
      } else if (groupBy === "all") {
        const k = `all shown cells (${rows.length})`;
        cellIds = [k];
        pooledView = { ...pooled, groups: { [k]: rows } };
        note = `all cells pooled · ${note}`;
      }
      setReads({
        label,
        carriersNote,
        note,
        mode,
        view: {
          loci: points.map((e) => ({ chromosome: `chr${e.chrom}`, position: e.pos })),
          chromosome: `chr${points[0].chrom}`,
          position: points[0].pos,
          cellIds,
          window: flank,
          pooled: pooledView,
          label,
          kind,
        },
      });
    },
    [readsTrack, pooledFor, rows, unitById, readsGroupBy]
  );
  const openReads = useCallback(
    (junction, firstUnit = null, groupBy = readsGroupBy) => {
      const carriers = junctionCarriers(junction, rows, data.graphs, 1000).sort((a, b) => b.cn - a.cn);
      let ids = carriers.map((c) => c.id);
      if (firstUnit) ids = [firstUnit, ...ids.filter((x) => x !== firstUnit)];
      openReadsAt({
        points: [junction.a, junction.b],
        ranked: ids,
        label: junction.id || `chr${junction.a.chrom}:${junction.a.pos}~chr${junction.b.chrom}:${junction.b.pos}`,
        flank: readsTrack?.window || 300,
        kind: "junction",
        carriersNote: `${carriers.length} cells carry it in their graph (±1 kb); per-cell panes = top carriers by junction CN`,
        groupBy,
      });
    },
    [rows, data.graphs, readsTrack, openReadsAt, readsGroupBy]
  );
  const openSnvReads = (groupBy = readsGroupBy) => {
    const points = snvText
      .split("|")
      .map((t) => t.trim().replace(/,/g, "").match(/^(?:chr)?([0-9XYM]+)[:_](\d+)/i))
      .filter(Boolean)
      .map((m) => ({ chrom: m[1].toUpperCase(), pos: Number(m[2]) }));
    if (!points.length) return;
    openReadsAt({
      points,
      ranked: rows.slice(first, last + 1),
      label: points.map((e) => `chr${e.chrom}:${e.pos.toLocaleString()}`).join(" | "),
      flank: 40,
      kind: "snv",
      carriersNote: "per-cell panes = the cells in view, tree order",
      groupBy,
    });
  };
  // regroup the open reads view when the grouping changes
  const lastReads = useRef(null);
  lastReads.current = reads;
  useEffect(() => {
    const r = lastReads.current;
    if (!r) return;
    if (r.view.kind === "junction") {
      const [a, b] = r.view.loci;
      openReads({ ...(r.junction || {}), id: r.label, a: { chrom: a.chromosome.replace(/^chr/, ""), pos: a.position }, b: { chrom: b.chromosome.replace(/^chr/, ""), pos: b.position } }, null, readsGroupBy);
    } else openSnvReads(readsGroupBy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readsGroupBy]);

  // ----- drawing
  const headerRef = useRef(null);
  const bodyRef = useRef(null);
  const hitsRef = useRef({ header: [], body: [], tree: [] });
  const headerH = HEADER.ruler + HEADER.genes + (junctionTrack ? HEADER.junctions : 0);

  useEffect(() => {
    const ctx = setupCanvas(headerRef.current, width, headerH);
    if (!ctx || !slots.length) return;
    drawRuler(ctx, slots, trackLeft, 0, HEADER.ruler);
    drawGenes(ctx, slots, genes, chromoBins, trackLeft, HEADER.ruler, HEADER.genes, HIGHLIGHT_GENES);
    let hits = [];
    if (junctionTrack) {
      const y = HEADER.ruler + HEADER.genes;
      const maxCells = junctions.list.reduce((m, j) => Math.max(m, j.nCells), 1);
      hits = drawJunctions(ctx, slots, junctions.list, trackLeft, y, HEADER.junctions, maxCells);
      const msg = junctions.status === "ok" ? `junctions ≥ ${junctionTrack.min?.n_cells_tumour ?? MIN_JUNCTION_CELLS} tumor cells (height = cells)` : `junctions not available (${junctions.status})`;
      ctx.fillStyle = COLORS.muted;
      ctx.font = "9px system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillText(msg, trackLeft - 4, y + 2);
    }
    ctx.textAlign = "right";
    ctx.fillStyle = COLORS.muted;
    ctx.fillText("genes", trackLeft - 4, HEADER.ruler + 4);
    hitsRef.current.header = hits;
  }, [width, headerH, slots, genes, chromoBins, junctions, junctionTrack, trackLeft]);

  useEffect(() => {
    const ctx = setupCanvas(bodyRef.current, width, bodyH);
    if (!ctx || !slots.length) return;
    const hits = [];
    const groupColor = (id) => allUnits.groups[unitById.get(id)?.group]?.color || null;
    const center = (id) => rowIndex.get(id) * rowH + (rowH - ROW_GAP) / 2;
    hitsRef.current.tree = drawTree(ctx, treeLayout.layout, center, TREE_W, scrollTop, bodyH, groupColor);
    for (let i = first; i <= last; i += 1) {
      const id = rows[i];
      const unit = unitById.get(id);
      if (!unit) continue;
      const top = i * rowH - scrollTop;
      ctx.fillStyle = groupColor(id) || "#999";
      ctx.fillRect(TREE_W + 2, top + 1, 4, rowH - ROW_GAP - 2);
      ctx.fillStyle = COLORS.ink;
      ctx.font = "9px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const short = `${id}`.replace(`${patientId}_`, "");
      ctx.fillText(short.length > 17 ? `${short.slice(0, 16)}…` : short, TREE_W + 9, top + (rowH - ROW_GAP) / 2 - 5);
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(`${unit.group ?? ""}${unit.ploidy ? ` · ψ ${unit.ploidy.toFixed(2)}` : ""}`, TREE_W + 9, top + (rowH - ROW_GAP) / 2 + 6);
      hits.push(
        ...drawUnitRow(ctx, {
          unit, top, left: trackLeft, slots, chromoBins, cnMax, scale,
          graph: data.graphs.get(id), graphStatus: data.status.get(`graph:${id}`),
          coverage: data.coverage.get(id), covStatus: data.status.get(`cov:${id}`),
          showGraph, graphH, showCov, covH, trackRight: trackLeft + trackW,
        })
      );
    }
    hitsRef.current.body = hits;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, bodyH, slots, rows, first, last, scrollTop, rowH, data.version, cnMax, scale, showGraph, showCov, graphH, covH, treeLayout, unitById]);

  // ----- interaction: drag to pan the window under the pointer, wheel over the header (or ctrl/shift + wheel) to zoom
  const slotAt = (x) => slots.findIndex((s) => x >= trackLeft + s.x0 && x <= trackLeft + s.x0 + s.width);
  const drag = useRef(null);
  const onDown = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const k = slotAt(e.clientX - r.left);
    if (k < 0) return;
    drag.current = { k, x: e.clientX, start: windows[k], moved: false };
  };
  const onMove = (e, which) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (drag.current) {
      const d = drag.current;
      const dx = e.clientX - d.x;
      if (Math.abs(dx) > 2) d.moved = true;
      if (d.moved) {
        const s = slots[d.k];
        const bpPerPx = (d.start.end - d.start.start) / s.width;
        const next = windows.map((w, i) => (i === d.k ? panWindow(d.start, -dx * bpPerPx, chromLength(chromoBins, w.chrom)) : w));
        setWindows(next);
      }
      return;
    }
    const hit = hitTest(hitsRef.current[which], x, y, 4);
    const k = slotAt(x);
    if (which === "body") {
      const i = Math.floor((y + scrollTop) / rowH);
      const id = rows[i];
      const unit = unitById.get(id);
      const pos = k >= 0 ? Math.round(pxToBp(slots[k], x - trackLeft - slots[k].x0)) : null;
      setHover(unit ? { x, y, which, unit, k, pos, hit, sub: y + scrollTop - i * rowH < (showGraph ? graphH : 0) ? "graph" : "cov" } : hit ? { x, y, which, hit } : null);
    } else setHover(hit ? { x, y, which, hit } : null);
  };
  const onUp = (e, which) => {
    const d = drag.current;
    drag.current = null;
    if (d && d.moved) {
      setLocusText(formatLocus(windows));
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const hit = hitTest(hitsRef.current[which], x, y, 5);
    if (hit?.kind === "junction") openReads(hit.junction);
    else if (hit?.kind === "alt") openReads(hit.alt, hit.unit.id);
    else if (which === "body" && x < TREE_W) {
      // a tree node: show only its clade
      const node = (hitsRef.current.tree || []).reduce((b, n) => {
        const dd = (n.x - x) ** 2 + (n.y - y) ** 2;
        return dd < 64 && (!b || dd < b.d) ? { n, d: dd } : b;
      }, null);
      if (node && treeLayout.layout) {
        const nd = treeLayout.layout.nodes[node.n.id];
        setCladeIds(treeLayout.layout.leaves.slice(nd.firstLeaf, nd.lastLeaf + 1));
        setScrollTop(0);
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
      }
    }
  };
  const zoomAt = (factor, x = null) => {
    if (x == null) return applyWindows(windows.map((w) => zoomWindow(w, factor, 0.5, chromLength(chromoBins, w.chrom))));
    const k = slotAt(x);
    if (k < 0) return null;
    const s = slots[k];
    const at = (x - trackLeft - s.x0) / s.width;
    return applyWindows(windows.map((w, i) => (i === k ? zoomWindow(w, factor, at, chromLength(chromoBins, w.chrom)) : w)));
  };
  const zoomRef = useRef(zoomAt);
  zoomRef.current = zoomAt;
  useEffect(() => {
    const els = [headerRef.current, bodyRef.current].filter(Boolean);
    const handler = (e) => {
      const isHeader = e.currentTarget === headerRef.current;
      if (!isHeader && !(e.ctrlKey || e.metaKey || e.shiftKey)) return;
      e.preventDefault();
      const r = e.currentTarget.getBoundingClientRect();
      const dy = e.deltaY || e.deltaX;
      zoomRef.current(dy > 0 ? 1.25 : 0.8, e.clientX - r.left);
    };
    els.forEach((el) => el.addEventListener("wheel", handler, { passive: false }));
    return () => els.forEach((el) => el.removeEventListener("wheel", handler));
  }, [slots.length]);

  const scrollRef = useRef(null);
  const onScroll = (e) => setScrollTop(e.currentTarget.scrollTop);

  const exportSpec = () => {
    const s = buildSpec({
      id: `${patientId}_${Date.now()}`,
      title: `${patientId} ${formatLocus(windows)}`,
      genome,
      patient: patientId,
      windows,
      units: { ...allUnits, list: units },
      tracks: tracks.map((t) =>
        t.type === "graph" ? { ...t, visible: showGraph, height: graphH } : t.type === "coverage" ? { ...t, visible: showCov, height: covH, y: { ...(t.y || {}), max: cnMaxUser || "auto", scale } } : t
      ),
      selection: groups.length || cladeIds ? { ...(groups.length ? { clades: groups } : {}), ...(cladeIds ? { units: cladeIds } : {}) } : null,
      provenance: { source: "gOS track browser export", data: "interim gOS per-cell files" },
    });
    const blob = new Blob([JSON.stringify(s, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${patientId}_track_spec.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  if (!patientId) return <Alert type="info" showIcon message="Track browser: open a single-cell patient." />;
  if (!cells.length) return <Alert type="info" showIcon message="Track browser: cells not available for this patient." />;

  const tip = hover ? tooltipText(hover, data, cnMax, slots, chromoBins) : null;
  const loadedCov = coverageIds.filter((id) => data.coverage.has(id)).length;

  return (
    <Card size="small" className="sc-track-browser" title={<Space wrap><span>Track browser</span><Tag color="blue">M1 preview</Tag><Text type="secondary">spec {spec.status === "ok" ? `${spec.data.version} · ${spec.data.id}` : "0.2 · interim gOS files"}</Text></Space>}>
      <Space wrap style={{ marginBottom: 8 }}>
        <Input.Search
          style={{ width: 460 }}
          size="small"
          value={locusText}
          onChange={(e) => setLocusText(e.target.value)}
          onSearch={(v) => setLocusText(v)}
          enterButton="Go"
          placeholder="chr12:57,000,000-70,000,000 | chr11:39.2m-39.7m"
        />
        <Select size="small" style={{ width: 190 }} placeholder="preset loci" value={null} options={presets.map((p) => ({ label: p.label, value: p.locus }))} onChange={(v) => setLocusText(v)} />
        <Button size="small" icon={<LeftOutlined />} onClick={() => applyWindows(windows.map((w) => panWindow(w, -(w.end - w.start) * 0.25, chromLength(chromoBins, w.chrom))))} />
        <Button size="small" icon={<RightOutlined />} onClick={() => applyWindows(windows.map((w) => panWindow(w, (w.end - w.start) * 0.25, chromLength(chromoBins, w.chrom))))} />
        <Button size="small" icon={<ZoomInOutlined />} onClick={() => zoomAt(0.5)} />
        <Button size="small" icon={<ZoomOutOutlined />} onClick={() => zoomAt(2)} />
        <Tooltip title="Export this view as a gos-track-spec JSON (opens in R with gCells / gTrack)">
          <Button size="small" icon={<DownloadOutlined />} onClick={exportSpec}>Export spec</Button>
        </Tooltip>
      </Space>
      <Space wrap style={{ marginBottom: 8 }}>
        <Space size={4}><Switch size="small" checked={showGraph} onChange={setShowGraph} /><Text>graph</Text></Space>
        <Space size={4}><Switch size="small" checked={showCov} onChange={setShowCov} /><Text>coverage</Text></Space>
        <Segmented size="small" value={scale} onChange={setScale} options={[{ label: "log CN", value: "log" }, { label: "linear CN", value: "linear" }]} />
        <Space size={4}><Text>CN max</Text><InputNumber size="small" min={2} max={2000} value={cnMaxUser} placeholder={`auto ${autoMax}`} onChange={(v) => setCnMaxUser(v || null)} style={{ width: 90 }} /></Space>
        <Space size={4}><Text>row px</Text><InputNumber size="small" min={12} max={120} value={graphH} onChange={(v) => v && setGraphH(v)} style={{ width: 60 }} /><InputNumber size="small" min={12} max={160} value={covH} onChange={(v) => v && setCovH(v)} style={{ width: 60 }} /></Space>
        <Select size="small" mode="multiple" allowClear style={{ minWidth: 200 }} placeholder="clones (all)" value={groups} options={groupOptions} onChange={setGroups} />
        <Space size={4}><Switch size="small" checked={hideNormal} onChange={setHideNormal} /><Text>hide normal</Text></Space>
        {cladeIds && <Button size="small" onClick={() => setCladeIds(null)}>show all cells (clade of {cladeIds.length})</Button>}
      </Space>
      {locusError && <Alert type="warning" showIcon message={locusError} style={{ marginBottom: 6 }} />}
      {spec.status === "error" && <Alert type="warning" showIcon message={spec.error} style={{ marginBottom: 6 }} />}
      <Text type="secondary" style={{ fontSize: 11, display: "block", marginBottom: 4 }}>
        {rows.length} cells in tree order · rows {first + 1}-{last + 1} drawn, coverage loaded for {loadedCov}/{coverageIds.length} near view ·
        coverage: dark = foreground f in CN (left axis, shared, from each cell's ploidy ψ), blue numbers = expected depth (×) = f × that cell's mean depth (not raw depth) · red = JaBbA segments ·
        drag to pan, wheel on the ruler (or ctrl/shift + wheel) to zoom · click a junction arc for reads at both breakends · click a tree node for its clade
      </Text>
      <div ref={wrapRef} style={{ position: "relative", width: "100%" }}>
        <canvas
          ref={headerRef}
          style={{ display: "block", cursor: "grab" }}
          onMouseDown={onDown}
          onMouseMove={(e) => onMove(e, "header")}
          onMouseUp={(e) => onUp(e, "header")}
          onMouseLeave={() => { drag.current = null; setHover(null); }}
        />
        <div ref={scrollRef} onScroll={onScroll} style={{ height: bodyH, overflowY: "auto", overflowX: "hidden", position: "relative", borderTop: "1px solid #ddd" }}>
          <div style={{ height: rows.length * rowH, position: "relative" }}>
            <canvas
              ref={bodyRef}
              style={{ position: "sticky", top: 0, display: "block", cursor: "crosshair" }}
              onMouseDown={onDown}
              onMouseMove={(e) => onMove(e, "body")}
              onMouseUp={(e) => onUp(e, "body")}
              onMouseLeave={() => { drag.current = null; setHover(null); }}
            />
          </div>
        </div>
        {tip && (
          <div style={{ position: "absolute", left: Math.min(hover.x + 14, width - 300), top: (hover.which === "header" ? hover.y : hover.y + headerH) + 12, background: "rgba(255,255,255,0.97)", border: "1px solid #ccc", borderRadius: 4, padding: "4px 8px", fontSize: 11, pointerEvents: "none", whiteSpace: "pre", zIndex: 5, boxShadow: "0 1px 4px rgba(0,0,0,0.15)" }}>
            {tip}
          </div>
        )}
      </div>
      <Space wrap style={{ marginTop: 10 }}>
        <Text strong>Reads</Text>
        <Segmented size="small" value={readsGroupBy} onChange={setReadsGroupBy} options={[{ label: "by cell", value: "unit" }, { label: "by clone", value: "group" }, { label: "all cells", value: "all" }]} />
        <Input.Search size="small" style={{ width: 380 }} value={snvText} onChange={(e) => setSnvText(e.target.value)} onSearch={() => openSnvReads()} enterButton="SNV reads" placeholder="SNV / base positions: chr12:57,751,234 | chr12:69,210,500" />
        <Text type="secondary" style={{ fontSize: 11 }}>or click a junction arc</Text>
      </Space>
      {reads && (
        <Card
          size="small"
          style={{ marginTop: 6 }}
          title={<Space wrap><span>{reads.view.kind === "snv" ? "Reads at SNV / positions (±40 bp)" : "Reads at both breakends"}</span><Text type="secondary">{reads.label} · {reads.carriersNote} · {reads.note}</Text></Space>}
          extra={<Button size="small" type="text" onClick={() => setReads(null)}>close</Button>}
        >
          {reads.view.cellIds.length ? <CellIgvPanel key={`${reads.mode}|${reads.view.label}`} view={reads.view} embedded /> : <Alert type="info" showIcon message="reads not available (no cell carries this junction in its graph)" />}
        </Card>
      )}
    </Card>
  );
}

function tooltipText(h, data, cnMax, slots, chromoBins) {
  if (h.hit?.kind === "junction") {
    const j = h.hit.junction;
    return `${j.id}\n${j.cls} · ${j.nCells} tumor cells · ${j.nReads} reads · ${j.nNormal} normal cells\ngenes: ${j.genes || "none"}\nclick: reads at both breakends`;
  }
  if (h.hit?.kind === "alt") {
    const a = h.hit.alt;
    return `${h.hit.unit.id}\nALT ${a.title} · CN ${a.cn}\nchr${a.a.chrom}:${a.a.pos.toLocaleString()} ~ chr${a.b.chrom}:${a.b.pos.toLocaleString()}\nclick: reads at both breakends`;
  }
  if (!h.unit) return null;
  const u = h.unit;
  const fit = unitFit(u);
  const lines = [`${u.id} · ${u.group ?? ""}`, `p ${fit.purity.toFixed(2)} · ψ ${fit.ploidy ? fit.ploidy.toFixed(2) : "n/a"} · mean depth ${fit.meanDepth ? `${fit.meanDepth.toFixed(2)}×` : "not available"}`];
  if (h.pos != null && h.k >= 0 && slots[h.k]) {
    const chrom = slots[h.k].window.chrom;
    lines.push(`chr${chrom}:${h.pos.toLocaleString()}`);
    const g = data.graphs.get(u.id);
    const seg = g ? (g.intervals || []).find((iv) => `${iv.chromosome}`.replace(/^chr/, "") === chrom && h.pos >= iv.startPoint && h.pos <= iv.endPoint) : null;
    lines.push(seg ? `JaBbA segment CN ${seg.y} (${seg.startPoint.toLocaleString()}-${seg.endPoint.toLocaleString()})` : g ? "no segment here" : "graph not loaded");
    const cov = data.coverage.get(u.id);
    if (cov) {
      const gx = toGlobal(chromoBins, chrom, h.pos);
      const i = lowerBound(cov.x, gx + 1) - 1;
      if (i >= 0 && gx - cov.x[i] < cov.binWidth) {
        const cn = cov.y[i];
        if (fit.ploidy) {
          const f = foregroundFromCn(cn, fit.purity, fit.ploidy);
          lines.push(`coverage bin: f ${f.toFixed(2)} · CN ${cn.toFixed(2)} · expected depth ${fit.meanDepth ? `${expectedDepth(f, fit.meanDepth).toFixed(1)}×` : "not available"}`);
        } else lines.push(`coverage bin: CN ${cn.toFixed(2)} (f not available: no ploidy)`);
      } else lines.push("coverage: no bin here (masked)");
    }
  }
  lines.push(`CN axis max ${cnMax}`);
  return lines.join("\n");
}

