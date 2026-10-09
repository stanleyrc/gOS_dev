import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Card, Col, Row, Segmented, Space, Table, Typography } from "antd";
import singleCellActions from "../../../redux/singleCell/actions";
import { casePath, tryGet } from "../../../redux/singleCell/loaders";
import { cellCycleConcordance } from "../../../helpers/singleCell/precompute";
import useRnaData from "../rna/useRnaData";
import useContainerWidth from "../useContainerWidth";
import NotComputed, { pcFile } from "./notComputed";
import { TYPE } from "../../../helpers/singleCell/plotTheme";
import { Provenance } from "../hintLine";
import ColorTag from "../colorTag";

const { Text } = Typography;
const fmt = (x, d = 2) => (x == null || Number.isNaN(x) ? "–" : x.toFixed(d));
const pct = (x) => (x == null ? "–" : `${Math.round(100 * x)}%`);

function Scatter({ points, width, yKey, yLabel, cloneColors, selected, onPick }) {
  const h = 260;
  const m = { l: 46, r: 12, t: 10, b: 36 };
  const pts = points.filter((p) => p[yKey] != null);
  if (!pts.length) return <Text type="secondary">No cells with both readouts.</Text>;
  const xs = pts.map((p) => p.rtCor);
  const ys = pts.map((p) => p[yKey]);
  const [x0, x1] = [Math.min(...xs, 0), Math.max(...xs, 0.05)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const sx = (v) => m.l + ((v - x0) / (x1 - x0 || 1)) * (width - m.l - m.r);
  const sy = (v) => h - m.b - ((v - y0) / (y1 - y0 || 1)) * (h - m.t - m.b);
  return (
    <svg width={width} height={h} style={{ display: "block" }}>
      <line x1={sx(0)} x2={sx(0)} y1={m.t} y2={h - m.b} stroke="currentColor" opacity={0.2} />
      <line x1={m.l} x2={width - m.r} y1={h - m.b} y2={h - m.b} stroke="currentColor" opacity={0.4} />
      <line x1={m.l} x2={m.l} y1={m.t} y2={h - m.b} stroke="currentColor" opacity={0.4} />
      {[x0, (x0 + x1) / 2, x1].map((v) => (
        <text key={v} x={sx(v)} y={h - m.b + 14} fontSize={11} textAnchor="middle" fill="currentColor">
          {v.toFixed(2)}
        </text>
      ))}
      {[y0, (y0 + y1) / 2, y1].map((v) => (
        <text key={v} x={m.l - 4} y={sy(v) + 3} fontSize={11} textAnchor="end" fill="currentColor">
          {v.toFixed(2)}
        </text>
      ))}
      <text x={(m.l + width) / 2} y={h - 4} fontSize={TYPE.tick} textAnchor="middle" fill="currentColor">
        DNA: coverage vs replication timing (rho)
      </text>
      <text transform={`translate(11,${(h - m.b) / 2}) rotate(-90)`} fontSize={TYPE.tick} textAnchor="middle" fill="currentColor">
        {yLabel}
      </text>
      {pts.map((p) => (
        <circle
          key={p.id}
          cx={sx(p.rtCor)}
          cy={sy(p[yKey])}
          r={selected.has(p.id) ? 5.5 : 4}
          fill={cloneColors[p.clone] || "#888"}
          fillOpacity={0.85}
          stroke={p.sCall ? "#000" : selected.has(p.id) ? "#1677ff" : "none"}
          strokeWidth={p.sCall || selected.has(p.id) ? 1.5 : 0}
          style={{ cursor: "pointer" }}
          onClick={() => onPick(p.id)}
        >
          <title>{`${p.id}\n${p.clone}\nrho ${fmt(p.rtCor, 3)} (z ${fmt(p.rtZ)})${p.sCall ? " · DNA S-phase" : ""}\nRNA ${p.phase || "–"} S ${fmt(p.sScore)} G2M ${fmt(p.g2mScore)}`}</title>
        </circle>
      ))}
    </svg>
  );
}

/** Coverage residual vs replication timing along the genome for one cell (sphase_profiles.json). */
function Profile({ profile, cellId, width }) {
  const h = 150;
  const m = { l: 40, r: 8, t: 8, b: 20 };
  const p = profile?.cells?.[cellId];
  if (!p || !profile?.bins) return <Text type="secondary">Click a cell to see its profile.</Text>;
  const bins = profile.bins;
  const chrom = Array.isArray(bins.chrom) ? bins.chrom : bins.map((b) => b.chrom);
  const rt = Array.isArray(bins.rt) ? bins.rt : bins.map((b) => b.rt);
  const n = chrom.length;
  const x = (i) => m.l + (i / n) * (width - m.l - m.r);
  const r = new Map(p.bin.map((b, k) => [b - 1, p.r[k]]));
  const vals = [...r.values()];
  const lim = Math.max(0.3, ...vals.map((v) => Math.abs(v)).sort((a, b) => a - b).slice(Math.floor(vals.length * 0.98)));
  const y = (v) => m.t + (1 - (v + lim) / (2 * lim)) * (h - m.t - m.b);
  const starts = [];
  chrom.forEach((c, i) => (i === 0 || chrom[i - 1] !== c) && starts.push([c, i]));
  return (
    <svg width={width} height={h} style={{ display: "block" }}>
      {starts.map(([c, i]) => (
        <g key={c}>
          <line x1={x(i)} x2={x(i)} y1={m.t} y2={h - m.b} stroke="currentColor" opacity={0.12} />
          <text x={x(i) + 2} y={h - 6} fontSize={TYPE.micro} fill="currentColor" opacity={0.6}>
            {c.replace("chr", "")}
          </text>
        </g>
      ))}
      {rt.map((v, i) => (
        <rect key={i} x={x(i)} width={Math.max(1, (width - m.l - m.r) / n)} y={y(lim)} height={4} fill={v > 0 ? "#fa8c16" : "#2f54eb"} opacity={Math.min(1, Math.abs(v) / 2)} />
      ))}
      {[...r.entries()].map(([i, v]) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={1.2} fill="currentColor" opacity={0.55} />
      ))}
      <line x1={m.l} x2={width - m.r} y1={y(0)} y2={y(0)} stroke="currentColor" opacity={0.3} />
      <text x={4} y={y(0) + 3} fontSize={TYPE.micro} fill="currentColor">0</text>
      <text x={4} y={m.t + 8} fontSize={TYPE.micro} fill="currentColor">early</text>
    </svg>
  );
}

