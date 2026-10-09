import React, { useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { AutoComplete, Button, Card, Checkbox, Empty, InputNumber, Progress, Select, Space, Tooltip } from "antd";
import SvgExportButton from "./svgExportButton";
import { BarChartOutlined } from "@ant-design/icons";
import PhylogenyCanvas from "./phylogenyCanvas";
import useContainerWidth from "./useContainerWidth";
import usePixelRatio from "./usePixelRatio";
import useTreeView from "./useTreeView";
import useRnaData from "./rna/useRnaData";
import singleCellActions from "../../redux/singleCell/actions";
import { signatureColorOf, AetiologyLegend } from "./signaturePanel";
import { cnRowQc } from "../../helpers/singleCell/cohortStats";
import { cnAtPosition, geneLocus } from "../../helpers/singleCell/dosage";
import { geneValues, searchGeneNames } from "../../helpers/singleCell/staticRna";
import { rowMap } from "../../helpers/singleCell/matrix";
import { sitesSeenInRows } from "../../helpers/singleCell/snvSites";
import useSignatureModel from "./signatures/useSignatureModel";
import { signatureBurden } from "../../helpers/singleCell/signatureAssign";
import { cutTree, labelRuns } from "../../helpers/singleCell/treeGroups";
import { CELL_QC_METRICS } from "./cohort/cohortQcPanel";
import HintLine, { Provenance } from "./hintLine";
import { INK, TYPE } from "../../helpers/singleCell/plotTheme";

const MIN_HEIGHT = 440;
const TREE_WIDTH = 240;
const MIN_TRACK_W = 160;
const MAX_TRACK_W = 480;
const GAP = 6;
const HEADER = 34;

const CELL_FIELDS = [["ploidy", "Ploidy"], ["snv_count", "SNVs per cell"], ["junction_count", "Junctions per cell"], ...CELL_QC_METRICS.map(([k, l]) => [k, l])];
const CN_FIELDS = [["fractionAltered", "Fraction of genome altered"], ["segments", "CN segments"], ["chrXMeanCn", "Mean CN on chrX"]];

/**
 * Bar annotations beside the phylogeny: numeric per-cell values (QC, counts,
 * state scores, a gene's expression or copy number) as horizontal bars, and
 * SBS signature activities as stacked bars, per cell or aggregated per clade
 * (clones, or the tree cut into k clades).
 */
export default function PhyloBarsCard({ defaultTracks = ["snv_count"], defaultGene = "EGFR", defaultMode = "cells", title }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const { cells, cn, snv, cloneColors, selectedCellIds, hoveredCellId, layout } = useSelector((s) => s.SingleCell);
  const genesState = useSelector((s) => s.Genes);
  const { order, treeLayout, cellById } = useTreeView();
  const { summary, matrix } = useRnaData();
  const [containerRef, width] = useContainerWidth(900);
  const pixelRatio = usePixelRatio();
  const [tracks, setTracks] = useState(defaultTracks);
  const [gene, setGene] = useState(defaultGene);
  const [geneOptions, setGeneOptions] = useState([]);
  const [mode, setMode] = useState(defaultMode);
  const [k, setK] = useState(4);
  const model = useSignatureModel();
  const [sigProgress] = useState(null);
  const [hoverRange, setHoverRange] = useState(null);

  const nRows = order.length;
  const rowOf = useMemo(() => new Map(order.map((id, i) => [id, i])), [order]);
  const selectedRows = useMemo(() => new Set(selectedCellIds.map((id) => rowOf.get(id)).filter((r) => r != null)), [selectedCellIds, rowOf]);
  const hoverRow = hoveredCellId != null && rowOf.has(hoveredCellId) ? rowOf.get(hoveredCellId) : null;
  const leafClones = useMemo(() => order.map((id) => cellById.get(id)?.clone_id ?? null), [order, cellById]);

  /* ---- groups: one per cell, or clades ---- */
  const groups = useMemo(() => {
    if (mode === "cells") return order.map((id, i) => ({ key: id, label: id, first: i, last: i, rows: [i] }));
    const runs = mode === "clones" ? labelRuns(leafClones).map((r) => ({ ...r, key: `${r.label}:${r.first}` })) : treeLayout ? cutTree(treeLayout, k).map((c, i) => ({ ...c, label: `${t("components.single-cell.bars.clade")} ${i + 1}`, key: `cut:${c.node}` })) : [];
    return runs.map((r) => ({ ...r, rows: d3.range(r.first, r.last + 1) }));
  }, [mode, order, leafClones, treeLayout, k, t]);

  /* ---- available tracks ---- */
  const cnQc = useMemo(() => {
    const out = new Map();
    if (cn.status === "ok" && cn.data) cn.data.cells.forEach((id, i) => out.set(id, cnRowQc(cn.data.rows[i])));
    return out;
  }, [cn]);
  const rnaById = useMemo(() => {
    const out = new Map();
    (summary?.cells || []).forEach((c, i) => c.cell_id && out.set(c.cell_id, i));
    return out;
  }, [summary]);
  const numericRnaFields = useMemo(() => (summary?.fields || []).filter((f) => f.numeric).map((f) => f.name), [summary]);
  const locus = useMemo(() => geneLocus(genesState, gene), [genesState, gene]);
  const geneIndex = summary?.geneIndex.get(gene) ?? summary?.geneIndex.get(`${gene}`.toUpperCase());
  const hasContexts = snv.status === "ok" && snv.data?.variants?.some((v) => v.context);

  const trackOptions = useMemo(() => {
    const has = (key) => cells.some((c) => Number.isFinite(Number(c[key])));
    const opts = [];
    CELL_FIELDS.filter(([key]) => has(key)).forEach(([key, label]) => opts.push({ value: key, label, group: "cell" }));
    if (cnQc.size) CN_FIELDS.forEach(([key, label]) => opts.push({ value: `cn:${key}`, label, group: "cn" }));
    if (locus && cn.status === "ok") opts.push({ value: "genecn", label: `${t("components.single-cell.bars.gene-cn")} (${locus.gene})`, group: "gene" });
    if (geneIndex != null && matrix) opts.push({ value: "geneexpr", label: `${t("components.single-cell.bars.gene-expr")} (${gene})`, group: "gene" });
    numericRnaFields.forEach((f) => opts.push({ value: `rna:${f}`, label: f, group: "rna" }));
    if (hasContexts) opts.push({ value: "signatures", label: t("components.single-cell.bars.signatures"), group: "snv" });
    return opts;
  }, [cells, cnQc, locus, cn.status, geneIndex, matrix, gene, numericRnaFields, hasContexts, t]);

  /* ---- values per cell for each numeric track ---- */
  const valuesFor = useMemo(() => {
    const geneCn = locus && cn.status === "ok" ? cnAtPosition(cn.data, locus.start) : null;
    const expr = geneIndex != null && matrix ? geneValues(matrix, summary.cells.length, geneIndex) : null;
    return (track) => {
      const map = new Map();
      order.forEach((id) => {
        let v = null;
        if (track.startsWith("cn:")) v = cnQc.get(id)?.[track.slice(3)];
        else if (track === "genecn") v = geneCn?.get(id);
        else if (track === "geneexpr") v = rnaById.has(id) ? expr[rnaById.get(id)] : null;
        else if (track.startsWith("rna:")) v = rnaById.has(id) ? summary.cells[rnaById.get(id)][track.slice(4)] : null;
        else v = cellById.get(id)?.[track];
        const num = Number(v);
        if (v != null && Number.isFinite(num)) map.set(id, num);
      });
      return map;
    };
  }, [order, cellById, cnQc, locus, cn, geneIndex, matrix, summary, rnaById]);

  /* ---- signatures per group: unique mutations assigned by the joint fit ---- */
  const sigFits = useMemo(() => {
    if (!tracks.includes("signatures") || !model.ready || !hasContexts || !groups.length) return {};
    const rows = rowMap(order, snv.data.cells);
    const out = {};
    groups.forEach((grp) => {
      const seen = sitesSeenInRows(snv.data, grp.rows.map((r) => rows[r]).filter((r) => r >= 0));
      const b = signatureBurden([...seen], model.assignment);
      out[grp.key] = { activities: Object.entries(b.counts).map(([signature, activity]) => ({ signature, activity })), n: b.assigned };
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks.includes("signatures"), model, hasContexts, groups, order, snv]);

  /* ---- geometry: tracks share the width left of the tree; rows at least 3 px ---- */
  const HEIGHT = Math.max(MIN_HEIGHT, Math.min(1400, nRows * 3));
  const rowH = HEIGHT / Math.max(1, nRows);
  const treeWidth = treeLayout ? TREE_WIDTH : 0;
  const shown = tracks.filter((tr) => trackOptions.some((o) => o.value === tr));
  const avail = Math.max(MIN_TRACK_W, width - treeWidth - GAP - 16);
  const TRACK_W = Math.max(MIN_TRACK_W, Math.min(MAX_TRACK_W, Math.floor((avail - GAP * Math.max(0, shown.length - 1)) / Math.max(1, shown.length))));
  const svgWidth = Math.max(TRACK_W, shown.length * (TRACK_W + GAP));
  const hoverRef = useRef(null);
  const share = (id) => {
    if (hoverRef.current === id) return;
    hoverRef.current = id;
    dispatch(singleCellActions.updateHover(id));
  };
  const selectGroup = (grp, e) => {
    const ids = grp.rows.map((r) => order[r]);
    dispatch(singleCellActions.updateSelection(e?.metaKey || e?.ctrlKey || e?.shiftKey ? [...selectedCellIds, ...ids] : ids));
  };
  const yOf = (grp) => grp.first * rowH;
  const hOf = (grp) => Math.max(1, (grp.last - grp.first + 1) * rowH - (mode === "cells" ? 0 : 2));

  const renderNumeric = (track, x0) => {
    const values = valuesFor(track);
    const agg = groups.map((grp) => {
      const vs = grp.rows.map((r) => values.get(order[r])).filter((v) => v != null);
      return { grp, value: vs.length ? d3.mean(vs) : null, n: vs.length };
    });
    const max = d3.max(agg, (a) => a.value) || 1;
    const min = Math.min(0, d3.min(agg, (a) => a.value) || 0);
    const x = d3.scaleLinear().domain([min, max]).nice().range([0, TRACK_W - 4]);
    const label = trackOptions.find((o) => o.value === track)?.label || track;
    return (
      <g key={track} transform={`translate(${x0},0)`}>
        <text x={0} y={12} fontSize={TYPE.label} fontWeight="600" fill={INK.text}>{label.length > 24 ? `${label.slice(0, 23)}…` : label}<title>{label}</title></text>
        <text x={TRACK_W - 4} y={HEADER - 6} textAnchor="end" fontSize={11} fill={INK.muted}>{d3.format("~g")(x.domain()[1])}</text>
        <text x={x(0)} y={HEADER - 6} textAnchor="start" fontSize={11} fill={INK.muted}>{d3.format("~g")(x.domain()[0])}</text>
        <line x1={x(0)} x2={x(0)} y1={HEADER} y2={HEADER + HEIGHT} stroke={INK.border} />
        {agg.map(({ grp, value, n }) =>
          value == null ? null : (
            <rect
              key={grp.key}
              x={Math.min(x(0), x(value))}
              y={HEADER + yOf(grp)}
              width={Math.max(0.5, Math.abs(x(value) - x(0)))}
              height={hOf(grp)}
              fill={mode === "cells" ? (cloneColors[leafClones[grp.first]] || "#4E79A7") : "#4E79A7"}
              fillOpacity={selectedRows.size && !grp.rows.some((r) => selectedRows.has(r)) ? 0.35 : 0.9}
              style={{ cursor: "pointer" }}
              onClick={(e) => selectGroup(grp, e)}
              onMouseEnter={() => mode === "cells" && share(grp.key)}
            >
              <title>{`${grp.label}: ${d3.format("~g")(value)}${mode === "cells" ? "" : ` (mean of ${n})`}`}</title>
            </rect>
          )
        )}
      </g>
    );
  };

  const renderSignatures = (x0) => (
    <g key="signatures" transform={`translate(${x0},0)`}>
      <text x={0} y={12} fontSize={TYPE.label} fontWeight="600" fill={INK.text}>{t("components.single-cell.bars.signatures")}</text>
      <text x={0} y={HEADER - 6} fontSize={11} fill={INK.muted}>{t("components.single-cell.bars.signatures-axis2")}</text>
      {groups.map((grp) => {
        const fit = sigFits[grp.key];
        if (!fit || !fit.activities.length) return null;
        const total = fit.activities.reduce((s, a) => s + a.activity, 0) || 1;
        let x = 0;
        return (
          <g key={grp.key} style={{ cursor: "pointer" }} onClick={(e) => selectGroup(grp, e)} onMouseEnter={() => mode === "cells" && share(grp.key)}>
            {fit.activities
              .slice()
              .sort((a, b) => b.activity - a.activity)
              .map((a) => {
                const w = ((TRACK_W - 4) * a.activity) / total;
                const rect = <rect key={a.signature} x={x} y={HEADER + yOf(grp)} width={Math.max(0, w - 0.3)} height={hOf(grp)} fill={signatureColorOf(a.signature)} />;
                x += w;
                return rect;
              })}
            <title>{`${grp.label} (${fit.n} assigned mutations)\n${fit.activities.slice().sort((a, b) => b.activity - a.activity).map((a) => `${a.signature}: ${a.activity} (${d3.format(".0%")(a.activity / total)})`).join("\n")}`}</title>
          </g>
        );
      })}
    </g>
  );

  if (!treeLayout || !nRows) return null;
  const sigRows = Object.values(sigFits).filter((f) => f.activities.length);

  return (
    <Card
      size="small"
      title={<Space><BarChartOutlined />{title || t("components.single-cell.bars.title")}<Provenance id="phyloBars" /></Space>}
      extra={
        <Space wrap>
          <Select
            size="small"
            mode="multiple"
            allowClear
            maxTagCount="responsive"
            style={{ minWidth: 260, maxWidth: 520 }}
            placeholder={t("components.single-cell.bars.pick")}
            value={shown}
            onChange={setTracks}
            options={trackOptions}
          />
          <AutoComplete
            size="small"
            style={{ width: 120 }}
            value={gene}
            options={geneOptions}
            onChange={setGene}
            onSearch={(q) => setGeneOptions(summary ? searchGeneNames(summary.genes, q).map((g) => ({ value: g })) : [])}
            placeholder={t("components.single-cell.bars.gene")}
          />
          <Select
            size="small"
            style={{ width: 150 }}
            value={mode}
            onChange={setMode}
            options={[
              { value: "cells", label: t("components.single-cell.bars.per-cell") },
              { value: "clones", label: t("components.single-cell.bars.per-clone") },
              { value: "cut", label: t("components.single-cell.bars.per-clade") },
            ]}
          />
          {mode === "cut" && <InputNumber size="small" min={2} max={30} value={k} onChange={(v) => setK(v || 2)} style={{ width: 64 }} />}
          <Tooltip title={t("components.single-cell.toolbar.clip-help")}>
            <Checkbox checked={Boolean(layout.clipBranches)} onChange={(e) => dispatch(singleCellActions.updateLayout({ clipBranches: e.target.checked }))}>
              {t("components.single-cell.toolbar.clip")}
            </Checkbox>
          </Tooltip>
          <SvgExportButton containerRef={containerRef} name="tree-bars" />
          {selectedCellIds.length > 0 && (
            <Button size="small" type="text" onClick={() => dispatch(singleCellActions.updateSelection([]))}>
              {t("components.single-cell.selection.clear")}
            </Button>
          )}
        </Space>
      }
    >
      <div ref={containerRef}>
        {!shown.length ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.bars.pick")} />
        ) : (
          <div style={{ display: "flex", gap: GAP, alignItems: "flex-start", overflowX: "auto" }} onMouseLeave={() => share(null)}>
            <div style={{ paddingTop: HEADER }}>
              <PhylogenyCanvas
                layout={treeLayout}
                nRows={nRows}
                width={treeWidth}
                height={HEIGHT}
                pixelRatio={pixelRatio}
                leafClones={leafClones}
                cloneColors={cloneColors}
                selectedRows={selectedRows}
                hoverRow={hoverRow}
                hoverRange={hoverRange}
                onSelectRange={([a, b], e) => {
                  const clade = order.slice(a, b + 1);
                  dispatch(singleCellActions.updateSelection(e.metaKey || e.ctrlKey || e.shiftKey ? [...selectedCellIds, ...clade] : clade));
                }}
                onHoverNode={(node) => {
                  if (!node) {
                    setHoverRange(null);
                    return share(null);
                  }
                  setHoverRange(node.isLeaf ? null : [node.firstLeaf, node.lastLeaf]);
                  return share(node.isLeaf ? order[node.firstLeaf] : null);
                }}
              />
            </div>
            <svg width={svgWidth} height={HEADER + HEIGHT}>
              {hoverRow != null && <rect x={0} y={HEADER + hoverRow * rowH} width={svgWidth} height={Math.max(1, rowH)} fill="rgba(22,119,255,0.18)" />}
              {mode !== "cells" &&
                groups.map((grp, i) => (
                  <rect key={grp.key} x={0} y={HEADER + yOf(grp)} width={svgWidth} height={hOf(grp)} fill={i % 2 ? "#fafafa" : "#f0f0f0"} fillOpacity={0.6} />
                ))}
              {shown.map((track, i) => (track === "signatures" ? renderSignatures(i * (TRACK_W + GAP)) : renderNumeric(track, i * (TRACK_W + GAP))))}
            </svg>
          </div>
        )}
        {sigProgress != null && <Progress percent={sigProgress} size="small" style={{ width: 240 }} />}
        {shown.includes("signatures") && sigRows.length > 0 && <AetiologyLegend rows={sigRows} />}
        <HintLine text={t("components.single-cell.bars.help")} />
      </div>
    </Card>
  );
}
