import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Alert, Button, Select, Space, Switch, Table, Tag, Typography } from "antd";
import RnaFusionModal, { FusionLabel, RNA_IGV_DEFAULT_CELLS, rnaTracksFor } from "./rnaFusionModal";
import { SC_MAX_RNA_TRACKS } from "../cellIgvPanel";
import { defaultRnaCells, fusionLoci, isDnaFusionEvent, matchRnaFusions } from "../../../helpers/singleCell/rnaFusions";

const { Text } = Typography;
const k = "components.single-cell.rna-fusions";

/**
 * RNA evidence for a DNA fusion event: the patient's RNA fusions with the
 * same gene pair (either order, or the back end's dna_match), the RNA cells
 * chosen for IGV and their tracks (per-cell RNA slices) to show next to the
 * DNA reads. `preferCells`: DNA cells already shown, whose RNA comes first.
 */
export function useRnaSupport(record, preferCells = []) {
  const source = useSelector((s) => s.SingleCell.rnaFusions);
  const patientId = useSelector((s) => s.SingleCell.patient?.caseReportId);
  const fusion = isDnaFusionEvent(record) ? record : null;
  const matches = useMemo(() => (fusion && source?.status === "ok" ? matchRnaFusions(fusion, source.data.fusions) : []), [fusion, source]);
  const [index, setIndex] = useState(0);
  const best = matches[Math.min(index, Math.max(0, matches.length - 1))] || null;
  const [picked, setPicked] = useState([]);
  const [enabled, setEnabled] = useState(true);
  const preferKey = (preferCells || []).join("|");
  useEffect(() => {
    setPicked(best ? defaultRnaCells(best, RNA_IGV_DEFAULT_CELLS, preferCells) : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [best, preferKey]);
  useEffect(() => setIndex(0), [record]);
  const rnaTracks = enabled && best ? rnaTracksFor(best, picked, patientId) : [];
  return {
    applies: Boolean(fusion),
    status: source?.status,
    fusion: best,
    matches,
    index,
    setIndex,
    picked,
    setPicked,
    enabled,
    setEnabled,
    rnaTracks,
    rnaLoci: rnaTracks.length ? fusionLoci(best) : [],
    nCellsRna: source?.data?.nCellsRna,
  };
}

/** "RNA support" block of the event popup (renders nothing for non-fusion events). */
export function RnaSupportSection({ record, support }) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(null);
  const carriers = useMemo(() => new Set(`${record?.cell_ids || ""}`.split(",").filter(Boolean)), [record]);
  if (!support.applies) return null;
  if (support.status !== "ok") return <Text type="secondary">{t(`${k}.support-title`)} · {t(`${k}.support-no-file`)}</Text>;
  const f = support.fusion;
  if (!f) return <Text type="secondary">{t(`${k}.support-title`)} · {t(`${k}.support-none`)}</Text>;
  const withDna = f.cells.filter((c) => c.cell_id);
  const nCarriers = withDna.filter((c) => carriers.has(c.cell_id)).length;
  const withBam = f.cells.filter((c) => c.bam);
  return (
    <div className="sc-rna-support" style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 6, padding: 8 }}>
      <Space direction="vertical" size={6} style={{ width: "100%" }}>
        <Space wrap>
          <Text strong>{t(`${k}.support-title`)}</Text>
          {support.matches.length > 1 ? (
            <Select
              size="small"
              style={{ minWidth: 260 }}
              value={support.index}
              onChange={support.setIndex}
              options={support.matches.map((m, i) => ({ value: i, label: `${m.label} · ${m.breakpoint1} · ${m.n_cells}` }))}
            />
          ) : (
            <FusionLabel fusion={f} />
          )}
          <Text type="secondary">{t(`${k}.support-summary`, { label: f.label, cells: f.n_cells, reads: f.reads, dna: withDna.length, carriers: nCarriers })}</Text>
          <Button size="small" type="link" onClick={() => setOpen(f)}>
            {t(`${k}.support-open`)}
          </Button>
        </Space>
        <Table
          size="small"
          rowKey="rna_id"
          pagination={f.cells.length > 6 ? { pageSize: 6, size: "small" } : false}
          dataSource={f.cells}
          columns={[
            { title: t(`${k}.col-rna`), dataIndex: "rna_id" },
            { title: t(`${k}.col-cell`), dataIndex: "cell_id", render: (v) => (v ? <Space size={4}>{v}{carriers.has(v) && <Tag color="blue">{t(`${k}.support-carrier`)}</Tag>}</Space> : "–") },
            { title: t(`${k}.col-reads`), dataIndex: "reads", align: "right" },
            { title: t(`${k}.col-confidence`), dataIndex: "confidence" },
          ]}
        />
        {withBam.length ? (
          <Space wrap>
            <Switch size="small" checked={support.enabled} onChange={support.setEnabled} />
            <Text>{t(`${k}.support-tracks`)}</Text>
            {support.enabled && (
              <Select
                size="small"
                mode="multiple"
                maxCount={SC_MAX_RNA_TRACKS}
                style={{ minWidth: 320 }}
                value={support.picked}
                onChange={support.setPicked}
                options={withBam.map((c) => ({ value: c.rna_id, label: `${c.rna_id} · ${c.reads}` }))}
                maxTagCount="responsive"
              />
            )}
          </Space>
        ) : (
          <Alert type="info" showIcon message={t(`${k}.no-bams`)} />
        )}
      </Space>
      <RnaFusionModal fusion={open} nCellsRna={support.nCellsRna} onClose={() => setOpen(null)} />
    </div>
  );
}
