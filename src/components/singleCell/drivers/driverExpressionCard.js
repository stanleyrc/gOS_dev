import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Alert, Button, Card, Col, Empty, Progress, Row, Segmented, Space, Table, Tag, Typography } from "antd";
import { AiOutlineDownload } from "react-icons/ai";
import VolcanoPlot from "../rna/volcanoPlot";
import HintLine from "../hintLine";
import { downloadTsv } from "../analysisResultsPanel";
import { geneLocus, cnAtPosition } from "../../../helpers/singleCell/dosage";
import { classifyDeRow, plateOf, stratifiedDE } from "../../../helpers/singleCell/driverContrast";
import { resolveChromosome } from "../../../helpers/singleCell/matrix";
import { geneValues } from "../../../helpers/singleCell/staticRna";
import useContainerWidth from "../useContainerWidth";
import usePlotTheme from "../usePlotTheme";
import { TYPE } from "../../../helpers/singleCell/plotTheme";
import { CARRIER_COLOR, COMPARATOR_COLOR } from "./useDriverEvidence";

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

/** Expression of one gene per cell, carriers vs comparator, jittered dots with the median; hover a dot for the cell. */
function GeneDots({ gene, groups, row, labels }) {
  const [ref, width] = useContainerWidth(260);
  const theme = usePlotTheme();
  const [hover, setHover] = useState(null);
  const M = { left: 36, right: 8, top: 22, bottom: 22 };
  const H = 170;
  const plotH = H - M.top - M.bottom;
  const max = Math.max(1e-9, ...groups.flatMap((g) => g.values.map((v) => v.v)));
  const y = (v) => M.top + plotH - (v / max) * plotH;
  const band = (width - M.left - M.right) / groups.length;
  // deterministic jitter so dots do not move between renders
  const jitter = (k) => (((k * 2654435761) % 1000) / 1000 - 0.5) * band * 0.5;
  return (
    <div ref={ref} style={{ width: "100%", position: "relative" }}>
      <svg width={width} height={H} role="img" aria-label={`${gene} expression in carriers and comparator`}>
        <text x={M.left} y={13} fontSize={TYPE.label} fontWeight={600} fill={theme.text}>
          {gene}
        </text>
        {row && (
          <text x={width - M.right} y={13} fontSize={TYPE.tick} fill={theme.muted} textAnchor="end">
            {`log2 FC ${row.avg_log2FC.toFixed(2)} · q ${row.q_val < 1e-3 ? row.q_val.toExponential(1) : row.q_val.toFixed(3)}`}
          </text>
        )}
        <line x1={M.left} x2={width - M.right} y1={y(0)} y2={y(0)} stroke={theme.axis} />
        <text x={M.left - 6} y={y(max) + 4} textAnchor="end" fontSize={TYPE.tick} fill={theme.muted}>
          {max >= 10 ? Math.round(max) : max.toPrecision(2)}
        </text>
        <text x={M.left - 6} y={y(0) + 4} textAnchor="end" fontSize={TYPE.tick} fill={theme.muted}>
          0
        </text>
        {groups.map((g, gi) => {
          const cx = M.left + band * gi + band / 2;
          const sorted = g.values.map((v) => v.v).sort((a, b) => a - b);
          const med = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
          const det = sorted.length ? sorted.filter((v) => v > 0).length / sorted.length : 0;
          return (
            <g key={g.key}>
              {g.values.map((v, k) => (
                <circle
                  key={v.id}
                  cx={cx + jitter(k + 1)}
                  cy={y(v.v)}
                  r={hover?.id === v.id ? 4.5 : 2.6}
                  fill={g.color}
                  fillOpacity={0.75}
                  stroke={hover?.id === v.id ? theme.text : "none"}
                  onMouseEnter={() => setHover({ ...v, group: g.label })}
                  onMouseLeave={() => setHover(null)}
                />
              ))}
              <line x1={cx - band * 0.3} x2={cx + band * 0.3} y1={y(med)} y2={y(med)} stroke={theme.text} strokeWidth={2} />
              <text x={cx} y={H - 6} textAnchor="middle" fontSize={TYPE.tick} fill={theme.textSecondary}>
                {`${g.label} (${g.values.length}, ${Math.round(det * 100)}% > 0)`}
              </text>
            </g>
          );
        })}
      </svg>
      {hover && (
        <div style={{ position: "absolute", left: 8, top: 22, pointerEvents: "none", background: theme.raised, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: 4, padding: "2px 6px", fontSize: TYPE.tick }}>
          {`${hover.id} · ${hover.group} · ${hover.v.toFixed(2)}`}
        </div>
      )}
    </div>
  );
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
  const [picked, setPicked] = useState([]);
  useEffect(() => {
    setGene(null);
    setPicked([]);
  }, [driver.key]);

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
  // per-cell values of the picked genes (the clicked one first, then any shift-picked / lassoed, up to 6)
  const shownGenes = [...new Set([gene, ...picked].filter(Boolean))].slice(0, 6);
  const dots = useMemo(() => {
    if (!summary || !matrix) return [];
    const ids = (rows) => rows.map((r) => ({ r, id: `${summary.cells[r]?.displayId ?? r}` }));
    return shownGenes
      .map((g) => {
        const gi = summary.geneIndex?.get(g) ?? summary.geneIndex?.get(`${g}`.toUpperCase());
        if (gi == null) return null;
        const v = geneValues(matrix, summary.cells.length, gi);
        return {
          gene: g,
          row: rows.find((r) => r.gene === g),
          groups: [
            { key: "a", label: labels.A, color: CARRIER_COLOR, values: ids(rowsA).map(({ r, id }) => ({ id, v: v[r] })) },
            { key: "b", label: labels.B, color: COMPARATOR_COLOR, values: ids(rowsB).map(({ r, id }) => ({ id, v: v[r] })) },
          ],
        };
      })
      .filter(Boolean);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary, matrix, rowsA, rowsB, rows, shownGenes.join("|")]);
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
            <VolcanoPlot genes={result.rows} labels={labels} qCut={Q_CUT} lfcCut={LFC_CUT} selectedGene={gene} selectedGenes={picked} onGene={setGene} onSelectGenes={setPicked} />
            {dots.length > 0 ? (
              <Row gutter={[12, 8]}>
                {dots.map((d) => (
                  <Col key={d.gene} xs={24} md={12} xl={8}>
                    <GeneDots gene={d.gene} groups={d.groups} row={d.row} labels={labels} />
                  </Col>
                ))}
              </Row>
            ) : (
              <Text type="secondary">{t("components.single-cell.drivers.pick-gene")}</Text>
            )}
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
              onRow={(r) => ({
                onClick: (e) => {
                  if (e.shiftKey || e.metaKey || e.ctrlKey) setPicked((prev) => (prev.includes(r.gene) ? prev.filter((g) => g !== r.gene) : [...prev, r.gene]));
                  else {
                    setGene(r.gene);
                    setPicked([r.gene]);
                  }
                },
                style: { cursor: "pointer" },
              })}
              rowClassName={(r) => (r.gene === gene || picked.includes(r.gene) ? "ant-table-row-selected" : "")}
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
