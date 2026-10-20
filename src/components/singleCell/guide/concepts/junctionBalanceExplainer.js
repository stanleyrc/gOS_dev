import React, { useMemo, useRef, useState } from "react";
import { Alert, Button, InputNumber, Slider, Space, Switch, Tag, Typography } from "antd";
import useContainerWidth from "../../useContainerWidth";
import usePlotTheme from "../../usePlotTheme";
import { fitBalance, looseEnds, sideKey, sideLoads, telomereSides, totalLoose, toyGenome } from "../../../../helpers/singleCell/concepts/junctionBalance";
import { cohortHref, conceptHref, patientHref } from "../../../../helpers/singleCell/concepts/conceptsCatalog";
import ExplainerShell, { RealLink } from "./explainerShell";

const { Text, Paragraph } = Typography;
const MAX_CN = 5;
const ALT_COLOR = { del: "#2C4AA8", dup: "#D62728", spur: "#8C8C8C" };

function GraphSvg({ segments, junctions, segCn, junc, bins, showCov, loose, onDragCn, width }) {
  const theme = usePlotTheme();
  const left = 40;
  const right = 14;
  const arcH = 86;
  const rowH = 34;
  const top = arcH + 10;
  const h = top + MAX_CN * rowH + 34;
  const gap = 16;
  const nb = segments.reduce((a, s) => a + s.nBins, 0);
  const bx = (width - left - right - gap * (segments.length - 1)) / nb;
  const x0 = {};
  let acc = left;
  segments.forEach((s) => { x0[s.id] = acc; acc += s.nBins * bx + gap; });
  const x1 = (id) => x0[id] + segments.find((s) => s.id === id).nBins * bx;
  const y = (cn) => top + (MAX_CN - Math.max(0, Math.min(MAX_CN + 0.4, cn))) * rowH;
  const sideX = (e) => (e.side === "L" ? x0[e.seg] : x1(e.seg));
  const telo = telomereSides(segments);
  const drag = useRef(null);
  const svgRef = useRef(null);
  const toCn = (evt) => {
    const r = svgRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(MAX_CN, Math.round(MAX_CN - (evt.clientY - r.top - top) / rowH)));
  };
  const looseBy = Object.fromEntries(loose.map((l) => [l.key, l.diff]));
  return (
    <svg ref={svgRef} width={width} height={h} style={{ display: "block", touchAction: "none", userSelect: "none" }}
      onPointerMove={(e) => { if (drag.current) onDragCn(drag.current, toCn(e)); }}
      onPointerUp={() => { drag.current = null; }} onPointerLeave={() => { drag.current = null; }}>
      {Array.from({ length: MAX_CN + 1 }, (_, c) => (
        <g key={c}>
          <line x1={left} x2={width - right} y1={y(c)} y2={y(c)} stroke={theme.grid} />
          <text x={left - 8} y={y(c) + 4} textAnchor="end" fontSize={11.5} fill={theme.muted}>{c}</text>
        </g>
      ))}
      <text x={10} y={top + (MAX_CN * rowH) / 2} fontSize={12} fill={theme.textSecondary} transform={`rotate(-90 10 ${top + (MAX_CN * rowH) / 2})`} textAnchor="middle">copy number</text>
      {showCov && bins.map((b) => (
        <circle key={`${b.seg}-${b.i}`} cx={x0[b.seg] + (b.i + 0.5) * bx} cy={y(b.cov)} r={2.6} fill={theme.faint} opacity={0.8} />
      ))}
      {junctions.filter((j) => j.type === "REF").map((j) => {
        const s = junc[j.id];
        const xa = sideX(j.a);
        const xb = sideX(j.b);
        const ya = y(segCn[j.a.seg]);
        const yb = y(segCn[j.b.seg]);
        return (
          <g key={j.id} opacity={s.on ? 1 : 0.35}>
            <path d={`M${xa},${ya} C${xa + gap / 2},${ya} ${xb - gap / 2},${yb} ${xb},${yb}`} fill="none" stroke={theme.textSecondary} strokeWidth={s.on && s.cn > 0 ? 1 + s.cn : 1} strokeDasharray={s.on && s.cn > 0 ? null : "3 3"} />
            <text x={(xa + xb) / 2} y={Math.min(ya, yb) - 6} textAnchor="middle" fontSize={11} fill={theme.muted}>{s.on ? s.cn : "off"}</text>
          </g>
        );
      })}
      {junctions.filter((j) => j.type === "ALT").map((j, k) => {
        const s = junc[j.id];
        const xa = sideX(j.a);
        const xb = sideX(j.b);
        const ya = y(segCn[j.a.seg]);
        const yb = y(segCn[j.b.seg]);
        const peak = 14 + k * 22;
        const col = ALT_COLOR[j.id] || theme.accent;
        return (
          <g key={j.id} opacity={s.on ? 1 : 0.3}>
            <path d={`M${xa},${ya} C${xa},${peak} ${xb},${peak} ${xb},${yb}`} fill="none" stroke={col} strokeWidth={s.on && s.cn > 0 ? 1.2 + s.cn : 1.2} strokeDasharray={s.on && s.cn > 0 ? null : "4 3"} />
            <text x={(xa + xb) / 2} y={0.125 * ya + 0.75 * peak + 0.125 * yb - 5} textAnchor="middle" fontSize={11.5} fill={col} style={{ paintOrder: "stroke", stroke: theme.panel, strokeWidth: 3 }}>{`${j.label} ${s.on ? `×${s.cn}` : "(off)"}`}</text>
          </g>
        );
      })}
      {segments.map((s) => (
        <g key={s.id} style={{ cursor: "ns-resize" }} onPointerDown={(e) => { drag.current = s.id; e.currentTarget.ownerSVGElement.setPointerCapture?.(e.pointerId); }}>
          <rect x={x0[s.id]} y={y(segCn[s.id]) - 10} width={x1(s.id) - x0[s.id]} height={20} fill="transparent" />
          <rect x={x0[s.id]} y={y(segCn[s.id]) - 4} width={x1(s.id) - x0[s.id]} height={8} rx={2} fill={theme.text} />
          <text x={(x0[s.id] + x1(s.id)) / 2} y={h - 12} textAnchor="middle" fontSize={12} fill={theme.textSecondary}>{`${s.label} (CN ${segCn[s.id]})`}</text>
        </g>
      ))}
      {segments.flatMap((s) => ["L", "R"].map((side) => {
        const k = sideKey(s.id, side);
        const x = side === "L" ? x0[s.id] : x1(s.id);
        const yy = y(segCn[s.id]);
        if (telo.has(k)) return <rect key={k} x={x - (side === "L" ? 4 : 0)} y={yy - 9} width={4} height={18} fill={theme.faint}><title>telomere: no junction needed</title></rect>;
        const d = looseBy[k];
        if (!d) return null;
        const dx = side === "L" ? -10 : 10;
        return (
          <g key={k}>
            <line x1={x} y1={yy} x2={x + dx} y2={yy + 18} stroke={theme.danger} strokeWidth={2.5} />
            <circle cx={x + dx} cy={yy + 18} r={3} fill={theme.danger} />
            <text x={x + dx * 1.4} y={yy + (side === "L" ? 32 : 44)} textAnchor="middle" fontSize={11.5} fontWeight={600} fill={theme.danger}>{`${d > 0 ? "+" : ""}${d}`}</text>
            <title>{`loose end at ${k}: segment CN ${segCn[s.id]}, junctions carry ${segCn[s.id] - d}`}</title>
          </g>
        );
      }))}
    </svg>
  );
}

