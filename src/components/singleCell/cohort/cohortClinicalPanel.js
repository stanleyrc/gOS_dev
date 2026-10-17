import React, { useMemo, useState } from "react";
import { Alert, Card, Empty, Segmented, Skeleton, Space, Switch, Table, Typography } from "antd";
import { driverHref } from "../../../helpers/singleCell/driverLink";
import { KINDS, KIND_LABEL, cnPoints, eventForCell, metaStrip, summarize, tmbRows, vafPoints } from "../../../helpers/singleCell/clinicalConcordance";
import { ONCO_CLASS_LABEL, clinicalHeader, clinicalOncoprint, recoveryCounts } from "../../../helpers/singleCell/clinicalFigure";
import useContainerWidth from "../useContainerWidth";
import usePlotTheme from "../usePlotTheme";
import SvgExportButton from "../svgExportButton";
import HintLine from "../hintLine";
import useClinicalAssays from "../clinical/useClinicalAssays";
import { ClinicalOncoprint, GlyphLegend, StackedRows } from "../clinical/clinicalViz";
import { AgreementScatter, TmbPaired } from "../clinical/clinicalCharts";
import Figure1Layout from "../clinical/figure1Layout";

const { Text } = Typography;

const initialView = () => {
  try {
    return new URLSearchParams(window.location.search).get("clinview") === "fig1" ? "fig1" : "assays";
  } catch (e) {
    return "assays";
  }
};

/**
 * Clinical assay concordance: which alterations of the Oncopanel / Genexus reports the single-cell data recovers, how
 * clinical VAF / copy number / TMB compare, and (toggle) a candidate Figure 1 layout built from live data.
 */
