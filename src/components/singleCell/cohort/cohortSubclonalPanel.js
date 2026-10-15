import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Col, Drawer, Empty, Row, Segmented, Select, Skeleton, Space, Table, Tag, Tooltip, Typography } from "antd";
import { BranchesOutlined, ExperimentOutlined, LinkOutlined } from "@ant-design/icons";
import { casePath, tryGet } from "../../../redux/singleCell/loaders";
import { PRECOMPUTE_FILES } from "../../../helpers/singleCell/precompute";
import { rankFindings } from "../../../helpers/singleCell/siteEvidence";
import {
  CLASS_LABEL,
  STATUS_COLOR,
  STATUS_LABEL,
  cladeSignatureRows,
  clonalityText,
  contrastRows,
  driverGeneRows,
  fmtP,
  headlineGenes,
  pathwayMatrix,
  pct,
  recurrenceRows,
  shiftSummary,
  shiftText,
} from "../../../helpers/singleCell/subclonalDrivers";
import CellIgvPanel from "../cellIgvPanel";
import useCohortExport from "./useCohortExport";

const { Text, Paragraph } = Typography;
const NOTE_FILE = "subclonal_drivers.json";

/** Deep link into a patient tab (new browser tab): ?report=<P>&tab=<n>[&evsite=...]. */
function patientHref(patient, tab, extra = {}) {
  if (typeof window === "undefined") return "#";
  const url = new URL(window.location.href);
  ["scview", "evsite", "evview"].forEach((k) => url.searchParams.delete(k));
  url.searchParams.set("report", patient);
  url.searchParams.set("tab", `${tab}`);
  Object.entries(extra).forEach(([k, v]) => url.searchParams.set(k, v));
  return url.toString();
}

const VERDICT_COLOR = { supported: "green", weak: "gold", artefact: "volcano", germline: "purple", absent: "default", uninformative: "default" };

/** Site-evidence verdict (carrier-vs-normal aware) of every hit, from each patient's precompute files. */
function useSiteVerdicts(dataset, patients) {
  const [state, setState] = useState({});
  const key = patients.join("|");
  useEffect(() => {
    if (!dataset || !patients.length) return undefined;
    let active = true;
    (async () => {
      for (const p of patients) {
        const [calls, ev] = await Promise.all([tryGet(casePath(dataset, p, PRECOMPUTE_FILES.calls)), tryGet(casePath(dataset, p, PRECOMPUTE_FILES.siteEvidence))]);
        let res = { status: "none", byId: new Map() };
        if (calls.status === "ok") {
          try {
            const ranked = rankFindings(calls.data, ev.status === "ok" ? ev.data : null, new Map());
            res = { status: "ok", byId: new Map(ranked.all.map((f) => [f.id, f])) };
          } catch (e) {
            res = { status: "error", byId: new Map() };
          }
        }
        if (!active) return;
        setState((s) => ({ ...s, [p]: res }));
      }
    })().catch(() => {});
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset, key]);
  return state;
}

function VerdictTag({ verdicts, hit }) {
  const v = verdicts[hit.patient];
  if (!v) return <Text type="secondary">loading</Text>;
  const f = v.byId.get(hit.site);
  if (!f) return <Text type="secondary">not genotyped</Text>;
  const normal = (f.verdict.checks || []).find((c) => c.key === "normal");
  return (
    <Tooltip title={<div><div>{f.verdict.summary}</div>{normal && <div style={{ marginTop: 4 }}>{normal.text}</div>}</div>}>
      <Tag color={VERDICT_COLOR[f.verdict.level]}>{f.verdict.label}</Tag>
    </Tooltip>
  );
}

function SignatureText({ sig }) {
  if (!sig?.ranked?.length) return <Text type="secondary">n/a</Text>;
  return (
    <Tooltip title={`P(signature | SBS96 context), exposures of the ${sig.set} set (joint fit)`}>
      <span>{sig.ranked.slice(0, 2).map((r) => `${r.signature} ${Math.round(100 * r.prob)}%`).join(", ")}</span>
    </Tooltip>
  );
}

