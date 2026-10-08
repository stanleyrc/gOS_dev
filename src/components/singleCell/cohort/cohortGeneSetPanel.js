import React, { useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Button, Card, Col, Input, Row, Segmented, Select, Space, Tag, Typography } from "antd";
import { FunctionOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import SvgExportButton from "../svgExportButton";
import { loadRnaMatrix } from "../../../redux/singleCell/loaders";
import { geneValues } from "../../../helpers/singleCell/staticRna";
import { GENE_SETS, dotStats, geneSetScores, parseGeneList } from "../../../helpers/singleCell/geneSets";
import { annotationColors } from "../../../helpers/singleCell/matrix";
import { themePalette } from "../../../helpers/singleCell/themes";
import { compareGroups, formatP } from "../../../helpers/singleCell/tests";
import { BoxStrips, Swatches, patientColor } from "./charts";

const { Text } = Typography;

/** Expression of a gene over a patient's cells, from the (cached) matrix; null when the gene is absent. */
const valuesFor = (matrix, summary, gene) => {
  const gi = summary.geneIndex.get(gene) ?? summary.geneIndex.get(gene.toUpperCase());
  return gi == null ? null : geneValues(matrix, summary.cells.length, gi);
};

/**
 * Program scores and marker dot plot across patients. Score: mean z-score of
 * the set's genes within each patient (so patient batch does not dominate),
 * shown per patient and per level of the grouping field, and lifted to the
 * cohort UMAP through `onScores`. Dot plot: fraction of cells expressing and
 * mean expression of the genes per level, pooled or split by patient.
 */
export default function CohortGeneSetPanel({ summaries, datasets, rna, loaded, cellsOf, field, sharedMarkers, onScores }) {
  const { t } = useTranslation("common");
  const theme = useSelector((s) => s.SingleCell.layout.theme);
  const [ref, width] = useContainerWidth(1000);
  const [view, setView] = useState("score");
  const [preset, setPreset] = useState(Object.keys(GENE_SETS)[0]);
  const [text, setText] = useState(GENE_SETS[Object.keys(GENE_SETS)[0]].join(", "));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [dots, setDots] = useState(null);
  const [split, setSplit] = useState(false);
  const datasetOf = (s) => datasets.find((d) => `${d.id}` === `${s.record.datasetId}`);
  const genes = useMemo(() => parseGeneList(text), [text]);

  const run = async () => {
    setBusy(true);
    const out = [];
    for (const s of loaded) {
      const ds = datasetOf(s);
      const summary = rna[s.caseReportId].summary;
      if (!ds) continue;
      try {
        // eslint-disable-next-line no-await-in-loop
        const matrix = await loadRnaMatrix(ds, s.caseReportId);
        const { scores, used, missing } = geneSetScores(genes, summary.cells.length, (g) => valuesFor(matrix, summary, g));
        const keep = cellsOf(s).map((c) => summary.cells.indexOf(c));
        out.push({ patient: s.caseReportId, k: summaries.indexOf(s), used, missing, cells: keep.map((i) => ({ rna_id: summary.cells[i].rna_id, level: field ? `${summary.cells[i][field] ?? "NA"}` : null, score: scores[i] })) });
      } catch (error) {
        // matrix missing: skip the patient
      }
    }
    setResult({ genes, out });
    if (onScores) onScores({ label: preset && GENE_SETS[preset]?.join(", ") === text ? preset : t("components.single-cell.cohort.gs-custom"), values: new Map(out.flatMap((p) => p.cells.map((c) => [`${p.patient}::${c.rna_id}`, c.score]))) });
    setBusy(false);
  };

  const runDots = async () => {
    setBusy(true);
    const top = (sharedMarkers || []).flatMap((lv) => lv.genes.filter((g) => g.n >= 2).slice(0, 6).map((g) => g.gene));
    const list = [...new Set(top.length ? top : genes)].slice(0, 40);
    const rows = new Map(); // gene -> Map(column -> {fraction, mean, n})
    const columns = new Set();
    for (const s of loaded) {
      const ds = datasetOf(s);
      const summary = rna[s.caseReportId].summary;
      if (!ds || !field) continue;
      try {
        // eslint-disable-next-line no-await-in-loop
        const matrix = await loadRnaMatrix(ds, s.caseReportId);
        const keep = cellsOf(s).map((c) => summary.cells.indexOf(c));
        const byLevel = d3.group(keep, (i) => `${summary.cells[i][field] ?? "NA"}`);
        list.forEach((g) => {
          const v = valuesFor(matrix, summary, g);
          if (!v) return;
          if (!rows.has(g)) rows.set(g, new Map());
          const m = rows.get(g);
          [...byLevel.entries()].forEach(([level, idx]) => {
            const [st] = dotStats(v, [idx]);
            const col = `${level}||${s.caseReportId}`;
            columns.add(col);
            m.set(col, st);
          });
        });
      } catch (error) {
        // matrix missing: skip the patient
      }
    }
    setDots({ genes: list.filter((g) => rows.has(g)), rows, columns: [...columns] });
    setBusy(false);
  };

  const levels = useMemo(() => (result ? [...new Set(result.out.flatMap((p) => p.cells.map((c) => c.level)).filter((l) => l != null))].sort() : []), [result]);
  const levelColors = annotationColors(levels, themePalette(theme));
  const w = Math.max(400, width - 16);

  // dot plot geometry: columns pooled per level (cells weighted) or per level × patient
  const dotCols = useMemo(() => {
    if (!dots) return [];
    const lv = [...new Set(dots.columns.map((c) => c.split("||")[0]))].sort();
    if (split) return lv.flatMap((l) => summaries.map((s) => ({ key: `${l}||${s.caseReportId}`, level: l, patient: s.caseReportId, k: summaries.indexOf(s) })).filter((c) => dots.columns.includes(c.key)));
    return lv.map((l) => ({ key: l, level: l, patient: null }));
  }, [dots, split, summaries]);
  const dotCell = (gene, col) => {
    const m = dots.rows.get(gene);
    if (!m) return null;
    if (col.patient) return m.get(col.key) || null;
    const parts = [...m.entries()].filter(([k]) => k.startsWith(`${col.level}||`)).map(([, v]) => v);
    const n = d3.sum(parts, (p) => p.n);
    return n ? { n, fraction: d3.sum(parts, (p) => p.fraction * p.n) / n, mean: d3.sum(parts, (p) => p.mean * p.n) / n } : null;
  };

  return (
    <Card
      size="small"
      title={<Space><FunctionOutlined />{t("components.single-cell.cohort.gs-title")}</Space>}
      extra={
        <Space wrap>
          <Segmented size="small" value={view} onChange={setView} options={[{ value: "score", label: t("components.single-cell.cohort.gs-view-score") }, { value: "dots", label: t("components.single-cell.cohort.gs-view-dots") }]} />
          <SvgExportButton containerRef={ref} name={`cohort-${view === "score" ? "program-scores" : "dot-plot"}`} />
        </Space>
      }
    >
      <div ref={ref}>
        {view === "score" && (
          <Row gutter={[12, 12]}>
            <Col xs={24} lg={8}>
              <Space direction="vertical" style={{ width: "100%" }}>
                <Select size="small" style={{ width: "100%" }} value={preset} onChange={(v) => { setPreset(v); setText(GENE_SETS[v].join(", ")); }} options={Object.keys(GENE_SETS).map((k) => ({ value: k, label: k }))} />
                <Input.TextArea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("components.single-cell.cohort.gs-placeholder")} />
                <Space>
                  <Button size="small" type="primary" loading={busy} disabled={!genes.length || !loaded.length} onClick={run}>{t("components.single-cell.cohort.gs-run", { count: genes.length })}</Button>
                  {result && <Text type="secondary">{t("components.single-cell.cohort.gs-used", { used: d3.max(result.out, (p) => p.used.length) || 0, total: result.genes.length })}</Text>}
                </Space>
                {result && result.out.some((p) => p.missing.length) && (
                  <div>{[...new Set(result.out.flatMap((p) => p.missing))].slice(0, 12).map((g) => <Tag key={g} style={{ marginBottom: 2 }}>{g}</Tag>)}<Text type="secondary" style={{ fontSize: 12 }}> {t("components.single-cell.cohort.gs-missing")}</Text></div>
                )}
              </Space>
            </Col>
            <Col xs={24} lg={16}>
              {result ? (
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <BoxStrips groups={result.out.map((p) => ({ key: p.patient, label: p.patient, color: patientColor(p.k), values: p.cells.map((c) => c.score), ids: p.cells.map((c) => c.rna_id) }))} width={Math.max(260, Math.floor((w * 16) / 24 / 2) - 12)} height={260} yTitle={t("components.single-cell.cohort.gs-score")} />
                  {levels.length > 1 && (
                    <BoxStrips groups={levels.map((l) => ({ key: l, label: l, color: levelColors[l], values: result.out.flatMap((p) => p.cells.filter((c) => c.level === l).map((c) => c.score)), ids: result.out.flatMap((p) => p.cells.filter((c) => c.level === l).map((c) => c.rna_id)) }))} width={Math.max(260, Math.floor((w * 16) / 24 / 2) - 12)} height={260} yTitle={`${t("components.single-cell.cohort.gs-score")} · ${field}`} />
                  )}
                  {levels.length > 1 && (() => { const test = compareGroups(levels.map((l) => ({ key: l, values: result.out.flatMap((p) => p.cells.filter((c) => c.level === l).map((c) => c.score)) }))); return <Text type="secondary" style={{ fontSize: 12, width: "100%" }}>{`${test.test || ""} ${formatP(test.p)}`}</Text>; })()}
                </div>
              ) : (
                <Text type="secondary">{t("components.single-cell.cohort.gs-intro")}</Text>
              )}
            </Col>
            <Col span={24}><Text type="secondary" style={{ fontSize: 12 }}>{t("components.single-cell.cohort.gs-help")}</Text></Col>
          </Row>
        )}
        {view === "dots" && (
          <div>
            <Space wrap style={{ marginBottom: 8 }}>
              <Button size="small" type="primary" loading={busy} disabled={!loaded.length || !field} onClick={runDots}>{t("components.single-cell.cohort.gs-dots-run", { field })}</Button>
              <Segmented size="small" value={split ? "split" : "pooled"} onChange={(v) => setSplit(v === "split")} options={[{ value: "pooled", label: t("components.single-cell.cohort.gs-pooled") }, { value: "split", label: t("components.single-cell.cohort.gs-split") }]} />
            </Space>
            {dots && dots.genes.length ? (() => {
              const LEFT = 90;
              const TOP = split ? 96 : 70;
              const colW = Math.max(22, Math.min(44, (w - LEFT - 120) / Math.max(1, dotCols.length)));
              const rowH = 18;
              const maxR = Math.min(colW, rowH) / 2 - 1;
              const means = new Map(dots.genes.map((g) => { const vals = dotCols.map((c) => dotCell(g, c)?.mean).filter(Number.isFinite); const m = d3.mean(vals); const sd = Math.sqrt(d3.mean(vals.map((x) => (x - m) ** 2))) || 1; return [g, { m, sd }]; }));
              const color = d3.scaleSequential(d3.interpolateViridis).domain([-2, 2]);
              const h = TOP + dots.genes.length * rowH + 8;
              const lvls = [...new Set(dotCols.map((c) => c.level))];
              const lvlColors = annotationColors(lvls, themePalette(theme));
              return (
                <div style={{ overflowX: "auto" }}>
                  <svg width={Math.max(w, LEFT + dotCols.length * colW + 130)} height={h}>
                    {dotCols.map((c, j) => (
                      <g key={c.key} transform={`translate(${LEFT + (j + 0.5) * colW},${TOP - 8})`}>
                        <rect x={-colW / 2 + 1} y={-TOP + 4} width={colW - 2} height={6} fill={lvlColors[c.level]} />
                        <text transform="rotate(-55)" fontSize={10} fill={c.patient ? patientColor(c.k) : "#262626"} textAnchor="start" dy="0.35em">{c.patient ? `${c.level} · ${c.patient}` : c.level}</text>
                      </g>
                    ))}
                    {dots.genes.map((g, i) => (
                      <g key={g} transform={`translate(0,${TOP + i * rowH + rowH / 2})`}>
                        <text x={LEFT - 6} dy="0.35em" textAnchor="end" fontSize={11} fill="#262626">{g}</text>
                        {dotCols.map((c, j) => {
                          const cell = dotCell(g, c);
                          if (!cell) return null;
                          const z = (cell.mean - means.get(g).m) / means.get(g).sd;
                          return (
                            <circle key={c.key} cx={LEFT + (j + 0.5) * colW} cy={0} r={Math.max(0.8, Math.sqrt(cell.fraction) * maxR)} fill={color(z)}>
                              <title>{`${g} · ${c.patient ? `${c.level} · ${c.patient}` : c.level}: ${d3.format(".0%")(cell.fraction)} of ${cell.n} cells, mean ${cell.mean.toFixed(2)} (z ${z.toFixed(2)})`}</title>
                            </circle>
                          );
                        })}
                      </g>
                    ))}
                    <g transform={`translate(${LEFT + dotCols.length * colW + 20},${TOP})`}>
                      <text fontSize={10} fill="#595959">{t("components.single-cell.cohort.gs-fraction")}</text>
                      {[0.25, 0.5, 1].map((f, k) => (
                        <g key={f} transform={`translate(8,${16 + k * 18})`}>
                          <circle r={Math.sqrt(f) * maxR} fill="#8c8c8c" />
                          <text x={14} dy="0.35em" fontSize={9} fill="#595959">{d3.format(".0%")(f)}</text>
                        </g>
                      ))}
                      <text y={80} fontSize={10} fill="#595959">{t("components.single-cell.cohort.gs-z")}</text>
                      {d3.range(-2, 2.01, 0.5).map((z, k) => <rect key={z} x={k * 10} y={86} width={10} height={8} fill={color(z)} />)}
                      <text y={104} fontSize={9} fill="#595959">−2</text>
                      <text x={80} y={104} fontSize={9} fill="#595959" textAnchor="end">+2</text>
                    </g>
                  </svg>
                  <Swatches items={lvls.map((l) => ({ key: l, color: lvlColors[l], label: l }))} />
                </div>
              );
            })() : (
              <Text type="secondary">{dots ? t("components.single-cell.cohort.gs-dots-empty") : t("components.single-cell.cohort.gs-dots-intro")}</Text>
            )}
            <Text type="secondary" style={{ fontSize: 12, display: "block" }}>{t("components.single-cell.cohort.gs-dots-help")}</Text>
          </div>
        )}
      </div>
    </Card>
  );
}
