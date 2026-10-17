import React, { useMemo, useRef, useState } from "react";
import { Button, Card, Select, Space, Typography } from "antd";
import useCohortExport from "../cohort/useCohortExport";
import usePatientRna from "./usePatientRna";
import useContainerWidth from "../useContainerWidth";
import usePlotTheme from "../usePlotTheme";
import SvgExportButton from "../svgExportButton";
import EvoTreeSvg from "../cohort/evoTreeSvg";
import HintLine from "../hintLine";
import { TYPE } from "../../../helpers/singleCell/plotTheme";
import { sortColumns } from "../../../helpers/singleCell/cohortOncoprint";
import { groupOncoprintRows, oncoprintEventFilter, oncoprintMatrix } from "../../../helpers/singleCell/cohortStats";
import { isStrongEvent } from "../../../helpers/singleCell/strongEvents";
import { summarizeCall } from "../../../helpers/singleCell/tsgHits";
import { metaStrip } from "../../../helpers/singleCell/clinicalConcordance";
import {
  ONCO_STATUS_LABEL, STATE_ORDER, clinicalHeader, clinicalOncoprint, designCounts, stateComposition, truncalSubclonal,
} from "../../../helpers/singleCell/clinicalFigure";
import { ClassGlyph, HeaderStrip, headerHeight, statusFill } from "./clinicalViz";

const { Text } = Typography;
const CLASS_COLORS = { amp: "#D7191C", homdel: "#2C7BB6", fusion: "#7B3294", snv: "#1B9E77", complex: "#E66101" };
const CLASS_NAMES = { snv: "SNV / indel", amp: "Amplification", homdel: "Homozygous deletion", fusion: "Fusion", complex: "Complex (DM / TIC / BFB)" };
const SHAPE = { snv: "tert", amp: "amp", homdel: "homdel", fusion: "sv", complex: "snv" };
const CLONAL_MIN = 0.8; // carrier fraction at or above which a driver is drawn solid (clonal); below = faded (subclonal)
const classOf = (c) => (CLASS_COLORS[c] && c !== "snv" ? c : "snv"); // eventClass values trunc / splice / missense / promoter / other draw as SNV / indel
const STATE_COLORS = { MES: "#D55E00", AC: "#E69F00", NPC: "#0072B2", OPC: "#009E73" };

/** Panel frame: letter, title, per-panel SVG export. */
function Panel({ letter, title, name, children, note }) {
  const ref = useRef(null);
  return (
    <Card size="small" style={{ height: "100%", minWidth: 0 }} title={<Space size={8}><span style={{ fontWeight: 700, fontSize: 18 }}>{letter}</span><span>{title}</span></Space>} extra={<SvgExportButton containerRef={ref} name={`figure1-${name}`} />}>
      <div ref={ref}>{children}</div>
      {note && <HintLine text={note} />}
    </Card>
  );
}

const NA = ({ why }) => <Text type="secondary">{`not available (${why})`}</Text>;

function DesignSvg({ d, theme, width }) {
  const tiles = [
    ["Patients", `${d.nPatients}`, "patients with clinical-recovery data"],
    ["DNA cells", d.dnaCells.toLocaleString("en-US"), `${d.dnaTumour.toLocaleString("en-US")} tumour + ${d.dnaNormal.toLocaleString("en-US")} normal (single-cell whole genomes)`],
    ["RNA cells", d.rna ? d.rna.cells.toLocaleString("en-US") : "n/a", d.rna ? `${d.rna.malignant.toLocaleString("en-US")} malignant; ${d.rna.patients} patients with RNA` : d.rnaWhy],
    ["Regions", d.regions ? `${d.regions.total}` : "n/a", d.regionsWhy],
  ];
  const w = Math.max(220, width);
  const cols = w < 420 ? 2 : 4;
  const tw = (w - (cols - 1) * 8) / cols;
  const th = 92;
  const H = Math.ceil(tiles.length / cols) * (th + 8);
  return (
    <svg width={w} height={H} style={{ display: "block", fontSize: TYPE.tick }} role="img" aria-label="Study design counts">
      {tiles.map(([k, v, sub], i) => {
        const x = (i % cols) * (tw + 8);
        const y = Math.floor(i / cols) * (th + 8);
        const words = sub.split(" ");
        const lines = [];
        words.forEach((wd) => {
          const last = lines[lines.length - 1];
          if (last && (last + " " + wd).length * 5.4 < tw - 16) lines[lines.length - 1] = `${last} ${wd}`;
          else lines.push(wd);
        });
        return (
          <g key={k} transform={`translate(${x},${y})`}>
            <title>{`${k}: ${v}. ${sub}`}</title>
            <rect width={tw} height={th} rx={6} fill={theme.panelAlt} stroke={theme.border} />
            <text x={8} y={18} fill={theme.muted}>{k}</text>
            <text x={8} y={46} fill={v === "n/a" ? theme.muted : theme.text} fontSize={TYPE.stat + 4} fontWeight={600}>{v}</text>
            {lines.slice(0, 3).map((ln, j) => <text key={j} x={8} y={62 + j * 12} fill={theme.textSecondary} fontSize={TYPE.micro + 0.5}>{ln}</text>)}
          </g>
        );
      })}
    </svg>
  );
}