/** Headline card: recurrent subclonal drivers (Overview, Key findings, Drivers). */
export function SubclonalHeadlineCard({ dataset, onView }) {
  const { status, data } = useCohortExport(dataset, NOTE_FILE);
  if (status === "loading") return null;
  if (!data) return <Alert type="info" showIcon message="Recurrent subclonal drivers: not available (_cohort/subclonal_drivers.json not exported; srctools gos_sc_subclonal_drivers.py)" />;
  const genes = headlineGenes(data);
  const shifts = shiftSummary(data).slice(0, 5);
  return (
    <Alert
      type="warning"
      showIcon
      icon={<BranchesOutlined />}
      message={<Text strong>Recurrent subclonal drivers</Text>}
      description={
        <div>
          {genes.length ? (
            <div>
              {genes.map((g) => (
                <span key={g.gene} style={{ marginRight: 16 }}>
                  <Text strong>{g.gene}</Text> {g.hits} truncating hits in {g.patients.length} patients ({g.patients.join(", ")}); expected {g.expected.toFixed(3)}, q {fmtP(g.q)}
                  {g.qNoBwh69 != null && g.patients.includes("BWH69") ? <Text type="secondary"> (q {fmtP(g.qNoBwh69)} without the noisy BWH69</Text> : <Text type="secondary"> (</Text>}
                  {g.qQc != null ? <Text type="secondary">{g.patients.includes("BWH69") ? "; " : ""}q {fmtP(g.qQc)} with read-QC-flagged sites removed, {g.patientsQc} patients)</Text> : <Text type="secondary">)</Text>}
                  {!g.significant && <Text type="secondary"> not significant</Text>}
                </span>
              ))}
            </div>
          ) : (
            <Text type="secondary">No gene recurs in two patients.</Text>
          )}
          {shifts.length > 0 && (
            <div style={{ marginTop: 4 }}>
              Subclonal signature shifts (clade vs truncal / parent, q &lt; 0.1):{" "}
              {shifts.map((s) => (
                <span key={s.key} style={{ marginRight: 12 }}>
                  {s.signature} {s.up ? "gain" : "loss"} in {s.n} clades of {s.patients.join(", ")}
                </span>
              ))}
            </div>
          )}
          {onView && (
            <Button size="small" type="link" style={{ paddingLeft: 0 }} onClick={() => onView("subclonal")}>
              Open the Subclonal view
            </Button>
          )}
        </div>
      }
    />
  );
}

function IgvDrawer({ dataset, target, onClose }) {
  return (
    <Drawer open={!!target} onClose={onClose} width={Math.min(980, Math.max(640, (typeof window !== "undefined" ? window.innerWidth : 1200) * 0.6))} title={target?.label} destroyOnClose>
      {target && (
        <>
          {target.text && <Paragraph type="secondary">{target.text}</Paragraph>}
          <CellIgvPanel embedded dataset={dataset} view={{ cellIds: target.cellIds, chromosome: target.chromosome, position: target.position, label: target.label, window: target.window }} />
        </>
      )}
    </Drawer>
  );
}

const igvTarget = (hit, label, pos = hit.pos, text = null, window = 300) => ({
  label,
  text,
  cellIds: (hit.carrier_ids || []).slice(0, 8),
  chromosome: `${hit.chrom}`.replace(/^chr/i, ""),
  position: pos,
  window,
});

