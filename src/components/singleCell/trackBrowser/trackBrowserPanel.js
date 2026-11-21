import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import {
  Alert, Button, Card, Input, InputNumber, Popover, Segmented, Select, Slider, Space, Switch, Tag, Tooltip, Typography,
} from "antd";
import { DownloadOutlined, LeftOutlined, RightOutlined, SettingOutlined, ZoomInOutlined, ZoomOutOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import useEnsureGeneList from "../cohort/useEnsureGeneList";
import CellIgvPanel from "../cellIgvPanel";
import { casePath, tryGet } from "../../../redux/singleCell/loaders";
import { SC_MAX_TRACK_CELLS } from "../../../redux/singleCell/actions";
import { clipLongBranches, longBranchCap, treeForCells } from "../../../helpers/singleCell/newick";
import {
  chromLength, formatLocus, layoutWindows, panWindow, parseLocus, placesToWindow, pxToBp, toGlobal, windowToPlaces, zoomWindow,
} from "../../../helpers/singleCell/trackBrowser/locus";
import { graphInWindows, junctionCarriers, lowerBound } from "../../../helpers/singleCell/trackBrowser/trackData";
import { pseudobulkInWindows } from "../../../helpers/singleCell/trackBrowser/pseudobulk";
import {
  DEFAULT_Y, HEIGHT_MAX, HEIGHT_MIN, PRESETS, autoFitBase, buildRows, clampHeight, loadLayoutPrefs, resolveWindowScales, rowOffsets,
  saveLayoutPrefs, scalesDiffer, valueQuantile,
} from "../../../helpers/singleCell/trackBrowser/layout";
import { expectedDepth, foregroundFromCn, unitFit } from "../../../helpers/singleCell/trackBrowser/coverageAxes";
import { buildSpec, interimTracks, resolveUrl, unitsFromCells, validateSpec } from "../../../helpers/singleCell/trackBrowser/trackSpec";
import useUnitData from "./useUnitData";
import { COLORS, drawGenes, drawJunctions, drawRuler, drawTree, hitTest, setupCanvas } from "./draw";
import { CanvasRow, GraphPlotRow, NoteRow } from "./trackRow";
import { TrackLocusContext } from "./locusContext";

const { Text } = Typography;
const HEADER = { ruler: 34, genes: 46 };
const ROW_GAP = 3;
const GGRAPH_MIN = 32;
const PIN_H = { graph: 150, coverage: 120, clade: 190 };
const HIGHLIGHT_GENES = ["CDK4", "MDM2", "GLI1", "DDIT3", "HMGA2", "FRS2", "LRIG3", "WIF1", "EGFR", "PDGFRA", "MYCN", "CDKN2A", "TSPAN31", "YEATS4", "CPM", "OS9", "AVIL", "CTDSP2"];
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

const parseJunctionRow = (j) => ({
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

/** The gene under a genome-wide position (heaviest when several overlap), or null. */
function geneAt(genes, g) {
  if (!genes?.geneTypes?.length || !Number.isFinite(g)) return null;
  let best = null;
  for (let i = 0; i < genes.geneTypes.length; i += 1) {
    if (genes.geneTypes[i] !== "gene" || genes.genesStartPoint[i] > g || genes.genesEndPoint[i] < g) continue;
    if (best == null || (genes.genesWeight?.[i] || 0) > (genes.genesWeight?.[best] || 0)) best = i;
  }
  return best == null ? null : genes.geneTitles[best];
}

/**
 * Track browser (brief cu M1, readability brief dc): one shared locus model (split windows, each with its own y
 * scale), clade pseudobulk rows first with per-cell rows expandable under each clade (or all cells in tree order
 * with the tree), per-cell genome graph and two-axis coverage rows, row height slider / presets / per-track
 * overrides / drag-to-resize / auto-fit, pinned tall rows, and igv.js reads at both breakends of a junction or at
 * SNVs, grouped by cell, clone or all. The view is a gos-track-spec (docs/track_spec.md).
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
  const [wrapRef, width] = useContainerWidth(1200);
  const narrow = width < 700;

  // ----- persisted layout (localStorage per browser; a track spec overrides it)
  const stored = useMemo(() => {
    // ?tbh=compact|readable|large|<px>: a link opens at that row height (auto-fit off)
    const link = urlParam("tbh");
    const px = link ? PRESETS[link] ?? Number(link) : NaN;
    return Number.isFinite(px) && px > 0 ? { ...(loadLayoutPrefs() || {}), base: px, overrides: { graph: null, coverage: null }, autoFit: false } : loadLayoutPrefs() || {};
  }, []);
  const [base, setBase] = useState(clampHeight(stored.base ?? PRESETS.readable));
  const [overrides, setOverrides] = useState(stored.overrides || { graph: null, coverage: null });
  const [autoFit, setAutoFit] = useState(stored.autoFit ?? true);
  const [junctionH, setJunctionH] = useState(stored.junctionH ?? 80);
  const [readsH, setReadsH] = useState(stored.readsH ?? 220);
  useEffect(() => {
    saveLayoutPrefs({ base, overrides, autoFit, junctionH, readsH });
  }, [base, overrides, autoFit, junctionH, readsH]);

  const [spec, setSpec] = useState({ status: "default" });
  const [locusText, setLocusText] = useState(() => urlParam("tblocus") || presets[1]?.locus || presets[0].locus);
  const [windows, setWindows] = useState([]);
  const [windowY, setWindowY] = useState([]);
  const [shareY, setShareY] = useState(false);
  const [locusError, setLocusError] = useState(null);
  const [showGraph, setShowGraph] = useState(true);
  const [showCov, setShowCov] = useState(true);
  const [mode, setMode] = useState(() => (urlParam("tbmode") === "cells" ? "cells" : "pseudobulk"));
  const [expanded, setExpanded] = useState({});
  // graph rows: the standard gOS genome-graph component ("ggraph", default) or the compact canvas drawing (alternative)
  const [graphStyle, setGraphStyle] = useState(() => (urlParam("tbstyle") === "canvas" ? "canvas" : "ggraph"));
  const [minSupport, setMinSupport] = useState(() => (Number.isFinite(Number(urlParam("tbsupport"))) && urlParam("tbsupport") ? Number(urlParam("tbsupport")) : 25)); // % of a clade's cells
  const [pinned, setPinned] = useState(() => (urlParam("tbpin") ? urlParam("tbpin").split(",").filter(Boolean).slice(0, 3) : []));
  const [groups, setGroups] = useState([]);
  const [cladeIds, setCladeIds] = useState(null);
  const [hideNormal, setHideNormal] = useState(false);
  const [reads, setReads] = useState(null);
  const [hover, setHover] = useState(null);
  const [scrollTop, setScrollTop] = useState(0);

  // ?trackspec=<url>: a spec from gCells (or exported here) sets loci, per-window y, layout, selection and tracks
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
      if (Array.isArray(s.windows)) setWindowY(s.windows.map((w) => ({ ...DEFAULT_Y, ...(w?.y || {}) })));
      const byType = (t) => (s.tracks || []).find((x) => x.type === t);
      setShowGraph(Boolean(byType("graph")) && byType("graph").visible !== false);
      setShowCov(Boolean(byType("coverage")) && byType("coverage").visible !== false);
      const L = s.layout || {};
      if (L.row_height) setBase(clampHeight(L.row_height));
      if (L.overrides) setOverrides(L.overrides);
      if (L.auto_fit != null) setAutoFit(Boolean(L.auto_fit));
      if (L.junction_height) setJunctionH(L.junction_height);
      if (L.reads_height) setReadsH(L.reads_height);
      if (L.mode) setMode(L.mode);
      if (L.share_y != null) setShareY(Boolean(L.share_y));
      if (Number.isFinite(L.clade_min_support)) setMinSupport(L.clade_min_support);
      if (L.graph_style) setGraphStyle(L.graph_style === "canvas" ? "canvas" : "ggraph");
      if (Array.isArray(L.pinned)) setPinned(L.pinned.slice(0, 3));
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
  useEffect(() => setUrlParam("tbmode", mode === "cells" ? "cells" : null), [mode]);
  useEffect(() => setUrlParam("tbstyle", graphStyle === "canvas" ? "canvas" : null), [graphStyle]);
  useEffect(() => setUrlParam("tbpin", pinned.length ? pinned.join(",") : null), [pinned]);

  // ----- units, tree order, rows
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
  const treeLayout = useMemo(() => {
    const source = tree?.data?.source;
    if (!source || !unitIds.length) return { layout: null, order: unitIds };
    const built = treeForCells(source, unitIds);
    if (!built.layout) return { layout: null, order: unitIds };
    return { layout: clipLongBranches(built.layout, longBranchCap(built.layout)), order: [...built.layout.leaves, ...built.unplaced] };
  }, [tree, unitIds]);
  const cellOrder = treeLayout.order;
  const orderedUnits = useMemo(() => cellOrder.map((id) => unitById.get(id)).filter(Boolean), [cellOrder, unitById]);
  const rowsList = useMemo(() => buildRows(orderedUnits, mode, expanded), [orderedUnits, mode, expanded]);
  const groupColor = useCallback((g) => allUnits.groups[g]?.color || "#999", [allUnits]);

  const tracksOn = useMemo(() => ({ graph: showGraph, coverage: showCov }), [showGraph, showCov]);
  const viewH = narrow ? 520 : 680;
  const effBase = autoFit ? autoFitBase(rowsList, base, overrides, tracksOn, viewH, ROW_GAP) : base;
  // the genome-graph component needs room for its bars and axis: graph rows are at least GGRAPH_MIN px in that style
  const ov = useMemo(() => (graphStyle === "ggraph" ? { ...overrides, graph: Math.max(overrides.graph ?? effBase, GGRAPH_MIN) } : overrides), [graphStyle, overrides, effBase]);
  const { items, total } = useMemo(() => rowOffsets(rowsList, effBase, ov, tracksOn, ROW_GAP), [rowsList, effBase, ov, tracksOn]);
  const bodyH = Math.max(60, Math.min(viewH, total));
  const visibleItems = useMemo(() => items.filter((it) => it.top + it.height >= scrollTop - 200 && it.top <= scrollTop + bodyH + 200), [items, scrollTop, bodyH]);
  const coverageIds = useMemo(() => {
    if (!showCov) return [];
    const ids = visibleItems.filter((it) => it.row.kind === "cell" && it.coverage > 0).map((it) => it.row.id);
    pinned.forEach((k) => k.startsWith("cell:") && ids.push(k.slice(5)));
    return ids;
  }, [visibleItems, showCov, pinned]);

  const data = useUnitData({ dataPath, patient: patientId, genome, unitIds, coverageIds, graphTrack, coverageTrack, cellFiles });

  // ----- patient junctions and slice regions
  const [junctions, setJunctions] = useState({ status: "loading", list: [] });
  const [sliceRegions, setSliceRegions] = useState(undefined); // undefined until fetched, null when absent
  useEffect(() => {
    if (!patientId || !junctionTrack) return;
    const url = resolveUrl(junctionTrack.url, { dataPath, patient: patientId, genome, base: specBase });
    tryGet(url).then((r) => {
      if (r.status !== "ok") return setJunctions({ status: r.status, list: [] });
      const min = junctionTrack.min?.n_cells_tumour ?? MIN_JUNCTION_CELLS;
      return setJunctions({ status: "ok", list: (r.data.junctions || []).map(parseJunctionRow).filter((j) => j.nCells >= min) });
    });
    tryGet(casePath(dataset, patientId, "slices/regions.json")).then((r) => setSliceRegions(r.status === "ok" ? r.data : null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, junctionTrack?.url, dataPath]);

  // ----- geometry
  // geometry shared by every track: the genome-graph component's layout (gapX left / between / right of the windows)
  const treeW = mode === "cells" && !narrow && treeLayout.layout ? 110 : 0;
  const labelW = narrow ? 84 : mode === "cells" ? 128 : 160;
  const leftW = treeW + labelW;
  const gapX = narrow ? 28 : 40;
  const contentW = Math.max(160, width - leftW);
  const trackLeft = leftW + gapX;
  const slots = useMemo(() => layoutWindows(windows, contentW - 2 * gapX, gapX), [windows, contentW, gapX]);
  const domains = useMemo(() => windows.map((w) => windowToPlaces(chromoBins, w)).filter(Boolean), [windows, chromoBins]);

  // ----- per-window y scales: auto from the shown units' segment CNs (max or 99th percentile), shared, or manual
  const windowStats = useMemo(() => {
    const vals = slots.map(() => []);
    unitIds.forEach((id) => {
      const g = data.graphs.get(id);
      if (!g) return;
      graphInWindows(g, slots).segments.forEach((sg) => Number.isFinite(sg.cn) && vals[sg.slot].push(sg.cn));
    });
    return vals.map((v) => ({ max: valueQuantile(v, 1), p99: valueQuantile(v, 0.99) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitIds, slots, data.version]);
  const yStates = useMemo(() => slots.map((_, i) => ({ ...DEFAULT_Y, ...(windowY[i] || {}) })), [slots, windowY]);
  const scales = useMemo(() => resolveWindowScales(yStates, windowStats, shareY), [yStates, windowStats, shareY]);
  const differ = scalesDiffer(scales);
  const setY = (i, patch) => setWindowY((prev) => slots.map((_, k) => ({ ...DEFAULT_Y, ...(prev[k] || {}), ...(k === i ? patch : {}) })));

  // ----- clade pseudobulk (median CN, junction support) from the member cells' graphs
  const pseudobulk = useMemo(() => {
    const out = new Map();
    rowsList.filter((r) => r.kind === "clade").forEach((r) => out.set(r.group, pseudobulkInWindows(r.members.map((id) => data.graphs.get(id)), slots)));
    pinned.filter((k) => k.startsWith("clade:")).forEach((k) => {
      const g = k.slice(6);
      if (!out.has(g)) out.set(g, pseudobulkInWindows(orderedUnits.filter((u) => u.group === g).map((u) => data.graphs.get(u.id)), slots));
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsList, slots, data.version, pinned, orderedUnits]);

  // ----- reads (split igv.js view): both breakends of a junction or SNV positions; by cell, clone or all
  const [readsGroupBy, setReadsGroupBy] = useState(() => (["unit", "group", "all"].includes(urlParam("tbgroup")) ? urlParam("tbgroup") : "unit"));
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
    ({ points, ranked, label, flank, kind, carriersNote, groupBy = readsGroupBy, junction = null }) => {
      const max = Math.min(readsTrack?.max_units || SC_MAX_TRACK_CELLS, SC_MAX_TRACK_CELLS);
      const pooled = pooledFor(points);
      let cellIds = [...new Set(ranked)].slice(0, max);
      let pooledView = pooled;
      let note = pooled ? `pooled ${pooled.set} slices (RG = cell)` : "per-cell reads.bam slices";
      let rmode = groupBy;
      if (groupBy !== "unit" && !pooled) {
        rmode = "unit";
        note = "grouped reads not available (no pooled slice covers these loci): per-cell panes";
      } else if (groupBy === "group") {
        const members = {};
        cellOrder.forEach((id) => {
          const g = unitById.get(id)?.group ?? "no clone";
          (members[g] = members[g] || []).push(id);
        });
        const keys = Object.keys(members).slice(0, max).map((g) => [`${g} (${members[g].length} cells)`, members[g]]);
        cellIds = keys.map(([k]) => k);
        pooledView = { ...pooled, groups: Object.fromEntries(keys) };
        note = `by clone, tree order · ${note}`;
      } else if (groupBy === "all") {
        const k = `all shown cells (${cellOrder.length})`;
        cellIds = [k];
        pooledView = { ...pooled, groups: { [k]: cellOrder } };
        note = `all cells pooled · ${note}`;
      }
      setReads({
        label, carriersNote, note, mode: rmode, junction,
        view: {
          loci: points.map((e) => ({ chromosome: `chr${e.chrom}`, position: e.pos })),
          chromosome: `chr${points[0].chrom}`,
          position: points[0].pos,
          cellIds,
          window: flank,
          pooled: pooledView,
          label,
          kind,
          dnaHeight: readsH,
        },
      });
    },
    [readsTrack, pooledFor, cellOrder, unitById, readsGroupBy, readsH]
  );
  const openReads = useCallback(
    (junction, firstUnit = null, groupBy = readsGroupBy) => {
      const carriers = junctionCarriers(junction, cellOrder, data.graphs, 1000).sort((a, b) => b.cn - a.cn);
      let ids = carriers.map((c) => c.id);
      if (firstUnit) ids = [firstUnit, ...ids.filter((x) => x !== firstUnit)];
      openReadsAt({
        points: [junction.a, junction.b],
        ranked: ids,
        label: junction.id || `chr${junction.a.chrom}:${junction.a.pos}~chr${junction.b.chrom}:${junction.b.pos}`,
        flank: readsTrack?.window || 300,
        kind: "junction",
        carriersNote: `${carriers.length} of ${cellOrder.length} shown cells carry it in their graph (±1 kb); per-cell panes = top carriers by junction CN`,
        groupBy,
        junction,
      });
    },
    [cellOrder, data.graphs, readsTrack, openReadsAt, readsGroupBy]
  );
  const openSnvReads = (groupBy = readsGroupBy, text = snvText) => {
    const points = `${text}`
      .split("|")
      .map((t) => t.trim().replace(/,/g, "").match(/^(?:chr)?([0-9XYM]+)[:_](\d+)/i))
      .filter(Boolean)
      .map((m) => ({ chrom: m[1].toUpperCase(), pos: Number(m[2]) }));
    if (!points.length) return;
    openReadsAt({
      points,
      ranked: visibleItems.filter((it) => it.row.kind === "cell").map((it) => it.row.id).concat(cellOrder),
      label: points.map((e) => `chr${e.chrom}:${e.pos.toLocaleString()}`).join(" | "),
      flank: 40,
      kind: "snv",
      carriersNote: "per-cell panes = the cells in view (else the first in tree order)",
      groupBy,
    });
  };
  const linkDone = useRef(false);
  const graphsLoaded = unitIds.length > 0 && unitIds.every((id) => data.status.get(`graph:${id}`) && data.status.get(`graph:${id}`) !== "loading");
  useEffect(() => {
    if (linkDone.current || !graphsLoaded || sliceRegions === undefined) return;
    const jx = urlParam("tbjx");
    const snv = urlParam("tbsnv");
    if (jx) {
      const ends = jx.split("|").map((t) => t.trim().match(/^(?:chr)?([0-9XYM]+):(\d+)([+-])?$/i));
      if (ends.length === 2 && ends.every(Boolean)) {
        linkDone.current = true;
        const [a, b] = ends.map((m) => ({ chrom: m[1].toUpperCase(), pos: Number(m[2]), sign: m[3] === "-" ? -1 : 1 }));
        openReads({ id: jx, a, b });
      }
    } else if (snv) {
      linkDone.current = true;
      setSnvText(snv);
      openSnvReads(readsGroupBy, snv);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphsLoaded, sliceRegions]);
  useEffect(() => setUrlParam("tbgroup", readsGroupBy === "unit" ? null : readsGroupBy), [readsGroupBy]);
  const lastReads = useRef(null);
  lastReads.current = reads;
  useEffect(() => {
    const r = lastReads.current;
    if (!r) return;
    if (r.view.kind === "junction" && r.junction) openReads(r.junction, null, readsGroupBy);
    else openSnvReads(readsGroupBy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readsGroupBy, readsH]);

  // ----- drawing
  const headerRef = useRef(null);
  const hitsRef = useRef({ header: [], body: [], pin: [], tree: [], pinRows: [] });
  const headerH = HEADER.ruler + HEADER.genes + (junctionTrack ? junctionH : 0);

  useEffect(() => {
    const ctx = setupCanvas(headerRef.current, width, headerH);
    if (!ctx || !slots.length) return;
    drawRuler(ctx, slots, trackLeft, 0, HEADER.ruler);
    drawGenes(ctx, slots, genes, chromoBins, trackLeft, HEADER.ruler, HEADER.genes, HIGHLIGHT_GENES);
    const label = (s, y) => {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "11px system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillText(s, trackLeft - 6, y);
    };
    label("genes", HEADER.ruler + 4);
    let hits = [];
    if (junctionTrack) {
      const y = HEADER.ruler + HEADER.genes;
      const maxCells = junctions.list.reduce((m, j) => Math.max(m, j.nCells), 1);
      hits = drawJunctions(ctx, slots, junctions.list, trackLeft, y, junctionH, maxCells);
      label(junctions.status === "ok" ? "junctions" : `junctions n/a (${junctions.status})`, y + 4);
      if (!narrow) label(`≥ ${junctionTrack.min?.n_cells_tumour ?? MIN_JUNCTION_CELLS} tumor cells;`, y + 18);
      if (!narrow) label("height = cells", y + 31);
    }
    hitsRef.current.header = hits;
  }, [width, headerH, slots, genes, chromoBins, junctions, junctionTrack, trackLeft, junctionH, narrow]);

  // pinned rows (tall, above the stack)
  const pinnedRows = useMemo(
    () =>
      pinned
        .map((k) => (k.startsWith("clade:")
          ? { key: k, kind: "clade", group: k.slice(6), members: orderedUnits.filter((u) => u.group === k.slice(6)).map((u) => u.id), depth: 0 }
          : { key: k, kind: "cell", id: k.slice(5), group: unitById.get(k.slice(5))?.group, depth: 0 }))
        .filter((r) => (r.kind === "clade" ? r.members.length > 0 : unitById.has(r.id))),
    [pinned, orderedUnits, unitById]
  );
  const pinLayout = useMemo(() => {
    let top = 0;
    return pinnedRows.map((row) => {
      const gH = row.kind === "clade" ? PIN_H.clade : showGraph ? PIN_H.graph : 0;
      const cH = row.kind === "clade" ? 0 : showCov ? PIN_H.coverage : 0;
      const it = { row, top, graph: gH, coverage: cH, height: gH + cH };
      top += it.height + 6;
      return it;
    });
  }, [pinnedRows, showGraph, showCov]);

  // tree (all cells mode): a sticky canvas at the left of the scrolling stack
  const treeRef = useRef(null);
  useEffect(() => {
    if (!treeW) return;
    const ctx = setupCanvas(treeRef.current, treeW, bodyH);
    if (!ctx) return;
    const centers = new Map(items.filter((it) => it.row.kind === "cell").map((it) => [it.row.id, it.top + it.height / 2]));
    hitsRef.current.tree = drawTree(ctx, treeLayout.layout, (id) => centers.get(id) ?? -1000, treeW, scrollTop, bodyH, (id) => groupColor(unitById.get(id)?.group));
  }, [treeW, bodyH, items, treeLayout, scrollTop, groupColor, unitById]);

  // one row (clade or cell): HTML label (clade strip, name, pin / expand, resize handles), then the graph sub-row
  // (genome-graph component, or the canvas alternative) and the coverage sub-row (canvas, two axes)
  const renderRow = (it, { pinnedRow = false } = {}) => {
    const { row } = it;
    const gH = it.graph;
    const cH = it.coverage;
    const color = groupColor(row.group);
    const isClade = row.kind === "clade";
    const unit = isClade ? null : unitById.get(row.id) || { id: row.id, group: row.group };
    const pb = isClade ? pseudobulk.get(row.group) : null;
    const members = row.members || [];
    const resolved = isClade && members.every((id) => data.status.get(`graph:${id}`) && data.status.get(`graph:${id}`) !== "loading");
    const missingAll = isClade && resolved && members.length && members.every((id) => data.status.get(`graph:${id}`) !== "ok") ? members.length : 0;
    const raw = isClade ? null : data.graphs.get(row.id);
    const gStatus = isClade ? (pb && pb.n ? "ok" : missingAll ? "missing" : "loading") : data.status.get(`graph:${row.id}`) || "loading";
    const short = isClade ? row.group : `${row.id}`.replace(`${patientId}_`, "");
    const pinKey = row.key;
    const isPinned = pinned.includes(pinKey);
    const togglePin = () => setPinned((p) => (p.includes(pinKey) ? p.filter((k) => k !== pinKey) : [...p.slice(-2), pinKey]));
    const handle = (type, y) => (
      <div
        key={type}
        title={`drag to resize ${type} rows`}
        onMouseDown={(e) => startResize(e, type, type === "graph" ? gH : cH, isClade)}
        style={{ position: "absolute", left: treeW, width: labelW, top: y - 3, height: 6, cursor: "ns-resize", zIndex: 3 }}
      />
    );
    const graphNote = gStatus === "missing" ? (isClade ? `graph not available (no complex.json for these ${missingAll} cells${row.group === "Normal" ? "; normal cells have no JaBbA fit" : ""})` : "graph not available (no complex.json)") : "graph: loading";
    return (
      <div key={`${pinnedRow ? "pin" : "row"}:${row.key}`} style={{ position: pinnedRow ? "relative" : "absolute", top: pinnedRow ? undefined : it.top, left: 0, width, height: it.height, marginBottom: pinnedRow ? 6 : 0, borderBottom: "1px solid #eee" }}>
        <div style={{ position: "absolute", left: treeW, top: 0, width: labelW - 4, height: it.height, overflow: "hidden", borderLeft: `6px solid ${color}`, paddingLeft: 6 + (row.depth ? 10 : 0), fontSize: 11, lineHeight: "14px", background: pinnedRow ? "#fffaf0" : "#fff" }}>
          {isClade ? (
            <>
              <div style={{ fontWeight: 600, fontSize: 12, cursor: pinnedRow ? "default" : "pointer", marginTop: 2 }} onClick={() => !pinnedRow && setExpanded((ex) => ({ ...ex, [row.group]: !ex[row.group] }))}>
                {pinnedRow ? "" : expanded[row.group] ? "▾ " : "▸ "}{short}
              </div>
              <div style={{ color: COLORS.muted }}>pseudobulk · {members.length} cells</div>
            </>
          ) : (
            <>
              <div style={{ marginTop: 2, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }} title={row.id}>{short}</div>
              {it.height >= 30 && <div style={{ color: COLORS.muted }}>{unit.group ?? ""}{unit.ploidy ? ` · ψ ${unit.ploidy.toFixed(2)}` : ""}</div>}
            </>
          )}
          {it.height >= 44 && (
            <a style={{ fontSize: 11 }} onClick={togglePin}>{isPinned ? "unpin" : "pin tall"}</a>
          )}
          {it.height < 44 && <a style={{ fontSize: 11, position: "absolute", right: 2, top: 1 }} onClick={togglePin} title={isPinned ? "unpin" : "pin tall"}>{isPinned ? "×" : "⇕"}</a>}
          {!isClade && it.height >= 60 && !narrow && gH > 0 && cH > 0 && <div style={{ color: COLORS.muted, position: "absolute", top: gH + 2 }}>coverage</div>}
        </div>
        <div style={{ position: "absolute", left: leftW, top: 0, width: contentW }}>
          {gH > 0 && (graphStyle === "ggraph"
            ? (gStatus === "ok" ? <GraphPlotRow raw={raw} pb={pb} height={gH} width={contentW} minFrac={minSupport / 100} onJunction={(j) => openReads(j, isClade ? null : row.id)} /> : <NoteRow text={graphNote} width={contentW} height={gH} />)
            : <CanvasRow kind={isClade ? "clade" : "cell"} unit={unit} row={row} pb={pb} graph={raw} graphH={gH} covH={0} width={contentW} minFrac={minSupport / 100} graphStatus={gStatus} missingAll={missingAll} />)}
          {cH > 0 && !isClade && (
            <div onMouseMove={(e) => coverageHover(e, it, unit)} onMouseLeave={() => setHover(null)}>
              <CanvasRow kind="cell" unit={unit} row={row} graph={raw} coverage={data.coverage.get(row.id)} graphH={0} covH={cH} width={contentW} covStatus={data.status.get(`cov:${row.id}`)} />
            </div>
          )}
        </div>
        {!pinnedRow && gH > 0 && handle("graph", gH)}
        {!pinnedRow && cH > 0 && handle("coverage", gH + cH)}
      </div>
    );
  };

  // ----- interaction (header canvas: pan, zoom, junction clicks; rows: the genome-graph component's own hover)
  const scrollRef = useRef(null);
  const slotAt = (x) => slots.findIndex((s) => x >= trackLeft + s.x0 && x <= trackLeft + s.x0 + s.width);
  const drag = useRef(null);
  const localXY = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const startResize = (e, type, start, clade) => {
    e.preventDefault();
    const y0 = e.clientY;
    const move = (ev) => {
      setAutoFit(false);
      setOverrides((o) => ({ ...o, [type]: clampHeight((start + ev.clientY - y0) / (clade ? 1.6 : 1)) }));
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  const onDown = (e) => {
    const [x] = localXY(e);
    const k = slotAt(x);
    if (k < 0) return;
    drag.current = { k, x: e.clientX, start: windows[k], moved: false };
  };
  const onMove = (e) => {
    const [x, y] = localXY(e);
    const d = drag.current;
    if (d) {
      const dx = e.clientX - d.x;
      if (Math.abs(dx) > 2) d.moved = true;
      if (d.moved) {
        const s = slots[d.k];
        const bpPerPx = (d.start.end - d.start.start) / s.width;
        setWindows(windows.map((w, i) => (i === d.k ? panWindow(d.start, -dx * bpPerPx, chromLength(chromoBins, w.chrom)) : w)));
      }
      return;
    }
    const hit = hitTest(hitsRef.current.header, x, y, 5);
    const k = slotAt(x);
    const pos = k >= 0 ? Math.round(pxToBp(slots[k], x - trackLeft - slots[k].x0)) : null;
    setHover(hit || k >= 0 ? { cx: e.clientX, cy: e.clientY, which: "header", hit, k, pos } : null);
  };
  const onUp = (e) => {
    const d = drag.current;
    drag.current = null;
    if (d && d.moved) {
      setLocusText(formatLocus(windows));
      return;
    }
    const [x, y] = localXY(e);
    const hit = hitTest(hitsRef.current.header, x, y, 5);
    if (hit?.kind === "junction") openReads(hit.junction);
  };
  const coverageHover = (e, it, unit) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left + leftW;
    const k = slotAt(x);
    const pos = k >= 0 ? Math.round(pxToBp(slots[k], x - trackLeft - slots[k].x0)) : null;
    setHover({ cx: e.clientX, cy: e.clientY, which: "body", k, pos, rowInfo: { item: it, sub: "coverage" }, unit });
  };
  const onTreeClick = (e) => {
    const [x, y] = localXY(e);
    const node = (hitsRef.current.tree || []).reduce((bst, n) => {
      const dd = (n.x - x) ** 2 + (n.y - y) ** 2;
      return dd < 80 && (!bst || dd < bst.d) ? { n, d: dd } : bst;
    }, null);
    if (node && treeLayout.layout) {
      const nd = treeLayout.layout.nodes[node.n.id];
      setCladeIds(treeLayout.layout.leaves.slice(nd.firstLeaf, nd.lastLeaf + 1));
      setScrollTop(0);
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    }
  };
  // the genome-graph component asked for new domains (interval click, meta-zoom): the shared windows follow
  const onPlotDomains = useCallback(
    (newDomains) => {
      const next = (newDomains || []).map((d) => placesToWindow(chromoBins, d)).filter(Boolean);
      if (next.length) applyWindows(next);
    },
    [chromoBins, applyWindows]
  );
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
    const els = [headerRef.current].filter(Boolean);
    const handler = (e) => {
      e.preventDefault();
      const r = e.currentTarget.getBoundingClientRect();
      zoomRef.current((e.deltaY || e.deltaX) > 0 ? 1.25 : 0.8, e.clientX - r.left);
    };
    els.forEach((el) => el.addEventListener("wheel", handler, { passive: false }));
    return () => els.forEach((el) => el.removeEventListener("wheel", handler));
  }, [slots.length]);

  const preset = Object.entries(PRESETS).find(([, v]) => v === base)?.[0] || null;
  const exportSpec = () => {
    const s = buildSpec({
      id: `${patientId}_${Date.now()}`,
      title: `${patientId} ${formatLocus(windows)}`,
      genome,
      patient: patientId,
      windows,
      units: { ...allUnits, list: units },
      tracks: tracks.map((t) => {
        if (t.type === "graph") return { ...t, visible: showGraph, height: overrides.graph ?? base };
        if (t.type === "coverage") return { ...t, visible: showCov, height: overrides.coverage ?? base };
        if (t.type === "junctions") return { ...t, height: junctionH };
        if (t.type === "reads") return { ...t, height: readsH };
        return t;
      }),
      selection: groups.length || cladeIds ? { ...(groups.length ? { clades: groups } : {}), ...(cladeIds ? { units: cladeIds } : {}) } : null,
      provenance: { source: "gOS track browser export", data: "interim gOS per-cell files" },
    });
    s.windows = windows.map((w, i) => ({ locus: s.loci[i], y: { mode: yStates[i].mode, min: scales[i].min, max: scales[i].max, log: scales[i].log, robust: yStates[i].robust } }));
    s.layout = { row_height: base, overrides, auto_fit: autoFit, junction_height: junctionH, reads_height: readsH, mode, share_y: shareY, pinned, clade_min_support: minSupport, graph_style: graphStyle };
    const blob = new Blob([JSON.stringify(s, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${patientId}_track_spec.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  if (!patientId) return <Alert type="info" showIcon message="Track browser: open a single-cell patient." />;
  if (!cells.length) return <Alert type="info" showIcon message="Track browser: cells not available for this patient." />;

  const tip = hover ? tooltipText(hover, { data, slots, chromoBins, genes, pseudobulk, cellOrder, unitById }) : null;
  const heightMenu = (
    <div style={{ width: 260 }}>
      {[["graph", "graph rows"], ["coverage", "coverage rows"]].map(([k, lab]) => (
        <div key={k} style={{ marginBottom: 6 }}>
          <Text style={{ fontSize: 12 }}>{lab}: {overrides[k] ?? `slider (${base})`} px</Text>
          <Space>
            <Slider style={{ width: 150 }} min={HEIGHT_MIN} max={HEIGHT_MAX} value={overrides[k] ?? base} onChange={(v) => { setAutoFit(false); setOverrides((o) => ({ ...o, [k]: v })); }} />
            <Button size="small" type="link" onClick={() => setOverrides((o) => ({ ...o, [k]: null }))}>reset</Button>
          </Space>
        </div>
      ))}
      <Text style={{ fontSize: 12 }}>junction track: {junctionH} px</Text>
      <Slider min={30} max={240} value={junctionH} onChange={setJunctionH} />
      <Text style={{ fontSize: 12 }}>reads panes: {readsH} px</Text>
      <Slider min={80} max={600} value={readsH} onChange={setReadsH} />
      <Text type="secondary" style={{ fontSize: 11 }}>Or drag a row&apos;s lower edge in the label column.</Text>
    </div>
  );

  const locus = { windows, setWindows: applyWindows, slots, scales, domains, chromoBins, onPlotDomains, geometry: { leftW, gapX, contentW, trackLeft } };
  return (
    <TrackLocusContext.Provider value={locus}>
    <Card size="small" className="sc-track-browser" title={<Space wrap><span>Track browser</span><Tag color="blue">preview</Tag>{!narrow && <Text type="secondary">spec {spec.status === "ok" ? `${spec.data.version} · ${spec.data.id}` : "0.3 · interim gOS files"}</Text>}</Space>}>
      <Space wrap style={{ marginBottom: 6 }}>
        <Input.Search style={{ width: narrow ? Math.max(200, width - 10) : 470 }} size="small" value={locusText} onChange={(e) => setLocusText(e.target.value)} onSearch={(v) => setLocusText(v)} enterButton="Go" placeholder="chr12:57,000,000-70,000,000 | chr11:39.2m-39.7m" />
        <Select size="small" style={{ width: 180 }} placeholder="preset loci" value={null} options={presets.map((p) => ({ label: p.label, value: p.locus }))} onChange={(v) => setLocusText(v)} />
        <Button size="small" icon={<LeftOutlined />} onClick={() => applyWindows(windows.map((w) => panWindow(w, -(w.end - w.start) * 0.25, chromLength(chromoBins, w.chrom))))} />
        <Button size="small" icon={<RightOutlined />} onClick={() => applyWindows(windows.map((w) => panWindow(w, (w.end - w.start) * 0.25, chromLength(chromoBins, w.chrom))))} />
        <Button size="small" icon={<ZoomInOutlined />} onClick={() => zoomAt(0.5)} />
        <Button size="small" icon={<ZoomOutOutlined />} onClick={() => zoomAt(2)} />
        <Tooltip title="Export this view (loci, per-window y, row heights, selection) as a gos-track-spec JSON for gCells / gTrack">
          <Button size="small" icon={<DownloadOutlined />} onClick={exportSpec}>{narrow ? "" : "Export spec"}</Button>
        </Tooltip>
      </Space>
      <Space wrap style={{ marginBottom: 6 }}>
        <Segmented size="small" value={mode} onChange={(v) => { setMode(v); setScrollTop(0); if (scrollRef.current) scrollRef.current.scrollTop = 0; }} options={[{ label: "clade pseudobulk", value: "pseudobulk" }, { label: "all cells + tree", value: "cells" }]} />
        {mode === "pseudobulk" && <Space size={4}><Text>clade junctions ≥</Text><InputNumber size="small" min={0} max={100} value={minSupport} onChange={(v) => setMinSupport(v ?? 0)} style={{ width: 62 }} /><Text>% of cells</Text></Space>}
        {mode === "pseudobulk" && <Button size="small" onClick={() => setExpanded(Object.values(expanded).some(Boolean) ? {} : Object.fromEntries(Object.keys(allUnits.groups).map((g) => [g, true])))}>{Object.values(expanded).some(Boolean) ? "collapse all" : "expand all"}</Button>}
        <Space size={4}><Switch size="small" checked={showGraph} onChange={setShowGraph} /><Text>graph</Text></Space>
        <Segmented size="small" value={graphStyle} onChange={setGraphStyle} options={[{ label: "gGraph", value: "ggraph" }, { label: "compact", value: "canvas" }]} />
        <Space size={4}><Switch size="small" checked={showCov} onChange={setShowCov} /><Text>coverage</Text></Space>
        <Space size={4}>
          <Text>row height</Text>
          <Slider style={{ width: narrow ? 110 : 160, margin: "0 6px" }} min={HEIGHT_MIN} max={HEIGHT_MAX} value={autoFit ? effBase : base} onChange={(v) => { setBase(v); setAutoFit(false); }} />
          <Text type="secondary" style={{ minWidth: 44 }}>{autoFit ? `${effBase} px (fit)` : `${base} px`}</Text>
        </Space>
        <Segmented size="small" value={autoFit ? null : preset} onChange={(v) => { setBase(PRESETS[v]); setOverrides({ graph: null, coverage: null }); setAutoFit(false); }} options={[{ label: "Compact", value: "compact" }, { label: "Readable", value: "readable" }, { label: "Large", value: "large" }]} />
        <Space size={4}><Switch size="small" checked={autoFit} onChange={setAutoFit} /><Text>auto-fit</Text></Space>
        <Popover trigger="click" content={heightMenu} title="Per-track heights"><Button size="small" icon={<SettingOutlined />}>{narrow ? "" : "track heights"}</Button></Popover>
        <Space size={4}><Switch size="small" checked={shareY} onChange={setShareY} /><Text>share y across windows</Text></Space>
        <Select size="small" mode="multiple" allowClear style={{ minWidth: 160 }} placeholder="clones (all)" value={groups} options={groupOptions} onChange={setGroups} />
        <Space size={4}><Switch size="small" checked={hideNormal} onChange={setHideNormal} /><Text>hide normal</Text></Space>
        {cladeIds && <Button size="small" onClick={() => setCladeIds(null)}>show all cells (clade of {cladeIds.length})</Button>}
      </Space>
      {locusError && <Alert type="warning" showIcon message={locusError} style={{ marginBottom: 6 }} />}
      {spec.status === "error" && <Alert type="warning" showIcon message={spec.error} style={{ marginBottom: 6 }} />}
      <div style={{ fontSize: 12, color: "#555", marginBottom: 4, lineHeight: 1.45 }}>
        {mode === "pseudobulk"
          ? "Clade pseudobulk rows: black = median JaBbA CN of the clade's cells, blue band = interquartile range, arcs = junctions carried by at least the set % of the clade's cells (thicker = more cells; computed in the browser from the per-cell graphs until the gCells export lands). Click a clade label to list its cells."
          : `${cellOrder.length} cells in tree order. Graph rows: JaBbA segments at CN, arcs = junctions. Coverage rows: grey = binned coverage on the CN scale (each cell's ploidy ψ), red = segments, blue × = expected depth (f × the cell's mean depth, not raw depth).`}
        {" "}Graph rows use the standard gOS genome-graph view (hover for interval / junction details). Each window has its own y scale. Pin a row to read it tall; click a junction for reads at both breakends; drag the ruler to pan, wheel on it to zoom.
      </div>
      <div ref={wrapRef} style={{ position: "relative", width: "100%" }}>
        <div style={{ position: "relative", height: 26 }}>
          {slots.map((s, i) => (
            <div key={i} style={{ position: "absolute", left: trackLeft + s.x0, width: s.width, top: 0, display: "flex", gap: 4, alignItems: "center", overflow: "hidden", whiteSpace: "nowrap" }}>
              <Popover
                trigger="click"
                title={`y scale · ${formatLocus([s.window])}`}
                content={
                  <div style={{ width: 250 }}>
                    <Segmented size="small" value={yStates[i].mode} onChange={(v) => setY(i, { mode: v })} options={[{ label: "auto", value: "auto" }, { label: "shared", value: "shared" }, { label: "manual", value: "manual" }]} />
                    <div style={{ marginTop: 6 }}><Space size={4}><Switch size="small" checked={Boolean(scales[i]?.log)} onChange={(v) => setY(i, { log: v })} /><Text>log</Text></Space></div>
                    <div style={{ marginTop: 6 }}><Space size={4}><Switch size="small" checked={Boolean(yStates[i].robust)} onChange={(v) => setY(i, { robust: v })} disabled={yStates[i].mode === "manual"} /><Text>robust (99th percentile; clipped values marked ▲)</Text></Space></div>
                    {yStates[i].mode === "manual" && (
                      <Space style={{ marginTop: 6 }}>
                        <Text>min</Text><InputNumber size="small" min={0} value={yStates[i].min} onChange={(v) => setY(i, { min: v ?? 0 })} style={{ width: 70 }} />
                        <Text>max</Text><InputNumber size="small" min={1} value={yStates[i].max ?? scales[i]?.max} onChange={(v) => setY(i, { max: v })} style={{ width: 80 }} />
                      </Space>
                    )}
                  </div>
                }
              >
                <Button size="small" icon={<SettingOutlined />} style={{ fontSize: 11 }}>
                  y {scales[i]?.shared ? "shared" : yStates[i].mode}{scales[i]?.log ? " log" : ""} {scales[i]?.min}–{scales[i]?.max}
                </Button>
              </Popover>
              {differ && i === 0 && <Tag color="orange" style={{ fontSize: 11, margin: 0 }}>y scale differs between windows</Tag>}
            </div>
          ))}
        </div>
        <canvas ref={headerRef} style={{ display: "block", cursor: "grab" }} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={() => { drag.current = null; setHover(null); }} />
        {pinLayout.length > 0 && (
          <div style={{ borderTop: "2px solid #f39c12", borderBottom: "2px solid #f39c12", background: "#fffaf0", margin: "2px 0" }}>
            <div style={{ fontSize: 11, color: "#8a5a00", padding: "1px 4px", height: 16 }}>Pinned ({pinLayout.length}/3) · tall rows for close reading</div>
            {pinLayout.map((it) => renderRow(it, { pinnedRow: true }))}
          </div>
        )}
        <div ref={scrollRef} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} style={{ height: bodyH, overflowY: "auto", overflowX: "hidden", position: "relative", borderTop: "1px solid #ddd" }}>
          <div style={{ height: total, position: "relative" }}>
            {treeW > 0 && <canvas ref={treeRef} onClick={onTreeClick} style={{ position: "sticky", top: 0, display: "block", cursor: "pointer", zIndex: 2 }} title="click a node: show its clade" />}
            <div style={{ position: "absolute", left: 0, top: 0, width, height: total }}>{visibleItems.map((it) => renderRow(it))}</div>
          </div>
        </div>
        {tip && (
          <div style={{ position: "fixed", left: Math.min(hover.cx + 14, (typeof window !== "undefined" ? window.innerWidth : 1600) - 330), top: hover.cy + 14, background: "rgba(255,255,255,0.97)", border: "1px solid #ccc", borderRadius: 4, padding: "4px 8px", fontSize: 12, pointerEvents: "none", whiteSpace: "pre", zIndex: 1000, boxShadow: "0 1px 4px rgba(0,0,0,0.15)", maxWidth: 420 }}>
            {tip}
          </div>
        )}
      </div>
      <Space wrap style={{ marginTop: 10 }}>
        <Text strong>Reads</Text>
        <Segmented size="small" value={readsGroupBy} onChange={setReadsGroupBy} options={[{ label: "by cell", value: "unit" }, { label: "by clone", value: "group" }, { label: "all cells", value: "all" }]} />
        <Input.Search size="small" style={{ width: narrow ? Math.max(200, width - 10) : 380 }} value={snvText} onChange={(e) => setSnvText(e.target.value)} onSearch={() => openSnvReads()} enterButton="SNV reads" placeholder="SNV / base positions: chr12:57,751,234 | chr12:69,210,500" />
        <Text type="secondary" style={{ fontSize: 12 }}>or click a junction arc</Text>
      </Space>
      {reads && (
        <Card size="small" style={{ marginTop: 6 }} title={<Space wrap><span>{reads.view.kind === "snv" ? "Reads at SNV / positions (±40 bp)" : "Reads at both breakends"}</span><Text type="secondary" style={{ fontSize: 12 }}>{reads.label} · {reads.carriersNote} · {reads.note}</Text></Space>} extra={<Button size="small" type="text" onClick={() => setReads(null)}>close</Button>}>
          {reads.view.cellIds.length ? <CellIgvPanel key={`${reads.mode}|${reads.view.label}|${readsH}`} view={reads.view} embedded /> : <Alert type="info" showIcon message="reads not available (no cell carries this junction in its graph)" />}
        </Card>
      )}
    </Card>
    </TrackLocusContext.Provider>
  );
}

function tooltipText(h, { data, slots, chromoBins, genes, pseudobulk, cellOrder, unitById }) {
  const lines = [];
  const hit = h.hit;
  if (hit?.kind === "junction") {
    const j = hit.junction;
    lines.push(`${j.id}`, `${j.cls} · ${j.nCells} tumor cells · ${j.nReads} reads · ${j.nNormal} normal cells`, `genes: ${j.genes || "none"}`, "click: reads at both breakends");
    return lines.join("\n");
  }
  if (hit?.kind === "alt") {
    const a = hit.alt;
    lines.push(`junction ${a.title || ""} chr${a.a.chrom}:${a.a.pos.toLocaleString()} ~ chr${a.b.chrom}:${a.b.pos.toLocaleString()}`);
    if (hit.unit.pseudobulk) lines.push(`carried by ${a.cells} of ${hit.unit.n} ${hit.unit.group} cells (${Math.round(100 * a.frac)}%) · median junction CN ${a.cn ?? "n/a"}`);
    else {
      const n = junctionCarriers(a, cellOrder, data.graphs, 1000).length;
      lines.push(`${hit.unit.id}: junction CN ${a.cn}`, `support: carried by ${n} of ${cellOrder.length} shown cells (±1 kb)`);
    }
    lines.push("click: reads at both breakends");
    return lines.join("\n");
  }
  const row = h.rowInfo?.item?.row;
  if (h.k == null || h.k < 0 || !slots[h.k]) return row ? `${row.kind === "clade" ? `${row.group} pseudobulk` : row.id}` : null;
  const chrom = slots[h.k].window.chrom;
  const g = toGlobal(chromoBins, chrom, h.pos);
  const gene = geneAt(genes, g);
  lines.push(`chr${chrom}:${h.pos.toLocaleString()}${gene ? ` · ${gene}` : ""}`);
  if (hit?.kind === "segment") {
    const s = hit.seg;
    if (hit.unit.pseudobulk) lines.push(`${hit.unit.group} pseudobulk: median CN ${s.cn} (IQR ${s.q1}-${s.q3}, ${s.n} cells)`);
    else lines.push(`${hit.unit.id}: node CN ${s.cn} (${s.start.toLocaleString()}-${s.end.toLocaleString()})`);
  }
  if (row?.kind === "clade") {
    const pb = pseudobulk.get(row.group);
    const st = pb?.steps.find((x) => x.slot === h.k && h.pos >= x.start && h.pos <= x.end);
    if (st && hit?.kind !== "segment") lines.push(`${row.group} pseudobulk: median CN ${st.median} (IQR ${st.q1}-${st.q3}, ${st.n} cells)`);
  } else if (row?.kind === "cell") {
    const u = unitById.get(row.id) || { id: row.id };
    const fit = unitFit(u);
    lines.push(`${u.id} · ${u.group ?? ""} · ψ ${fit.ploidy ? fit.ploidy.toFixed(2) : "n/a"} · mean depth ${fit.meanDepth ? `${fit.meanDepth.toFixed(2)}×` : "not available"}`);
    const gr = data.graphs.get(u.id);
    const seg = gr ? (gr.intervals || []).find((iv) => `${iv.chromosome}`.replace(/^chr/, "") === chrom && h.pos >= iv.startPoint && h.pos <= iv.endPoint) : null;
    if (seg && hit?.kind !== "segment") lines.push(`node CN ${seg.y} (${seg.startPoint.toLocaleString()}-${seg.endPoint.toLocaleString()})`);
    const cov = data.coverage.get(u.id);
    if (cov && h.rowInfo.sub === "coverage") {
      const i = lowerBound(cov.x, g + 1) - 1;
      if (i >= 0 && g - cov.x[i] < cov.binWidth) {
        const cn = cov.y[i];
        if (fit.ploidy) {
          const f = foregroundFromCn(cn, fit.purity, fit.ploidy);
          lines.push(`coverage bin: f ${f.toFixed(2)} · CN ${cn.toFixed(2)} · expected depth ${fit.meanDepth ? `${expectedDepth(f, fit.meanDepth).toFixed(1)}×` : "not available"}`);
        } else lines.push(`coverage bin: CN ${cn.toFixed(2)} (f not available: no ploidy)`);
      } else lines.push("coverage: no bin here (masked)");
    }
  }
  if (row) lines.push(h.which === "pin" ? "click label: unpin" : row.kind === "clade" ? "click label: cells · click track: pin" : "click: pin this row tall");
  return lines.join("\n");
}
