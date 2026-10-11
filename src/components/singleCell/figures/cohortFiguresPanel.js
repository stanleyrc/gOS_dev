import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Card, Col, Collapse, Empty, InputNumber, Row, Segmented, Select, Space, Switch, Typography } from "antd";
import { BarChartOutlined, BranchesOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import { cellsForPatient } from "../../../helpers/singleCell/cellFiles";
import { groupCombinations, subclonalFindings, walkGroups } from "../../../helpers/singleCell/figures";
import { AmpliconUpset, AmpliconViolins } from "./ampliconLandscape";
import PhyloSignalPanel from "./phyloSignalPanel";
import SubclonalFindingsTable from "./subclonalFindingsTable";
import PatientEcdnaView from "./patientEcdnaView";
import { Provenance } from "../hintLine";
import { useFigureStyleName } from "./figureCanvas";
import { PanelHead } from "./figureKit";
import { dominantGroupIndex } from "../../../helpers/singleCell/figureDefaults";
import singleCellActions from "../../../redux/singleCell/actions";
import { FIGURE_STYLES, DEFAULT_FIGURE_STYLE } from "../../../helpers/singleCell/figureStyle";
import PatientFigure, { PatientCladeStates, PatientProfiles, PatientVariantCopies } from "./patientFigure";
import ScEventModal from "../scEventModal";
import GenePairScatter from "./genePairScatter";
import CladeCarrierBars from "./cladeCarrierBars";
import SelectedCellsModal from "./selectedCellsModal";
import { CellSelectionProvider, SelectionBar, useCellSelection } from "./cellSelection";
import { readViewLink, walkIdsForLabels, withCloneOverrides } from "../../../helpers/singleCell/deepLink";
import GeneCnScatter from "./geneCnScatter";

const { Text } = Typography;
const PAD = 1.5e6;

const globalPos = (chromoBins, chr, pos) => {
  const bin = chromoBins?.[`${chr}`.replace(/^chr/, "")];
  return bin ? bin.startPlace + Number(pos) : NaN;
};

/** Merge [chr, start, end] loci into padded global domains (one per chromosome, sorted). */
function lociDomains(loci, chromoBins, pad = PAD) {
  const by = new Map();
  loci.forEach(([chr, s, e]) => {
    const key = `${chr}`.replace(/^chr/, "");
    if (!chromoBins?.[key] || !Number.isFinite(s)) return;
    const cur = by.get(key);
    by.set(key, cur ? [Math.min(cur[0], s), Math.max(cur[1], e)] : [s, e]);
  });
  return [...by.entries()]
    .map(([chr, [s, e]]) => {
      const bin = chromoBins[chr];
      const p = Math.max(pad, 0.25 * (e - s));
      const a = globalPos(chromoBins, chr, Math.max(bin.startPoint ?? 1, s - p));
      const b = globalPos(chromoBins, chr, Math.min(bin.endPoint ?? e + p, e + p));
      return [a, b, chr];
    })
    .filter((d) => d[1] > d[0])
    .sort((x, y) => x[0] - y[0]);
}

const walkLoci = (walks) => walks.flatMap((w) => (w.nodes || []).map((n) => [n.chromosome, Number(n.start), Number(n.end)]));
function eventLoci(e) {
  const coords = `${e.fusion_gene_coords || ""}`.split(",").filter(Boolean);
  const parsed = coords
    .map((c) => /^(?:chr)?([^:]+):(\d+)-(\d+)/.exec(c))
    .filter(Boolean)
    .map((m) => [m[1], Number(m[2]), Number(m[3])]);
  if (parsed.length) return parsed;
  return Number.isFinite(Number(e.start)) ? [[e.seqnames, Number(e.start), Number(e.end) || Number(e.start)]] : [];
}

/**
 * Cohort "Figures" tab: the paper's figures 3-5 rebuilt from the live data.
 * Top: amplicon landscape (Fig 3A/B), phylogenetic signal (3E) and
 * subclonal findings. Bottom: one patient's clonal amplicon figure (4B/5B/5D)
 * with gene-vs-gene copies (5E), clade carrier fractions (4F) and segment
 * correlation (5C). Every panel selects cells into one shared selection,
 * shown in a popup (SelectedCellsModal).
 */
export default function CohortFiguresPanel(props) {
  return (
    <CellSelectionProvider>
      <FiguresBody {...props} />
    </CellSelectionProvider>
  );
}

function FiguresBody({ summaries, files, datafiles, cnRows = {}, chromoBins, cloneColors = {}, onOpenCell }) {
  const dispatch = useDispatch();
  const { selection, select, clear, open: popupOpen } = useCellSelection();
  const [showLive, setShowLive] = useState([]);
  useEffect(() => {
    // Esc clears the selection (when the popup is open, Esc only closes it)
    const onKey = (e) => e.key === "Escape" && !popupOpen && clear();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clear, popupOpen]);
  const styleName = useFigureStyleName();
  const [ref] = useContainerWidth(1200);
  const rootRef = useRef(null);
  const rootDiv = useCallback(
    (el) => {
      ref(el);
      rootRef.current = el;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const patientRef = useRef(null);
  const [curatedOnly, setCuratedOnly] = useState(true);
  const [includeOther, setIncludeOther] = useState(false);
  const [minCells, setMinCells] = useState(3);
  const [minCn, setMinCn] = useState(1);

  const per = useMemo(
    () =>
      summaries.map((s) => {
        const f = files[s.caseReportId] || {};
        const cells = cellsForPatient(datafiles, s.patientKey);
        const cellIds = f.walks?.cells?.length ? f.walks.cells : cells.map((c) => c.cell_id);
        const groups = walkGroups(f.walks?.walks || [], cellIds, { curatedOnly, includeOther, minCells, minCn });
        return { summary: s, patient: s.caseReportId, cells, cellIds, groups, combos: groupCombinations(groups, cellIds, minCn), tree: f.tree || null, events: f.events || [], snvPacked: f.snvCells || null, nVariants: f.variants?.length || 0 };
      }),
    [summaries, files, datafiles, curatedOnly, includeOther, minCells, minCn]
  );
  const withAmps = per.filter((p) => p.groups.length);

  const findings = useMemo(
    () =>
      per.flatMap((p) =>
        subclonalFindings({ events: p.events, groups: p.groups, cells: p.cells, tree: p.tree }).map((f, i) => ({ ...f, patient: p.patient, key: `${p.patient}::${f.kind}::${f.label}::${i}` }))
      ),
    [per]
  );

  // patient view selection
  // ?figpatient=&figwalk=&figgenes= (committee deep links) open a patient, focus a walk (its carriers selected) and a gene pair
  const link = useMemo(() => readViewLink(), []);
  const [patient, setPatient] = useState(link.figPatient || null);
  const [pairGenes, setPairGenes] = useState(link.figGenes.length === 2 ? link.figGenes : null);
  const [linkMarked, setLinkMarked] = useState(null);
  const linkMode = !!(link.figPatient && (link.figLayout || link.figWalk));
  const [regionKey, setRegionKey] = useState(null); // "g:<set>" | "gene:<name>" | "f:<finding key>"
  // default: the patient with the most ecDNA walks among those with an SNV matrix (BWH70 in the paper's Fig 4)
  const richest = useMemo(() => [...withAmps].sort((a, b) => (b.nVariants > 0) - (a.nVariants > 0) || b.groups.reduce((s, g) => s + g.walks.length, 0) - a.groups.reduce((s, g) => s + g.walks.length, 0))[0], [withAmps]);
  const current = per.find((p) => p.patient === patient) || richest || per[0];
  const [focusWalkId, setFocusWalkId] = useState(null);
  const [figDomains, setFigDomains] = useState([]);
  useEffect(() => setFocusWalkId(null), [current?.patient]);
  const linkedWalk = useRef(false);
  useEffect(() => {
    const walks = files[current?.patient]?.walks?.walks || [];
    if (linkedWalk.current || !link.figWalk || !current || current.patient !== link.figPatient || !walks.length) return;
    linkedWalk.current = true;
    // figwalk=<label>|<label> (committee links): show these walks, mark the first one's carriers (figsel=0: marks without selecting)
    const ids = walkIdsForLabels(walks, link.figWalk.split("|").map((x) => x.trim()).filter(Boolean));
    const w = walks.find((x) => `${x.id}` === `${ids[0]}`);
    if (!w) return;
    setTimeout(() => setFocusWalkId(`${w.id}`), 0);
    setRegionKey(`w:${ids.join("+")}`);
    const carriers = current.cellIds.filter((c) => (Number(w.cells?.[c]) || 0) >= minCn);
    setLinkMarked({ cells: new Set(carriers), label: `${w.label} carriers`, key: `w:${current.patient}:${w.id}` });
    if (link.figSelect) select(current.patient, carriers, { label: `${w.label} carriers` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, files, link, minCn]);
  useEffect(() => {
    if (!link.figPatient) return undefined;
    const t = setTimeout(() => patientRef.current?.scrollIntoView({ block: "start" }), 1500);
    return () => clearTimeout(t);
  }, [link.figPatient]);
  const linkColors = useMemo(() => withCloneOverrides(cloneColors, link.cloneColors), [cloneColors, link]);
  // the cohort selection drives the loaded patient's selection (tree, heatmap, report side panels)
  const storePatient = useSelector((s) => s.SingleCell.patient?.caseReportId);
  const storeSelection = useSelector((s) => s.SingleCell.selectedCellIds);
  useEffect(() => {
    if (!selection || `${storePatient}` !== `${selection.patient}`) return;
    const cur = storeSelection || [];
    if (cur.length === selection.cells.size && cur.every((id) => selection.cells.has(id))) return;
    dispatch(singleCellActions.updateSelection([...selection.cells]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, storePatient]);
  const marked = useMemo(() => (selection && selection.patient === current?.patient ? { cells: selection.cells, label: selection.label, key: `sel:${selection.label}` } : null), [selection, current]);

  const allWalks = useMemo(() => files[current?.patient]?.walks?.walks || [], [files, current?.patient]);
  const genePositions = useMemo(() => {
    const m = new Map();
    (current?.events || []).forEach((e) => {
      const g = `${e.gene || ""}`;
      if (!g || g.includes("::") || m.has(g) || !Number.isFinite(Number(e.start))) return;
      m.set(g, [`${e.seqnames}`, Number(e.start), Number(e.end) || Number(e.start)]);
    });
    return m;
  }, [current]);

  const region = useMemo(() => {
    if (!current) return { domains: [], label: "" };
    const key = regionKey && current.groups.some((g) => `g:${g.key}` === regionKey) ? regionKey : regionKey?.startsWith("gene:") || regionKey?.startsWith("f:") ? regionKey : current.groups.length ? `g:${current.groups[Math.max(0, dominantGroupIndex(current.groups, minCn))].key}` : null;
    if (regionKey?.startsWith("w:")) {
      const ws = regionKey.slice(2).split("+").map((id) => allWalks.find((x) => `${x.id}` === id)).filter(Boolean);
      const w = ws[0];
      if (w) return { key: regionKey, domains: lociDomains(walkLoci(ws), chromoBins), label: ws.map((x) => x.label).join(" + "), group: { key: w.label, walks: ws, cellIds: current.cellIds, cn: Float32Array.from(current.cellIds, (c) => Number(w.cells?.[c]) || 0) } };
    }
    if (key?.startsWith("g:")) {
      const g = current.groups.find((x) => `g:${x.key}` === key);
      if (g) return { key, domains: lociDomains(walkLoci(g.walks), chromoBins), label: `ec${g.key} walks`, group: g };
    }
    if (key?.startsWith("gene:")) {
      const locus = genePositions.get(key.slice(5));
      if (locus) return { key, domains: lociDomains([locus], chromoBins, 4e6), label: key.slice(5) };
    }
    if (key?.startsWith("f:")) {
      const f = findings.find((x) => x.key === key.slice(2));
      if (f?.event) return { key, domains: lociDomains(eventLoci(f.event), chromoBins), label: f.label };
      if (f?.group) return { key, domains: lociDomains(walkLoci(f.group.walks), chromoBins), label: f.label, group: f.group };
    }
    // no amplicons: the patient's first amplified driver, else chr7 (EGFR)
    const amp = current.events.find((e) => e.vartype === "AMP");
    const loci = amp ? eventLoci(amp) : [["7", 55e6, 55.3e6]];
    return { key: null, domains: lociDomains(loci, chromoBins, 4e6), label: amp ? `${amp.gene} AMP` : "chr7" };
  }, [current, regionKey, genePositions, chromoBins, findings, minCn, allWalks]);
  const domains = useMemo(() => region.domains.map(([a, b]) => [a, b]), [region]);

  const focus = (p, next = {}) => {
    setPatient(p);
    if (next.region !== undefined) setRegionKey(next.region);
    if (next.marked) select(p, [...next.marked.cells], { label: next.marked.label, mode: next.mode || "replace" });
    if (next.scroll !== false) setTimeout(() => patientRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };
  const markGroup = (p, key) => {
    const g = p.groups.find((x) => x.key === key);
    if (!g) return null;
    return { cells: new Set(g.cellIds.filter((id, k) => g.cn[k] >= minCn)), label: `ec${key} carriers` };
  };
  // genes for the figure markers (inside the region) and the scatter (amplified or in the region)
  const genesInRegion = useMemo(() => {
    const out = [];
    genePositions.forEach(([chr, s, e], name) => {
      const g = globalPos(chromoBins, chr, (s + e) / 2);
      if (Number.isFinite(g) && domains.some(([a, b]) => g >= a && g <= b)) out.push({ name, g });
    });
    return out.slice(0, 16);
  }, [genePositions, chromoBins, domains]);
  const scatterGenes = useMemo(() => {
    const amp = new Set((current?.events || []).filter((e) => e.vartype === "AMP").map((e) => `${e.gene}`));
    const out = [];
    genePositions.forEach(([chr, s, e], name) => {
      if (!amp.has(name) && !genesInRegion.some((x) => x.name === name)) return;
      const g = globalPos(chromoBins, chr, (s + e) / 2);
      if (Number.isFinite(g)) out.push({ name, g });
    });
    return out.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 40);
  }, [current, genePositions, genesInRegion, chromoBins]);
  const selectHere = (ids, { label, mode }) => current && select(current.patient, ids, { label, mode });
  const selectedHere = selection && selection.patient === current?.patient ? selection.cells : null;


  // default pair: the driver genes of the patient's two dominant amplicon groups (MGH303: MDM2 vs CDK4)
  const defaultPair = useMemo(() => {
    const gs = (current?.groups || []).slice().sort((x, y) => (y.cn || []).reduce((t, v) => t + v, 0) - (x.cn || []).reduce((t, v) => t + v, 0));
    const genes = [...new Set(gs.flatMap((g) => `${g.key}`.split("+")))].filter((g) => genePositions.has(g));
    return genes.length >= 2 ? genes.slice(0, 2) : null;
  }, [current, genePositions]);
  const genePair = pairGenes?.length === 2 ? pairGenes : region.group?.genes?.length >= 2 ? region.group.genes.slice(0, 2) : defaultPair;
  if (!per.length) return <Empty />;
  const regionOptions = [
    ...(current?.groups || []).map((g) => ({ value: `g:${g.key}`, label: `ec${g.key} (${g.walks.length} walk${g.walks.length === 1 ? "" : "s"})` })),
    ...(regionKey?.startsWith("f:") || regionKey?.startsWith("w:") ? [{ value: regionKey, label: region.label }] : []),
    ...[...genePositions.keys()].sort().map((g) => ({ value: `gene:${g}`, label: g })),
  ];
  const selectedViolin = region.group ? { patient: current?.patient, key: region.group.key } : null;

  return (
    <div ref={rootDiv}>
      <div className="sc-fig-selbar-wrap" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <div style={{ flex: "1 1 420px" }}>
          <SelectionBar />
        </div>
        <Space size={6}>
          <Text type="secondary">Figure style</Text>
          <Segmented size="small" value={styleName || DEFAULT_FIGURE_STYLE} onChange={(v) => dispatch(singleCellActions.updateLayout({ figureStyle: v }))} options={Object.entries(FIGURE_STYLES).map(([value, st]) => ({ value, label: st.label }))} />
        </Space>
      </div>
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card
            id="sc-fig-landscape"
            size="small"
            title={<Space><BranchesOutlined />Figure 3 · Amplicons across the cohort <Provenance id="figLandscape" /></Space>}
            extra={
              <Space wrap size={10}>
                <Space size={4}><Switch size="small" checked={curatedOnly} onChange={setCuratedOnly} /><Text>Curated walks</Text></Space>
                <Space size={4}><Switch size="small" checked={includeOther} onChange={setIncludeOther} /><Text>Non-driver walks</Text></Space>
                <Space size={4}><Text type="secondary">Min cells</Text><InputNumber size="small" min={1} value={minCells} onChange={(v) => setMinCells(v ?? 1)} style={{ width: 56 }} /></Space>
                <Space size={4}><Text type="secondary">Min copies</Text><InputNumber size="small" min={1} value={minCn} onChange={(v) => setMinCn(v ?? 1)} style={{ width: 56 }} /></Space>
              </Space>
            }
          >
            {!withAmps.length ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No ecDNA walks pass the filters" />
            ) : (
              <Row gutter={[24, 8]}>
                <Col xs={24} xl={14}>
                  <PanelHead letter="A" title="Copy number and structures per amplicon" fig="Fig 3A" hint="drag along a violin to select a copy range · click a row to open the patient below" />
                  <AmpliconViolins
                    per={withAmps}
                    selected={selectedViolin}
                    selection={selection}
                    onSelectCells={(p, ids, opts) => select(p, ids, opts)}
                    onSelect={({ patient: p, key }, event) => focus(p, { region: `g:${key}`, marked: markGroup(per.find((x) => x.patient === p), key), mode: event?.shiftKey ? "add" : "replace" })}
                  />
                </Col>
                <Col xs={24} xl={10}>
                  <PanelHead letter="B" title="Amplicon combinations per cell" fig="Fig 3B" hint="click a row to select those cells" />
                  <AmpliconUpset
                    per={withAmps}
                    selected={null}
                    onSelect={({ patient: p, cells, label }) => focus(p, { marked: { cells: new Set(cells), label: `cells with ${label}` }, scroll: false })}
                  />
                </Col>
              </Row>
            )}
            <Row gutter={[24, 8]} className="sc-fig-block">
              <Col xs={24} xxl={11}>
                <PanelHead letter="C" title="Inherited or redrawn at each division?" fig="Fig 3E" hint="click a walk to open it below" />
                <PhyloSignalPanel per={per} onSelect={({ patient: p, key }) => focus(p, { region: `g:${key}`, marked: markGroup(per.find((x) => x.patient === p), key) })} />
                <div className="sc-fig-caption">
                  Above the dashed line, copies follow the tree: cells inherit their parent&apos;s load (as for EGFR ecDNA in BWH70). Near the controls, copies are redrawn at each division.
                </div>
              </Col>
              <Col xs={24} xxl={13}>
                <PanelHead letter="D" title="Subclonal findings" hint="driver events and amplicons in part of a tumor, following the tree · click a row" extra={<Provenance id="figSubclonal" />} />
                <SubclonalFindingsTable
                  findings={findings}
                  cloneColors={cloneColors}
                  selectedKey={regionKey?.startsWith("f:") ? regionKey.slice(2) : null}
                  onSelect={(f) => focus(f.patient, { region: `f:${f.key}`, marked: { cells: f.carriers, label: `${f.label} carriers`, key: `f:${f.key}` } })}
                />
              </Col>
            </Row>
          </Card>
        </Col>
        <Col span={24}>
          <div ref={patientRef} style={{ scrollMarginTop: 12 }} />
          <Card
            id="sc-fig-patient"
            size="small"
            title={<Space><BarChartOutlined />Figures 4–5 · Clonal amplicon figure <Provenance id="figClonalAmplicon" /></Space>}
            extra={
              <Space wrap size={8}>
                <Segmented size="small" value={current?.patient} onChange={(p) => { setPatient(p); setRegionKey(null); }} options={per.map((p) => ({ value: p.patient, label: p.patient }))} />
              </Space>
            }
          >
            {current && linkMode && (
              // committee links (figlayout= / figwalk=): the report's own heatmap + walk copies view of the linked walks, as the frozen committee copy shows it
              <div style={{ marginBottom: 12 }}>
                <PatientEcdnaView patient={current.patient} domains={domains} walkIds={region.group?.walks.map((w) => w.id)} marked={linkMarked || marked} select={link.figSelect} layout={link.figLayout} />
              </div>
            )}
            {current && (
              <PatientFigure
                patient={current.patient}
                events={current.events}
                focusWalkId={focusWalkId}
                onFocusWalk={setFocusWalkId}
                onSelectCells={(ids, label) => select(current.patient, ids, { label })}
                onView={setFigDomains}
              />
            )}
            <Row gutter={[24, 16]} className="sc-fig-block">
              <Col xs={24} xl={14}>
                {current && <PatientProfiles patient={current.patient} focusWalkId={focusWalkId} domains={figDomains} events={current.events} />}
              </Col>
              <Col xs={24} xl={10}>
                <PanelHead letter="D" title="Amplicon copies per variant" fig="Fig 4 right" hint="carriers only · rank-sum test vs the focused variant · click a box or dot to select, a name to focus" />
                {current && <PatientVariantCopies patient={current.patient} focusWalkId={focusWalkId} onFocusWalk={setFocusWalkId} selected={selectedHere} onSelect={selectHere} />}
              </Col>
            </Row>
            <Row gutter={[24, 16]} className="sc-fig-block">
              <Col xs={24} xl={9}>
                <PanelHead letter="E" title="Copies of one amplicon against another" fig="Fig 5E" hint="lasso to select" />
                {current && <GenePairScatter patient={current.patient} cells={current.cells} groups={current.groups} cnEntry={cnRows[current.patient]} genes={scatterGenes} cloneColors={linkColors} selected={selectedHere} onSelect={selectHere} />}
              </Col>
              <Col xs={24} xl={7}>
                <PanelHead letter="F" title="Carriers per clade" fig="Fig 4F" hint="click a bar" />
                {current && <CladeCarrierBars cells={current.cells} groups={current.groups} minCn={minCn} cloneColors={linkColors} selected={selectedHere} onSelect={selectHere} />}
              </Col>
              <Col xs={24} xl={8}>
                <PanelHead letter="G" title="Amplicon state per clade" fig="Fig 5F" hint="focused variant · click a clade" />
                {current && <PatientCladeStates patient={current.patient} focusWalkId={focusWalkId} onSelectCells={(ids, label) => select(current.patient, ids, { label })} />}
              </Col>
            </Row>
            <Row gutter={[24, 16]} className="sc-fig-block">
              <Col xs={24} xl={12} id="sc-fig-genepair">
                <PanelHead letter="H" title="Gene vs gene copy number per clone" fig="Fig 5E" hint="ecDNA vs integrated: slope / R² per clone" extra={<Select size="small" mode="multiple" style={{ minWidth: 180, marginLeft: 8 }} value={genePair || []} onChange={(v) => setPairGenes(v.length ? v.slice(-2) : null)} options={[...genePositions.keys(), ...(genePair || [])].filter((g, i, a) => a.indexOf(g) === i).sort().map((g) => ({ value: g, label: g }))} />} />
                {genePair ? (
                  <GeneCnScatter cnEntry={cnRows[current?.patient]} genes={genePair} cloneColors={linkColors} cloneLabels={link.cloneLabels} width={520} />
                ) : (
                  <Text type="secondary" style={{ fontSize: 12 }}>Pick two genes on one amplicon (e.g. CDK4 and MDM2).</Text>
                )}
              </Col>
            </Row>
            <Collapse
              ghost
              style={{ marginTop: 8 }}
              activeKey={showLive}
              onChange={(k) => setShowLive(Array.isArray(k) ? k : [k])}
              items={[
                {
                  key: "live",
                  label: (
                    <Space size={8} wrap>
                      <Text type="secondary">Live report panels for {current?.patient}: zoomable heatmap, walk copies along the tree, walk structures and co-occurrence</Text>
                      <Select size="small" showSearch style={{ width: 220 }} value={region.key || undefined} placeholder="Region" options={regionOptions} onChange={(v) => setRegionKey(v)} onClick={(e) => e.stopPropagation()} />
                    </Space>
                  ),
                  children: showLive.includes("live") && current ? <PatientEcdnaView patient={current.patient} domains={domains} walkIds={region.group?.walks.map((w) => w.id)} marked={marked} /> : null,
                },
              ]}
            />
          </Card>
        </Col>
      </Row>
      <ScEventModal />
      <SelectedCellsModal per={per} cnRows={cnRows} chromoBins={chromoBins} cloneColors={cloneColors} domains={domains} genes={genesInRegion} onOpenCell={onOpenCell} getContainer={() => rootRef.current || document.body} />
    </div>
  );
}