function HitsTable({ hits, verdicts, onIgv }) {
  const columns = [
    { title: "Patient", dataIndex: "patient", render: (p) => <a href={patientHref(p, 7)} target="_blank" rel="noreferrer">{p}</a> },
    { title: "Variant", key: "v", render: (_, h) => <span>{h.protein || CLASS_LABEL[h.class] || h.class} <Text type="secondary" style={{ fontSize: 11 }}>{h.site}</Text></span> },
    { title: "Class", dataIndex: "class", render: (c) => CLASS_LABEL[c] || c },
    {
      title: "Clonal or subclonal",
      key: "st",
      render: (_, h) => (
        <Tooltip
          title={`${h.n_carriers} carrier cells of ${h.n_tumour_cells} (raw ${pct(h.carrier_fraction_raw)}); fraction ${h.carrier_fraction_source}${h.clonality?.per_carrier_vaf != null ? `; per-carrier VAF ${pct(h.clonality.per_carrier_vaf)}` : ""}; tree: ${h.tree ? `${h.tree.category}, ${h.tree.alt_cells} alt cells, clade ${h.tree.clade_cells} cells` : "site not in the mutation map"}`}
        >
          <Space size={4}>
            <Tag color={STATUS_COLOR[h.status]}>{STATUS_LABEL[h.status]}</Tag>
            <Text>{clonalityText(h)}</Text>
          </Space>
        </Tooltip>
      ),
    },
    {
      title: "Caveats",
      key: "cav",
      render: (_, h) => (
        <Space size={2} wrap>
          {h.low_carrier_vaf && (
            <Tooltip title="The carriers' alt reads are few (per-carrier VAF far below a heterozygous ~50%); this is also what low-level error looks like. Check the normal-cell comparison in the site QC.">
              <Tag color="gold">low per-carrier VAF {pct(h.clonality?.per_carrier_vaf, 1)}</Tag>
            </Tooltip>
          )}
          {h.patient === "BWH69" && <Tag color="gold">noisy patient</Tag>}
          {(h.read_qc?.flags || []).map((f) => (
            <Tooltip
              key={f}
              title={`Read-level QC (${h.read_qc.carriers_scanned} carrier cells, ${h.read_qc.alt_reads} alt reads): alt reads split ${pct(h.read_qc.alt_sa_frac)} vs ref ${pct(h.read_qc.ref_sa_frac)}; spliced (exon-exon) ${pct(h.read_qc.alt_exon_split_frac)}; alt base < 10 bp from block end ${pct(h.read_qc.alt_end10_frac)}`}
            >
              <Tag color="volcano">{f}</Tag>
            </Tooltip>
          ))}
        </Space>
      ),
    },
    { title: "Site QC", key: "qc", render: (_, h) => <VerdictTag verdicts={verdicts} hit={h} /> },
    { title: "Clade F1", dataIndex: "clade_f1", render: (v) => (v == null ? "n/a" : v.toFixed(2)) },
    { title: "Signature (posterior)", key: "sig", render: (_, h) => <SignatureText sig={h.signature} /> },
    {
      title: "Links",
      key: "l",
      render: (_, h) => (
        <Space size={6}>
          <a href={patientHref(h.patient, 15, { evsite: h.site })} target="_blank" rel="noreferrer">evidence</a>
          <a onClick={() => onIgv(igvTarget(h, `${h.patient} ${h.gene} ${h.protein || h.class} (carrier cells)`))}>IGV</a>
        </Space>
      ),
    },
  ];
  return <Table size="small" rowKey={(h) => `${h.patient}|${h.site}`} columns={columns} dataSource={hits} pagination={false} />;
}

function NoteBlock({ notes, hits, onIgv }) {
  if (!notes.length) return null;
  return notes.map((n) => {
    const h = hits.find((x) => x.patient === n.patient && x.site === n.site);
    return (
      <Alert
        key={`${n.patient}|${n.site}`}
        type="info"
        showIcon
        style={{ marginBottom: 8 }}
        message={`${n.patient} ${n.site}: ${n.title || "note"}`}
        description={
          <div>
            <div style={{ whiteSpace: "pre-wrap" }}>{n.text}</div>
            {(n.loci || []).map((l) => (
              <Button key={l.label} size="small" type="link" icon={<LinkOutlined />} style={{ paddingLeft: 0 }} onClick={() => h && onIgv({ ...igvTarget(h, l.label, l.position, l.text, l.window || 400), chromosome: `${l.chromosome}`.replace(/^chr/i, ""), cellIds: l.cellIds?.length ? l.cellIds : (h.carrier_ids || []).slice(0, 8) })}>
                IGV: {l.label}
              </Button>
            ))}
          </div>
        }
      />
    );
  });
}

