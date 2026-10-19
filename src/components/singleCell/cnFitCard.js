import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { Alert, Button, Card, InputNumber, Select, Slider, Space, Typography } from "antd";
import useContainerWidth from "./useContainerWidth";
import usePatientClades from "./usePatientClades";
import { casePath, loadCellTrack, tryGet } from "../../redux/singleCell/loaders";
import {
  allelicFit, blockMeanCn, blockMedian, cladePloidyRows, cnAt, evenSample, fitCurve, histogram, integerFit, normalise,
  ploidySummary, poolByPosition, segmentMeans, solutionOf, stateMean, weightedHistogram,
} from "../../helpers/singleCell/cnFit";

const { Text } = Typography;
const BIN_BLOCK = 10; // 10 kb bins -> 100 kb medians
const MAX_POOLED = 40;
const fmt = (x, d = 2) => (x == null || !Number.isFinite(x) ? "not available" : x.toFixed(d));
const pct = (x) => (x == null ? "not available" : `${(100 * x).toFixed(0)}%`);
const BLUE = "#1F5FA8";
const ORANGE = "#E08A1E";
const GREY = "#8DA0B3";

/** Loads what the fit view needs: one cell (coverage, hetblocks, JaBbA segments, metadata) or a pooled group. */
function useFitData(dataset, cellIds) {
  const [state, setState] = useState({ status: "idle" });
  const key = cellIds.join("|");
  useEffect(() => {
    if (!dataset || !cellIds.length) {
      setState({ status: "idle" });
      return undefined;
    }
    let cancelled = false;
    setState({ status: "loading" });
    (async () => {
      const single = cellIds.length === 1;
      const ids = single ? cellIds : evenSample(cellIds, MAX_POOLED);
      const loaded = [];
      for (let i = 0; i < ids.length; i += 6) {
        // eslint-disable-next-line no-await-in-loop
        const batch = await Promise.all(ids.slice(i, i + 6).map((id) => loadCellTrack(dataset, id, "coverage")));
        loaded.push(...batch);
        if (cancelled) return;
      }
      const ok = loaded.map((r, i) => (r.status === "ok" ? { id: ids[i], x: r.data.dataPointsX, y: r.data.dataPointsY2 } : null)).filter(Boolean);
      if (!ok.length) {
        setState({ status: "missing", reason: `coverage.arrow not available for ${single ? cellIds[0] : "any selected cell"}` });
        return;
      }
      const pooled = single ? null : poolByPosition(ok);
      const one = single ? normalise(ok[0].y) : null;
      const out = { status: "ok", single, ids, used: single ? 1 : pooled.used, requested: cellIds.length, m: blockMedian(single ? one.m : pooled.m, BIN_BLOCK) };
      if (single) {
        const c = { ...ok[0], ...one };
        const [meta, het, total] = await Promise.all([
          tryGet(casePath(dataset, c.id, "metadata.json")),
          tryGet(casePath(dataset, c.id, "hetblocks.json")),
          loadCellTrack(dataset, c.id, "total"),
        ]);
        const rec = meta.status === "ok" ? (Array.isArray(meta.data) ? meta.data[0] : meta.data) || {} : {};
        Object.assign(out, {
          meanY: c.mean,
          ploidy: Number(rec.ploidy) || c.mean,
          purity: Number(rec.qc_purity) > 0 && Number(rec.qc_purity) <= 1 ? Number(rec.qc_purity) : 1,
          xs: c.x,
          ys: c.y,
          segments: total.status === "ok" ? total.data.intervals || [] : null,
          blocks: het.status === "ok" ? (het.data.blocks || []).filter((b) => b.maf != null) : null,
        });
      }
      if (!cancelled) setState(out);
    })().catch((error) => !cancelled && setState({ status: "error", error }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset, key]);
  return state;
}

const STATE_COLOR = (k) => ["#555", "#2E7D32", BLUE, "#7B3F98", "#C2185B", "#E65100", "#6D4C41", "#00838F", "#9E9E9E"][Math.min(k, 8)];

const axisMax = (m) => {
  const sorted = [...m].sort((a, b) => a - b);
  return Math.max(1.6, (sorted[Math.floor(sorted.length * 0.995)] || 2) * 1.05);
};

/** Coverage histogram in segment-mean units with copy-state lines for the fitted and the slider solution. */
function BinHistogram({ width, m, segmentHist, fitSol, sol }) {
  const h = 230;
  const ml = 44, mr = 10, mt = 14, mb = 34;
  const hi = axisMax(m);
  const hist = histogram(m, 0, hi, 120);
  const ymax = Math.max(...hist.counts, 1);
  const px = (v) => ml + (v / hi) * (width - ml - mr);
  const py = (c) => mt + (1 - c / ymax) * (h - mt - mb);
  const bw = (width - ml - mr) / hist.nbins;
  const lines = (s, dash, key) =>
    Array.from({ length: 13 }, (_, k) => k)
      .map((k) => ({ k, x: stateMean(s, k) }))
      .filter((d) => d.x >= 0 && d.x <= hi)
      .map((d) => (
        <g key={`${key}${d.k}`}>
          <line x1={px(d.x)} x2={px(d.x)} y1={mt} y2={h - mb} stroke={dash ? GREY : STATE_COLOR(d.k)} strokeWidth={dash ? 1 : 1.6} strokeDasharray={dash ? "4 3" : undefined} />
          {!dash && <text x={px(d.x)} y={mt - 3} fontSize={11} textAnchor="middle" fill={STATE_COLOR(d.k)}>{d.k}</text>}
        </g>
      ));
  const segLine = segmentHist && segmentHist.map((f, i) => `${i ? "L" : "M"}${(ml + (i / segmentHist.length) * (width - ml - mr)).toFixed(1)},${py(Math.min(ymax, f * m.length)).toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={h} style={{ display: "block" }}>
      {hist.counts.map((c, i) => (
        <rect key={i} x={ml + i * bw} y={py(c)} width={Math.max(1, bw - 0.5)} height={h - mb - py(c)} fill={GREY} opacity={0.55}>
          <title>{`segment mean ${(i * hist.width).toFixed(2)}-${((i + 1) * hist.width).toFixed(2)}: ${c} bins`}</title>
        </rect>
      ))}
      {segLine && <path d={segLine} fill="none" stroke={ORANGE} strokeWidth={1.5} opacity={0.9} />}
      {fitSol && sol && Math.abs(fitSol.ploidy - sol.ploidy) + Math.abs(fitSol.purity - sol.purity) > 1e-6 && lines(fitSol, true, "f")}
      {sol && lines(sol, false, "s")}
      <line x1={ml} x2={width - mr} y1={h - mb} y2={h - mb} stroke="currentColor" opacity={0.4} />
      {[0, 0.5, 1, 1.5, 2, 2.5, 3].filter((v) => v <= hi).map((v) => (
        <text key={v} x={px(v)} y={h - mb + 14} fontSize={11} textAnchor="middle" fill="currentColor">{v}</text>
      ))}
      <text x={(ml + width - mr) / 2} y={h - 4} fontSize={11} textAnchor="middle" fill="currentColor">
        normalised segment mean (100 kb bins; mean = 1)
      </text>
      <text x={12} y={(mt + h - mb) / 2} fontSize={11} textAnchor="middle" fill="currentColor" transform={`rotate(-90 12 ${(mt + h - mb) / 2})`}>bins</text>
    </svg>
  );
}

/** Integer-fit fraction over a ploidy range, with the fitted and slider ploidy marked. */
function FitCurve({ width, curve, fitPloidy, ploidy }) {
  const h = 150;
  const ml = 44, mr = 10, mt = 10, mb = 28;
  const lo = curve[0].ploidy;
  const hi = curve[curve.length - 1].ploidy;
  const px = (p) => ml + ((p - lo) / (hi - lo)) * (width - ml - mr);
  const vals = curve.map((c) => c.fit).filter((v) => v != null);
  const ymin = Math.min(0.4, ...vals);
  const ymax = Math.max(0.8, ...vals);
  const py = (v) => mt + (1 - (v - ymin) / (ymax - ymin)) * (h - mt - mb);
  const d = curve.map((c, i) => `${i ? "L" : "M"}${px(c.ploidy).toFixed(1)},${py(c.fit ?? ymin).toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={h} style={{ display: "block" }}>
      <line x1={ml} x2={width - mr} y1={py(0.5)} y2={py(0.5)} stroke={GREY} strokeDasharray="3 3" />
      <text x={width - mr} y={py(0.5) - 3} fontSize={10} textAnchor="end" fill={GREY}>chance (0.5)</text>
      <path d={d} fill="none" stroke={BLUE} strokeWidth={1.6} />
      <line x1={px(fitPloidy)} x2={px(fitPloidy)} y1={mt} y2={h - mb} stroke={GREY} strokeDasharray="4 3" />
      <line x1={px(ploidy)} x2={px(ploidy)} y1={mt} y2={h - mb} stroke={ORANGE} strokeWidth={1.6} />
      <line x1={ml} x2={width - mr} y1={h - mb} y2={h - mb} stroke="currentColor" opacity={0.4} />
      {[1, 2, 3, 4, 5, 6].filter((v) => v >= lo && v <= hi).map((v) => (
        <text key={v} x={px(v)} y={h - mb + 14} fontSize={11} textAnchor="middle" fill="currentColor">{v}</text>
      ))}
      {[ymin, 0.5, ymax].map((v) => <text key={v} x={ml - 4} y={py(v) + 4} fontSize={10} textAnchor="end" fill="currentColor">{v.toFixed(2)}</text>)}
      <text x={(ml + width - mr) / 2} y={h - 2} fontSize={11} textAnchor="middle" fill="currentColor">trial ploidy (grey: fitted, orange: slider)</text>
    </svg>
  );
}

/** Observed minor-allele fraction of each allelic segment against the lattice of minor/total for the slider's total CN. */
function MafPlot({ width, blocks, sol }) {
  const h = 190;
  const ml = 44, mr = 10, mt = 10, mb = 28;
  const pts = blocks.filter((b) => b._cn != null && b.maf != null && (b.n_snps_d2 ?? 0) >= 50);
  const maxCn = Math.max(4, ...pts.map((b) => Math.round(cnAt(sol, b._m)))) + 0.5;
  const px = (c) => ml + (c / maxCn) * (width - ml - mr);
  const py = (v) => mt + (1 - v / 0.5) * (h - mt - mb);
  const lattice = [];
  for (let t = 1; t <= Math.floor(maxCn); t += 1) for (let mi = 0; mi <= Math.floor(t / 2); mi += 1) lattice.push({ t, v: mi / t });
  const span = Math.max(1, ...pts.map((b) => b.x1 - b.x0));
  return (
    <svg width={width} height={h} style={{ display: "block" }}>
      {lattice.map((l) => <line key={`${l.t}-${l.v}`} x1={px(l.t) - 9} x2={px(l.t) + 9} y1={py(l.v)} y2={py(l.v)} stroke={BLUE} strokeWidth={1.6} />)}
      {pts.map((b, i) => {
        const cn = cnAt(sol, b._m);
        return (
          <circle key={i} cx={px(Math.max(0, cn))} cy={py(Math.min(0.5, b.maf))} r={3 + 7 * Math.sqrt((b.x1 - b.x0) / span)} fill={ORANGE} opacity={0.55}>
            <title>{`chr${b.chr}:${b.start}-${b.end}  CN at slider ${cn.toFixed(2)}; observed minor-allele fraction ${b.maf.toFixed(2)}; fitted solution ${b.major_cn}+${b.minor_cn}`}</title>
          </circle>
        );
      })}
      <line x1={ml} x2={width - mr} y1={h - mb} y2={h - mb} stroke="currentColor" opacity={0.4} />
      {Array.from({ length: Math.floor(maxCn) + 1 }, (_, c) => c).map((c) => <text key={c} x={px(c)} y={h - mb + 14} fontSize={11} textAnchor="middle" fill="currentColor">{c}</text>)}
      {[0, 0.25, 0.5].map((v) => <text key={v} x={ml - 4} y={py(v) + 4} fontSize={10} textAnchor="end" fill="currentColor">{v}</text>)}
      <text x={(ml + width - mr) / 2} y={h - 2} fontSize={11} textAnchor="middle" fill="currentColor">copy number at slider (circles: allelic segments, size by length; blue ticks: achievable minor/total)</text>
    </svg>
  );
}

/** Per-cell ploidy of the group against the rest of the patient: jittered strips with medians. */
function PloidyStrip({ width, groupCells, restCells, label }) {
  const h = 110;
  const ml = 60, mr = 12;
  const all = [...groupCells, ...restCells].map((c) => c.ploidy).filter(Number.isFinite);
  if (!all.length) return null;
  const hi = Math.max(4, Math.ceil(Math.max(...all)));
  const px = (v) => ml + (v / hi) * (width - ml - mr);
  const jit = (k) => ((Math.sin(k * 12.9898) * 43758.5453) % 1 + 1) % 1;
  const row = (cells, y, color, name) => {
    const s = ploidySummary(cells);
    return (
      <g>
        <text x={ml - 6} y={y + 4} fontSize={11} textAnchor="end" fill="currentColor">{name}</text>
        {cells.map((c, i) => Number.isFinite(c.ploidy) && (
          <circle key={c.cell_id} cx={px(c.ploidy)} cy={y - 14 + jit(i) * 28} r={2.4} fill={color} opacity={0.5}>
            <title>{`${c.cell_id}: ploidy ${c.ploidy}`}</title>
          </circle>
        ))}
        {s.median != null && <line x1={px(s.median)} x2={px(s.median)} y1={y - 17} y2={y + 17} stroke={color} strokeWidth={2.5} />}
      </g>
    );
  };
  return (
    <svg width={width} height={h} style={{ display: "block" }}>
      {row(groupCells, 30, ORANGE, label)}
      {row(restCells, 78, GREY, "rest")}
      <line x1={ml} x2={width - mr} y1={h - 14} y2={h - 14} stroke="currentColor" opacity={0.4} />
      {Array.from({ length: hi + 1 }, (_, v) => v).map((v) => <text key={v} x={px(v)} y={h - 2} fontSize={11} textAnchor="middle" fill="currentColor">{v}</text>)}
    </svg>
  );
}

/** Purity / ploidy fit of a cell or a group of cells (selected cells or a clade), adjustable like the bulk fit. */
export default function CnFitCard() {
  const dataset = useSelector((s) => s.Settings.dataset);
  const { cells, selectedCellIds } = useSelector((s) => s.SingleCell);
  const clades = usePatientClades();
  const [wrapRef, width] = useContainerWidth(900);
  const [choice, setChoice] = useState(null);
  const rows = useMemo(() => (clades.status === "ok" ? cladePloidyRows(clades.data.clades, cells) : []), [clades, cells]);
  const options = useMemo(() => {
    const opts = [];
    if (selectedCellIds.length) opts.push({ value: "sel", label: `Selected cells (${selectedCellIds.length})` });
    rows.forEach((r) => opts.push({ value: `clade:${r.id}`, label: `${r.id}  n=${r.cells.length}  median ploidy ${fmt(r.summary.median)}` }));
    const top = [...cells].filter((c) => Number.isFinite(c.ploidy)).sort((a, b) => b.ploidy - a.ploidy).slice(0, 15);
    top.forEach((c) => opts.push({ value: `cell:${c.cell_id}`, label: `${c.cell_id}  ploidy ${c.ploidy}` }));
    return opts;
  }, [rows, cells, selectedCellIds]);
  const active = choice && options.some((o) => o.value === choice) ? choice : options[0]?.value;
  const group = useMemo(() => {
    if (!active) return { ids: [], label: "" };
    if (active === "sel") return { ids: selectedCellIds, label: "selected" };
    if (active.startsWith("clade:")) {
      const r = rows.find((x) => `clade:${x.id}` === active);
      return { ids: r ? r.cells : [], label: r ? r.id.replace(/^.*_/, "") : "clade" };
    }
    return { ids: [active.slice(5)], label: "cell" };
  }, [active, rows, selectedCellIds]);
  const data = useFitData(dataset, group.ids);
  const [ploidy, setPloidy] = useState(null);
  const [purity, setPurity] = useState(1);

  const fitPloidy = data.status === "ok" ? (data.single ? data.ploidy : ploidySummary(group.ids.map((id) => cells.find((c) => c.cell_id === id)).filter(Boolean)).median || 2) : 2;
  const fitPurity = data.status === "ok" && data.single ? data.purity : 1;
  useEffect(() => {
    if (data.status === "ok") {
      setPloidy(Math.round(fitPloidy * 100) / 100);
      setPurity(fitPurity);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.status, group.ids.join("|")]);

  const fitSol = solutionOf(fitPloidy, fitPurity);
  const sol = ploidy != null ? solutionOf(ploidy, purity) : null;

  const segHist = useMemo(() => {
    if (data.status !== "ok" || !data.segments) return null;
    return weightedHistogram(segmentMeans(data.segments, solutionOf(data.meanY, 1)), 0, axisMax(data.m), 120);
  }, [data]);
  const curve = useMemo(() => (data.status === "ok" ? fitCurve(data.m, fitPurity, 1, 6, 0.05) : null), [data, fitPurity]);
  const blocks = useMemo(() => {
    if (data.status !== "ok" || !data.single || !data.blocks) return null;
    return data.blocks.map((b) => {
      const cn = blockMeanCn(data.xs, data.ys, b.x0, b.x1);
      return { ...b, _cn: cn, _m: cn == null ? null : cn / data.meanY };
    }).filter((b) => b._m != null);
  }, [data]);
  const covFit = (s) => (data.status === "ok" && s ? integerFit(data.m, s) : null);
  const alFit = (s) => (blocks && s ? allelicFit(blocks, (b) => cnAt(s, b._m)) : null);
  const fitRows = [
    ["Fitted", fitSol, fitPloidy, fitPurity],
    ["Slider", sol, ploidy, purity],
  ].map(([name, s, p, u]) => ({ name, p, u, cov: covFit(s), al: alFit(s) }));

  const groupCells = group.ids.map((id) => cells.find((c) => c.cell_id === id)).filter(Boolean);
  const inGroup = new Set(group.ids);
  const restCells = cells.filter((c) => !inGroup.has(c.cell_id) && c.clone_id !== "Normal");

  return (
    <Card size="small" title="Purity / ploidy fit" extra={<Text type="secondary">test an alternative ploidy and see how the bins fall on integer copy states</Text>}>
      <div ref={wrapRef}>
        {!options.length ? (
          <Text type="secondary">Not available (no cells with a ploidy).</Text>
        ) : (
          <Space direction="vertical" size={10} style={{ width: "100%" }}>
            <Space wrap>
              <Text>Cells</Text>
              <Select style={{ minWidth: 380 }} size="small" value={active} onChange={setChoice} options={options} showSearch optionFilterProp="label" />
              <Text type="secondary">clades are ranked by median ploidy; select cells in the heatmap to fit them together</Text>
            </Space>
            {data.status === "loading" && <Text type="secondary">Loading coverage...</Text>}
            {data.status === "missing" && <Text type="secondary">{`Not available (${data.reason}).`}</Text>}
            {data.status === "error" && <Alert type="error" showIcon message={`Could not load: ${data.error?.message || "error"}`} />}
            {data.status === "ok" && sol && (
              <>
                <Space wrap size={[16, 4]}>
                  <Text>Ploidy</Text>
                  <Slider style={{ width: 240 }} min={1} max={6} step={0.01} value={ploidy} onChange={setPloidy} />
                  <InputNumber size="small" min={1} max={6} step={0.05} value={ploidy} onChange={(v) => v && setPloidy(v)} />
                  <Text>Purity</Text>
                  <Slider style={{ width: 160 }} min={0.2} max={1} step={0.01} value={purity} onChange={setPurity} />
                  <InputNumber size="small" min={0.2} max={1} step={0.05} value={purity} onChange={(v) => v && setPurity(v)} />
                  <Button size="small" onClick={() => { setPloidy(Math.round(fitPloidy * 100) / 100); setPurity(fitPurity); }}>Reset to fit</Button>
                  <Button size="small" onClick={() => setPloidy(Math.min(6, Math.round(fitPloidy * 200) / 100))}>x2 (WGD)</Button>
                  <Button size="small" onClick={() => setPloidy(Math.max(1, Math.round(fitPloidy * 50) / 100))}>x0.5</Button>
                </Space>
                {!data.single && (
                  <Text type="secondary">
                    {`Pooled coverage of ${data.used} of ${data.requested} cells${data.requested > MAX_POOLED ? ` (an even sample of ${MAX_POOLED})` : ""}; fitted ploidy is the median of the cells' ploidy. Allelic support is shown for single cells.`}
                  </Text>
                )}
                <table style={{ borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>{["", "ploidy", "purity", "bins within 0.25 of an integer CN (chance 50%)", "allelic gap (|observed - nearest minor/total|)", "allelic segments within 0.1"].map((h) => <th key={h} style={{ textAlign: "left", padding: "2px 10px", fontWeight: 600 }}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {fitRows.map((r) => (
                      <tr key={r.name}>
                        <td style={{ padding: "2px 10px" }}>{r.name}</td>
                        <td style={{ padding: "2px 10px" }}>{fmt(r.p)}</td>
                        <td style={{ padding: "2px 10px" }}>{fmt(r.u)}</td>
                        <td style={{ padding: "2px 10px" }}>{pct(r.cov)}</td>
                        <td style={{ padding: "2px 10px" }}>{r.al ? `${fmt(r.al.gap, 3)} over ${r.al.blocks} segments` : data.single ? "not available (no hetblocks.json)" : "single cells only"}</td>
                        <td style={{ padding: "2px 10px" }}>{r.al ? pct(r.al.within) : "not available"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <BinHistogram width={width} m={data.m} segmentHist={data.single ? segHist : null} fitSol={fitSol} sol={sol} />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Grey bars: coverage bins. Lines: copy states 0, 1, 2, ... at the slider (dashed grey: fitted solution). {data.single && (data.segments ? "Orange line: JaBbA segments (length-weighted)." : "JaBbA segments not available (no complex.json).")}
                </Text>
                <FitCurve width={width} curve={curve} fitPloidy={fitPloidy} ploidy={ploidy} />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Coverage alone cannot separate a genome from its doubled copy (both put the bins on integer states), so compare the allelic gap: segments with a minor-allele fraction that no integer split of the slider's copy number can give point to a wrong ploidy.
                </Text>
                {blocks && <MafPlot width={width} blocks={blocks} sol={sol} />}
                <PloidyStrip width={width} groupCells={groupCells} restCells={restCells} label={group.label} />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Per-cell fitted ploidy: this group (orange) against the rest of the patient (grey); bars mark medians.
                </Text>
              </>
            )}
          </Space>
        )}
      </div>
    </Card>
  );
}
