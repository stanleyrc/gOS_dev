import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Card, Checkbox, Col, Collapse, Empty, InputNumber, Row, Segmented, Select, Space, Switch, Typography } from "antd";
import { BarChartOutlined, BranchesOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import { cellsForPatient } from "../../../helpers/singleCell/cellFiles";
import { groupCombinations, subclonalFindings, walkGroups } from "../../../helpers/singleCell/figures";
import { AmpliconUpset, AmpliconViolins } from "./ampliconLandscape";
import PhyloSignalPanel from "./phyloSignalPanel";
import SubclonalFindingsTable from "./subclonalFindingsTable";
import PatientEcdnaView from "./patientEcdnaView";
import { Provenance } from "../hintLine";
import { FigureStyleDefault, useFigureStyleName } from "./figureCanvas";
import { ExportPanel, PanelHead } from "./figureKit";
import PaperFiguresViewer from "../paper/paperFiguresViewer";
import { PAPER_FIGURES_DIR, PAPER_MANIFEST_FILE, parsePaperManifest, targetSearch } from "../../../helpers/singleCell/paperManifest";
import StateQuadrant from "./stateQuadrant";
import PhyloSignalStrip from "./phyloSignalStrip";
import useCohortExport from "../cohort/useCohortExport";
import { casePath, tryGet } from "../../../redux/singleCell/loaders";
import { AMPLICON_STRUCTURES_FILE, PHYLO_SIGNAL_FILE, STATE_SCORES_FILE, parseAmpliconStructures, parseStateScores } from "../../../helpers/singleCell/paperPanels";
import { AmpliconClassUpset, AmpliconClassViolins } from "./ampliconClasses";
import { BurdenByState, FractionAboveMes, SubclonalPerPatient } from "./fig1Burden";
import { burdenByState, subclonalPerCell } from "../../../helpers/singleCell/paperPanels";
import { dominantGroupIndex } from "../../../helpers/singleCell/figureDefaults";
import singleCellActions from "../../../redux/singleCell/actions";
import { FIGURE_STYLES, FIGURES_VIEW_STYLE, figureStyle, isPaperStyle } from "../../../helpers/singleCell/figureStyle";
import PatientFigure, { PatientCladeStates, PatientProfiles, PatientVariantCopies } from "./patientFigure";
import ScEventModal from "../scEventModal";
import GenePairScatter from "./genePairScatter";
import CladeCarrierBars from "./cladeCarrierBars";
import SelectedCellsModal from "./selectedCellsModal";
import { CellSelectionProvider, SelectionBar, useCellSelection } from "./cellSelection";
import { PAPER_FONT, paperCladeLabel, paperCloneColors } from "../../../helpers/singleCell/paperPalette";
import { readViewLink, walkIdsForLabels, withCloneOverrides } from "../../../helpers/singleCell/deepLink";
import GeneCnScatter from "./geneCnScatter";

const { Text } = Typography;
const PAD = 1.5e6;

const globalPos = (chromoBins, chr, pos) => {
  const bin = chromoBins?.[`${chr}`.replace(/^chr/, "")];
  return bin ? bin.startPlace + Number(pos) : NaN;
};

/** Merge [chr, start, end] loci into padded global domains (one per chromosome, sorted). */
function lociDomains(loci, chromoBins, pad = PAD) {
  const by = new Map();
  loci.forEach(([chr, s, e]) => {
    const key = `${chr}`.replace(/^chr/, "");
    if (!chromoBins?.[key] || !Number.isFinite(s)) return;
    const cur = by.get(key);
    by.set(key, cur ? [Math.min(cur[0], s), Math.max(cur[1], e)] : [s, e]);
  });
  return [...by.entries()]
    .map(([chr, [s, e]]) => {
      const bin = chromoBins[chr];
      const p = Math.max(pad, 0.25 * (e - s));
      const a = globalPos(chromoBins, chr, Math.max(bin.startPoint ?? 1, s - p));
      const b = globalPos(chromoBins, chr, Math.min(bin.endPoint ?? e + p, e + p));
      return [a, b, chr];
    })
    .filter((d) => d[1] > d[0])
    .sort((x, y) => x[0] - y[0]);
}

const walkLoci = (walks) => walks.flatMap((w) => (w.nodes || []).map((n) => [n.chromosome, Number(n.start), Number(n.end)]));
function eventLoci(e) {
  const coords = `${e.fusion_gene_coords || ""}`.split(",").filter(Boolean);
  const parsed = coords
    .map((c) => /^(?:chr)?([^:]+):(\d+)-(\d+)/.exec(c))
    .filter(Boolean)
    .map((m) => [m[1], Number(m[2]), Number(m[3])]);
  if (parsed.length) return parsed;
  return Number.isFinite(Number(e.start)) ? [[e.seqnames, Number(e.start), Number(e.end) || Number(e.start)]] : [];
}

/**
 * Cohort "Figures" tab: the paper's figures 3-5 rebuilt from the live data.
 * Top: amplicon landscape (Fig 3A/B), phylogenetic signal (3E) and
 * subclonal findings. Bottom: one patient's clonal amplicon figure (4B/5B/5D)
 * with gene-vs-gene copies (5E), clade carrier fractions (4F) and segment
 * correlation (5C). Every panel selects cells into one shared selection,
 * shown in a popup (SelectedCellsModal).
 */
export default function CohortFiguresPanel(props) {
  // two modes: "paper" = the built manuscript figures exactly as made (default), "interactive" = the live re-implementations
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const [mode, setMode] = useState(params.get("figmode") === "interactive" || params.get("figpatient") ? "interactive" : "paper");
  const [bodyKey, setBodyKey] = useState(0);
  const dataset = useSelector((s) => s.Settings?.dataset);
  const base = dataset?.dataPath ? `${dataset.dataPath}_cohort/${PAPER_FIGURES_DIR}/` : "";
  const manifestExport = useCohortExport(dataset?.dataPath ? dataset : null, PAPER_MANIFEST_FILE);
  const manifest = useMemo(() => parsePaperManifest(manifestExport.data, base), [manifestExport.data, base]);
  const openTarget = (t) => {
    const search = targetSearch(t, window.location.search);
    if (t.kind !== "interactive") {
      window.location.assign(`${window.location.pathname}${search}`);
      return;
    }
    // the interactive body reads figpatient / figpanel from the URL once: update it and remount
    window.history.replaceState(null, "", `${window.location.pathname}${search}`);
    setMode("interactive");
    setBodyKey((k) => k + 1);
  };
  const switchMode = (m) => {
    const p = new URLSearchParams(window.location.search);
    if (m === "interactive") p.set("figmode", "interactive");
    else p.delete("figmode");
    window.history.replaceState(null, "", `${window.location.pathname}?${p.toString()}`);
    setMode(m);
  };
  return (
    <div>
      <div className="sc-paper-modebar">
        <Segmented
          value={mode}
          onChange={switchMode}
          options={[
            { value: "paper", label: "Paper figures" },
            { value: "interactive", label: "Interactive" },
          ]}
        />
        <Text type="secondary" style={{ fontSize: 12 }}>
          {mode === "paper" ? "The manuscript figures exactly as built (vector), with links to the interactive views." : "Live, linked re-implementations of the figure panels."}
        </Text>
      </div>
      {mode === "paper" ? (
        manifestExport.status === "loading" ? (
          <Text type="secondary">Loading paper figures…</Text>
        ) : (
          <PaperFiguresViewer manifest={manifest} initialFigure={params.get("figure")} onOpenTarget={openTarget} />
        )
      ) : (
        <FigureStyleDefault.Provider value={FIGURES_VIEW_STYLE}>
          <CellSelectionProvider>
            <FiguresBody key={bodyKey} {...props} />
          </CellSelectionProvider>
        </FigureStyleDefault.Provider>
      )}
    </div>
  );
}

function FiguresBody({ summaries, files, datafiles, cnRows = {}, chromoBins, cloneColors = {}, onOpenCell }) {
  const dispatch = useDispatch();
  const { selection, select, clear, open: popupOpen } = useCellSelection();
  const [showLive, setShowLive] = useState([]);
  useEffect(() => {
    // Esc clears the selection (when the popup is open, Esc only closes it)
    const onKey = (e) => e.key === "Escape" && !popupOpen && clear();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clear, popupOpen]);
  const styleName = useFigureStyleName();
  const paper = isPaperStyle(figureStyle(styleName));
  // precomputed exports read by the paper panels: Fig 1e state scores, Fig 3E phylogenetic signal
  const dataset = useSelector((s) => s.Settings?.dataset);
  const stateExport = useCohortExport(dataset?.dataPath ? dataset : null, STATE_SCORES_FILE);
  const statePoints = useMemo(() => parseStateScores(stateExport.data) || [], [stateExport.data]);
  const [signals, setSignals] = useState([]);
  const summaryKey = summaries.map((x) => x.caseReportId).join("|");
  useEffect(() => {
    if (!dataset?.dataPath) return undefined;
    let live = true;
    Promise.all(summaries.map((x) => tryGet(casePath(dataset, x.caseReportId, PHYLO_SIGNAL_FILE)).then((r) => (r.status === "ok" && r.data?.rows ? { patient: x.caseReportId, data: r.data } : null)))).then((all) => live && setSignals(all.filter(Boolean)));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset?.dataPath, summaryKey]);
  const [ref] = useContainerWidth(1200);
  const rootRef = useRef(null);
  const rootDiv = useCallback(
    (el) => {
      ref(el);
      rootRef.current = el;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const patientRef = useRef(null);
  const [curatedOnly, setCuratedOnly] = useState(true);
  const [includeOther, setIncludeOther] = useState(false);
  const [minCells, setMinCells] = useState(3);
  const [minCn, setMinCn] = useState(1);

  const per = useMemo(
    () =>
      summaries.map((s) => {
        const f = files[s.caseReportId] || {};
        const cells = cellsForPatient(datafiles, s.patientKey);
        const cellIds = f.walks?.cells?.length ? f.walks.cells : cells.map((c) => c.cell_id);
        const groups = walkGroups(f.walks?.walks || [], cellIds, { curatedOnly, includeOther, minCells, minCn });
        return { summary: s, patient: s.caseReportId, cells, cellIds, groups, combos: groupCombinations(groups, cellIds, minCn), tree: f.tree || null, events: f.events || [], snvPacked: f.snvCells || null, variants: f.variants || null, nVariants: f.variants?.length || 0 };
      }),
    [summaries, files, datafiles, curatedOnly, includeOther, minCells, minCn]
  );
  const withAmps = per.filter((p) => p.groups.length);
  // Fig 3A/B as in the paper: amplicon classes (per-cell gene clusters) and graph-level structures, when exported
  const ampExport = useCohortExport(dataset?.dataPath ? dataset : null, AMPLICON_STRUCTURES_FILE);
  // Fig 1d/f/g: _cohort/tmb.json (per-cell corrected TMB, truncal site counts) with the cells' states and SNV matrices
  const tmbExport = useCohortExport(dataset?.dataPath ? dataset : null, "tmb.json");
  const idMaps = useMemo(() => Object.fromEntries(per.map((p) => [p.patient, new Map(p.cells.map((c) => [`${c.cell_id}`.toUpperCase(), c]))])), [per]);
  const burdenRows = useMemo(() => {
    if (!tmbExport.data) return [];
    return burdenByState(tmbExport.data, (pt, id) => `${idMaps[pt]?.get(`${id}`.toUpperCase())?.state ?? ""}`).map((r) => ({ ...r, cell: idMaps[r.patient]?.get(r.cell.toUpperCase())?.cell_id ?? r.cell }));
  }, [tmbExport.data, idMaps]);
  const subclonal = useMemo(() => {
    const tm = new Map((tmbExport.data?.patients || []).map((x) => [x.patient, x]));
    const rows = [];
    const missing = [];
    per.forEach((p) => {
      const t = tm.get(p.patient);
      if (!p.snvPacked || !p.variants?.length || !t) return missing.push(p.patient);
      const ids = (t.cells || []).map((c) => idMaps[p.patient]?.get(`${c.cell_id}`.toUpperCase())?.cell_id ?? `${c.cell_id}`);
      const r = subclonalPerCell(p.variants, p.snvPacked, ids);
      if (!r.k) return missing.push(p.patient);
      return rows.push({ patient: p.patient, ...r, truncal: Number(t.patient_summary?.truncal?.n_sites) });
    });
    return { rows, missing };
  }, [per, tmbExport.data, idMaps]);
  const ampClasses = useMemo(() => parseAmpliconStructures(ampExport.data, per.map((p) => p.patient)), [ampExport.data, per]);
  const dnaIds = useMemo(() => Object.fromEntries(per.map((p) => [p.patient, new Set(p.cellIds)])), [per]);

  const findings = useMemo(
    () =>
      per.flatMap((p) =>
        subclonalFindings({ events: p.events, groups: p.groups, cells: p.cells, tree: p.tree }).map((f, i) => ({ ...f, patient: p.patient, key: `${p.patient}::${f.kind}::${f.label}::${i}` }))
      ),
    [per]
  );

  // patient view selection
  // ?figpatient=&figwalk=&figgenes= (committee deep links) open a patient, focus a walk (its carriers selected) and a gene pair
  const link = useMemo(() => readViewLink(), []);
  const [patient, setPatient] = useState(link.figPatient || null);
  const [pairGenes, setPairGenes] = useState(link.figGenes.length === 2 ? link.figGenes : null);
  const [linkMarked, setLinkMarked] = useState(null);
  const linkMode = !!(link.figPatient && (link.figLayout || link.figWalk));
  const [regionKey, setRegionKey] = useState(null);
  const [pooledScatter, setPooledScatter] = useState(true); // Fig 5E pooled ecDNA vs CI (paper) or per clone // "g:<set>" | "gene:<name>" | "f:<finding key>"
  // default: the patient with the most ecDNA walks among those with an SNV matrix (BWH70 in the paper's Fig 4)
  const richest = useMemo(() => [...withAmps].sort((a, b) => (b.nVariants > 0) - (a.nVariants > 0) || b.groups.reduce((s, g) => s + g.walks.length, 0) - a.groups.reduce((s, g) => s + g.walks.length, 0))[0], [withAmps]);
  const current = per.find((p) => p.patient === patient) || richest || per[0];
  const [focusWalkId, setFocusWalkId] = useState(null);
  const [figDomains, setFigDomains] = useState([]);
  useEffect(() => setFocusWalkId(null), [current?.patient]);
  const linkedWalk = useRef(false);
  useEffect(() => {
    const walks = files[current?.patient]?.walks?.walks || [];
    if (linkedWalk.current || !link.figWalk || !current || current.patient !== link.figPatient || !walks.length) return;
    linkedWalk.current = true;
    // figwalk=<label>|<label> (committee links): show these walks, mark the first one's carriers (figsel=0: marks without selecting)
    const ids = walkIdsForLabels(walks, link.figWalk.split("|").map((x) => x.trim()).filter(Boolean));
    const w = walks.find((x) => `${x.id}` === `${ids[0]}`);
    if (!w) return;
    setTimeout(() => setFocusWalkId(`${w.id}`), 0);
    setRegionKey(`w:${ids.join("+")}`);
    const carriers = current.cellIds.filter((c) => (Number(w.cells?.[c]) || 0) >= minCn);
    setLinkMarked({ cells: new Set(carriers), label: `${w.label} carriers`, key: `w:${current.patient}:${w.id}` });
    if (link.figSelect) select(current.patient, carriers, { label: `${w.label} carriers` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, files, link, minCn]);
  // ?figpanel=<data-figpanel> (from the Paper figures mode): scroll to that panel once it renders
  useEffect(() => {
    const target = new URLSearchParams(window.location.search).get("figpanel");
    if (!target) return undefined;
    let n = 0;
    const t = setInterval(() => {
      const el = document.querySelector(`[data-figpanel="${CSS.escape(target)}"]`);
      n += 1;
      if (el || n > 60) clearInterval(t);
      if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 400);
    }, 500);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!link.figPatient) return undefined;
    const t = setTimeout(() => patientRef.current?.scrollIntoView({ block: "start" }), 1500);
    return () => clearTimeout(t);
  }, [link.figPatient]);
  const linkColors = useMemo(() => withCloneOverrides(cloneColors, link.cloneColors), [cloneColors, link]);
  // Paper style: the manuscript's clade colours and labels (MGH303 EC1-3 / CI); link overrides still win
  const figCloneColors = useMemo(() => {
    if (!paper || !current) return linkColors;
    const clones = [...new Set(current.cells.map((c) => `${c.clone_id ?? ""}`).filter(Boolean))];
    return withCloneOverrides({ ...cloneColors, ...paperCloneColors(current.patient, clones) }, link.cloneColors);
  }, [paper, current, cloneColors, linkColors, link]);
  const figCloneLabels = useMemo(() => {
    if (!paper || !current) return link.cloneLabels;
    const out = {};
    current.cells.forEach((c) => {
      const id = `${c.clone_id ?? ""}`;
      if (id) out[id] = paperCladeLabel(current.patient, id);
    });
    return { ...out, ...link.cloneLabels };
  }, [paper, current, link]);
  // the cohort selection drives the loaded patient's selection (tree, heatmap, report side panels)
  const storePatient = useSelector((s) => s.SingleCell.patient?.caseReportId);
  const storeSelection = useSelector((s) => s.SingleCell.selectedCellIds);
  useEffect(() => {
    if (!selection || `${storePatient}` !== `${selection.patient}`) return;
    const cur = storeSelection || [];
    if (cur.length === selection.cells.size && cur.every((id) => selection.cells.has(id))) return;
    dispatch(singleCellActions.updateSelection([...selection.cells]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, storePatient]);
  const marked = useMemo(() => (selection && selection.patient === current?.patient ? { cells: selection.cells, label: selection.label, key: `sel:${selection.label}` } : null), [selection, current]);

  const allWalks = useMemo(() => files[current?.patient]?.walks?.walks || [], [files, current?.patient]);
  const genePositions = useMemo(() => {
    const m = new Map();
    (current?.events || []).forEach((e) => {
      const g = `${e.gene || ""}`;
      if (!g || g.includes("::") || m.has(g) || !Number.isFinite(Number(e.start))) return;
      m.set(g, [`${e.seqnames}`, Number(e.start), Number(e.end) || Number(e.start)]);
    });
    return m;
  }, [current]);

  const region = useMemo(() => {
    if (!current) return { domains: [], label: "" };
    const key = regionKey && current.groups.some((g) => `g:${g.key}` === regionKey) ? regionKey : regionKey?.startsWith("gene:") || regionKey?.startsWith("f:") ? regionKey : current.groups.length ? `g:${current.groups[Math.max(0, dominantGroupIndex(current.groups, minCn))].key}` : null;
    if (regionKey?.startsWith("w:")) {
      const ws = regionKey.slice(2).split("+").map((id) => allWalks.find((x) => `${x.id}` === id)).filter(Boolean);
      const w = ws[0];
      if (w) return { key: regionKey, domains: lociDomains(walkLoci(ws), chromoBins), label: ws.map((x) => x.label).join(" + "), group: { key: w.label, walks: ws, cellIds: current.cellIds, cn: Float32Array.from(current.cellIds, (c) => Number(w.cells?.[c]) || 0) } };
    }
    if (key?.startsWith("g:")) {
      const g = current.groups.find((x) => `g:${x.key}` === key);
      if (g) return { key, domains: lociDomains(walkLoci(g.walks), chromoBins), label: `ec${g.key} walks`, group: g };
    }
    if (key?.startsWith("gene:")) {
      const locus = genePositions.get(key.slice(5));
      if (locus) return { key, domains: lociDomains([locus], chromoBins, 4e6), label: key.slice(5) };
    }
    if (key?.startsWith("f:")) {
      const f = findings.find((x) => x.key === key.slice(2));
      if (f?.event) return { key, domains: lociDomains(eventLoci(f.event), chromoBins), label: f.label };
      if (f?.group) return { key, domains: lociDomains(walkLoci(f.group.walks), chromoBins), label: f.label, group: f.group };
    }
    // no amplicons: the patient's first amplified driver, else chr7 (EGFR)
    const amp = current.events.find((e) => e.vartype === "AMP");
    const loci = amp ? eventLoci(amp) : [["7", 55e6, 55.3e6]];
    return { key: null, domains: lociDomains(loci, chromoBins, 4e6), label: amp ? `${amp.gene} AMP` : "chr7" };
  }, [current, regionKey, genePositions, chromoBins, findings, minCn, allWalks]);
  const domains = useMemo(() => region.domains.map(([a, b]) => [a, b]), [region]);

  const focus = (p, next = {}) => {
    setPatient(p);
    if (next.region !== undefined) setRegionKey(next.region);
    if (next.marked) select(p, [...next.marked.cells], { label: next.marked.label, mode: next.mode || "replace" });
    if (next.scroll !== false) setTimeout(() => patientRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };
  const markGroup = (p, key) => {
    const g = p.groups.find((x) => x.key === key);
    if (!g) return null;
    return { cells: new Set(g.cellIds.filter((id, k) => g.cn[k] >= minCn)), label: `ec${key} carriers` };
  };
  // genes for the figure markers (inside the region) and the scatter (amplified or in the region)
  const genesInRegion = useMemo(() => {
    const out = [];
    genePositions.forEach(([chr, s, e], name) => {
      const g = globalPos(chromoBins, chr, (s + e) / 2);
      if (Number.isFinite(g) && domains.some(([a, b]) => g >= a && g <= b)) out.push({ name, g });
    });
    return out.slice(0, 16);
  }, [genePositions, chromoBins, domains]);
  const scatterGenes = useMemo(() => {
    const amp = new Set((current?.events || []).filter((e) => e.vartype === "AMP").map((e) => `${e.gene}`));
    const out = [];
    genePositions.forEach(([chr, s, e], name) => {
      if (!amp.has(name) && !genesInRegion.some((x) => x.name === name)) return;
      const g = globalPos(chromoBins, chr, (s + e) / 2);
      if (Number.isFinite(g)) out.push({ name, g });
    });
    return out.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 40);
  }, [current, genePositions, genesInRegion, chromoBins]);
  const selectHere = (ids, { label, mode }) => current && select(current.patient, ids, { label, mode });
  const selectedHere = selection && selection.patient === current?.patient ? selection.cells : null;


  // default pair: the driver genes of the patient's two dominant amplicon groups (MGH303: MDM2 vs CDK4)
  const defaultPair = useMemo(() => {
    const gs = (current?.groups || []).slice().sort((x, y) => (y.cn || []).reduce((t, v) => t + v, 0) - (x.cn || []).reduce((t, v) => t + v, 0));
    const genes = [...new Set(gs.flatMap((g) => `${g.key}`.split("+")))].filter((g) => genePositions.has(g));
    return genes.length >= 2 ? genes.slice(0, 2) : null;
  }, [current, genePositions]);
  const genePair = pairGenes?.length === 2 ? pairGenes : region.group?.genes?.length >= 2 ? region.group.genes.slice(0, 2) : defaultPair;
  if (!per.length) return <Empty />;
  const regionOptions = [
    ...(current?.groups || []).map((g) => ({ value: `g:${g.key}`, label: `ec${g.key} (${g.walks.length} walk${g.walks.length === 1 ? "" : "s"})` })),
    ...(regionKey?.startsWith("f:") || regionKey?.startsWith("w:") ? [{ value: regionKey, label: region.label }] : []),
    ...[...genePositions.keys()].sort().map((g) => ({ value: `gene:${g}`, label: g })),
  ];
  const selectedViolin = region.group ? { patient: current?.patient, key: region.group.key } : null;

  return (
    <div ref={rootDiv} className={paper ? "sc-fig-paper" : undefined}>
      <div className="sc-fig-selbar-wrap" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <div style={{ flex: "1 1 420px" }}>
          <SelectionBar />
        </div>
        <Space size={6}>
          <Text type="secondary">Figure style</Text>
          <Segmented size="small" value={styleName || FIGURES_VIEW_STYLE} onChange={(v) => dispatch(singleCellActions.updateLayout({ figuresViewStyle: v }))} options={Object.entries(FIGURE_STYLES).map(([value, st]) => ({ value, label: st.label }))} />
        </Space>
      </div>
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card id="sc-fig-states" size="small" title={<Space><BranchesOutlined />Figure 1 · Cell states</Space>}>
            <Row gutter={[24, 8]}>
              <Col xs={24} xl={12}>
                <ExportPanel name="1e" letter="E" title="Cell-state quadrant" fig="Fig 1e" hint="hover a cell · lasso to select (linked to the patient pages) · click a DNA-profiled cell">
                  {stateExport.status === "loading" ? <Text type="secondary">Loading state scores…</Text> : <StateQuadrant points={statePoints} dnaIds={dnaIds} selected={selection} onSelect={(p, ids, opts) => focus(p, { marked: { cells: new Set(ids), label: opts.label }, mode: opts.mode, scroll: false })} />}
                </ExportPanel>
              </Col>
              <Col xs={24} xl={12}>
                <ExportPanel name="1d" letter="D" title="Subclonal mutations per cell" fig="Fig 1d" hint="click a patient to open it below">
                  {tmbExport.status === "loading" ? <Text type="secondary">Loading tmb.json…</Text> : subclonal.rows.length ? <SubclonalPerPatient rows={subclonal.rows} missing={subclonal.missing} onSelectPatient={(p) => focus(p, {})} /> : <Text type="secondary">not available (no tmb.json or per-cell SNV matrices)</Text>}
                </ExportPanel>
              </Col>
              <Col xs={24} xl={12}>
                <ExportPanel name="1f" letter="F" title="Mutation burden by cell state" fig="Fig 1f" hint="click a state to select its cells">
                  {burdenRows.length ? <BurdenByState rows={burdenRows} onSelectCells={(p, ids, opts) => focus(p, { marked: { cells: new Set(ids), label: opts.label }, mode: opts.mode, scroll: false })} /> : <Text type="secondary">not available (no tmb.json, or no patient with ≥ 3 MES-like cells)</Text>}
                </ExportPanel>
              </Col>
              <Col xs={24} xl={12}>
                <ExportPanel name="1g" letter="G" title="Cells above the MES-like median" fig="Fig 1g" hint="click a point to select those cells">
                  {burdenRows.length ? <FractionAboveMes rows={burdenRows} onSelectCells={(p, ids, opts) => focus(p, { marked: { cells: new Set(ids), label: opts.label }, mode: opts.mode, scroll: false })} /> : <Text type="secondary">not available</Text>}
                </ExportPanel>
              </Col>
            </Row>
          </Card>
        </Col>
        <Col span={24}>
          <Card
            id="sc-fig-landscape"
            size="small"
            title={<Space><BranchesOutlined />Figure 3 · Amplicons across the cohort <Provenance id="figLandscape" /></Space>}
            extra={
              ampClasses ? null : (
              <Space wrap size={10}>
                <Space size={4}><Switch size="small" checked={curatedOnly} onChange={setCuratedOnly} /><Text>Curated walks</Text></Space>
                <Space size={4}><Switch size="small" checked={includeOther} onChange={setIncludeOther} /><Text>Non-driver walks</Text></Space>
                <Space size={4}><Text type="secondary">Min cells</Text><InputNumber size="small" min={1} value={minCells} onChange={(v) => setMinCells(v ?? 1)} style={{ width: 56 }} /></Space>
                <Space size={4}><Text type="secondary">Min copies</Text><InputNumber size="small" min={1} value={minCn} onChange={(v) => setMinCn(v ?? 1)} style={{ width: 56 }} /></Space>
              </Space>
              )
            }
          >
            {ampClasses ? (
              <Row gutter={[24, 8]}>
                <Col xs={24} xl={14}>
                  <ExportPanel name="3A" letter="A" title="Copy number and structures per amplicon" fig="Fig 3A" hint="drag along a violin to select a copy range · click a row for the class's cells">
                    <AmpliconClassViolins
                      data={ampClasses}
                      selection={selection}
                      onSelectCells={(p, ids, opts) => focus(p, { marked: { cells: new Set(ids), label: opts.label }, mode: opts.mode, scroll: false })}
                      onSelectClass={(p, cls, ids, event) => {
                        const g = per.find((x) => x.patient === p)?.groups.find((x) => x.key === cls);
                        focus(p, { ...(g ? { region: `g:${cls}` } : {}), marked: { cells: new Set(ids), label: `${cls} class cells` }, mode: event?.shiftKey ? "add" : "replace" });
                      }}
                    />
                  </ExportPanel>
                </Col>
                <Col xs={24} xl={10}>
                  <ExportPanel name="3B" letter="B" title="Amplicon(s) in cell" fig="Fig 3B" hint="click a row to select those cells">
                    <AmpliconClassUpset data={ampClasses} onSelectCells={(p, ids, opts) => focus(p, { marked: { cells: new Set(ids), label: opts.label }, mode: opts.mode, scroll: false })} />
                  </ExportPanel>
                </Col>
              </Row>
            ) : !withAmps.length ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No ecDNA walks pass the filters" />
            ) : (
              <Row gutter={[24, 8]}>
                <Col xs={24} xl={14}>
                  <ExportPanel name="3A" letter="A" title="Copy number and structures per amplicon" fig="Fig 3A" hint="drag along a violin to select a copy range · click a row to open the patient below">
                  <AmpliconViolins
                    per={withAmps}
                    selected={selectedViolin}
                    selection={selection}
                    onSelectCells={(p, ids, opts) => select(p, ids, opts)}
                    onSelect={({ patient: p, key }, event) => focus(p, { region: `g:${key}`, marked: markGroup(per.find((x) => x.patient === p), key), mode: event?.shiftKey ? "add" : "replace" })}
                  />
                  </ExportPanel>
                </Col>
                <Col xs={24} xl={10}>
                  <ExportPanel name="3B" letter="B" title="Amplicon combinations per cell" fig="Fig 3B" hint="click a row to select those cells">
                  <AmpliconUpset
                    per={withAmps}
                    selected={null}
                    onSelect={({ patient: p, cells, label }) => focus(p, { marked: { cells: new Set(cells), label: `cells with ${label}` }, scroll: false })}
                  />
                  </ExportPanel>
                </Col>
              </Row>
            )}
            <Row gutter={[24, 8]} className="sc-fig-block">
              <Col xs={24} xxl={11}>
                <ExportPanel name="3E" letter="C" title="Inherited or redrawn at each division?" fig="Fig 3E" hint="click a walk to open it below">
                {signals.length ? (
                  <PhyloSignalStrip
                    signals={signals}
                    onSelectWalk={(p, walkId) => {
                      setPatient(p);
                      setRegionKey(`w:${walkId}`);
                      setTimeout(() => patientRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
                    }}
                  />
                ) : (
                  <PhyloSignalPanel per={per} onSelect={({ patient: p, key }) => focus(p, { region: `g:${key}`, marked: markGroup(per.find((x) => x.patient === p), key) })} />
                )}
                <div className="sc-fig-caption">
                  Above the dashed line, copies follow the tree: cells inherit their parent&apos;s load (as for EGFR ecDNA in BWH70). Near the controls, copies are redrawn at each division.
                  {signals.length ? "" : " (phylo_signal.json not exported: recomputed live in the browser, 199 permutations.)"}
                </div>
                </ExportPanel>
              </Col>
              <Col xs={24} xxl={13}>
                <PanelHead letter="D" title="Subclonal findings" hint="driver events and amplicons in part of a tumor, following the tree · click a row" extra={<Provenance id="figSubclonal" />} />
                <SubclonalFindingsTable
                  findings={findings}
                  cloneColors={cloneColors}
                  selectedKey={regionKey?.startsWith("f:") ? regionKey.slice(2) : null}
                  onSelect={(f) => focus(f.patient, { region: `f:${f.key}`, marked: { cells: f.carriers, label: `${f.label} carriers`, key: `f:${f.key}` } })}
                />
              </Col>
            </Row>
          </Card>
        </Col>
        <Col span={24}>
          <div ref={patientRef} style={{ scrollMarginTop: 12 }} />
          <Card
            id="sc-fig-patient"
            size="small"
            title={<Space><BarChartOutlined />Figures 4–5 · Clonal amplicon figure <Provenance id="figClonalAmplicon" /></Space>}
            extra={
              <Space wrap size={8}>
                <Segmented size="small" value={current?.patient} onChange={(p) => { setPatient(p); setRegionKey(null); }} options={per.map((p) => ({ value: p.patient, label: p.patient }))} />
              </Space>
            }
          >
            {current && linkMode && (
              // committee links (figlayout= / figwalk=): the report's own heatmap + walk copies view of the linked walks, as the frozen committee copy shows it
              <div style={{ marginBottom: 12 }}>
                <PatientEcdnaView patient={current.patient} domains={domains} walkIds={region.group?.walks.map((w) => w.id)} marked={linkMarked || marked} select={link.figSelect} layout={link.figLayout} />
              </div>
            )}
            {current && (
              <div data-figpanel="4B">
              <PatientFigure
                patient={current.patient}
                events={current.events}
                focusWalkId={focusWalkId}
                onFocusWalk={setFocusWalkId}
                onSelectCells={(ids, label) => select(current.patient, ids, { label })}
                onView={setFigDomains}
              />
              </div>
            )}
            <Row gutter={[24, 16]} className="sc-fig-block">
              <Col xs={24} xl={14}>
                {current && <PatientProfiles patient={current.patient} focusWalkId={focusWalkId} domains={figDomains} events={current.events} />}
              </Col>
              <Col xs={24} xl={10}>
                <PanelHead letter="D" title="Amplicon copies per variant" fig="Fig 4 right" hint="carriers only · rank-sum test vs the focused variant · click a box or dot to select, a name to focus" />
                {current && <PatientVariantCopies patient={current.patient} focusWalkId={focusWalkId} onFocusWalk={setFocusWalkId} selected={selectedHere} onSelect={selectHere} />}
              </Col>
            </Row>
            <Row gutter={[24, 16]} className="sc-fig-block">
              <Col xs={24} xl={9}>
                <ExportPanel name="5E-walks" letter="E" title="Copies of one amplicon against another" fig="Fig 5E" hint="lasso to select">
                {current && <GenePairScatter patient={current.patient} cells={current.cells} groups={current.groups} cnEntry={cnRows[current.patient]} genes={scatterGenes} cloneColors={figCloneColors} selected={selectedHere} onSelect={selectHere} />}
                </ExportPanel>
              </Col>
              <Col xs={24} xl={7}>
                <ExportPanel name="4F" letter="F" title="Carriers per clade" fig="Fig 4F" hint="click a bar">
                {current && <CladeCarrierBars cells={current.cells} groups={current.groups} minCn={minCn} cloneColors={figCloneColors} selected={selectedHere} onSelect={selectHere} />}
                </ExportPanel>
              </Col>
              <Col xs={24} xl={8}>
                <PanelHead letter="G" title="Amplicon state per clade" fig="Fig 5F" hint="focused variant · click a clade" />
                {current && <PatientCladeStates patient={current.patient} focusWalkId={focusWalkId} onSelectCells={(ids, label) => select(current.patient, ids, { label })} />}
              </Col>
            </Row>
            <Row gutter={[24, 16]} className="sc-fig-block">
              <Col xs={24} xl={12} id="sc-fig-genepair">
                <ExportPanel name="5E-genes" letter="H" title={paper && pooledScatter ? "Gene vs gene copy number: ecDNA vs integrated" : "Gene vs gene copy number per clone"} fig="Fig 5E" hint="ecDNA vs integrated: slope / R² per clone" extra={<><Checkbox checked={pooledScatter} onChange={(e) => setPooledScatter(e.target.checked)}>pooled</Checkbox><Select size="small" mode="multiple" style={{ minWidth: 180, marginLeft: 8 }} value={genePair || []} onChange={(v) => setPairGenes(v.length ? v.slice(-2) : null)} options={[...genePositions.keys(), ...(genePair || [])].filter((g, i, a) => a.indexOf(g) === i).sort().map((g) => ({ value: g, label: g }))} /></>}>
                {genePair ? (
                  <GeneCnScatter cnEntry={cnRows[current?.patient]} genes={paper && pooledScatter ? [...genePair].sort() : genePair} cloneColors={figCloneColors} cloneLabels={figCloneLabels} width={520} pooled={paper && pooledScatter} fontFamily={paper ? PAPER_FONT : null} />
                ) : (
                  <Text type="secondary" style={{ fontSize: 12 }}>Pick two genes on one amplicon (e.g. CDK4 and MDM2).</Text>
                )}
                </ExportPanel>
              </Col>
            </Row>
            <Collapse
              ghost
              style={{ marginTop: 8 }}
              activeKey={showLive}
              onChange={(k) => setShowLive(Array.isArray(k) ? k : [k])}
              items={[
                {
                  key: "live",
                  label: (
                    <Space size={8} wrap>
                      <Text type="secondary">Live report panels for {current?.patient}: zoomable heatmap, walk copies along the tree, walk structures and co-occurrence</Text>
                      <Select size="small" showSearch style={{ width: 220 }} value={region.key || undefined} placeholder="Region" options={regionOptions} onChange={(v) => setRegionKey(v)} onClick={(e) => e.stopPropagation()} />
                    </Space>
                  ),
                  children: showLive.includes("live") && current ? <PatientEcdnaView patient={current.patient} domains={domains} walkIds={region.group?.walks.map((w) => w.id)} marked={marked} /> : null,
                },
              ]}
            />
          </Card>
        </Col>
      </Row>
      <ScEventModal />
      <SelectedCellsModal per={per} cnRows={cnRows} chromoBins={chromoBins} cloneColors={cloneColors} domains={domains} genes={genesInRegion} onOpenCell={onOpenCell} getContainer={() => rootRef.current || document.body} />
    </div>
  );
}
