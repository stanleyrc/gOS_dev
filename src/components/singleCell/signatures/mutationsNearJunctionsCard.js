import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Alert, Button, Card, Select, Segmented, Skeleton, Space, Table, Tag, Typography } from "antd";
import { ThunderboltOutlined } from "@ant-design/icons";
import singleCellActions from "../../../redux/singleCell/actions";
import settingsActions from "../../../redux/settings/actions";
import { casePath, tryGet } from "../../../redux/singleCell/loaders";
import {
  adjacentRows,
  binSeries,
  cooccurrenceText,
  fmtDist,
  fmtOr,
  fmtP,
  fmtPct,
  headline,
  kataegisRows,
  NEAR_OPTIONS,
  testsFor,
  siteCarriers,
  unavailableReason,
} from "../../../helpers/singleCell/mutJunctions";
import { TYPE } from "../../../helpers/singleCell/plotTheme";
import CellIgvPanel from "../cellIgvPanel";
import HintLine from "../hintLine";
import MutJunctionBinChart from "./mutJunctionBinChart";

const { Text, Paragraph } = Typography;
const IGV_CELLS = 6;
const DIST_OPTIONS = [
  { value: 1e3, label: "<= 1 kb" },
  { value: 1e4, label: "<= 10 kb" },
  { value: 1e5, label: "<= 100 kb" },
  { value: 1e6, label: "<= 1 Mb" },
];

/** data/<P>/mut_junctions.json of the open patient: { status: "loading" | "ok" | "none" | "error", data }. */
export function useMutJunctions() {
  const dataset = useSelector((s) => s.Settings.dataset);
  const patientId = useSelector((s) => s.SingleCell.patient?.caseReportId);
  const [state, setState] = useState({ status: "loading", data: null });
  useEffect(() => {
    if (!dataset || !patientId) {
      setState({ status: "none", data: null });
      return undefined;
    }
    let active = true;
    setState({ status: "loading", data: null });
    tryGet(casePath(dataset, patientId, "mut_junctions.json")).then((r) => {
      if (!active) return;
      if (r.status === "ok" && r.data && typeof r.data === "object") setState({ status: "ok", data: r.data });
      else setState({ status: r.status === "missing" ? "none" : "error", data: null });
    });
    return () => {
      active = false;
    };
  }, [dataset, patientId]);
  return state;
}

/**
 * Mutations near junctions: is APOBEC-type mutagenesis enriched around SV breakpoints? APOBEC fraction by distance
 * bin against the callable-site background, the junction-adjacent APOBEC SNVs (click to paint the site, select
 * its carrier cells and open its reads), kataegis clusters and the carrier-cell co-occurrence of SNV and junction.
 */
