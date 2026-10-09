import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Alert, Descriptions, Modal, Select, Space, Switch, Table, Tag, Tooltip, Typography } from "antd";
import CellIgvPanel, { SC_MAX_RNA_TRACKS } from "../cellIgvPanel";
import HintLine from "../hintLine";
import { defaultRnaCells, fusionLoci, geneDisplay, isNonProductive } from "../../../helpers/singleCell/rnaFusions";
import { SC_MAX_TRACK_CELLS } from "../../../redux/singleCell/actions";

const { Text } = Typography;
export const RNA_IGV_DEFAULT_CELLS = 6;
const RNA_WINDOW = 150; // bp either side of each breakpoint (slices hold ±300 bp)

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

/** RNA tracks config for CellIgvPanel from a fusion's cells. */
export const rnaTracksFor = (fusion, rnaIds, patientId) => {
  const byId = new Map((fusion?.cells || []).map((c) => [c.rna_id, c]));
  return (rnaIds || []).map((id) => byId.get(id)).filter((c) => c && c.bam).map((c) => ({ rna_id: c.rna_id, bam: c.bam, patientId }));
};

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
  if (!withBam.length) return <Alert type="info" showIcon message={t("components.single-cell.rna-fusions.no-bams")} />;
  const loci = fusionLoci(fusion);
  const byId = new Map(withBam.map((c) => [c.rna_id, c]));
  const dnaIds = withDna ? picked.map((id) => byId.get(id)?.cell_id).filter(Boolean).slice(0, SC_MAX_TRACK_CELLS) : [];
  const view = loci.length
    ? { cellIds: dnaIds, rnaTracks: rnaTracksFor(fusion, picked, patientId), chromosome: loci[0].chromosome, position: loci[0].position, loci: loci.length > 1 ? loci : undefined, window: RNA_WINDOW, label: fusion.label }
    : null;
  return (
    <Space direction="vertical" size={8} style={{ width: "100%" }}>
      <Space wrap>
        <Text type="secondary">{t("components.single-cell.rna-fusions.igv-cells")}</Text>
        <Select
          size="small"
          mode="multiple"
          maxCount={SC_MAX_RNA_TRACKS}
          style={{ minWidth: 360 }}
          value={picked}
          onChange={setPicked}
          options={withBam.map((c) => ({ value: c.rna_id, label: `${c.rna_id} · ${c.reads}` }))}
          maxTagCount="responsive"
          showSearch
        />
        <Switch size="small" checked={withDna} onChange={setWithDna} />
        <Text>{t("components.single-cell.rna-fusions.igv-dna")}</Text>
        <HintLine inline text={t("components.single-cell.rna-fusions.igv-help")} />
      </Space>
      {view && picked.length > 0 && <CellIgvPanel view={view} embedded />}
    </Space>
  );
}

/** Summary, cells and reads of one RNA fusion. */
export function RnaFusionDetails({ fusion, nCellsRna }) {
  const { t } = useTranslation("common");
  const { cells, cloneColors } = useSelector((s) => s.SingleCell);
  const cloneOf = useMemo(() => new Map(cells.map((c) => [c.cell_id, c.clone_id])), [cells]);
  const k = "components.single-cell.rna-fusions";
  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Descriptions size="small" bordered column={{ xs: 1, md: 2, xl: 3 }}>
        <Descriptions.Item label={t(`${k}.breakpoints`)}>
          {fusion.breakpoint1} · {fusion.breakpoint2}
        </Descriptions.Item>
        <Descriptions.Item label={t(`${k}.strands`)}>
          {fusion.strand1} · {fusion.strand2}
        </Descriptions.Item>
        <Descriptions.Item label={t(`${k}.sites`)}>
          {fusion.site1} · {fusion.site2}
        </Descriptions.Item>
        <Descriptions.Item label={t(`${k}.type`)}>
          <Space size={4} wrap>
            <span>{fusion.type}</span>
            {isNonProductive(fusion) && <Tag>{t(`${k}.non-productive`)}</Tag>}
          </Space>
        </Descriptions.Item>
        <Descriptions.Item label={t(`${k}.frame`)}>{fusion.reading_frame}</Descriptions.Item>
        <Descriptions.Item label={t(`${k}.col-confidence`)}>
          <Space size={4}>
            {fusion.confidence}
            {fusion.known && <Tag color="purple">{t(`${k}.known`)}</Tag>}
          </Space>
        </Descriptions.Item>
        <Descriptions.Item label={t(`${k}.col-cells`)}>{t(`${k}.cells-summary`, { cells: fusion.n_cells, dna: fusion.n_cells_dna, total: nCellsRna ?? "?" })}</Descriptions.Item>
        <Descriptions.Item label={t(`${k}.col-reads`)}>{t(`${k}.reads-detail`, { split: fusion.split_reads ?? 0, disc: fusion.discordant_mates ?? 0 })}</Descriptions.Item>
        {fusion.dna_match && (
          <Descriptions.Item label={t(`${k}.col-dna`)}>
            {fusion.dna_match.event_gene}
            {fusion.dna_match.distance != null ? ` (${fusion.dna_match.distance} bp)` : ""}
          </Descriptions.Item>
        )}
      </Descriptions>
      <Table
        size="small"
        rowKey="rna_id"
        pagination={fusion.cells.length > 10 ? { pageSize: 10, size: "small" } : false}
        dataSource={fusion.cells}
        columns={[
          { title: t(`${k}.col-rna`), dataIndex: "rna_id" },
          { title: t(`${k}.col-cell`), dataIndex: "cell_id", render: (v) => v || "–" },
          {
            title: t(`${k}.col-clone`),
            key: "clone",
            render: (_, c) => {
              const clone = c.cell_id ? cloneOf.get(c.cell_id) : null;
              return clone == null ? "–" : (
                <span>
                  <span className="sc-swatch" style={{ background: cloneColors[clone] }} />
                  {clone}
                </span>
              );
            },
          },
          { title: t(`${k}.col-split1`), dataIndex: "split1", align: "right", sorter: (a, b) => a.split1 - b.split1 },
          { title: t(`${k}.col-split2`), dataIndex: "split2", align: "right", sorter: (a, b) => a.split2 - b.split2 },
          { title: t(`${k}.col-discordant`), dataIndex: "discordant", align: "right", sorter: (a, b) => a.discordant - b.discordant },
          { title: t(`${k}.col-reads`), dataIndex: "reads", align: "right", defaultSortOrder: "descend", sorter: (a, b) => a.reads - b.reads },
          { title: t(`${k}.col-confidence`), dataIndex: "confidence" },
        ]}
      />
      <div>
        <Text strong>{t(`${k}.igv-title`)}</Text>
        <RnaFusionReads fusion={fusion} />
      </div>
    </Space>
  );
}

/** Popup of an RNA fusion, portaled to <body> like the event popup (no ancestor can clip it). */
export default function RnaFusionModal({ fusion, nCellsRna, onClose }) {
  const { t } = useTranslation("common");
  if (!fusion || typeof document === "undefined") return null;
  return createPortal(
    <Modal
      open
      className="sc-rna-fusion-modal"
      title={
        <Space>
          <span>{t("components.single-cell.rna-fusions.modal-title")}</span>
          <FusionLabel fusion={fusion} />
        </Space>
      }
      width="min(1400px, 94vw)"
      footer={null}
      onCancel={onClose}
      destroyOnClose
      getContainer={false}
      zIndex={1100}
    >
      <RnaFusionDetails fusion={fusion} nCellsRna={nCellsRna} />
    </Modal>,
    document.body
  );
}
