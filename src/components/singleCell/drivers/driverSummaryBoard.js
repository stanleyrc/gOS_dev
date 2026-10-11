import React, { useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { Button, Card, Empty, Popover, Space, Spin, Switch, Tag, Tooltip, Typography } from "antd";
import { AimOutlined, BarChartOutlined, BranchesOutlined, FileSearchOutlined, InfoCircleOutlined, NodeIndexOutlined, TableOutlined, ThunderboltOutlined } from "@ant-design/icons";
import usePlotTheme from "../usePlotTheme";
import HintLine from "../hintLine";
import GeneInfoCard from "../rna/geneInfoCard";
import { TYPE } from "../../../helpers/singleCell/plotTheme";
import { formatP } from "../../../helpers/singleCell/tests";
import { KIND_LABEL, effectWord, isKnownDriver } from "../../../helpers/singleCell/driverSummary";
import useDriverSummaries from "./useDriverSummaries";
import DriverEvidenceDrawer, { useDriverActions } from "./driverEvidenceDrawer";
import { EvidenceTag, KIND_COLOR } from "./driverOneLine";
import { CARRIER_COLOR } from "./useDriverEvidence";

const { Text, Paragraph } = Typography;
const STEP = 8;
const pct = (x) => `${Math.round(x * 100)}%`;
const UP = "#c2410c";
const DOWN = "#1d6fd8";

/** Fraction of tumor cells carrying the driver as a small bar. */
function CarrierBar({ fraction }) {
  const theme = usePlotTheme();
  return (
    <svg width={110} height={10} style={{ verticalAlign: "middle" }} aria-hidden>
      <rect x={0} y={1} width={110} height={8} rx={2} fill={theme.empty} />
      <rect x={0} y={1} width={Math.max(2, 110 * fraction)} height={8} rx={2} fill={CARRIER_COLOR} />
    </svg>
  );
}

/** One effect as a coloured chip: direction arrow, short text, numbers in the tooltip. */
function Effect({ dir = 0, strong = false, children, tip }) {
  const color = dir > 0 ? UP : dir < 0 ? DOWN : null;
  return (
    <Tooltip title={tip}>
      <span
        className="sc-drv-effect"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "1px 8px",
          borderRadius: 10,
          fontSize: TYPE.label,
          border: `1px solid ${color || "var(--sc-border-soft, #d9d9d9)"}`,
          color: color || undefined,
          fontWeight: strong ? 600 : 400,
          cursor: "help",
          whiteSpace: "nowrap",
        }}
      >
        {dir > 0 ? "▲" : dir < 0 ? "▼" : "·"} {children}
      </span>
    </Tooltip>
  );
}

/** What each gene is: role, pathway, GBM note, OncoKB summary; the gene name opens the live gene card. */
function GeneLines({ briefs }) {
  return briefs.map((b) => (
    <div key={b.gene} style={{ marginBottom: 2 }}>
      <Popover trigger="click" placement="right" content={<div style={{ width: 460, maxHeight: 520, overflow: "auto" }}><GeneInfoCard gene={b.gene} /></div>}>
        <Typography.Link strong style={{ marginRight: 6 }}>
          {b.gene} <InfoCircleOutlined style={{ fontSize: 11 }} />
        </Typography.Link>
      </Popover>
      {b.role && <Tag color={/oncogene and/.test(b.role) ? "magenta" : /oncogene/.test(b.role) ? "volcano" : "geekblue"} style={{ marginInlineEnd: 4 }}>{b.role}</Tag>}
      {b.gbm && (
        <Tooltip title={b.gbm.note}>
          <Tag color={b.gbm.kind === "driver" ? "red" : "purple"} style={{ marginInlineEnd: 4 }}>{b.gbm.kind === "driver" ? "GBM driver" : "GBM marker"}</Tag>
        </Tooltip>
      )}
      <Text type="secondary" style={{ fontSize: TYPE.label }}>
        {[b.pathway, b.gbm?.note, b.summary].filter(Boolean).join(" · ") || "No curated cancer role — click the name for its NCBI summary and glioma papers."}
      </Text>
    </div>
  ));
}

