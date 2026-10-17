import React, { useMemo, useState } from "react";
import { Alert, Card, Empty, Segmented, Skeleton, Space, Switch, Table, Tag, Typography } from "antd";
import { driverHref } from "../../../helpers/singleCell/driverLink";
import { TYPE } from "../../../helpers/singleCell/plotTheme";
import {
  KINDS, KIND_LABEL, STATUS_LABEL, STATUS_ORDER, alterationLabel, buildGrid, cnPoints, eventForCell, metaStrip, summarize, tmbRows, vafPoints,
} from "../../../helpers/singleCell/clinicalConcordance";
import useContainerWidth from "../useContainerWidth";
import usePlotTheme from "../usePlotTheme";
import SvgExportButton from "../svgExportButton";
import HintLine from "../hintLine";
import useClinicalAssays from "../clinical/useClinicalAssays";

const { Text } = Typography;
const SYMBOL = { recovered: "✓", partial: "~", not_recovered: "✗", not_covered: "–", no_clinical: "" };

const colorOf = (theme) => ({
  recovered: theme.ok,
  partial: theme.warn,
  not_recovered: theme.danger,
  not_covered: theme.empty,
  no_clinical: theme.panelAlt,
});

function Legend({ theme }) {
  const col = colorOf(theme);
  return (
    <Space size={14} wrap style={{ marginBottom: 6 }}>
      {STATUS_ORDER.map((s) => (
        <span key={s} style={{ fontSize: TYPE.tick }}>
          <span style={{ display: "inline-block", width: 12, height: 12, background: col[s], border: `1px solid ${theme.border}`, marginRight: 5, verticalAlign: -1 }} />
          {STATUS_LABEL[s]}
        </span>
      ))}
    </Space>
  );
}

function cellTip(row, cell) {
  if (!cell) return `${row.label}: not in the clinical report of this patient`;
  const r = cell.row;
  const bits = [`${row.label}: ${cell.raw.replace(/_/g, " ")}`, r.reason, r.clinical_raw ? `report: ${r.clinical_raw}` : null].filter(Boolean);
  return bits.join("\n");
}

