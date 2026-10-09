import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Alert, Button, Card, Empty, Progress, Segmented, Space, Table, Tag, Typography } from "antd";
import { AiOutlineDownload } from "react-icons/ai";
import VolcanoPlot from "../rna/volcanoPlot";
import HintLine from "../hintLine";
import { downloadTsv } from "../analysisResultsPanel";
import { geneLocus, cnAtPosition } from "../../../helpers/singleCell/dosage";
import { classifyDeRow, plateOf, stratifiedDE } from "../../../helpers/singleCell/driverContrast";
import { resolveChromosome } from "../../../helpers/singleCell/matrix";

const { Text } = Typography;
const Q_CUT = 0.1;
const LFC_CUT = 0.5;
const CLASS_COLOR = { locus: "purple", cn: "gold", trans: "blue" };

/** Global ranges of a driver: fusion partner coordinates, else its genome location. */
export function driverLoci(event, chromoBins) {
  const text = event.fusion_gene_coords || event.Genome_Location || `${event.seqnames}:${event.start}-${event.end}`;
  return `${text}`
    .split(",")
    .map((s) => s.trim().replace(/[+-]$/, ""))
    .map((s) => s.match(/^(?:chr)?([^:]+):(\d+)-(\d+)$/))
    .filter(Boolean)
    .map(([, c, a, b]) => {
      const key = resolveChromosome(c, chromoBins);
      return key ? { start: chromoBins[key].startPlace + Number(a), end: chromoBins[key].startPlace + Number(b) } : null;
    })
    .filter(Boolean);
}

/**
 * Carriers vs comparator expression, tested within plates (a plate holding only
 * one group cannot drive the result) and combined across plates. Each gene is
 * labelled: near the driver (locus), explained by its own copy-number difference
 * (cn), or neither (trans: a candidate downstream effect of the driver).
 */