function CohortOncoSvg({ grid, rows, patients, header, clinIdx, tsg, width, theme }) {
  const L = 130;
  const cw = Math.max(46, Math.min(80, (width - L - 8) / Math.max(1, patients.length)));
  const rh = 22;
  const rowH = 17;
  const hdrY = 24;
  const gridTop = hdrY + headerHeight(true, rowH) + 14;
  const H = gridTop + rows.length * rh + 6;
  const W = L + cw * patients.length + 8;
  const col = statusFill(theme);
  return (
    <div style={{ overflowX: "auto" }}>
      <svg width={W} height={H} style={{ display: "block", fontSize: TYPE.tick }} role="img" aria-label="Cohort oncoprint with clinical annotation strip">
        {patients.map((p, j) => <text key={p} x={L + j * cw + cw / 2} y={16} textAnchor="middle" fontWeight={600} fill={theme.text}>{p}</text>)}
        <HeaderStrip header={header} L={L} cw={cw} y={hdrY} theme={theme} rowH={rowH} />
        <g transform={`translate(0,${gridTop})`}>
          {rows.map((it, i) => {
            if (it.header) {
              return (
                <g key={it.header} transform={`translate(0,${i * rh})`}>
                  <rect y={2} width={W} height={rh - 4} fill={theme.band} />
                  <text x={6} y={rh / 2 + 4} fontWeight={600} fill={theme.textSecondary}>{it.header}</text>
                </g>
              );
            }
            const g = it.gene;
            return (
              <g key={g.gene} transform={`translate(0,${i * rh})`}>
                <text x={L - 8} y={rh / 2 + 4} textAnchor="end" fill={theme.text}>{g.gene.length > 18 ? `${g.gene.slice(0, 17)}…` : g.gene}</text>
                {patients.map((p, j) => {
                  const c = g.cells[p];
                  const x0 = L + j * cw;
                  const clin = clinIdx.get(`${p}|${g.gene}`);
                  const call = tsg?.index?.get(`${p}|${g.gene}`);
                  const s = call ? summarizeCall(call, p) : null;
                  const bi = s && s.multi && s.state === "biallelic";
                  return (
                    <g key={p}>
                      <rect x={x0 + 1} y={1} width={cw - 2} height={rh - 2} fill={theme.panelAlt} stroke={theme.borderSoft} rx={2} />
                      {c && [...new Set(c.all.map((e) => classOf(e.class)))].slice(0, 2).map((cls, k, arr) => (
                        <g key={cls} opacity={(c.fraction ?? 0) >= CLONAL_MIN ? 1 : 0.6}>
                          <title>{`${p} ${g.gene}: ${CLASS_NAMES[cls]}, ${c.fraction == null ? "?" : Math.round(100 * c.fraction)}% of tumour cells (${(c.fraction ?? 0) >= CLONAL_MIN ? "clonal" : "subclonal"})${bi ? `; tumour suppressor, two hits in the same cells (${s.badge})` : ""}`}</title>
                          <ClassGlyph cls={SHAPE[cls]} cx={x0 + (cw / arr.length) * (k + 0.5)} cy={rh / 2} r={Math.min(7, cw / arr.length / 2 - 2)} color={CLASS_COLORS[cls]} status="recovered" theme={theme} />
                        </g>
                      ))}
                      {bi && <rect x={x0 + 4} y={rh - 4} width={cw - 8} height={2.5} fill={theme.text}><title>{`two hits in the same cells: ${s.badge}`}</title></rect>}
                      {clin && (
                        <g>
                          <title>{`clinical report: ${clin.label} - ${ONCO_STATUS_LABEL[clin.status]}`}</title>
                          <circle cx={x0 + cw - 7} cy={7} r={4.2} fill={clin.status === "germline_like" ? theme.panel : col[clin.status]} stroke={clin.status === "germline_like" ? theme.text : theme.panel} strokeWidth={1.4} />
                        </g>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

function TruncalSvg({ rows, width, theme }) {
  const M = { l: 54, r: 10, t: 10, b: 56 };
  const H = 260;
  const lo = 100;
  const hi = Math.pow(10, Math.ceil(Math.log10(Math.max(...rows.map((r) => Math.max(r.truncal, r.subclonal))) * 1.05)));
  const L = (v) => Math.log10(Math.max(v, lo));
  const sy = (v) => H - M.b - ((L(v) - L(lo)) / (L(hi) - L(lo))) * (H - M.t - M.b);
  const gw = (width - M.l - M.r) / rows.length;
  const bw = Math.min(22, gw * 0.4);
  const ticks = [];
  for (let v = lo; v <= hi; v *= 10) ticks.push(v);
  const fmt = (v) => (v >= 1000 ? `${v / 1000}k` : v);
  return (
    <svg width={width} height={H} style={{ display: "block", fontSize: TYPE.tick }} role="img" aria-label="Truncal and subclonal mutation sites per patient, log scale">
      {ticks.map((v) => <g key={v}><line x1={M.l} x2={width - M.r} y1={sy(v)} y2={sy(v)} stroke={theme.grid} /><text x={M.l - 5} y={sy(v) + 4} textAnchor="end" fill={theme.muted}>{fmt(v)}</text></g>)}
      <text transform={`translate(11,${(M.t + H - M.b) / 2}) rotate(-90)`} textAnchor="middle" fill={theme.textSecondary} fontSize={TYPE.label}>mutation sites (log)</text>
      {rows.map((r, i) => {
        const x = M.l + i * gw + gw / 2;
        const meta = r.truncalSource === "current tree map";
        return (
          <g key={r.patient}>
            <title>{`${r.patient}: ${r.truncal.toLocaleString("en-US")} truncal (${r.truncalSource}) and ${r.subclonal.toLocaleString("en-US")} subclonal sites (tmb.json; ${r.nCells ?? "?"} tumour cells)${r.noisy ? "; subclonal calls flagged noisy (upper bound)" : ""}`}</title>
            <rect x={x - bw - 1} y={sy(r.truncal)} width={bw} height={sy(lo) - sy(r.truncal)} fill={meta ? theme.ok : theme.panel} stroke={theme.ok} strokeWidth={meta ? 0 : 1.6} />
            <rect x={x + 1} y={sy(r.subclonal)} width={bw} height={sy(lo) - sy(r.subclonal)} fill={r.noisy ? theme.panel : theme.warn} stroke={theme.warn} strokeWidth={r.noisy ? 1.6 : 0} strokeDasharray={r.noisy ? "3 2" : undefined} />
            <text transform={`translate(${x},${H - M.b + 10}) rotate(-40)`} textAnchor="end" fill={theme.text}>{r.patient}</text>
          </g>
        );
      })}
      <g transform={`translate(${M.l},${H - 4})`} fill={theme.textSecondary} fontSize={TYPE.micro + 0.5}>
        <rect width={9} height={9} y={-9} fill={theme.ok} /><text x={13}>truncal (tree map)</text>
        <rect x={110} width={9} height={9} y={-9} fill={theme.panel} stroke={theme.ok} strokeWidth={1.4} /><text x={123}>truncal (tmb.json)</text>
        <rect x={225} width={9} height={9} y={-9} fill={theme.warn} /><text x={238}>subclonal</text>
        <rect x={300} width={9} height={9} y={-9} fill={theme.panel} stroke={theme.warn} strokeDasharray="2 1" /><text x={313}>subclonal, noisy</text>
      </g>
    </svg>
  );
}

function StateSvg({ rows, width, theme }) {
  const L = 70;
  const rh = 26;
  const H = rows.length * rh + 34;
  return (
    <svg width={width} height={H} style={{ display: "block", fontSize: TYPE.tick }} role="img" aria-label="Malignant cell-state composition per patient">
      {rows.map((r, i) => {
        let x = L;
        return (
          <g key={r.patient} transform={`translate(0,${i * rh + 4})`}>
            <text x={L - 8} y={15} textAnchor="end" fontWeight={600} fill={theme.text}>{r.patient}</text>
            {STATE_ORDER.map((s) => {
              const w = r.frac[s] * (width - L - 50);
              if (!w) return null;
              const el = (
                <g key={s}>
                  <title>{`${r.patient} ${s}: ${r.counts[s]} of ${r.n} malignant cells (${Math.round(100 * r.frac[s])}%)`}</title>
                  <rect x={x} y={2} width={w} height={rh - 8} fill={STATE_COLORS[s]} stroke={theme.panel} />
                </g>
              );
              x += w;
              return el;
            })}
            <text x={x + 5} y={15} fill={theme.muted}>{`n=${r.n}`}</text>
          </g>
        );
      })}
      <g transform={`translate(${L},${rows.length * rh + 22})`} fill={theme.textSecondary} fontSize={TYPE.micro + 0.5}>
        {STATE_ORDER.map((s, k) => <g key={s} transform={`translate(${k * 62},0)`}><rect width={9} height={9} y={-9} fill={STATE_COLORS[s]} /><text x={13}>{s}</text></g>)}
      </g>
    </svg>
  );
}

/**
 * Candidate replacement for paper Figure 1, built from live data: a design summary, the cohort oncoprint with the clinical
 * strip, an example tree, truncal vs subclonal mutations, and cell-state composition. Each panel exports its own SVG.
 */
export default function Figure1Layout({ dataset, assays, recovery, summaries = [], rawFiles = {}, tsg = null, onOpenPatient }) {
  const theme = usePlotTheme();
  const [ref, width] = useContainerWidth(1000);
  const regionsX = useCohortExport(dataset, "regions.json");
  const tmb = useCohortExport(dataset, "tmb.json");
  const aligned = useCohortExport(dataset, "aligned_trees.json");
  const ids = useMemo(() => Object.keys(recovery?.patients || {}).sort(), [recovery]);
  const rna = usePatientRna(dataset, ids);
  const design = useMemo(() => designCounts({ recovery, rnaCells: rna.cells, regions: regionsX.data, patients: ids }), [recovery, rna.cells, regionsX.data, ids]);
  // same selection as the Drivers oncoprint of the cohort overview: tier 1-2 plus damaging tier-3, strong events, top 40 genes
  const eventsByPatient = useMemo(
    () => Object.fromEntries(summaries.filter((s) => rawFiles[s.caseReportId]?.events).map((s) => [s.caseReportId, rawFiles[s.caseReportId].events])),
    [summaries, rawFiles]
  );
  const matrix = useMemo(() => oncoprintMatrix(eventsByPatient, { maxTier: "2d", maxGenes: 40, filter: oncoprintEventFilter({ base: isStrongEvent }) }), [eventsByPatient]);
  const grid = useMemo(() => ({ patients: matrix.patients, rows: matrix.genes }), [matrix]);
  const patients = useMemo(() => sortColumns(grid, "exclusivity"), [grid]);
  const rows = useMemo(() => groupOncoprintRows(grid.rows, "role"), [grid]);
  const header = useMemo(() => clinicalHeader(assays, recovery, patients, metaStrip, regionsX.data), [assays, recovery, patients, regionsX.data]);
  const clinIdx = useMemo(() => {
    const m = new Map();
    clinicalOncoprint(recovery, { patients: ids }).rows.forEach((r) => Object.entries(r.cells).forEach(([p, list]) => list.forEach((e) => {
      const g = e.row.gene || (e.row.genes && e.row.genes[0]) || (e.kind === "tert" ? "TERT" : null);
      if (g && !m.has(`${p}|${g}`)) m.set(`${p}|${g}`, e);
    })));
    return m;
  }, [recovery, ids]);
  const trunc = useMemo(() => truncalSubclonal(tmb.data, assays), [tmb.data, assays]);
  const states = useMemo(() => stateComposition(rna.cells), [rna.cells]);
  const treePatients = useMemo(() => Object.entries(aligned.data?.patients || {}).filter(([, p]) => p.tree).map(([k]) => k).sort(), [aligned.data]);
  const [pick, setPick] = useState(null);
  const tp = pick && treePatients.includes(pick) ? pick : treePatients.includes("MGH302") ? "MGH302" : treePatients[0];
  const half = width >= 900;
  const pw = half ? Math.floor((width - 16 - 24) / 2) : width - 24;
  const noRna = ids.filter((p) => !states.find((s) => s.patient === p));
  const nPlaced = design.nPatients;
  return (
    <div ref={ref} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Text type="secondary" style={{ fontSize: TYPE.body }}>
        Candidate layout for Figure 1, rendered from live data (the figure PDFs are untouched). Panel order follows the current figure: design (a), oncoprint with clinical strip (b), tree (c), truncal vs subclonal (d), cell states (e).
      </Text>
      <Panel letter="a" title="Study design" name="a-design" note={`Counts from _cohort/clinical_recovery.json (DNA cells), each patient's rna/cells.json (RNA cells) and _cohort/regions.json (regions: cell metadata region field). ${nPlaced} patients.`}>
        <DesignSvg d={design} theme={theme} width={width - 24} />
      </Panel>
      <Panel letter="b" title="Oncoprint with clinical annotation" name="b-oncoprint" note="Glyph = driver class (tier 1-2 plus damaging tier-3, strong events, top 40 genes: the selection of the cohort Drivers oncoprint); faded = carried by < 80% of tumour cells. Dot at the top right = the gene is in the clinical report and the colour is its recovery status (green recovered, orange partial, red not recovered, grey not assessable, hollow germline-like). Bar under the glyph = tumour suppressor with two hits in the same cells. Strip: _cohort/clinical_assays.json and _cohort/regions.json; primary / recurrent is not in any data file. Hover for details.">
        {patients.length ? (
          <>
            <Space wrap size={[12, 2]} style={{ marginBottom: 6, fontSize: TYPE.tick }}>
              {Object.keys(CLASS_NAMES).map((c) => (
                <span key={c} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                  <svg width={14} height={14}><ClassGlyph cls={SHAPE[c]} cx={7} cy={7} r={5.5} color={CLASS_COLORS[c]} status="recovered" theme={theme} /></svg>{CLASS_NAMES[c]}
                </span>
              ))}
            </Space>
            <CohortOncoSvg grid={grid} rows={rows} patients={patients} header={header} clinIdx={clinIdx} tsg={tsg} width={width - 24} theme={theme} />
          </>
        ) : <NA why="patient driver events not loaded yet" />}
      </Panel>
      <div style={{ display: "grid", gridTemplateColumns: half ? "minmax(0,1fr) minmax(0,1fr)" : "minmax(0,1fr)", gap: 12 }}>
        <Panel letter="c" title="Example tumour tree" name="c-tree" note="Cell tree on the cohort time axis with placed events (_cohort/aligned_trees.json). The CN / SNV / BAF heatmap thumbnail is not available here: the per-cell matrices are loaded in the patient page (open it with the button).">
          {tp ? (
            <>
              <Space style={{ marginBottom: 6 }} wrap>
                <Select size="small" value={tp} onChange={setPick} options={treePatients.map((p) => ({ value: p, label: p }))} style={{ width: 120 }} />
                {onOpenPatient && <Button size="small" type="link" onClick={() => onOpenPatient(tp)}>Open patient</Button>}
                <Text type="secondary" style={{ fontSize: TYPE.tick }}>{`${aligned.data.patients[tp].n_tumour} tumour cells`}</Text>
              </Space>
              <EvoTreeSvg tree={aligned.data.patients[tp].tree} events={aligned.data.patients[tp].events || []} width={pw - 8} height={230} minSize={Math.max(3, Math.ceil(0.03 * aligned.data.patients[tp].n_tumour))} showAxis />
            </>
          ) : <NA why={aligned.status === "loading" ? "loading" : "_cohort/aligned_trees.json not exported"} />}
        </Panel>
        <Panel letter="d" title="Truncal vs subclonal mutations" name="d-truncal" note={`Mutation sites per patient on a log axis, sorted by subclonal count. Subclonal: tmb.json. Truncal: "truncal mutations (current tree)" of clinical_assays.json (solid) or, where that is missing, tmb.json truncal sites (outlined). Dashed subclonal bar = patient flagged noisy (private-site artefacts), an upper bound. ${ids.filter((p) => !trunc.find((t) => t.patient === p)).length ? `Not in tmb.json: ${ids.filter((p) => !trunc.find((t) => t.patient === p)).join(", ")}.` : ""}`}>
          {trunc.length ? <TruncalSvg rows={trunc} width={pw - 8} theme={theme} /> : <NA why={tmb.status === "loading" ? "loading" : "_cohort/tmb.json not exported"} />}
        </Panel>
      </div>
      <Panel letter="e" title="Cell-state composition" name="e-states" note={`Share of malignant RNA cells per Seurat state call (each patient's rna/cells.json). ${noRna.length ? `No RNA for ${noRna.join(", ")}.` : ""} The quadrant plot of the current figure needs per-cell AC / MES / NPC / OPC scores; rna/cells.json and rna/covariates.json only carry the state call, so it is not available.`}>
        {states.length ? <StateSvg rows={states} width={Math.min(width - 24, 720)} theme={theme} /> : <NA why={rna.status === "loading" ? "loading" : "per-patient rna/cells.json not found"} />}
      </Panel>
    </div>
  );
}
