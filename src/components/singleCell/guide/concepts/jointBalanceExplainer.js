import React, { useMemo, useState } from "react";
import { Button, Slider, Space, Tag, Typography } from "antd";
import useContainerWidth from "../../useContainerWidth";
import usePlotTheme from "../../usePlotTheme";
import { jointViews, toyCells, TOY_BREAKENDS } from "../../../../helpers/singleCell/concepts/jointBalance";
import { cohortHref, conceptHref, patientHref } from "../../../../helpers/singleCell/concepts/conceptsCatalog";
import ExplainerShell, { RealLink } from "./explainerShell";

const { Text, Paragraph } = Typography;
const CN_FILL = { 0: "#2166ac", 1: "#7fa9d6", 3: "#f2a07b", 4: "#d6604d", 5: "#a50f15" };
// shared junctions of the toy: [breakend a, breakend b] (44 joins the lost arm to another chromosome)
const TOY_JUNCTIONS = [[14, 28], [28, 44], [44, null]];

const Sw = ({ c, b }) => <span style={{ display: "inline-block", width: 11, height: 11, background: c, border: `1px solid ${b}`, verticalAlign: "-1px" }} />;

function Panel({ title, view, width, theme, showJunctions = false, note }) {
  const labelW = 54;
  const rowH = 18;
  const arcH = showJunctions ? 34 : 0;
  const nBins = 60;
  const bw = (width - labelW - 8) / nBins;
  const x = (b) => labelW + b * bw;
  const h = arcH + view.rows.length * (rowH + 8) + 6;
  return (
    <div style={{ marginBottom: 8 }}>
      <Space size={8} wrap>
        <Text strong>{title}</Text>
        <Tag>{`${view.nSegments} segments`}</Tag>
        <Tag color={view.loose ? "red" : "green"}>{`${view.loose} loose end${view.loose === 1 ? "" : "s"}`}</Tag>
        {note && <Text type="secondary" style={{ fontSize: 12.5 }}>{note}</Text>}
      </Space>
      <svg width={width} height={h} style={{ display: "block" }}>
        {showJunctions && TOY_JUNCTIONS.map(([a, b]) => (b == null
          ? <g key={a}><line x1={x(a)} x2={x(a) + 14} y1={arcH - 2} y2={8} stroke={theme.accent} strokeWidth={2} /><text x={x(a) + 17} y={12} fontSize={11} fill={theme.accent}>to another chromosome</text></g>
          : <path key={a} d={`M${x(a)},${arcH - 2} C${x(a)},4 ${x(b)},4 ${x(b)},${arcH - 2}`} fill="none" stroke={theme.accent} strokeWidth={2} />))}
        {view.rows.map((r, k) => {
          const y0 = arcH + k * (rowH + 8);
          return (
            <g key={r.id}>
              <text x={0} y={y0 + rowH - 5} fontSize={11.5} fill={theme.textSecondary}>{r.id}</text>
              {r.cn.map((c, i) => <rect key={i} x={x(i)} y={y0} width={bw + 0.3} height={rowH} fill={CN_FILL[c] || theme.empty} />)}
              {r.breaks.map((b) => <line key={`b${b}`} x1={x(b)} x2={x(b)} y1={y0 - 2} y2={y0 + rowH + 2} stroke={theme.text} strokeWidth={1.4} />)}
              {r.loose.map((b) => <path key={`l${b}`} d={`M${x(b)},${y0 + rowH + 1} l-4,6 h8 z`} fill={theme.danger}><title>{`loose end: breakpoint at bin ${b} has no junction`}</title></path>)}
            </g>
          );
        })}
        {showJunctions && TOY_BREAKENDS.map((b) => <line key={b} x1={x(b)} x2={x(b)} y1={arcH - 2} y2={h} stroke={theme.accent} strokeDasharray="2 3" opacity={0.6} />)}
      </svg>
    </div>
  );
}

