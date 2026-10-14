import React, { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Alert, Button, Drawer, Space, Tabs, Tag, Tooltip, Typography } from "antd";
import { AimOutlined, MinusCircleOutlined, PlusCircleOutlined } from "@ant-design/icons";
import singleCellActions from "../../../redux/singleCell/actions";
import filteredEventsActions from "../../../redux/filteredEvents/actions";
import { cladeFitScore } from "../../../helpers/singleCell/cladeFit";
import { matchRnaFusions } from "../../../helpers/singleCell/rnaFusions";
import { classLabel, toggleKey } from "../../../helpers/singleCell/driverLayer";
import DriverContrastPanel from "./driverContrastPanel";
import MutationEvidencePanel from "../evidence/mutationEvidencePanel";
import RnaFusionModal, { FusionLabel, FusionTierTag } from "../rna/rnaFusionModal";

const { Text } = Typography;

/** RNA fusion calls that join the gene pair of a DNA fusion event: the same popup as the RNA tab opens. */
function FusionRnaTab({ entry }) {
  const source = useSelector((s) => s.SingleCell.rnaFusions);
  const [open, setOpen] = useState(null);
  const matches = useMemo(() => (source?.status === "ok" ? matchRnaFusions(entry.event, source.data.fusions) : []), [source, entry]);
  if (source?.status !== "ok") return <Alert type="info" showIcon message="No RNA fusion calls were exported for this patient (rna/fusions.json)." />;
  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      {matches.length ? (
        matches.map((f) => (
          <Alert
            key={f.id}
            type="success"
            showIcon
            message={
              <Space wrap>
                <FusionTierTag fusion={f} />
                <FusionLabel fusion={f} />
                <Text type="secondary">{`${f.n_cells} RNA cells · ${f.reads ?? (f.split_reads || 0) + (f.discordant_mates || 0)} reads`}</Text>
              </Space>
            }
            action={
              <Button size="small" onClick={() => setOpen(f)}>
                Open RNA fusion
              </Button>
            }
          />
        ))
      ) : (
        <Alert type="info" showIcon message="No RNA fusion call (Arriba / STAR chimeric) joins these two genes in this patient." />
      )}
      {open && <RnaFusionModal fusion={open} nCellsRna={source.data.nCellsRna} onClose={() => setOpen(null)} />}
    </Space>
  );
}

/**
 * Drawer of the Drivers layer. It reuses the retired Drivers tab's cards
 * (carriers vs matched non-carriers: copy number, expression, phenotype,
 * evidence), the Evidence tab's mutation site evidence and reads (SNVs) and
 * the RNA tab's fusion popup (fusions).
 */
export default function DriverLayerDrawer({ entry, driverLayer, onClose }) {
  const dispatch = useDispatch();
  const { treeLayout, entries, selection, setSelection, siteIds } = driverLayer;
  const [tab, setTab] = useState("contrast");
  const driver = useMemo(
    () =>
      entry && {
        key: entry.key,
        label: entry.label,
        event: entry.event,
        carriers: entry.carriers,
        fraction: entry.fraction,
        tier: entry.tier ?? 9,
        fit: treeLayout ? cladeFitScore(entry.carriers, treeLayout) : null,
      },
    [entry, treeLayout]
  );
  if (!entry) return null;
  const shown = driverLayer.shown.some((d) => d.key === entry.key);
  const siteId = entry.siteId ? siteIds?.get(entry.siteId) : null;
  const items = [
    { key: "contrast", label: "Carriers vs sisters", children: <DriverContrastPanel forceDriver={driver} showBoard={false} /> },
    siteId && { key: "site", label: "Site evidence & reads", children: <MutationEvidencePanel siteId={siteId} /> },
    entry.cls === "fusion" && { key: "rna", label: "RNA fusion reads", children: <FusionRnaTab entry={entry} /> },
  ].filter(Boolean);
  return (
    <Drawer
      open
      width={Math.min(1200, window.innerWidth - 40)}
      onClose={onClose}
      destroyOnClose
      title={
        <Space wrap>
          <Text strong style={{ fontSize: 16 }}>{entry.label}</Text>
          <Tooltip title={classLabel(entry)}>
            <Tag>{classLabel(entry)}</Tag>
          </Tooltip>
          {entry.tier != null && <Tag>{`tier ${entry.tier}`}</Tag>}
          {entry.upstreamOnly && <Tag color="orange">upstream of gene only</Tag>}
          <Text type="secondary">{`${entry.n} carrier cells · ${entry.subclonal ? "subclonal" : "clonal"}`}</Text>
        </Space>
      }
      extra={
        <Space wrap>
          <Button size="small" icon={<AimOutlined />} onClick={() => dispatch(singleCellActions.updateSelection(entry.carriers))}>
            Select carriers
          </Button>
          <Button size="small" onClick={() => dispatch(filteredEventsActions.selectFilteredEvent(entry.event, "plots"))}>
            Event details
          </Button>
          <Button size="small" icon={shown ? <MinusCircleOutlined /> : <PlusCircleOutlined />} onClick={() => setSelection(toggleKey(entries, selection, entry.key))}>
            {shown ? "Remove from layer" : "Add to layer"}
          </Button>
        </Space>
      }
    >
      <Tabs activeKey={items.some((i) => i.key === tab) ? tab : "contrast"} onChange={setTab} items={items} destroyInactiveTabPane />
    </Drawer>
  );
}
