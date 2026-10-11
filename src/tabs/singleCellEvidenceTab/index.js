import React, { useEffect, useState } from "react";
import { Segmented, Space, Tabs, Typography } from "antd";
import SingleCellWrapper from "../../components/singleCell/index.style";
import ErrorBoundary from "../../components/singleCell/errorBoundary";
import ReadSlicePanel from "../../components/singleCell/evidence/readSlicePanel";
import CellCycleCard from "../../components/singleCell/evidence/cellCycleCard";
import TelomereCard from "../../components/singleCell/evidence/telomereCard";
import PrecomputeStatusCard from "../../components/singleCell/evidence/precomputeStatusCard";
import CellFilterControl from "../../components/singleCell/evidence/cellFilterControl";
import FishPlotCard from "../../components/singleCell/evidence/fishPlotCard";
import ConvergenceCard from "../../components/singleCell/evidence/convergenceCard";
import MtdnaCard from "../../components/singleCell/evidence/mtdnaCard";
import FitnessCard from "../../components/singleCell/evidence/fitnessCard";
import RnaCloneCard from "../../components/singleCell/evidence/rnaCloneCard";
import IncoherenceCard from "../../components/singleCell/evidence/incoherenceCard";
import ControlsCard from "../../components/singleCell/evidence/controlsCard";
import TimingCard from "../../components/singleCell/evidence/timingCard";
import MutationEvidencePanel from "../../components/singleCell/evidence/mutationEvidencePanel";
import { EVIDENCE_SITE_EVENT, readEvidenceLink } from "../../helpers/singleCell/siteEvidence";

const { Text } = Typography;

// Sections, each with its sub-views (a segmented control when there is more than one).
const SECTIONS = [
  {
    key: "mutations",
    label: "Mutations",
    hint: "Is each mutation real, and in which cells? Sites ranked by evidence; click one for its cells, pooled counts and reads.",
    views: [{ key: "mutations", label: "Mutations", render: (p) => <MutationEvidencePanel siteId={p.siteId} onSiteChange={p.setSiteId} /> }],
  },
  {
    key: "reads",
    label: "Read browser",
    hint: "Raw reads per clone at any genotyped site, SV junction or RNA fusion (slice BAMs).",
    views: [{ key: "reads", label: "Read browser", render: () => <ReadSlicePanel /> }],
  },
  {
    key: "state",
    label: "Cell state",
    hint: "Per-cell phenotypes from the DNA: replication (S-phase), telomeres and TERT, mitochondrial DNA.",
    views: [
      { key: "cycle", label: "Cell cycle", render: () => <CellCycleCard /> },
      { key: "telomeres", label: "TERT & telomeres", render: (p) => <TelomereCard onOpenSite={p.openSite} /> },
      { key: "mtdna", label: "mtDNA", render: () => <MtdnaCard /> },
    ],
  },
  {
    key: "clones",
    label: "Clonal dynamics",
    hint: "How the clones grow, when events happened, and whether events recur or disagree across the tree.",
    views: [
      { key: "clones", label: "Clone growth", render: () => <FishPlotCard /> },
      { key: "timing", label: "Timing", render: () => <TimingCard /> },
      { key: "convergence", label: "Convergent events", render: () => <ConvergenceCard /> },
      { key: "incoherence", label: "Amplicon incoherence", render: () => <IncoherenceCard /> },
      { key: "fitness", label: "Fitness", render: () => <FitnessCard /> },
      { key: "rnaclone", label: "RNA → clone", render: () => <RnaCloneCard /> },
    ],
  },
  {
    key: "controls",
    label: "Controls & pipeline",
    hint: "Normal cells as negative controls, and which precompute steps have run for each patient.",
    views: [
      { key: "controls", label: "Normal-cell controls", render: () => <ControlsCard /> },
      { key: "status", label: "Pipeline status", render: () => <PrecomputeStatusCard /> },
    ],
  },
];

const sectionOfView = (view) => SECTIONS.find((s) => s.key === view || s.views.some((v) => v.key === view));

/** Precomputed single-cell evidence, grouped: mutations first, then reads, cell state, clonal dynamics, controls. */
export default function SingleCellEvidenceTab() {
  // ?evview=<view key> opens a sub-view; ?evsite=<site id> opens the mutation view on that site
  const [initial] = useState(() => {
    const link = readEvidenceLink();
    const sec = (link.view && sectionOfView(link.view)) || SECTIONS[0];
    const view = sec.views.find((v) => v.key === link.view)?.key || sec.views[0].key;
    return link.site ? { section: "mutations", view: "mutations", site: link.site } : { section: sec.key, view, site: null };
  });
  const [section, setSection] = useState(initial.section);
  const [viewBySection, setViewBySection] = useState({ [initial.section]: initial.view });
  const [siteId, setSiteId] = useState(initial.site);
  const sec = SECTIONS.find((s) => s.key === section) || SECTIONS[0];
  const current = sec.views.find((v) => v.key === viewBySection[sec.key]) || sec.views[0];
  const openSite = (id) => {
    setSiteId(id);
    setSection("mutations");
  };
  // links from other views (filtered events, drivers) while this tab is mounted
  useEffect(() => {
    const on = (e) => e?.detail?.site && openSite(e.detail.site);
    window.addEventListener(EVIDENCE_SITE_EVENT, on);
    return () => window.removeEventListener(EVIDENCE_SITE_EVENT, on);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SingleCellWrapper>
      <Space direction="vertical" style={{ width: "100%" }} size="small">
        <CellFilterControl />
        <Tabs size="small" activeKey={sec.key} onChange={setSection} items={SECTIONS.map((s) => ({ key: s.key, label: s.label }))} style={{ marginBottom: -8 }} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", alignItems: "center" }}>
          {sec.views.length > 1 && (
            <Segmented
              value={current.key}
              onChange={(v) => setViewBySection((m) => ({ ...m, [sec.key]: v }))}
              options={sec.views.map((v) => ({ value: v.key, label: v.label }))}
            />
          )}
          <Text type="secondary">{sec.hint}</Text>
        </div>
        <ErrorBoundary key={`${sec.key}:${current.key}`}>{current.render({ siteId, setSiteId, openSite })}</ErrorBoundary>
      </Space>
    </SingleCellWrapper>
  );
}