function JointBalanceToy() {
  const theme = usePlotTheme();
  const [seed, setSeed] = useState(11);
  const [jitter, setJitter] = useState(2);
  const [tol, setTol] = useState(3);
  const cells = useMemo(() => toyCells({ seed, jitter }), [seed, jitter]);
  const v = useMemo(() => jointViews(cells, TOY_BREAKENDS, tol), [cells, tol]);
  const [ref, width] = useContainerWidth(900);
  return (
    <Space direction="vertical" size={8} style={{ width: "100%" }}>
      <Paragraph style={{ marginBottom: 0 }}>
        Four toy cells over 60 bins share three junctions (blue arcs): a tandem duplication of bins 14-28 (one copy in cells 1-2, two in cell 3), a duplication of 28-44 (cell 3) and a loss of the arm after bin 44 (cells 1 and 4). Each cell segmented on its own puts the breakpoints (black ticks) a bin or two off; cell 2 also has a spurious breakpoint. Colour is copy number: <Sw c={CN_FILL[1]} b={theme.border} /> 1, <Sw c={theme.empty} b={theme.border} /> 2, <Sw c={CN_FILL[3]} b={theme.border} /> 3, <Sw c={CN_FILL[4]} b={theme.border} /> 4.
      </Paragraph>
      <Space wrap size={[16, 8]}>
        <Space size={6}><Text>breakpoint jitter (bins)</Text><Slider style={{ width: 110 }} min={0} max={4} value={jitter} onChange={setJitter} /></Space>
        <Space size={6}><Text>snap tolerance (bins)</Text><Slider style={{ width: 110 }} min={0} max={5} value={tol} onChange={setTol} /></Space>
        <Button size="small" onClick={() => setSeed((s) => s + 1)}>Redraw cells</Button>
      </Space>
      <div ref={ref} style={{ width: "100%" }}>
        <Panel title="1. Each cell alone" view={v.perCell} width={width} theme={theme} note="every off-by-a-bin breakpoint is a loose end" />
        <Panel title="2. Disjoint segmentation (union of all cells)" view={v.disjoint} width={width} theme={theme} note="shared columns, but split into slivers; the cells still disagree at the edges" />
        <Panel title="3. Joint balance (breakpoints at the shared junction breakends)" view={v.joint} width={width} theme={theme} showJunctions
          note={`breakpoints within ${tol} bins snap to a breakend; ${v.joint.dropped} unsupported breakpoint${v.joint.dropped === 1 ? "" : "s"} dropped; CN refit per shared segment`} />
      </div>
      <Text type="secondary" style={{ fontSize: 12.5 }}>
        In the joint fit the junctions are shared by all cells and each cell gets its own junction copy numbers (0 is allowed), so a cell without the duplication simply carries it at 0 copies. Set the tolerance to 0 to see breakpoints that miss the breakends fall away; raise the jitter to see why per-cell segmentation alone gives a ragged heatmap.
      </Text>
    </Space>
  );
}

export default function JointBalanceExplainer({ concept, onView, onConcept }) {
  return (
    <ExplainerShell
      title={concept.title}
      intro={[
        "Single cells are shallow and noisy, so each cell's own segmentation places a copy-number breakpoint a few bins away from where the rearrangement actually is, and different cells disagree. Junction balance done cell by cell then leaves loose ends wherever a breakpoint misses its junction.",
        "The cells of a tumour share most of their rearrangements. Cutting the genome at every breakpoint of every cell gives one shared (disjoint) segmentation, as used for many related samples in the telomere crisis study (Dewhurst et al. 2021), but by itself it is fragmented into slivers.",
        "Joint junction balance goes one step further: one segmentation for all cells, cut at the breakends of the junctions found across the cells, then balance in each cell with its own junction copy numbers. Breakpoints collapse onto shared breakends, loose ends disappear and the per-cell copy-number heatmap becomes clean.",
      ]}
      toy={<JointBalanceToy />}
      paper={(
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>Joint junction balance for BWH70 (ecEGFR excision, <RealLink href={cohortHref("paperfig4")} onClick={onView ? () => onView("paperfig4") : null}>Fig 4</RealLink>): <Tag color="gold">in progress</Tag> once exported it appears as a copy-number source toggle (Regular | Joint junction balance) in the Single-Cell tab.</li>
          <li>Per-cell copy number and junctions as they are now: <RealLink href={patientHref("BWH70", 7)}>BWH70, Single-Cell tab</RealLink>, <RealLink href={patientHref("BWH70", 7, { heatmap: "junctions" })}>junction heatmap</RealLink>.</li>
          <li>Background: <RealLink href={conceptHref("balance")} onClick={onConcept ? () => onConcept("balance") : null}>junction balance in one genome</RealLink>.</li>
        </ul>
      )}
      refs={concept.refs}
    />
  );
}
