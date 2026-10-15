import React, { useMemo, useState } from "react";
import { useDispatch } from "react-redux";
import { Alert, Button, Segmented, Select, Slider, Space, Switch, Table, Tag, Typography } from "antd";
import singleCellActions from "../../../redux/singleCell/actions";
import settingsActions from "../../../redux/settings/actions";
import {
  BIN_SIZES,
  backgroundRate,
  binnedSeries,
  candidateRows,
  continuousData,
  cosmicReference,
  includedPatients,
  interMutationDistances,
  profileSums,
  refitNear,
  scatterPoints,
  selectPairs,
  sigColor,
  signatureEnrichment,
  smoothRate,
  spectra,
  tileCounts,
  windowSummary,
  ZOOMS,
} from "../../../helpers/singleCell/mutJunctionsContinuous";
import { FOCAL_FILTERS, FOCAL_SUBSETS } from "../../../helpers/singleCell/mutJunctionsFocal";
import { fmtDist } from "../../../helpers/singleCell/mutJunctions";
import { TYPE } from "../../../helpers/singleCell/plotTheme";
import HintLine from "../hintLine";
import MutJunctionDistancePlot from "./mutJunctionDistancePlot";
import MutJunctionSpectrum from "./mutJunctionSpectrum";

const { Text, Paragraph } = Typography;
const BANDWIDTHS = [100, 200, 300, 500, 1000, 2000, 5000, 10000];
const WINDOWS = [1000, 2000, 5000, 10000];
const NOISY = ["BWH69"];

const f2 = (x) => (x == null || !Number.isFinite(x) ? "n/a" : x >= 10 ? x.toFixed(0) : x.toFixed(2));
const fmtRr = (r) => (!r ? "n/a" : r.rr == null ? (r.lo == null ? "n/a" : `inf (${f2(r.lo)}-inf)`) : `${f2(r.rr)} (${f2(r.lo)}-${f2(r.hi)})`);

/**
 * Continuous view of mutations near junctions: per-SNV signed distance strip and a smoothed (or freely binned) rate per
 * callable kb on the cis and trans side, raw or copy-number adjusted, against the CN-matched background; then the
 * signature split of the near-junction SNVs (posterior-weighted enrichment, candidate signatures, refit, SBS96 spectra,
 * inter-mutation distances). Works on a patient file (patientId) or the cohort file.
 */
