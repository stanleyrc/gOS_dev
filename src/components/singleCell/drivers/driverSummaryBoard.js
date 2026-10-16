import React, { useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { Button, Card, Empty, Space, Spin, Switch, Tag, Tooltip, Typography } from "antd";
import { AimOutlined, BarChartOutlined, BranchesOutlined, FileSearchOutlined, NodeIndexOutlined, TableOutlined, ThunderboltOutlined } from "@ant-design/icons";
import usePlotTheme from "../usePlotTheme";
import HintLine from "../hintLine";
import GeneQuickLook, { ReadQcBadge } from "../cohort/geneQuickLook";
import { TYPE } from "../../../helpers/singleCell/plotTheme";
import { formatP } from "../../../helpers/singleCell/tests";
import { driverGenes } from "../../../helpers/singleCell/driverSummary";
import { KEY_FIT, KIND_LABEL, effectWord, inCancerGene, isKnownDriver } from "../../../helpers/singleCell/driverSummary";
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

/** Driver label whose gene opens the quick look (hover card + click) and carries the read-QC badge. */
function SummaryLabel({ s, style }) {
  const gene = driverGenes(s.members?.[0]?.event || {})[0];
  if (!gene) return <Text strong style={style}>{s.label}</Text>;
  return (
    <Space size={4}>
      <GeneQuickLook gene={gene} standalone><Text strong style={{ ...style, color: "#1677ff", cursor: "pointer" }}>{s.label}</Text></GeneQuickLook>
      <ReadQcBadge gene={gene} />
    </Space>
  );
}

/** What each gene is: role, pathway, GBM note, OncoKB summary; the gene name opens the live gene card. */
function GeneLines({ briefs }) {
  return briefs.map((b) => (
    <div key={b.gene} style={{ marginBottom: 2 }}>
      <GeneQuickLook gene={b.gene} standalone><Typography.Link strong style={{ marginRight: 6 }}>{b.gene}</Typography.Link></GeneQuickLook>
      <ReadQcBadge gene={b.gene} />{" "}
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
        <SummaryLabel s={s} style={{ fontSize: 16 }} />
        <Tag color={KIND_COLOR[s.kind]}>{KIND_LABEL[s.kind]}</Tag>
        {Number(s.members[0].event.Tier) <= 2 && <Tag>{`OncoKB tier ${s.members[0].event.Tier}`}</Tag>}
        <EvidenceTag evidence={s.evidence} />
        <span style={{ marginLeft: 8 }}>
          <CarrierBar fraction={s.fraction} /> <Text>{`${s.n} of ${s.total} tumor cells (${pct(s.fraction)})`}</Text>
        </span>
        <FitTag s={s} />
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

/** Clade F1 as a tag: green when the carriers are one branch of the tree. */
function FitTag({ s }) {
  if (s.fit == null) return null;
  const detail = s.fitDetail?.clade ? ` Best-matching branch holds ${s.fitDetail.inClade} carriers among its ${s.fitDetail.clade} cells.` : "";
  return (
    <Tooltip title={`Clade F1 ${s.fit.toFixed(2)}: how well the carriers match one branch of the tree (1 = exactly one branch; low = calls spread over the tree).${detail}`}>
      <Tag color={s.fit >= KEY_FIT ? "green" : s.fit < 0.5 ? "orange" : "default"} style={{ cursor: "help", marginInlineEnd: 0 }}>
        {`clade F1 ${s.fit.toFixed(2)}`}
      </Tag>
    </Tooltip>
  );
}

/** A lower-priority candidate in one line: label, type, carriers, clade F1, deep dive. */
function CompactRow({ s, rank, focused, onFocus, onEvidence }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "4px 10px 4px 12px", borderBottom: "1px solid var(--sc-border-soft, #f0f0f0)", background: focused ? "var(--sc-hover-fill, rgba(212,56,13,0.04))" : undefined }}>
      <Text type="secondary" style={{ minWidth: 22 }}>{`${rank}.`}</Text>
      <SummaryLabel s={s} />
      <Tag color={KIND_COLOR[s.kind]} style={{ marginInlineEnd: 0 }}>{KIND_LABEL[s.kind]}</Tag>
      <Text type="secondary" style={{ fontSize: TYPE.label }}>{`${s.n} of ${s.total} cells (${pct(s.fraction)})`}</Text>
      <FitTag s={s} />
      <span style={{ marginLeft: "auto" }}>
        <Space size={4}>
          <Button size="small" type="text" icon={<BarChartOutlined />} onClick={() => onEvidence(s, "expression")}>Evidence</Button>
          <Button size="small" type={focused ? "primary" : "text"} icon={<NodeIndexOutlined />} onClick={() => onFocus(s)}>{focused ? "In deep dive" : "Deep dive"}</Button>
        </Space>
      </span>
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
  const [showBranchOther, setShowBranchOther] = useState(false);
  const [showSpread, setShowSpread] = useState(false);
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
  // key findings: carriers form one branch AND the event hits a cancer gene (OncoKB tier 1-2, curated role or GBM gene);
  // one-branch events in other genes and candidates spread over the tree are folded into compact rows
  const cancerGene = (s) => inCancerGene(s.members[0]);
  const oneBranch = (s) => s.fit != null && s.fit >= KEY_FIT;
  const keyFindings = shown.filter((s) => oneBranch(s) && cancerGene(s));
  const oneBranchOther = shown.filter((s) => oneBranch(s) && !cancerGene(s));
  const others = shown.filter((s) => !oneBranch(s));
  const keyShown = keyFindings.slice(0, limit);
  const onEvidence = (x, tab) => setDrawer({ key: x.key, tab });
  if (!summaries.length) return null;
  return (
    <Card
      size="small"
      title={
        <Space wrap>
          <NodeIndexOutlined />
          <span>{`Subclonal drivers${patient?.caseReportId ? ` of ${patient.caseReportId}` : ""}`}</span>
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
      <div style={{ marginBottom: 8 }}>
        <Text strong style={{ fontSize: 15 }}>
          {keyFindings.length
            ? `${keyFindings.length} key finding${keyFindings.length > 1 ? "s" : ""}: cancer-gene events whose carriers form one branch of the tree (clade F1 ≥ ${KEY_FIT})`
            : `No cancer-gene event whose carriers form one branch of the tree (clade F1 ≥ ${KEY_FIT})`}
        </Text>
        {keyFindings.length > 0 && (
          <div style={{ marginTop: 2 }}>
            {keyFindings.slice(0, 4).map((s) => (
              <Text key={s.key} style={{ marginRight: 14 }}>
                <Typography.Link onClick={() => onFocus(s)}>{s.label}</Typography.Link>
                <Text type="secondary">{` ${KIND_LABEL[s.kind].toLowerCase()} · ${pct(s.fraction)} of cells · F1 ${s.fit.toFixed(2)}`}</Text>
              </Text>
            ))}
          </div>
        )}
        <HintLine
          text={`${nEvents} events are carried by part of the tumor (5–95% of ${tumorIds.length} cells); events in the same cells are grouped (${summaries.length} candidates). Key findings lead, highest clade F1 first; the rest are folded below. Chips compare carriers with every other tumor cell (▲ higher / ▼ lower in carriers); hover for numbers.`}
        />
      </div>
      {keyShown.map((s, i) => (
        <DriverCard key={s.key} s={s} rank={i + 1} focused={s.key === focusKey} onEvidence={onEvidence} onFocus={onFocus} />
      ))}
      {keyFindings.length > limit && (
        <Button size="small" style={{ marginTop: 6 }} onClick={() => setLimit(limit + STEP)}>
          {`Show ${Math.min(STEP, keyFindings.length - limit)} more key findings`}
        </Button>
      )}
      {!shown.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No candidate involves a known cancer gene; switch off “Cancer genes only”." />}
      {oneBranchOther.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <Button size="small" type={showBranchOther ? "default" : "dashed"} onClick={() => setShowBranchOther(!showBranchOther)}>
            {`${showBranchOther ? "Hide" : "Show"} ${oneBranchOther.length} other one-branch event${oneBranchOther.length > 1 ? "s" : ""} (clade F1 ≥ ${KEY_FIT}, no known cancer role)`}
          </Button>
          {showBranchOther && (
            <div style={{ marginTop: 6 }}>
              {oneBranchOther.map((s, i) => (
                <CompactRow key={s.key} s={s} rank={keyFindings.length + i + 1} focused={s.key === focusKey} onFocus={onFocus} onEvidence={onEvidence} />
              ))}
            </div>
          )}
        </div>
      )}
      {others.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <Button size="small" type={showSpread ? "default" : "dashed"} onClick={() => setShowSpread((v) => !v)}>
            {`${showSpread ? "Hide" : "Show"} ${others.length} candidate${others.length > 1 ? "s" : ""} spread over the tree (clade F1 < ${KEY_FIT})`}
          </Button>
          {showSpread && (
            <div style={{ marginTop: 6 }}>
              {others.map((s, i) => (
                <CompactRow key={s.key} s={s} rank={keyFindings.length + oneBranchOther.length + i + 1} focused={s.key === focusKey} onFocus={onFocus} onEvidence={onEvidence} />
              ))}
            </div>
          )}
        </div>
      )}
      {knownOnly && hidden > 0 && (
        <div style={{ marginTop: 6 }}>
          <Text type="secondary" style={{ fontSize: TYPE.label }}>
            {`${hidden} candidate${hidden > 1 ? "s" : ""} without a known cancer gene hidden (switch off “Cancer genes only”).`}
          </Text>
        </div>
      )}
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