function DriverGeneTable({ data, verdicts, onIgv }) {
  const rows = useMemo(() => driverGeneRows(data), [data]);
  const columns = [
    { title: "Gene", dataIndex: "gene", render: (g, r) => <Text strong>{g}{r.notes.length ? " *" : ""}</Text> },
    { title: "Patients with a subclonal hit", key: "ps", sorter: (a, b) => a.patients_subclonal.length - b.patients_subclonal.length, render: (_, r) => <span><Text strong>{r.patients_subclonal.length}</Text> <Text type="secondary">{r.patients_subclonal.join(", ")}</Text></span> },
    { title: "Patients (any)", key: "pa", render: (_, r) => r.patients.length },
    { title: "Independent hits", key: "h", render: (_, r) => <span>{r.n_hits}{r.multi_hit_patients.length ? <Tag color="purple" style={{ marginLeft: 6 }}>multi-hit: {r.multi_hit_patients.join(", ")}</Tag> : null}</span> },
    { title: "Consequences", key: "c", render: (_, r) => Object.entries(r.classes).map(([k, v]) => `${v} ${CLASS_LABEL[k] || k}`).join(", ") },
    { title: "Carrier fraction per patient", key: "f", render: (_, r) => r.hits.map((h) => `${h.patient} ${pct(h.carrier_fraction)}`).join(" · ") },
    { title: "Territory bp", dataIndex: "length_bp", render: (v) => (v ? v.toLocaleString() : "n/a") },
    { title: "Recurrence q (trunc)", key: "q", sorter: (a, b) => (a.q ?? 1) - (b.q ?? 1), render: (_, r) => (r.recurrence_trunc ? <Tooltip title={`p ${fmtP(r.recurrence_trunc.p_patients)}; ${r.recurrence_trunc.hits} subclonal truncating hits in the mutation map, ${r.recurrence_trunc.expected_hits?.toFixed(3)} expected`}><span>{fmtP(r.q)}</span></Tooltip> : <Text type="secondary">no subclonal truncating hit</Text>) },
  ];
  return (
    <Table
      size="small"
      rowKey="gene"
      columns={columns}
      dataSource={rows}
      pagination={{ pageSize: 15, hideOnSinglePage: true }}
      expandable={{
        expandedRowRender: (r) => (
          <div>
            <NoteBlock notes={r.notes} hits={r.hits} onIgv={onIgv} />
            <HitsTable hits={r.hits} verdicts={verdicts} onIgv={onIgv} />
          </div>
        ),
        defaultExpandedRowKeys: rows.length ? [rows[0].gene] : [],
      }}
    />
  );
}

