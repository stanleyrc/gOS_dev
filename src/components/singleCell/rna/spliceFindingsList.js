import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Space, Tag, Tooltip, Typography } from "antd";
import { BranchesOutlined } from "@ant-design/icons";
import HintLine from "../hintLine";
import CellIgvPanel from "../cellIgvPanel";
import { KIND_COLOR, SEVERITY_COLOR, findingIgvView, findingSliceCount, isNotable } from "../../../helpers/singleCell/rnaHeadlineFindings";
import { TYPE } from "../../../helpers/singleCell/plotTheme";

const { Text, Link } = Typography;
const k = "components.single-cell.splicing";

/** Severity and kind tags of a splicing finding. */
export function SpliceFindingTags({ finding, showPatient = false }) {
  const { t } = useTranslation("common");
  return (
    <>
      <Tag color={SEVERITY_COLOR[finding.severity]} style={{ fontSize: TYPE.tick, marginInlineEnd: 4 }}>
        {t(`${k}.severity-${finding.severity}`)}
      </Tag>
      <Tag color={KIND_COLOR[finding.kind]} bordered={false} style={{ fontSize: TYPE.tick, marginInlineEnd: 4 }}>
        {t(`components.single-cell.rna-findings.kind-${finding.kind}`)}
      </Tag>
      {showPatient && finding.patient && (
        <Tag bordered={false} style={{ fontSize: TYPE.tick, marginInlineEnd: 4 }}>
          {finding.patient}
        </Tag>
      )}
    </>
  );
}

/**
 * Ranked splicing findings as one-line sentences (back end `findings`):
 * high / moderate first, low and likely artefacts behind a toggle. Clicking
 * a sentence calls onPick(finding); "IGV" opens the reads of its cells.
 * spliceReads: rna_id -> slice path (patient file), or a function finding ->
 * that map (cohort, one patient per finding).
 */
export default function SpliceFindingsList({ findings = [], onPick, spliceReads = {}, patientId = null, showPatient = false, title = null, maxNotable = Infinity }) {
  const { t } = useTranslation("common");
  const [showLow, setShowLow] = useState(false);
  const [igvId, setIgvId] = useState(null);
  const readsOf = (f) => (typeof spliceReads === "function" ? spliceReads(f) : spliceReads) || {};
  // shown first: high / moderate findings (at most maxNotable); the rest behind the toggle
  const notable = useMemo(() => findings.filter(isNotable).slice(0, maxNotable), [findings, maxNotable]);
  const rest = useMemo(() => findings.filter((f) => !notable.includes(f)), [findings, notable]);
  const shown = showLow ? [...notable, ...rest] : notable;
  const igvFinding = findings.find((f) => f.id === igvId);
  const igvView = igvFinding ? findingIgvView(igvFinding, readsOf(igvFinding), patientId) : null;
  return (
    <Space direction="vertical" size={2} style={{ width: "100%" }}>
      <Space size={4}>
        <BranchesOutlined />
        <Text strong>{title || t(`${k}.findings-title`)}</Text>
        <HintLine inline text={t(`${k}.findings-help`)} />
      </Space>
      {!findings.length && <Text type="secondary">{t(`${k}.findings-none`)}</Text>}
      {shown.map((f) => {
        const nSlices = findingSliceCount(f, readsOf(f));
        return (
          <div key={f.id} style={{ fontSize: TYPE.label, lineHeight: 1.6, opacity: isNotable(f) ? 1 : 0.75 }} data-finding={f.id}>
            <SpliceFindingTags finding={f} showPatient={showPatient} />
            {onPick ? (
              <Link onClick={() => onPick(f)} style={{ fontSize: TYPE.label }}>
                {f.text}
              </Link>
            ) : (
              <Text>{f.text}</Text>
            )}
            {f.flags.length > 0 && <Text type="secondary" style={{ fontSize: TYPE.tick }}>{` [${f.flags.join("; ")}]`}</Text>}
            <Text type="secondary" style={{ fontSize: TYPE.tick }}>{` · ${t(`${k}.col-notability`).toLowerCase()} ${f.score.toFixed(1)}`}</Text>
            {" · "}
            {nSlices > 0 ? (
              <Link style={{ fontSize: TYPE.tick }} onClick={() => setIgvId((id) => (id === f.id ? null : f.id))} strong={igvId === f.id}>
                {t(`${k}.findings-igv`)}
              </Link>
            ) : (
              <Tooltip title={t(`${k}.findings-igv-none`)}>
                <Text type="secondary" style={{ fontSize: TYPE.tick }} delete>
                  {t(`${k}.findings-igv`)}
                </Text>
              </Tooltip>
            )}
          </div>
        );
      })}
      {rest.length > 0 && (
        <Link style={{ fontSize: TYPE.tick }} onClick={() => setShowLow((v) => !v)}>
          {showLow ? t(`${k}.findings-hide-low`) : t(`${k}.findings-show-more`, { count: rest.length })}
        </Link>
      )}
      {igvView && <CellIgvPanel view={igvView} embedded />}
    </Space>
  );
}
