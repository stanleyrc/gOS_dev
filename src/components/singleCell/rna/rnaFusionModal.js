import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Alert, Avatar, Button, Descriptions, Modal, Progress, Select, Space, Switch, Table, Tabs, Tag, Tooltip, Typography, theme } from "antd";
import CellIgvPanel, { SC_MAX_RNA_TRACKS } from "../cellIgvPanel";
import HintLine from "../hintLine";
import ColorTag from "../colorTag";
import { SingleCellEventTracks } from "../eventCellTracks";
import filteredEventsActions from "../../../redux/filteredEvents/actions";
import { tierColor } from "../../../helpers/utility";
import {
  defaultPlotCell,
  defaultRnaCells,
  fusionCloneDistribution,
  fusionLoci,
  fusionPlotRecord,
  fusionTier,
  geneDisplay,
  isNonProductive,
  isReadThrough,
  matchDnaEvent,
  parseDomains,
  rnaCellMaps,
} from "../../../helpers/singleCell/rnaFusions";
import { SC_MAX_TRACK_CELLS } from "../../../redux/singleCell/actions";

const { Text } = Typography;
const k = "components.single-cell.rna-fusions";
export const RNA_IGV_DEFAULT_CELLS = 6;
const RNA_WINDOW = 150; // bp either side of each breakpoint (slices hold ±300 bp)
const PLOT_PAD = 2.5e5; // genome plots: ±250 kb around each breakpoint (amplicon context)

/** Gene of an Arriba field with the other listed genes in a tooltip. */
export function GeneName({ gene }) {
  const g = geneDisplay(gene);
  if (!g.rest.length && !g.intergenic) return <span>{g.name}</span>;
  return (
    <Tooltip title={g.full}>
      <span style={{ borderBottom: "1px dotted currentColor" }}>{g.name}</span>
    </Tooltip>
  );
}

/** Both genes of a fusion, "A::B", with tooltips for intergenic / multi-gene fields. */
export function FusionLabel({ fusion }) {
  return (
    <span>
      <GeneName gene={fusion.gene1} />
      ::
      <GeneName gene={fusion.gene2} />
    </span>
  );
}

/** Tier badge (DNA driver tier colours) with the tier's meaning and the fusion's reasons in a tooltip. */
export function FusionTierTag({ fusion, size = "small" }) {
  const { t } = useTranslation("common");
  const tier = fusionTier(fusion);
  const reasons = fusion?.tier_reasons || [];
  return (
    <Tooltip
      styles={{ root: { maxWidth: 380 } }}
      title={
        <div>
          <div style={{ fontWeight: 600 }}>{t(`${k}.tier-${tier}`)}</div>
          <div style={{ opacity: 0.85, marginBottom: reasons.length ? 4 : 0 }}>{t(`${k}.tier-${tier}-tip`)}</div>
          {reasons.map((r) => (
            <div key={r}>• {r}</div>
          ))}
        </div>
      }
    >
      <Avatar size={size} aria-label={`Tier ${tier}`} style={{ color: "#FFF", backgroundColor: tierColor(tier), fontWeight: 700, cursor: "default", flex: "none" }}>
        {tier}
      </Avatar>
    </Tooltip>
  );
}

/** RNA tracks config for CellIgvPanel from a fusion's cells. */
export const rnaTracksFor = (fusion, rnaIds, patientId) => {
  const byId = new Map((fusion?.cells || []).map((c) => [c.rna_id, c]));
  return (rnaIds || []).map((id) => byId.get(id)).filter((c) => c && c.bam).map((c) => ({ rna_id: c.rna_id, bam: c.bam, patientId }));
};

/**
 * Schematic of a fusion: 5' gene (kept up to breakpoint 1) joined to the 3'
 * gene (from breakpoint 2), the site of each breakpoint, the reading frame
 * and the protein domains each side keeps (Arriba retained_protein_domains).
 */