function BalanceToy() {
  const [seed, setSeed] = useState(7);
  const [noise, setNoise] = useState(0.35);
  const toy = useMemo(() => toyGenome({ seed, noise }), [seed, noise]);
  const init = () => ({ seg: Object.fromEntries(toy.segments.map((s) => [s.id, s.trueCn])), junc: Object.fromEntries(toy.junctions.map((j) => [j.id, { cn: j.trueCn, on: true }])) });
  const [state, setState] = useState(init);
  const [lambda, setLambda] = useState(1);
  const [showCov, setShowCov] = useState(true);
  const [fit, setFit] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ref, width] = useContainerWidth(900);
  const segs = toy.segments;
  const juncs = toy.junctions.map((j) => ({ ...j, cn: state.junc[j.id].cn, on: state.junc[j.id].on }));
  const loose = looseEnds(segs, juncs, (s) => state.seg[s.id], (j) => j.cn);
  const load = sideLoads(segs, juncs);
  const setSeg = (id, cn) => { setFit(null); setState((st) => ({ ...st, seg: { ...st.seg, [id]: cn } })); };
  const setJ = (id, patch) => { setFit(null); setState((st) => ({ ...st, junc: { ...st.junc, [id]: { ...st.junc[id], ...patch } } })); };
  const coverageOnly = () => {
    const seg = {};
    segs.forEach((s) => { const v = toy.bins.filter((b) => b.seg === s.id).map((b) => b.cov); seg[s.id] = Math.max(0, Math.min(MAX_CN, Math.round(v.reduce((a, x) => a + x, 0) / v.length))); });
    const junc = Object.fromEntries(toy.junctions.map((j) => [j.id, { cn: j.type === "REF" ? 2 : 0, on: state.junc[j.id].on }]));
    setFit({ label: "coverage only: each segment rounded alone, junctions at the default (REF 2, ALT 0)" });
    setState({ seg, junc });
  };
  const runFit = () => {
    setBusy(true);
    setTimeout(() => {
      const f = fitBalance({ segments: segs, junctions: juncs, bins: toy.bins, sd: Math.max(0.1, noise), lambda });
      setState({ seg: f.segCn, junc: Object.fromEntries(toy.junctions.map((j) => [j.id, { cn: f.juncCn[j.id] ?? 0, on: state.junc[j.id].on }])) });
      setFit({ label: `balanced fit: ${f.n.toLocaleString()} junction assignments tried, cost ${f.cost.toFixed(1)} (coverage ${f.coverage.toFixed(1)} + ${lambda} × ${totalLoose(f.loose)} loose copies)` });
      setBusy(false);
    }, 30);
  };
  const reset = () => { setFit(null); setState(init()); };
  const nLoose = totalLoose(loose);
  return (
    <Space direction="vertical" size={10} style={{ width: "100%" }}>
      <Paragraph style={{ marginBottom: 0 }}>
        Six segments of one toy chromosome (black bars at their copy number; grey dots are noisy coverage bins). Grey curves are reference (REF) junctions between neighbours, coloured arcs are ALT junctions: a one-copy <Text strong style={{ color: ALT_COLOR.del }}>deletion</Text> of s2, a <Text strong style={{ color: ALT_COLOR.dup }}>tandem duplication</Text> of s4-s5 and a <Text strong>spurious</Text> candidate. <Text strong>Drag a segment up or down</Text>, change junction copies or switch junctions off, and watch the <Text type="danger" strong>loose ends</Text> (red) appear where copies are not accounted for.
      </Paragraph>
      <div ref={ref} style={{ width: "100%" }}>
        <GraphSvg segments={segs} junctions={juncs} segCn={state.seg} junc={state.junc} bins={toy.bins} showCov={showCov} loose={loose} width={width} onDragCn={(id, cn) => { if (state.seg[id] !== cn) setSeg(id, cn); }} />
      </div>
      <Space wrap size={[16, 8]}>
        {nLoose === 0 ? <Tag color="green">balanced: no loose ends</Tag> : <Tag color="red">{`${loose.length} loose end${loose.length === 1 ? "" : "s"}, ${nLoose} cop${nLoose === 1 ? "y" : "ies"} unaccounted`}</Tag>}
        <Button size="small" onClick={coverageOnly}>Coverage only</Button>
        <Button size="small" type="primary" loading={busy} onClick={runFit}>Fit under balance</Button>
        <Button size="small" onClick={reset}>Reset to the toy truth</Button>
        <Space size={4}><Switch size="small" checked={showCov} onChange={setShowCov} /><Text>coverage</Text></Space>
        <Space size={6}><Text>noise sd</Text><Slider style={{ width: 120 }} min={0.1} max={0.8} step={0.05} value={noise} onChange={(v) => { setNoise(v); setFit(null); }} /></Space>
        <Space size={6}><Text>loose-end penalty λ</Text><InputNumber size="small" min={0} max={20} step={0.5} value={lambda} onChange={(v) => setLambda(v ?? 0)} style={{ width: 70 }} /></Space>
        <Button size="small" onClick={() => { setSeed((s) => s + 1); setFit(null); }}>Redraw noise</Button>
      </Space>
      {fit && <Alert type="info" showIcon message={fit.label} />}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", fontSize: 13 }}>
        {toy.junctions.map((j) => (
          <Space key={j.id} size={6}>
            <Switch size="small" checked={state.junc[j.id].on} onChange={(v) => setJ(j.id, { on: v })} />
            <Text style={{ color: ALT_COLOR[j.id], minWidth: 110, display: "inline-block" }}>{j.type === "REF" ? `REF ${j.a.seg}-${j.b.seg}` : `ALT ${j.label}`}</Text>
            <InputNumber size="small" min={0} max={4} value={state.junc[j.id].cn} disabled={!state.junc[j.id].on} onChange={(v) => setJ(j.id, { cn: v ?? 0 })} style={{ width: 56 }} />
          </Space>
        ))}
      </div>
      <Text type="secondary" style={{ fontSize: 12.5 }}>
        {`Balance check, s3 for example: CN ${state.seg.s3}; left side junctions carry ${load["s3.L"]} (REF s2-s3 + deletion), right side ${load["s3.R"]} (REF s3-s4). `}
        The fit tries every integer copy number of the switched-on junctions and, for each, the best segment copy numbers; it minimises coverage misfit plus λ per loose copy. Switch the deletion off and fit again: the coverage dip of s2 now costs two loose ends (or, with a large λ, gets painted over).
      </Text>
    </Space>
  );
}

