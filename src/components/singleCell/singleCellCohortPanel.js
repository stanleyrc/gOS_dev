import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Button, Card, Col, Empty, InputNumber, Progress, Row, Segmented, Slider, Space, Switch, Tabs, Tooltip, Typography } from "antd";
import axios from "axios";
import HeatmapCanvas from "./heatmapCanvas";
import usePixelRatio from "./usePixelRatio";
import HeatmapLegend from "./heatmapLegend";
import PhylogenyCanvas from "./phylogenyCanvas";
import useContainerWidth from "./useContainerWidth";
import datasetsActions from "../../redux/datasets/actions";
import { getOpenInNewTab, setCohortMounted, setOpenInNewTab } from "../../helpers/singleCell/openInNewTab";
import { casePath, tryGet } from "../../redux/singleCell/loaders";
import {
  cellsForPatient,
  cnRowFromGenome,
  cohortSummaries,
  medianCnRow,
} from "../../helpers/singleCell/cellFiles";
import {
  binLabel,
  chromosomeSpans,
  cloneColorMap,
  cnColorer,
  domainExtents,
  genomicColumnLookup,
  panDomain,
  wheelZoomFactor,
  zoomDomain,
} from "../../helpers/singleCell/matrix";
import { layoutTree, parseNewick, pruneTree, toUnitHeight } from "../../helpers/singleCell/newick";
import { cnDistances, upgma } from "../../helpers/singleCell/phylogeny";
import Wrapper from "./index.style";
import useCohortFiles from "./cohort/useCohortFiles";
import TmbPanel from "./cohort/tmbPanel";
import CohortTmbPanel from "./cohort/cohortTmbPanel";
import CohortTmbAssocPanel from "./cohort/cohortTmbAssocPanel";
import CohortSignaturesPanel from "./cohort/cohortSignaturesPanel";
import CohortJointSignatures from "./cohort/cohortJointSignatures";
import OncoprintPanel from "./cohort/oncoprintPanel";
import CohortOncoprintPanel from "./cohort/cohortOncoprintPanel";
import CohortEventAssocPanel from "./cohort/cohortEventAssocPanel";
import { CladeF1Context } from "./cohort/cladeF1Chip";
import CohortScatterPanel from "./cohort/cohortScatterPanel";
import CohortCladesPanel from "./cohort/cohortCladesPanel";
import CohortQcPanel from "./cohort/cohortQcPanel";
import CohortTreeShapePanel from "./cohort/cohortTreeShapePanel";
import CohortAlignedTreesPanel from "./cohort/cohortAlignedTreesPanel";
import CohortMutJunctionsPanel from "./cohort/cohortMutJunctionsPanel";
import CohortEcdnaPlasticityPanel from "./cohort/cohortEcdnaPlasticityPanel";
import CohortAssociationsPanel from "./cohort/cohortAssociationsPanel";
import CohortGenePanel from "./cohort/cohortGenePanel";
import CohortDriverTreesPanel from "./cohort/cohortDriverTreesPanel";
import PatientSummaryTable from "./cohort/patientCards";
import CohortHeadline from "./cohort/cohortHeadline";
import useCohortTsg from "./cohort/useCohortTsg";
import { buildPatientReport } from "../../helpers/singleCell/patientReport";
import { isRescued } from "../../helpers/singleCell/cohortStats";
import useHotspotRescue from "./cohort/useHotspotRescue";
import { ecdnaWalks } from "../../helpers/singleCell/cohortHeadline";
import { COHORT_VIEWS, resolveCohortView, startsGroup } from "../../helpers/singleCell/cohortViews";
import CohortCircosPanel from "./cohort/cohortCircosPanel";
import CohortEventsTable from "./cohort/cohortEventsTable";
import CohortEventDrawer from "./cohort/cohortEventDrawer";
import CohortRnaPanel from "./cohort/cohortRnaPanel";
import CohortConvergencePanel from "./cohort/cohortConvergencePanel";
import CohortAmpliconPanel from "./cohort/cohortAmpliconPanel";
import CohortFiguresPanel from "./figures/cohortFiguresPanel";
import CohortCnExpressionPanel from "./cohort/cohortCnExpressionPanel";
import HelpDrawer from "./helpDrawer";
import { peekHelpTarget, subscribeHelpTarget } from "../../helpers/singleCell/helpNav";
import { cladeFitScore } from "../../helpers/singleCell/cladeFit";
import { passesCladeFilter } from "../../helpers/singleCell/subclonalDrivers";
import CohortSubclonalPanel, { SubclonalHeadlineCard } from "./cohort/cohortSubclonalPanel";
import { SC_GUTTER } from "./density";
import { useCohortRnaFindings } from "./rna/useRnaFindings";
import CohortRnaHighlights from "./cohort/cohortRnaHighlights";
import CohortStory from "./story/cohortStory";
import CohortPortraitPanel from "./cohort/cohortPortraitPanel";
import PortraitHeadlineCard from "./cohort/portraitHeadlineCard";
import CohortVignettes from "./vignette/cohortVignettes";
import { GeneQuickLookContext } from "./cohort/geneQuickLook";
import { eventLabelsForGene } from "../../helpers/singleCell/geneQuickLook";
import CohortCovariateDePanel from "./cohort/cohortCovariateDePanel";
import { Provenance } from "./hintLine";
import useCellLabels from "./useCellLabels";