export default function DriverExpressionCard({ driver, carriers, others, rna }) {
  const { t } = useTranslation("common");
  const genesState = useSelector((s) => s.Genes);
  const { chromoBins } = useSelector((s) => s.Settings);
  const cn = useSelector((s) => s.SingleCell.cn);
  const { summary, matrix, rowsFor } = rna;
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(null);
  const [filter, setFilter] = useState("all");
  const [gene, setGene] = useState(null);

  const rowsA = useMemo(() => (summary ? rowsFor(carriers) : []), [summary, carriers]); // eslint-disable-line react-hooks/exhaustive-deps
  const rowsB = useMemo(() => (summary ? rowsFor(others) : []), [summary, others]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!summary || !matrix || rowsA.length < 3 || rowsB.length < 3) {
      setResult(null);
      return undefined;
    }
    let cancelled = false;
    setProgress(0);
    const stratumOfRow = (r) => plateOf(summary.cells[r]?.cell_id || summary.cells[r]?.displayId);
    stratifiedDE(matrix, summary.genes, summary.cells.length, rowsA, rowsB, stratumOfRow, {
      onProgress: (f) => !cancelled && setProgress(Math.round(f * 100)),
    }).then((r) => {
      if (cancelled) return;
      setProgress(null);
      setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [summary, matrix, rowsA, rowsB]);

  // locus / copy-number / trans label for the genes worth showing
  const loci = useMemo(() => driverLoci(driver.event, chromoBins), [driver, chromoBins]);
  const cnData = cn.status === "ok" ? cn.data : null;
  const rows = useMemo(() => {
    if (!result) return [];
    const shown = result.rows.filter((r, k) => k < 400 || r.q_val < Q_CUT);
    const mean = (m, ids) => {
      const v = ids.map((id) => m.get(id)).filter(Number.isFinite);
      return v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN;
    };
    return shown.map((r) => {
      const locus = geneLocus(genesState, r.gene);
      let cnDiff = NaN;
      if (locus && cnData) {
        const at = cnAtPosition(cnData, locus.mid);
        cnDiff = mean(at, carriers) - mean(at, others);
      }
      return { ...r, cnDiff, cls: classifyDeRow(r, locus, loci, cnDiff) };
    });
  }, [result, genesState, cnData, carriers, others, loci]);
  const visible = rows.filter((r) => filter === "all" || r.cls === filter);
  const counts = {};
  rows.forEach((r) => {
    if (r.q_val < Q_CUT) counts[r.cls] = (counts[r.cls] || 0) + 1;
  });
  const labels = { A: t("components.single-cell.drivers.carriers"), B: t("components.single-cell.drivers.comparator") };
  const pctFmt = (x) => `${Math.round(x * 100)}%`;

  if (!summary) return <Card size="small" title={t("components.single-cell.drivers.expr-title")}><Empty description={t("components.single-cell.rna.no-rna")} /></Card>;
  return (
    <Card
      size="small"
      title={t("components.single-cell.drivers.expr-title")}
      extra={
        result && (
          <Button
            size="small"
            type="text"
            icon={<AiOutlineDownload />}
            onClick={() => downloadTsv(`${driver.label.replace(/[^A-Za-z0-9_.-]+/g, "_")}_carriers_vs_comparator.tsv`, ["gene", "cls", "avg_log2FC", "pct_1", "pct_2", "z", "p_val", "q_val", "cnDiff"], rows)}
          >
            TSV
          </Button>
        )
      }
    >
      <Space direction="vertical" size={8} style={{ width: "100%" }}>
        <HintLine text={t("components.single-cell.drivers.expr-hint")} />
        {(rowsA.length < 3 || rowsB.length < 3) && <Alert type="info" showIcon message={t("components.single-cell.drivers.too-few-rna", { a: rowsA.length, b: rowsB.length })} />}
        {progress != null && <Progress percent={progress} size="small" />}
        {result && (
          <>
            {result.pooled ? (
              <Alert type="warning" showIcon message={t("components.single-cell.drivers.pooled")} />
            ) : (
              <Text type="secondary">
                {t("components.single-cell.drivers.strata", {
                  strata: result.strata.map((s) => `${s.key} (${s.nA} vs ${s.nB})`).join(", "),
                  a: result.strata.reduce((s, x) => s + x.nA, 0),
                  b: result.strata.reduce((s, x) => s + x.nB, 0),
                })}
              </Text>
            )}
            {!result.pooled && Math.min(result.strata.reduce((s, x) => s + x.nA, 0), result.strata.reduce((s, x) => s + x.nB, 0)) < 10 && (
              <Alert type="info" showIcon message={t("components.single-cell.drivers.small-strata")} />
            )}
            <VolcanoPlot genes={result.rows} labels={labels} qCut={Q_CUT} lfcCut={LFC_CUT} selectedGene={gene} onGene={setGene} />
            <Space wrap>
              <Segmented
                size="small"
                value={filter}
                onChange={setFilter}
                options={["all", "trans", "locus", "cn"].map((k) => ({
                  value: k,
                  label: k === "all" ? t("components.single-cell.drivers.cls-all") : `${t(`components.single-cell.drivers.cls-${k}`)} (${counts[k] || 0})`,
                }))}
              />
              <Text type="secondary">{t("components.single-cell.drivers.cls-hint", { q: Q_CUT })}</Text>
            </Space>
            <Table
              size="small"
              rowKey="gene"
              dataSource={visible}
              pagination={{ pageSize: 12, size: "small", showSizeChanger: false }}
              onRow={(r) => ({ onClick: () => setGene(r.gene), style: { cursor: "pointer" } })}
              rowClassName={(r) => (r.gene === gene ? "ant-table-row-selected" : "")}
              columns={[
                { title: t("components.single-cell.drivers.gene"), dataIndex: "gene", key: "gene", render: (g) => <Text strong>{g}</Text> },
                { title: "", dataIndex: "cls", key: "cls", render: (c) => <Tag color={CLASS_COLOR[c]}>{t(`components.single-cell.drivers.cls-${c}`)}</Tag> },
                { title: "log2 FC", dataIndex: "avg_log2FC", key: "fc", align: "right", render: (v) => v.toFixed(2) },
                { title: `% ${labels.A}`, dataIndex: "pct_1", key: "p1", align: "right", render: pctFmt },
                { title: `% ${labels.B}`, dataIndex: "pct_2", key: "p2", align: "right", render: pctFmt },
                { title: "Δ CN", dataIndex: "cnDiff", key: "cn", align: "right", render: (v) => (Number.isFinite(v) ? `${v > 0 ? "+" : ""}${v.toFixed(1)}` : "–") },
                { title: "q", dataIndex: "q_val", key: "q", align: "right", render: (v) => (v < 1e-3 ? v.toExponential(1) : v.toFixed(3)) },
              ]}
            />
          </>
        )}
      </Space>
    </Card>
  );
}
