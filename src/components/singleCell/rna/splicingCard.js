import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { useSpliceExons } from "../cohort/cohortSpliceEvent";
import { clusterEvents, clusterTranscripts, differingJunctions, groupCellPsi, junctionEvent, mainJunctions } from "../../../helpers/singleCell/spliceEvents";
import { resolveChromosome } from "../../../helpers/singleCell/matrix";
import Violins from "../violins";
import { useTranslation } from "react-i18next";
import { Alert, Card, Col, Empty, Input, Row, Segmented, Select, Space, Switch, Table, Tag, Typography } from "antd";
import { BranchesOutlined } from "@ant-design/icons";
import HintLine from "../hintLine";
import useTreeView from "../useTreeView";
import useContainerWidth from "../useContainerWidth";
import SvgExportButton from "../svgExportButton";
import CellIgvPanel, { SC_MAX_RNA_TRACKS } from "../cellIgvPanel";
import CellStripCanvas from "./cellStripCanvas";
import SashimiPlot, { TYPE_LABELS } from "./sashimiPlot";
import { rnaCellMaps } from "../../../helpers/singleCell/rnaFusions";
import {
  cellUsageMatrix,
  clusterByGroup,
  filterClusters,
  junctionLabel,
  maxDeltaPsi,
  rnaGrouping,
  rnaRowsInTreeOrder,
  variantByGroup,
  variantSummary,
} from "../../../helpers/singleCell/splicing";
import { byGroupEvidence, junctionType, rankClustersByGroup, sashimiGroups, variantLoci, variantSliceCells, variantVsCopyNumber } from "../../../helpers/singleCell/sashimi";
import { cnAtPosition, geneLocus } from "../../../helpers/singleCell/dosage";
import { formatP } from "../../../helpers/singleCell/tests";
import { NO_READS_COLOR, junctionColor, psiColor, readsColor } from "../../../helpers/singleCell/rnaColors";
import { fieldLabel } from "../../../helpers/singleCell/fieldLabels";

const { Text } = Typography;
const k = "components.single-cell.splicing";
const fmtPct = (p) => (Number.isFinite(p) ? `${(p * 100).toFixed(1)}%` : "–");
const fmtQ = (q) => (Number.isFinite(q) ? (q < 1e-3 ? q.toExponential(1) : q.toPrecision(2)) : "–");
const STRIP_ROW_H = 14;
const STRIP_LABEL_W = 176;
const MAX_TRACKS = 8;
const NO_CLONE = "rgba(0,0,0,0.12)";
const TYPE_TAG = { exon_skip: "volcano", novel_combination: "orange", novel_donor: "purple", novel_acceptor: "purple", novel: "magenta" };
/** Copy number on a log ramp: 2 (light) .. 64+ (dark red). */
const cnColor = (cn) => {
  if (!Number.isFinite(cn)) return null;
  const f = Math.max(0, Math.min(1, Math.log2(Math.max(1, cn) / 2) / 5));
  return readsColor(1 + f * 99, 100);
};
const clusterStart = (c) => Math.min(...c.junctions.map((j) => Number(j.start)));
const clusterEnd = (c) => Math.max(...c.junctions.map((j) => Number(j.end)));
const chrLabel = (c) => `chr${`${c}`.replace(/^chr/, "")}`;

/** Group-by choices: the DNA clone, then categorical rna/cells.json fields. */
function useGroupFields(summary) {
  const { t } = useTranslation("common");
  return useMemo(
    () => [
      { value: "clone", label: t(`${k}.group-clone`) },
      ...(summary?.fields || []).filter((f) => !f.numeric && f.levels && f.levels.length <= 24).map((f) => ({ value: f.name, label: fieldLabel(f.name) })),
    ],
    [summary, t]
  );
}

