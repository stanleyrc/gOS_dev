import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, Empty, Input, Space, Table, Typography } from "antd";
import { BranchesOutlined } from "@ant-design/icons";
import HintLine from "../hintLine";
import useContainerWidth from "../useContainerWidth";
import { PsiHeatmap, SashimiLite } from "../rna/sashimiLite";
import { tryGet } from "../../../redux/singleCell/loaders";
import { cohortClusterRows, cohortPsiMatrix, filterClusters } from "../../../helpers/singleCell/splicing";

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

/**
 * Splicing between patients: intron clusters whose junction usage differs
 * between patients (chi-square, BH q, from the back end), searchable by
 * gene; the chosen cluster as one sashimi-lite per patient plus a junction x
 * patient PSI heatmap (PSI computed here from the pooled counts).
 */
export default function CohortSplicingPanel({ dataset }) {
  const { t } = useTranslation("common");
  const [ref, width] = useContainerWidth(1000);
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
  useEffect(() => {
    if (rows.length && !rows.some((r) => r.id === picked)) setPicked(rows[0].id);
  }, [rows, picked]);
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
  const nP = matrix?.patients.length || 1;
  const panelW = Math.max(240, Math.min(340, Math.floor((width - 24) / Math.min(4, nP))));
  return (
    <Card size="small" title={title}>
      <div ref={ref}>
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
            { title: t(`${k}.col-junctions`), dataIndex: "nJunctions", align: "right" },
            { title: t(`${k}.col-dpsi`), dataIndex: "max_dpsi", align: "right", render: (v) => (Number.isFinite(v) ? v.toFixed(2) : "–"), sorter: (a, b) => (a.max_dpsi || 0) - (b.max_dpsi || 0) },
            { title: t(`${k}.col-q`), dataIndex: "q", align: "right", render: fmtQ, defaultSortOrder: "ascend", sorter: (a, b) => (a.q ?? 1) - (b.q ?? 1) },
            { title: t(`${k}.col-patients`), dataIndex: "nPatients", align: "right", sorter: (a, b) => a.nPatients - b.nPatients },
          ]}
        />
        {row && matrix ? (
          <Space direction="vertical" size={12} style={{ width: "100%", marginTop: 8 }}>
            <Text strong>
              {t(`${k}.cohort-multiples`)} · {row.gene} · {row.locus}
            </Text>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {matrix.patients.map((p, i) => (
                <SashimiLite
                  key={p}
                  junctions={row.cluster.junctions}
                  psi={matrix.psi.map((r) => r[i])}
                  chromosome={row.cluster.chromosome}
                  title={p}
                  subtitle={`${t(`${k}.reads`, { count: matrix.totals[i] })} · ${t(`${k}.cells`, { count: matrix.nCells[i] })}`}
                  width={panelW}
                />
              ))}
            </div>
            <Text strong>{t(`${k}.cohort-heatmap`)}</Text>
            <div style={{ overflowX: "auto" }}>
              <PsiHeatmap junctions={row.cluster.junctions} columns={matrix.patients} psi={matrix.psi} totals={matrix.totals} chromosome={row.cluster.chromosome} />
            </div>
          </Space>
        ) : (
          <Text type="secondary">{t(`${k}.pick-cluster`)}</Text>
        )}
      </div>
    </Card>
  );
}
