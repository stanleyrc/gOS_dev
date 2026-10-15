import React, { useMemo, useState } from "react";
import { Segmented, Select, Space, Table, Typography } from "antd";
import {
  availableFilters,
  carrierRows,
  FOCAL_SUBSETS,
  focalBlock,
  focalHeadline,
  focalSeries,
  fmtRate,
  fmtRr,
  forestRows,
  strataRows,
  TERRITORIES,
} from "../../../helpers/singleCell/mutJunctionsFocal";
import { fmtP } from "../../../helpers/singleCell/mutJunctions";
import HintLine from "../hintLine";
import MutJunctionFocalChart from "../signatures/mutJunctionFocalChart";
import MutJunctionForest from "../signatures/mutJunctionForest";

const { Text, Paragraph } = Typography;
const f1Text = (s) => (s && s.n ? `${s.median.toFixed(2)} (n=${s.n})` : "n/a");

/**
 * Cohort focal view: per-patient forest of the cis/trans SNV rate ratio within 5 kb of junction breakends with the
 * Mantel-Haenszel pooled estimate, the pooled rate per distance bin (cis vs trans vs background), strata and
 * carrier sharing. Data: `focal` / `focal_nonN` of _cohort/mut_junctions.json.
 */
export default function CohortMutJunctionFocal({ data, onOpen = null }) {
  const [territory, setTerritory] = useState("focal");
  const [filter, setFilter] = useState("all");
  const [subset, setSubset] = useState("all");
  const block = focalBlock(data, territory);
  const filters = availableFilters(block);
  const f = filters.some((x) => x.value === filter) ? filter : "all";
  const rows = useMemo(() => forestRows(block, f, subset), [block, f, subset]);
  const series = useMemo(() => focalSeries(block, f, subset), [block, f, subset]);
  const strata = useMemo(() => strataRows(block, f), [block, f]);
  const carriers = useMemo(() => carrierRows(block, f), [block, f]);
  const controls = (
    <Space size={8} wrap>
      <Segmented size="small" value={territory} onChange={setTerritory} options={TERRITORIES} />
      <Select size="small" style={{ width: 140 }} value={f} onChange={setFilter} options={filters.length ? filters : [{ value: "all", label: "All tree sites" }]} />
      <Segmented size="small" value={subset} onChange={setSubset} options={FOCAL_SUBSETS} />
    </Space>
  );
  if (!block) {
    return (
      <Space direction="vertical" size={8} style={{ width: "100%" }}>
        {controls}
        <Text type="secondary">Not available (_cohort/mut_junctions.json predates the focal analysis, schemaVersion 2).</Text>
      </Space>
    );
  }
  return (
    <Space direction="vertical" size={10} style={{ width: "100%" }}>
      {controls}
      <Paragraph style={{ marginBottom: 0 }}>
        {`Pooled over ${block.patients?.length ?? 0} patients. `}
        {focalHeadline(block, f, subset).replace("cis/trans rate ratio", "Mantel-Haenszel cis/trans rate ratio")}
      </Paragraph>
      <Text strong>Cis/trans rate ratio within 5 kb, per patient</Text>
      <MutJunctionForest rows={rows} onOpen={onOpen} />
      <Text strong>Pooled rate by distance from the breakend</Text>
      <MutJunctionFocalChart series={series} ariaLabel="Pooled SNV rate on the cis and trans side of junction breakends by distance" />
      <HintLine text={`${block.method || ""}`} />
      <Text strong>By junction class, clonality and fused side (0-5 kb, pooled)</Text>
      <Table
        size="small"
        rowKey="key"
        dataSource={strata}
        pagination={false}
        columns={[
          { title: "Stratum", dataIndex: "stratum" },
          { title: "Group", dataIndex: "group" },
          { title: "Breakends", dataIndex: "nBreakends", align: "right" },
          { title: "Cis SNVs (/Mb)", key: "c", align: "right", render: (_, r) => `${r.cis.k} (${fmtRate(r.cis.rate)})` },
          { title: "Trans SNVs (/Mb)", key: "t", align: "right", render: (_, r) => `${r.trans.k} (${fmtRate(r.trans.rate)})` },
          { title: "Cis/trans (MH)", key: "rr", render: (_, r) => fmtRr(r.cisTrans) },
          { title: "Cis/background", key: "cb", render: (_, r) => fmtRr(r.cisBg) },
          { title: "Trans/background", key: "tb", render: (_, r) => fmtRr(r.transBg) },
        ]}
      />
      <Text strong>Carrier sharing between nearby SNVs and their junction (all patients)</Text>
      <Table
        size="small"
        rowKey="label"
        dataSource={carriers}
        pagination={false}
        columns={[
          { title: "Bin", dataIndex: "label" },
          { title: "Cis: median F1 (n)", key: "c", render: (_, r) => f1Text(r.cis) },
          { title: "Trans: median F1 (n)", key: "t", render: (_, r) => f1Text(r.trans) },
          { title: "Random junction", key: "r", render: (_, r) => f1Text(r.random) },
          { title: "Cis vs trans (Mann-Whitney p)", key: "mw", render: (_, r) => (r.mw ? fmtP(r.mw.p) : "n/a") },
        ]}
      />
    </Space>
  );
}
