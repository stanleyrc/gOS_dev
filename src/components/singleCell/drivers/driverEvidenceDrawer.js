import React, { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Alert, Button, Col, Drawer, Empty, Row, Space, Tabs, Tag, Typography } from "antd";
import { AimOutlined, FileSearchOutlined, NodeIndexOutlined, SelectOutlined } from "@ant-design/icons";
import singleCellActions from "../../../redux/singleCell/actions";
import settingsActions from "../../../redux/settings/actions";
import { geneValues } from "../../../helpers/singleCell/staticRna";
import { formatP } from "../../../helpers/singleCell/tests";
import { padDomains } from "../../../helpers/singleCell/eventDomains";
import { locationToDomains } from "../../../helpers/utility";
import { KIND_LABEL } from "../../../helpers/singleCell/driverSummary";
import GeneInfoCard from "../rna/geneInfoCard";
import SplicingCard from "../rna/splicingCard";
import RnaFusionModal from "../rna/rnaFusionModal";
import DriverEvidenceCard from "./driverEvidenceCard";
import LocalCnPlot from "./localCnPlot";
import { GeneDots, driverLoci } from "./driverExpressionCard";
import { CARRIER_COLOR, COMPARATOR_COLOR } from "./useDriverEvidence";

const { Text, Paragraph } = Typography;
const IGV_CELLS = 6;

/** Breakpoints of a fusion ("12:53097436-53102345+,9:...") or the event's start. */
export function igvLoci(event) {
  const bps = `${event.fusion_gene_coords || ""}`
    .split(",")
    .map((s) => s.match(/^(?:chr)?(\w+):(\d+)/))
    .filter(Boolean)
    .map((m) => ({ chromosome: m[1], position: Number(m[2]) }));
  if (bps.length) return bps;
  const position = Number(event.start);
  return Number.isFinite(position) ? [{ chromosome: `${event.seqnames}`, position }] : [];
}

/** Actions shared by the board and the drawer: reads in IGV, zoom the heatmap, select carriers, deep dive. */
export function useDriverActions() {
  const dispatch = useDispatch();
  const { chromoBins, genomeLength } = useSelector((s) => s.Settings);
  return {
    igv: (s) => {
      const loci = igvLoci(s.members[0].event);
      if (!loci.length) return;
      dispatch(singleCellActions.openIgv({ cellIds: s.members[0].carriers.slice(0, IGV_CELLS), chromosome: loci[0].chromosome, position: loci[0].position, loci: loci.length > 1 ? loci : undefined, label: s.label }));
      dispatch(settingsActions.updateTab("7"));
    },
    zoom: (s) => {
      const e = s.members[0].event;
      const loc = e.Genome_Location || `${e.seqnames}:${e.start}-${e.end}`;
      try {
        const domains = padDomains(locationToDomains(chromoBins, loc, { clampRanges: true }), 2.5e6, genomeLength);
        if (domains) {
          dispatch(singleCellActions.updateSelection(s.members[0].carriers));
          dispatch(settingsActions.updateDomains(domains));
          dispatch(settingsActions.updateTab("7"));
        }
      } catch (error) {
        // bad coordinates: nothing to zoom to
      }
    },
    select: (s) => dispatch(singleCellActions.updateSelection(s.members[0].carriers)),
    deepDive: (s) => dispatch(singleCellActions.updateDriverFocus(s.key)),
  };
}