function RecurrenceCard({ data }) {
  const [set, setSet] = useState("trunc");
  const [minP, setMinP] = useState(2);
  const { rows, nTested } = recurrenceRows(data, set, { limit: 40, minPatients: minP });
  const columns = [
    { title: "Gene", dataIndex: "gene", render: (g) => <Text strong>{g}</Text> },
    { title: "Patients", dataIndex: "patients" },
    { title: "Hits", dataIndex: "hits" },
    { title: "Expected hits", dataIndex: "expected_hits", render: (v) => v.toFixed(3) },
    { title: "Obs / exp", dataIndex: "ratio" },
    { title: "Territory bp", dataIndex: "length_bp", render: (v) => v.toLocaleString() },
    { title: "p (patients)", dataIndex: "p_patients", render: fmtP },
    { title: "q (patients)", dataIndex: "q_patients", render: (v) => <Text strong={v < 0.1}>{fmtP(v)}</Text> },
    { title: "q (hits)", dataIndex: "q_hits", render: fmtP },
    { title: "q without BWH69", dataIndex: "q_patients_no_bwh69", render: fmtP },
    { title: "q read-QC pass", key: "qqc", render: (_, r) => (r.q_patients_read_qc_pass == null ? "n/a" : <Tooltip title={`${r.patients_read_qc_pass} patients after dropping driver sites with read-level artefact flags (spliced / split-only / read-end / same allele in other patients)`}><span>{fmtP(r.q_patients_read_qc_pass)}</span></Tooltip>) },
    { title: "Per patient", key: "pp", render: (_, r) => (r.per_patient || []).map((x) => `${x.patient} ${x.hits}${x.read_qc_flagged?.length ? ` (${x.read_qc_flagged.length} flagged)` : ""}`).join(", ") },
  ];
  return (
    <Card
      size="small"
      title="Length-aware recurrence of subclonal hits"
      extra={
        <Space>
          <Segmented size="small" value={set} onChange={setSet} options={[{ value: "trunc", label: "truncating" }, { value: "nonsyn", label: "non-synonymous" }]} />
          <Segmented size="small" value={minP} onChange={setMinP} options={[{ value: 1, label: "all genes with a hit" }, { value: 2, label: "≥ 2 patients" }]} />
        </Space>
      }
    >
      <Paragraph type="secondary" style={{ fontSize: 12 }}>
        {data.recurrence_method} {nTested.toLocaleString()} genes tested. {data.dnds_note}
      </Paragraph>
      <Table size="small" rowKey="gene" columns={columns} dataSource={rows} pagination={{ pageSize: 15, hideOnSinglePage: true }} />
    </Card>
  );
}

function PathwayCard({ data }) {
  const { patients, rows } = useMemo(() => pathwayMatrix(data), [data]);
  const columns = [
    { title: "Pathway", dataIndex: "pathway", fixed: "left", width: 180, render: (p, r) => <Tooltip title={r.genes.join(", ")}><Text strong>{p}</Text></Tooltip> },
    { title: "Patients (subclonal)", dataIndex: "nSubclonal", width: 90 },
    ...patients.map((p, k) => ({
      title: p,
      key: p,
      render: (_, r) => {
        const c = r.cells[k];
        if (!c.available) return <Text type="secondary">n/a</Text>;
        return (
          <div style={{ fontSize: 12 }}>
            {c.subclonal.map((x) => <Tag key={x} color="blue" style={{ marginBottom: 2 }}>{x}</Tag>)}
            {c.clonal.map((x) => <Tag key={x} style={{ marginBottom: 2 }}>{x} (clonal)</Tag>)}
            {c.other.map((x) => <Tooltip key={x} title="truncating SNV in the mutation map, not a tiered driver event"><Tag color="default" style={{ borderStyle: "dashed", marginBottom: 2 }}>{x}</Tag></Tooltip>)}
          </div>
        );
      },
    })),
  ];
  return (
    <Card size="small" title="Pathway roll-up: patients × pathway with driver SNVs">
      <Paragraph type="secondary" style={{ fontSize: 12 }}>
        Blue: subclonal driver hit; grey: clonal; dashed: other subclonal truncating SNV of the mutation map in a pathway gene. n/a: no SNV mutation map for the patient.
      </Paragraph>
      <Table size="small" rowKey="pathway" columns={columns} dataSource={rows} pagination={false} scroll={{ x: true }} />
    </Card>
  );
}

