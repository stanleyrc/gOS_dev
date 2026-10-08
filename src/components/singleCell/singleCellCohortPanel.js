import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Button, Card, Col, Empty, Progress, Row, Segmented, Slider, Space, Statistic, Table, Tabs, Tooltip, Typography } from "antd";
import { ApartmentOutlined } from "@ant-design/icons";
import axios from "axios";
import HeatmapCanvas from "./heatmapCanvas";
import usePixelRatio from "./usePixelRatio";
import HeatmapLegend from "./heatmapLegend";
import PhylogenyCanvas from "./phylogenyCanvas";
import useContainerWidth from "./useContainerWidth";
import datasetsActions from "../../redux/datasets/actions";
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
  naturalCompare,
  panDomain,
  wheelZoomFactor,
  zoomDomain,
} from "../../helpers/singleCell/matrix";
import { layoutTree, parseNewick, pruneTree, toUnitHeight } from "../../helpers/singleCell/newick";
import { cnDistances, upgma } from "../../helpers/singleCell/phylogeny";
import Wrapper from "./index.style";
import useCohortFiles from "./cohort/useCohortFiles";
import TmbPanel from "./cohort/tmbPanel";
import CohortSignaturesPanel from "./cohort/cohortSignaturesPanel";
import OncoprintPanel from "./cohort/oncoprintPanel";
import CohortScatterPanel from "./cohort/cohortScatterPanel";
import CohortQcPanel from "./cohort/cohortQcPanel";
import PatientReportCard from "./patientReportCard";
import CohortGenePanel from "./cohort/cohortGenePanel";
import PatientCards from "./cohort/patientCards";
import CohortCircosPanel from "./cohort/cohortCircosPanel";
import CohortEventsTable from "./cohort/cohortEventsTable";
import CohortEventDrawer from "./cohort/cohortEventDrawer";
import CohortRnaPanel from "./cohort/cohortRnaPanel";
import CohortConvergencePanel from "./cohort/cohortConvergencePanel";
import HelpDrawer from "./helpDrawer";

const { Text } = Typography;
const LABEL_WIDTH = 160;
const TREE_WIDTH = 140;
const ROW_HEIGHT = 18;
// Cap on cells read per patient for the cohort heatmap.
const MAX_CELLS_PER_PATIENT = 2000;
// Per-cell rows shrink to keep the heatmap under ~900px tall.
const MAX_CELL_ROWS_HEIGHT = 900;
const PATIENT_PALETTE = ["#4E79A7", "#A0CBE8", "#F28E2B", "#FFBE7D", "#59A14F", "#8CD17D", "#B6992D", "#F1CE63", "#499894", "#86BCB6"];

