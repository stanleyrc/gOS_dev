import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Button, Card, Col, Empty, InputNumber, Progress, Row, Select, Space, Table, Tag, Typography } from "antd";
import { TagsOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import SvgExportButton from "../svgExportButton";
import scaActions from "../../../redux/scAnalysis/actions";
import { casePath, tryGet } from "../../../redux/singleCell/loaders";
import { differentialExpression } from "../../../helpers/singleCell/rnaStats";
import { geneValues } from "../../../helpers/singleCell/staticRna";
import { annotationColors } from "../../../helpers/singleCell/matrix";
import { themePalette } from "../../../helpers/singleCell/themes";

const { Text } = Typography;
const fmtP = (p) => (p == null ? "" : p < 1e-3 ? Number(p).toExponential(1) : Number(p).toFixed(3));

/** Dot plot: genes (rows) x groups (columns), dot size = % expressing, colour = mean scaled expression. */
function DotPlot({ genes, groups, summary, matrix, width }) {
  const cell = 24;
  const left = 110;
  const top = 90;
  const data = useMemo(() => {
    const out = [];
    genes.forEach((gene, gi) => {
      const g = summary.geneIndex.get(gene);
      const v = g == null ? null : geneValues(matrix, summary.cells.length, g);
      const means = groups.map((grp) => {
        if (!v || !grp.rows.length) return { mean: 0, pct: 0 };
        let sum = 0;
        let nz = 0;
        grp.rows.forEach((r) => {
          sum += v[r];
          if (v[r] > 0) nz += 1;
        });
        return { mean: sum / grp.rows.length, pct: nz / grp.rows.length };
      });
      const mx = d3.max(means, (m) => m.mean) || 1;
      means.forEach((m, k) => out.push({ gi, k, pct: m.pct, scaled: m.mean / mx, mean: m.mean }));
    });
    return out;
  }, [genes, groups, summary, matrix]);
  const w = Math.min(width, left + groups.length * Math.max(cell, 60) + 20);
  const colW = (w - left - 20) / Math.max(1, groups.length);
  const color = d3.scaleSequential(d3.interpolateViridis).domain([0, 1]);
  return (
    <svg width={w} height={top + genes.length * cell + 8}>
      {groups.map((grp, k) => (
        <g key={grp.key} transform={`translate(${left + (k + 0.5) * colW},${top - 10})`}>
          <rect x={-colW / 2 + 2} y={-top + 12} width={colW - 4} height={6} fill={grp.color} />
          <text textAnchor="end" fontSize={11} fill="#262626" transform="rotate(-45)">{grp.label.length > 16 ? `${grp.label.slice(0, 15)}…` : grp.label}</text>
        </g>
      ))}
      {genes.map((gene, gi) => (
        <text key={gene} x={left - 8} y={top + gi * cell + cell / 2} dy="0.35em" textAnchor="end" fontSize={11} fill="#262626">{gene}</text>
      ))}
      {data.map((d) => (
        <circle key={`${d.gi}-${d.k}`} cx={left + (d.k + 0.5) * colW} cy={top + d.gi * cell + cell / 2} r={2 + 8 * Math.sqrt(d.pct)} fill={color(d.scaled)} stroke="#fff" strokeWidth={0.5}>
          <title>{`${genes[d.gi]} · ${groups[d.k].label}: ${Math.round(100 * d.pct)}% expressing, mean ${d.mean.toFixed(2)}`}</title>
        </circle>
      ))}
    </svg>
  );
}

/**
 * Marker genes per group (clone, cell state, cluster, …): the pipeline's
 * Seurat FindAllMarkers when rna/markers.json exists, otherwise each group
 * vs the rest computed here (Wilcoxon, BH). Shown as a dot plot plus tables.
 */
export default function MarkersCard({ summary, matrix }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const { cells, cloneColors, layout, patient } = useSelector((s) => s.SingleCell);
  const dataset = useSelector((s) => s.Settings.dataset);
  const [ref, width] = useContainerWidth(1000);
  const [backend, setBackend] = useState(null);
  const [field, setField] = useState(null);
  const [topN, setTopN] = useState(6);
  const [computed, setComputed] = useState({});
  const [progress, setProgress] = useState(null);
  const cloneOf = useMemo(() => new Map(cells.map((c) => [c.cell_id, c.clone_id])), [cells]);

  useEffect(() => {
    if (!dataset || !patient) return undefined;
    let active = true;
    tryGet(casePath(dataset, patient.caseReportId, "rna/markers.json")).then((r) => active && setBackend(r.status === "ok" ? r.data : null));
    return () => {
      active = false;
    };
  }, [dataset, patient]);

  const fields = useMemo(() => {
    const cat = (summary?.fields || []).filter((f) => !f.numeric).map((f) => f.name);
    return ["clone", ...cat];
  }, [summary]);
  const chosen = field || (fields.includes("state") ? "state" : backend?.fields ? Object.keys(backend.fields).find((f) => fields.includes(f)) || "clone" : "clone");
  const groups = useMemo(() => {
    if (!summary) return [];
    const valueOf = (c) => (chosen === "clone" ? (c.cell_id ? cloneOf.get(c.cell_id) : null) : c[chosen]);
    const by = new Map();
    summary.cells.forEach((c, k) => {
      const v = valueOf(c);
      if (v == null || v === "" || /^normal$/i.test(`${v}`)) return;
      if (!by.has(`${v}`)) by.set(`${v}`, []);
      by.get(`${v}`).push(k);
    });
    const keys = [...by.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const colors = chosen === "clone" ? cloneColors : annotationColors(keys, themePalette(layout.theme));
    return keys.filter((k) => by.get(k).length >= 5).map((k) => ({ key: k, label: k, rows: by.get(k), color: colors[k] || "#8c8c8c" }));
  }, [summary, chosen, cloneOf, cloneColors, layout.theme]);

  // backend markers exist for Seurat metadata columns (state, Clone_Annotation, seurat_clusters); DNA clones are computed here
  const backendField = backend?.fields?.[chosen] || null;
  const markers = useMemo(() => {
    if (backendField) {
      const byGroup = {};
      backendField.forEach((g) => (byGroup[g.group] = g.genes.map((x) => ({ gene: x.gene, log2FC: x.avg_log2FC, pct1: x.pct_1, pct2: x.pct_2, padj: x.p_val_adj }))));
      return { source: "backend", byGroup };
    }
    return computed[chosen] ? { source: "browser", byGroup: computed[chosen] } : null;
  }, [backendField, computed, chosen]);

  const compute = async () => {
    if (!matrix || !groups.length) return;
    setProgress(0);
    const byGroup = {};
    for (let i = 0; i < groups.length; i += 1) {
      const g = groups[i];
      const rest = groups.filter((x) => x !== g).flatMap((x) => x.rows);
      // eslint-disable-next-line no-await-in-loop
      const res = await differentialExpression(matrix, summary.genes, summary.cells.length, g.rows, rest, { minPct: 0.1 });
      const rows = (res?.genes || res || []).filter((r) => (r.avg_log2FC ?? r.log2FC) > 0.25).sort((a, b) => (a.p_val_adj ?? a.padj ?? 1) - (b.p_val_adj ?? b.padj ?? 1) || (b.avg_log2FC ?? b.log2FC) - (a.avg_log2FC ?? a.log2FC));
      byGroup[g.key] = rows.slice(0, 25).map((r) => ({ gene: r.gene, log2FC: r.avg_log2FC ?? r.log2FC, pct1: r.pct_1 ?? r.pct1, pct2: r.pct_2 ?? r.pct2, padj: r.p_val_adj ?? r.padj }));
      setProgress(Math.round((100 * (i + 1)) / groups.length));
    }
    setComputed((cur) => ({ ...cur, [chosen]: byGroup }));
    setProgress(null);
  };

  if (!summary) return null;
  const genes = markers ? [...new Set(groups.flatMap((g) => (markers.byGroup[g.key] || []).slice(0, topN).map((m) => m.gene)))] : [];
  const columns = [
    { title: t("components.single-cell.results.gene"), dataIndex: "gene", render: (g) => <Button type="link" size="small" style={{ padding: 0 }} onClick={() => dispatch(scaActions.fetchExpression(g))}>{g}</Button> },
    { title: "log2FC", dataIndex: "log2FC", render: (v) => (Number.isFinite(v) ? v.toFixed(2) : "–") },
    { title: "% in", dataIndex: "pct1", render: (v) => (Number.isFinite(v) ? `${Math.round(100 * v)}%` : "–") },
    { title: "% out", dataIndex: "pct2", render: (v) => (Number.isFinite(v) ? `${Math.round(100 * v)}%` : "–") },
    { title: "p adj", dataIndex: "padj", render: (v) => fmtP(v) },
  ];

  return (
    <Card
      size="small"
      title={<Space><TagsOutlined />{t("components.single-cell.rna.markers-title")}</Space>}
      extra={
        <Space wrap>
          <Select size="small" style={{ width: 170 }} value={chosen} onChange={setField} options={fields.map((f) => ({ value: f, label: f === "clone" ? t("components.single-cell.umap.color-clone") : f }))} />
          <Text type="secondary">{t("components.single-cell.rna.markers-top")}</Text>
          <InputNumber size="small" min={2} max={20} value={topN} onChange={(v) => setTopN(v || 6)} style={{ width: 60 }} />
          {!backendField && (
            <Button size="small" type="primary" onClick={compute} loading={progress != null} disabled={!matrix || groups.length < 2}>
              {t("components.single-cell.rna.markers-compute", { count: groups.length })}
            </Button>
          )}
          <SvgExportButton containerRef={ref} name={`markers-${chosen}`} />
        </Space>
      }
    >
      <div ref={ref}>
        {progress != null && <Progress percent={progress} size="small" />}
        {!markers ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.rna.markers-empty")} />
        ) : (
          <Row gutter={[16, 12]}>
            <Col xs={24} xl={10}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {markers.source === "backend" ? t("components.single-cell.rna.markers-backend", { method: backend?.method || "Seurat" }) : t("components.single-cell.rna.markers-browser")}
              </Text>
              <DotPlot genes={genes} groups={groups} summary={summary} matrix={matrix} width={Math.max(320, width * 0.4)} />
            </Col>
            <Col xs={24} xl={14}>
              <Row gutter={[12, 12]}>
                {groups.map((g) => (
                  <Col key={g.key} xs={24} xl={12}>
                    <Space size={6} style={{ marginBottom: 4 }}>
                      <Tag color={g.color}>{g.label}</Tag>
                      <Text type="secondary">{t("components.single-cell.rna.n-cells", { count: g.rows.length })}</Text>
                    </Space>
                    <Table size="small" rowKey="gene" columns={columns} dataSource={(markers.byGroup[g.key] || []).slice(0, topN)} pagination={false} />
                  </Col>
                ))}
              </Row>
            </Col>
          </Row>
        )}
      </div>
    </Card>
  );
}
