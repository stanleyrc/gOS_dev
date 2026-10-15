import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { Alert, Button, Card, Empty, InputNumber, Progress, Segmented, Select, Space, Switch, Tag, Tooltip, Typography } from "antd";
import { ApartmentOutlined, ExpandAltOutlined, ShrinkOutlined, InfoCircleOutlined } from "@ant-design/icons";
import PhylogenyCanvas from "../phylogenyCanvas";
import DriverColumnHeader from "../drivers/driverColumnHeader";
import { driverColors, CLASS_TEXT } from "../drivers/driverColors";
import usePixelRatio from "../usePixelRatio";
import usePlotTheme from "../usePlotTheme";
import { GeneQuickLookText } from "./geneQuickLook";
import { Swatches } from "./charts";
import HintLine, { Provenance } from "../hintLine";
import useCohortDriverData from "./useCohortDriverData";
import { EVENT_CLASS_ORDER } from "../../../helpers/singleCell/cohortStats";
import { columnEdge } from "../../../helpers/singleCell/driverColumns";
import { cnColorer, hexToRgb, packRGBA } from "../../../helpers/singleCell/matrix";
import {
  CDT_COL_PX,
  CDT_HEIGHTS,
  CDT_PARAMS,
  CDT_PRESETS,
  CDT_PRESET_LABELS,
  alignPatient,
  cellStatus,
  geneChoices,
  parseCdt,
  rowAtY,
  selectSharedColumns,
  serializeCdt,
} from "../../../helpers/singleCell/cohortDriverTrees";

const { Text } = Typography;
const TREE_W = 84;
const EXPANDED_H = 520;
const CLASS_LABELS = { amp: "Amplification", homdel: "Deletion", fusion: "Fusion", trunc: "Truncating", splice: "Splice", missense: "Missense", complex: "Complex SV", other: "Other" };

/** The heatmap of one block: shared columns x cells in tree order, drawn at device resolution. */
function BlockHeat({ aligned, nRows, width, height, pixelRatio, palette, onHover, onClick }) {
  const ref = useRef(null);
  const pt = usePlotTheme();
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !aligned.length || !nRows) return;
    const dw = Math.max(1, Math.floor(width * pixelRatio));
    const dh = Math.max(1, Math.floor(height * pixelRatio));
    canvas.width = dw;
    canvas.height = dh;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(dw, dh);
    const px = new Uint32Array(img.data.buffer);
    const colors = {};
    Object.entries(driverColors()).forEach(([k, hex]) => (colors[k] = packRGBA(hexToRgb(hex))));
    const blank = packRGBA(hexToRgb(pt.panelAlt));
    const hatch = packRGBA(hexToRgb(pt.grid || "#d9d9d9"));
    const cn = cnColorer(palette, "total");
    const n = aligned.length;
    const edges = Array.from({ length: n + 1 }, (_, i) => columnEdge(i, n, dw));
    const gap = width / n >= 8 ? Math.max(1, Math.round(pixelRatio)) : 0;
    for (let y = 0; y < dh; y += 1) {
      const r = rowAtY(y + 0.5, dh, nRows);
      for (let c = 0; c < n; c += 1) {
        const a = aligned[c];
        const x1 = edges[c + 1] - (c < n - 1 ? gap : 0);
        for (let x = edges[c]; x < x1; x += 1) {
          let col;
          if (!a.entry || !a.states) col = ((x + y) >> 2) & 1 ? hatch : blank; // no such event in this patient
          else {
            const v = a.states[r];
            if (a.entry.cls === "snv") col = v === 2 ? colors.mutant : v === 1 ? colors.wildtype : colors.noCoverage;
            else if (a.entry.cls === "amp" || a.entry.cls === "homdel") col = cn(v);
            else if (a.entry.cls === "fusion") col = v === 3 ? colors.both : v === 2 ? colors.rna : v === 1 ? colors.dna : blank;
            else col = v ? colors.complex : blank;
          }
          px[y * dw + x] = col;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [aligned, nRows, width, height, pixelRatio, palette, pt]);
  const locate = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - box.left;
    const y = e.clientY - box.top;
    return { col: Math.max(0, Math.min(aligned.length - 1, Math.floor((x / Math.max(1, box.width)) * aligned.length))), row: rowAtY(y, box.height, nRows), x, y };
  };
  return (
    <canvas
      ref={ref}
      data-cohort-driver-heat
      style={{ width, height, display: "block", cursor: "pointer" }}
      onMouseMove={(e) => onHover(locate(e))}
      onMouseLeave={() => onHover(null)}
      onClick={(e) => onClick(locate(e))}
    />
  );
}