export function FusionSchematic({ fusion }) {
  const { t } = useTranslation("common");
  const { token } = theme.useToken();
  const [d1, d2] = parseDomains(fusion.retained_domains);
  const frame = fusion.reading_frame && fusion.reading_frame !== "." ? fusion.reading_frame : null;
  const frameColor = frame === "in-frame" ? "green" : frame === "out-of-frame" ? "orange" : frame === "stop-codon" ? "red" : "default";
  const side = (gene, site, bp, strand, transcript, domains, color, prime) => (
    <div style={{ flex: 1, minWidth: 220 }}>
      <div
        style={{
          background: color,
          color: "#fff",
          borderRadius: prime === "5" ? "6px 0 0 6px" : "0 6px 6px 0",
          padding: "6px 10px",
          fontWeight: 600,
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span>
          {prime}′ <GeneName gene={gene} />
        </span>
        <span style={{ fontWeight: 400, opacity: 0.9 }}>{site}</span>
      </div>
      <div style={{ padding: "4px 2px", fontSize: 12, color: token.colorTextSecondary }}>
        {bp} {strand ? `(${strand})` : ""} {transcript && transcript !== "." ? `· ${transcript}` : ""}
      </div>
      <Space size={[4, 4]} wrap>
        {domains.length ? (
          domains.map((d) => (
            <Tag key={d.name} color={/kinase/i.test(d.name) ? "geekblue" : undefined}>
              {d.name}
              {d.pct != null && d.pct < 100 ? ` (${d.pct}%)` : ""}
            </Tag>
          ))
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t(`${k}.no-domains`)}
          </Text>
        )}
      </Space>
    </div>
  );
  return (
    <div className="sc-fusion-schematic">
      <div style={{ display: "flex", alignItems: "stretch", flexWrap: "wrap" }}>
        {side(fusion.gene1, fusion.site1, fusion.breakpoint1, fusion.strand1, fusion.transcript1, d1, "#2177B3", "5")}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0 6px" }}>
          <div style={{ width: 3, height: 32, background: token.colorError }} />
          <Tag color={frameColor} style={{ marginTop: 4, marginRight: 0 }}>
            {frame || t(`${k}.frame-unknown`)}
          </Tag>
        </div>
        {side(fusion.gene2, fusion.site2, fusion.breakpoint2, fusion.strand2, fusion.transcript2, d2, "#974DA3", "3")}
      </div>
      <HintLine text={t(`${k}.schematic-help`)} />
    </div>
  );
}

/** Carriers per DNA clone (with the share of the clone's RNA cells), RNA-only carriers apart. */
function CloneDistribution({ fusion }) {
  const { t } = useTranslation("common");
  const { cells, cloneColors } = useSelector((s) => s.SingleCell);
  const rnaCells = useSelector((s) => s.SingleCell.rna?.data?.cells || null);
  const { rnaOf } = useMemo(() => rnaCellMaps([], rnaCells || []), [rnaCells]);
  const dist = useMemo(() => fusionCloneDistribution(fusion, cells, rnaCells?.length ? rnaOf : null), [fusion, cells, rnaCells, rnaOf]);
  const rows = dist.clones.filter((c) => c.carriers > 0 || c.withRna > 0);
  if (!rows.length && !dist.rnaOnly) return null;
  // no carrier on the tree: the per-clone table would be all zeros
  if (!dist.clones.some((c) => c.carriers > 0)) {
    return (
      <Space size={6}>
        <Text strong>{t(`${k}.clones-title`)}</Text>
        <Text type="secondary">{t(`${k}.clones-none`, { rnaOnly: dist.rnaOnly, unplaced: dist.unplaced })}</Text>
      </Space>
    );
  }
  return (
    <div>
      <Space size={6}>
        <Text strong>{t(`${k}.clones-title`)}</Text>
        <HintLine inline text={t(`${k}.clones-help`)} />
      </Space>
      <Table
        size="small"
        rowKey="clone"
        pagination={false}
        dataSource={rows}
        style={{ maxWidth: 560 }}
        columns={[
          { title: t(`${k}.col-clone`), dataIndex: "clone", render: (v) => <ColorTag color={cloneColors[v]}>{v}</ColorTag> },
          { title: t(`${k}.col-carriers`), dataIndex: "carriers", align: "right" },
          { title: t(`${k}.col-clone-rna`), dataIndex: "withRna", align: "right" },
          {
            title: t(`${k}.col-clone-frac`),
            dataIndex: "fraction",
            render: (v) => (v == null ? "–" : <Progress percent={Math.round(v * 100)} status="normal" format={(p) => `${p}%`} size="small" strokeColor={tierColor(2)} style={{ width: 160, margin: 0 }} />),
          },
        ]}
      />
      {(dist.rnaOnly > 0 || dist.unplaced > 0) && (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {t(`${k}.clones-rna-only`, { rnaOnly: dist.rnaOnly, unplaced: dist.unplaced })}
        </Text>
      )}
    </div>
  );
}

/**
 * IGV of an RNA fusion: the RNA read slices of the chosen supporting cells
 * at both breakpoints (multi-locus), optionally with the same cells' DNA reads.
 */
export function RnaFusionReads({ fusion }) {
  const { t } = useTranslation("common");
  const patientId = useSelector((s) => s.SingleCell.patient?.caseReportId);
  const withBam = useMemo(() => (fusion?.cells || []).filter((c) => c.bam), [fusion]);
  const [picked, setPicked] = useState([]);
  const [withDna, setWithDna] = useState(false);
  useEffect(() => setPicked(defaultRnaCells(fusion, RNA_IGV_DEFAULT_CELLS)), [fusion]);
  if (!withBam.length) return <Alert type="info" showIcon message={t(`${k}.no-bams`)} />;
  const loci = fusionLoci(fusion);
  const byId = new Map(withBam.map((c) => [c.rna_id, c]));
  const dnaIds = withDna ? picked.map((id) => byId.get(id)?.cell_id).filter(Boolean).slice(0, SC_MAX_TRACK_CELLS) : [];
  const view = loci.length
    ? { cellIds: dnaIds, rnaTracks: rnaTracksFor(fusion, picked, patientId), chromosome: loci[0].chromosome, position: loci[0].position, loci: loci.length > 1 ? loci : undefined, window: RNA_WINDOW, label: fusion.label }
    : null;
  return (
    <Space direction="vertical" size={8} style={{ width: "100%" }}>
      <Space wrap>
        <Text type="secondary">{t(`${k}.igv-cells`)}</Text>
        <Select
          size="small"
          mode="multiple"
          maxCount={SC_MAX_RNA_TRACKS}
          style={{ minWidth: 360 }}
          value={picked}
          onChange={setPicked}
          options={withBam.map((c) => ({ value: c.rna_id, label: `${c.rna_id}${c.cell_id ? " (DNA)" : ""} · ${c.reads}` }))}
          maxTagCount="responsive"
          showSearch
        />
        <Switch size="small" checked={withDna} onChange={setWithDna} />
        <Text>{t(`${k}.igv-dna`)}</Text>
        <HintLine inline text={t(`${k}.igv-help`)} />
      </Space>
      {view && picked.length > 0 && <CellIgvPanel view={view} embedded />}
    </Space>
  );
}

/** Genome graph, coverage and reads (DNA + RNA) of one carrier cell around both breakpoints. */
function FusionCellPlots({ fusion, focusCell }) {
  const { t } = useTranslation("common");
  const record = useMemo(() => fusionPlotRecord(fusion), [fusion]);
  const notes = useMemo(() => new Map((fusion.cells || []).filter((c) => c.cell_id).map((c) => [c.cell_id, t(`${k}.plots-cell-note`, { reads: c.reads, rna: c.rna_id })])), [fusion, t]);
  if (!record || !record.cell_ids) return <Alert type="info" showIcon message={t(`${k}.plots-no-dna`)} />;
  return (
    <Space direction="vertical" size={6} style={{ width: "100%" }}>
      <HintLine text={t(`${k}.plots-help`)} />
      <SingleCellEventTracks record={record} rnaFusion={fusion} focusCell={focusCell} cellNotes={notes} defaultPad={PLOT_PAD} />
    </Space>
  );
}

/** The matched DNA fusion event, with a button to open it. */
function DnaMatch({ fusion, onOpenDna }) {
  const { t } = useTranslation("common");
  const events = useSelector((s) => s.FilteredEvents.filteredEvents);
  const record = useMemo(() => (fusion.dna_match ? matchDnaEvent(fusion, events) : null), [fusion, events]);
  if (!fusion.dna_match) return <Text type="secondary">{t(`${k}.dna-none`)}</Text>;
  const carriers = new Set(`${record?.cell_ids || ""}`.split(",").filter(Boolean));
  const both = (fusion.cells || []).filter((c) => c.cell_id && carriers.has(c.cell_id)).length;
  return (
    <Space wrap size={6}>
      <Tag color="blue">{fusion.dna_match.event_gene}</Tag>
      {fusion.dna_match.tier != null && (
        <Tooltip title={t(`${k}.dna-tier`)}>
          <Avatar size={18} style={{ backgroundColor: tierColor(+fusion.dna_match.tier), fontSize: 10 }}>
            {fusion.dna_match.tier}
          </Avatar>
        </Tooltip>
      )}
      {record ? (
        <>
          <Text type="secondary">{t(`${k}.dna-concordance`, { both, rna: fusion.n_cells_dna, dna: carriers.size })}</Text>
          {onOpenDna && (
            <Button size="small" type="primary" ghost onClick={() => onOpenDna(record)}>
              {t(`${k}.dna-open`)}
            </Button>
          )}
        </>
      ) : (
        <Text type="secondary">{t(`${k}.dna-not-loaded`)}</Text>
      )}
    </Space>
  );
}

/** Summary tab: schematic, tier and its reasons, numbers, DNA match, clones, cohort, breakpoint variants. */
function FusionSummary({ fusion, group, nCellsRna, onPickVariant, onOpenDna }) {
  const { t } = useTranslation("common");
  const tier = fusionTier(fusion);
  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <FusionSchematic fusion={fusion} />
      <Space align="start" size={10}>
        <FusionTierTag fusion={fusion} size={28} />
        <div>
          <Text strong>{t(`${k}.tier-${tier}`)}</Text>
          <div>
            <Text type="secondary">{t(`${k}.tier-${tier}-tip`)}</Text>
          </div>
          {fusion.tier_reasons.length > 0 && (
            <Space size={[4, 4]} wrap style={{ marginTop: 4 }}>
              {fusion.tier_reasons.map((r) => (
                <Tag key={r}>{r}</Tag>
              ))}
            </Space>
          )}
        </div>
      </Space>
      <Descriptions size="small" bordered column={{ xs: 1, md: 2, xl: 3 }}>
        <Descriptions.Item label={t(`${k}.breakpoints`)}>
          {fusion.breakpoint1} · {fusion.breakpoint2}
        </Descriptions.Item>
        <Descriptions.Item label={t(`${k}.type`)}>
          <Space size={4} wrap>
            <span>{fusion.type}</span>
            {isNonProductive(fusion) && <Tag>{t(`${k}.non-productive-short`)}</Tag>}
            {isReadThrough(fusion) && <Tag>{t(`${k}.read-through`)}</Tag>}
          </Space>
        </Descriptions.Item>
        <Descriptions.Item label={t(`${k}.col-confidence`)}>
          <Space size={4}>
            {fusion.confidence}
            {fusion.known && <Tag color="purple">{t(`${k}.known`)}</Tag>}
          </Space>
        </Descriptions.Item>
        <Descriptions.Item label={t(`${k}.col-cells`)}>{t(`${k}.cells-summary`, { cells: fusion.n_cells, dna: fusion.n_cells_dna, total: nCellsRna ?? "?" })}</Descriptions.Item>
        <Descriptions.Item label={t(`${k}.col-reads`)}>{t(`${k}.reads-detail`, { split: fusion.split_reads ?? 0, disc: fusion.discordant_mates ?? 0 })}</Descriptions.Item>
        <Descriptions.Item label={t(`${k}.cancer-genes`)}>
          {fusion.cancer_genes.length ? (
            <Space size={[4, 4]} wrap>
              {fusion.cancer_genes.map((g) => (
                <Tag key={g.gene} color="volcano">
                  {g.gene} · {g.role}
                </Tag>
              ))}
              {fusion.oncokb_level && <Tag color="green">OncoKB {fusion.oncokb_level}</Tag>}
            </Space>
          ) : (
            "–"
          )}
        </Descriptions.Item>
        <Descriptions.Item label={t(`${k}.cohort`)}>
          {fusion.recurrence.length ? (
            <Tooltip title={t(`${k}.cohort-tip`)}>
              <Space size={[4, 4]} wrap>
                {fusion.recurrence.map((r) => (
                  <Tag key={r.patient}>
                    {r.patient} · {r.n_cells}
                  </Tag>
                ))}
              </Space>
            </Tooltip>
          ) : fusion.n_patients ? (
            t(`${k}.cohort-private`)
          ) : (
            "–"
          )}
        </Descriptions.Item>
      </Descriptions>
      <Space wrap size={6}>
        <Text strong>{t(`${k}.dna-title`)}</Text>
        <DnaMatch fusion={fusion} onOpenDna={onOpenDna} />
      </Space>
      <CloneDistribution fusion={group || fusion} />
      {group && (
        <div>
          <Space size={6}>
            <Text strong>{t(`${k}.variants-title`, { count: group.variants.length })}</Text>
            <HintLine inline text={t(`${k}.variants-help`)} />
          </Space>
          <Table
            size="small"
            rowKey="id"
            pagination={group.variants.length > 8 ? { pageSize: 8, size: "small" } : false}
            dataSource={group.variants}
            rowClassName={(v) => (v.id === fusion.id ? "ant-table-row-selected" : "")}
            onRow={(v) => ({ onClick: () => onPickVariant(v), style: { cursor: "pointer" } })}
            columns={[
              { title: t(`${k}.col-tier`), key: "tier", render: (_, v) => <FusionTierTag fusion={v} /> },
              { title: t(`${k}.breakpoints`), key: "bp", render: (_, v) => `${v.breakpoint1} · ${v.breakpoint2}` },
              { title: t(`${k}.sites`), key: "sites", render: (_, v) => `${v.site1} · ${v.site2}` },
              { title: t(`${k}.col-type`), dataIndex: "type" },
              { title: t(`${k}.col-frame`), dataIndex: "reading_frame" },
              { title: t(`${k}.col-cells`), dataIndex: "n_cells", align: "right" },
              { title: t(`${k}.col-reads`), dataIndex: "reads", align: "right" },
            ]}
          />
        </div>
      )}
    </Space>
  );
}