export default function CohortClinicalPanel({ dataset, rawFiles = {}, summaries = [], tsg = null, onOpenPatient = null }) {
  const theme = usePlotTheme();
  const [ref, width] = useContainerWidth(900);
  const ocRef = React.useRef(null);
  const { status, assays, recovery } = useClinicalAssays(dataset);
  const [view, setViewState] = useState(initialView);
  const setView = (v) => {
    setViewState(v);
    try {
      const url = new URL(window.location.href);
      if (v === "fig1") url.searchParams.set("clinview", "fig1");
      else url.searchParams.delete("clinview");
      window.history.replaceState(window.history.state, "", url.toString());
    } catch (e) {
      // no history
    }
  };
  const [hideGerm, setHideGerm] = useState(false);
  const patients = useMemo(() => Object.keys(recovery?.patients || {}).sort(), [recovery]);
  const grid = useMemo(() => clinicalOncoprint(recovery, { patients, hideGermlineLike: hideGerm }), [recovery, patients, hideGerm]);
  const header = useMemo(() => clinicalHeader(assays, recovery, patients, metaStrip), [assays, recovery, patients]);
  const counts = useMemo(() => recoveryCounts(recovery, patients), [recovery, patients]);
  const summary = useMemo(() => summarize(recovery), [recovery]);
  const vaf = useMemo(() => vafPoints(recovery), [recovery]);
  const cn = useMemo(() => cnPoints(recovery), [recovery]);
  const tmb = useMemo(() => tmbRows(recovery), [recovery]);
  const missed = useMemo(() => patients.flatMap((p) => (recovery?.patients?.[p]?.missed || []).map((m, i) => ({ ...m, patient: p, key: `${p}-${i}` }))), [patients, recovery]);
  if (status === "loading") return <Skeleton active />;
  if (status === "none" || !recovery) return <Empty description="Clinical assay concordance is not exported yet (_cohort/clinical_recovery.json; srctools gos_sc_clinical_recovery.py)." />;

  const href = (p, row, kind) => {
    const ev = eventForCell(rawFiles?.[p]?.events, row, kind);
    return ev ? driverHref(p, ev) : null;
  };
  const hrefOf = (p, e) => href(p, e.row, e.kind === "tert" ? "tert" : e.kind);
  const vafPts = vaf.map((p) => ({ ...p, tip: `${p.patient} ${p.label}\nclinical VAF ${(100 * p.x).toFixed(0)}%, single-cell pooled VAF ${(100 * p.y).toFixed(1)}% (${p.carriers ?? "?"} of ${p.covered ?? "?"} covered tumour cells)${p.germlineLike ? "\nalso present in normal cells (germline-like)" : ""}`, href: href(p.patient, p.row, "snv"), show: p.status === "not_recovered" || p.germlineLike }));
  const cnPts = cn.map((p) => ({ ...p, show: true, tip: `${p.patient} ${p.label}\nclinical estimate ${p.x} copies; single-cell carrier-cell median CN ${p.y} (all tumour cells ${p.yAll}, mean ${p.yMean}, max ${p.yMax}); ${(100 * p.frac).toFixed(0)}% of tumour cells amplified`, href: href(p.patient, p.row, "cnv") }));
  const typeRows = counts.byClass.map((c) => ({ label: ONCO_CLASS_LABEL[c.cls], counts: c.counts, total: c.total }));
  const patRows = counts.byPatient.filter((b) => b.total > 0).map((b) => ({ label: b.id, counts: b.counts, total: b.total }));
  const assessable = KINDS.reduce((s, k) => s + summary[k].assessable, 0);
  const recovered = KINDS.reduce((s, k) => s + summary[k].recovered, 0);
  const cw = Math.min(width - 24, 560);
  const sw = width >= 900 ? Math.floor((width - 12) / 2) - 28 : width - 28;
  const missCols = [
    { title: "Patient", dataIndex: "patient" },
    { title: "Single-cell driver", dataIndex: "gene", render: (g, r) => { const ev = eventForCell(rawFiles?.[r.patient]?.events, { gene: g, genes: [g], protein: r.variant, type: r.type === "SCNA" ? (`${r.variant}` === "AMP" ? "Amplification" : "Loss") : "" }, r.type === "SCNA" ? "cnv" : r.type === "Fusion" ? "sv" : "snv"); const txt = `${g}${r.variant ? ` ${r.variant}` : ""} (${r.type})`; return ev ? <a href={driverHref(r.patient, ev)}>{txt}</a> : txt; } },
    { title: "Tier", dataIndex: "tier" },
    { title: "Tumour cells", dataIndex: "cell_fraction", render: (f, r) => `${Math.round(100 * f)}% (${r.n_cells})` },
    { title: "Clinical panel", dataIndex: "panel" },
  ];
  return (
    <div ref={ref}>
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Segmented value={view} onChange={setView} options={[{ value: "assays", label: "Clinical assays" }, { value: "fig1", label: "Figure 1 layout" }]} />
      {view === "fig1" ? (
        <Figure1Layout dataset={dataset} assays={assays} recovery={recovery} summaries={summaries} rawFiles={rawFiles} tsg={tsg} onOpenPatient={onOpenPatient} />
      ) : (
        <>
          <Card size="small" title="Clinical assay concordance: Oncopanel / Genexus alterations vs the single-cell data" extra={<SvgExportButton containerRef={ocRef} name="clinical-concordance" />}>
            <div ref={ocRef}>
              <Alert type="info" showIcon style={{ marginBottom: 8 }}
                message={`Recovered ${recovered} of ${assessable} assessable reported alterations (${KINDS.map((k) => `${KIND_LABEL[k]} ${summary[k].recovered}/${summary[k].assessable}`).join("; ")})`}
                description="Real counts from the clinical text reports (_cohort/clinical_assays.json) and the single-cell calls, pooled pileups and genome graphs (_cohort/clinical_recovery.json). Click a glyph to open that driver in the patient." />
              <Space size={4} style={{ marginBottom: 8 }}><Switch size="small" checked={hideGerm} onChange={setHideGerm} /><Text type="secondary">Hide germline-like SNVs (also in normal cells)</Text></Space>
              <GlyphLegend theme={theme} />
              <ClinicalOncoprint grid={grid} header={header} bars={counts} width={width} theme={theme} hrefOf={hrefOf} onPatient={onOpenPatient} />
              <HintLine text="Columns: patients with clinical annotations (sex, location, MGMT, age from the clinical metadata file; truncal mutations = sites on the trunk of the current tree; primary / recurrent and regions sampled are not in any data file), the clinical assay status, and a stacked bar of the alterations the report lists. Rows: genes, grouped into curated GBM tumour suppressors, other genes and chromosome / arm-level events, most recurrent first. Hover a glyph for the verbatim report line and our evidence. SNVs: recovered = alt reads in >= 3 tumour cells and pooled VAF >= 2%; copy number: >= 80% of tumour cells show the reported change relative to their own baseline." />
            </div>
          </Card>
          <Card size="small" title="Recovery by alteration type and patient">
            <Space size={24} align="start" wrap>
              <StackedRows rows={typeRows} width={cw} theme={theme} title="Recovery by alteration type" />
              <StackedRows rows={patRows} width={cw} theme={theme} title="Recovery by patient" />
            </Space>
          </Card>
          <div style={{ display: "grid", gridTemplateColumns: width >= 900 ? "1fr 1fr" : "1fr", gap: 12 }}>
            <Card size="small" title="VAF: clinical assay vs single-cell pooled reads" style={{ minWidth: 0 }}>
              <AgreementScatter points={vafPts} width={sw} theme={theme} xLabel="Clinical VAF" yLabel="Single-cell pooled VAF" xMax={1} yMax={1} pct />
              <HintLine text="Each point is a reported SNV / indel with a clinical VAF and enough single-cell coverage. Dashed line: equal VAF. Hollow points are also present in normal cells (germline-like). Clinical VAF is bulk (normal admixture, copy-number effects), so agreement is expected for clonal heterozygous variants only." />
            </Card>
            <Card size="small" title="Copy number: clinical estimate vs single-cell CN" style={{ minWidth: 0 }}>
              {cnPts.length ? <AgreementScatter points={cnPts} width={sw} theme={theme} logAxes xLabel="Clinical estimated copies (log)" yLabel="Single-cell median CN, carrier cells (log)" /> : <Text type="secondary">not available (no clinical amplification states copies)</Text>}
              <HintLine text="Only amplifications whose report states 'estimated N copies'. Single-cell CN = per-cell maximum total CN over the gene interval (JaBbA graph), median over carrier cells; the bar reaches the highest cell. ecDNA-amplified genes vary widely between cells." />
            </Card>
          </div>
          <Card size="small" title="Tumour mutational burden: clinical vs single-cell">
            {tmb.length ? <TmbPaired rows={tmb} width={Math.min(width - 24, 640)} theme={theme} /> : <Text type="secondary">not available (no clinical TMB)</Text>}
            <HintLine text="Units: mutations per Mb. Clinical = Oncopanel report (gene-panel territory). Single-cell (_cohort/tmb.json) = mutations per Mb of callable diploid genome, truncal + subclonal stacked, black tick = per-cell median. Different territories, so equality is not expected. n/a = no single-cell TMB for that patient." />
          </Card>
          <Card size="small" title={`Single-cell drivers the clinical assay did not report (${missed.length})`}>
            <Table size="small" rowKey="key" dataSource={missed} columns={missCols} pagination={{ pageSize: 8, showSizeChanger: false }} locale={{ emptyText: "none" }} />
            <HintLine text="Tier 1-2 driver events in >= 30% of the tumour cells whose gene is not named in the patient's clinical report. Gene panels are not part of the reports, so a gene outside the panel cannot be told apart from a missed call." />
          </Card>
        </>
      )}
    </Space>
    </div>
  );
}
