import React, { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Alert, Button, Drawer, Space, Tabs, Tag, Tooltip, Typography } from "antd";
import ExternalLinksRow from "../externalLinksRow";
import { linkGenes } from "../../../helpers/singleCell/externalLinks";
import { AimOutlined, MinusCircleOutlined, PlusCircleOutlined } from "@ant-design/icons";
import singleCellActions from "../../../redux/singleCell/actions";
import filteredEventsActions from "../../../redux/filteredEvents/actions";
import { SIGNATURE_METHOD_HINT } from "../../../helpers/singleCell/siteSignature";
import { cladeFitScore } from "../../../helpers/singleCell/cladeFit";
import { matchRnaFusions } from "../../../helpers/singleCell/rnaFusions";
import { classLabel, toggleKey } from "../../../helpers/singleCell/driverLayer";
import DriverContrastPanel from "./driverContrastPanel";
import useRnaData from "../rna/useRnaData";
import { useDriverGeneExpression, expressionLine } from "./driverGeneExpressionCard";
import TwoHitBlock from "./twoHitBlock";
import ClinicalTip from "./clinicalTip";
import MutationEvidencePanel from "../evidence/mutationEvidencePanel";
import ComplexCellZoom from "./complexCellZoom";
import FamilyBlock from "./familyBlock";
import { EcdnaStatusBlock } from "../ecdnaStatusChip";
import useEventFamilyFiles from "./useEventFamilyFiles";
import JunctionEvidenceTrack from "./junctionEvidenceTrack";
import { dmOverlap, dmOverlapText } from "../../../helpers/singleCell/complexLabels";
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
export default function DriverLayerDrawer({ entry, driverLayer, onClose, sigText = null }) {
  const dispatch = useDispatch();
  const { treeLayout, entries, selection, setSelection, siteIds, fits, tumorIds } = driverLayer;
  const rna = useRnaData();
  const familyFiles = useEventFamilyFiles();
  // ?drvtab=site|rna opens the drawer on that section (links, screenshots)
  const [tab, setTab] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get("drvtab") || "contrast";
    } catch (error) {
      return "contrast";
    }
  });
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
        siteId: entry.siteId ? siteIds?.get(entry.siteId) || null : null,
      },
    [entry, treeLayout, siteIds]
  );
  const nonCarriers = useMemo(() => {
    const own = new Set(entry?.carriers || []);
    return (tumorIds || []).filter((id) => !own.has(id));
  }, [entry, tumorIds]);
  const exprItems = useDriverGeneExpression(driver, entry?.carriers || [], nonCarriers, null, rna);
  const exprLine = rna.summary ? (rna.matrix ? expressionLine(exprItems) : "Expression: loading RNA...") : "Expression: not available (no matched RNA for this patient)";
  const f1 = entry ? fits?.get(entry.key) : undefined;
  const dmText = useMemo(() => (entry?.cls === "complex" && !entry.family ? dmOverlapText(dmOverlap(entry, entries)) : null), [entry, entries]);
  if (!entry) return null;
  const shown = driverLayer.shown.some((d) => d.key === entry.key);
  const siteId = entry.siteId ? siteIds?.get(entry.siteId) : null;
  const items = [
    { key: "contrast", label: "Carriers vs sisters", children: <DriverContrastPanel forceDriver={driver} showBoard={false} /> },
    siteId && { key: "site", label: "Site evidence & reads", children: <MutationEvidencePanel siteId={siteId} /> },
    entry.cls === "complex" && { key: "cell", label: "Carrier cell genome graph", children: <ComplexCellZoom event={entry.event} /> },
    entry.cls === "complex" && { key: "junctions", label: "Junction evidence", children: <JunctionEvidenceTrack event={entry.event} carriers={entry.carriers} tumorIds={tumorIds} treeLayout={treeLayout} identity={familyFiles.identity.status === "ok" ? familyFiles.identity.data : null} /> },
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
          {entry.clinical && <Tag color={entry.germline ? "geekblue" : "gold"} data-driver-clinical>{entry.germline ? "clinical · germline-like" : "clinical"}</Tag>}
          {entry.upstreamOnly && <Tag color="orange">upstream of gene only</Tag>}
          <Text type="secondary">{`${entry.n} carrier cells · ${entry.subclonal ? "subclonal" : "clonal"}`}</Text>
          <Tooltip title="Best F1 between the carrier cells and one clade of the patient tree (the Clade F1 filter's score)">
            <Tag color={Number.isFinite(f1) ? (f1 >= 0.8 ? "green" : f1 < 0.5 ? "red" : "default") : "default"} data-driver-f1>
              {Number.isFinite(f1) ? `clade F1 ${f1.toFixed(2)}` : "clade F1 n/a"}
            </Tag>
          </Tooltip>
        </Space>
      }
      extra={
        <Space wrap>
          <Button size="small" icon={<AimOutlined />} onClick={() => dispatch(singleCellActions.updateSelection(entry.carriers))}>
            Select carriers
          </Button>
          <Button size="small" onClick={() => dispatch(filteredEventsActions.selectFilteredEvent(entry.family?.dominant || entry.event, "plots"))}>
            Event details
          </Button>
          <Button size="small" icon={shown ? <MinusCircleOutlined /> : <PlusCircleOutlined />} onClick={() => setSelection(toggleKey(entries, selection, entry.key, fits))}>
            {shown ? "Remove from layer" : "Add to layer"}
          </Button>
        </Space>
      }
    >
      {(entry.genes?.length ? entry.genes : linkGenes(entry.label)).slice(0, 2).map((g, i, arr) => (
        <ExternalLinksRow key={g} gene={g} protein={arr.length === 1 && entry.cls === "snv" ? entry.event?.Variant : null} style={{ marginBottom: 6, display: "flex" }} />
      ))}
      {entry.clinical && <div style={{ marginBottom: 8 }}><ClinicalTip event={entry.event} /></div>}
      {exprLine.includes(":") && (
        <div style={{ marginBottom: 8 }} data-driver-expr-line>
          <Text strong>{exprLine.split(":")[0]}:</Text>
          <Text>{exprLine.slice(exprLine.indexOf(":") + 1)}</Text>
        </div>
      )}
      <FamilyBlock entry={entry} files={familyFiles} />
      <EcdnaStatusBlock entry={entry} />
      {entry.twin && (
        <div style={{ marginBottom: 8 }} data-driver-twin>
          <Text type="secondary">{`${entry.twinTip}; shown once (same carrier cells).`}</Text>
        </div>
      )}
      {dmText && (
        <div style={{ marginBottom: 8 }} data-driver-dm-overlap>
          <Tag color="purple">{dmText.chip}</Tag>
          <Text type="secondary" style={{ fontSize: 12 }}>{dmText.note}</Text>
        </div>
      )}
      <TwoHitBlock call={entry.twoHit} />
      {entry.cls === "snv" && sigText && (
        <div style={{ marginBottom: 8 }} data-driver-signature>
          <Text strong>Signature: </Text>
          <Text>{sigText(entry)}</Text>
          <div><Text type="secondary" style={{ fontSize: 11 }}>{SIGNATURE_METHOD_HINT()}</Text></div>
        </div>
      )}
      <Tabs activeKey={items.some((i) => i.key === tab) ? tab : "contrast"} onChange={setTab} items={items} destroyInactiveTabPane />
    </Drawer>
  );
}
