import React, { useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Button, Card, Progress, Select, Space, Typography } from "antd";
import { HeatMapOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import SvgExportButton from "../svgExportButton";
import { loadRnaMatrix } from "../../../redux/singleCell/loaders";
import { geneLocus, spearman } from "../../../helpers/singleCell/dosage";
import { geneValues } from "../../../helpers/singleCell/staticRna";
import { binAt } from "../../../helpers/singleCell/matrix";
import { correlationP } from "../../../helpers/singleCell/tests";
import { eventClass } from "../../../helpers/singleCell/cohortStats";
import { isStrongEvent } from "../../../helpers/singleCell/strongEvents";

const { Text } = Typography;
const CELL = 30;
const LEFT = 110;
const TOP = 70;

/**
 * Copy number vs expression per gene and patient: Spearman rho between the
 * CN at the gene's locus (each cell's genome graph) and its expression, for
 * the chosen genes (default: the cohort's amplified / deleted drivers). One
 * heatmap cell per gene x patient; dot = significant.
 */
export default function CohortDosagePanel({ summaries, files, rna, cnRows, datasets }) {
  const { t } = useTranslation("common");
  const genesState = useSelector((s) => s.Genes);
  const [ref, width] = useContainerWidth(900);
  const [picked, setPicked] = useState(null);
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(null);
  const driverGenes = useMemo(() => {
    const counts = new Map();
    summaries.forEach((s) =>
      (files[s.caseReportId]?.events || [])
        .filter((e) => Number(e.Tier ?? 9) <= 2 && isStrongEvent(e) && ["amp", "homdel"].includes(eventClass(e)))
        .forEach((e) => {
          const g = `${e.gene}`.split("::")[0];
          counts.set(g, (counts.get(g) || 0) + 1);
        })
    );
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g);
  }, [summaries, files]);
  const allGenes = useMemo(() => [...new Set(summaries.flatMap((s) => rna[s.caseReportId]?.summary?.genes || []))], [summaries, rna]);
  const genes = picked ?? [...new Set([...driverGenes, "EGFR", "CDK4", "MDM2", "PDGFRA", "CDKN2A", "PTEN", "MET"])].slice(0, 14);
  const patients = summaries.filter((s) => rna[s.caseReportId]?.summary && cnRows[s.caseReportId]?.cellRows?.length);

  const run = async () => {
    setProgress(0);
    const out = {};
    for (let i = 0; i < patients.length; i += 1) {
      const s = patients[i];
      const ds = datasets.find((d) => `${d.id}` === `${s.record.datasetId}`);
      const summary = rna[s.caseReportId].summary;
      const rows = cnRows[s.caseReportId].cellRows;
      if (!ds) continue;
      try {
        // eslint-disable-next-line no-await-in-loop
        const matrix = await loadRnaMatrix(ds, s.caseReportId);
        const rnaRow = new Map();
        summary.cells.forEach((c, k) => c.cell_id && rnaRow.set(c.cell_id, k));
        const pairs = rows.map((r) => ({ row: r.row, k: rnaRow.get(r.cellId) })).filter((p) => p.k != null && p.row);
        genes.forEach((gene) => {
          const locus = geneLocus(genesState, gene);
          const gi = summary.geneIndex.get(gene) ?? summary.geneIndex.get(gene.toUpperCase());
          if (!locus || gi == null || pairs.length < 8) return;
          const expr = geneValues(matrix, summary.cells.length, gi);
          const x = [];
          const y = [];
          pairs.forEach((p) => {
            const b = binAt(p.row.binIndex, locus.mid);
            if (b >= 0 && Number.isFinite(p.row.values[b])) {
              x.push(p.row.values[b]);
              y.push(expr[p.k]);
            }
          });
          if (x.length < 8) return;
          const rho = spearman(x, y);
          out[`${gene}|${s.caseReportId}`] = { rho, p: correlationP(rho, x.length), n: x.length, meanCn: d3.mean(x) };
        });
      } catch (error) {
        // matrix missing for this patient
      }
      setProgress(Math.round((100 * (i + 1)) / patients.length));
    }
    setResult(out);
    setProgress(null);
  };

  const color = d3.scaleDiverging(d3.interpolateRdBu).domain([1, 0, -1]);
  const w = LEFT + patients.length * Math.max(CELL, 70) + 20;
  const colW = (w - LEFT - 20) / Math.max(1, patients.length);
  const h = TOP + genes.length * CELL + 8;

  return (
    <Card
      size="small"
      title={<Space><HeatMapOutlined />{t("components.single-cell.cohort.dosage-title")}</Space>}
      extra={
        <Space wrap>
          <Select size="small" mode="multiple" showSearch maxTagCount="responsive" style={{ minWidth: 320, maxWidth: 560 }} value={genes} onChange={setPicked} options={[...new Set([...genes, ...allGenes])].slice(0, 5000).map((g) => ({ value: g, label: g }))} filterOption={(input, o) => o.value.toUpperCase().startsWith(input.toUpperCase())} />
          <Button size="small" type="primary" onClick={run} loading={progress != null} disabled={!patients.length}>{t("components.single-cell.cohort.dosage-run", { count: patients.length })}</Button>
          <SvgExportButton containerRef={ref} name="cohort-dosage" />
        </Space>
      }
    >
      <div ref={ref}>
        {progress != null && <Progress percent={progress} size="small" style={{ width: 240 }} />}
        {!result ? (
          <Text type="secondary">{t("components.single-cell.cohort.dosage-intro")}</Text>
        ) : (
          <>
            <svg width={Math.min(width, w)} height={h}>
              {patients.map((s, j) => (
                <text key={s.caseReportId} x={LEFT + (j + 0.5) * colW} y={TOP - 10} textAnchor="end" fontSize={12} fontWeight={600} fill="#262626" transform={`rotate(-40 ${LEFT + (j + 0.5) * colW} ${TOP - 10})`}>{s.caseReportId}</text>
              ))}
              {genes.map((gene, i) => (
                <g key={gene}>
                  <text x={LEFT - 8} y={TOP + i * CELL + CELL / 2} dy="0.35em" textAnchor="end" fontSize={12} fill="#262626">{gene}</text>
                  {patients.map((s, j) => {
                    const r = result[`${gene}|${s.caseReportId}`];
                    const x = LEFT + j * colW;
                    return (
                      <g key={s.caseReportId}>
                        <rect x={x + 1} y={TOP + i * CELL + 1} width={colW - 2} height={CELL - 2} fill={r ? color(r.rho) : "#f5f5f5"} rx={3} />
                        {r && <text x={x + colW / 2} y={TOP + i * CELL + CELL / 2} dy="0.35em" textAnchor="middle" fontSize={11} fill={Math.abs(r.rho) > 0.5 ? "#fff" : "#262626"}>{r.rho.toFixed(2)}{r.p < 0.01 ? "*" : ""}</text>}
                        <title>{r ? `${gene} · ${s.caseReportId}: Spearman ρ ${r.rho.toFixed(2)}, p ${r.p < 1e-4 ? "< 1e-4" : r.p.toFixed(3)}, n ${r.n}, mean CN ${r.meanCn.toFixed(1)}` : `${gene} · ${s.caseReportId}: not enough linked cells`}</title>
                      </g>
                    );
                  })}
                </g>
              ))}
            </svg>
            <Text type="secondary" style={{ fontSize: 12 }}>{t("components.single-cell.cohort.dosage-help")}</Text>
          </>
        )}
      </div>
    </Card>
  );
}