/** Cells tab: every carrier; a row with a DNA cell opens its plots. */
function FusionCells({ fusion, onPlotCell }) {
  const { t } = useTranslation("common");
  const { cells, cloneColors } = useSelector((s) => s.SingleCell);
  const cloneOf = useMemo(() => new Map(cells.map((c) => [c.cell_id, c.clone_id])), [cells]);
  return (
    <Space direction="vertical" size={6} style={{ width: "100%" }}>
      <HintLine text={t(`${k}.cells-help`)} />
      <Table
        size="small"
        rowKey="rna_id"
        pagination={fusion.cells.length > 15 ? { pageSize: 15, size: "small" } : false}
        dataSource={fusion.cells}
        onRow={(c) => (c.cell_id ? { onClick: () => onPlotCell(c.cell_id), style: { cursor: "pointer" } } : {})}
        columns={[
          { title: t(`${k}.col-rna`), dataIndex: "rna_id" },
          { title: t(`${k}.col-cell`), dataIndex: "cell_id", render: (v) => v || "–" },
          {
            title: t(`${k}.col-clone`),
            key: "clone",
            sorter: (a, b) => `${cloneOf.get(a.cell_id) ?? ""}`.localeCompare(`${cloneOf.get(b.cell_id) ?? ""}`, undefined, { numeric: true }),
            render: (_, c) => {
              const clone = c.cell_id ? cloneOf.get(c.cell_id) : null;
              return clone == null ? "–" : <ColorTag color={cloneColors[clone]}>{clone}</ColorTag>;
            },
          },
          { title: t(`${k}.col-split1`), dataIndex: "split1", align: "right", sorter: (a, b) => a.split1 - b.split1 },
          { title: t(`${k}.col-split2`), dataIndex: "split2", align: "right", sorter: (a, b) => a.split2 - b.split2 },
          { title: t(`${k}.col-discordant`), dataIndex: "discordant", align: "right", sorter: (a, b) => a.discordant - b.discordant },
          { title: t(`${k}.col-reads`), dataIndex: "reads", align: "right", defaultSortOrder: "descend", sorter: (a, b) => a.reads - b.reads },
          { title: t(`${k}.col-confidence`), dataIndex: "confidence" },
          {
            title: "",
            key: "plot",
            render: (_, c) =>
              c.cell_id ? (
                <Button
                  size="small"
                  type="link"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPlotCell(c.cell_id);
                  }}
                >
                  {t(`${k}.cells-plot`)}
                </Button>
              ) : null,
          },
        ]}
      />
    </Space>
  );
}

