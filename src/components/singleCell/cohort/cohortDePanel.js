import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Alert, Button, Card, Col, InputNumber, Progress, Row, Segmented, Select, Space, Table, Tag, Typography } from "antd";
import { AiOutlineDownload } from "react-icons/ai";
import { ExperimentOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import SvgExportButton from "../svgExportButton";
import ScErrorBoundary from "../errorBoundary";
import VolcanoPlot, { COLOR_DOWN, COLOR_UP } from "../rna/volcanoPlot";
import { geneSetIndex, loadGmt, prettyTerm } from "../rna/geneSets";
import { downloadTsv } from "../analysisResultsPanel";
import { loadRnaMatrix } from "../../../redux/singleCell/loaders";
import { geneValues } from "../../../helpers/singleCell/staticRna";
import { benjaminiHochberg, differentialExpression, overRepresentation, pcaAsync, scaledExpression } from "../../../helpers/singleCell/rnaStats";
import { fisherCombined, geneVariances, mergeRnaMatrices, subsetCells } from "../../../helpers/singleCell/rnaMerge";
import { chiSquareUpper, compareGroups, formatP } from "../../../helpers/singleCell/tests";
import { GENE_SETS } from "../../../helpers/singleCell/geneSets";
import { annotationColors } from "../../../helpers/singleCell/matrix";
import { themePalette } from "../../../helpers/singleCell/themes";
import { BoxStrips, Swatches, patientColor } from "./charts";

const { Text } = Typography;
const OTHERS = "__others__";
const MAX_PCA_CELLS = 1500;
const N_VARIABLE = 1000;
const N_PCS = 10;
const fmt = d3.format(".2f");

const emptyGroup = (mode) => ({ mode, patients: [], field: null, levels: [], keys: [] });

/** Cells of each loaded patient with their matrix row index, once. */
const useIndexedCells = (loaded, rna, cellsOf) =>
  useMemo(
    () =>
      loaded.map((s) => {
        const summary = rna[s.caseReportId].summary;
        const rowOf = new Map(summary.cells.map((c, i) => [c.rna_id, i]));
        return { summary: s, patient: s.caseReportId, k: s.caseReportId, rows: cellsOf(s).map((c) => ({ cell: c, row: rowOf.get(c.rna_id) })).filter((x) => x.row != null), summaryData: summary };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loaded, rna, cellsOf]
  );

function GroupEditor({ label, color, group, onChange, patients, fields, levelsOf, umapSelection, count, t, allowOthers }) {
  const modes = [{ value: "rules", label: t("components.single-cell.cohort.de-mode-rules") }, { value: "umap", label: t("components.single-cell.cohort.de-mode-umap") }, ...(allowOthers ? [{ value: OTHERS, label: t("components.single-cell.cohort.de-mode-others") }] : [])];
  return (
    <div style={{ border: `1px solid ${color}`, borderRadius: 6, padding: 8 }}>
      <Space wrap size={[8, 6]} style={{ marginBottom: 6 }}>
        <Tag color={color} style={{ fontWeight: 600 }}>{label}</Tag>
        <Segmented size="small" value={group.mode} onChange={(mode) => onChange({ ...group, mode, keys: mode === "umap" ? [...(umapSelection || [])] : group.keys })} options={modes} />
        <Text type="secondary">{t("components.single-cell.cohort.de-n-cells", { count })}</Text>
      </Space>
      {group.mode === "rules" && (
        <Space wrap size={[8, 6]}>
          <Select size="small" mode="multiple" allowClear placeholder={t("components.single-cell.cohort.de-all-patients")} style={{ minWidth: 180 }} value={group.patients} onChange={(v) => onChange({ ...group, patients: v })} options={patients.map((p) => ({ value: p, label: p }))} maxTagCount="responsive" />
          <Select size="small" allowClear placeholder={t("components.single-cell.cohort.de-any-field")} style={{ width: 150 }} value={group.field} onChange={(f) => onChange({ ...group, field: f || null, levels: [] })} options={fields.map((f) => ({ value: f, label: f }))} />
          {group.field && <Select size="small" mode="multiple" allowClear placeholder={t("components.single-cell.cohort.de-all-levels")} style={{ minWidth: 180 }} value={group.levels} onChange={(v) => onChange({ ...group, levels: v })} options={levelsOf(group.field).map((l) => ({ value: l, label: l }))} maxTagCount="responsive" />}
        </Space>
      )}
      {group.mode === "umap" && (
        <Space wrap>
          <Text type="secondary">{t("components.single-cell.cohort.de-umap-frozen", { count: group.keys.length })}</Text>
          <Button size="small" disabled={!umapSelection?.size} onClick={() => onChange({ ...group, keys: [...umapSelection] })}>{t("components.single-cell.cohort.de-umap-take", { count: umapSelection?.size || 0 })}</Button>
        </Space>
      )}
    </div>
  );
}

/**
 * Differential expression and PCA across patients. Groups A and B are built
 * from rules (patients × a metadata field's levels), from cells boxed on the
 * cohort UMAP, or B = every other cell. Pooled mode merges the patients'
 * matrices and runs one Wilcoxon test per gene; per-patient mode tests
 * inside each patient and combines (Fisher), reporting concordance. PCA runs
 * on the compared cells (or all tumour cells) over the most variable genes.
 */
export default function CohortDePanel({ summaries, datasets, rna, loaded, cellsOf, fields, umapSelection, onGene }) {
  const { t } = useTranslation("common");
  const theme = useSelector((s) => s.SingleCell.layout.theme);
  const [ref, width] = useContainerWidth(1000);
  const indexed = useIndexedCells(loaded, rna, cellsOf);
  const patients = indexed.map((p) => p.patient);
  const levelsOf = (field) => [...new Set(indexed.flatMap((p) => p.rows.map((r) => r.cell[field]).filter((v) => v != null && v !== "")))].map(String).sort();
  const [groupA, setGroupA] = useState(() => ({ ...emptyGroup("rules"), field: fields.includes("state") ? "state" : null }));
  const [groupB, setGroupB] = useState(() => emptyGroup(OTHERS));
  const [deMode, setDeMode] = useState("pooled");
  const [minPct, setMinPct] = useState(0.1);
  const [qCut, setQCut] = useState(0.05);
  const [lfcCut, setLfcCut] = useState(0.5);
  const [busy, setBusy] = useState(null);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [selectedGene, setSelectedGene] = useState(null);
  const [selectedGenes, setSelectedGenes] = useState([]);
  const [geneDetail, setGeneDetail] = useState(null);
  const [sets, setSets] = useState([]);
  const [setChoice, setSetChoice] = useState("builtin");
  const [ora, setOra] = useState(null);
  const [pcaState, setPcaState] = useState(null);
  const [pcX, setPcX] = useState(0);
  const [pcY, setPcY] = useState(1);
  const [pcColor, setPcColor] = useState("group");
  const [section, setSection] = useState("de");
  const matrices = useRef(new Map());
  const datasetOf = (s) => datasets.find((d) => `${d.id}` === `${s.record.datasetId}`);
  useEffect(() => {
    geneSetIndex().then((idx) => setSets(Array.isArray(idx) ? idx : [])).catch(() => setSets([]));
  }, []);

  // membership per patient: { patient, idxA, idxB }
  const inGroup = (g, patient, cell) => {
    if (g.mode === "umap") return g.keys.includes(`${patient}::${cell.rna_id}`);
    if (g.mode !== "rules") return false;
    return (!g.patients.length || g.patients.includes(patient)) && (!g.field || !g.levels.length || g.levels.includes(`${cell[g.field]}`));
  };
  const membership = useMemo(() => {
    const keysA = new Set(groupA.mode === "umap" ? groupA.keys : []);
    const keysB = new Set(groupB.mode === "umap" ? groupB.keys : []);
    return indexed.map((p) => {
      const idxA = [];
      const idxB = [];
      p.rows.forEach(({ cell, row }) => {
        const a = groupA.mode === "umap" ? keysA.has(`${p.patient}::${cell.rna_id}`) : inGroup(groupA, p.patient, cell);
        const b = groupB.mode === OTHERS ? !a : groupB.mode === "umap" ? keysB.has(`${p.patient}::${cell.rna_id}`) : inGroup(groupB, p.patient, cell);
        if (a) idxA.push(row);
        else if (b) idxB.push(row);
      });
      return { ...p, idxA, idxB };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indexed, groupA, groupB]);
  const nA = d3.sum(membership, (m) => m.idxA.length);
  const nB = d3.sum(membership, (m) => m.idxB.length);
  const labelOf = (g, name) => {
    if (g.mode === "umap") return `${name} (UMAP)`;
    if (g.mode === OTHERS) return t("components.single-cell.cohort.de-others-label");
    const parts = [g.patients.length ? g.patients.join("+") : null, g.field && g.levels.length ? g.levels.join("/") : g.field ? `${t("components.single-cell.cohort.de-any")} ${g.field}` : null].filter(Boolean);
    return parts.length ? parts.join(" · ") : name;
  };
  const labels = { A: labelOf(groupA, "A"), B: labelOf(groupB, "B") };

  const matrixFor = async (p) => {
    if (!matrices.current.has(p.patient)) matrices.current.set(p.patient, await loadRnaMatrix(datasetOf(p.summary), p.patient));
    return matrices.current.get(p.patient);
  };

  const run = async () => {
    setBusy("de");
    setProgress(0);
    setResult(null);
    setOra(null);
    setSelectedGene(null);
    setSelectedGenes([]);
    try {
      const involved = membership.filter((m) => m.idxA.length || m.idxB.length);
      let rows;
      let perPatient = [];
      if (deMode === "pooled") {
        const entries = [];
        for (const m of involved) {
          // eslint-disable-next-line no-await-in-loop
          const matrix = await matrixFor(m);
          entries.push({ matrix, genes: m.summaryData.genes, nCells: m.summaryData.cells.length, m });
        }
        const merged = mergeRnaMatrices(entries);
        const idxA = entries.flatMap((e, k) => e.m.idxA.map((i) => i + merged.offsets[k]));
        const idxB = entries.flatMap((e, k) => e.m.idxB.map((i) => i + merged.offsets[k]));
        rows = await differentialExpression(merged.matrix, merged.genes, merged.nCells, idxA, idxB, { minPct, onProgress: setProgress });
        perPatient = involved.map((m) => ({ patient: m.patient, nA: m.idxA.length, nB: m.idxB.length }));
      } else {
        const usable = involved.filter((m) => m.idxA.length >= 3 && m.idxB.length >= 3);
        const byGene = new Map();
        for (let k = 0; k < usable.length; k += 1) {
          const m = usable[k];
          // eslint-disable-next-line no-await-in-loop
          const matrix = await matrixFor(m);
          // eslint-disable-next-line no-await-in-loop
          const res = await differentialExpression(matrix, m.summaryData.genes, m.summaryData.cells.length, m.idxA, m.idxB, { minPct, onProgress: (f) => setProgress((k + f) / usable.length) });
          res.forEach((r) => {
            if (!byGene.has(r.gene)) byGene.set(r.gene, []);
            byGene.get(r.gene).push({ patient: m.patient, ...r });
          });
          perPatient.push({ patient: m.patient, nA: m.idxA.length, nB: m.idxB.length });
        }
        const minPatients = Math.min(2, usable.length);
        rows = [...byGene.entries()]
          .filter(([, list]) => list.length >= minPatients)
          .map(([gene, list]) => {
            const lfc = d3.mean(list, (r) => r.avg_log2FC);
            const row = { gene, avg_log2FC: lfc, pct_1: d3.mean(list, (r) => r.pct_1), pct_2: d3.mean(list, (r) => r.pct_2), p_val: fisherCombined(list.map((r) => r.p_val), chiSquareUpper), n_patients: list.length, n_concordant: list.filter((r) => Math.sign(r.avg_log2FC) === Math.sign(lfc)).length, per: Object.fromEntries(list.map((r) => [r.patient, r.avg_log2FC])) };
            return row;
          });
        const q = benjaminiHochberg(rows.map((r) => (Number.isFinite(r.p_val) ? r.p_val : 1)));
        rows.forEach((r, k) => {
          r.q_val = q[k];
          r.p_val_adj = Math.min(1, (Number.isFinite(r.p_val) ? r.p_val : 1) * rows.length);
        });
        rows.sort((a, b) => (a.p_val || 1) - (b.p_val || 1) || Math.abs(b.avg_log2FC) - Math.abs(a.avg_log2FC));
      }
      setResult({ rows, labels, nA, nB, perPatient, mode: deMode });
    } catch (error) {
      setResult({ error: `${error?.message || error}` });
    }
    setBusy(null);
  };

  // gene detail: expression per patient × group
  useEffect(() => {
    let active = true;
    if (!selectedGene || !result) {
      setGeneDetail(null);
      return undefined;
    }
    (async () => {
      const groups = [];
      for (const m of membership) {
        if (!m.idxA.length && !m.idxB.length) continue;
        // eslint-disable-next-line no-await-in-loop
        const matrix = await matrixFor(m);
        const gi = m.summaryData.geneIndex.get(selectedGene) ?? m.summaryData.geneIndex.get(selectedGene.toUpperCase());
        if (gi == null) continue;
        const v = geneValues(matrix, m.summaryData.cells.length, gi);
        if (m.idxA.length) groups.push({ key: `${m.patient} A`, label: `${m.patient} A`, color: COLOR_UP, values: m.idxA.map((i) => v[i]), ids: m.idxA.map((i) => m.summaryData.cells[i].rna_id) });
        if (m.idxB.length) groups.push({ key: `${m.patient} B`, label: `${m.patient} B`, color: COLOR_DOWN, values: m.idxB.map((i) => v[i]), ids: m.idxB.map((i) => m.summaryData.cells[i].rna_id) });
      }
      if (active) setGeneDetail({ gene: selectedGene, groups });
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGene, result]);

  const sig = useMemo(() => (result?.rows || []).filter((r) => r.q_val < qCut && Math.abs(r.avg_log2FC) >= lfcCut), [result, qCut, lfcCut]);
  const runOra = async () => {
    if (!result?.rows) return;
    setBusy("ora");
    try {
      const universe = result.rows.map((r) => r.gene);
      const collection = setChoice === "builtin" ? Object.entries(GENE_SETS).map(([term, genes]) => ({ term, genes })) : await loadGmt(setChoice);
      const up = overRepresentation(sig.filter((r) => r.avg_log2FC > 0).map((r) => r.gene), universe, collection, { minSize: 3 }).slice(0, 12);
      const down = overRepresentation(sig.filter((r) => r.avg_log2FC < 0).map((r) => r.gene), universe, collection, { minSize: 3 }).slice(0, 12);
      setOra({ up, down });
    } catch (error) {
      setOra({ error: `${error?.message || error}` });
    }
    setBusy(null);
  };

  const runPca = async () => {
    setBusy("pca");
    setProgress(0);
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      const useGroups = nA + nB > 0;
      const chosen = membership.flatMap((m) => {
        const rowsOf = useGroups ? [...m.idxA.map((i) => ({ i, g: "A" })), ...m.idxB.map((i) => ({ i, g: "B" }))] : m.rows.map((r) => ({ i: r.row, g: null }));
        return rowsOf.map((r) => ({ ...r, m }));
      });
      const stride = Math.max(1, Math.ceil(chosen.length / MAX_PCA_CELLS));
      const picked = chosen.filter((_, k) => k % stride === 0);
      const involved = [...new Set(picked.map((c) => c.m))];
      const entries = [];
      for (const m of involved) {
        // eslint-disable-next-line no-await-in-loop
        const matrix = await matrixFor(m);
        entries.push({ matrix, genes: m.summaryData.genes, nCells: m.summaryData.cells.length, m });
      }
      const merged = mergeRnaMatrices(entries);
      const offsetOf = new Map(entries.map((e, k) => [e.m, merged.offsets[k]]));
      const cellIdx = picked.map((c) => c.i + offsetOf.get(c.m));
      const sub = subsetCells(merged.matrix, merged.genes.length, cellIdx);
      const variances = geneVariances(sub, merged.genes.length, d3.range(cellIdx.length));
      const geneIdx = d3.range(merged.genes.length).filter((g) => variances[g] > 0 && !/^MT-/.test(merged.genes[g])).sort((a, b) => variances[b] - variances[a]).slice(0, N_VARIABLE);
      const X = scaledExpression(sub, geneIdx, cellIdx.length);
      await new Promise((resolve) => setTimeout(resolve, 0));
      const { scores, values } = await pcaAsync(X, cellIdx.length, geneIdx.length, N_PCS, 120, setProgress);
      let total = 0;
      X.forEach((v) => (total += v * v));
      const loadings = scores.map((sc, p) => {
        const u = sc.map((x) => x / Math.sqrt(values[p] || 1));
        const load = geneIdx.map((g, j) => {
          let s = 0;
          for (let i = 0; i < cellIdx.length; i += 1) s += X[i * geneIdx.length + j] * u[i];
          return { gene: merged.genes[g], value: s };
        });
        load.sort((a, b) => b.value - a.value);
        return { top: load.slice(0, 8), bottom: load.slice(-8).reverse() };
      });
      setPcaState({ cells: picked.map((c) => ({ patient: c.m.patient, k: summaries.indexOf(c.m.summary), group: c.g, cell: c.m.summaryData.cells[c.i] })), scores, explained: values.map((v) => v / (total || 1)), loadings, nGenes: geneIdx.length, useGroups });
    } catch (error) {
      setPcaState({ error: `${error?.message || error}` });
    }
    setBusy(null);
  };

  const download = () => {
    if (!result?.rows) return;
    const cols = ["gene", "avg_log2FC", "pct_1", "pct_2", "p_val", "p_val_adj", "q_val", ...(result.mode === "meta" ? ["n_patients", "n_concordant", ...result.perPatient.map((p) => `log2FC_${p.patient}`)] : [])];
    downloadTsv(`cohort-de-${labels.A}-vs-${labels.B}.tsv`.replace(/[^\w.-]+/g, "_"), cols, result.rows.map((r) => ({ ...r, ...Object.fromEntries(result.perPatient.map((p) => [`log2FC_${p.patient}`, r.per?.[p.patient] ?? ""])) })));
  };

  const columns = [
    { title: t("components.single-cell.results.gene"), dataIndex: "gene", width: 110, render: (g) => <Text strong style={{ cursor: "pointer", color: selectedGene === g ? "#fa541c" : undefined }} onClick={() => { setSelectedGene(g); setSelectedGenes([g]); }}>{g}</Text> },
    { title: "log2FC", dataIndex: "avg_log2FC", width: 90, sorter: (a, b) => a.avg_log2FC - b.avg_log2FC, render: (v) => <span style={{ color: v > 0 ? COLOR_UP : COLOR_DOWN }}>{fmt(v)}</span> },
    { title: "pct A", dataIndex: "pct_1", width: 70, render: (v) => d3.format(".0%")(v) },
    { title: "pct B", dataIndex: "pct_2", width: 70, render: (v) => d3.format(".0%")(v) },
    { title: "p", dataIndex: "p_val", width: 90, sorter: (a, b) => (a.p_val || 1) - (b.p_val || 1), defaultSortOrder: "ascend", render: formatP },
    { title: "q (BH)", dataIndex: "q_val", width: 90, render: formatP },
    ...(result?.mode === "meta"
      ? [
          { title: t("components.single-cell.cohort.de-concordant"), key: "conc", width: 110, sorter: (a, b) => a.n_concordant / a.n_patients - b.n_concordant / b.n_patients, render: (_, r) => <Tag color={r.n_concordant === r.n_patients ? "green" : "default"}>{`${r.n_concordant}/${r.n_patients}`}</Tag> },
          { title: t("components.single-cell.cohort.de-per-patient"), key: "per", render: (_, r) => <Space size={2} wrap>{result.perPatient.map((p, k) => (r.per[p.patient] != null ? <Tag key={p.patient} style={{ margin: 0, borderColor: patientColor(k), color: r.per[p.patient] > 0 ? COLOR_UP : COLOR_DOWN }}>{`${p.patient} ${fmt(r.per[p.patient])}`}</Tag> : null))}</Space> },
        ]
      : []),
  ];

  const w = Math.max(500, width - 16);
  const pcaColors = useMemo(() => {
    if (!pcaState?.cells) return {};
    if (pcColor === "patient") return Object.fromEntries(summaries.map((s, k) => [s.caseReportId, patientColor(k)]));
    if (pcColor === "group") return { A: COLOR_UP, B: COLOR_DOWN };
    const levels = [...new Set(pcaState.cells.map((c) => `${c.cell[pcColor] ?? "NA"}`))].sort();
    return annotationColors(levels, themePalette(theme));
  }, [pcaState, pcColor, summaries, theme]);
  const pcaColorOf = (c) => (pcColor === "patient" ? pcaColors[c.patient] : pcColor === "group" ? pcaColors[c.group] : pcaColors[`${c.cell[pcColor] ?? "NA"}`]) || "#d9d9d9";

  return (
    <Card
      size="small"
      title={<Space><ExperimentOutlined />{t("components.single-cell.cohort.de-title")}</Space>}
      extra={
        <Space>
          <Segmented size="small" value={section} onChange={setSection} options={[{ value: "de", label: t("components.single-cell.cohort.de-section-de") }, { value: "pca", label: t("components.single-cell.cohort.de-section-pca") }]} />
          <SvgExportButton containerRef={ref} name={section === "pca" ? "cohort-pca" : "cohort-de"} />
        </Space>
      }
    >
      <div ref={ref}>
        <Row gutter={[12, 12]}>
          <Col xs={24} xl={12}>
            <GroupEditor label="A" color={COLOR_UP} group={groupA} onChange={setGroupA} patients={patients} fields={fields} levelsOf={levelsOf} umapSelection={umapSelection} count={nA} t={t} allowOthers={false} />
          </Col>
          <Col xs={24} xl={12}>
            <GroupEditor label="B" color={COLOR_DOWN} group={groupB} onChange={setGroupB} patients={patients} fields={fields} levelsOf={levelsOf} umapSelection={umapSelection} count={nB} t={t} allowOthers />
          </Col>
          <Col span={24}>
            <Space wrap>
              {section === "de" && (
                <>
                  <Segmented size="small" value={deMode} onChange={setDeMode} options={[{ value: "pooled", label: t("components.single-cell.cohort.de-pooled") }, { value: "meta", label: t("components.single-cell.cohort.de-meta") }]} />
                  <Text type="secondary">min pct</Text>
                  <InputNumber size="small" min={0} max={1} step={0.05} value={minPct} onChange={(v) => setMinPct(v ?? 0.1)} style={{ width: 70 }} />
                  <Text type="secondary">q &lt;</Text>
                  <InputNumber size="small" min={0.0001} max={1} step={0.01} value={qCut} onChange={(v) => setQCut(v ?? 0.05)} style={{ width: 80 }} />
                  <Text type="secondary">|log2FC| ≥</Text>
                  <InputNumber size="small" min={0} max={5} step={0.1} value={lfcCut} onChange={(v) => setLfcCut(v ?? 0.5)} style={{ width: 70 }} />
                  <Button size="small" type="primary" loading={busy === "de"} disabled={nA < 3 || nB < 3} onClick={run}>{t("components.single-cell.cohort.de-run")}</Button>
                  {result?.rows && <Button size="small" icon={<AiOutlineDownload />} onClick={download}>TSV</Button>}
                  {busy === "de" && <Progress percent={Math.round(100 * progress)} size="small" style={{ width: 160 }} />}
                </>
              )}
              {section === "pca" && (
                <>
                  <Button size="small" type="primary" loading={busy === "pca"} disabled={!loaded.length} onClick={runPca}>{nA + nB > 0 ? t("components.single-cell.cohort.de-pca-groups") : t("components.single-cell.cohort.de-pca-all")}</Button>
                  {busy === "pca" && <Progress percent={Math.round(100 * progress)} size="small" style={{ width: 160 }} />}
                </>
              )}
            </Space>
            <div><Text type="secondary" style={{ fontSize: 12 }}>{section === "de" ? t("components.single-cell.cohort.de-help") : t("components.single-cell.cohort.de-pca-help")}</Text></div>
          </Col>
          {section === "de" && result?.error && <Col span={24}><Alert type="error" showIcon message={result.error} /></Col>}
          {section === "de" && result?.rows && (
            <ScErrorBoundary resetKey={`${qCut}-${lfcCut}-${selectedGene}`} title="DE view failed">
              <Col span={24}>
                <Space wrap size={[6, 4]}>
                  <Text strong>{t("components.single-cell.cohort.de-summary", { tested: result.rows.length, up: sig.filter((r) => r.avg_log2FC > 0).length, down: sig.filter((r) => r.avg_log2FC < 0).length, nA: result.nA, nB: result.nB })}</Text>
                  {result.perPatient.map((p, k) => <Tag key={p.patient} style={{ borderColor: patientColor(k) }}>{`${p.patient}: ${p.nA} vs ${p.nB}`}</Tag>)}
                </Space>
              </Col>
              <Col xs={24} xl={14}>
                <VolcanoPlot genes={result.rows} labels={result.labels} qCut={qCut} lfcCut={lfcCut} selectedGene={selectedGene} selectedGenes={selectedGenes} onGene={setSelectedGene} onSelectGenes={setSelectedGenes} />
              </Col>
              <Col xs={24} xl={10}>
                {geneDetail ? (
                  <div>
                    <Space wrap style={{ marginBottom: 4 }}>
                      <Text strong>{geneDetail.gene}</Text>
                      {onGene && <Button size="small" onClick={() => onGene(geneDetail.gene)}>{t("components.single-cell.cohort.de-open-gene")}</Button>}
                      {(() => { const test = compareGroups(geneDetail.groups.map((g) => ({ key: g.key, values: g.values }))); return <Text type="secondary">{`${test?.test || ""} ${formatP(test?.p)}`}</Text>; })()}
                    </Space>
                    <BoxStrips groups={geneDetail.groups} width={Math.max(300, Math.floor((w * 10) / 24) - 16)} height={300} yTitle={t("components.single-cell.cohort.de-expression")} />
                  </div>
                ) : (
                  <Text type="secondary">{t("components.single-cell.cohort.de-pick-gene")}</Text>
                )}
                <div style={{ marginTop: 12 }}>
                  <Space wrap>
                    <Select size="small" style={{ width: 220 }} value={setChoice} onChange={setSetChoice} options={[{ value: "builtin", label: t("components.single-cell.cohort.de-builtin-sets") }, ...sets.map((s) => ({ value: s.file, label: s.label || s.name || s.file }))]} />
                    <Button size="small" loading={busy === "ora"} disabled={!sig.length} onClick={runOra}>{t("components.single-cell.cohort.de-enrich")}</Button>
                  </Space>
                  {ora?.error && <Alert type="error" showIcon message={ora.error} style={{ marginTop: 6 }} />}
                  {ora && !ora.error && (
                    <Row gutter={8} style={{ marginTop: 6 }}>
                      {[["up", COLOR_UP, labels.A], ["down", COLOR_DOWN, labels.B]].map(([key, color, lab]) => (
                        <Col span={12} key={key}>
                          <Text style={{ color, fontWeight: 600 }}>{t("components.single-cell.cohort.de-higher-in", { label: lab })}</Text>
                          {ora[key].length ? ora[key].slice(0, 8).map((r) => (
                            <div key={r.term} style={{ fontSize: 12 }} title={r.genes.join(", ")}>
                              <span style={{ color: r.q_val < 0.05 ? color : undefined }}>{prettyTerm(r.term)}</span> <Text type="secondary">{`${r.overlap}/${r.size} · ${formatP(r.q_val)}`}</Text>
                            </div>
                          )) : <div><Text type="secondary" style={{ fontSize: 12 }}>–</Text></div>}
                        </Col>
                      ))}
                    </Row>
                  )}
                </div>
              </Col>
              <Col span={24}>
                <Table size="small" className="sc-events-table" rowKey="gene" columns={columns} dataSource={result.rows.filter((r) => r.q_val < qCut || selectedGenes.includes(r.gene))} pagination={{ pageSize: 10, size: "small" }} rowClassName={(r) => (selectedGenes.includes(r.gene) ? "sc-row-picked" : "")} />
              </Col>
            </ScErrorBoundary>
          )}
          {section === "pca" && !pcaState && <Col span={24}><Text type="secondary">{t("components.single-cell.cohort.de-pca-intro")}</Text></Col>}
          {section === "pca" && pcaState?.error && <Col span={24}><Alert type="error" showIcon message={pcaState.error} /></Col>}
          {section === "pca" && pcaState?.scores && (
            <Col span={24}>
              <ScErrorBoundary resetKey={`${pcX}-${pcY}-${pcColor}-${pcaState.cells.length}`} title="PCA view failed">
              <Card size="small" type="inner" title={t("components.single-cell.cohort.de-pca-title", { cells: pcaState.cells.length, genes: pcaState.nGenes })}>
                <Space wrap style={{ marginBottom: 6 }}>
                  <Text type="secondary">x</Text>
                  <Select size="small" value={pcX} onChange={setPcX} style={{ width: 90 }} options={pcaState.scores.map((_, i) => ({ value: i, label: `PC${i + 1}` }))} />
                  <Text type="secondary">y</Text>
                  <Select size="small" value={pcY} onChange={setPcY} style={{ width: 90 }} options={pcaState.scores.map((_, i) => ({ value: i, label: `PC${i + 1}` }))} />
                  <Text type="secondary">{t("components.single-cell.cohort.de-color")}</Text>
                  <Select size="small" value={pcColor} onChange={setPcColor} style={{ width: 150 }} options={[...(pcaState.useGroups ? [{ value: "group", label: "A / B" }] : []), { value: "patient", label: t("components.single-cell.cohort.patient") }, ...fields.map((f) => ({ value: f, label: f }))]} />
                </Space>
                <Row gutter={[12, 12]}>
                  <Col xs={24} xl={12}>
                    {(() => {
                      const sx = pcaState.scores[pcX];
                      const sy = pcaState.scores[pcY];
                      const pw = Math.max(320, Math.floor(w / 2) - 16);
                      const ph = 360;
                      const x = d3.scaleLinear().domain(d3.extent(sx)).nice().range([44, pw - 12]);
                      const y = d3.scaleLinear().domain(d3.extent(sy)).nice().range([ph - 36, 12]);
                      return (
                        <svg width={pw} height={ph}>
                          <line x1={44} x2={pw - 12} y1={y(0)} y2={y(0)} stroke="#e8e8e8" />
                          <line x1={x(0)} x2={x(0)} y1={12} y2={ph - 36} stroke="#e8e8e8" />
                          {pcaState.cells.map((c, i) => (
                            <circle key={i} cx={x(sx[i])} cy={y(sy[i])} r={2.8} fill={pcaColorOf(c)} fillOpacity={0.8}>
                              <title>{`${c.patient} · ${c.cell.rna_id}${c.group ? ` · ${c.group}` : ""}${c.cell.state ? ` · ${c.cell.state}` : ""}`}</title>
                            </circle>
                          ))}
                          <text x={(44 + pw - 12) / 2} y={ph - 10} textAnchor="middle" fontSize={11} fill="#595959">{`PC${pcX + 1} (${d3.format(".1%")(pcaState.explained[pcX])})`}</text>
                          <text transform={`translate(14 ${ph / 2}) rotate(-90)`} textAnchor="middle" fontSize={11} fill="#595959">{`PC${pcY + 1} (${d3.format(".1%")(pcaState.explained[pcY])})`}</text>
                        </svg>
                      );
                    })()}
                    <Swatches items={Object.entries(pcaColors).map(([k, c]) => ({ key: k, color: c, label: pcColor === "group" ? (k === "A" ? `A: ${labels.A}` : `B: ${labels.B}`) : k }))} />
                  </Col>
                  <Col xs={24} xl={12}>
                    <svg width={Math.max(320, Math.floor(w / 2) - 16)} height={90}>
                      {pcaState.explained.map((e, i) => {
                        const bw = (Math.max(320, Math.floor(w / 2) - 16) - 40) / pcaState.explained.length;
                        const max = d3.max(pcaState.explained) || 1;
                        return (
                          <g key={i} transform={`translate(${30 + i * bw},0)`} style={{ cursor: "pointer" }} onClick={() => { setPcX(i); setPcY(i === 0 ? 1 : 0); }}>
                            <rect x={2} y={70 - (e / max) * 60} width={bw - 4} height={(e / max) * 60} fill={i === pcX || i === pcY ? "#1677ff" : "#bfbfbf"} />
                            <text x={bw / 2} y={82} textAnchor="middle" fontSize={9} fill="#595959">{`PC${i + 1}`}</text>
                            <title>{`PC${i + 1}: ${d3.format(".1%")(e)} of variance`}</title>
                          </g>
                        );
                      })}
                    </svg>
                    <Row gutter={8}>
                      {[pcX, pcY].map((p) => (
                        <Col span={12} key={p}>
                          <Text strong>{`PC${p + 1} ${t("components.single-cell.cohort.de-loadings")}`}</Text>
                          <div style={{ fontSize: 12 }}>
                            <div>{pcaState.loadings[p].top.map((g) => <Tag key={g.gene} color="volcano" style={{ margin: 1, cursor: "pointer" }} onClick={() => onGene && onGene(g.gene)}>{g.gene}</Tag>)}</div>
                            <div>{pcaState.loadings[p].bottom.map((g) => <Tag key={g.gene} color="geekblue" style={{ margin: 1, cursor: "pointer" }} onClick={() => onGene && onGene(g.gene)}>{g.gene}</Tag>)}</div>
                          </div>
                        </Col>
                      ))}
                    </Row>
                    {pcaState.useGroups && (() => {
                      const groups = ["A", "B"].map((g) => ({ key: g, label: g === "A" ? labels.A : labels.B, color: g === "A" ? COLOR_UP : COLOR_DOWN, values: pcaState.cells.map((c, i) => (c.group === g ? pcaState.scores[pcX][i] : NaN)).filter(Number.isFinite), ids: [] }));
                      const test = compareGroups(groups.map((g) => ({ key: g.key, values: g.values })));
                      return <div style={{ marginTop: 8 }}><Text type="secondary" style={{ fontSize: 12 }}>{`PC${pcX + 1} A vs B: ${test?.test || ""} ${formatP(test?.p)}`}</Text><BoxStrips groups={groups} width={Math.max(320, Math.floor(w / 2) - 16)} height={160} yTitle={`PC${pcX + 1}`} /></div>;
                    })()}
                  </Col>
                </Row>
                <Text type="secondary" style={{ fontSize: 12 }}>{t("components.single-cell.cohort.de-pca-help")}</Text>
              </Card>
              </ScErrorBoundary>
            </Col>
          )}
        </Row>
      </div>
    </Card>
  );
}
