import React, { useMemo, useState } from "react";
import { useDispatch } from "react-redux";
import { Button, Segmented, Select, Space, Table, Tag, Typography } from "antd";
import singleCellActions from "../../../redux/singleCell/actions";
import settingsActions from "../../../redux/settings/actions";
import {
  availableFilters,
  carrierRows,
  FOCAL_SUBSETS,
  focalBlock,
  focalHeadline,
  focalPrimary,
  focalSeries,
  focalUnavailable,
  fmtRate,
  fmtRr,
  pairsInBin,
  pairSnvIds,
  strataRows,
  TERRITORIES,
} from "../../../helpers/singleCell/mutJunctionsFocal";
import { fmtDist, fmtP } from "../../../helpers/singleCell/mutJunctions";
import { TYPE } from "../../../helpers/singleCell/plotTheme";
import HintLine from "../hintLine";
import MutJunctionFocalChart from "./mutJunctionFocalChart";

const { Text, Paragraph } = Typography;
const f1Text = (s) => (s && s.n ? `${s.median.toFixed(2)} (n=${s.n})` : "n/a");

/**
 * Focal view of the Mutations-near-junctions card: SNV rate within 0-1, 1-2, 2-5 and 5-50 kb on the cis (fused) vs
 * trans side of every junction breakend, against the same-chromosome background, as in the JaBbA paper's 5 kb
 * analysis. Click a bar to list the SNVs in that bin; "Isolate on SNV heatmap" restricts the heatmap to them.
 */
