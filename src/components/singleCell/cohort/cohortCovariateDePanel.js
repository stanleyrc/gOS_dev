import React, { useEffect, useMemo, useState } from "react";
import GeneInfoCard from "../rna/geneInfoCard";
import { Alert, Button, Card, Col, Empty, Input, InputNumber, Row, Segmented, Select, Skeleton, Space, Switch, Table, Tag, Tooltip, Typography } from "antd";
import useCohortExport from "./useCohortExport";
import CovariateDeViolins from "./covariateDeViolins";
import CovariateDeMulti from "./covariateDeMulti";
import CladeF1Chip, { useCladeF1Filter } from "./cladeF1Chip";
import CladeTopExplainer from "./cladeTopExplainer";
import VolcanoPlot from "../rna/volcanoPlot";
import GeneQuickLook from "./geneQuickLook";
import ScErrorBoundary from "../errorBoundary";
import HintLine from "../hintLine";
import { formatGenesParam, nF1AtLeast, parseGenesParam, passesCovariateFilters, reconcileSelection, testCladeF1, testGenePool, toggleGene, topGenes } from "../../../helpers/singleCell/covariateDeMulti";
import { FAMILIES, FAMILY_LABELS, describeTest, sensitivityOnlyTerms, sensitivityProblems, sharedPrograms, formatQ, isRobust, looselyAdjusted, perPatientLfc, testRows, volcanoRows } from "../../../helpers/singleCell/covariateDe";
import { GeneFunctionLine, GeneInfo } from "../geneInfoPopover";

const { Text } = Typography;
const Q_CUT = 0.05;
const LFC_CUT = 0.5;
const MAX_GENES = 40;
const DEFAULT_FILTERS = { minCarriers: 0, minGroup: 5 };
const ADJUST_NAME = { "plate+cycling+qc": "plate x cycling x library quality", "cycling+qc": "cycling x library quality (plates not separable)", "plate+cycling": "plate x cycling", cycling: "cycling only", none: "unadjusted" };

function EnrichmentList({ title, items }) {
  return (
    <div style={{ minWidth: 220, flex: 1 }}>
      <Text strong>{title}</Text>
      {items.length ? (
        <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>
          {items.slice(0, 6).map((e) => (
            <li key={`${e.collection}-${e.term}`}>
              <Tooltip title={`${e.collection}; ${e.n} genes; leading: ${(e.leading || []).join(", ")}`}>
                <span>{e.term.replace(/^HALLMARK_|^3CA_\d+_/, "").replace(/_/g, " ").toLowerCase()}</span>
              </Tooltip>
              <Text type="secondary">{` · mean z ${e.mean_z.toFixed(2)} · q ${formatQ(e.q)}`}</Text>
            </li>
          ))}
        </ul>
      ) : (
        <div><Text type="secondary">no set tested</Text></div>
      )}
    </div>
  );
}

/**
 * Covariate DE: carriers vs non-carriers of recurrent drivers, high vs low oncogene copy number and clade vs sister clade,
 * each tested inside every patient (stratified Wilcoxon) and combined across patients. A table of tests, a volcano per
 * test, the top genes with their per-patient fold changes, and gene-set / program enrichment. `onGene` opens a gene in the
 * cohort expression plot; `focusTest` preselects a test (from a Key findings card).
 */