/**
 * Summary, per-cell plots (genome graph, coverage, DNA + RNA reads of one
 * carrier), reads and cells of one RNA fusion. A grouped row (several
 * breakpoint variants of one gene pair) starts on its best variant; the
 * summary lists the others.
 */
export function RnaFusionDetails({ fusion, nCellsRna, onOpenDna }) {
  const { t } = useTranslation("common");
  const group = fusion?.group ? fusion : null;
  const first = group ? group.variants[0] : fusion;
  const [current, setCurrent] = useState(first);
  const [tab, setTab] = useState("summary");
  const [focusCell, setFocusCell] = useState(() => defaultPlotCell(first));
  useEffect(() => {
    setCurrent(first);
    setFocusCell(defaultPlotCell(first));
  }, [first]);
  if (!current) return null;
  const plotCell = (cellId) => {
    setFocusCell(cellId);
    setTab("plots");
  };
  const pickVariant = (v) => {
    if (!v) return;
    setCurrent(v);
    setFocusCell(defaultPlotCell(v));
  };
  const nDna = (current.cells || []).filter((c) => c.cell_id).length;
  return (
    <Tabs
      activeKey={tab}
      onChange={setTab}
      destroyInactiveTabPane
      tabBarExtraContent={
        group ? (
          <Space size={4}>
            <Text type="secondary">{t(`${k}.variant`)}</Text>
            <Select
              size="small"
              style={{ minWidth: 300 }}
              value={current.id}
              onChange={(id) => pickVariant(group.variants.find((v) => v.id === id))}
              options={group.variants.map((v) => ({ value: v.id, label: `${v.breakpoint1} · ${v.breakpoint2} · ${v.n_cells}` }))}
            />
          </Space>
        ) : null
      }
      items={[
        { key: "summary", label: t(`${k}.tab-summary`), children: <FusionSummary fusion={current} group={group} nCellsRna={nCellsRna} onPickVariant={pickVariant} onOpenDna={onOpenDna} /> },
        { key: "plots", label: t(`${k}.tab-plots`, { count: nDna }), disabled: !nDna, children: <FusionCellPlots fusion={current} focusCell={focusCell} /> },
        { key: "reads", label: t(`${k}.tab-reads`), children: <RnaFusionReads fusion={current} /> },
        { key: "cells", label: t(`${k}.tab-cells`, { count: current.cells.length }), children: <FusionCells fusion={current} onPlotCell={plotCell} /> },
      ]}
    />
  );
}

/** Popup of an RNA fusion, portaled to <body> like the event popup (no ancestor can clip it). */
export default function RnaFusionModal({ fusion, nCellsRna, onClose }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  if (!fusion || typeof document === "undefined") return null;
  // the DNA event popup opens on the selected event; close this one so it is not hidden behind
  const openDna = (record) => {
    onClose();
    dispatch(filteredEventsActions.selectFilteredEvent(record, "plots"));
  };
  return createPortal(
    <Modal
      open
      className="sc-rna-fusion-modal"
      title={
        <Space>
          <span>{t(`${k}.modal-title`)}</span>
          <FusionLabel fusion={fusion} />
          <FusionTierTag fusion={fusion} />
        </Space>
      }
      width="min(1400px, 94vw)"
      footer={null}
      onCancel={onClose}
      destroyOnClose
      getContainer={false}
      zIndex={1100}
    >
      <RnaFusionDetails fusion={fusion} nCellsRna={nCellsRna} onOpenDna={openDna} />
    </Modal>,
    document.body
  );
}
