import React from "react";
import { Space, Tag, Tooltip, Typography } from "antd";
import { KIND_LABEL } from "../../../helpers/singleCell/driverSummary";

const { Text, Link } = Typography;

export const KIND_COLOR = { amp: "red", homdel: "blue", fusion: "purple", trunc: "default", splice: "gold", missense: "green", promoter: "cyan", other: "default" };
export const LEVEL_COLOR = { strong: "green", moderate: "gold", weak: "default" };

/** Evidence level tag with the reasons and cautions in its tooltip. */
export function EvidenceTag({ evidence }) {
  if (!evidence) return null;
  return (
    <Tooltip
      title={
        <div>
          {evidence.reasons.map((r) => (
            <div key={r}>{`+ ${r}`}</div>
          ))}
          {evidence.cautions.map((r) => (
            <div key={r}>{`− ${r}`}</div>
          ))}
        </div>
      }
    >
      <Tag color={LEVEL_COLOR[evidence.level]} style={{ cursor: "help" }}>{`Evidence: ${evidence.level}`}</Tag>
    </Tooltip>
  );
}

/**
 * One driver in one line, for reports and vignettes: label, alteration
 * type, evidence level and the plain-language sentence (driverOneLiner).
 * `summary` comes from useDriverSummaries (components/singleCell/drivers);
 * onOpen(summary), when given, makes the label a link (e.g. to the Drivers tab).
 */
export default function DriverOneLine({ summary, onOpen = null, showText = true }) {
  if (!summary) return null;
  return (
    <Space size={6} wrap style={{ lineHeight: 1.6 }}>
      {onOpen ? (
        <Link strong onClick={() => onOpen(summary)}>
          {summary.label}
        </Link>
      ) : (
        <Text strong>{summary.label}</Text>
      )}
      <Tag color={KIND_COLOR[summary.kind]} style={{ marginInlineEnd: 0 }}>
        {KIND_LABEL[summary.kind]}
      </Tag>
      <EvidenceTag evidence={summary.evidence} />
      {showText && <Text type="secondary">{summary.oneLiner.replace(/^[^(]*\([^)]*\) /, "")}</Text>}
    </Space>
  );
}