/** Alteration x patient grid with the Fig. 1b style annotation strip above it. */
function Grid({ grid, assays, rawFiles, width, theme }) {
  const col = colorOf(theme);
  const L = 210;
  const cw = Math.max(70, Math.min(104, (width - L - 8) / Math.max(1, grid.patients.length)));
  const rh = 22;
  const meta = grid.patients.map((p) => metaStrip(assays, p.id));
  const metaKeys = meta[0] ? meta[0].map((f) => f.key) : [];
  const metaLabels = meta[0] ? meta[0].map((f) => f.label) : [];
  const top = 34 + metaKeys.length * 18 + 20;
  const H = top + grid.rows.length * rh + 8;
  const W = L + cw * grid.patients.length + 8;
  const kindStarts = new Set(grid.rows.map((r, i) => (i === 0 || grid.rows[i - 1].kind !== r.kind ? i : -1)).filter((i) => i >= 0));
  return (
    <div style={{ overflowX: "auto" }}>
      <svg width={W} height={H} style={{ display: "block", fontSize: TYPE.tick }} role="img" aria-label="Clinical alterations by patient and recovery status">
        <defs>
          <pattern id="clin-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill={theme.panelAlt} />
            <line x1="0" y1="0" x2="0" y2="6" stroke={theme.border} strokeWidth="2" />
          </pattern>
        </defs>
        {grid.patients.map((p, j) => (
          <g key={p.id} transform={`translate(${L + j * cw},0)`}>
            <text x={cw / 2} y={14} textAnchor="middle" fill={theme.text} fontSize={TYPE.label} fontWeight={600}>{p.id}</text>
            <text x={cw / 2} y={28} textAnchor="middle" fill={theme.muted} fontSize={TYPE.micro + 0.5}>
              <title>{`${p.assay || "no assay"}${p.note ? `: ${p.note}` : ""}`}</title>
              {p.status === "failed" ? "failed" : p.status === "nothing detected" ? "nothing found" : p.assay || p.note || ""}
            </text>
            {meta[j].map((f, i) => (
              <g key={f.key}>
                <title>{f.value == null ? `${f.label}: not available (${f.why})` : `${f.label}: ${f.value}${f.sub ? ` (${f.sub})` : ""}${f.tip ? `\n${f.tip}` : ""}`}</title>
                <rect x={1} y={36 + i * 18} width={cw - 2} height={16} fill={f.value == null ? theme.panelAlt : theme.accentSoft} />
                <text x={cw / 2} y={36 + i * 18 + 12} textAnchor="middle" fontSize={TYPE.micro + 0.5} fill={f.value == null ? theme.muted : theme.text}>
                  {f.value == null ? "n/a" : `${f.value}`.replace("Unmethylated", "Unmeth.").replace("Methylated", "Meth.").replace("Multi-Focal", "Multifocal").slice(0, 15)}
                </text>
              </g>
            ))}
          </g>
        ))}
        {metaLabels.map((lb, i) => (
          <text key={lb} x={L - 8} y={36 + i * 18 + 12} textAnchor="end" fill={theme.textSecondary} fontSize={TYPE.tick}>{lb === "Truncal mutations (current tree)" ? "Truncal mutations (cur. tree)" : lb}</text>
        ))}
        <g transform={`translate(0,${top})`}>
          {grid.rows.map((row, i) => (
            <g key={row.key} transform={`translate(0,${i * rh})`}>
              {kindStarts.has(i) && <text x={4} y={-4} fill={theme.muted} fontSize={TYPE.tick} fontWeight={600}>{KIND_LABEL[row.kind]}</text>}
              <text x={L - 8} y={rh / 2 + 4} textAnchor="end" fill={theme.text}>{row.label.length > 30 ? `${row.label.slice(0, 29)}…` : row.label}<title>{row.label}</title></text>
              {grid.patients.map((p, j) => {
                const cell = row.cells[p.id];
                const status = cell ? cell.status : p.clinicalOk ? null : "no_clinical";
                const ev = cell && eventForCell(rawFiles?.[p.id]?.events, cell.row, row.kind);
                const body = (
                  <g>
                    <title>{status === "no_clinical" ? `${p.id}: ${p.note || "no clinical data"}` : cellTip(row, cell)}</title>
                    <rect x={L + j * cw + 1} y={1} width={cw - 2} height={rh - 2} fill={status === "no_clinical" ? "url(#clin-hatch)" : status ? col[status] : theme.panel} stroke={status ? "none" : theme.borderSoft} rx={2} />
                    {status && SYMBOL[status] && <text x={L + j * cw + cw / 2} y={rh / 2 + 5} textAnchor="middle" fill={status === "not_covered" ? theme.muted : "#fff"} fontWeight={700}>{SYMBOL[status]}</text>}
                  </g>
                );
                return ev && status !== "no_clinical" ? (
                  <a key={p.id} href={driverHref(p.id, ev)} style={{ cursor: "pointer" }}>{body}</a>
                ) : (
                  <g key={p.id}>{body}</g>
                );
              })}
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}

const log = (v) => Math.log10(Math.max(v, 0.5));

/** Generic scatter on SVG: points {x, y, label, status, href}; log axes optional; y=x guide. */
function Scatter({ points, width, height = 300, xLabel, yLabel, logAxes, theme, xMax, yMax }) {
  const col = colorOf(theme);
  const M = { l: 56, r: 16, t: 14, b: 44 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const hi = Math.max(1e-9, xMax || 0, yMax || 0, ...xs, ...ys) * 1.08;
  const lo = logAxes ? 0.5 : 0;
  const f = (v) => (logAxes ? log(v) : v);
  const sx = (v) => M.l + ((f(v) - f(lo)) / (f(hi) - f(lo))) * (width - M.l - M.r);
  const sy = (v) => height - M.b - ((f(v) - f(lo)) / (f(hi) - f(lo))) * (height - M.t - M.b);
  const ticks = logAxes ? [1, 3, 10, 30, 100, 300].filter((t) => t <= hi) : [0, 0.25, 0.5, 0.75, 1].map((t) => t * hi).map((t) => Math.round(t * 100) / 100);
  return (
    <svg width={width} height={height} style={{ display: "block", fontSize: TYPE.tick }}>
      <rect x={M.l} y={M.t} width={width - M.l - M.r} height={height - M.t - M.b} fill={theme.panel} stroke={theme.grid} />
      {ticks.map((t) => (
        <g key={t}>
          <line x1={sx(t)} x2={sx(t)} y1={M.t} y2={height - M.b} stroke={theme.grid} />
          <line y1={sy(t)} y2={sy(t)} x1={M.l} x2={width - M.r} stroke={theme.grid} />
          <text x={sx(t)} y={height - M.b + 14} textAnchor="middle" fill={theme.muted}>{logAxes ? t : `${Math.round(t * 100)}%`}</text>
          <text x={M.l - 6} y={sy(t) + 4} textAnchor="end" fill={theme.muted}>{logAxes ? t : `${Math.round(t * 100)}%`}</text>
        </g>
      ))}
      <line x1={sx(lo)} y1={sy(lo)} x2={sx(hi)} y2={sy(hi)} stroke={theme.axis} strokeDasharray="4 3" />
      {points.map((p, i) => {
        const dot = (
          <g>
            <title>{p.tip}</title>
            {p.yMax != null && p.yMax > p.y && <line x1={sx(p.x)} x2={sx(p.x)} y1={sy(p.y)} y2={sy(Math.min(p.yMax, hi))} stroke={col[p.status]} strokeOpacity={0.5} />}
            <circle cx={sx(p.x)} cy={sy(p.y)} r={5.5} fill={col[p.status]} fillOpacity={0.85} stroke={p.germlineLike ? theme.text : theme.panel} strokeWidth={p.germlineLike ? 1.5 : 1} />
            {p.show && <text x={sx(p.x) + 8} y={sy(p.y) + 4} fill={theme.textSecondary} fontSize={TYPE.micro + 0.5}>{p.label}</text>}
          </g>
        );
        return p.href ? <a key={i} href={p.href}>{dot}</a> : <g key={i}>{dot}</g>;
      })}
      <text x={(M.l + width - M.r) / 2} y={height - 6} textAnchor="middle" fill={theme.textSecondary} fontSize={TYPE.label}>{xLabel}</text>
      <text transform={`translate(14,${(M.t + height - M.b) / 2}) rotate(-90)`} textAnchor="middle" fill={theme.textSecondary} fontSize={TYPE.label}>{yLabel}</text>
    </svg>
  );
}

function TmbBars({ rows, width, theme }) {
  const series = [["clinical", "Clinical (Oncopanel)", theme.accent], ["truncal", "Single-cell truncal", theme.ok], ["clonal", "Single-cell truncal + subclonal", theme.warn], ["cellMedian", "Single-cell per-cell median", theme.muted]];
  const L = 90;
  const bh = 14;
  const gh = series.length * bh + 12;
  const max = Math.max(1, ...rows.flatMap((r) => series.map(([k]) => r[k] || 0))) * 1.1;
  const H = rows.length * gh + 28;
  return (
    <svg width={width} height={H} style={{ display: "block", fontSize: TYPE.tick }}>
      {rows.map((r, i) => (
        <g key={r.patient} transform={`translate(0,${i * gh + 6})`}>
          <text x={L - 8} y={(series.length * bh) / 2 + 4} textAnchor="end" fill={theme.text} fontWeight={600}>{r.patient}</text>
          {series.map(([k, lb, c], s) => (
            <g key={k}>
              <title>{r[k] == null ? `${lb}: not available${r.note ? ` (${r.note})` : ""}` : `${lb}: ${r[k].toFixed(2)} mutations per Mb`}</title>
              {r[k] == null ? (
                <text x={L} y={s * bh + 11} fill={theme.muted} fontSize={TYPE.micro + 0.5}>{`${lb}: not available`}</text>
              ) : (
                <>
                  <rect x={L} y={s * bh + 1} width={Math.max(1, (r[k] / max) * (width - L - 70))} height={bh - 3} fill={c} />
                  <text x={L + Math.max(1, (r[k] / max) * (width - L - 70)) + 4} y={s * bh + 11} fill={theme.textSecondary} fontSize={TYPE.micro + 0.5}>{r[k].toFixed(2)}</text>
                </>
              )}
            </g>
          ))}
        </g>
      ))}
      <g transform={`translate(${L},${rows.length * gh + 18})`}>
        {series.map(([k, lb, c], s) => (
          <g key={k} transform={`translate(${s * Math.min(200, (width - L) / series.length)},0)`}>
            <rect width={10} height={10} fill={c} y={-9} />
            <text x={14} fill={theme.textSecondary} fontSize={TYPE.micro + 0.5}>{lb.replace("Single-cell ", "SC ")}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

/**
 * Clinical assay concordance: which alterations of the Oncopanel / Genexus reports the single-cell data recovers,
 * which single-cell drivers the clinical assay did not report, and how clinical VAF / copy number / TMB compare.
 */
export default function CohortClinicalPanel({ dataset, rawFiles = {} }) {
  const theme = usePlotTheme();
  const [ref, width] = useContainerWidth(900);
  const { status, assays, recovery } = useClinicalAssays(dataset);
  const [kinds, setKinds] = useState("all");
  const [hideInv, setHideInv] = useState(false);
  const [hideGerm, setHideGerm] = useState(false);
  const kindList = kinds === "all" ? KINDS : [kinds];
  const patients = useMemo(() => Object.keys(recovery?.patients || {}).sort(), [recovery]);
  const grid = useMemo(() => buildGrid(recovery, { patients, kinds: kindList, hideInvestigational: hideInv, hideGermlineLike: hideGerm }), [recovery, patients, kinds, hideInv, hideGerm]); // eslint-disable-line react-hooks/exhaustive-deps
  const summary = useMemo(() => summarize(recovery), [recovery]);
  const vaf = useMemo(() => vafPoints(recovery), [recovery]);
  const cn = useMemo(() => cnPoints(recovery), [recovery]);
  const tmb = useMemo(() => tmbRows(recovery), [recovery]);
  const missed = useMemo(
    () => patients.flatMap((p) => (recovery?.patients?.[p]?.missed || []).map((m, i) => ({ ...m, patient: p, key: `${p}-${i}` }))),
    [patients, recovery]
  );
  if (status === "loading") return <Skeleton active />;
  if (status === "none" || !recovery) return <Empty description="Clinical assay concordance is not exported yet (_cohort/clinical_recovery.json; srctools gos_sc_clinical_recovery.py)." />;

  const col = colorOf(theme);
  const href = (p, row, kind) => {
    const ev = eventForCell(rawFiles?.[p]?.events, row, kind);
    return ev ? driverHref(p, ev) : null;
  };
  const vafPts = vaf.map((p) => ({ ...p, tip: `${p.patient} ${p.label}\nclinical VAF ${(100 * p.x).toFixed(0)}%, single-cell pooled VAF ${(100 * p.y).toFixed(1)}% (${p.carriers ?? "?"} of ${p.covered ?? "?"} covered tumour cells)${p.germlineLike ? "\nalso present in normal cells (germline-like)" : ""}`, href: href(p.patient, p.row, "snv"), show: p.status === "not_recovered" || p.y < 0.02 }));
  const cnPts = cn.map((p) => ({ ...p, show: true, tip: `${p.patient} ${p.label}\nclinical estimate ${p.x} copies; single-cell median CN ${p.y} (mean ${p.yMean}, max ${p.yMax}); ${(100 * p.frac).toFixed(0)}% of tumour cells amplified`, href: href(p.patient, p.row, "cnv") }));
  const sumCols = [
    { title: "Alteration type", dataIndex: "kind", render: (k) => KIND_LABEL[k] },
    { title: "Reported", dataIndex: "total" },
    { title: <span style={{ color: col.recovered }}>Recovered</span>, dataIndex: "recovered" },
    { title: <span style={{ color: col.partial }}>Partial / weak</span>, dataIndex: "partial" },
    { title: <span style={{ color: col.not_recovered }}>Not recovered</span>, dataIndex: "not_recovered" },
    { title: "Not covered / assessable", dataIndex: "not_covered" },
    { title: "Recovered of assessable", dataIndex: "recoveredShare", render: (s, r) => (s == null ? "n/a" : `${r.recovered} of ${r.assessable} (${Math.round(100 * s)}%)`) },
  ];
  const sumRows = KINDS.map((k) => ({ key: k, kind: k, ...summary[k] }));
  const missCols = [
    { title: "Patient", dataIndex: "patient" },
    { title: "Single-cell driver", dataIndex: "gene", render: (g, r) => { const ev = eventForCell(rawFiles?.[r.patient]?.events, { gene: g, genes: [g], protein: r.variant, type: r.type === "SCNA" ? (`${r.variant}` === "AMP" ? "Amplification" : "Loss") : "" }, r.type === "SCNA" ? "cnv" : r.type === "Fusion" ? "sv" : "snv"); const txt = `${g}${r.variant ? ` ${r.variant}` : ""} (${r.type})`; return ev ? <a href={driverHref(r.patient, ev)}>{txt}</a> : txt; } },
    { title: "Tier", dataIndex: "tier" },
    { title: "Tumour cells", dataIndex: "cell_fraction", render: (f, r) => `${Math.round(100 * f)}% (${r.n_cells})` },
    { title: "Clinical panel", dataIndex: "panel" },
  ];
  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Card size="small" title="Clinical assay concordance: alterations in the Oncopanel / Genexus reports vs the single-cell data" extra={<SvgExportButton containerRef={ref} name="clinical-concordance" />}>
        <div ref={ref}>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 8 }}
            message={`Recovered ${KINDS.reduce((s, k) => s + summary[k].recovered, 0)} of ${KINDS.reduce((s, k) => s + summary[k].assessable, 0)} assessable reported alterations (${KINDS.map((k) => `${KIND_LABEL[k]} ${summary[k].recovered}/${summary[k].assessable}`).join("; ")})`}
            description="Real counts from the clinical text reports (_cohort/clinical_assays.json) and the single-cell calls, pooled pileups and genome graphs (_cohort/clinical_recovery.json). Click a coloured cell to open that driver in the patient."
          />
          <Space wrap size={[12, 6]} style={{ marginBottom: 8 }}>
            <Segmented size="small" value={kinds} onChange={setKinds} options={[{ value: "all", label: "All" }, ...KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))]} />
            <Space size={4}><Switch size="small" checked={hideInv} onChange={setHideInv} /><Text type="secondary">Hide investigational (tier 3-4) SNVs</Text></Space>
            <Space size={4}><Switch size="small" checked={hideGerm} onChange={setHideGerm} /><Text type="secondary">Hide germline-like SNVs (also in normal cells)</Text></Space>
          </Space>
          <Legend theme={theme} />
          <Grid grid={grid} assays={assays} rawFiles={rawFiles} width={width} theme={theme} />
          <HintLine text="Rows: each alteration of a clinical report; columns: patients with their clinical annotations (sex, age, location and MGMT from the clinical metadata file; truncal mutations = sites of the current tree's mutation map on the trunk, shared by all tumour cells; primary / recurrent and regions sampled are not in any data file). ✓ recovered, ~ partial / weak, ✗ not recovered, – not covered or not assessable, hatched = the patient has no usable clinical assay, blank = not in that patient's report. SNVs: recovered = alt reads in >= 3 tumour cells and pooled VAF >= 2%; copy number: >= 80% of tumour cells show the reported gain / amplification / loss relative to their own baseline CN." />
        </div>
      </Card>
      <Card size="small" title="Recovery by alteration type">
        <Table size="small" pagination={false} dataSource={sumRows} columns={sumCols} />
      </Card>
      <Card size="small" title="VAF: clinical assay vs single-cell pooled reads">
        <Scatter points={vafPts} width={Math.min(width, 560)} theme={theme} xLabel="Clinical VAF" yLabel="Single-cell pooled VAF" xMax={1} yMax={1} />
        <HintLine text="Each point is a reported SNV / indel with a clinical VAF and enough single-cell coverage (pooled over all cells of the patient). Dashed line: equal VAF. Outlined points are also present in normal cells (germline-like). The clinical VAF is bulk (includes normal admixture and copy-number effects), so agreement is expected for clonal heterozygous variants only; points at 0 are covered sites with no tumour alt read." />
      </Card>
      <Card size="small" title="Copy number: clinical estimated copies vs single-cell CN">
        {cnPts.length ? <Scatter points={cnPts} width={Math.min(width, 560)} theme={theme} logAxes xLabel="Clinical estimated copies (log)" yLabel="Single-cell median CN per tumour cell (log), bar to max" /> : <Text type="secondary">not available (no clinical amplification states copies)</Text>}
        <HintLine text="Only amplifications whose report states 'estimated N copies' can be compared. The single-cell CN is the per-cell total CN at the gene (JaBbA graph), median over tumour cells; the vertical bar reaches the highest single cell. Bulk estimates are averages over cells, ecDNA-amplified genes vary widely between cells." />
      </Card>
      <Card size="small" title="Tumour mutational burden: clinical vs single-cell">
        {tmb.length ? <TmbBars rows={tmb} width={Math.min(width, 720)} theme={theme} /> : <Text type="secondary">not available (no clinical TMB)</Text>}
        <HintLine text="Clinical TMB comes from the Oncopanel report (mutations per Mb of the panel). Single-cell TMB (_cohort/tmb.json) is mutations per Mb of callable diploid genome; truncal = on the trunk, subclonal = shared by part of the tumour cells. The two are on different territories and are not expected to be equal." />
      </Card>
      <Card size="small" title={`Single-cell drivers the clinical assay did not report (${missed.length})`}>
        <Table size="small" rowKey="key" dataSource={missed} columns={missCols} pagination={{ pageSize: 12, showSizeChanger: false }} locale={{ emptyText: "none" }} />
        <HintLine text="Tier 1-2 driver events present in >= 30% of the tumour cells whose gene is not named in the patient's clinical report. Patients whose assay failed, found nothing, or has no report are not listed. Genexus and Oncopanel gene panels are not part of the reports, so a gene outside the panel cannot be told apart from a missed call." />
      </Card>
    </Space>
  );
}