function ContrastCard({ data }) {
  const [contrast, setContrast] = useState("subclonal vs truncal");
  const rows = useMemo(() => contrastRows(data, { contrast }), [data, contrast]);
  const columns = [
    { title: "Patient", dataIndex: "patient" },
    { title: "Signature", dataIndex: "signature" },
    { title: "Truncal", dataIndex: "frac_b", render: (v) => pct(v) },
    { title: contrast.split(" vs ")[0], dataIndex: "frac_a", render: (v) => pct(v) },
    { title: "Difference (95% CI)", key: "d", render: (_, r) => <Text strong={r.q < 0.1}>{`${r.diff > 0 ? "+" : ""}${Math.round(100 * r.diff)} pts (${Math.round(100 * r.lo)} to ${Math.round(100 * r.hi)})`}</Text> },
    { title: "q", dataIndex: "q", render: fmtP },
    { title: "Sites", key: "n", render: (_, r) => `${r.n_a} vs ${r.n_b}` },
  ];
  return (
    <Card
      size="small"
      title="Truncal vs subclonal signatures (joint fit)"
      extra={<Segmented size="small" value={contrast} onChange={setContrast} options={["subclonal vs truncal", "private vs truncal"]} />}
    >
      <Paragraph type="secondary" style={{ fontSize: 12 }}>From each patient's signatures_joint.json (NNLS refit on the patient signature set, bootstrap CI and p, BH q per patient).</Paragraph>
      <Table size="small" rowKey="key" columns={columns} dataSource={rows} pagination={{ pageSize: 12, hideOnSinglePage: true }} />
    </Card>
  );
}

function shade(frac) {
  const a = Math.max(0, Math.min(1, frac || 0));
  return `rgba(79, 121, 167, ${0.08 + 0.75 * a})`;
}

function CladeSignatureCard({ data }) {
  const patients = Object.keys(data.clade_signatures || {});
  const [patient, setPatient] = useState(patients[0]);
  const shifts = useMemo(() => shiftSummary(data), [data]);
  const sig = useMemo(() => cladeSignatureRows(data, patient), [data, patient]);
  const cell = (r, s) => {
    if (!r.fitted) return null;
    const f = r.frac[s];
    if (!f) return null;
    const tests = r.tests[s] || [];
    const up = tests.some((t) => t.diff > 0);
    const down = tests.some((t) => t.diff < 0);
    return (
      <Tooltip title={<div>{`${s}: ${pct(f.frac)} (95% CI ${pct(f.lo)}–${pct(f.hi)})`}{tests.map((t) => <div key={t.vs}>{shiftText(t)}</div>)}</div>}>
        <div style={{ background: shade(f.frac), padding: "1px 4px", textAlign: "right", outline: up ? "2px solid #d4380d" : down ? "2px solid #1d39c4" : undefined }}>
          {Math.round(100 * f.frac)}
          {up ? " ▲" : down ? " ▼" : ""}
        </div>
      </Tooltip>
    );
  };
  const columns = [
    { title: "Clade (tree order)", key: "c", fixed: "left", width: 220, render: (_, r) => <span style={{ paddingLeft: 12 * r.depth }}>{`${r.clade}`.replace(/^[A-Z0-9]+_/, "")} <Text type="secondary">{r.n_cells} cells{r.is_trunk ? " · trunk" : ""}</Text></span> },
    { title: "Branch SNVs", dataIndex: "n_sites", width: 90 },
    ...sig.signatures.map((s) => ({ title: <span>{s}{sig.added.includes(s) ? "*" : ""}</span>, key: s, width: 72, render: (_, r) => (r.fitted ? cell(r, s) : null) })),
    { title: "Note", key: "n", render: (_, r) => (!r.fitted ? <Text type="secondary">{r.reason}: not fitted</Text> : r.flagged.length ? r.flagged.map((t) => <Tag key={`${t.vs}${t.signature}`} color={t.diff > 0 ? "volcano" : "geekblue"}>{shiftText(t)}</Tag>) : null) },
  ];
  const truncalRow = { clade: "truncal set", key: "__truncal", depth: 0, n_cells: null, n_sites: sig.nTruncal, fitted: true, frac: sig.truncal || {}, tests: {}, flagged: [] };
  return (
    <Card
      size="small"
      title="Signature shifts per clade"
      extra={<Select size="small" style={{ width: 140 }} value={patient} onChange={setPatient} options={patients.map((p) => ({ value: p, label: p }))} />}
    >
      <Paragraph type="secondary" style={{ fontSize: 12 }}>{data.clade_signature_method} * added to the patient set so an APOBEC gain can show. ▲ / ▼: significant gain / loss (q &lt; 0.1) vs the truncal set or the parent branch.</Paragraph>
      <Table size="small" rowKey="key" columns={columns} dataSource={[truncalRow, ...sig.rows]} pagination={false} scroll={{ x: true, y: 520 }} />
      <div style={{ marginTop: 12 }}>
        <Text strong>Cohort: significant clade shifts (q &lt; 0.1, ≥ 5 points)</Text>
        <Table
          size="small"
          rowKey="key"
          style={{ marginTop: 6 }}
          pagination={false}
          dataSource={shifts}
          columns={[
            { title: "Signature", key: "s", render: (_, g) => <span>{g.signature} {g.up ? "gain" : "loss"}</span> },
            { title: "Clades", dataIndex: "n" },
            { title: "Patients", key: "p", render: (_, g) => g.patients.join(", ") },
            { title: "Shifts", key: "l", render: (_, g) => g.shifts.slice(0, 6).map((s) => `${s.patient} ${`${s.clade}`.replace(/^[A-Z0-9]+_/, "")}: ${shiftText(s)}`).join("; ") + (g.shifts.length > 6 ? ` … +${g.shifts.length - 6}` : "") },
          ]}
        />
      </div>
    </Card>
  );
}