export default function MutJunctionContinuousSection({ data, patientId = null, onPaint = null }) {
  const dispatch = useDispatch();
  const [territory, setTerritory] = useState("focal");
  const [cn, setCn] = useState(true);
  const [mode, setMode] = useState("smooth");
  const [bwIdx, setBwIdx] = useState(4);
  const [binSize, setBinSize] = useState(1000);
  const [axis, setAxis] = useState("linear");
  const [zoom, setZoom] = useState(10000);
  const [filter, setFilter] = useState("all");
  const [subset, setSubset] = useState("all");
  const [excludeNear, setExcludeNear] = useState(false);
  const [excludeNoisy, setExcludeNoisy] = useState(false);
  const [win, setWin] = useState(5000);
  const [sigSide, setSigSide] = useState("cis");

  const block = data?.[territory];
  const cd = useMemo(() => continuousData(block, patientId), [block, patientId]);
  const filters = FOCAL_FILTERS.filter((f) => block?.results?.[f.value]);
  const f = filters.some((x) => x.value === filter) ? filter : "all";
  const excludePatients = excludeNoisy ? NOISY : [];
  const patients = useMemo(() => (cd ? includedPatients(cd, excludePatients) : []), [cd, excludeNoisy]); // eslint-disable-line react-hooks/exhaustive-deps
  const sel = useMemo(() => (cd ? selectPairs(cd.pairs, { filter: f, subset, excludeNear, excludePatients }) : []), [cd, f, subset, excludeNear, excludeNoisy]); // eslint-disable-line react-hooks/exhaustive-deps
  const prof = useMemo(() => (cd && patients.length ? profileSums(cd, { patients, filter: f, subset, excludeNear }) : null), [cd, patients, f, subset, excludeNear]);
  const counts = useMemo(() => (prof ? tileCounts(sel, prof.step, prof.n) : null), [sel, prof]);
  const smooth = useMemo(() => (prof && mode === "smooth" ? smoothRate(prof, counts, { bandwidth: BANDWIDTHS[bwIdx], cn, maxD: zoom }) : null), [prof, counts, mode, bwIdx, cn, zoom]);
  const bins = useMemo(() => (prof && mode === "binned" ? binnedSeries(prof, counts, { size: binSize, maxD: zoom }) : null), [prof, counts, mode, binSize, zoom]);
  const w5 = useMemo(() => (prof ? windowSummary(prof, counts, 5000) : null), [prof, counts]);
  const wX = useMemo(() => (prof ? windowSummary(prof, counts, win) : null), [prof, counts, win]);
  const bg = useMemo(() => (cd ? backgroundRate(cd, { patients, filter: f, subset }) : null), [cd, patients, f, subset]);
  const near = useMemo(() => sel.filter((p) => p.dist < win && (sigSide === "both" || p.side === sigSide)), [sel, win, sigSide]);
  const enrich = useMemo(() => (cd ? signatureEnrichment(cd, near, { patients, filter: f }) : []), [cd, near, patients, f]);
  const enrichOther = useMemo(() => (cd && sigSide !== "both" ? signatureEnrichment(cd, sel.filter((p) => p.dist < win && p.side !== sigSide), { patients, filter: f }) : []), [cd, sel, win, sigSide, patients, f]);
  const cands = useMemo(() => candidateRows(enrich), [enrich]);
  const ref = useMemo(() => cosmicReference(cd?.cosmic), [cd]);
  const refit = useMemo(() => refitNear(ref, near), [ref, near]);
  const spec = useMemo(() => (cd ? spectra(cd, sel.filter((p) => p.dist < win), { patients, filter: f }) : null), [cd, sel, win, patients, f]);
  const imd = useMemo(() => interMutationDistances(near), [near]);
  const points = useMemo(() => scatterPoints(sel), [sel]);

  if (!cd) {
    return <Text type="secondary">Not available ({block?.reason || "this mut_junctions.json predates the continuous export (schemaVersion 4)"}).</Text>;
  }
  const isolate = () => {
    const ids = [...new Set(near.map((p) => p.snv))];
    if (!ids.length) return;
    dispatch(singleCellActions.updateLayout({ snvSiteIds: ids, snvCategories: null, snvCellphyOnly: false, snvDriversOnly: false }));
    dispatch(singleCellActions.updateHeatmapType("snv"));
    dispatch(settingsActions.updateTab("7"));
  };
  const summ = (w) =>
    w
      ? `Within ${fmtDist(w.maxD)}: cis ${w.cis.k} SNVs over ${(w.cis.L / 1e3).toFixed(0)} callable kb (mean CN ${f2((2 * w.cis.Lcn) / Math.max(1, w.cis.L))}), trans ${w.trans.k} over ${(w.trans.L / 1e3).toFixed(0)} kb (CN ${f2((2 * w.trans.Lcn) / Math.max(1, w.trans.L))}). Cis/trans rate ratio raw ${fmtRr(w.rr)}, CN-adjusted ${fmtRr(w.rrCn)}; vs the CN-matched background: cis ${fmtRr(w.cisBg)}, trans ${fmtRr(w.transBg)} (CN-adjusted ${fmtRr(w.cisBgCn)} / ${fmtRr(w.transBgCn)}).`
      : "";
  const hasNoisy = Object.keys(cd.patients).some((p) => NOISY.includes(p));
  return (
    <Space direction="vertical" size={10} style={{ width: "100%" }}>
      <Space size={8} wrap>
        <Segmented size="small" value={territory} onChange={setTerritory} options={[{ value: "focal", label: "All callable (CN-normalised)" }, { value: "focal_diploid", label: "Diploid territory only" }]} />
        <Segmented size="small" value={cn ? "cn" : "raw"} onChange={(v) => setCn(v === "cn")} options={[{ value: "cn", label: "CN-adjusted rate" }, { value: "raw", label: "Raw rate" }]} />
        <Select size="small" style={{ width: 140 }} value={f} onChange={setFilter} options={filters.length ? filters : [{ value: "all", label: "All tree sites" }]} />
        <Segmented size="small" value={subset} onChange={setSubset} options={FOCAL_SUBSETS} />
        <Space size={4}><Switch size="small" checked={excludeNear} onChange={setExcludeNear} /><Text style={{ fontSize: TYPE.body }}>exclude &lt; 500 bp</Text></Space>
        {hasNoisy && <Space size={4}><Switch size="small" checked={excludeNoisy} onChange={setExcludeNoisy} /><Text style={{ fontSize: TYPE.body }}>exclude BWH69</Text></Space>}
      </Space>
      <Space size={8} wrap>
        <Segmented size="small" value={mode} onChange={setMode} options={[{ value: "smooth", label: "Continuous (kernel)" }, { value: "binned", label: "Binned" }]} />
        {mode === "smooth" ? (
          <Space size={6} style={{ width: 300 }}>
            <Text style={{ fontSize: TYPE.body, whiteSpace: "nowrap" }}>bandwidth {fmtDist(BANDWIDTHS[bwIdx])}</Text>
            <Slider style={{ width: 160 }} min={0} max={BANDWIDTHS.length - 1} value={bwIdx} onChange={setBwIdx} tooltip={{ formatter: (i) => fmtDist(BANDWIDTHS[i]) }} />
          </Space>
        ) : (
          <Select size="small" style={{ width: 120 }} value={binSize} onChange={setBinSize} options={BIN_SIZES.map((b) => ({ value: b, label: `bins ${fmtDist(b)}` }))} />
        )}
        <Segmented size="small" value={axis} onChange={setAxis} options={[{ value: "linear", label: "Linear" }, { value: "log", label: "Log distance" }]} />
        <Select size="small" style={{ width: 110 }} value={zoom} onChange={setZoom} options={ZOOMS.map((z) => ({ value: z, label: `+/- ${fmtDist(z)}` }))} />
      </Space>
      <Paragraph style={{ marginBottom: 0 }}>{summ(w5)}</Paragraph>
      <MutJunctionDistancePlot points={points} patients={patients} shapeOrder={Object.keys(cd.patients)} smooth={smooth} bins={bins} background={bg} zoom={zoom} axis={axis} cn={cn} onPoint={onPaint ? (p) => onPaint({ id: p.snv, junction: p.junction }) : null} />
      <HintLine
        text={`${patients.length} patient(s): ${patients.join(", ")}. Callable = depth >= 4 in >= 2 of 20 sampled tumour cells (cell CRAMs; ${Object.values(cd.patients)[0]?.bg?.all?.definition || ""}). CN-adjusted = per diploid-equivalent kb (callable x carrier CN / 2), since a side with more copies has more chances to mutate and to be detected. Dashed: expected from the background windows matched by CN class; band: genome background with 95% CI. Kernel: Gaussian, SD = bandwidth, not crossing the breakpoint.`}
      />
      <Alert
        type="warning"
        showIcon
        message="Artefact checks"
        description={`Cis SNVs within ~500 bp of the breakpoint can be mismatches from junction-spanning reads aligned to the fused side (switch "exclude < 500 bp"); BWH69's SNV set is noisy (switch "exclude BWH69"). Currently ${sel.filter((p) => p.dist < 500).length} of ${sel.filter((p) => p.dist < 5000).length} SNVs within 5 kb are < 500 bp from a breakpoint.`}
      />

      <Space size={8} wrap>
        <Text strong>Signatures of SNVs within</Text>
        <Select size="small" style={{ width: 90 }} value={win} onChange={setWin} options={WINDOWS.map((x) => ({ value: x, label: fmtDist(x) }))} />
        <Segmented size="small" value={sigSide} onChange={setSigSide} options={[{ value: "cis", label: "cis" }, { value: "trans", label: "trans" }, { value: "both", label: "both sides" }]} />
        {patientId && <Button size="small" disabled={!near.length} onClick={isolate}>Isolate on SNV heatmap ({new Set(near.map((p) => p.snv)).size})</Button>}
      </Space>
      <Paragraph style={{ marginBottom: 0 }}>{summ(wX)}</Paragraph>
      <Table
        size="small"
        rowKey="signature"
        dataSource={enrich}
        pagination={false}
        locale={{ emptyText: "No SNV in this window" }}
        columns={[
          { title: "Signature", dataIndex: "signature", render: (v) => <Tag color={sigColor(v)}>{v}</Tag> },
          { title: `Expected count near (${sigSide})`, dataIndex: "observed", align: "right", render: (v) => v.toFixed(1) },
          { title: "Expected from background", dataIndex: "expected", align: "right", render: (v) => v.toFixed(1) },
          { title: "Enrichment (95% CI)", key: "r", render: (_, r) => fmtRr({ rr: r.ratio, lo: r.lo, hi: r.hi }) },
          ...(sigSide !== "both"
            ? [{ title: `Other side: count / enrichment`, key: "o", render: (_, r) => { const o = enrichOther.find((x) => x.signature === r.signature); return o ? `${o.observed.toFixed(1)} / ${fmtRr({ rr: o.ratio, lo: o.lo, hi: o.hi })}` : "0"; } }]
            : []),
        ]}
      />
      <Text style={{ fontSize: TYPE.body }}>
        Candidates:{" "}
        {cands.map((c) => (
          <span key={c.signature} style={{ marginRight: 12 }}>
            <Text strong>{c.signature}</Text> ({c.note}): {c.inFit ? `${c.observed.toFixed(1)} vs ${c.expected.toFixed(1)} expected, ${fmtRr({ rr: c.ratio, lo: c.lo, hi: c.hi })}` : "not in this patient's fitted set"}
          </span>
        ))}
      </Text>
      <Text style={{ fontSize: TYPE.body }}>
        Refit of these SNVs alone (stepwise NNLS on the patients' fitted signatures, as the Signatures tab):{" "}
        {refit.status === "ok" ? `${refit.activities.map((a) => `${a.signature} ${(100 * a.share).toFixed(0)}%`).join(", ")} (cosine ${refit.cosine.toFixed(2)}, n=${refit.n})` : `not available (${refit.reason})`}
      </Text>
      {spec && <MutJunctionSpectrum spectra={spec} />}
      <div>
        <Text strong>Inter-mutation distance among these SNVs</Text>
        <Paragraph style={{ marginBottom: 4, fontSize: TYPE.body }}>
          {imd.n} SNVs; {imd.under1kb} have another selected SNV within 1 kb and {imd.under10kb} within 10 kb (median nearest-neighbour {imd.median != null ? fmtDist(imd.median) : "n/a"}). Clustered (kataegis-like) or microhomology-adjacent patterns would show as short distances on the same side of one breakend.
        </Paragraph>
        <Table
          size="small"
          rowKey={(r) => `${r.patient}|${r.snv}|${r.breakend}`}
          dataSource={imd.rows}
          pagination={{ pageSize: 6, size: "small", hideOnSinglePage: true }}
          onRow={(r) => ({ onClick: () => onPaint && onPaint({ id: r.snv, junction: r.junction }), style: { cursor: onPaint ? "pointer" : "default" } })}
          columns={[
            ...(patientId ? [] : [{ title: "Patient", dataIndex: "patient" }]),
            { title: "SNV", dataIndex: "snv" },
            { title: "Gene", dataIndex: "gene", render: (v) => v || "-" },
            { title: "Side / distance", key: "d", render: (_, r) => `${r.side} ${fmtDist(r.dist)}` },
            { title: "Context", dataIndex: "context" },
            { title: "Signature", dataIndex: "sig", render: (v, r) => <span><Tag color={sigColor(v)}>{v || "n/a"}</Tag>{r.sig_post?.[v] != null ? r.sig_post[v].toFixed(2) : ""}</span> },
            { title: "CN", dataIndex: "cn", align: "right" },
            { title: "Nearest other SNV", dataIndex: "imd", render: (v) => (v == null ? "none" : fmtDist(v)) },
            { title: "Carriers shared", key: "c", align: "right", render: (_, r) => `${r.n_shared} (${r.n_snv_cells} / ${r.n_junction_cells})` },
            { title: "Junction", dataIndex: "junction", render: (v, r) => <span>{v} <Text type="secondary">{r.cls}</Text></span> },
          ]}
        />
      </div>
    </Space>
  );
}