const { Text } = Typography;
const LABEL_WIDTH = 160;
const TREE_WIDTH = 140;
const ROW_HEIGHT = 18;
// Cap on cells read per patient for the cohort heatmap.
const MAX_CELLS_PER_PATIENT = 2000;
// Per-cell rows shrink to keep the heatmap under ~900px tall.
const MAX_CELL_ROWS_HEIGHT = 900;

/** Each cell's total CN from its own complex.json, plus the patient's median consensus. */
async function loadPatientCells(dataset, summary, records, chromoBins, genomeLength, cancelToken) {
  const cells = cellsForPatient(records, summary.patientKey).slice(0, MAX_CELLS_PER_PATIENT);
  const [treeFile, ...genomes] = await Promise.all([
    tryGet(casePath(dataset, summary.caseReportId, "tree.nwk"), { cancelToken, responseType: "text" }),
    ...cells.map((c) => tryGet(casePath(dataset, c.cell_id, "complex.json"), { cancelToken })),
  ]);
  const cellRows = [];
  genomes.forEach((g, k) => {
    if (g.status === "ok") {
      cellRows.push({
        cellId: cells[k].cell_id,
        clone: cells[k].clone_id,
        row: cnRowFromGenome(g.data, chromoBins),
      });
    }
  });
  // Phylogeny of the loaded cells: tree.nwk, else UPGMA on copy number.
  const ids = cellRows.map((c) => c.cellId);
  let treeRoot = null;
  if (treeFile.status === "ok") {
    try {
      treeRoot = pruneTree(parseNewick(treeFile.data), new Set(ids));
    } catch {
      treeRoot = null; // unreadable tree.nwk: fall back to the inferred tree
    }
  }
  if (!treeRoot && ids.length > 1) {
    treeRoot = upgma(cnDistances(cellRows.map((c) => c.row), genomeLength), ids);
  }
  return {
    cellRows,
    treeRoot,
    consensus: cellRows.length ? medianCnRow(cellRows.map((c) => c.row), chromoBins) : null,
    truncated: cellsForPatient(records, summary.patientKey).length > MAX_CELLS_PER_PATIENT,
  };
}

