import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { Alert, Card, Checkbox, Empty, Segmented, Select, Space, Typography } from "antd";
import { casePath, tryGet } from "../../../redux/singleCell/loaders";
import { QUADRANT_LABEL, cardPoints, detailGenes, detailOutcomes, detailSources, extent, fmtEffect, quadrant } from "../../../helpers/singleCell/ecdnaPlasticity";
import { subscribeEvidence, takeEvidence } from "../../../helpers/singleCell/evidenceFocus";
import { PATIENT_PALETTE } from "../../../helpers/singleCell/patientColors";
import { TYPE } from "../../../helpers/singleCell/plotTheme";
import useContainerWidth from "../useContainerWidth";
import usePlotTheme from "../usePlotTheme";

const { Text } = Typography;
const H = 280;
const M = { l: 50, r: 14, t: 10, b: 40 };
const SRC_LABEL = { walk: "ecDNA walk copies", total: "Total gene CN" };

function CnScatter({ points, xLabel, yLabel, theme, colorOf }) {
  const [ref, width] = useContainerWidth(520);
  const W = Math.max(300, width);
  const [x0, x1] = extent(points.map((p) => p.x));
  const [y0, y1] = extent(points.map((p) => p.y));
  const pad = (a, b) => (b > a ? (b - a) * 0.06 : 1);
  const sx = (v) => M.l + ((v - (x0 - pad(x0, x1))) / (x1 - x0 + 2 * pad(x0, x1))) * (W - M.l - M.r);
  const sy = (v) => H - M.b - ((v - (y0 - pad(y0, y1))) / (y1 - y0 + 2 * pad(y0, y1))) * (H - M.t - M.b);
  return (
    <div ref={ref} style={{ width: "100%" }}>
      <svg width={W} height={H} role="img">
        <title>{`${xLabel} against ${yLabel}`}</title>
        <line x1={M.l} x2={W - M.r} y1={H - M.b} y2={H - M.b} stroke={theme.muted} />
        <line x1={M.l} x2={M.l} y1={M.t} y2={H - M.b} stroke={theme.muted} />
        {[x0, (x0 + x1) / 2, x1].map((v, i) => (
          <text key={i} x={sx(v)} y={H - M.b + 15} textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"} fontSize={TYPE.tick} fill={theme.muted}>{Math.abs(v) < 10 ? v.toFixed(1) : Math.round(v)}</text>
        ))}
        {[y0, (y0 + y1) / 2, y1].map((v, i) => (
          <text key={i} x={M.l - 6} y={sy(v)} dy="0.35em" textAnchor="end" fontSize={TYPE.tick} fill={theme.muted}>{Math.abs(v) < 10 ? v.toFixed(1) : Math.round(v)}</text>
        ))}
        <text x={(M.l + W - M.r) / 2} y={H - 5} textAnchor="middle" fontSize={TYPE.label} fill={theme.textSecondary}>{xLabel}</text>
        <text transform={`rotate(-90 12 ${(M.t + H - M.b) / 2})`} x={12} y={(M.t + H - M.b) / 2} textAnchor="middle" fontSize={TYPE.label} fill={theme.textSecondary}>{yLabel}</text>
        {points.map((p) => (
          <circle key={p.id} cx={sx(p.x)} cy={sy(p.y)} r={4} fill={colorOf(p.clone)} fillOpacity={0.8} stroke={theme.panel} strokeWidth={0.5}>
            <title>{`${p.id} · clone ${p.clone} · clade ${p.clade}`}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}

/**
 * ecDNA plasticity card (patient ecDNA tab): per-cell copy number of an oncogene (ecDNA walk copies
 * or total gene CN, toggle) against a program score / state, coloured by clone, with the clade-residual
 * test. Reads <patient>/ecdna_plasticity.json (srctools gos_sc_ecdna_plasticity.py).
 */
export default function CnStateCard() {
  const dataset = useSelector((s) => s.Settings.dataset);
  const patient = useSelector((s) => s.SingleCell.patient?.caseReportId);
  const theme = usePlotTheme();
  const [state, setState] = useState({ status: "loading", detail: null });
  const [gene, setGene] = useState(null);
  const [source, setSource] = useState("total");
  const [outcome, setOutcome] = useState(null);
  const [residual, setResidual] = useState(false);

  useEffect(() => {
    if (!dataset || !patient) return undefined;
    let live = true;
    setState({ status: "loading", detail: null });
    tryGet(casePath(dataset, patient, "ecdna_plasticity.json")).then((r) => {
      if (live) setState(r.status === "ok" && r.data?.rows ? { status: "ok", detail: r.data } : { status: "none", detail: null });
    });
    return () => {
      live = false;
    };
  }, [dataset, patient]);
  const { detail } = state;
  const genes = useMemo(() => detailGenes(detail), [detail]);
  // initial gene / source: the cohort view's click (queued request or ?gene=), else the most plastic gene
  useEffect(() => {
    if (!genes.length) return undefined;
    const apply = () => {
      const req = takeEvidence("ecplast", patient);
      const q = new URLSearchParams(window.location.search);
      const want = req?.gene || (q.get("tab") === "14" ? q.get("gene") : null);
      const src = req?.source || (q.get("tab") === "14" ? q.get("cnsource") : null);
      if (want && genes.includes(want)) {
        setGene(want);
        if (src === "walk" || src === "total") setSource(src);
      }
    };
    setGene((g) => (g && genes.includes(g) ? g : genes[0]));
    apply();
    return subscribeEvidence(apply);
  }, [genes, patient]);
  const sources = useMemo(() => (gene ? detailSources(detail, gene) : []), [detail, gene]);
  const src = sources.includes(source) ? source : sources[0];
  const outcomes = useMemo(() => (gene && src ? detailOutcomes(detail, gene, src) : []), [detail, gene, src]);
  const out = outcomes.find((o) => o.outcome === outcome) || outcomes[0];
  const points = useMemo(() => (out ? cardPoints(detail, gene, src, out.outcome, residual) : []), [detail, gene, src, out, residual]);
  const colorOf = useMemo(() => {
    const clones = [...new Set(points.map((p) => p.clone))].sort();
    return (c) => PATIENT_PALETTE[clones.indexOf(c) % PATIENT_PALETTE.length];
  }, [points]);
  if (state.status === "loading") return null;
  if (!detail || !genes.length) {
    return (
      <Card size="small" title="ecDNA plasticity: copy number vs cell state">
        <Empty description="No oncogene is amplified in at least 10% of this patient's tumour cells, or ecdna_plasticity.json is not exported." />
      </Card>
    );
  }
  const row = detail.rows.find((r) => r.gene === gene);
  const s = row?.sources?.[src];
  const clones = [...new Set(points.map((p) => p.clone))].sort();
  return (
    <Card
      size="small"
      title="ecDNA plasticity: copy number vs cell state"
      extra={
        <Space wrap>
          <Select size="small" value={gene} onChange={setGene} style={{ width: 90 }} options={genes.map((g) => ({ value: g, label: g }))} />
          <Segmented size="small" value={src} onChange={setSource} options={sources.map((k) => ({ value: k, label: SRC_LABEL[k] }))} />
          <Select size="small" value={out?.outcome} onChange={setOutcome} style={{ width: 230 }} options={outcomes.map((o) => ({ value: o.outcome, label: `${o.label} (resid q ${Number.isFinite(o.q_resid) ? o.q_resid.toFixed(3) : "n/a"})` }))} />
          <Checkbox checked={residual} onChange={(e) => setResidual(e.target.checked)}>Residual after clade mean</Checkbox>
        </Space>
      }
    >
      {s && (
        <Alert
          type={quadrant(s) === "plastic" ? "warning" : "info"}
          showIcon
          style={{ marginBottom: 8 }}
          message={QUADRANT_LABEL[quadrant(s)]}
          description={
            <span>
              {gene} ({SRC_LABEL[src]}): CV {s.cv?.toFixed(2)}, tree heritability rho {s.heritability.rho.toFixed(2)} (within-clone permutation p {s.heritability.p_within_clone < 0.001 ? "<0.001" : s.heritability.p_within_clone.toFixed(3)}).
              {out && <> {out.label}: CN effect {fmtEffect(out.beta, out.q)}; residual-CN effect {fmtEffect(out.beta_resid, out.q_resid)} (outcome SD per SD of CN rank, controlling clone and cycling; n = {out.n} RNA-linked cells).</>}
              {s.expr && <> Expression of {gene} vs CN: rho {s.expr.rho.toFixed(2)}.</>} S-phase cells carry inflated CN; cycling is controlled.
            </span>
          }
        />
      )}
      {points.length ? (
        <>
          <CnScatter points={points} theme={theme} colorOf={colorOf} xLabel={`${gene} ${SRC_LABEL[src]}${residual ? ", residual vs clade mean" : ""}`} yLabel={out ? out.label : ""} />
          <Space size={10} wrap style={{ marginTop: 4 }}>
            {clones.map((c) => (
              <span key={c}><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 5, background: colorOf(c), marginRight: 4 }} /><Text type="secondary">{`${c}`.startsWith("Clone") ? c : `clone ${c}`}</Text></span>
            ))}
          </Space>
        </>
      ) : (
        <Empty description="No RNA-linked cells for this selection." />
      )}
    </Card>
  );
}