/** Carrier vs non-carrier dots for the driver's genes and its most-shifted programs. */
function ExpressionTab({ summary, rna, nonCarriers, programs }) {
  const { summary: rs, matrix, rowOfId } = rna;
  const carriers = summary.members[0].carriers;
  const panels = useMemo(() => {
    if (!rs || !matrix) return [];
    const ids = (list) => list.filter((id) => rowOfId.has(id)).map((id) => ({ id, r: rowOfId.get(id) }));
    const A = ids(carriers);
    const B = ids(nonCarriers);
    const groups = (v) => [
      { key: "a", label: "Carriers", color: CARRIER_COLOR, values: A.map(({ id, r }) => ({ id, v: v[r] })) },
      { key: "b", label: "Other tumor cells", color: COMPARATOR_COLOR, values: B.map(({ id, r }) => ({ id, v: v[r] })) },
    ];
    const genePanels = summary.dosage
      .map((g) => {
        const gi = rs.geneIndex?.get(g.gene);
        return gi == null ? null : { key: g.gene, title: `${g.gene} expression`, stat: g, groups: groups(geneValues(matrix, rs.cells.length, gi)) };
      })
      .filter(Boolean);
    const progPanels = summary.programs.slice(0, 3).map((p) => {
      const sc = programs.find((x) => x.name === p.name);
      const min = sc ? sc.scores.reduce((m, x) => Math.min(m, x), Infinity) : 0;
      const v = sc ? sc.scores.map((x) => x - min) : null;
      return v ? { key: p.name, title: `${p.name} program score`, prog: p, groups: groups(v) } : null;
    });
    return [...genePanels, ...progPanels.filter(Boolean)];
  }, [rs, matrix, rowOfId, carriers, nonCarriers, summary, programs]);
  if (!rs) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No RNA for this patient" />;
  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <Text type="secondary">Each dot is a cell with RNA (log-normalised expression; program scores shifted to start at 0). Line: median.</Text>
      <Row gutter={[12, 8]}>
        {panels.map((p) => (
          <Col key={p.key} xs={24} md={12}>
            <GeneDots gene={p.title} groups={p.groups} row={null} showDetected={Boolean(p.stat)} />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {p.stat
                ? `fold change ${(2 ** p.stat.log2fc).toFixed(2)}× · detected in ${Math.round(p.stat.detA * 100)}% vs ${Math.round(p.stat.detB * 100)}% · AUC ${p.stat.auc.toFixed(2)} · ${formatP(p.stat.p)}`
                : `difference ${p.prog.d.toFixed(2)} SD (95% CI ${p.prog.lo.toFixed(2)} to ${p.prog.hi.toFixed(2)}) · ${formatP(p.prog.p)} · q ${p.prog.q.toFixed(3)}`}
            </Text>
          </Col>
        ))}
      </Row>
    </Space>
  );
}

/** Copy number around the driver's locus (both partners of a fusion) and the strongest co-travelling CN regions. */
function CnTab({ summary, nonCarriers }) {
  const { chromoBins } = useSelector((s) => s.Settings);
  const carriers = summary.members[0].carriers;
  const loci = driverLoci(summary.members[0].event, chromoBins);
  const windows = [
    ...loci.slice(0, 2).map((l, k) => ({ key: `locus${k}`, title: `${summary.genes[k] || summary.genes[0]} locus`, lo: l.start - 8e6, hi: l.end + 8e6, marks: [{ g: (l.start + l.end) / 2, label: summary.genes[k] || summary.genes[0] }] })),
    ...summary.cn
      .filter((r) => !loci.some((l) => l.start <= r.hi + 8e6 && l.end >= r.lo - 8e6))
      .slice(0, 2)
      .map((r, k) => ({ key: `cn${k}`, title: `Co-travelling copy-number change: ${r.where}${r.genes.length ? ` (${r.genes.slice(0, 6).join(", ")})` : ""}`, lo: r.lo - 4e6, hi: r.hi + 4e6, marks: [] })),
  ];
  return (
    <Space direction="vertical" style={{ width: "100%" }} size={14}>
      <Text type="secondary">Rows are cells (carriers on top), colour is copy number on the heatmap palette; lines above are each group's mean. Hover for values.</Text>
      {windows.map((w) => (
        <div key={w.key}>
          <Text strong>{w.title}</Text>
          <LocalCnPlot carriers={carriers} others={nonCarriers} lo={Math.max(w.lo, 0)} hi={w.hi} marks={w.marks} />
        </div>
      ))}
    </Space>
  );
}

/**
 * One-click evidence for a driver from the ranked board: expression of its
 * genes and shifted programs, copy number around it, fusion RNA (chimeric
 * reads, partner exons), linked splicing and what each gene is.
 */
