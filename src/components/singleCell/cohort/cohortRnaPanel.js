import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { AutoComplete, Button, Card, Col, Empty, Progress, Row, Select, Space, Table, Tag, Typography } from "antd";
import { DotChartOutlined, ExperimentOutlined, PieChartOutlined, TagsOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import SvgExportButton from "../svgExportButton";
import { casePath, loadRnaMatrix, tryGet } from "../../../redux/singleCell/loaders";
import { parseRnaSummary, geneValues } from "../../../helpers/singleCell/staticRna";
import { annotationColors } from "../../../helpers/singleCell/matrix";
import { themePalette } from "../../../helpers/singleCell/themes";
import { chiSquareTable, compareGroups, formatP } from "../../../helpers/singleCell/tests";
import { BoxStrips, FONT, Swatches, XBandLabels, patientColor } from "./charts";
import CohortUmapPanel from "./cohortUmapPanel";
import CohortDosagePanel from "./cohortDosagePanel";
import CohortStateClonePanel from "./cohortStateClonePanel";
import CohortGeneSetPanel from "./cohortGeneSetPanel";
import CohortDePanel from "./cohortDePanel";
import CohortSplicingPanel from "./cohortSplicingPanel";
import HintLine from "../hintLine";
import { SC_GUTTER, SC_GUTTER_INNER } from "../density";

const { Text } = Typography;
const rnaCache = new Map();

async function loadRna(dataset, id) {
  const key = `${dataset.id}/${id}`;
  if (!rnaCache.has(key)) {
    rnaCache.set(
      key,
      Promise.all([tryGet(casePath(dataset, id, "rna/cells.json")), tryGet(casePath(dataset, id, "rna/genes.tsv"), { responseType: "text" }), tryGet(casePath(dataset, id, "rna/markers.json"))]).then(([cells, genes, markers]) => ({
        summary: cells.status === "ok" ? parseRnaSummary(cells.data, genes.status === "ok" ? genes.data : "") : null,
        markers: markers.status === "ok" ? markers.data : null,
      }))
    );
  }
  return rnaCache.get(key);
}


/**
 * RNA across patients: cell-state / phase / region composition per patient
 * (chi-square), RNA QC per patient, markers shared across patients for a
 * cell state, and any gene's expression per patient (matrices loaded on
 * demand).
 */
export default function CohortRnaPanel({ summaries, datasets, cnRows = {}, files: filesProp = {} }) {
  const { t } = useTranslation("common");
  const layout = useSelector((s) => s.SingleCell.layout);
  const [ref, width] = useContainerWidth(1000);
  const [rna, setRna] = useState({});
  const [progress, setProgress] = useState(0);
  const [field, setField] = useState("state");
  const [tumorOnly, setTumorOnly] = useState(true);
  const [gene, setGene] = useState("");
  const [geneQuery, setGeneQuery] = useState("");
  const [geneData, setGeneData] = useState(null);
  const [geneBusy, setGeneBusy] = useState(false);
  const [scores, setScores] = useState(null);
  const [umapSelection, setUmapSelection] = useState(new Set());
  const selectUmap = (keys, add) => setUmapSelection((prev) => (add ? new Set([...prev, ...keys]) : new Set(keys)));
  const datasetOf = (s) => datasets.find((d) => `${d.id}` === `${s.record.datasetId}`);

  useEffect(() => {
    let active = true;
    (async () => {
      const out = {};
      for (let i = 0; i < summaries.length; i += 1) {
        const s = summaries[i];
        const ds = datasetOf(s);
        // eslint-disable-next-line no-await-in-loop
        out[s.caseReportId] = ds ? await loadRna(ds, s.caseReportId).catch(() => null) : null;
        if (!active) return;
        setRna({ ...out });
        setProgress(Math.round((100 * (i + 1)) / Math.max(1, summaries.length)));
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaries.map((s) => s.caseReportId).join("|"), datasets]);

  const loaded = summaries.filter((s) => rna[s.caseReportId]?.summary);
  const cellsOf = (s) => (rna[s.caseReportId]?.summary?.cells || []).filter((c) => !tumorOnly || !c.Cell_Type || /malignant|tumou?r/i.test(`${c.Cell_Type}`));
  const fields = useMemo(() => {
    const names = new Map();
    loaded.forEach((s) => rna[s.caseReportId].summary.fields.filter((f) => !f.numeric).forEach((f) => names.set(f.name, (names.get(f.name) || 0) + 1)));
    return [...names.keys()].filter((n) => !["Cell_Type"].includes(n));
  }, [loaded, rna]);
  const chosenField = fields.includes(field) ? field : fields[0];

  // composition per patient
  const composition = useMemo(() => {
    if (!chosenField) return null;
    const levels = [...new Set(loaded.flatMap((s) => cellsOf(s).map((c) => c[chosenField]).filter((v) => v != null && v !== "")))].map(String).sort();
    const perPatient = loaded.map((s) => {
      const cells = cellsOf(s).filter((c) => c[chosenField] != null && c[chosenField] !== "");
      const counts = Object.fromEntries(levels.map((l) => [l, 0]));
      cells.forEach((c) => (counts[`${c[chosenField]}`] += 1));
      return { patient: s.caseReportId, total: cells.length, counts };
    });
    const p = perPatient.length >= 2 ? chiSquareTable(perPatient.map((r) => levels.map((l) => r.counts[l]))) : NaN;
    return { levels, perPatient, p };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, rna, chosenField, tumorOnly]);

  // shared markers for a state across patients (from rna/markers.json)
  const sharedMarkers = useMemo(() => {
    const byLevel = new Map();
    loaded.forEach((s) => {
      const groups = rna[s.caseReportId]?.markers?.fields?.[chosenField] || [];
      groups.forEach((g) => {
        if (!byLevel.has(g.group)) byLevel.set(g.group, new Map());
        const m = byLevel.get(g.group);
        g.genes.slice(0, 25).forEach((x) => {
          if (!m.has(x.gene)) m.set(x.gene, []);
          m.get(x.gene).push(s.caseReportId);
        });
      });
    });
    return [...byLevel.entries()].map(([level, m]) => ({ level, genes: [...m.entries()].map(([gene, ps]) => ({ gene, n: ps.length, patients: ps })).sort((a, b) => b.n - a.n || a.gene.localeCompare(b.gene)) }));
  }, [loaded, rna, chosenField]);

  // gene across patients: load each matrix on demand
  const allGenes = useMemo(() => [...new Set(loaded.flatMap((s) => rna[s.caseReportId].summary.genes))], [loaded, rna]);
  const runGene = async (g) => {
    const name = `${g || gene}`.trim();
    if (!name) return;
    setGene(name);
    setGeneBusy(true);
    const out = [];
    for (const s of loaded) {
      const ds = datasetOf(s);
      const summary = rna[s.caseReportId].summary;
      const gi = summary.geneIndex.get(name) ?? summary.geneIndex.get(name.toUpperCase());
      if (!ds || gi == null) continue;
      try {
        // eslint-disable-next-line no-await-in-loop
        const matrix = await loadRnaMatrix(ds, s.caseReportId);
        const v = geneValues(matrix, summary.cells.length, gi);
        const keep = cellsOf(s).map((c) => summary.cells.indexOf(c));
        out.push({ patient: s.caseReportId, values: keep.map((k) => v[k]), byLevel: chosenField ? d3.rollup(keep, (idx) => idx.map((k) => v[k]), (k) => `${summary.cells[k][chosenField] ?? "NA"}`) : null });
      } catch (error) {
        // matrix missing: skip the patient
      }
    }
    setGeneData(out);
    setGeneBusy(false);
  };

  if (!loaded.length) return progress < 100 ? <Progress percent={progress} size="small" /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.cohort.rna-empty")} />;
  const levelColors = composition ? annotationColors(composition.levels, themePalette(layout.theme)) : {};
  const qcMetrics = [["nCount_RNA", t("components.single-cell.cohort.rna-counts"), true], ["nFeature_RNA", t("components.single-cell.cohort.rna-genes"), true], ["percent_mt", t("components.single-cell.cohort.rna-mt"), false]].filter(([k]) => loaded.some((s) => cellsOf(s).some((c) => Number.isFinite(Number(c[k])))));
  const qcGroups = (k) => loaded.map((s, i) => ({ key: s.caseReportId, label: s.caseReportId, color: patientColor(i), values: cellsOf(s).map((c) => Number(c[k])), ids: cellsOf(s).map((c) => c.displayId) }));
  const M = { top: 14, right: 12, bottom: 50, left: 44 };
  const compW = Math.max(320, Math.floor((width * 10) / 24) - 28);
  const qcW = Math.max(600, Math.floor((width * 14) / 24) - 28);
  const x = d3.scaleBand().domain(loaded.map((s) => s.caseReportId)).range([M.left, compW - M.right]).padding(0.3);
  const y = d3.scaleLinear().domain([0, 1]).range([240 - M.bottom, M.top]);
  const geneTest = geneData && geneData.length >= 2 ? compareGroups(geneData.map((g) => ({ key: g.patient, values: g.values }))) : null;

  return (
    <div ref={ref}>
      <Row gutter={SC_GUTTER}>
        <Col span={24}>
          <Space wrap>
            {progress < 100 && <Progress percent={progress} size="small" style={{ width: 160 }} />}
            <Text type="secondary">{t("components.single-cell.cohort.rna-field")}</Text>
            <Select size="small" style={{ width: 180 }} value={chosenField} onChange={setField} options={fields.map((f) => ({ value: f, label: f }))} />
            <Select size="small" style={{ width: 170 }} value={tumorOnly ? "tumor" : "all"} onChange={(v) => setTumorOnly(v === "tumor")} options={[{ value: "tumor", label: t("components.single-cell.rna.tumor-only") }, { value: "all", label: t("components.single-cell.cohort.rna-all-cells") }]} />
            <Text type="secondary">{t("components.single-cell.cohort.rna-loaded", { count: loaded.length, cells: d3.sum(loaded, (s) => cellsOf(s).length) })}</Text>
          </Space>
        </Col>
        <Col span={24}>
          <CohortUmapPanel summaries={summaries} datasets={datasets} overlay={scores} selection={umapSelection} onSelect={selectUmap} />
        </Col>
        {composition && (
          <Col xs={24} xl={10}>
            <Card
              size="small"
              title={<Space><PieChartOutlined />{t("components.single-cell.cohort.rna-composition", { field: chosenField })}</Space>}
              extra={
                <Space>
                  {Number.isFinite(composition.p) && (
                    <Text type={composition.p < 0.05 ? "danger" : "secondary"} style={{ fontSize: 12 }}>{`chi-square ${composition.p < 1e-4 ? "p < 1e-4" : `p = ${composition.p.toFixed(3)}`}`}</Text>
                  )}
                  <SvgExportButton containerRef={ref} name="cohort-rna-composition" />
                </Space>
              }
            >
              <svg width={compW} height={240}>
                {y.ticks(5).map((v) => (
                  <g key={v} transform={`translate(0,${y(v)})`}>
                    <line x1={M.left} x2={compW - M.right} stroke="#f0f0f0" />
                    <text x={M.left - 6} dy="0.35em" textAnchor="end" fontSize={FONT.axis} fill="#595959">{d3.format(".0%")(v)}</text>
                  </g>
                ))}
                {composition.perPatient.map((r) => {
                  let acc = 0;
                  return (
                    <g key={r.patient}>
                      {composition.levels.map((l) => {
                        const v = r.total ? r.counts[l] / r.total : 0;
                        const top = y(acc + v);
                        const h = y(acc) - top;
                        acc += v;
                        return <rect key={l} x={x(r.patient)} y={top} width={x.bandwidth()} height={Math.max(0, h)} fill={levelColors[l]} stroke="#fff" strokeWidth={0.5}><title>{`${r.patient} · ${l}: ${r.counts[l]} of ${r.total} (${d3.format(".0%")(v)})`}</title></rect>;
                      })}
                      <text x={x(r.patient) + x.bandwidth() / 2} y={M.top - 2} textAnchor="middle" fontSize={10} fill="#8c8c8c">{`n=${r.total}`}</text>
                    </g>
                  );
                })}
                <XBandLabels scale={x} y={240 - M.bottom + 20} rotate={loaded.length > 6 || x.bandwidth() < 72} />
              </svg>
              <Swatches items={composition.levels.map((l) => ({ key: l, color: levelColors[l], label: l }))} />
            </Card>
          </Col>
        )}
        <Col xs={24} xl={14}>
          <Card size="small" title={<Space><ExperimentOutlined />{t("components.single-cell.cohort.rna-qc")}</Space>}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {qcMetrics.map(([k, label, log]) => (
                <BoxStrips key={k} groups={qcGroups(k)} width={Math.max(220, Math.floor(qcW / qcMetrics.length) - 8)} height={300} yTitle={label} log={log} />
              ))}
            </div>
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card size="small" title={<Space><TagsOutlined />{t("components.single-cell.cohort.rna-markers", { field: chosenField })}</Space>}>
            {sharedMarkers.length ? (
              <Row gutter={SC_GUTTER_INNER}>
                {sharedMarkers.map((lv) => (
                  <Col key={lv.level} xs={24} md={12}>
                    <Text strong>{lv.level}</Text>
                    <div style={{ marginTop: 4 }}>
                      {lv.genes.slice(0, 20).map((g) => (
                        <Tag key={g.gene} color={g.n >= Math.max(2, loaded.length - 1) ? "green" : g.n >= 2 ? "blue" : "default"} style={{ marginBottom: 2, cursor: "pointer" }} onClick={() => runGene(g.gene)} title={g.patients.join(", ")}>
                          {`${g.gene} ${g.n}/${loaded.length}`}
                        </Tag>
                      ))}
                    </div>
                  </Col>
                ))}
              </Row>
            ) : (
              <Text type="secondary">{t("components.single-cell.cohort.rna-markers-empty")}</Text>
            )}
            <HintLine text={t("components.single-cell.cohort.rna-markers-help")} />
          </Card>
        </Col>
        <Col span={24}>
          <CohortDePanel summaries={summaries} datasets={datasets} rna={rna} loaded={loaded} cellsOf={cellsOf} fields={fields} umapSelection={umapSelection} onGene={runGene} />
        </Col>
        <Col span={24}>
          <CohortGeneSetPanel summaries={summaries} datasets={datasets} rna={rna} loaded={loaded} cellsOf={cellsOf} field={chosenField} sharedMarkers={sharedMarkers} onScores={setScores} />
        </Col>
        <Col span={24}>
          <CohortStateClonePanel
            groups={loaded.map((s) => ({ patient: s.caseReportId, color: patientColor(summaries.indexOf(s)), cells: cellsOf(s) }))}
            fields={fields}
            defaultFill={chosenField}
            colorsFor={(levels) => annotationColors(levels, themePalette(layout.theme))}
          />
        </Col>
        <Col span={24}>
          <CohortDosagePanel summaries={summaries} files={filesProp} rna={rna} cnRows={cnRows} datasets={datasets} />
        </Col>
        <Col xs={24} xl={12}>
          <Card
            size="small"
            title={<Space><DotChartOutlined />{t("components.single-cell.cohort.rna-gene")}</Space>}
            extra={
              <Space>
                <AutoComplete size="small" style={{ width: 160 }} value={geneQuery} onChange={setGeneQuery} onSelect={runGene} options={geneQuery.length >= 2 ? allGenes.filter((g) => g.toUpperCase().startsWith(geneQuery.toUpperCase())).slice(0, 20).map((g) => ({ value: g })) : []} placeholder={t("components.single-cell.bars.gene")} onKeyDown={(e) => e.key === "Enter" && runGene(geneQuery)} />
                <Button size="small" type="primary" loading={geneBusy} onClick={() => runGene(geneQuery)}>{t("components.single-cell.cohort.rna-gene-show")}</Button>
              </Space>
            }
          >
            {geneData ? (
              <>
                <Text strong>{gene}</Text> <Text type="secondary">{geneTest ? `${geneTest.test === "kruskal-wallis" ? "Kruskal–Wallis" : "Mann–Whitney"} ${formatP(geneTest.p)}` : ""}</Text>
                <BoxStrips groups={geneData.map((g, i) => ({ key: g.patient, label: g.patient, color: patientColor(i), values: g.values, ids: g.values.map(() => g.patient) }))} width={compW} height={240} yTitle={`${gene} (log-normalized)`} />
                {chosenField && (
                  <Table
                    size="small"
                    pagination={false}
                    rowKey="patient"
                    style={{ marginTop: 8 }}
                    dataSource={geneData.map((g) => ({ patient: g.patient, ...Object.fromEntries([...(g.byLevel || new Map()).entries()].map(([l, v]) => [l, v])) }))}
                    columns={[{ title: t("components.single-cell.cohort.patient"), dataIndex: "patient", width: 100 }, ...(composition?.levels || []).map((l) => ({ title: l, key: l, render: (_, r) => (r[l] ? `${d3.mean(r[l]).toFixed(2)} (${d3.format(".0%")(r[l].filter((v) => v > 0).length / r[l].length)})` : "–") }))]}
                  />
                )}
                <HintLine text={t("components.single-cell.cohort.rna-gene-help")} />
              </>
            ) : (
              <Text type="secondary">{t("components.single-cell.cohort.rna-gene-intro")}</Text>
            )}
          </Card>
        </Col>
        <Col span={24}>
          <CohortSplicingPanel dataset={(summaries[0] && datasetOf(summaries[0])) || datasets[0]} />
        </Col>
      </Row>
    </div>
  );
}