/** Cohort of single-cell patients: composition table and a patients x genome CN heatmap. */
export default function SingleCellCohortPanel({ datafiles = [] }) {
  const { t } = useTranslation("common");
  const cellLabels = useCellLabels();
  const dispatch = useDispatch();
  const datasetRecords = useSelector((state) => state.Datasets.records);
  const datasets = useMemo(() => datasetRecords || [], [datasetRecords]);
  const { chromoBins, genomeLength } = useSelector((state) => state.Settings);
  const palette = useSelector((state) => state.SingleCell.palette);
  const pixelRatio = usePixelRatio();
  const [containerRef, containerWidth] = useContainerWidth();
  const [rows, setRows] = useState({});
  const [progress, setProgress] = useState(0);
  const [hover, setHover] = useState(null);
  const [rowMode, setRowMode] = useState("patients");

  const summaries = useMemo(() => cohortSummaries(datafiles), [datafiles]);
  const cohortFiles = useCohortFiles(summaries, datasets);
  const tsgDataset = datasets.find((d) => `${d.id}` === `${summaries[0]?.record.datasetId}`) || null;
  const hotspotRescue = useHotspotRescue(datasets.find((d) => `${d.id}` === `${summaries[0]?.record.datasetId}`) || null);
  // help-center target first, then ?scview=<key> (deep link, e.g. ?scview=qc), else the overview
  const [view, setView] = useState(() => {
    const help = peekHelpTarget();
    if (help?.scope === "cohort" && help.view) return resolveCohortView(help.view);
    try {
      return resolveCohortView(new URLSearchParams(window.location.search).get("scview"));
    } catch (error) {
      return "overview";
    }
  });
  useEffect(() => subscribeHelpTarget((target) => target?.scope === "cohort" && target.view && setView(resolveCohortView(target.view))), []);
  const [rnaGene, setRnaGene] = useState(null); // { gene, nonce }: opens this gene in the RNA view's expression plot
  const [deFocus, setDeFocus] = useState(null); // { id, nonce }: preselects a test in the Covariate DE view
  const openCovariateDe = (id) => {
    setDeFocus({ id, nonce: Date.now() });
    setView("rnacovde");
  };
  const openRnaGene = (gene) => {
    setRnaGene({ gene, nonce: Date.now() });
    setView("rna");
  };
  const [cnFocus, setCnFocus] = useState(null); // { gene, nonce }: CN vs expression with this gene's CN, all-genes mode
  const [evFocus, setEvFocus] = useState(null); // { gene, labels, nonce }: All events filtered to this gene
  const [deGene, setDeGene] = useState(null); // { gene, nonce }: Covariate DE tests listing this gene
  const [eventDrawer, setEventDrawer] = useState(null); // { summary, event }
  const openEvent = (summary, event) => summary && event && setEventDrawer({ summary, event });
  // Clade F1 filter: drop alterations whose carrier cells do not sit in one clade of the
  // patient's tree (scattered carriers are mostly noise); applies to every cohort view.
  const [cladeFilterOn, setCladeFilterOn] = useState(true);
  const [minCladeF1, setMinCladeF1] = useState(0.5);
  const files = useMemo(() => {
    if (!cladeFilterOn) return cohortFiles.files;
    const out = {};
    Object.entries(cohortFiles.files).forEach(([id, f]) => {
      if (!f?.events || !f.tree) {
        out[id] = f;
        return;
      }
      out[id] = {
        ...f,
        events: f.events.filter((e) => {
          if (isRescued(e)) return true; // rescued hotspots: carriers are the few covered cells, clade fit is not meaningful
          // SNVs are exempt: sparse per-cell reads keep even clonal SNV carriers below F1 0.5 (site QC judges SNVs)
          const fit = cladeFitScore(`${e.cell_ids || ""}`.split(",").filter(Boolean), f.tree);
          return passesCladeFilter(e, fit.score, minCladeF1);
        }),
      };
    });
    return out;
  }, [cohortFiles.files, cladeFilterOn, minCladeF1]);
  // tumour-suppressor two hits (SNV + LOH / deletion) per patient: oncoprints, driver trees, headline
  const tsg = useCohortTsg({ dataset: tsgDataset, summaries, files });
  // RNA key findings of every patient (RNA view only: loads the matrices; Key findings now uses vignettes.json)
  const cohortRna = useCohortRnaFindings({ summaries, files, datafiles, datasets, enabled: view === "rna" });
  // per-patient report (truncal / subclonal drivers) + ecDNA oncogenes: Overview headline and table
  const patientRows = useMemo(
    () =>
      summaries
        .filter((s) => files[s.caseReportId])
        .map((s) => {
          const f = files[s.caseReportId];
          return {
            s,
            id: s.caseReportId,
            report: f.events ? buildPatientReport({ patient: s.caseReportId, events: f.events, cells: cellsForPatient(datafiles, s.patientKey), variants: f.variants || [], signatures: f.signatures }) : null,
            walks: f.walks,
            ecdna: f.walks ? [...new Set(ecdnaWalks(f.walks).flatMap((w) => `${w.driver_genes ?? ""}`.split(/[,;+]/).map((g) => g.trim()).filter((g) => g && g !== "NA")))] : null,
          };
        }),
    [summaries, files, datafiles]
  );
  const nDropped = useMemo(() => Object.entries(cohortFiles.files).reduce((n, [id, f]) => n + ((f?.events?.length || 0) - (files[id]?.events?.length || 0)), 0), [cohortFiles.files, files]);
  // header Clade F1 filter state, for the "hidden by the Clade F1 filter" tooltips of the F1 values in every cohort list
  const f1Filter = useMemo(() => ({ on: cladeFilterOn, min: minCladeF1, hidden: nDropped }), [cladeFilterOn, minCladeF1, nDropped]);
  const datasetOf = (summary) =>
    datasets.find((d) => `${d.id}` === `${summary.record.datasetId}`) || null;

  useEffect(() => {
    let active = true;
    const source = axios.CancelToken.source();
    setRows({});
    setProgress(0);
    (async () => {
      const out = {};
      for (let k = 0; k < summaries.length; k += 4) {
        const batch = summaries.slice(k, k + 4);
        const results = await Promise.all(
          batch.map(async (s) => {
            const dataset = datasets.find((d) => `${d.id}` === `${s.record.datasetId}`);
            if (!dataset) return [s.caseReportId, { cellRows: [], consensus: null }];
            const records = datafiles.filter((r) => `${r.datasetId}` === `${dataset.id}`);
            try {
              return [s.caseReportId, await loadPatientCells(dataset, s, records, chromoBins, genomeLength, source.token)];
            } catch (error) {
              return [s.caseReportId, { cellRows: [], consensus: null, error }];
            }
          })
        );
        if (!active) return;
        results.forEach(([id, value]) => (out[id] = value));
        setRows({ ...out });
        setProgress(Math.round((100 * (k + batch.length)) / Math.max(1, summaries.length)));
      }
    })().catch(() => {});
    return () => {
      active = false;
      source.cancel("cohort view closed");
    };
  }, [summaries, datasets, datafiles, chromoBins, genomeLength]);

  const cloneColors = useMemo(
    () => cloneColorMap(summaries.flatMap((s) => Object.keys(s.cloneCounts).map((clone_id) => ({ clone_id })))),
    [summaries]
  );

  // open patients / cells in a new browser tab (default) so this view keeps its state; see helpers/singleCell/openInNewTab
  const [newTab, setNewTab] = useState(getOpenInNewTab);
  useEffect(() => {
    setCohortMounted(true);
    return () => setCohortMounted(false);
  }, []);
  const toggleNewTab = (on) => {
    setNewTab(on);
    setOpenInNewTab(on);
  };
  const openPatient = (summary) =>
    dispatch(datasetsActions.openCaseReport(summary.record.datasetId, summary.caseReportId, { allowNewTab: true }));

  const treeWidth = rowMode === "cells" ? TREE_WIDTH : 0;
  const heatWidth = Math.max(200, containerWidth - LABEL_WIDTH - treeWidth - 12);
  // zoomable genome window (wheel with Cmd/Ctrl, or pinch; drag to pan; click a chromosome label)
  const whole = useMemo(() => [1, genomeLength || 1], [genomeLength]);
  const [zoomed, setZoomed] = useState(null);
  const domains = useMemo(() => [zoomed || whole], [zoomed, whole]);
  const [rowScale, setRowScale] = useState(1); // height multiplier
  const zoomAt = ({ x, deltaY, deltaMode, pinch }) => {
    const d = domains[0];
    const anchor = d[0] + (x / Math.max(1, heatWidth)) * (d[1] - d[0]);
    setZoomed(zoomDomain(d, anchor, wheelZoomFactor({ deltaY, deltaMode, pinch }), whole, 1e5));
  };
  const panBy = ({ dx }) => {
    const d = domains[0];
    setZoomed(panDomain(d, (-dx * (d[1] - d[0])) / Math.max(1, heatWidth), whole));
  };
  // Heatmap rows: one consensus row per patient, one pseudobulk row per clone
  // (median of its cells) grouped by patient, or every loaded cell grouped by patient.
  const { rows: heatRows, layout: cohortTree } = useMemo(() => {
    if (rowMode === "clones") {
      return {
        layout: null,
        rows: summaries.flatMap((s, k) => {
          const entry = rows[s.caseReportId];
          if (!entry?.cellRows.length) return [];
          const byClone = new Map();
          entry.cellRows.forEach((c) => {
            const key = c.clone ?? "NA";
            if (!byClone.has(key)) byClone.set(key, []);
            byClone.get(key).push(c.row);
          });
          return [...byClone.entries()]
            .filter(([, list]) => list.length >= 2)
            .sort((a, b) => b[1].length - a[1].length)
            .map(([clone, list]) => ({
              summary: s,
              patientIndex: k,
              label: `${s.caseReportId} · ${clone} (${list.length})`,
              clone,
              nCells: list.length,
              row: medianCnRow(list, chromoBins),
            }));
        }),
      };
    }
    if (rowMode === "patients") {
      return {
        layout: null,
        rows: summaries.map((s, k) => ({
          summary: s,
          patientIndex: k,
          label: s.caseReportId,
          row: rows[s.caseReportId]?.consensus || null,
        })),
      };
    }
    // Per-cell rows follow one combined tree: each patient's phylogeny
    // (rescaled to unit height) hangs off a shared root, so patients stay
    // contiguous and cells sit in tree order within them.
    const byLeaf = new Map();
    const subtrees = [];
    summaries.forEach((s, k) => {
      const entry = rows[s.caseReportId];
      if (!entry?.cellRows.length) return;
      const prefix = `${k}::`;
      entry.cellRows.forEach((c) =>
        byLeaf.set(prefix + c.cellId, { summary: s, patientIndex: k, label: c.cellId, clone: c.clone, row: c.row })
      );
      const base = entry.treeRoot
        ? toUnitHeight(entry.treeRoot)
        : { name: null, length: 0, children: entry.cellRows.map((c) => ({ name: c.cellId, length: 1, children: [] })) };
      const rename = (n) => ({
        ...n,
        name: n.children.length ? null : prefix + n.name,
        children: n.children.map(rename),
      });
      const placed = new Set();
      const sub = rename(base.children.length ? base : { name: null, length: 0, children: [base] });
      const collect = (n) => (n.children.length ? n.children.forEach(collect) : placed.add(n.name));
      collect(sub);
      // Cells missing from tree.nwk hang directly off the patient's root.
      entry.cellRows.forEach((c) => {
        if (!placed.has(prefix + c.cellId)) sub.children.push({ name: prefix + c.cellId, length: 1, children: [] });
      });
      sub.length = 0.15;
      subtrees.push(sub);
    });
    if (!subtrees.length) return { rows: [], layout: null };
    const layout = layoutTree({ name: null, length: null, children: subtrees });
    const fallback = (leaf) => {
      const k = Number(`${leaf}`.split("::")[0]);
      return { summary: summaries[k], patientIndex: k, label: `${leaf}`, row: null };
    };
    return { rows: layout.leaves.map((leaf) => byLeaf.get(leaf) || fallback(leaf)), layout };
  }, [rowMode, summaries, rows, chromoBins]);

  const heat = useMemo(() => {
    const lookups = new Map();
    const colsFor = (r) => {
      const entry = heatRows[r];
      if (!entry?.row) return null;
      if (!lookups.has(r)) {
        lookups.set(r, genomicColumnLookup(entry.row.binIndex, domains, heatWidth * pixelRatio).cols);
      }
      return lookups.get(r);
    };
    const color = cnColorer(palette, "total");
    return {
      cols: colsFor,
      colorAt: (r, c) => color(heatRows[r].row.values[c]),
      axis: chromosomeSpans(chromoBins, domainExtents(domains, heatWidth)),
    };
  }, [heatRows, domains, heatWidth, chromoBins, palette, pixelRatio]);

  // Patient blocks for the label column in per-cell mode.
  const patientBlocks = useMemo(() => {
    const blocks = [];
    heatRows.forEach((r, k) => {
      const last = blocks[blocks.length - 1];
      if (last && last.summary === r.summary) last.count += 1;
      else blocks.push({ summary: r.summary, patientIndex: r.patientIndex, start: k, count: 1 });
    });
    return blocks;
  }, [heatRows]);

  if (!summaries.length) {
    return <Empty description={t("components.single-cell.cohort.empty")} />;
  }

  const totalCells = summaries.reduce((s, r) => s + r.nCells, 0);
  const rowHeight =
    rowMode === "patients" || rowMode === "clones"
      ? ROW_HEIGHT * rowScale * (rowMode === "clones" ? 0.75 : 1)
      : Math.max(1, Math.min(6, (MAX_CELL_ROWS_HEIGHT * rowScale) / Math.max(1, heatRows.length)));
  const height = Math.max(ROW_HEIGHT, heatRows.length * rowHeight);

  const openCell = (cell) => cell?._patient && dispatch(datasetsActions.openCaseReport(cell._patient.record.datasetId, cell.cell_id));
  const analysisTabs = COHORT_VIEWS.map((v) => ({
    key: v.key,
    label: <span className={startsGroup(v.key) ? "sc-tab-group-start-label" : undefined} title={t(`components.single-cell.cohort.group-${v.group}`)}>{t(`components.single-cell.cohort.view-${v.key}`)}</span>,
  }));

  const geneDataset = datasets.find((d) => `${d.id}` === `${summaries[0]?.record.datasetId}`) || null;
  const quickLook = {
    dataset: geneDataset,
    summaries,
    files,
    actions: {
      expression: openRnaGene,
      cnexpr: (gene) => {
        setCnFocus({ gene, nonce: Date.now() });
        setView("cnexpr");
      },
      events: (gene) => {
        setEvFocus({ gene, labels: eventLabelsForGene(summaries, files, gene), nonce: Date.now() });
        setView("events");
      },
      covde: (gene) => {
        setDeGene({ gene, nonce: Date.now() });
        setView("rnacovde");
      },
    },
  };

  return (
    <GeneQuickLookContext.Provider value={quickLook}>
    <CladeF1Context.Provider value={f1Filter}>
    <Wrapper>
      <Row gutter={SC_GUTTER}>
        <Col span={24}>
          <div className="sc-cohort-bar">
            <Space size={12} wrap>
              <Text type="secondary">{t("components.single-cell.cohort.headline-scope", { patients: summaries.length, cells: totalCells.toLocaleString() })}</Text>
              {cohortFiles.progress < 100 && <Progress percent={cohortFiles.progress} size="small" style={{ width: 160 }} />}
            </Space>
            <Space size={12} wrap>
            <Tooltip title={t("components.single-cell.cohort.clade-filter-help")}>
              <Space size={6}>
                <Switch size="small" checked={cladeFilterOn} onChange={setCladeFilterOn} />
                <Text>{t("components.single-cell.cohort.clade-filter")}</Text>
                <InputNumber size="small" min={0} max={1} step={0.05} value={minCladeF1} disabled={!cladeFilterOn} onChange={(v) => setMinCladeF1(v ?? 0)} style={{ width: 70 }} />
                {cladeFilterOn && nDropped > 0 && <Text type="secondary">{t("components.single-cell.cohort.clade-filter-dropped", { count: nDropped })}</Text>}
              </Space>
            </Tooltip>
            <Tooltip title="Open patients in a new browser tab, so this cohort view keeps its tab, filters and scroll position. Cells still open in this tab.">
              <Space size={6}>
                <Switch size="small" checked={newTab} onChange={toggleNewTab} />
                <Text>Open patients in new tab</Text>
              </Space>
            </Tooltip>
            <HelpDrawer />
            </Space>
          </div>
          <Tabs size="small" className="sc-cohort-tabs" activeKey={view} onChange={setView} items={analysisTabs} />
          <div className="sc-view-purpose">{t(`components.single-cell.cohort.purpose-${view}`)}</div>
        </Col>
        {view === "story" && (
          <Col span={24}>
            <CohortStory
              dataset={datasets.find((d) => `${d.id}` === `${summaries[0]?.record.datasetId}`) || null}
              summaries={summaries}
              cloneColors={cloneColors}
              onOpen={openPatient}
            />
          </Col>
        )}
        {view === "subclonal" && (
          <Col span={24}>
            <CohortSubclonalPanel dataset={geneDataset} />
          </Col>
        )}
        {view === "reports" && (
          <Col span={24}>
            <div style={{ marginBottom: 12 }}>
              <SubclonalHeadlineCard dataset={geneDataset} onView={setView} />
            </div>
            <CohortVignettes
              dataset={datasets.find((d) => `${d.id}` === `${summaries[0]?.record.datasetId}`) || null}
              summaries={summaries}
              files={cohortFiles.files}
              cloneColors={cloneColors}
              onOpen={openPatient}
              onOpenCovariateDe={openCovariateDe}
            />
          </Col>
        )}
        {view === "drivers" && (
          <>
            <Col span={24}>
              <SubclonalHeadlineCard dataset={geneDataset} onView={setView} />
            </Col>
            <Col span={24}>
              <CohortGenePanel summaries={summaries} files={files} onOpen={openPatient} onEvent={openEvent} />
            </Col>
            <Col span={24}>
              <OncoprintPanel summaries={summaries} files={files} onOpen={openPatient} onEvent={openEvent} tsg={tsg} />
            </Col>
            <Col span={24}>
              <CohortDriverTreesPanel
                summaries={summaries}
                files={files}
                rawFiles={cohortFiles.files}
                rows={rows}
                datasets={datasets}
                datafiles={datafiles}
                chromoBins={chromoBins}
                cloneColors={cloneColors}
                onOpen={openPatient}
                onEvent={openEvent}
                tsgCalls={tsg.callsByPatient}
              />
            </Col>
            <Col span={24}>
              <CohortConvergencePanel summaries={summaries} files={files} onEvent={openEvent} />
            </Col>
            <Col span={24}>
              <CohortCircosPanel summaries={summaries} files={files} />
            </Col>
          </>
        )}
        {view === "overview" && (
          <>
            <Col span={24}>
              <PortraitHeadlineCard dataset={geneDataset} onView={setView} />
            </Col>
            <Col span={24}>
              <SubclonalHeadlineCard dataset={geneDataset} onView={setView} />
            </Col>
            <Col span={24}>
              <CohortHeadline
                patients={patientRows}
                nPatients={summaries.length}
                nCells={totalCells}
                loading={cohortFiles.progress < 100}
                tsg={tsg}
                hotspots={hotspotRescue.doc}
                onView={setView}
                onPatient={(id) => {
                  const s = summaries.find((x) => x.caseReportId === id);
                  if (s) openPatient(s);
                }}
              />
            </Col>
            <Col span={24}>
              <PatientSummaryTable patients={patientRows.filter((p) => p.report)} cloneColors={cloneColors} onOpen={openPatient} />
            </Col>
          </>
        )}
        {view === "mutations" && (
          <>
            <Col span={24}>
              <CohortTmbPanel dataset={datasets.find((d) => `${d.id}` === `${summaries[0]?.record.datasetId}`) || null} summaries={summaries} onOpen={openPatient} onView={setView} />
            </Col>
            <Col span={24}>
              <TmbPanel summaries={summaries} files={files} datafiles={datafiles} onOpen={openPatient} />
            </Col>
            <Col span={24}>
              <CohortTmbAssocPanel dataset={geneDataset} onGene={openRnaGene} />
            </Col>
            <Col span={24}>
              <CohortSignaturesPanel summaries={summaries} files={files} />
            </Col>
            <Col span={24}>
              <CohortJointSignatures dataset={datasets.find((d) => `${d.id}` === `${summaries[0]?.record.datasetId}`) || null} />
              <CohortMutJunctionsPanel
                dataset={datasets.find((d) => `${d.id}` === `${summaries[0]?.record.datasetId}`) || null}
                onOpen={(id) => {
                  const s = summaries.find((x) => x.caseReportId === id);
                  if (s) openPatient(s);
                }}
              />
            </Col>
          </>
        )}
        {view === "rna" && (
          <Col span={24}>
            <CohortRnaHighlights cohortRna={cohortRna} />
          </Col>
        )}
        {view === "rna" && (
          <Col span={24}>
            <CohortRnaPanel summaries={summaries} datasets={datasets} cnRows={rows} files={files} focusGene={rnaGene} />
          </Col>
        )}
        {view === "rnacovde" && (
          <Col span={24}>
            <CohortCovariateDePanel focusGene={deGene} dataset={datasets.find((d) => `${d.id}` === `${summaries[0]?.record.datasetId}`) || null} focusTest={deFocus} onGene={openRnaGene} summaries={summaries} datasets={datasets} />
          </Col>
        )}
        {view === "events" && (
          <Col span={24}>
            <CohortEventsTable focusGene={evFocus} summaries={summaries} files={files} onEvent={openEvent} />
          </Col>
        )}
        {view === "scatter" && (
          <Col span={24}>
            <CohortScatterPanel summaries={summaries} files={files} datafiles={datafiles} onOpen={openPatient} />
          </Col>
        )}
        {view === "amplicons" && (
          <Col span={24}>
            <CohortAmpliconPanel summaries={summaries} files={files} cnRows={rows} chromoBins={chromoBins} />
          </Col>
        )}
        {view === "ecplast" && (
          <Col span={24}>
            <CohortEcdnaPlasticityPanel dataset={datasets.find((d) => `${d.id}` === `${summaries[0]?.record.datasetId}`) || null} summaries={summaries} />
          </Col>
        )}
        {view === "figures" && (
          <Col span={24}>
            <CohortFiguresPanel
              summaries={summaries}
              files={files}
              datafiles={datafiles}
              cnRows={rows}
              chromoBins={chromoBins}
              cloneColors={cloneColors}
              onOpenCell={(cellId) => {
                const s = summaries.find((x) => cellsForPatient(datafiles, x.patientKey).some((c) => c.cell_id === cellId));
                if (s) dispatch(datasetsActions.openCaseReport(s.record.datasetId, cellId));
              }}
            />
          </Col>
        )}
        {view === "cnexpr" && (
          <Col span={24}>
            <CohortCnExpressionPanel focusGene={cnFocus} summaries={summaries} files={files} datasets={datasets} cnRows={rows} />
          </Col>
        )}
        {view === "treeshape" && (
          <Col span={24}>
            <CohortTreeShapePanel summaries={summaries} files={files} datafiles={datafiles} />
          </Col>
        )}
        {(view === "aligned" || view === "associations") && (
          <Col span={24}>
            {view === "aligned" ? (
              <CohortAlignedTreesPanel dataset={datasets.find((d) => `${d.id}` === `${summaries[0]?.record.datasetId}`) || null} summaries={summaries} onOpen={openPatient} />
            ) : (
              <CohortAssociationsPanel dataset={datasets.find((d) => `${d.id}` === `${summaries[0]?.record.datasetId}`) || null} summaries={summaries} onOpen={openPatient} />
            )}
          </Col>
        )}
        {view === "oncoprint" && (
          <Col span={24}>
            <CohortOncoprintPanel summaries={summaries} files={files} tsg={tsg} />
          </Col>
        )}
        {view === "portrait" && (
          <Col span={24}>
            <CohortPortraitPanel dataset={geneDataset} />
          </Col>
        )}
        {view === "eventassoc" && (
          <Col span={24}>
            <CohortEventAssocPanel dataset={datasets.find((d) => `${d.id}` === `${summaries[0]?.record.datasetId}`) || null} summaries={summaries} datasets={datasets} rawFiles={cohortFiles.files} cnRows={rows} />
          </Col>
        )}
        {view === "clades" && (
          <Col span={24}>
            <CohortCladesPanel dataset={datasets.find((d) => `${d.id}` === `${summaries[0]?.record.datasetId}`) || null} summaries={summaries} />
          </Col>
        )}
        {view === "qc" && (
          <Col span={24}>
            <CohortQcPanel summaries={summaries} datafiles={datafiles} onOpenCell={openCell} />
          </Col>
        )}
        {view === "overview" && (
        <Col span={24}>
          <Card
            size="small"
            title={<Space size={6}>{t("components.single-cell.cohort.heatmap-title")}<Provenance id="cohortHeatmap" /></Space>}
            extra={
              <Space>
                {progress < 100 && <Progress percent={progress} size="small" style={{ width: 160 }} />}
                <Space size={4}>
                  <Text type="secondary">{t("components.single-cell.cohort.height")}</Text>
                  <Slider min={0.5} max={4} step={0.25} value={rowScale} onChange={setRowScale} style={{ width: 110, margin: "0 6px" }} />
                </Space>
                {zoomed && (
                  <Button size="small" onClick={() => setZoomed(null)}>{t("components.single-cell.cohort.reset-zoom")}</Button>
                )}
                <Segmented
                  size="small"
                  value={rowMode}
                  onChange={setRowMode}
                  options={[
                    { value: "patients", label: t("components.single-cell.cohort.rows-patients") },
                    { value: "clones", label: t("components.single-cell.cohort.rows-clones") },
                    { value: "cells", label: t("components.single-cell.cohort.rows-cells") },
                  ]}
                />
              </Space>
            }
          >
            <div ref={containerRef} className="sc-heatmap-container">
              <div className="sc-heatmap-row" style={{ height }}>
                <div className="sc-row-labels" style={{ width: LABEL_WIDTH, height }}>
                  {patientBlocks.map((b) => (
                    <Tooltip key={b.summary.caseReportId} title={t("components.single-cell.cohort.open")} placement="left">
                      <div
                        style={{
                          height: b.count * rowHeight,
                          cursor: "pointer",
                          borderRight: "2px solid var(--sc-border)",
                          borderBottom: "1px solid var(--sc-border-soft)",
                          paddingRight: 4,
                        }}
                        onClick={() => openPatient(b.summary)}
                      >
                        {b.count * rowHeight >= 11 ? b.summary.caseReportId : ""}
                      </div>
                    </Tooltip>
                  ))}
                </div>
                {rowMode === "cells" && cohortTree && (
                  <PhylogenyCanvas
                    layout={cohortTree}
                    nRows={heatRows.length}
                    width={treeWidth}
                    height={height}
                    leafClones={heatRows.map((r) => r.clone ?? null)}
                    cloneColors={cloneColors}
                    onSelectRange={([a]) => heatRows[a] && openPatient(heatRows[a].summary)}
                  />
                )}
                <HeatmapCanvas
                  pixelRatio={pixelRatio}
                  width={heatWidth}
                  height={height}
                  nRows={heatRows.length}
                  cols={heat.cols}
                  colorAt={heat.colorAt}
                  separators={heat.axis.separators}
                  onWheelZoom={zoomAt}
                  onDrag={panBy}
                  onDoubleClick={() => setZoomed(null)}
                  onClick={({ row }) => heatRows[row] && openPatient(heatRows[row].summary)}
                  onHover={({ row, col, clientX, clientY }) => {
                    const entry = heatRows[row];
                    if (!entry?.row || col < 0) return setHover(null);
                    const rect = containerRef.current?.getBoundingClientRect();
                    setHover({
                      left: Math.min(clientX - (rect?.left || 0) + 14, (rect?.width || 600) - 240),
                      top: clientY - (rect?.top || 0) + 14,
                      lines: [
                        [t("components.single-cell.cohort.patient"), entry.summary.caseReportId],
                        ...(rowMode === "cells"
                          ? [[t("components.single-cell.tooltip.cell"), cellLabels.full(entry.label)]]
                          : [[t("components.single-cell.tooltip.consensus"), t("components.single-cell.cohort.median-of", { count: entry.nCells || rows[entry.summary.caseReportId]?.cellRows.length || 0 })]]),
                        ...(entry.clone != null ? [[t("components.single-cell.tooltip.clone"), entry.clone]] : []),
                        [t("components.single-cell.tooltip.segment"), binLabel(entry.row.binIndex, col)],
                        [t("components.single-cell.tooltip.state"), entry.row.values[col]],
                      ],
                    });
                  }}
                  onLeave={() => setHover(null)}
                />
                {hover && (
                  <div className="sc-tooltip" style={{ left: Math.max(0, hover.left), top: hover.top }}>
                    {hover.lines.map(([k, v]) => (
                      <div key={k}>
                        <span className="sc-tooltip-key">{k}</span> {`${v}`}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div
                className="sc-axis"
                style={{ marginLeft: LABEL_WIDTH + 4 + (treeWidth ? treeWidth + 4 : 0), width: heatWidth, height: 18 }}
              >
                {heat.axis.spans
                  .filter((s) => s.x1 - s.x0 >= 14)
                  .map((s) => (
                    <span
                      key={s.chromosome}
                      className="sc-axis-label sc-axis-link"
                      style={{ left: s.x0, width: s.x1 - s.x0 }}
                      title={t("components.single-cell.heatmap.zoom-chromosome", { chromosome: s.chromosome })}
                      onClick={() => {
                        const c = chromoBins[s.chromosome];
                        if (c) setZoomed([c.startPlace, c.endPlace]);
                      }}
                    >
                      {s.chromosome}
                    </span>
                  ))}
              </div>
              <div className="sc-heatmap-footer">
                <HeatmapLegend type="cn" palette={palette} showClones={false} />
                <Text type="secondary" className="sc-hint">{t("components.single-cell.cohort.heatmap-help")}</Text>
              </div>
            </div>
          </Card>
        </Col>
        )}
      </Row>
      <CohortEventDrawer
        open={Boolean(eventDrawer)}
        onClose={() => setEventDrawer(null)}
        summary={eventDrawer?.summary}
        event={eventDrawer?.event}
        dataset={eventDrawer ? datasetOf(eventDrawer.summary) : null}
        cells={eventDrawer ? cellsForPatient(datafiles, eventDrawer.summary.patientKey) : []}
        cloneColors={cloneColors}
        patientFiles={eventDrawer ? cohortFiles.files[eventDrawer.summary.caseReportId] || null : null}
      />
    </Wrapper>
    </CladeF1Context.Provider>
    </GeneQuickLookContext.Provider>
  );
}
