import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, Empty, Input, Space, Table, Typography } from "antd";
import { BranchesOutlined } from "@ant-design/icons";
import HintLine from "../hintLine";
import useContainerWidth from "../useContainerWidth";
import SvgExportButton from "../svgExportButton";
import { PsiHeatmap } from "../rna/sashimiLite";
import SashimiPlot, { TYPE_LABELS } from "../rna/sashimiPlot";
import { tryGet } from "../../../redux/singleCell/loaders";
import { cohortClusterRows, cohortPsiMatrix, filterClusters, junctionLabel } from "../../../helpers/singleCell/splicing";
import { cohortOverview, cohortVariantRows } from "../../../helpers/singleCell/sashimi";
import { junctionColor, psiColor, psiTextColor } from "../../../helpers/singleCell/rnaColors";
import { TYPE } from "../../../helpers/singleCell/plotTheme";

const { Text } = Typography;
const k = "components.single-cell.splicing";
const cache = new Map();

/** data/_cohort/rna/splicing.json of a dataset, fetched once ({ status, data }). */
export function loadCohortSplicing(dataset) {
  const key = `${dataset?.id}/${dataset?.dataPath}`;
  if (!cache.has(key)) {
    const promise = tryGet(`${dataset.dataPath}_cohort/rna/splicing.json`).catch((error) => ({ status: "error", error }));
    cache.set(key, promise);
  }
  return cache.get(key);
}

const fmtQ = (q) => (Number.isFinite(q) ? (q < 1e-3 ? q.toExponential(1) : q.toPrecision(2)) : "–");
const fmtPct = (p) => (Number.isFinite(p) ? `${(p * 100).toFixed(1)}%` : "–");

/**
 * Overview heatmap: the top clusters (rows) × patients (columns), each cell
 * the PSI of the cluster's most between-patient-variable junction; click a
 * row to open the cluster below.
 */