/**
 * Cell cycle from two independent readouts in the same cells: DNA (coverage of
 * early- vs late-replicating DNA, sphase.json) and RNA (Seurat S / G2M scores).
 * S-phase cells (black outline) can produce spurious copy-number calls; they
 * are also flagged as the "DNA cycle" strip on the heatmap.
 */
export default function CellCycleCard() {
  const dispatch = useDispatch();
  const { cells, cloneColors, selectedCellIds, precompute, patient } = useSelector((s) => s.SingleCell);
  const dataset = useSelector((s) => s.Settings.dataset);
  const sphase = pcFile(precompute, "sphase");
  const { summary: rna } = useRnaData();
  const [ref, width] = useContainerWidth(900);
  const [yKey, setYKey] = useState("sScore");
  const [focus, setFocus] = useState(null);
  const [profile, setProfile] = useState(null);
  const selected = useMemo(() => new Set(selectedCellIds.map(String)), [selectedCellIds]);
  const cloneOf = useMemo(() => new Map(cells.map((c) => [`${c.cell_id}`, c.clone_id ?? "unassigned"])), [cells]);
  const res = useMemo(
    () => (sphase.ok ? cellCycleConcordance(sphase.data, rna?.cells || [], cloneOf) : null),
    [sphase.ok, sphase.data, rna, cloneOf]
  );

  useEffect(() => {
    if (!focus || profile || !patient || !dataset) return;
    tryGet(casePath(dataset, patient.caseReportId, "precompute/sphase_profiles.json")).then((r) => r.status === "ok" && setProfile(r.data));
  }, [focus, profile, patient, dataset]);

  if (!sphase.ok) return <NotComputed what="DNA cell cycle (replication timing)" step="sphase" status={sphase.status} />;
  const pick = (id) => {
    setFocus(id);
    const next = selected.has(id) ? selectedCellIds.filter((c) => `${c}` !== id) : [...selectedCellIds, id];
    dispatch(singleCellActions.updateSelection(next));
  };
  const half = Math.max(280, Math.floor((width - 24) / 2));
  const nS = res.points.filter((p) => p.sCall).length;
  return (
    <Card size="small" title={<span>Cell cycle: DNA replication timing vs RNA <Provenance id="cellCycle" /></span>} ref={ref}>
      <Space direction="vertical" style={{ width: "100%" }} size="small">
        <Text type="secondary" style={{ fontSize: 13 }}>
          {res.points.length} cells scored from DNA, {nS} called S-phase (rho z ≥ 3 vs this patient&apos;s cells; null median{" "}
          {fmt(sphase.data.null?.median_cor, 3)}, MAD {fmt(sphase.data.null?.mad_cor, 3)}). Agreement with RNA over {res.nPaired} cells with both:
          rho vs S.Score {fmt(res.rhoS)}, vs G2M.Score {fmt(res.rhoG2M)}.
        </Text>
        <Row gutter={12}>
          <Col xs={24} lg={12}>
            <Segmented
              size="small"
              value={yKey}
              onChange={setYKey}
              options={[
                { value: "sScore", label: "RNA S score" },
                { value: "g2mScore", label: "RNA G2/M score" },
              ]}
            />
            <Scatter
              points={res.points}
              width={half}
              yKey={yKey}
              yLabel={yKey === "sScore" ? "RNA S.Score" : "RNA G2M.Score"}
              cloneColors={cloneColors}
              selected={selected}
              onPick={pick}
            />
          </Col>
          <Col xs={24} lg={12}>
            <Table
              size="small"
              rowKey="clone"
              pagination={false}
              dataSource={res.perClone}
              columns={[
                { title: "Clone", dataIndex: "clone", render: (c) => <ColorTag color={cloneColors[c]}>{c}</ColorTag> },
                { title: "Cells", dataIndex: "n", width: 60 },
                { title: "S-phase (DNA)", key: "d", render: (_, r) => `${r.dnaS} (${pct(r.dnaFrac)})` },
                { title: "S + G2/M (RNA)", key: "r", render: (_, r) => (r.nRna ? `${r.rnaCycling}/${r.nRna} (${pct(r.rnaFrac)})` : "–") },
              ]}
            />
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              DNA counts cells caught mid-replication; RNA counts cells with S or G2/M programmes, so RNA fractions run higher.
            </Text>
          </Col>
        </Row>
        <div>
          <Text style={{ fontSize: 13 }}>
            {focus ? `${focus}: coverage residual (log2, CN- and GC-normalised) along the genome; top bar = reference timing (orange early)` : ""}
          </Text>
          <Profile profile={profile} cellId={focus} width={width} />
        </div>
      </Space>
    </Card>
  );
}