/** A labelled stack of per-cell strips (rows share the columns: RNA cells in tree order). */
function LabelledStrips({ rows, nTree, width, strips, ariaLabel }) {
  return (
    <div style={{ display: "flex" }} role="img" aria-label={ariaLabel}>
      <div style={{ width: STRIP_LABEL_W, flex: "none" }}>
        {strips.map((s) => (
          <div key={s.key} style={{ height: STRIP_ROW_H, lineHeight: `${STRIP_ROW_H}px`, fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden" }} title={s.title || s.label}>
            {s.swatch && <span className="sc-swatch" style={{ background: s.swatch }} />}
            {s.label}
          </div>
        ))}
      </div>
      <CellStripCanvas
        n={rows.length}
        rows={strips.length}
        width={Math.max(200, width - STRIP_LABEL_W - 8)}
        height={strips.length * STRIP_ROW_H}
        gaps={nTree < rows.length ? [nTree] : []}
        colorOf={(i, r) => strips[r].colorOf(i)}
        titleOf={(i, r) => strips[r].titleOf(i)}
      />
    </div>
  );
}

/** Known splice variants (EGFRvIII, MET exon 14 skipping, ...): summary, per-cell strips with clone and gene CN, per-group table, CN link, IGV. */
function KnownVariants({ variants, rows, nTree, groupOf, width, cloneStrip, cellOf, spliceReads }) {
  const { t } = useTranslation("common");
  const patientId = useSelector((s) => s.SingleCell.patient?.caseReportId);
  const cn = useSelector((s) => s.SingleCell.cn);
  const genesState = useSelector((s) => s.Genes);
  const shown = useMemo(() => variants.filter((v) => Object.keys(v.cells || {}).length > 0), [variants]);
  const [picked, setPicked] = useState(null);
  useEffect(() => setPicked((p) => (shown.some((v) => v.id === p) ? p : [...shown].sort((a, b) => (b.n_cells_alt || 0) - (a.n_cells_alt || 0))[0]?.id)), [shown]);
  const variant = shown.find((v) => v.id === picked);
  const summaries = useMemo(() => shown.map((v) => ({ ...v, key: v.id, ...variantSummary(v) })), [shown]);
  const groups = useMemo(() => (variant ? variantByGroup(variant, groupOf) : []), [variant, groupOf]);
  const max = useMemo(() => {
    let m = 1;
    rows.forEach((r) => (variant?.cells?.[r.rna_id] || []).forEach((v) => (m = Math.max(m, Number(v) || 0))));
    return m;
  }, [variant, rows]);
  // copy number of the variant's gene in the same cells (DNA)
  const cnOfCell = useMemo(() => {
    const locus = variant && cn?.status === "ok" ? geneLocus(genesState, variant.gene) : null;
    return locus ? cnAtPosition(cn.data, locus.mid) : new Map();
  }, [variant, cn, genesState]);
  const cnLink = useMemo(() => (variant && cnOfCell.size ? variantVsCopyNumber(variant, cellOf, cnOfCell) : null), [variant, cnOfCell, cellOf]);
  const slices = useMemo(() => (variant ? variantSliceCells(variant, spliceReads, 6) : null), [variant, spliceReads]);
  const [igvOn, setIgvOn] = useState(false);
  const [igvCells, setIgvCells] = useState([]);
  useEffect(() => setIgvCells(slices ? slices.default.map((r) => r.rna_id) : []), [slices]);
  if (!shown.length) return null;
  const pair = (i) => variant?.cells?.[rows[i].rna_id];
  const reads = (row) => (i) => {
    const p = pair(i);
    if (!p) return null;
    const v = Number(p[row]) || 0;
    return v > 0 ? readsColor(v, max) : NO_READS_COLOR;
  };
  const readTitle = (i) => {
    const p = pair(i);
    return `${rows[i].cell_id || rows[i].rna_id}: ${p ? `${p[0]} alt / ${p[1]} ref` : "–"}`;
  };
  const strips = variant
    ? [
        cloneStrip,
        { key: "alt", label: t(`${k}.strip-alt`), colorOf: reads(0), titleOf: readTitle },
        { key: "ref", label: t(`${k}.strip-ref`), colorOf: reads(1), titleOf: readTitle },
        ...(cnOfCell.size
          ? [
              {
                key: "cn",
                label: t(`${k}.strip-cn`, { gene: variant.gene }),
                colorOf: (i) => cnColor(cnOfCell.get(rows[i].cell_id)),
                titleOf: (i) => {
                  const v = cnOfCell.get(rows[i].cell_id);
                  return `${rows[i].cell_id || rows[i].rna_id}: ${variant.gene} CN ${Number.isFinite(v) ? v.toFixed(1) : "–"}`;
                },
              },
            ]
          : []),
      ]
    : [];
  const sliceById = new Map((slices ? [...slices.carriers, ...slices.refs] : []).map((r) => [r.rna_id, r]));
  const loci = variant ? variantLoci(variant) : [];
  const igvView =
    igvOn && loci.length && igvCells.length
      ? {
          cellIds: [],
          rnaTracks: igvCells
            .map((id) => sliceById.get(id))
            .filter(Boolean)
            .map((r) => ({ rna_id: r.rna_id, bam: r.bam, patientId, label: `${r.rna_id} (${r.alt} alt / ${r.ref} ref)` })),
          chromosome: loci[0].chromosome,
          position: loci[0].position,
          loci,
          window: 150,
          label: variant.id,
        }
      : null;
  return (
    <Space direction="vertical" size={8} style={{ width: "100%" }}>
      <Space size={4}>
        <Text strong>{t(`${k}.variants-title`)}</Text>
        <HintLine inline text={t(`${k}.variants-help`)} />
      </Space>
      <Table
        size="small"
        pagination={false}
        dataSource={summaries}
        rowClassName={(r) => (r.id === picked ? "ant-table-row-selected" : "")}
        onRow={(r) => ({ onClick: () => setPicked(r.id), style: { cursor: "pointer" } })}
        columns={[
          { title: t(`${k}.col-variant`), dataIndex: "id", render: (v, r) => (r.nAlt > 0 ? <Text strong>{v}</Text> : v) },
          { title: t(`${k}.col-gene`), dataIndex: "gene" },
          { title: "", dataIndex: "description" },
          { title: t(`${k}.col-alt-cells`), key: "cells", align: "right", render: (_, r) => `${r.nAlt} / ${r.nCells}` },
          { title: t(`${k}.col-alt`), dataIndex: "alt", align: "right" },
          { title: t(`${k}.col-ref`), dataIndex: "ref", align: "right" },
          { title: t(`${k}.col-frac`), key: "frac", align: "right", render: (_, r) => fmtPct(r.frac) },
        ]}
      />
      {variant && (
        <>
          <Space size={4} wrap>
            <Text>{variant.id}</Text>
            <HintLine inline text={t(`${k}.variant-strip-help`)} />
            <Text type="secondary">{t(`${k}.variant-summary`, variantSummary(variant))}</Text>
          </Space>
          <LabelledStrips rows={rows} nTree={nTree} width={width} strips={strips} ariaLabel={`${variant.id} per cell`} />
          {cnLink && cnLink.carriers.length > 0 && (
            <Text type="secondary">
              {t(`${k}.variant-cn`, {
                gene: variant.gene,
                nCarriers: cnLink.carriers.length,
                cnCarriers: cnLink.medianCarriers.toFixed(1),
                nOthers: cnLink.others.length,
                cnOthers: Number.isFinite(cnLink.medianOthers) ? cnLink.medianOthers.toFixed(1) : "–",
                p: formatP(cnLink.p) || "–",
              })}
            </Text>
          )}
          <Table
            size="small"
            rowKey="group"
            pagination={false}
            dataSource={groups}
            columns={[
              { title: t(`${k}.col-group`), dataIndex: "group" },
              { title: t(`${k}.col-cells`), dataIndex: "nCells", align: "right" },
              { title: t(`${k}.col-alt-cells`), dataIndex: "nAlt", align: "right" },
              { title: t(`${k}.col-alt`), dataIndex: "alt", align: "right" },
              { title: t(`${k}.col-ref`), dataIndex: "ref", align: "right" },
              { title: t(`${k}.col-frac`), dataIndex: "frac", align: "right", render: fmtPct, sorter: (a, b) => (a.frac || 0) - (b.frac || 0) },
            ]}
          />
          {sliceById.size > 0 && (
            <Space direction="vertical" size={6} style={{ width: "100%" }}>
              <Space wrap>
                <Switch size="small" checked={igvOn} onChange={setIgvOn} />
                <Text>{t(`${k}.igv-toggle`)}</Text>
                {igvOn && (
                  <Select
                    size="small"
                    mode="multiple"
                    maxCount={SC_MAX_RNA_TRACKS}
                    style={{ minWidth: 380 }}
                    value={igvCells}
                    onChange={setIgvCells}
                    maxTagCount="responsive"
                    showSearch
                    options={[...sliceById.values()].map((r) => ({ value: r.rna_id, label: `${r.rna_id} · ${r.alt} alt / ${r.ref} ref` }))}
                  />
                )}
                <HintLine inline text={t(`${k}.igv-help`)} />
              </Space>
              {igvView && <CellIgvPanel view={igvView} embedded />}
            </Space>
          )}
        </>
      )}
    </Space>
  );
}

const TYPE_FILTERS = ["all", "alternative", "novel"];

/** Intron clusters: ranked by difference between groups; sashimi per group, per-cell usage in tree order. */
const MIN_GROUP_CELLS = 5;

function ClusterExplorer({ clusters, rows, nTree, groupOf, groupColor, width, cloneStrip }) {
  const dataset = useSelector((s) => s.Settings.dataset);
  const { t } = useTranslation("common");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [picked, setPicked] = useState(null);
  const [mode, setMode] = useState("groups");
  const [highlight, setHighlight] = useState(null);
  const [focus, setFocus] = useState("differing");
  const plotRef = useRef(null);
  const cnSource = useSelector((s) => s.SingleCell.cn);
  const chromoBins = useSelector((s) => s.Settings.chromoBins);
  const ranked = useMemo(() => rankClustersByGroup(clusters, groupOf), [clusters, groupOf]);
  const tableRows = useMemo(() => {
    const keep = new Set(filterClusters(clusters, query).map((c) => c.id));
    return ranked
      .filter((r) => keep.has(r.id))
      .filter((r) => typeFilter === "all" || (typeFilter === "novel" ? r.types.some((x) => x.startsWith("novel")) : r.types.some((x) => x !== "annotated")))
      .sort(byGroupEvidence);
  }, [ranked, clusters, query, typeFilter]);
  useEffect(() => {
    if (tableRows.length && !tableRows.some((r) => r.id === picked)) setPicked(tableRows[0].id);
  }, [tableRows, picked]);
  useEffect(() => setHighlight(null), [picked]);
  const cluster = clusters.find((c) => c.id === picked);
  const groups = useMemo(() => (cluster ? clusterByGroup(cluster, groupOf) : []), [cluster, groupOf]);
  const usage = useMemo(() => (cluster ? cellUsageMatrix(cluster, rows) : null), [cluster, rows]);
  const exonModel = useSpliceExons(dataset);
  const transcripts = useMemo(() => (cluster ? clusterTranscripts(exonModel, cluster) : []), [cluster, exonModel]);
  const spliceEvent = useMemo(() => (cluster ? clusterEvents(cluster, transcripts)[0] || null : null), [cluster, transcripts]);
  // groups with too few cells are pooled: a 2-cell clone's PSI is mostly sampling noise
  const bigGroups = useMemo(() => groups.filter((g) => g.nCells >= MIN_GROUP_CELLS), [groups]);
  const smallGroups = useMemo(() => groups.filter((g) => g.nCells < MIN_GROUP_CELLS), [groups]);
  const shownIdx = useMemo(() => {
    if (!cluster) return [];
    const all = cluster.junctions.map((_, j) => j);
    if (focus === "all") return all;
    const tot = groups.reduce((acc, g) => acc.map((v, j) => v + g.counts[j]), new Array(cluster.junctions.length).fill(0));
    if (focus === "main") return mainJunctions(tot);
    const keep = new Set(differingJunctions(groups, { minCells: MIN_GROUP_CELLS, top: 4 }));
    (spliceEvent ? [...spliceEvent.junctions.incl, ...spliceEvent.junctions.skip] : []).forEach((j) => keep.add(j));
    return all.filter((j) => keep.has(j));
  }, [cluster, groups, focus, spliceEvent]);
  // event shown per cell: the named event, else the junction that differs most between the groups
  const viewEvent = useMemo(() => {
    if (!cluster) return null;
    if (spliceEvent) return spliceEvent;
    const [j] = differingJunctions(groups, { minCells: MIN_GROUP_CELLS, top: 1 });
    return j != null ? junctionEvent(j, cluster.junctions.length) : null;
  }, [cluster, spliceEvent, groups]);
  const eventGroups = useMemo(() => {
    if (!cluster || !viewEvent) return [];
    const big = new Set(bigGroups.map((g) => g.group));
    const m = groupCellPsi(cluster, viewEvent, (rnaId) => {
      const g = groupOf(rnaId);
      return big.has(g) ? g : null;
    });
    return bigGroups.filter((g) => m.has(g.group)).map((g) => ({ key: g.group, label: g.group, color: groupColor?.(g.group) || "#8c8c8c", values: m.get(g.group) }));
  }, [cluster, viewEvent, bigGroups, groupOf, groupColor]);
  // copy number at the cluster: amplified genes give DNA-rearrangement "junctions" and CN-driven differences
  const cnInfo = useMemo(() => {
    const cnData = cnSource?.status === "ok" ? cnSource.data : null;
    if (!cluster || !cnData || !chromoBins) return null;
    const key = resolveChromosome(`${cluster.chromosome}`, chromoBins);
    if (!key) return null;
    const at = cnAtPosition(cnData, chromoBins[key].startPlace + (clusterStart(cluster) + clusterEnd(cluster)) / 2);
    const cellOfRna = new Map(rows.map((r) => [r.rna_id, r.cell_id]));
    const med = (v) => {
      const x = v.filter(Number.isFinite).sort((a, b) => a - b);
      return x.length ? x[Math.floor((x.length - 1) / 2)] : NaN;
    };
    const byGroup = bigGroups.map((g) => {
      const ids = Object.keys(cluster.cells || {}).filter((r) => groupOf(r) === g.group).map((r) => cellOfRna.get(r)).filter(Boolean);
      return { group: g.group, cn: med(ids.map((id) => at.get(id))) };
    });
    const all = med([...at.values()]);
    const cns = byGroup.map((g) => g.cn).filter(Number.isFinite);
    const spread = cns.length > 1 ? Math.max(...cns) - Math.min(...cns) : 0;
    return { all, byGroup, flag: all >= 6 || spread >= 2 };
  }, [cluster, cnSource, chromoBins, rows, bigGroups, groupOf]);
  if (!clusters.length) return <Text type="secondary">{t(`${k}.no-clusters`)}</Text>;
  const allCounts = groups.reduce((acc, g) => acc.map((v, j) => v + g.counts[j]), new Array(cluster?.junctions.length || 0).fill(0));
  const nCellsAll = groups.reduce((a, g) => a + g.nCells, 0);
  const tracks = cluster
    ? [
        { key: "__all", label: t(`${k}.all-cells`), sublabel: `${t(`${k}.cells`, { count: nCellsAll })} · n=${allCounts.reduce((a, v) => a + v, 0)}`, counts: allCounts },
        ...(mode === "groups"
          ? [
              ...sashimiGroups(bigGroups, MAX_TRACKS, t(`${k}.other-groups`)),
              ...(smallGroups.length
                ? [
                    {
                      group: t(`${k}.small-groups`, { count: smallGroups.length, min: MIN_GROUP_CELLS }),
                      counts: smallGroups.reduce((acc, g) => acc.map((v, j) => v + g.counts[j]), new Array(cluster.junctions.length).fill(0)),
                      nCells: smallGroups.reduce((a, g) => a + g.nCells, 0),
                      total: smallGroups.reduce((a, g) => a + g.total, 0),
                      small: true,
                    },
                  ]
                : []),
            ].map((g) => ({
              key: g.group,
              label: g.group,
              swatch: g.small ? null : groupColor?.(g.group),
              sublabel: `${t(`${k}.cells`, { count: g.nCells })} · n=${g.total}`,
              counts: g.counts,
            }))
          : []),
      ]
    : [];
  const strips = cluster
    ? [
        cloneStrip,
        ...cluster.junctions.map((jn, j) => ({
          key: `j${j}`,
          label: `${j + 1}: ${TYPE_LABELS[junctionType(jn)]}`,
          title: junctionLabel(cluster.chromosome, jn),
          swatch: junctionColor(j),
          colorOf: (i) => {
            const p = usage.psi[i * usage.nJ + j];
            return Number.isFinite(p) ? psiColor(p) : null;
          },
          titleOf: (i) =>
            t(`${k}.strip-cell`, {
              cell: rows[i].cell_id || rows[i].rna_id,
              junction: j + 1,
              psi: Number.isFinite(usage.psi[i * usage.nJ + j]) ? usage.psi[i * usage.nJ + j].toFixed(2) : "–",
              total: usage.totals[i],
            }),
        })),
      ]
    : [];
  return (
    <Space direction="vertical" size={8} style={{ width: "100%" }}>
      <Space wrap>
        <Text strong>{t(`${k}.clusters-title`)}</Text>
        <HintLine inline text={t(`${k}.rank-help`)} />
        <Input.Search size="small" allowClear placeholder={t(`${k}.search-gene`)} style={{ width: 180 }} onSearch={setQuery} onChange={(e) => !e.target.value && setQuery("")} />
        <Segmented size="small" value={typeFilter} onChange={setTypeFilter} options={TYPE_FILTERS.map((f) => ({ value: f, label: t(`${k}.filter-${f}`) }))} />
        <Text type="secondary">
          {tableRows.length} / {clusters.length}
        </Text>
      </Space>
      <Table
        size="small"
        rowKey="id"
        dataSource={tableRows}
        pagination={{ pageSize: 8, size: "small", showSizeChanger: false }}
        rowClassName={(r) => (r.id === picked ? "ant-table-row-selected" : "")}
        onRow={(r) => ({ onClick: () => setPicked(r.id), style: { cursor: "pointer" } })}
        scroll={{ x: "max-content" }}
        columns={[
          {
            title: t(`${k}.col-gene`),
            dataIndex: "gene",
            render: (g, r) => (
              <Space size={4}>
                <Text strong>{g || "?"}</Text>
                {(r.cluster.selected_by || (r.cluster.cohort ? ["cohort"] : []))
                  .filter((x) => x !== "dispersion")
                  .map((x) => (
                    <Tag key={x} bordered={false}>
                      {t(`${k}.why-${x}`)}
                    </Tag>
                  ))}
              </Space>
            ),
          },
          { title: t(`${k}.col-locus`), key: "locus", render: (_, r) => `${chrLabel(r.cluster.chromosome)}:${clusterStart(r.cluster).toLocaleString("en-US")}` },
          {
            title: t(`${k}.col-types`),
            key: "types",
            render: (_, r) => (
              <Space size={2} wrap>
                {r.types
                  .filter((x) => x !== "annotated")
                  .map((x) => (
                    <Tag key={x} color={TYPE_TAG[x]}>
                      {TYPE_LABELS[x]}
                    </Tag>
                  ))}
              </Space>
            ),
          },
          { title: t(`${k}.col-junctions`), key: "nj", align: "right", render: (_, r) => r.cluster.junctions.length },
          { title: t(`${k}.col-cells-reads`), dataIndex: "nCells", align: "right", sorter: (a, b) => a.nCells - b.nCells },
          { title: t(`${k}.col-dpsi-groups`), dataIndex: "dpsi", align: "right", render: (v) => (Number.isFinite(v) ? v.toFixed(2) : "–"), sorter: (a, b) => (a.dpsi || 0) - (b.dpsi || 0) },
          { title: t(`${k}.col-q-groups`), dataIndex: "q", align: "right", render: fmtQ, sorter: (a, b) => (Number.isFinite(a.q) ? a.q : 2) - (Number.isFinite(b.q) ? b.q : 2) },
          {
            title: t(`${k}.col-cell-sd`),
            key: "sd",
            align: "right",
            render: (_, r) => (Number.isFinite(r.cluster.excess_sd) ? r.cluster.excess_sd.toFixed(2) : "–"),
            sorter: (a, b) => (a.cluster.excess_sd || 0) - (b.cluster.excess_sd || 0),
          },
        ]}
      />
      {cluster && (
        <>
          <Space wrap>
            <Text strong>
              {cluster.gene || "?"} · {junctionLabel(chrLabel(cluster.chromosome), { start: clusterStart(cluster), end: clusterEnd(cluster) })}
            </Text>
            <Segmented
              size="small"
              value={mode}
              onChange={setMode}
              options={[
                { value: "groups", label: t(`${k}.mode-groups`) },
                { value: "all", label: t(`${k}.mode-all`) },
              ]}
            />
            <HintLine inline text={t(`${k}.sashimi-help`)} />
            <Segmented
              size="small"
              value={focus}
              onChange={setFocus}
              options={["differing", "main", "all"].map((f) => ({ value: f, label: t(`${k}.focus-${f}`, { count: f === "all" ? cluster.junctions.length : undefined }) }))}
            />
            {bigGroups.length > 1 && <Text type="secondary">{t(`${k}.delta-big`, { value: maxDeltaPsi(bigGroups).toFixed(2), min: MIN_GROUP_CELLS })}</Text>}
            <SvgExportButton containerRef={plotRef} name={`sashimi-${cluster.gene || cluster.id}`} />
          </Space>
          <div ref={plotRef} style={{ overflowX: "auto" }}>
            <SashimiPlot
              cluster={{ ...cluster, junctions: shownIdx.map((j) => cluster.junctions[j]) }}
              tracks={tracks.map((tr) => ({ ...tr, counts: shownIdx.map((j) => tr.counts[j]) }))}
              junctionIndex={shownIdx}
              width={Math.max(520, width)}
              highlight={highlight == null ? null : shownIdx.indexOf(highlight)}
              transcripts={transcripts}
              event={spliceEvent}
            />
          </div>
          {shownIdx.length < cluster.junctions.length && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t(`${k}.focus-note`, { shown: shownIdx.length, total: cluster.junctions.length })}
            </Text>
          )}
          {cnInfo?.flag && (
            <Alert
              type="warning"
              showIcon
              message={t(`${k}.cn-flag`, {
                gene: cluster.gene || "this gene",
                cn: Number.isFinite(cnInfo.all) ? cnInfo.all.toFixed(0) : "?",
                groups: cnInfo.byGroup.filter((g) => Number.isFinite(g.cn)).map((g) => `${g.group} ${g.cn.toFixed(0)}`).join(", ") || "–",
              })}
            />
          )}
          {viewEvent && eventGroups.length > 0 && (
            <div>
              <Space size={6} wrap>
                <Text strong>{t(`${k}.event-by-group`, { event: viewEvent.type === "cassette" && viewEvent.exonNumber != null ? `exon ${viewEvent.exonNumber} inclusion` : viewEvent.label })}</Text>
                <HintLine inline text={t(`${k}.event-by-group-help`, { min: MIN_GROUP_CELLS })} />
              </Space>
              <Violins groups={eventGroups} domain={[0, 1]} yTitle="PSI" height={200} />
            </div>
          )}
          <Space size={4} wrap>
            {cluster.junctions.map((jn, j) => (
              <Tag
                key={j}
                style={{ cursor: "pointer", opacity: highlight == null || highlight === j ? 1 : 0.5 }}
                onMouseEnter={() => setHighlight(j)}
                onMouseLeave={() => setHighlight(null)}
                title={junctionLabel(cluster.chromosome, jn)}
              >
                <span className="sc-swatch" style={{ background: junctionColor(j) }} />
                {`${j + 1} · ${TYPE_LABELS[junctionType(jn)]}${jn.n_skipped ? ` (${t(`${k}.exons-inside`, { count: jn.n_skipped })})` : ""} · ${(jn.end - jn.start + 1).toLocaleString("en-US")} bp`}
              </Tag>
            ))}
          </Space>
          <Space size={4}>
            <Text>{t(`${k}.strip-title`)}</Text>
            <HintLine inline text={t(`${k}.strip-help`)} />
          </Space>
          <LabelledStrips rows={rows} nTree={nTree} width={width} strips={strips} ariaLabel={`${cluster.id} per cell`} />
          <Table
            size="small"
            rowKey="group"
            pagination={false}
            scroll={{ x: "max-content" }}
            dataSource={groups}
            columns={[
              { title: t(`${k}.col-group`), dataIndex: "group", fixed: "left" },
              { title: t(`${k}.col-cells`), dataIndex: "nCells", align: "right" },
              { title: t(`${k}.col-reads`), dataIndex: "total", align: "right" },
              ...cluster.junctions.map((jn, j) => ({
                title: (
                  <span title={junctionLabel(cluster.chromosome, jn)}>
                    <span className="sc-swatch" style={{ background: junctionColor(j) }} />
                    {`${t(`${k}.junction`)} ${j + 1}${junctionType(jn) !== "annotated" ? "*" : ""}`}
                  </span>
                ),
                key: `j${j}`,
                align: "right",
                render: (_, g) => `${fmtPct(g.psi[j])} (${g.counts[j]})`,
              })),
            ]}
          />
        </>
      )}
    </Space>
  );
}