/** One ranked driver: what it is, what it does, who carries it, what differs in those cells, and one-click evidence. */
function DriverCard({ s, rank, focused, onEvidence, onFocus }) {
  const actions = useDriverActions();
  const detailed = s.dosage.length || s.programs.length || s.state.length || s.cn.length;
  const progHits = s.programs.filter((p) => p.q < 0.1).slice(0, 3);
  const stateTop = s.state.find((x) => x.p < 0.05 && x.shareA > x.shareB) || null;
  const stateDown = s.state.find((x) => x.p < 0.05 && x.shareA < x.shareB) || null;
  return (
    <div
      className="sc-drv-card"
      style={{
        borderLeft: `4px solid ${focused ? CARRIER_COLOR : "transparent"}`,
        borderBottom: "1px solid var(--sc-border-soft, #f0f0f0)",
        padding: "10px 10px 10px 12px",
        background: focused ? "var(--sc-hover-fill, rgba(212,56,13,0.04))" : undefined,
      }}
    >
      <Space size={8} wrap align="center" style={{ marginBottom: 4 }}>
        <Text type="secondary" style={{ fontSize: 15, minWidth: 22, display: "inline-block" }}>{`${rank}.`}</Text>
        <Text strong style={{ fontSize: 16 }}>{s.label}</Text>
        <Tag color={KIND_COLOR[s.kind]}>{KIND_LABEL[s.kind]}</Tag>
        {Number(s.members[0].event.Tier) <= 2 && <Tag>{`OncoKB tier ${s.members[0].event.Tier}`}</Tag>}
        <EvidenceTag evidence={s.evidence} />
        <span style={{ marginLeft: 8 }}>
          <CarrierBar fraction={s.fraction} /> <Text>{`${s.n} of ${s.total} tumor cells (${pct(s.fraction)})`}</Text>
        </span>
        {s.fit != null && (
          <Tooltip title={`Best-matching branch of the tree holds ${s.fitDetail.inClade} carriers among its ${s.fitDetail.clade} cells. 1 = the carriers are exactly one branch; low values = calls spread over the tree.`}>
            <Tag color={s.fit >= 0.8 ? "green" : s.fit < 0.5 ? "orange" : "default"} style={{ cursor: "help" }}>
              {s.fit >= 0.8 ? `one branch (fit ${s.fit.toFixed(2)})` : s.fit < 0.5 ? `spread over the tree (fit ${s.fit.toFixed(2)})` : `mostly one branch (fit ${s.fit.toFixed(2)})`}
            </Tag>
          </Tooltip>
        )}
        <Button size="small" type={focused ? "primary" : "default"} icon={<NodeIndexOutlined />} onClick={() => onFocus(s)}>
          {focused ? "In the deep dive below" : "Deep dive"}
        </Button>
      </Space>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "4px 24px" }}>
        <div>
          <Text type="secondary" style={{ fontSize: TYPE.tick, textTransform: "uppercase", letterSpacing: 0.4 }}>What it is</Text>
          <GeneLines briefs={s.briefs} />
          <Paragraph style={{ marginBottom: 4, marginTop: 4 }}>{s.alteration}</Paragraph>
          {s.coTravellers.length > 0 && (
            <Tooltip title={s.coTravellers.join(", ")}>
              <div style={{ fontSize: TYPE.label, cursor: "help" }}>
                <Text type="secondary">{`Same cells also carry ${s.coTravellers.length} other event${s.coTravellers.length > 1 ? "s" : ""}: `}</Text>
                {s.keyCoTravellers.slice(0, 5).map((k) => (
                  <Tag key={k.label} color={k.gbm ? "red" : "volcano"} style={{ marginInlineEnd: 4 }}>
                    {k.label}
                  </Tag>
                ))}
                <Text type="secondary">
                  {(() => {
                    const rest = s.coTravellers.filter((l) => !s.keyCoTravellers.slice(0, 5).some((k) => k.label === l));
                    return rest.length ? `${s.keyCoTravellers.length ? "+ " : ""}${rest.slice(0, 3).join(", ")}${rest.length > 3 ? `, … (${rest.length - 3} more)` : ""}` : "";
                  })()}
                </Text>
              </div>
            </Tooltip>
          )}
        </div>
        <div>
          <Text type="secondary" style={{ fontSize: TYPE.tick, textTransform: "uppercase", letterSpacing: 0.4 }}>
            {`What differs in carriers${s.nRnaA ? ` (RNA: ${s.nRnaA} carriers vs ${s.nRnaB} other tumor cells)` : ""}`}
          </Text>
          {!detailed ? (
            <div>
              <Text type="secondary">Effects are computed for the top-ranked drivers; open the evidence or deep dive for this one.</Text>
            </div>
          ) : (
            <Space size={[6, 6]} wrap style={{ marginTop: 2 }}>
              {s.dosage.map((g) => (
                <Effect
                  key={g.gene}
                  dir={g.changed ? Math.sign(g.log2fc) : 0}
                  strong={g.agrees}
                  tip={`${g.gene} RNA, carriers vs other tumor cells: mean ${(2 ** g.log2fc).toFixed(2)}×, detected in ${pct(g.detA)} vs ${pct(g.detB)} of cells, AUC ${g.auc.toFixed(2)}, ${formatP(g.p)}.${g.expected ? ` Expected ${g.expected > 0 ? "higher" : "lower"} for this alteration${g.agrees ? " — as expected." : "."}` : ""}`}
                >
                  {`${g.gene} RNA ${effectWord(g.log2fc, g.p)}${g.agrees ? " ✓ as expected" : g.opposite ? " (unexpected)" : ""}`}
                </Effect>
              ))}
              {s.cn.slice(0, 2).map((r) => (
                <Effect key={r.where} dir={Math.sign(r.diff)} strong={Math.abs(r.diff) >= 2} tip={`Mean copy number ${r.meanA.toFixed(1)} in carriers vs ${r.meanB.toFixed(1)} in other tumor cells over ${r.where}${r.genes.length ? `; cancer genes there: ${r.genes.join(", ")}` : ""}. Copy-number changes that travel with the driver can explain expression differences as well.`}>
                  {`CN ${r.diff > 0 ? "+" : ""}${Math.abs(r.diff) >= 3 ? Math.round(r.diff) : r.diff.toFixed(1)} at ${r.where}${r.genes.length ? ` (${r.genes.slice(0, 3).join(", ")}${r.genes.length > 3 ? "…" : ""})` : ""}`}
                </Effect>
              ))}
              {progHits.map((p) => (
                <Effect key={p.name} dir={Math.sign(p.d)} strong={Math.abs(p.d) >= 0.8} tip={`${p.name} program score: difference ${p.d.toFixed(2)} SD (95% CI ${p.lo.toFixed(2)} to ${p.hi.toFixed(2)}), ${formatP(p.p)}, q ${p.q.toFixed(3)} across ${s.programs.length} programs.`}>
                  {`${p.name.replace(" (Neftel)", "")} ${p.d > 0 ? "higher" : "lower"} (${Math.abs(p.d).toFixed(1)} SD)`}
                </Effect>
              ))}
              {s.programs.length > 0 && progHits.length === 0 && (
                <Effect tip={`None of ${s.programs.length} programs (GBM states, cycle, hypoxia, interferon) differs at q < 0.1. Smallest p: ${s.programs[0].name} ${formatP(s.programs[0].p)}.`}>no program shift</Effect>
              )}
              {stateTop && (
                <Effect dir={1} tip={`Cell state ${stateTop.level}: ${stateTop.a} carriers (${pct(stateTop.shareA)}) vs ${stateTop.b} others (${pct(stateTop.shareB)}), ${formatP(stateTop.p)}.`}>
                  {`more ${stateTop.level}-like (${pct(stateTop.shareA)} vs ${pct(stateTop.shareB)})`}
                </Effect>
              )}
              {stateDown && !stateTop && (
                <Effect dir={-1} tip={`Cell state ${stateDown.level}: ${pct(stateDown.shareA)} of carriers vs ${pct(stateDown.shareB)} of others, ${formatP(stateDown.p)}.`}>
                  {`fewer ${stateDown.level}-like (${pct(stateDown.shareA)} vs ${pct(stateDown.shareB)})`}
                </Effect>
              )}
              {s.state.length > 0 && !stateTop && !stateDown && <Effect tip="No cell-state level differs at p < 0.05.">same cell states</Effect>}
              {s.chimeric && (
                <Effect dir={s.chimeric.chimericCells > 0 ? 1 : 0} tip={`${s.chimeric.chimericCells} of ${s.chimeric.withRna} carrier cells with RNA have reads joining the two genes (${s.chimeric.reads} in Arriba calls, ${s.chimeric.discarded} in discarded calls).`}>
                  {s.chimeric.chimericCells > 0 ? `chimeric RNA in ${s.chimeric.chimericCells} carriers` : `no chimeric RNA reads (${s.chimeric.withRna} carriers)`}
                </Effect>
              )}
              {s.spliceLinks.slice(0, 2).map((l) => (
                <Effect key={l.finding.id} dir={1} strong tip={`${l.finding.text} — in ${l.a} carriers (${pct(l.fracA)}) vs ${l.b} others (${pct(l.fracB)}), ${formatP(l.p)}.`}>
                  {`linked splicing: ${l.finding.gene}`}
                </Effect>
              ))}
            </Space>
          )}
          {s.confound && (
            <div style={{ marginTop: 4 }}>
              <Text type="warning" style={{ fontSize: TYPE.label }}>
                {`⚠ Carriers are concentrated on plate ${s.confound.plates.join(", ")}: region / plate differences can look like driver effects (the deep dive tests within plates).`}
              </Text>
            </div>
          )}
          <div style={{ marginTop: 6 }}>
            <Text type="secondary" style={{ fontSize: TYPE.tick, textTransform: "uppercase", letterSpacing: 0.4, marginRight: 6 }}>Check</Text>
            <Space size={4} wrap>
              {!["amp", "homdel"].includes(s.kind) && (
                <Button size="small" icon={<FileSearchOutlined />} onClick={() => actions.igv(s)}>
                  Reads
                </Button>
              )}
              <Button size="small" className="sc-drv-evidence-btn" icon={<BarChartOutlined />} onClick={() => onEvidence(s, "expression")}>
                Expression
              </Button>
              <Button size="small" icon={<TableOutlined />} onClick={() => onEvidence(s, "cn")}>
                Copy number
              </Button>
              {s.kind === "fusion" && (
                <Button size="small" icon={<ThunderboltOutlined />} onClick={() => onEvidence(s, "fusion")}>
                  Fusion RNA
                </Button>
              )}
              <Button size="small" icon={<BranchesOutlined />} onClick={() => onEvidence(s, "splicing")}>
                {`Splicing${s.spliceLinks.length ? ` (${s.spliceLinks.length})` : ""}`}
              </Button>
              <Button size="small" icon={<AimOutlined />} onClick={() => actions.zoom(s)}>
                Heatmap
              </Button>
            </Space>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Ranked, plain-language list of the patient's subclonal drivers, leading the
 * Drivers tab: events carried by the same cells are grouped; each group says
 * what the gene is, what the alteration does, which cells carry it, what
 * differs in them (with effect sizes) and opens its evidence in one click.
 */