export default function MutJunctionFocalSection({ data, onPaint = null }) {
  const dispatch = useDispatch();
  const [territory, setTerritory] = useState("focal");
  const [filter, setFilter] = useState("all");
  const [subset, setSubset] = useState("all");
  const [cn, setCn] = useState(true);
  const [picked, setPicked] = useState({ bin: "0-1 kb", side: null });
  const block = focalBlock(data, territory);
  const reason = focalUnavailable(data, territory);
  const filters = availableFilters(block);
  const f = filters.some((x) => x.value === filter) ? filter : "all";
  const series = useMemo(() => focalSeries(block, f, subset, cn), [block, f, subset, cn]);
  const prim = useMemo(() => focalPrimary(block, f, subset, cn), [block, f, subset, cn]);
  const pairs = useMemo(() => (picked ? pairsInBin(block, { bin: picked.bin, side: picked.side, filter: f, subset }) : []), [block, picked, f, subset]);
  const strata = useMemo(() => strataRows(block, f, cn), [block, f, cn]);
  const carriers = useMemo(() => carrierRows(block, f), [block, f]);

  const isolate = (ids) => {
    if (!ids.length) return;
    dispatch(singleCellActions.updateLayout({ snvSiteIds: ids, snvCategories: null, snvCellphyOnly: false, snvDriversOnly: false }));
    dispatch(singleCellActions.updateHeatmapType("snv"));
    dispatch(settingsActions.updateTab("7"));
  };

  const controls = (
    <Space size={8} wrap>
      <Segmented size="small" value={territory} onChange={setTerritory} options={TERRITORIES} />
      <Select size="small" style={{ width: 140 }} value={f} onChange={setFilter} options={filters.length ? filters : [{ value: "all", label: "All tree sites" }]} />
      <Segmented size="small" value={subset} onChange={setSubset} options={FOCAL_SUBSETS} />
      <Segmented size="small" value={cn ? "cn" : "raw"} onChange={(v) => setCn(v === "cn")} options={[{ value: "cn", label: "CN-adjusted" }, { value: "raw", label: "Raw" }]} />
    </Space>
  );
  if (!block) {
    return (
      <Space direction="vertical" size={8} style={{ width: "100%" }}>
        {controls}
        <Text type="secondary">Not available ({reason || "no focal result"}).</Text>
      </Space>
    );
  }
  const perm = prim?.perm;
  return (
    <Space direction="vertical" size={10} style={{ width: "100%" }}>
      {controls}
      <Paragraph style={{ marginBottom: 0 }}>{focalHeadline(block, f, subset, cn)}</Paragraph>
      <MutJunctionFocalChart series={series} picked={picked} onPick={setPicked} />
      <HintLine
        text={`${block.n_breakends} breakends of junctions seen in >= 2 tumour cells (${block.n_breakends_callable_5kb} with callable bases within 5 kb; ${block.territory_label || ""}). Cis = the side fused into the junction (gGnome strand '+' = higher coordinates, '-' = lower), trans = the other side. Rate = SNVs per callable Mb (raw) or per diploid-equivalent Mb (CN-adjusted: callable x carrier CN / 2), summed over breakends; ratio CIs exact (conditional binomial); background = random windows matched by CN class. Caveat: cis SNVs within a few hundred bp of the breakpoint can be mismatches from junction-spanning reads.`}
      />
      {perm && (
        <Space size={16} wrap style={{ fontSize: TYPE.body }}>
          {perm.shift && <Text>junction shift (all breakends of a chromosome moved together): log ratio {perm.shift.obs.toFixed(2)} vs null {perm.shift.null_mean.toFixed(2)} +/- {perm.shift.null_sd.toFixed(2)}, p={fmtP(perm.shift.p_two_sided)}</Text>}
          {perm.flip && <Text>orientation flip (cis/trans swapped at random per breakend): p={fmtP(perm.flip.p_two_sided)}{perm.flip_cn ? `, CN-adjusted p=${fmtP(perm.flip_cn.p_two_sided)}` : ""}</Text>}
          {perm.shift_cis_count && <Text>cis SNVs within 5 kb {perm.shift_cis_count.obs} vs {perm.shift_cis_count.null_mean.toFixed(1)} at shifted positions (p={fmtP(perm.shift_cis_count.p_two_sided)})</Text>}
        </Space>
      )}

      <Space size={8} wrap>
        <Text strong>{picked ? `SNVs ${picked.side ? `on the ${picked.side} side ` : ""}at ${picked.bin}` : "Pick a bin"}</Text>
        <Segmented size="small" value={picked?.bin || "0-1 kb"} onChange={(b) => setPicked({ bin: b, side: picked?.side || null })} options={[...series.map((s) => s.label), "0-5 kb"]} />
        <Segmented size="small" value={picked?.side || "both"} onChange={(s) => setPicked({ bin: picked?.bin || "0-1 kb", side: s === "both" ? null : s })} options={["both", "cis", "trans"]} />
        <Button size="small" disabled={!pairs.length} onClick={() => isolate(pairSnvIds(pairs))}>Isolate on SNV heatmap ({pairSnvIds(pairs).length})</Button>
      </Space>
      <Table
        size="small"
        rowKey={(r) => `${r.snv}|${r.breakend}`}
        dataSource={pairs}
        pagination={{ pageSize: 6, size: "small", hideOnSinglePage: true }}
        locale={{ emptyText: "No counted SNV in this bin" }}
        onRow={(r) => ({ onClick: () => onPaint && onPaint({ id: r.snv, junction: r.junction }), style: { cursor: onPaint ? "pointer" : "default" } })}
        columns={[
          { title: "SNV", dataIndex: "snv" },
          { title: "Gene", dataIndex: "gene", render: (v, r) => <span title={r.consequence || ""}>{v || "-"}</span> },
          { title: "Distance", dataIndex: "dist", render: fmtDist, sorter: (a, b) => a.dist - b.dist },
          { title: "Side", dataIndex: "side", render: (v) => <Tag color={v === "cis" ? "blue" : "magenta"}>{v}</Tag> },
          { title: "Context", dataIndex: "context", render: (v, r) => <span>{v}{r.apobec ? " (TCW)" : ""}</span> },
          { title: "Junction", dataIndex: "junction", render: (v, r) => <span title={`breakend ${r.breakend}, gGnome strand ${r.gg_strand}`}>{v} <Text type="secondary">{r.cls}</Text></span> },
          { title: "Carriers shared (SNV / junction)", key: "car", align: "right", render: (_, r) => `${r.n_shared} (${r.n_snv_cells} / ${r.n_junction_cells})` },
          { title: "F1", dataIndex: "f1", align: "right", render: (v) => v.toFixed(2), sorter: (a, b) => a.f1 - b.f1 },
        ]}
      />

      <Text strong>By junction class, clonality and fused side (0-5 kb)</Text>
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
          { title: "Cis/trans", key: "rr", render: (_, r) => fmtRr(r.cisTrans) },
          { title: "Cis/background", key: "cb", render: (_, r) => fmtRr(r.cisBg) },
        ]}
      />

      <div>
        <Text strong>Do nearby SNVs share carrier cells with the junction?</Text>
        <Table
          size="small"
          rowKey="label"
          dataSource={carriers}
          pagination={false}
          columns={[
            { title: "Bin", dataIndex: "label" },
            { title: "Cis: median F1 (n)", key: "c", render: (_, r) => f1Text(r.cis) },
            { title: "Trans: median F1 (n)", key: "t", render: (_, r) => f1Text(r.trans) },
            { title: "Same SNVs vs a random junction", key: "r", render: (_, r) => f1Text(r.random) },
          ]}
        />
        <HintLine text="F1 between the cells carrying the SNV (genotype call) and the cells carrying the junction, among tumour cells with a graph. A mutation that arose with the junction should have F1 near 1; the random-junction column is the same SNVs scored against another junction of this patient. Counts are SNV x breakend pairs within 50 kb (all SNVs, territory or not)." />
      </div>

    </Space>
  );
}