export default function DriverEvidenceDrawer({ summary, tab, onTab, onClose, rna, nonCarriers, programs }) {
  const actions = useDriverActions();
  const rnaFusions = useSelector((s) => s.SingleCell.rnaFusions);
  const [fusionModal, setFusionModal] = useState(null);
  if (!summary) return null;
  const lead = summary.members[0];
  const isFusion = summary.kind === "fusion";
  const rnaFusion =
    isFusion && rnaFusions?.status === "ok"
      ? (rnaFusions.data.fusions || []).find((f) => summary.genes.every((g) => [f.gene1, f.gene2].includes(g)))
      : null;
  const splice = summary.spliceLinks[0]?.finding || null;
  const items = [
    { key: "expression", label: "Expression", children: <ExpressionTab summary={summary} rna={rna} nonCarriers={nonCarriers} programs={programs} /> },
    { key: "cn", label: "Copy number", children: <CnTab summary={summary} nonCarriers={nonCarriers} /> },
    isFusion && {
      key: "fusion",
      label: "Fusion RNA",
      children: (
        <Space direction="vertical" style={{ width: "100%" }}>
          {rnaFusion ? (
            <Alert type="success" showIcon message={`RNA fusion call ${rnaFusion.label}: ${rnaFusion.n_cells} cells, ${rnaFusion.reads} reads`} action={<Button size="small" onClick={() => setFusionModal(rnaFusion)}>Open RNA fusion</Button>} />
          ) : (
            <Alert type="info" showIcon message="No RNA fusion call (Arriba) joins these two genes in this patient." />
          )}
          <DriverEvidenceCard driver={lead} carriers={lead.carriers} others={nonCarriers} rna={rna} />
        </Space>
      ),
    },
    {
      key: "splicing",
      label: `Splicing${summary.spliceLinks.length ? ` (${summary.spliceLinks.length} linked)` : ""}`,
      children: (
        <Space direction="vertical" style={{ width: "100%" }}>
          {summary.spliceLinks.length ? (
            summary.spliceLinks.map((l) => (
              <Alert
                key={l.finding.id}
                type="warning"
                showIcon
                message={l.finding.text}
                description={`In ${l.a} carrier cells (${Math.round(l.fracA * 100)}%) vs ${l.b} other cells (${Math.round(l.fracB * 100)}%), ${formatP(l.p)}: this RNA change travels with the driver.`}
              />
            ))
          ) : (
            <Text type="secondary">No splicing finding is enriched in the carriers. The card below shows all splicing of this patient.</Text>
          )}
          <SplicingCard summary={rna.summary} focus={splice ? { id: splice.id, at: summary.key } : null} />
        </Space>
      ),
    },
    {
      key: "gene",
      label: "What the genes are",
      children: summary.genes.map((g) => <GeneInfoCard key={g} gene={g} />),
    },
  ].filter(Boolean);
  return (
    <Drawer
      open
      width={Math.min(1100, window.innerWidth - 40)}
      onClose={onClose}
      title={
        <Space wrap>
          <Text strong style={{ fontSize: 16 }}>{summary.label}</Text>
          <Tag>{KIND_LABEL[summary.kind]}</Tag>
          <Text type="secondary">{`${summary.n} of ${summary.total} tumor cells`}</Text>
        </Space>
      }
      extra={
        <Space wrap>
          {!["amp", "homdel"].includes(summary.kind) && (
            <Button size="small" icon={<FileSearchOutlined />} onClick={() => actions.igv(summary)}>
              Reads (IGV)
            </Button>
          )}
          <Button size="small" icon={<AimOutlined />} onClick={() => actions.zoom(summary)}>
            Heatmap
          </Button>
          <Button size="small" icon={<SelectOutlined />} onClick={() => actions.select(summary)}>
            Select carriers
          </Button>
          <Button
            size="small"
            type="primary"
            icon={<NodeIndexOutlined />}
            onClick={() => {
              actions.deepDive(summary);
              onClose();
            }}
          >
            Deep dive
          </Button>
        </Space>
      }
    >
      <Paragraph style={{ marginBottom: 8 }}>{summary.alteration}</Paragraph>
      <Tabs activeKey={items.some((i) => i.key === tab) ? tab : "expression"} onChange={onTab} items={items} destroyInactiveTabPane />
      {fusionModal && <RnaFusionModal fusion={fusionModal} nCellsRna={rnaFusions?.data?.nCellsRna} onClose={() => setFusionModal(null)} />}
    </Drawer>
  );
}