export default function MutationsNearJunctionsCard() {
  const dispatch = useDispatch();
  const { snv } = useSelector((s) => s.SingleCell);
  const patientId = useSelector((s) => s.SingleCell.patient?.caseReportId);
  const { status, data } = useMutJunctions();
  const snvData = snv.status === "ok" ? snv.data : null;
  const [def, setDef] = useState("tcw");
  const [near, setNear] = useState(1e6);
  const [maxDist, setMaxDist] = useState(1e6);
  const [kMode, setKMode] = useState("strict");
  const [igv, setIgv] = useState(null);

  const series = useMemo(() => binSeries(data, def), [data, def]);
  const rows = useMemo(() => adjacentRows(data, { def, maxDist }), [data, def, maxDist]);
  const kat = useMemo(() => kataegisRows(data, kMode), [data, kMode]);
  const reason = status === "ok" ? unavailableReason(data) : null;

  const variantOf = (id) => snvData?.variants?.find((v) => v.id === id) || null;
  const paint = (r) => {
    const carriers = siteCarriers(snvData, r.id);
    dispatch(singleCellActions.updateSelection(carriers));
    dispatch(singleCellActions.addCellField(`SNV ${r.id}`, Object.fromEntries(carriers.map((c) => [c, "carrier"]))));
    const v = variantOf(r.id);
    if (v) setIgv({ cellIds: carriers.slice(0, IGV_CELLS), chromosome: v.chromosome, position: v.position, label: `${r.id} (${r.junction})` });
  };
  const openCluster = (c) => {
    const first = variantOf(c.snv_ids[0]);
    if (!first) return;
    const carriers = c.snv_ids.map((id) => siteCarriers(snvData, id));
    const counts = new Map();
    carriers.flat().forEach((cell) => counts.set(cell, (counts.get(cell) || 0) + 1));
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([cell]) => cell);
    dispatch(singleCellActions.updateSelection(top));
    setIgv({ cellIds: top.slice(0, IGV_CELLS), chromosome: first.chromosome, position: Math.round((c.start + c.end) / 2), label: `kataegis ${c.chrom}:${c.start}-${c.end}`, window: Math.max(150, c.end - c.start + 400) });
  };
  const toGenomeView = () => {
    if (!igv) return;
    dispatch(singleCellActions.openIgv(igv));
    dispatch(settingsActions.updateTab("7"));
  };

  if (status === "loading") return <Card size="small" title="Mutations near junctions"><Skeleton active paragraph={{ rows: 3 }} /></Card>;
  const title = <Space><ThunderboltOutlined />Mutations near junctions</Space>;
  if (status !== "ok") {
    return (
      <Card size="small" title={title}>
        <Text type="secondary">
          Not available ({status === "error" ? "mut_junctions.json could not be read" : "mut_junctions.json has not been exported for this patient; srctools inst/gos_single_cell/mut_junctions.py"}).
        </Text>
      </Card>
    );
  }
  if (reason) {
    return (
      <Card size="small" title={title}>
        <Text type="secondary">Not available ({reason}).</Text>
      </Card>
    );
  }
  const j = data.junction_source;
  const tests = testsFor(data, near);
  const nearPerm = tests?.[def]?.perm?.shift || tests?.[def]?.perm?.callable;
  return (
    <Card
      size="small"
      title={title}
      extra={
        <Space size={8}>
          <Segmented size="small" value={near} onChange={setNear} options={NEAR_OPTIONS} />
          <Segmented size="small" value={def} onChange={setDef} options={[{ value: "tcw", label: "TCW motif" }, { value: "sbs", label: "SBS2/13" }]} />
        </Space>
      }
    >
      <Space direction="vertical" size={10} style={{ width: "100%" }}>
        {patientId === "BWH69" && (
          <Alert type="warning" showIcon message="BWH69 SNV set is noisy (55,055 sites); a rebuild is pending, so treat these numbers as provisional." />
        )}
        {!data.snv_source.apobec_signature_in_fit && (
          <Alert
            type="info"
            showIcon
            message={`No SBS2 or SBS13 in the joint signature fit (${data.snv_source.signatures_in_joint_fit.join(", ")}): no site is assigned to APOBEC by signature. The TCW motif is the model-free readout.`}
          />
        )}
        <Paragraph style={{ marginBottom: 0 }}>{headline(data, def, near)}</Paragraph>
        <MutJunctionBinChart series={series} />
        <HintLine
          text={`Junctions: ${j.n_junctions_recurrent} ALT edges present in at least ${j.recurrent_min_cells} tumour cells (of ${j.n_junctions_any} in any cell; per-cell JaBbA graphs, ${j.n_tumor_cells_with_graph}/${j.n_tumor_cells} cells with a graph), matched at 1 kb as in the Junction CN view. Distance is to the nearest breakpoint on the same chromosome; sites on chromosomes without a breakpoint count as far. Background: ${data.background.n ? `${data.background.n.toLocaleString()} genotyped candidate sites` : "not available"}. Test: Fisher (<= ${fmtDist(tests.near_bp)} vs > 1 Mb), logistic on log10 distance, and a permutation that shuffles breakpoints within each chromosome (uniform, among callable sites, or shifting all breakpoints of a chromosome together to keep their clustering) and scores the standardised APOBEC excess among the near sites.`}
        />
        <Space size={16} wrap style={{ fontSize: TYPE.body }}>
          {["shift", "uniform", "callable"].map((m) => {
            const p = tests[def]?.perm?.[m];
            return p ? (
              <Text key={m}>
                junction {m === "shift" ? "shift (clusters kept)" : `shuffle (${m})`}: observed excess z={p.obs.toFixed(2)} vs null {p.null_mean.toFixed(2)} +/- {p.null_sd.toFixed(2)}, p={fmtP(p.p_one_sided)} (one-sided)
              </Text>
            ) : null;
          })}
          {tests[def]?.chrom_stratified && (
            <Text>chromosome-stratified (Mantel-Haenszel, {tests[def].chrom_stratified.n_chromosomes} chromosomes) OR {fmtOr(tests[def].chrom_stratified)}, p={fmtP(tests[def].chrom_stratified.p)}</Text>
          )}
          {tests[def]?.logistic_log10_distance && (
            <Text>logistic: OR per 10x distance {fmtOr(tests[def].logistic_log10_distance)}, p={fmtP(tests[def].logistic_log10_distance.p)}</Text>
          )}
          {nearPerm && nearPerm.n_near_obs != null && (
            <Text>
              sites within {fmtDist(tests.near_bp)}: {nearPerm.n_near_obs} observed vs {nearPerm.n_near_null_mean.toFixed(0)} expected for randomly placed junctions (depletion p={fmtP(nearPerm.p_n_near_depleted)}): breakpoint regions, often amplified, retain few callable sites
            </Text>
          )}
        </Space>

        <Space size={8} wrap>
          <Text strong>Junction-adjacent {def === "tcw" ? "TCW" : "SBS2/13"} SNVs</Text>
          <Select size="small" style={{ width: 110 }} value={maxDist} onChange={setMaxDist} options={DIST_OPTIONS} />
          <Text type="secondary">{rows.length} of {data.adjacent_snvs_total} APOBEC-type sites within 1 Mb of a junction (list capped at 3,000 nearest). Click a row to select its carrier cells and open its reads.</Text>
        </Space>
        <Table
          size="small"
          rowKey="id"
          dataSource={rows}
          pagination={{ pageSize: 6, size: "small", hideOnSinglePage: true }}
          onRow={(r) => ({ onClick: () => paint(r), style: { cursor: "pointer" } })}
          locale={{ emptyText: `No ${def === "tcw" ? "TCW" : "SBS2/13"} SNV within ${fmtDist(maxDist)} of a junction` }}
          columns={[
            { title: "SNV", dataIndex: "id", render: (v, r) => <Text strong={r.driver}>{v}</Text> },
            { title: "Context", dataIndex: "context" },
            { title: "Branch", dataIndex: "category", render: (v) => <Tag>{v}</Tag> },
            { title: "Distance", dataIndex: "dist", sorter: (a, b) => a.dist - b.dist, render: fmtDist },
            { title: "Junction", dataIndex: "junction", render: (v, r) => <span title={`breakpoint ${r.breakpoint}`}>{v}</span> },
            { title: "Cells (SNV / junction)", key: "cells", align: "right", render: (_, r) => `${r.n_snv_cells} / ${r.n_junction_cells}` },
            { title: "Carrier F1", dataIndex: "f1", sorter: (a, b) => a.f1 - b.f1, align: "right", render: (v) => v.toFixed(2) },
          ]}
        />

        <Space size={8} wrap>
          <Text strong>Kataegis clusters</Text>
          <Segmented size="small" value={kMode} onChange={setKMode} options={[{ value: "strict", label: ">= 6 within 1 kb" }, { value: "relaxed", label: ">= 4 within 10 kb" }]} />
          {kat.params && (
            <Text type="secondary">
              {kat.params.n} found, {kat.singleBranch} on a single branch; expected by chance {kat.params.nullMean?.toFixed(2)} (permutation p={fmtP(kat.params.p)}). Runs of pooled SNV sites, not per-cell mutations.
            </Text>
          )}
        </Space>
        <Table
          size="small"
          rowKey={(c) => `${c.chrom}:${c.start}`}
          dataSource={kat.clusters}
          pagination={{ pageSize: 5, size: "small", hideOnSinglePage: true }}
          locale={{ emptyText: "No cluster at this threshold" }}
          onRow={(c) => ({ onClick: () => openCluster(c), style: { cursor: "pointer" } })}
          columns={[
            { title: "Locus", key: "locus", render: (_, c) => `${c.chrom}:${c.start.toLocaleString()}-${c.end.toLocaleString()}` },
            { title: "SNVs", dataIndex: "n", align: "right" },
            { title: "Median gap", dataIndex: "median_gap", render: fmtDist },
            { title: "TCW", key: "tcw", align: "right", render: (_, c) => fmtPct(c.tcw.frac, 0) },
            { title: "SBS2/13", key: "sbs", align: "right", render: (_, c) => fmtPct(c.sbs.frac, 0) },
            { title: "Branch", key: "br", render: (_, c) => `${c.categories.join(", ")}${c.single_branch ? " (one branch)" : ""}` },
            { title: "Nearest junction", key: "nj", render: (_, c) => (c.nearest_junction ? `${fmtDist(c.nearest_junction_dist)} (${c.nearest_junction})` : "none on chromosome") },
          ]}
        />

        <div>
          <Text strong>Same branch as the junction?</Text>
          <Paragraph style={{ marginBottom: 0 }}>{cooccurrenceText(data, near)}</Paragraph>
          <HintLine text={`Carrier F1 compares the cells carrying the SNV (${data.cooccurrence?.carrier_definition}) with the cells carrying the nearest junction, over ${data.cooccurrence?.universe_cells} tumour cells with a graph. F1 near 1 means the same carrier cells (same branch), as expected if APOBEC acted at the time of the rearrangement.`} />
        </div>

        {igv && (
          <div>
            <Space size={8}>
              <Text strong>{igv.label}</Text>
              <Button size="small" onClick={toGenomeView}>Open in Single-Cell genome view</Button>
              <Button size="small" onClick={() => setIgv(null)}>Close</Button>
            </Space>
            <CellIgvPanel view={igv} embedded />
          </div>
        )}
      </Space>
    </Card>
  );
}
