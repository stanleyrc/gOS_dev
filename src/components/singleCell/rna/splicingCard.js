import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Alert, Card, Col, Empty, Row, Select, Space, Table, Typography } from "antd";
import { BranchesOutlined } from "@ant-design/icons";
import HintLine from "../hintLine";
import useTreeView from "../useTreeView";
import useContainerWidth from "../useContainerWidth";
import CellStripCanvas from "./cellStripCanvas";
import { SashimiLite } from "./sashimiLite";
import { rnaCellMaps } from "../../../helpers/singleCell/rnaFusions";
import {
  cellUsageMatrix,
  clusterByGroup,
  filterClusters,
  junctionLabel,
  maxDeltaPsi,
  rnaGrouping,
  rnaRowsInTreeOrder,
  variantByGroup,
  variantSummary,
} from "../../../helpers/singleCell/splicing";
import { NO_READS_COLOR, junctionColor, psiColor, readsColor } from "../../../helpers/singleCell/rnaColors";

const { Text } = Typography;
const k = "components.single-cell.splicing";
const fmtPct = (p) => (Number.isFinite(p) ? `${(p * 100).toFixed(1)}%` : "–");
const STRIP_ROW_H = 14;

/** Group-by choices: the DNA clone, then categorical rna/cells.json fields. */
function useGroupFields(summary) {
  const { t } = useTranslation("common");
  return useMemo(
    () => [
      { value: "clone", label: t(`${k}.group-clone`) },
      ...(summary?.fields || []).filter((f) => !f.numeric && f.levels && f.levels.length <= 24).map((f) => ({ value: f.name, label: f.name })),
    ],
    [summary, t]
  );
}

/** Known splice variants (EGFRvIII, MET exon 14 skipping, ...): summary, per-cell strip, per-group table. */
function KnownVariants({ variants, rows, nTree, groupOf, width }) {
  const { t } = useTranslation("common");
  const [picked, setPicked] = useState(variants[0]?.id);
  useEffect(() => setPicked((p) => (variants.some((v) => v.id === p) ? p : variants[0]?.id)), [variants]);
  const variant = variants.find((v) => v.id === picked);
  const summaries = useMemo(() => variants.map((v) => ({ ...v, key: v.id, ...variantSummary(v) })), [variants]);
  const groups = useMemo(() => (variant ? variantByGroup(variant, groupOf) : []), [variant, groupOf]);
  const max = useMemo(() => {
    let m = 1;
    rows.forEach((r) => (variant?.cells?.[r.rna_id] || []).forEach((v) => (m = Math.max(m, Number(v) || 0))));
    return m;
  }, [variant, rows]);
  if (!variants.length) return null;
  const colorOf = (i, row) => {
    const pair = variant?.cells?.[rows[i].rna_id];
    if (!pair) return null;
    const v = Number(pair[row]) || 0;
    return v > 0 ? readsColor(v, max) : NO_READS_COLOR;
  };
  return (
    <Space direction="vertical" size={8} style={{ width: "100%" }}>
      <Text strong>{t(`${k}.variants-title`)}</Text>
      <Table
        size="small"
        pagination={false}
        dataSource={summaries}
        rowClassName={(r) => (r.id === picked ? "ant-table-row-selected" : "")}
        onRow={(r) => ({ onClick: () => setPicked(r.id), style: { cursor: "pointer" } })}
        columns={[
          { title: t(`${k}.col-variant`), dataIndex: "id" },
          { title: t(`${k}.col-gene`), dataIndex: "gene" },
          { title: "", dataIndex: "description" },
          { title: t(`${k}.col-alt-cells`), key: "cells", align: "right", render: (_, r) => `${r.nAlt} / ${r.nCells}` },
          { title: t(`${k}.col-alt`), dataIndex: "alt", align: "right" },
          { title: t(`${k}.col-ref`), dataIndex: "ref", align: "right" },
          { title: t(`${k}.col-frac`), key: "frac", align: "right", render: (_, r) => fmtPct(r.frac) },
        ]}
      />
      {variant && (
        <>
          <Space size={4}>
            <Text>{variant.id}</Text>
            <HintLine inline text={t(`${k}.variant-strip-help`)} />
            <Text type="secondary">{t(`${k}.variant-summary`, variantSummary(variant))}</Text>
          </Space>
          <CellStripCanvas
            n={rows.length}
            rows={2}
            width={width}
            height={2 * STRIP_ROW_H}
            gaps={nTree < rows.length ? [nTree] : []}
            colorOf={colorOf}
            titleOf={(i) => {
              const pair = variant.cells?.[rows[i].rna_id];
              return `${rows[i].cell_id || rows[i].rna_id}: ${pair ? `${pair[0]} alt / ${pair[1]} ref` : "–"}`;
            }}
          />
          <Table
            size="small"
            rowKey="group"
            pagination={false}
            dataSource={groups}
            columns={[
              { title: t(`${k}.col-group`), dataIndex: "group" },
              { title: t(`${k}.col-cells`), dataIndex: "nCells", align: "right" },
              { title: t(`${k}.col-alt-cells`), dataIndex: "nAlt", align: "right" },
              { title: t(`${k}.col-alt`), dataIndex: "alt", align: "right" },
              { title: t(`${k}.col-ref`), dataIndex: "ref", align: "right" },
              { title: t(`${k}.col-frac`), dataIndex: "frac", align: "right", render: fmtPct, sorter: (a, b) => (a.frac || 0) - (b.frac || 0) },
            ]}
          />
        </>
      )}
    </Space>
  );
}