export default function JunctionBalanceExplainer({ concept, onView, onConcept }) {
  const pLink = (p, tab, extra, label) => <RealLink href={patientHref(p, tab, extra)}>{label}</RealLink>;
  const cLink = (v, label) => <RealLink href={cohortHref(v)} onClick={onView ? () => onView(v) : null}>{label}</RealLink>;
  return (
    <ExplainerShell
      title={concept.title}
      intro={[
        "Read depth tells you how many copies of each stretch of the genome a cell carries, but not how the stretches are connected. Junctions (structural variants, plus the reference adjacencies between neighbours) are those connections.",
        "Copy number is conserved where segments meet: every copy of a segment must leave through a junction on its left and on its right. So a segment's copy number equals the summed copy number of the junctions on each of its sides. This is junction balance, the constraint JaBbA uses to fit a genome graph.",
        "When the junctions cannot account for a copy-number change, the difference is a loose end: a missing junction (an undetected rearrangement, a telomere gain) or a segmentation error. Fitting copy numbers under balance makes the junctions and the coverage explain each other.",
      ]}
      toy={<BalanceToy />}
      paper={(
        <Space direction="vertical" size={6}>
          <Text>Every cell has a balanced genome graph; the junction copy number in each cell is what the junction heatmaps and the ecDNA walks are built from.</Text>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>Junction copy number per cell, on the tree: {pLink("BWH69", 7, { heatmap: "junctions" }, "BWH69, Single-Cell tab, junction heatmap")}.</li>
            <li>Balanced graphs drawn as circos per cell: {pLink("BWH70", 13, {}, "BWH70, Circos tab")}.</li>
            <li>ecDNA walks read off balanced graphs: {pLink("BWH69", 14, {}, "BWH69, ecDNA tab")}; across the cohort: {cLink("amplicons", "ecDNA view")}.</li>
            <li>Figures: {cLink("paperfig3", "Fig 3 (amplicons across the cohort)")}, {cLink("paperfig5", "Fig 5 (ecDNA recombination and integration)")}.</li>
            <li>Next: <RealLink href={conceptHref("joint")} onClick={onConcept ? () => onConcept("joint") : null}>joint junction balance across cells</RealLink>, the extension used in this paper.</li>
          </ul>
        </Space>
      )}
      refs={concept.refs}
    />
  );
}