/**
 * Splicing of the patient's RNA cells (rna/splicing.json from the back end:
 * regtools junctions, LeafCutter-style clusters typed against the GTF, known
 * variants with IGV slices); PSI per group (DNA clone, cell state, region,
 * ...) is pooled here and clusters are ranked by per-cell differences.
 */
export default function SplicingCard({ summary }) {
  const { t } = useTranslation("common");
  const source = useSelector((s) => s.SingleCell.rnaSplicing);
  const dnaCells = useSelector((s) => s.SingleCell.cells);
  const cloneColors = useSelector((s) => s.SingleCell.cloneColors);
  const { order } = useTreeView();
  const [ref, width] = useContainerWidth(1000);
  const fields = useGroupFields(summary);
  const [field, setField] = useState("clone");
  const data = source?.status === "ok" ? source.data : null;
  const { cellOf } = useMemo(() => rnaCellMaps([], summary?.cells || [], data?.cellMap), [summary, data]);
  const cloneOf = useMemo(() => new Map(dnaCells.map((c) => [c.cell_id, c.clone_id])), [dnaCells]);
  const groupOf = useMemo(() => rnaGrouping(field, summary?.cells || [], cloneOf, cellOf), [field, summary, cloneOf, cellOf]);
  const groupColor = useMemo(() => (field === "clone" ? (g) => cloneColors?.[g] : null), [field, cloneColors]);
  const { rows, nTree } = useMemo(() => {
    const ids = new Set((summary?.cells || []).map((c) => c.rna_id));
    Object.keys(data?.cellMap || {}).forEach((r) => ids.add(r));
    return rnaRowsInTreeOrder(order, [...ids], cellOf);
  }, [summary, data, order, cellOf]);
  const cloneStrip = useMemo(
    () => ({
      key: "clone",
      label: t(`${k}.strip-clone`),
      colorOf: (i) => {
        const c = rows[i]?.cell_id ? cloneOf.get(rows[i].cell_id) : null;
        return c == null ? NO_CLONE : cloneColors?.[c] || NO_CLONE;
      },
      titleOf: (i) => `${rows[i]?.cell_id || rows[i]?.rna_id}: ${t(`${k}.group-clone`)} ${rows[i]?.cell_id ? cloneOf.get(rows[i].cell_id) ?? "–" : "–"}`,
    }),
    [rows, cloneOf, cloneColors, t]
  );

  const title = (
    <Space>
      <BranchesOutlined />
      <span>{t(`${k}.title`)}</span>
      <HintLine inline provenance="splicing" text={t(`${k}.help`)} />
    </Space>
  );
  if (!data) {
    return (
      <Card size="small" title={title}>
        {source?.status === "error" ? (
          <Alert type="warning" showIcon message={t(`${k}.error`, { error: source.error?.message || `${source.error}` })} />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t(`${k}.none`)} />
        )}
      </Card>
    );
  }
  const innerW = Math.max(300, width - 8);
  return (
    <Card
      size="small"
      title={title}
      extra={
        <Space>
          <Text type="secondary">{t(`${k}.group-by`)}</Text>
          <Select size="small" style={{ width: 170 }} value={field} onChange={setField} options={fields} />
        </Space>
      }
    >
      <div ref={ref}>
        <Row gutter={[16, 16]}>
          {data.variants.length > 0 && (
            <Col span={24}>
              <KnownVariants variants={data.variants} rows={rows} nTree={nTree} groupOf={groupOf} width={innerW} cloneStrip={cloneStrip} cellOf={cellOf} spliceReads={data.spliceReads} />
            </Col>
          )}
          <Col span={24}>
            <ClusterExplorer clusters={data.clusters} rows={rows} nTree={nTree} groupOf={groupOf} groupColor={groupColor} width={innerW} cloneStrip={cloneStrip} />
          </Col>
        </Row>
      </div>
    </Card>
  );
}