function CloneBar({ counts, colors, width = 140 }) {
  const entries = Object.entries(counts).sort(([a], [b]) => naturalCompare(a, b));
  const total = entries.reduce((s, [, n]) => s + n, 0);
  let x = 0;
  return (
    <svg width={width} height={12} role="img">
      {entries.map(([clone, n]) => {
        const w = total ? (n / total) * width : 0;
        const rect = (
          <rect key={clone} x={x} y={0} width={Math.max(0, w - 0.5)} height={12} fill={colors[clone] || "#d9d9d9"}>
            <title>{`${clone}: ${n} (${Math.round((100 * n) / (total || 1))}%)`}</title>
          </rect>
        );
        x += w;
        return rect;
      })}
    </svg>
  );
}

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
  const [view, setView] = useState("overview");
  const [eventDrawer, setEventDrawer] = useState(null); // { summary, event }
  const openEvent = (summary, event) => summary && event && setEventDrawer({ summary, event });
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

  const openPatient = (summary) =>
    dispatch(datasetsActions.openCaseReport(summary.record.datasetId, summary.caseReportId));

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
  const columns = [
    {
      title: t("components.single-cell.cohort.patient"),
      dataIndex: "caseReportId",
      key: "patient",
      sorter: (a, b) => naturalCompare(a.caseReportId, b.caseReportId),
      render: (id, summary) => (
        <Button type="link" size="small" onClick={() => openPatient(summary)} style={{ padding: 0 }}>
          {id}
        </Button>
      ),
    },
    {
      title: t("components.single-cell.cohort.tumor-type"),
      key: "tumor_type",
      render: (_, s) => s.record.tumor_type || s.record.disease || "",
    },
    {
      title: t("components.single-cell.cohort.dataset"),
      key: "dataset",
      render: (_, s) => datasetOf(s)?.title || s.record.datasetId,
    },
    {
      title: t("components.single-cell.cohort.cells"),
      dataIndex: "nCells",
      key: "cells",
      sorter: (a, b) => a.nCells - b.nCells,
    },
    {
      title: t("components.single-cell.cohort.clones"),
      dataIndex: "nClones",
      key: "clones",
      sorter: (a, b) => a.nClones - b.nClones,
    },
    {
      title: t("components.single-cell.cohort.composition"),
      key: "composition",
      render: (_, s) => <CloneBar counts={s.cloneCounts} colors={cloneColors} />,
    },
    {
      title: t("components.single-cell.cohort.cells-read"),
      key: "cells-read",
      render: (_, s) => {
        const entry = rows[s.caseReportId];
        if (!entry) return <Text type="secondary">…</Text>;
        return (
          <Text type={entry.cellRows.length ? undefined : "secondary"}>
            {entry.cellRows.length}
            {entry.truncated ? ` (${t("components.single-cell.cohort.capped", { count: MAX_CELLS_PER_PATIENT })})` : ""}
          </Text>
        );
      },
    },
  ];

  const rowHeight =
    rowMode === "patients" || rowMode === "clones"
      ? ROW_HEIGHT * rowScale * (rowMode === "clones" ? 0.75 : 1)
      : Math.max(1, Math.min(6, (MAX_CELL_ROWS_HEIGHT * rowScale) / Math.max(1, heatRows.length)));
  const height = Math.max(ROW_HEIGHT, heatRows.length * rowHeight);

  const openCell = (cell) => cell?._patient && dispatch(datasetsActions.openCaseReport(cell._patient.record.datasetId, cell.cell_id));
  const analysisTabs = [
    { key: "overview", label: t("components.single-cell.cohort.view-overview") },
    { key: "reports", label: t("components.single-cell.cohort.view-reports") },
    { key: "drivers", label: t("components.single-cell.cohort.view-drivers") },
    { key: "events", label: t("components.single-cell.cohort.view-events") },
    { key: "rna", label: t("components.single-cell.cohort.view-rna") },
    { key: "mutations", label: t("components.single-cell.cohort.view-mutations") },
    { key: "scatter", label: t("components.single-cell.cohort.view-scatter") },
    { key: "qc", label: t("components.single-cell.cohort.view-qc") },
  ];

  return (
    <Wrapper>
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Space size="large" wrap>
            <Statistic title={t("components.single-cell.cohort.patients")} value={summaries.length} />
            <Statistic title={t("components.single-cell.cohort.cells")} value={totalCells} />
            {cohortFiles.progress < 100 && <Progress percent={cohortFiles.progress} size="small" style={{ width: 160 }} />}
            <HelpDrawer />
          </Space>
          <Tabs size="small" activeKey={view} onChange={setView} items={analysisTabs} />
        </Col>
        {view === "reports" &&
          summaries.map((s) => (
            <Col span={24} key={s.caseReportId}>
              <PatientReportCard
                patient={s.caseReportId}
                events={cohortFiles.files[s.caseReportId]?.events || []}
                cells={cellsForPatient(datafiles, s.patientKey)}
                variants={cohortFiles.files[s.caseReportId]?.variants || []}
                signatures={cohortFiles.files[s.caseReportId]?.signatures || null}
                treeLayout={cohortFiles.files[s.caseReportId]?.tree || null}
                cloneColors={cloneColors}
                onOpen={() => openPatient(s)}
              />
            </Col>
          ))}
        {view === "drivers" && (
          <>
            <Col span={24}>
              <CohortGenePanel summaries={summaries} files={cohortFiles.files} onOpen={openPatient} onEvent={openEvent} />
            </Col>
            <Col span={24}>
              <OncoprintPanel summaries={summaries} files={cohortFiles.files} onOpen={openPatient} onEvent={openEvent} />
            </Col>
            <Col span={24}>
              <CohortConvergencePanel summaries={summaries} files={cohortFiles.files} onEvent={openEvent} />
            </Col>
            <Col span={24}>
              <CohortCircosPanel summaries={summaries} files={cohortFiles.files} />
            </Col>
          </>
        )}
        {view === "overview" && (
          <Col span={24}>
            <PatientCards summaries={summaries} files={cohortFiles.files} datafiles={datafiles} cloneColors={cloneColors} onOpen={openPatient} />
          </Col>
        )}
        {view === "mutations" && (
          <>
            <Col span={24}>
              <TmbPanel summaries={summaries} files={cohortFiles.files} datafiles={datafiles} onOpen={openPatient} />
            </Col>
            <Col span={24}>
              <CohortSignaturesPanel summaries={summaries} files={cohortFiles.files} />
            </Col>
          </>
        )}
        {view === "rna" && (
          <Col span={24}>
            <CohortRnaPanel summaries={summaries} datasets={datasets} cnRows={rows} files={cohortFiles.files} />
          </Col>
        )}
        {view === "events" && (
          <Col span={24}>
            <CohortEventsTable summaries={summaries} files={cohortFiles.files} onEvent={openEvent} />
          </Col>
        )}
        {view === "scatter" && (
          <Col span={24}>
            <CohortScatterPanel summaries={summaries} files={cohortFiles.files} datafiles={datafiles} onOpen={openPatient} />
          </Col>
        )}
        {view === "qc" && (
          <Col span={24}>
            <CohortQcPanel summaries={summaries} datafiles={datafiles} onOpenCell={openCell} />
          </Col>
        )}
        {view === "overview" && (
        <Col span={24}>
          <Card size="small" title={<Space><ApartmentOutlined />{t("components.single-cell.cohort.table-title")}</Space>}>
            <Table
              size="small"
              rowKey="caseReportId"
              columns={columns}
              dataSource={summaries}
              pagination={{ pageSize: 20, hideOnSinglePage: true }}
            />
          </Card>
        </Col>
        )}
        {view === "overview" && (
        <Col span={24}>
          <Card
            size="small"
            title={t("components.single-cell.cohort.heatmap-title")}
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
                          borderRight: `4px solid ${PATIENT_PALETTE[b.patientIndex % PATIENT_PALETTE.length]}`,
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
                          ? [[t("components.single-cell.tooltip.cell"), entry.label]]
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
      />
    </Wrapper>
  );
}