export default function CohortCovariateDePanel({ dataset, focusTest = null, focusGene = null, onGene = null, summaries = [], datasets = [], rawFiles = {} }) {
  const { status, data } = useCohortExport(dataset, "rna_covariate_de.json");
  const headerF1 = useCladeF1Filter();
  const [family, setFamily] = useState("all");
  const [query, setQuery] = useState("");
  const [combinableOnly, setCombinableOnly] = useState(false);
  // deep link: ?covtest=<test id>&covgenes=EGFR,SOX2 (genes of the selected covariate; replaceState, no history entries)
  const link = useMemo(() => {
    try {
      const u = new URLSearchParams(window.location.search);
      return { test: u.get("covtest"), genes: parseGenesParam(u.get("covgenes")) };
    } catch (e) {
      return { test: null, genes: [] };
    }
  }, []);
  const [selectedId, setSelectedId] = useState(link.test || null);
  const [selectedGenes, setSelectedGenes] = useState(link.genes);
  const [minCarriers, setMinCarriers] = useState(DEFAULT_FILTERS.minCarriers);
  const [minGroup, setMinGroup] = useState(DEFAULT_FILTERS.minGroup);
  // Clade F1 filter is its own control (default off): the header filter hides events from the event lists, whereas every
  // test here is already computed, so tying it to the header would silently remove tests from the list
  const [f1On, setF1On] = useState(false);
  const [f1Min, setF1Min] = useState(headerF1?.min ?? 0.5);
  const [f1Mode, setF1Mode] = useState("all");
  const [f1K, setF1K] = useState(2);
  const [topN, setTopN] = useState(10);
  const [geneNote, setGeneNote] = useState(null);
  const [geneFilter, setGeneFilter] = useState(focusGene?.gene || null); // tests listing this gene (q < 0.05) among their top genes
  useEffect(() => {
    if (!focusGene?.gene) return;
    setGeneFilter(focusGene.gene);
    setFamily("all");
    setQuery("");
    setSelectedId(null);
    resetFilters();
  }, [focusGene]); // eslint-disable-line react-hooks/exhaustive-deps
  const resetFilters = () => {
    setMinCarriers(0);
    setMinGroup(0);
    setF1On(false);
  };
  const f1ByTest = useMemo(() => {
    const out = new Map();
    (data?.tests || []).forEach((t) => out.set(t.id, testCladeF1(t, rawFiles)));
    return out;
  }, [data, rawFiles]);
  const filterCfg = useMemo(() => ({ minCarriers, minGroup, f1: { on: f1On, min: f1Min, mode: f1Mode, k: f1K } }), [minCarriers, minGroup, f1On, f1Min, f1Mode, f1K]);
  const allRows = useMemo(() => testRows(data, { family, query, combinableOnly, gene: geneFilter }), [data, family, query, combinableOnly, geneFilter]);
  const rows = useMemo(() => allRows.filter((t) => passesCovariateFilters(t, f1ByTest.get(t.id), filterCfg)), [allRows, f1ByTest, filterCfg]);
  const filtersActive = minCarriers > 0 || minGroup > 0 || f1On;
  useEffect(() => {
    if (focusTest?.id) {
      setSelectedId(focusTest.id);
      setFamily("all");
      setQuery("");
      resetFilters(); // a linked test must be visible
    }
  }, [focusTest]); // eslint-disable-line react-hooks/exhaustive-deps
  const selected = rows.find((r) => r.id === selectedId) || (rows.length && !selectedId ? rows[0] : null);
  // covariate change: genes the new test has statistics for stay selected, the rest vanish
  useEffect(() => {
    if (!selected) return;
    setSelectedGenes((cur) => {
      const next = reconcileSelection(cur, selected);
      return next.length === cur.length && next.every((g, i) => g === cur[i]) ? cur : next;
    });
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!data || !selected) return;
    try {
      const u = new URL(window.location.href);
      if (selectedGenes.length) u.searchParams.set("covgenes", formatGenesParam(selectedGenes));
      else u.searchParams.delete("covgenes");
      if (selectedId || selectedGenes.length) u.searchParams.set("covtest", selected.id);
      window.history.replaceState(null, "", u.toString());
    } catch (e) {
      // no history (tests): the selection still works
    }
  }, [data, selected?.id, selectedId, selectedGenes]); // eslint-disable-line react-hooks/exhaustive-deps
  const selectedGene = selectedGenes.length === 1 ? selectedGenes[0] : null;
  const pool = useMemo(() => testGenePool(selected), [selected]);
  const addGenes = (list) => {
    setSelectedGenes((cur) => {
      const merged = [...cur];
      list.forEach((g) => !merged.some((x) => x.toUpperCase() === g.toUpperCase()) && merged.push(g));
      if (merged.length > MAX_GENES) setGeneNote(`At most ${MAX_GENES} genes can be selected; the rest were not added.`);
      else setGeneNote(null);
      return merged.slice(0, MAX_GENES);
    });
  };
  const volcano = useMemo(() => volcanoRows(selected), [selected]);
  const onVolcanoGene = (g) => setSelectedGenes((cur) => toggleGene(cur, g));
  const shared = useMemo(() => sharedPrograms(data), [data]);

  if (status === "loading") return <Skeleton active />;
  if (!data) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Covariate differential not computed yet (_cohort/rna_covariate_de.json; srctools gos_sc_rna_covariate_de.py)." />;

  const columns = [
    { title: "Test", dataIndex: "label", render: (v) => <Text strong>{v}</Text>, sorter: (a, b) => a.label.localeCompare(b.label) },
    { title: "Kind", dataIndex: "family_label", width: 130 },
    { title: "Patients", dataIndex: "k_patients", width: 80, align: "right", sorter: (a, b) => a.k_patients - b.k_patients },
    { title: "Carriers / others", key: "cells", width: 120, align: "right", sorter: (a, b) => a.cells.a - b.cells.a, render: (_, r) => <Tooltip title={`${r.cells.a} cells of ${r.group_a} vs ${r.cells.b} of ${r.group_b}, over ${r.k_patients} patient${r.k_patients === 1 ? "" : "s"}`}>{`${r.cells.a} / ${r.cells.b}`}</Tooltip> },
    { title: "Clade F1", key: "f1", width: 130, align: "right", sorter: (a, b) => (f1ByTest.get(a.id)?.summary?.median ?? -1) - (f1ByTest.get(b.id)?.summary?.median ?? -1), render: (_, r) => <F1Cell f1={f1ByTest.get(r.id)} min={f1Min} loading={!Object.keys(rawFiles || {}).length} /> },
    { title: "Robust genes", dataIndex: "n_robust", width: 100, align: "right", defaultSortOrder: "descend", sorter: (a, b) => a.n_robust - b.n_robust, render: (v, r) => (r.combinable ? <Text strong={v > 0}>{v}</Text> : <Tooltip title="One patient only: not combinable"><Text type="secondary">–</Text></Tooltip>) },
    { title: "Genes q<0.05", dataIndex: "n_sig_q05", width: 100, align: "right", sorter: (a, b) => a.n_sig_q05 - b.n_sig_q05 },
    { title: "Top higher in A", dataIndex: "top_up", render: (v) => (v || []).slice(0, 4).join(", ") },
    { title: "Top lower in A", dataIndex: "top_down", render: (v) => (v || []).slice(0, 4).join(", ") },
  ];
  const geneColumns = [
    { title: "Gene", dataIndex: "gene", width: 240, render: (g) => (
      <div>
        <Space size={2} style={{ whiteSpace: "nowrap" }}>
          <GeneInfo gene={g} stopClick={false}>
            <Text strong style={{ cursor: "pointer", color: selectedGenes.includes(g) ? "#fa541c" : undefined }} onClick={() => setSelectedGenes((cur) => toggleGene(cur, g))}>{g}</Text>
          </GeneInfo>
          <GeneQuickLook gene={g} icon />
        </Space>
        <GeneFunctionLine gene={g} n={90} />
      </div>
    ) },
    { title: "log2FC", dataIndex: "avg_log2FC", width: 76, align: "right", render: (v) => v.toFixed(2) },
    { title: "z", dataIndex: "z", width: 64, align: "right", render: (v) => v.toFixed(1) },
    { title: "q", dataIndex: "q_val", width: 76, align: "right", render: formatQ },
    { title: "Fisher q", dataIndex: "fisher_q", width: 76, align: "right", render: formatQ },
    { title: "Same direction", key: "conc", width: 100, align: "right", render: (_, r) => <Text type={r.n_concordant === r.n_patients ? undefined : "secondary"}>{`${r.n_concordant}/${r.n_patients}`}</Text> },
    { title: "Robust", key: "robust", width: 70, render: (_, r) => (isRobust(r) ? <Tag color="green" style={{ margin: 0 }}>yes</Tag> : null) },
    { title: "Per patient log2FC", key: "per", render: (_, r) => perPatientLfc(r).map((x) => <Tag key={x.patient} color={x.lfc > 0 ? "volcano" : "geekblue"} style={{ margin: 1 }}>{`${x.patient} ${x.lfc > 0 ? "+" : ""}${x.lfc.toFixed(2)}`}</Tag>) },
    ...(onGene ? [{ title: "", key: "open", width: 90, render: (_, r) => <Button size="small" type="link" onClick={() => onGene(r.gene)}>Expression</Button> }] : []),
  ];
  const labels = selected ? { A: selected.group_a, B: selected.group_b } : { A: "A", B: "B" };
  const loose = selected ? looselyAdjusted(selected) : [];

  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Card size="small" title="Covariate differential expression">
        <Space wrap size={[12, 6]} style={{ marginBottom: 8 }}>
          <Segmented size="small" value={family} onChange={setFamily} options={[{ value: "all", label: "All" }, ...FAMILIES.map((f) => ({ value: f, label: FAMILY_LABELS[f] }))]} />
          <Input.Search size="small" allowClear placeholder="search tests or genes" style={{ width: 200 }} value={query} onChange={(e) => setQuery(e.target.value)} />
          {geneFilter && <Tag closable color="blue" onClose={() => setGeneFilter(null)}>{`tests with ${geneFilter}`}</Tag>}
          <Space size={4}><Switch size="small" checked={combinableOnly} onChange={setCombinableOnly} /><Text type="secondary">2+ patients only</Text></Space>
        </Space>
        <Space wrap size={[14, 6]} style={{ marginBottom: 8 }}>
          <Tooltip title="Cells carrying the event (group A, with RNA, malignant tumour cells), summed over patients"><Space size={4}><Text type="secondary">Min carrier cells</Text><InputNumber size="small" min={0} step={5} value={minCarriers} onChange={(v) => setMinCarriers(v ?? 0)} style={{ width: 68 }} /></Space></Tooltip>
          <Tooltip title="Minimum of carrier cells and non-carrier cells (each summed over patients), so a test is not run on 2-3 cells"><Space size={4}><Text type="secondary">Min cells per group</Text><InputNumber size="small" min={0} step={5} value={minGroup} onChange={(v) => setMinGroup(v ?? 0)} style={{ width: 68 }} /></Space></Tooltip>
          <Tooltip title="Clade F1 of the event's carriers on each tested patient's tree (driver tests only; copy-number, clade and DM tests have no single event and are hidden while this is on). Separate from the header Clade F1 filter, which hides events from the event lists.">
            <Space size={4}>
              <Switch size="small" checked={f1On} onChange={setF1On} />
              <Text type="secondary">Clade F1 &gt;=</Text>
              <InputNumber size="small" min={0} max={1} step={0.05} value={f1Min} disabled={!f1On} onChange={(v) => setF1Min(v ?? 0)} style={{ width: 64 }} />
              <Select size="small" disabled={!f1On} value={f1Mode} onChange={setF1Mode} style={{ width: 190 }} options={[{ value: "all", label: "in all patients with the event" }, { value: "atleast", label: "in at least k patients" }]} />
              {f1Mode === "atleast" && <InputNumber size="small" min={1} max={20} disabled={!f1On} value={f1K} onChange={(v) => setF1K(v ?? 1)} style={{ width: 52 }} />}
            </Space>
          </Tooltip>
          {headerF1 && headerF1.min !== f1Min && <Button size="small" type="link" onClick={() => setF1Min(headerF1.min)}>{`use header value (${headerF1.min})`}</Button>}
          {filtersActive && <Text type="secondary">{`${rows.length} of ${allRows.length} tests shown`}</Text>}
          {(minCarriers !== 0 || minGroup !== 0 || f1On) && <Button size="small" type="link" onClick={resetFilters}>clear filters</Button>}
        </Space>
        {shared.length > 0 && <Alert type="info" showIcon style={{ marginBottom: 8 }} message={`Shared by most driver tests: ${shared.slice(0, 4).map((x) => `${x.pretty} ${x.direction}`).join(", ")} (${shared[0].n} of ${shared[0].of}). Carriers of different drivers share clades, so read these as a tumour-wide / clade effect, not per-driver biology; they are left out of the per-test sentences.`} />}
        {data.tumour_filter && <Text type="secondary" style={{ display: "block", marginBottom: 6, fontSize: 12 }}>{`Malignant tumour cells only. Dropped per patient (non-malignant or DNA Normal): ${Object.entries(data.tumour_filter).map(([p, v]) => `${p} ${v.cells_with_covariates - v.kept}`).join(", ")}.`}</Text>}
        <Table size="small" rowKey="id" dataSource={rows} columns={columns} pagination={{ pageSize: 10, showSizeChanger: false }} scroll={{ x: true }}
          onRow={(r) => ({ onClick: () => setSelectedId(r.id), style: { cursor: "pointer", background: selected?.id === r.id ? "rgba(22,119,255,0.08)" : undefined } })} />
        <HintLine text={`Each test is run inside every patient (Wilcoxon, stratified by plate x cycling so that region and S-phase copy-number inflation are not read as biology) and the signed z scores are combined across patients (Stouffer; Fisher shown too). Robust gene = q < ${Q_CUT}, |log2FC| >= ${LFC_CUT}, 2+ patients, same direction in every patient. Cells are not independent samples, so p values are optimistic; concordance across patients is the safer evidence. Created ${data.created || ""}.`} />
      </Card>
      {selected && (
        <ScErrorBoundary resetKey={selected.id} title="Covariate DE view failed">
          <Card size="small" title={selected.label} extra={<Text type="secondary">{`${selected.cells.a} ${selected.group_a} vs ${selected.cells.b} ${selected.group_b} cells`}</Text>}>
            <Text>{describeTest(selected, { shared })}</Text>
            {!selected.combinable && <Alert type="warning" showIcon style={{ marginTop: 6 }} message="One patient only, so this cannot be called a cross-patient finding." />}
            {loose.length > 0 && <Alert type="info" showIcon style={{ marginTop: 6 }} message={`Less adjustment in ${loose.map((p) => `${p} (${ADJUST_NAME[selected.patients.find((x) => x.patient === p)?.adjust] || "?"})`).join(", ")}: the groups sit on different plates, so plate and group cannot be separated there (library quality is still controlled where listed).`} />}
            {selected.id === "clade:top" && <CladeTopExplainer test={selected} summaries={summaries} />}
            {selected.sensitivity && <Alert type="warning" showIcon style={{ marginTop: 6 }} message="Sensitivity row: the first, unrestricted version of the highest-burden clade test (any patient, 5+ cells per side, burden 0 allowed). Kept for comparison with the hardened test; do not read it as a finding." description={<SensitivityDetail test={selected} reference={(data?.tests || []).find((t) => t.id === "clade:top")} />} />}
            {selected.self_gene && <Text type="secondary" style={{ display: "block", marginTop: 4 }}>{`${selected.self_gene.gene} itself: log2FC ${selected.self_gene.avg_log2FC.toFixed(2)}, q ${formatQ(selected.self_gene.q_val)} (dosage positive control).`}</Text>}
            <Row gutter={[16, 12]} style={{ marginTop: 8 }}>
              <Col xs={24} xl={12}>
                <VolcanoPlot genes={volcano} labels={labels} qCut={Q_CUT} lfcCut={LFC_CUT} selectedGene={selectedGenes[selectedGenes.length - 1] || null} onGene={onVolcanoGene} />
                <Text type="secondary" style={{ fontSize: 12 }}>{`Top ${volcano.length} genes by combined p are drawn; fold change is the mean over patients.`}</Text>
              </Col>
              <Col xs={24} xl={12}>
                <Space wrap size={[8, 6]} style={{ marginBottom: 6 }}>
                  <Select
                    mode="multiple" size="small" showSearch allowClear maxTagCount={4} style={{ minWidth: 260, maxWidth: 420 }} placeholder="search and select genes"
                    value={selectedGenes} onChange={(v) => { setSelectedGenes(v.slice(0, MAX_GENES)); setGeneNote(null); }}
                    options={[...pool.values()].map((g) => ({ value: g, label: g }))} filterOption={(input, o) => `${o.value}`.toUpperCase().includes(input.toUpperCase())}
                  />
                  <Space.Compact size="small">
                    <Button size="small" onClick={() => addGenes(topGenes(selected, topN, "up"))}>{`+ top ${topN} up`}</Button>
                    <Button size="small" onClick={() => addGenes(topGenes(selected, topN, "down"))}>{`+ top ${topN} down`}</Button>
                    <InputNumber size="small" min={1} max={MAX_GENES} value={topN} onChange={(v) => setTopN(v || 10)} style={{ width: 56 }} />
                  </Space.Compact>
                  {selectedGenes.length > 0 && <Button size="small" type="link" onClick={() => { setSelectedGenes([]); setGeneNote(null); }}>clear</Button>}
                </Space>
                {geneNote && <Alert type="warning" showIcon style={{ marginBottom: 6 }} message={geneNote} />}
                <Table size="small" rowKey="gene" dataSource={selected.genes} columns={geneColumns} pagination={{ pageSize: 10, showSizeChanger: false }} scroll={{ x: true }}
                  rowSelection={{ selectedRowKeys: selectedGenes, preserveSelectedRowKeys: true, onChange: (keys) => setSelectedGenes((cur) => { const onPage = new Set(selected.genes.map((g) => g.gene)); return [...cur.filter((g) => !onPage.has(g) || keys.includes(g)), ...keys.filter((k) => !cur.includes(k))].slice(0, MAX_GENES); }) }}
                  onRow={(r) => ({ style: { background: selectedGenes.includes(r.gene) ? "rgba(250,84,28,0.08)" : undefined } })} />
              </Col>
              {selectedGene && (
                <Col xs={24}>
                  {/* same gene card as the patient RNA DE panel: description, cancer roles, links */}
                  <GeneInfoCard gene={selectedGene} row={selected.genes.find((g) => g.gene === selectedGene)} labels={{ A: selected.group_a, B: selected.group_b }} />
                </Col>
              )}
              {selectedGenes.length > 1 && (
                <Col xs={24}>
                  <ScErrorBoundary resetKey={`${selected.id}|${selectedGenes.join(",")}`} title="Multi-gene view failed">
                    <CovariateDeMulti dataset={dataset} test={selected} genes={selectedGenes} summaries={summaries} datasets={datasets} onGene={onGene} onRemove={(g) => setSelectedGenes((cur) => toggleGene(cur, g))} />
                  </ScErrorBoundary>
                </Col>
              )}
              {selectedGene && (
                <Col xs={24}>
                  <CovariateDeViolins dataset={dataset} test={selected} gene={selectedGene} summaries={summaries} datasets={datasets} />
                </Col>
              )}
            </Row>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginTop: 12 }}>
              <EnrichmentList title={`Programs higher in ${selected.group_a}`} items={selected.enrichment?.up || []} />
              <EnrichmentList title={`Programs lower in ${selected.group_a}`} items={selected.enrichment?.down || []} />
            </div>
            <Table size="small" style={{ marginTop: 12 }} rowKey="patient" pagination={false} dataSource={selected.patients}
              columns={[{ title: "Patient", dataIndex: "patient" }, { title: "Cells A", dataIndex: "n_a", align: "right" }, { title: "Cells B", dataIndex: "n_b", align: "right" }, { title: "Strata", dataIndex: "n_strata", align: "right" }, { title: "Adjusted for", dataIndex: "adjust", render: (v) => ADJUST_NAME[v] || v }]} />
          </Card>
        </ScErrorBoundary>
      )}
      {(data.caveats || []).length > 0 && (
        <Card size="small" title="Caveats"><ul style={{ margin: 0, paddingLeft: 18 }}>{data.caveats.map((c) => <li key={c}><Text type="secondary">{c}</Text></li>)}</ul></Card>
      )}
    </Space>
  );
}