/** Intron clusters: pick one (gene search), PSI per group as arcs, per-cell usage in tree order. */
function ClusterExplorer({ clusters, rows, nTree, groupOf, width }) {
  const { t } = useTranslation("common");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(clusters[0]?.id);
  useEffect(() => setPicked((p) => (clusters.some((c) => c.id === p) ? p : clusters[0]?.id)), [clusters]);
  const cluster = clusters.find((c) => c.id === picked);
  const options = useMemo(
    () => filterClusters(clusters, query).slice(0, 200).map((c) => ({ value: c.id, label: `${c.gene || "?"} · ${c.id} · chr${`${c.chromosome}`.replace(/^chr/, "")} (${c.junctions.length})` })),
    [clusters, query]
  );
  const groups = useMemo(() => (cluster ? clusterByGroup(cluster, groupOf) : []), [cluster, groupOf]);
  const usage = useMemo(() => (cluster ? cellUsageMatrix(cluster, rows) : null), [cluster, rows]);
  if (!clusters.length) return <Text type="secondary">{t(`${k}.no-clusters`)}</Text>;
  const panelW = Math.max(240, Math.min(360, Math.floor((width - 24) / Math.min(4, Math.max(1, groups.length)))));
  const labelW = 150;
  return (
    <Space direction="vertical" size={8} style={{ width: "100%" }}>
      <Space wrap>
        <Text strong>{t(`${k}.clusters-title`)}</Text>
        <Select
          size="small"
          showSearch
          filterOption={false}
          onSearch={setQuery}
          style={{ minWidth: 340 }}
          placeholder={t(`${k}.cluster-pick`)}
          value={picked}
          onChange={setPicked}
          options={options}
        />
        <HintLine inline text={t(`${k}.arcs-help`)} />
        {groups.length > 1 && <Text type="secondary">{t(`${k}.delta`, { value: maxDeltaPsi(groups).toFixed(2) })}</Text>}
      </Space>
      {cluster && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {groups.map((g) => (
              <SashimiLite
                key={g.group}
                junctions={cluster.junctions}
                psi={g.psi}
                chromosome={cluster.chromosome}
                title={g.group}
                subtitle={`${t(`${k}.reads`, { count: g.total })} · ${t(`${k}.cells`, { count: g.nCells })}`}
                width={panelW}
              />
            ))}
          </div>
          <Space size={4}>
            <Text>{t(`${k}.strip-title`)}</Text>
            <HintLine inline text={t(`${k}.strip-help`)} />
          </Space>
          <div style={{ display: "flex" }}>
            <div style={{ width: labelW, flex: "none" }}>
              {cluster.junctions.map((jn, j) => (
                <div key={j} style={{ height: STRIP_ROW_H, lineHeight: `${STRIP_ROW_H}px`, fontSize: 11, whiteSpace: "nowrap", overflow: "hidden" }} title={junctionLabel(cluster.chromosome, jn)}>
                  <span className="sc-swatch" style={{ background: junctionColor(j) }} />
                  {`${Number(jn.start).toLocaleString("en-US")}-${Number(jn.end).toLocaleString("en-US")}`}
                </div>
              ))}
            </div>
            <CellStripCanvas
              n={rows.length}
              rows={usage.nJ}
              width={Math.max(200, width - labelW - 8)}
              height={usage.nJ * STRIP_ROW_H}
              gaps={nTree < rows.length ? [nTree] : []}
              colorOf={(i, j) => {
                const p = usage.psi[i * usage.nJ + j];
                return Number.isFinite(p) ? psiColor(p) : null;
              }}
              titleOf={(i, j) =>
                t(`${k}.strip-cell`, {
                  cell: rows[i].cell_id || rows[i].rna_id,
                  junction: j + 1,
                  psi: Number.isFinite(usage.psi[i * usage.nJ + j]) ? usage.psi[i * usage.nJ + j].toFixed(2) : "–",
                  total: usage.totals[i],
                })
              }
            />
          </div>
          <Table
            size="small"
            rowKey="group"
            pagination={false}
            scroll={{ x: "max-content" }}
            dataSource={groups}
            columns={[
              { title: t(`${k}.col-group`), dataIndex: "group", fixed: "left" },
              { title: t(`${k}.col-cells`), dataIndex: "nCells", align: "right" },
              { title: t(`${k}.col-reads`), dataIndex: "total", align: "right" },
              ...cluster.junctions.map((jn, j) => ({
                title: (
                  <span title={junctionLabel(cluster.chromosome, jn)}>
                    <span className="sc-swatch" style={{ background: junctionColor(j) }} />
                    {`${t(`${k}.junction`)} ${j + 1}${jn.annotated === false ? "*" : ""}`}
                  </span>
                ),
                key: `j${j}`,
                align: "right",
                render: (_, g) => `${fmtPct(g.psi[j])} (${g.counts[j]})`,
              })),
            ]}
          />
        </>
      )}
    </Space>
  );
}