function CohortPsiOverview({ rows, patients, picked, onPick }) {
  const cellW = 54;
  const rowH = 17;
  const labelW = 210;
  const headH = 58;
  const width = labelW + patients.length * cellW + 70;
  const height = headH + rows.length * rowH + 4;
  return (
    <svg width={width} height={height} style={{ display: "block" }} role="img" fontSize={TYPE.tick}>
      {patients.map((p, i) => (
        <text key={p} transform={`translate(${labelW + i * cellW + cellW / 2},${headH - 6}) rotate(-35)`} fontSize={TYPE.label} fill="currentColor">
          {p}
        </text>
      ))}
      <text x={labelW + patients.length * cellW + 8} y={headH - 6} fill="currentColor" opacity={0.65}>
        ΔPSI
      </text>
      {rows.map((r, ri) => {
        const y = headH + ri * rowH;
        const sel = r.id === picked;
        return (
          <g key={r.id} transform={`translate(0,${y})`} style={{ cursor: "pointer" }} onClick={() => onPick(r.id)}>
            <title>{`${r.gene} ${junctionLabel(r.cluster.chromosome, r.junction || {})} (${TYPE_LABELS[r.type] || r.type}), q ${fmtQ(r.q)}`}</title>
            <rect x={0} y={0} width={width} height={rowH} fill={sel ? "rgba(22,119,255,0.12)" : "transparent"} />
            <text x={4} y={rowH / 2} dy="0.35em" fill="currentColor" fontWeight={sel ? 600 : 400}>
              {`${r.gene} · ${TYPE_LABELS[r.type] || r.type}`}
            </text>
            {r.psi.map((p, i) => (
              <g key={patients[i]} transform={`translate(${labelW + i * cellW},0)`}>
                <rect width={cellW - 2} height={rowH - 2} fill={Number.isFinite(p) ? psiColor(p) : "rgba(0,0,0,0.04)"}>
                  <title>{`${patients[i]} · ${r.gene}: PSI ${Number.isFinite(p) ? p.toFixed(2) : "– (few reads)"} (${r.totals[i]} reads in cluster)`}</title>
                </rect>
                {Number.isFinite(p) && (
                  <text x={(cellW - 2) / 2} y={(rowH - 2) / 2} dy="0.35em" textAnchor="middle" fontSize={TYPE.micro} fill={psiTextColor(p)} pointerEvents="none">
                    {p.toFixed(2)}
                  </text>
                )}
              </g>
            ))}
            <text x={labelW + patients.length * cellW + 8} y={rowH / 2} dy="0.35em" fill="currentColor" opacity={0.75}>
              {Number.isFinite(r.max_dpsi) ? r.max_dpsi.toFixed(2) : "–"}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Splicing between patients: known GBM splice variants per patient, an
 * overview heatmap of the clusters that differ most, the full cluster table
 * (chi-square on pooled counts, BH q, from the back end) and the chosen
 * cluster as a sashimi plot with one track per patient plus a junction ×
 * patient PSI heatmap (PSI computed here from the pooled counts).
 */
export default function CohortSplicingPanel({ dataset }) {
  const { t } = useTranslation("common");
  const [ref, width] = useContainerWidth(1000);
  const plotRef = useRef(null);
  const [file, setFile] = useState(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(null);
  useEffect(() => {
    let active = true;
    if (!dataset) return undefined;
    loadCohortSplicing(dataset).then((r) => active && setFile(r));
    return () => {
      active = false;
    };
  }, [dataset]);
  const data = file?.status === "ok" ? file.data : null;
  const allRows = useMemo(() => (data ? cohortClusterRows(data) : []), [data]);
  const rows = useMemo(() => {
    if (!query) return allRows;
    const keep = new Set(filterClusters(allRows.map((r) => r.cluster), query).map((c) => c.id));
    return allRows.filter((r) => keep.has(r.id));
  }, [allRows, query]);
  const overview = useMemo(() => (data ? cohortOverview({ ...data, clusters: rows.map((r) => r.cluster) }, { n: 30 }) : []), [data, rows]);
  const variantRows = useMemo(() => (data ? cohortVariantRows(data).filter((v) => v.rows.some((r) => r.nCells > 0)) : []), [data]);
  useEffect(() => {
    if (rows.length && !rows.some((r) => r.id === picked)) setPicked(overview[0]?.id || rows[0].id);
  }, [rows, picked, overview]);
  const row = rows.find((r) => r.id === picked) || null;
  const matrix = useMemo(() => (row ? cohortPsiMatrix(row.cluster, data?.patients) : null), [row, data]);

  const title = (
    <Space>
      <BranchesOutlined />
      <span>{t(`${k}.cohort-title`)}</span>
      <HintLine inline provenance="cohortSplicing" text={t(`${k}.cohort-help`)} />
    </Space>
  );
  if (!data) {
    return (
      <Card size="small" title={title}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={file ? t(`${k}.cohort-none`) : "…"} />
      </Card>
    );
  }
  const patients = data.patients || [];
  const tracks = matrix
    ? matrix.patients.map((p, i) => ({
        key: p,
        label: p,
        sublabel: `${t(`${k}.cells`, { count: matrix.nCells[i] })} · n=${matrix.totals[i]}`,
        counts: row.cluster.usage[p]?.counts || [],
      }))
    : [];
  return (
    <Card size="small" title={title}>
      <div ref={ref}>
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          {variantRows.length > 0 && (
            <div>
              <Space size={4} style={{ marginBottom: 4 }}>
                <Text strong>{t(`${k}.cohort-variants`)}</Text>
                <HintLine inline text={t(`${k}.cohort-variants-help`)} />
              </Space>
              <Table
                size="small"
                rowKey="id"
                pagination={false}
                scroll={{ x: "max-content" }}
                dataSource={variantRows}
                columns={[
                  { title: t(`${k}.col-variant`), dataIndex: "id", fixed: "left", render: (v, r) => <span title={r.description}>{v}</span> },
                  ...patients.map((p, i) => ({
                    title: p,
                    key: p,
                    align: "right",
                    render: (_, v) => {
                      const u = v.rows[i];
                      if (!u.nCells) return <Text type="secondary">–</Text>;
                      return (
                        <span title={`${u.alt} alt / ${u.ref} ref reads; ${u.nAlt} of ${u.nCells} covered cells with alt`}>
                          {u.nAlt > 0 ? <Text strong>{`${u.nAlt}/${u.nCells}`}</Text> : `0/${u.nCells}`}
                          <Text type="secondary">{` (${fmtPct(u.frac)})`}</Text>
                        </span>
                      );
                    },
                  })),
                ]}
              />
            </div>
          )}
          {overview.length > 0 && (
            <div>
              <Space size={4} style={{ marginBottom: 4 }}>
                <Text strong>{t(`${k}.cohort-overview`)}</Text>
                <HintLine inline text={t(`${k}.cohort-overview-help`)} />
              </Space>
              <div style={{ overflowX: "auto" }}>
                <CohortPsiOverview rows={overview} patients={patients} picked={picked} onPick={setPicked} />
              </div>
            </div>
          )}
          <div>
            <Space wrap style={{ marginBottom: 8 }}>
              <Input.Search size="small" allowClear placeholder={t(`${k}.search-gene`)} style={{ width: 200 }} onSearch={setQuery} onChange={(e) => !e.target.value && setQuery("")} />
              <Text type="secondary">
                {rows.length} / {allRows.length}
              </Text>
            </Space>
            <Table
              size="small"
              rowKey="id"
              dataSource={rows}
              pagination={{ pageSize: 10, size: "small" }}
              rowClassName={(r) => (r.id === picked ? "ant-table-row-selected" : "")}
              onRow={(r) => ({ onClick: () => setPicked(r.id), style: { cursor: "pointer" } })}
              scroll={{ x: "max-content" }}
              columns={[
                { title: t(`${k}.col-gene`), dataIndex: "gene", sorter: (a, b) => a.gene.localeCompare(b.gene) },
                { title: t(`${k}.col-locus`), dataIndex: "locus" },
                {
                  title: t(`${k}.col-types`),
                  key: "types",
                  render: (_, r) =>
                    [...new Set((r.cluster.junctions || []).map((j) => j.type).filter((x) => x && x !== "annotated"))].map((x) => TYPE_LABELS[x] || x).join(", ") || "–",
                },
                { title: t(`${k}.col-junctions`), dataIndex: "nJunctions", align: "right" },
                { title: t(`${k}.col-dpsi`), dataIndex: "max_dpsi", align: "right", render: (v) => (Number.isFinite(v) ? v.toFixed(2) : "–"), sorter: (a, b) => (a.max_dpsi || 0) - (b.max_dpsi || 0) },
                { title: t(`${k}.col-q`), dataIndex: "q", align: "right", render: fmtQ, defaultSortOrder: "ascend", sorter: (a, b) => (a.q ?? 1) - (b.q ?? 1) },
                { title: t(`${k}.col-patients`), dataIndex: "nPatients", align: "right", sorter: (a, b) => a.nPatients - b.nPatients },
              ]}
            />
          </div>
          {row && matrix ? (
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              <Space wrap>
                <Text strong>
                  {t(`${k}.cohort-multiples`)} · {row.gene} · {row.locus}
                </Text>
                <HintLine inline text={t(`${k}.sashimi-help`)} />
                <SvgExportButton containerRef={plotRef} name={`sashimi-cohort-${row.gene || row.id}`} />
              </Space>
              <div ref={plotRef} style={{ overflowX: "auto" }}>
                <SashimiPlot cluster={row.cluster} tracks={tracks} width={Math.max(520, width)} trackH={84} />
              </div>
              <Space size={4} wrap>
                {(row.cluster.junctions || []).map((jn, j) => (
                  <Text key={j} type="secondary" style={{ marginRight: 10 }}>
                    <span className="sc-swatch" style={{ background: junctionColor(j) }} />
                    {`${j + 1} · ${TYPE_LABELS[jn.type] || (jn.annotated === false ? "novel" : "annotated")} · ${junctionLabel(row.cluster.chromosome, jn)}`}
                  </Text>
                ))}
              </Space>
              <Text strong>{t(`${k}.cohort-heatmap`)}</Text>
              <div style={{ overflowX: "auto" }}>
                <PsiHeatmap junctions={row.cluster.junctions} columns={matrix.patients} psi={matrix.psi} totals={matrix.totals} chromosome={row.cluster.chromosome} />
              </div>
            </Space>
          ) : (
            <Text type="secondary">{t(`${k}.pick-cluster`)}</Text>
          )}
        </Space>
      </div>
    </Card>
  );
}