export default function DriverSummaryBoard({ rna, focusKey, onFocus }) {
  const patient = useSelector((s) => s.SingleCell.patient);
  const [limit, setLimit] = useState(STEP);
  const [knownOnly, setKnownOnly] = useState(true);
  const [drawer, setDrawer] = useState(null);
  const { summaries, bundles, tumorIds, programs, loading } = useDriverSummaries(rna, { limit, knownOnly });
    const shown = useMemo(() => (knownOnly ? summaries.filter((s) => isKnownDriver(s.members[0])) : summaries), [summaries, knownOnly]);
  const hidden = summaries.length - shown.length;
  const nEvents = bundles.reduce((n, b) => n + b.members.length, 0);
  const drawerSummary = drawer ? summaries.find((s) => s.key === drawer.key) : null;
  const nonCarriers = useMemo(() => {
    if (!drawerSummary) return [];
    const c = new Set(drawerSummary.members[0].carriers);
    return tumorIds.filter((id) => !c.has(id));
  }, [drawerSummary, tumorIds]);
  if (!summaries.length) return null;
  return (
    <Card
      size="small"
      title={
        <Space wrap>
          <NodeIndexOutlined />
          <span>{`Candidate subclonal drivers${patient?.caseReportId ? ` of ${patient.caseReportId}` : ""}`}</span>
          {loading && <Spin size="small" />}
        </Space>
      }
      extra={
        <Space>
          <Text type="secondary" style={{ fontSize: TYPE.label }}>Cancer genes only</Text>
          <Switch size="small" checked={knownOnly} onChange={setKnownOnly} />
        </Space>
      }
    >
      <HintLine
        text={`${nEvents} events are carried by part of the tumor (5–95% of ${tumorIds.length} cells); events carried by the same cells are grouped, leaving ${summaries.length} candidates, ranked by OncoKB tier, cancer-gene role, SNV driver evidence and how cleanly the carriers form one branch of the tree. Effects compare carriers with every other tumor cell (▲ higher / ▼ lower in carriers; bold = large or as expected). Hover a chip for numbers; click a gene name for what it does.`}
      />
      {shown.slice(0, limit).map((s, i) => (
        <DriverCard key={s.key} s={s} rank={i + 1} focused={s.key === focusKey} onEvidence={(x, tab) => setDrawer({ key: x.key, tab })} onFocus={onFocus} />
      ))}
      {!shown.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No candidate involves a known cancer gene; switch off “Cancer genes only”." />}
      <Space style={{ marginTop: 8 }} wrap>
        {shown.length > limit && (
          <Button size="small" onClick={() => setLimit(limit + STEP)}>
            {`Show ${Math.min(STEP, shown.length - limit)} more (${shown.length - limit} left)`}
          </Button>
        )}
        {knownOnly && hidden > 0 && (
          <Text type="secondary" style={{ fontSize: TYPE.label }}>
            {`${hidden} lower-priority candidate${hidden > 1 ? "s" : ""} without a known cancer gene hidden.`}
          </Text>
        )}
      </Space>
      {drawerSummary && (
        <DriverEvidenceDrawer
          summary={drawerSummary}
          tab={drawer.tab}
          onTab={(tab) => setDrawer({ ...drawer, tab })}
          onClose={() => setDrawer(null)}
          rna={rna}
          nonCarriers={nonCarriers}
          programs={programs}
        />
      )}
    </Card>
  );
}