function PatientBlock({ summary, info, aligned, state, colPx, expanded, onExpand, onOpen, onColumn, onEvent, openKey, cloneColors, palette, pixelRatio, nShared }) {
  const [hover, setHover] = useState(null);
  const height = expanded ? EXPANDED_H : CDT_HEIGHTS[state.height];
  const width = Math.max(1, aligned.length * colPx);
  const nRows = info.order.length;
  const present = aligned.filter((a) => a.entry).length;
  const headerEntries = aligned.map((a) => ({
    key: a.column.key,
    label: a.column.label,
    cls: a.column.cls,
    n: a.entry?.n ?? 0,
    upstreamOnly: Boolean(a.entry?.upstreamOnly),
    absent: !a.entry,
    members: a.entry ? [a.entry] : [],
    genes: a.column.genes,
    entry: a.entry || { cls: a.column.cls, event: {} },
  }));
  const notes = Object.values(info.notes);
  const tip = hover && hover.row >= 0 ? aligned[hover.col] : null;
  const cellId = hover && hover.row >= 0 ? info.order[hover.row] : null;
  return (
    <div style={{ display: "inline-block", verticalAlign: "top", margin: "0 18px 14px 0", position: "relative" }} data-cohort-driver-block={summary.caseReportId}>
      <Space size={6} style={{ marginBottom: 2 }} wrap>
        <Button type="link" size="small" style={{ padding: 0, fontWeight: 600 }} onClick={() => onOpen(summary)}>{summary.caseReportId}</Button>
        <Text type="secondary" style={{ fontSize: 12 }}>{`${nRows} cells · ${present}/${nShared} columns`}</Text>
        {notes.length > 0 && (
          <Tooltip title={<div>{notes.map((x) => <div key={x}>{`not available (${x})`}</div>)}</div>}>
            <InfoCircleOutlined style={{ color: "#d48806" }} />
          </Tooltip>
        )}
        <Tooltip title={expanded ? "Compact rows" : "Expand this patient"}>
          <Button type="text" size="small" icon={expanded ? <ShrinkOutlined /> : <ExpandAltOutlined />} onClick={onExpand} />
        </Tooltip>
      </Space>
      <div style={{ display: "flex", alignItems: "flex-end" }}>
        <div style={{ width: TREE_W, flex: "none" }} />
        <DriverColumnHeader entries={headerEntries} width={width} pixelRatio={pixelRatio} hoverKey={tip?.column.key} openKey={openKey} onOpen={onColumn} />
      </div>
      <div style={{ display: "flex", position: "relative" }}>
        <PhylogenyCanvas layout={info.tree} nRows={nRows} width={TREE_W} height={height} leafClones={info.leafClones} cloneColors={cloneColors} pixelRatio={pixelRatio} hoverRow={hover && hover.row >= 0 ? hover.row : null} showScaleBar={false} />
        <BlockHeat
          aligned={aligned}
          nRows={nRows}
          width={width}
          height={height}
          pixelRatio={pixelRatio}
          palette={palette}
          onHover={setHover}
          onClick={(h) => {
            const a = aligned[h.col];
            if (a?.entry) onEvent(summary, a.entry.event);
          }}
        />
        {tip && (
          <div style={{ position: "absolute", left: TREE_W + Math.min(hover.x + 12, Math.max(0, width - 200)), top: Math.min(hover.y + 12, height - 60), zIndex: 5, pointerEvents: "none", background: "rgba(30,30,30,0.92)", color: "#fff", padding: "4px 8px", borderRadius: 4, fontSize: 12, whiteSpace: "nowrap" }}>
            <div><b>{summary.caseReportId}</b>{` · ${cellId}`}</div>
            <div>{`clone ${info.leafClones[hover.row] ?? "unassigned"}`}</div>
            <div>{`${tip.column.label}: ${tip.entry ? cellStatus(tip.entry, tip.states?.[hover.row]).status : "no such event in this patient"}`}</div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * "Drivers on each patient's tree": the Drivers layer of every patient (tree + one column per driver event) as small
 * multiples. The columns are shared: the same gene / event class is in the same column order in every block; a patient
 * without that event shows a hatched column. Cell states come from driverLayer.entryStates, the patient layer's helper.
 */
export default function CohortDriverTreesPanel({ summaries, files, rawFiles = null, rows, datasets, datafiles, chromoBins, cloneColors, onOpen, onEvent }) {
  const palette = useSelector((s) => s.SingleCell.palette);
  const pixelRatio = usePixelRatio();
  const [state, setState] = useState(() => parseCdt(typeof window === "undefined" ? "" : window.location.search));
  const patch = (o) => setState((s) => ({ ...s, ...o }));
  const [expanded, setExpanded] = useState({});
  const [openKey, setOpenKey] = useState(null);
  const { data, loaded, total } = useCohortDriverData({ summaries, datasets, files, rawFiles: rawFiles || files, rows, datafiles, chromoBins });
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      CDT_PARAMS.forEach((k) => url.searchParams.delete(k));
      Object.entries(serializeCdt(state)).forEach(([k, v]) => url.searchParams.set(k, v));
      window.history.replaceState(window.history.state, "", url.toString());
    } catch (error) {
      // no URL to write to
    }
  }, [state]);
  const perPatient = useMemo(() => Object.fromEntries(Object.entries(data).map(([id, d]) => [id, d.entries])), [data]);
  const { columns, ranked } = useMemo(() => selectSharedColumns(perPatient, state), [perPatient, state]);
  const choices = useMemo(() => geneChoices(ranked), [ranked]);
  const shownGenes = state.genes && state.genes.length ? state.genes : [...new Set(columns.flatMap((c) => c.genes))];
  const aligned = useMemo(() => Object.fromEntries(Object.entries(data).map(([id, d]) => [id, alignPatient(columns, d.entries, d.states)])), [data, columns]);
  const selected = columns.find((c) => c.key === openKey) || null;

  const statusOf = (s) => {
    const f = files[s.caseReportId];
    if (data[s.caseReportId]) return null;
    if (f === undefined) return "loading";
    if (f === null) return "not available (patient files could not be loaded)";
    if (!f.tree) return "not available (tree.nwk missing for this patient)";
    if (!f.events) return "not available (filtered.events.json missing for this patient)";
    return "loading";
  };
  const colors = driverColors();
  const legend = [
    { key: "mut", color: colors.mutant, label: "SNV mutant" },
    { key: "wt", color: colors.wildtype, label: "wild type" },
    { key: "nc", color: colors.noCoverage, label: "no coverage" },
    { key: "dna", color: colors.dna, label: "fusion DNA" },
    { key: "rna", color: colors.rna, label: "fusion RNA" },
    { key: "both", color: colors.both, label: "fusion DNA + RNA" },
    { key: "cx", color: colors.complex, label: "complex SV carrier" },
  ];

  return (
    <Card
      size="small"
      title={<Space><ApartmentOutlined />Drivers on each patient&apos;s tree<Provenance id="oncoprint" /></Space>}
      extra={
        <Space wrap>
          <Select size="small" value={state.preset} onChange={(v) => patch({ preset: v })} style={{ width: 150 }} options={CDT_PRESETS.map((p) => ({ value: p, label: CDT_PRESET_LABELS[p] }))} />
          <Text type="secondary">Tier</Text>
          <Select size="small" value={state.maxTier} onChange={(v) => patch({ maxTier: v })} style={{ width: 70 }} options={[1, 2, 3].map((v) => ({ value: v, label: `≤ ${v}` }))} />
          <Text type="secondary">Types</Text>
          <Select
            size="small"
            mode="multiple"
            maxTagCount="responsive"
            value={state.classes || EVENT_CLASS_ORDER}
            onChange={(v) => patch({ classes: v.length >= EVENT_CLASS_ORDER.length ? null : v })}
            placeholder="none selected"
            style={{ minWidth: 200 }}
            options={EVENT_CLASS_ORDER.map((c) => ({ value: c, label: CLASS_LABELS[c] }))}
          />
          <Switch size="small" checked={state.strongOnly} onChange={(v) => patch({ strongOnly: v })} />
          <Text>Strong only</Text>
        </Space>
      }
    >
      <Space wrap style={{ marginBottom: 8 }}>
        <Text type="secondary">Genes</Text>
        <Select
          size="small"
          mode="multiple"
          showSearch
          allowClear
          maxTagCount="responsive"
          style={{ minWidth: 300, maxWidth: 560 }}
          value={shownGenes}
          placeholder="top genes by number of patients"
          onChange={(v) => patch({ genes: v.length ? v : null })}
          options={choices.map((c) => ({ value: c.gene, label: `${c.gene} (${c.nPatients} pt · ${c.cells} cells)` }))}
          filterOption={(input, o) => `${o.label}`.toUpperCase().includes(input.toUpperCase())}
        />
        {!(state.genes && state.genes.length) && (
          <>
            <Text type="secondary">Top columns</Text>
            <InputNumber size="small" min={1} max={60} value={state.maxCols} onChange={(v) => patch({ maxCols: v || 12 })} style={{ width: 60 }} />
          </>
        )}
        <Text type="secondary">Column width</Text>
        <InputNumber size="small" min={CDT_COL_PX[0]} max={CDT_COL_PX[1]} value={state.colPx} onChange={(v) => patch({ colPx: v || 14 })} style={{ width: 60 }} addonAfter="px" />
        <Segmented size="small" value={state.height} onChange={(v) => patch({ height: v })} options={[{ value: "compact", label: "Compact" }, { value: "normal", label: "Normal" }, { value: "tall", label: "Tall" }]} />
        {loaded < total && (
          <Space size={6}>
            <Progress percent={Math.round((100 * loaded) / Math.max(1, total))} size="small" style={{ width: 120 }} />
            <Text type="secondary">{`loading genotypes ${loaded}/${total}`}</Text>
          </Space>
        )}
      </Space>
      {!columns.length && Object.keys(data).length > 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No driver event passes the tier / Types / preset filters in any patient." />}
      {selected && (
        <Alert
          style={{ marginBottom: 8 }}
          type="info"
          closable
          onClose={() => setOpenKey(null)}
          message={
            <Space wrap size={[8, 4]}>
              <Tag color={CLASS_TEXT[selected.cls] ? undefined : "default"} style={{ color: CLASS_TEXT[selected.cls] }}>{selected.label}</Tag>
              <Text>{`${selected.nPatients} patient${selected.nPatients === 1 ? "" : "s"} · ${selected.cells} cells`}</Text>
              {selected.genes.map((g) => <GeneQuickLookText key={g} gene={g} />)}
              {summaries.map((s) => {
                const a = aligned[s.caseReportId]?.find((x) => x.column.key === selected.key);
                return a?.entry ? <Button key={s.caseReportId} size="small" onClick={() => onEvent(s, a.entry.event)}>{`${s.caseReportId}: open event`}</Button> : null;
              })}
            </Space>
          }
        />
      )}
      {columns.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          {summaries.map((s) => {
            const info = data[s.caseReportId];
            if (!info) {
              return (
                <div key={s.caseReportId} style={{ display: "inline-block", verticalAlign: "top", margin: "0 18px 14px 0", width: TREE_W + columns.length * state.colPx, minWidth: 160 }}>
                  <Text strong>{s.caseReportId}</Text>
                  <div><Text type="secondary">{statusOf(s)}</Text></div>
                </div>
              );
            }
            return (
              <PatientBlock
                key={s.caseReportId}
                summary={s}
                info={info}
                aligned={aligned[s.caseReportId]}
                state={state}
                colPx={state.colPx}
                expanded={Boolean(expanded[s.caseReportId])}
                onExpand={() => setExpanded((e) => ({ ...e, [s.caseReportId]: !e[s.caseReportId] }))}
                onOpen={onOpen}
                onColumn={setOpenKey}
                onEvent={onEvent}
                openKey={openKey}
                cloneColors={cloneColors}
                palette={palette}
                pixelRatio={pixelRatio}
                nShared={columns.length}
              />
            );
          })}
        </div>
      )}
      <Swatches items={legend} style={{ marginTop: 4 }} />
      <HintLine text="Same columns in every block: a hatched column means the patient has no filtered event of that gene and class. Amp / del columns use the total copy-number colours of the patient view. Tree on the left (branches coloured by clone), cells in tree order. Click a patient name to open the patient, a column name for the gene card and per-patient events, a cell for that patient's event drawer. Settings are in the URL (cdt* parameters). Per-cell copy number covers up to 2000 cells per patient, like the cohort heatmap." />
    </Card>
  );
}