/** Clade F1 of a driver test's carriers: median over patients with a chip, and how many reach `min`; per-patient values in the tooltip. */
function F1Cell({ f1, min, loading }) {
  if (!f1) return <Tooltip title="No single event behind this test (copy number, clade or DM), so no clade F1"><Text type="secondary">–</Text></Tooltip>;
  if (!f1.summary) return <Tooltip title={loading ? "patient trees still loading" : "no tested patient has carriers on a tree"}><Text type="secondary">{loading ? "…" : "n/a"}</Text></Tooltip>;
  const per = f1.perPatient.map((x) => `${x.patient} ${x.f1.toFixed(2)}`).join(", ");
  return (
    <Space size={4}>
      <CladeF1Chip value={f1.summary.median} prefix="" tip={`Median over ${f1.summary.n} patient(s): ${per}`} />
      <Text type="secondary" style={{ fontSize: 11 }}>{`${nF1AtLeast(f1, min)}/${f1.summary.n} >= ${min}`}</Text>
    </Space>
  );
}

/** Names the patients that make the unrestricted burden-clade test unreliable, and the gene sets only it reports, from the data. */
function SensitivityDetail({ test, reference }) {
  const { noBurden, small } = sensitivityProblems(test);
  const only = sensitivityOnlyTerms(test, reference);
  if (!noBurden.length && !small.length && !only.length) return null;
  return (
    <>
      {noBurden.length > 0 && <div>{`No SNV-based burden in ${noBurden.join(", ")}: their "highest-burden" clade was not chosen by burden, yet they still count in the combined score.`}</div>}
      {small.length > 0 && <div>{`Fewer than 15 cells on a side: ${small.join(", ")}.`}</div>}
      {only.length > 0 && <div>{`Not in the hardened test, so not supported: ${only.map((o) => `${o.term} (${o.direction})`).join(", ")}.`}</div>}
    </>
  );
}
