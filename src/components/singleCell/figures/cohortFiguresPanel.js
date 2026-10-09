import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { Card, Col, Collapse, Empty, InputNumber, Row, Segmented, Select, Space, Switch, Tooltip, Typography } from "antd";
import { ApartmentOutlined, BarChartOutlined, BranchesOutlined, NodeIndexOutlined } from "@ant-design/icons";
import useContainerWidth from "../useContainerWidth";
import { cellsForPatient } from "../../../helpers/singleCell/cellFiles";
import { groupCombinations, isNormalClone, subclonalFindings, walkGroups } from "../../../helpers/singleCell/figures";
import { AmpliconUpset, AmpliconViolins } from "./ampliconLandscape";
import PhyloSignalPanel from "./phyloSignalPanel";
import SubclonalFindingsTable from "./subclonalFindingsTable";
import { SegmentCorrelation } from "./patientPanels";
import PatientEcdnaView from "./patientEcdnaView";
import { Provenance } from "../hintLine";
import { useFigureStyleName } from "./figureCanvas";
import singleCellActions from "../../../redux/singleCell/actions";
import { FIGURE_STYLES, DEFAULT_FIGURE_STYLE } from "../../../helpers/singleCell/figureStyle";
import CloneFigure from "./cloneFigure";
import GenePairScatter from "./genePairScatter";
import CladeCarrierBars from "./cladeCarrierBars";
import SelectedCellsModal from "./selectedCellsModal";
import { CellSelectionProvider, SelectionBar, useCellSelection } from "./cellSelection";

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
  const [ref, width] = useContainerWidth(1200);
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
  const [patient, setPatient] = useState(null);
  const [regionKey, setRegionKey] = useState(null); // "g:<set>" | "gene:<name>" | "f:<finding key>"
  const current = per.find((p) => p.patient === patient) || withAmps[0] || per[0];
  const marked = useMemo(() => (selection && selection.patient === current?.patient ? { cells: selection.cells, label: selection.label, key: `sel:${selection.label}` } : null), [selection, current]);

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
    const key = regionKey && current.groups.some((g) => `g:${g.key}` === regionKey) ? regionKey : regionKey?.startsWith("gene:") || regionKey?.startsWith("f:") ? regionKey : current.groups[0] ? `g:${current.groups[0].key}` : null;
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
  }, [current, regionKey, genePositions, chromoBins, findings]);
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

  const corrSets = useMemo(() => {
    if (!current) return null;
    const tumour = current.cells.filter((c) => !isNormalClone(c.clone_id)).map((c) => c.cell_id);
    let carriers = marked?.cells;
    let label = marked?.label;
    if (!carriers?.size && region.group) {
      const g = region.group;
      carriers = new Set(g.cellIds.filter((id, k) => g.cn[k] >= minCn));
      label = `ec${g.key} carriers`;
    }
    if (!carriers?.size) return null;
    return { carriers, others: new Set(tumour.filter((id) => !carriers.has(id))), label };
  }, [current, marked, region, minCn]);

  if (!per.length) return <Empty />;
  const half = width >= 1100 ? Math.floor((width - 32) / 2) - 26 : width - 26;
  const regionOptions = [
    ...(current?.groups || []).map((g) => ({ value: `g:${g.key}`, label: `ec${g.key} (${g.walks.length} walk${g.walks.length === 1 ? "" : "s"})` })),
    ...(regionKey?.startsWith("f:") ? [{ value: regionKey, label: region.label }] : []),
    ...[...genePositions.keys()].sort().map((g) => ({ value: `gene:${g}`, label: g })),
  ];
  const selectedViolin = region.group ? { patient: current?.patient, key: region.group.key } : null;

  return (
    <div ref={rootDiv}>
      <div className="sc-fig-selbar-wrap">
        <SelectionBar />
      </div>
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Space size={8} wrap>
            <Text type="secondary">Figure style</Text>
            <Segmented size="small" value={styleName || DEFAULT_FIGURE_STYLE} onChange={(v) => dispatch(singleCellActions.updateLayout({ figureStyle: v }))} options={Object.entries(FIGURE_STYLES).map(([value, st]) => ({ value, label: st.label }))} />
          </Space>
        </Col>
        <Col span={24}>
          <Card
            size="small"
            title={<Space><BranchesOutlined />Amplicon landscape <Provenance id="figLandscape" /> <Text type="secondary" style={{ fontWeight: 400 }}>· Fig 3A–B</Text></Space>}
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
              <Row gutter={16}>
                <Col xs={24} xl={13}>
                  <AmpliconViolins
                    per={withAmps}
                    selected={selectedViolin}
                    selection={selection}
                    onSelectCells={(p, ids, opts) => select(p, ids, opts)}
                    onSelect={({ patient: p, key }, event) => focus(p, { region: `g:${key}`, marked: markGroup(per.find((x) => x.patient === p), key), mode: event?.shiftKey ? "add" : "replace" })}
                  />
                </Col>
                <Col xs={24} xl={11}>
                  <AmpliconUpset
                    per={withAmps}
                    selected={null}
                    onSelect={({ patient: p, cells, label }) => focus(p, { marked: { cells: new Set(cells), label: `cells with ${label}` }, scroll: false })}
                  />
                </Col>
              </Row>
            )}
          </Card>
        </Col>
        <Col xs={24} xxl={11}>
          <Card size="small" title={<Space><NodeIndexOutlined />Inherited or redrawn? <Provenance id="figPhyloSignal" /> <Text type="secondary" style={{ fontWeight: 400 }}>· Fig 3E, every amplicon</Text></Space>}>
            <PhyloSignalPanel per={per} onSelect={({ patient: p, key }) => focus(p, { region: `g:${key}`, marked: markGroup(per.find((x) => x.patient === p), key) })} />
            <div className="sc-fig-caption">
              Above the dashed line, copies follow the tree: cells inherit their parent&apos;s load (as for EGFR ecDNA in BWH70). Near the controls, copies are redrawn at each division. Click a walk to open it below.
            </div>
          </Card>
        </Col>
        <Col xs={24} xxl={13}>
          <Card size="small" title={<Space><ApartmentOutlined />Subclonal findings <Provenance id="figSubclonal" /> <Text type="secondary" style={{ fontWeight: 400 }}>· new: driver events and amplicons in part of a tumour, following the tree</Text></Space>}>
            <SubclonalFindingsTable
              findings={findings}
              cloneColors={cloneColors}
              selectedKey={regionKey?.startsWith("f:") ? regionKey.slice(2) : null}
              onSelect={(f) => focus(f.patient, { region: `f:${f.key}`, marked: { cells: f.carriers, label: `${f.label} carriers`, key: `f:${f.key}` } })}
            />
          </Card>
        </Col>
        <Col span={24}>
          <div ref={patientRef} style={{ scrollMarginTop: 12 }} />
          <Card
            size="small"
            title={<Space><BarChartOutlined />Clonal amplicon view <Provenance id="figClonalAmplicon" /> <Text type="secondary" style={{ fontWeight: 400 }}>· Fig 4B / 5B / 5D</Text></Space>}
            extra={
              <Space wrap size={8}>
                <Segmented size="small" value={current?.patient} onChange={(p) => { setPatient(p); setRegionKey(null); }} options={per.map((p) => ({ value: p.patient, label: p.patient }))} />
                <Select size="small" showSearch style={{ width: 220 }} value={region.key || undefined} placeholder="Region" options={regionOptions} onChange={(v) => setRegionKey(v)} />
              </Space>
            }
          >
            {current && (
              <CloneFigure
                patient={current.patient}
                layout={current.tree}
                cells={current.cells}
                groups={current.groups}
                snv={current.snvPacked ? { packed: current.snvPacked, nVariants: current.nVariants } : null}
                cnEntry={cnRows[current.patient]}
                domains={domains}
                chromoBins={chromoBins}
                genes={genesInRegion}
                cloneColors={cloneColors}
                selected={selectedHere}
                onSelect={selectHere}
              />
            )}
            <Row gutter={[24, 16]} style={{ marginTop: 14 }}>
              <Col xs={24} xl={9}>
                <div className="sc-fig-subtitle">Copies of one amplicon against another <span>Fig 5E · lasso to select</span></div>
                {current && <GenePairScatter patient={current.patient} cells={current.cells} groups={current.groups} cnEntry={cnRows[current.patient]} genes={scatterGenes} cloneColors={cloneColors} selected={selectedHere} onSelect={selectHere} />}
              </Col>
              <Col xs={24} xl={7}>
                <div className="sc-fig-subtitle">Carriers per clade <span>Fig 4F · click a bar</span></div>
                {current && <CladeCarrierBars cells={current.cells} groups={current.groups} minCn={minCn} cloneColors={cloneColors} selected={selectedHere} onSelect={selectHere} />}
              </Col>
              <Col xs={24} xl={8}>
                <Tooltip title="Pearson correlation of log copy number between positions across the region(s), in the selected cells (upper triangle) and the other tumor cells (lower). Red blocks off the diagonal = segments that rise and fall together, i.e. carried on the same molecule.">
                  <div className="sc-fig-subtitle">Segment co-variation <span>Fig 5C{corrSets ? ` · ${corrSets.label}` : ""}</span></div>
                </Tooltip>
                {corrSets && cnRows[current?.patient]?.cellRows?.length ? (
                  <SegmentCorrelation width={half} cnEntry={cnRows[current.patient]} domains={domains} carriers={corrSets.carriers} others={corrSets.others} chromoBins={chromoBins} />
                ) : (
                  <div className="sc-fig-empty">{corrSets ? "Loading cell copy number…" : "Select cells (rows, tree node, bar or lasso) to compare them with the rest."}</div>
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
                  label: <Text type="secondary">Live report panels for {current?.patient}: zoomable heatmap, walk copies along the tree, walk structures and co-occurrence</Text>,
                  children: showLive.includes("live") && current ? <PatientEcdnaView patient={current.patient} domains={domains} walkIds={region.group?.walks.map((w) => w.id)} marked={marked} /> : null,
                },
              ]}
            />
          </Card>
        </Col>
      </Row>
      <SelectedCellsModal per={per} cnRows={cnRows} chromoBins={chromoBins} cloneColors={cloneColors} domains={domains} genes={genesInRegion} onOpenCell={onOpenCell} getContainer={() => rootRef.current || document.body} />
    </div>
  );
}