/**
 * Splicing of the patient's RNA cells (rna/splicing.json from the back end:
 * regtools junctions, LeafCutter-style clusters, known variants); PSI per
 * group (DNA clone, cell state, region, ...) is pooled here.
 */
export default function SplicingCard({ summary }) {
  const { t } = useTranslation("common");
  const source = useSelector((s) => s.SingleCell.rnaSplicing);
  const dnaCells = useSelector((s) => s.SingleCell.cells);
  const { order } = useTreeView();
  const [ref, width] = useContainerWidth(1000);
  const fields = useGroupFields(summary);
  const [field, setField] = useState("clone");
  const data = source?.status === "ok" ? source.data : null;
  const { cellOf } = useMemo(() => rnaCellMaps([], summary?.cells || [], data?.cellMap), [summary, data]);
  const cloneOf = useMemo(() => new Map(dnaCells.map((c) => [c.cell_id, c.clone_id])), [dnaCells]);
  const groupOf = useMemo(() => rnaGrouping(field, summary?.cells || [], cloneOf, cellOf), [field, summary, cloneOf, cellOf]);
  const { rows, nTree } = useMemo(() => {
    const ids = new Set((summary?.cells || []).map((c) => c.rna_id));
    Object.keys(data?.cellMap || {}).forEach((r) => ids.add(r));
    return rnaRowsInTreeOrder(order, [...ids], cellOf);
  }, [summary, data, order, cellOf]);

  const title = (
    <Space>
      <BranchesOutlined />
      <span>{t(`${k}.title`)}</span>
      <HintLine inline text={t(`${k}.help`)} />
    </Space>
  );
  if (!data) {
    return (
      <Card size="small" title={title}>
        {source?.status === "error" ? (
          <Alert type="warning" showIcon message={t(`${k}.error`, { error: source.error?.message || `${source.error}` })} />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t(`${k}.none`)} />
        )}
      </Card>
    );
  }
  const innerW = Math.max(300, width - 8);
  return (
    <Card
      size="small"
      title={title}
      extra={
        <Space>
          <Text type="secondary">{t(`${k}.group-by`)}</Text>
          <Select size="small" style={{ width: 170 }} value={field} onChange={setField} options={fields} />
        </Space>
      }
    >
      <div ref={ref}>
        <Row gutter={[16, 16]}>
          {data.variants.length > 0 && (
            <Col span={24}>
              <KnownVariants variants={data.variants} rows={rows} nTree={nTree} groupOf={groupOf} width={innerW} />
            </Col>
          )}
          <Col span={24}>
            <ClusterExplorer clusters={data.clusters} rows={rows} nTree={nTree} groupOf={groupOf} width={innerW} />
          </Col>
        </Row>
      </div>
    </Card>
  );
}