/** Cohort view "Subclonal" (scview=subclonal). */
export default function CohortSubclonalPanel({ dataset }) {
  const { status, data } = useCohortExport(dataset, NOTE_FILE);
  const patients = useMemo(() => [...new Set((data?.hits || []).map((h) => h.patient))].sort(), [data]);
  const verdicts = useSiteVerdicts(dataset, patients);
  const [igv, setIgv] = useState(null);
  if (status === "loading") return <Skeleton active />;
  if (!data) return <Empty description="Subclonal drivers not available (_cohort/subclonal_drivers.json not exported; srctools inst/gos_single_cell/gos_sc_subclonal_drivers.py)." />;
  const missing = (data.patients || []).filter((p) => !p.available);
  return (
    <Row gutter={[12, 12]}>
      <Col span={24}>
        <SubclonalHeadlineCard dataset={dataset} />
      </Col>
      <Col span={24}>
        <Card size="small" title={<Space><ExperimentOutlined />Recurrent driver SNVs: clonal or subclonal</Space>}>
          <Paragraph type="secondary" style={{ fontSize: 12 }}>
            {data.definitions.hit}. Subclonal: {data.definitions.subclonal}. Carrier fraction: {data.definitions.carrier_fraction}. Site QC: the Evidence-tab verdict (tumour vs error,
            carrier cells vs normal cells, other patients, strand). {missing.length ? `Not available: ${missing.map((p) => `${p.patient} (${p.reason})`).join("; ")}.` : ""}
          </Paragraph>
          <DriverGeneTable data={data} verdicts={verdicts} onIgv={setIgv} />
        </Card>
      </Col>
      <Col span={24}>
        <RecurrenceCard data={data} />
      </Col>
      <Col span={24}>
        <PathwayCard data={data} />
      </Col>
      <Col span={24}>
        <ContrastCard data={data} />
      </Col>
      <Col span={24}>
        <CladeSignatureCard data={data} />
      </Col>
      <IgvDrawer dataset={dataset} target={igv} onClose={() => setIgv(null)} />
    </Row>
  );
}
