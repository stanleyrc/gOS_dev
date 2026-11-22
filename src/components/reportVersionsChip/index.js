import React from "react";
import { Popover, Tag, Typography } from "antd";

const { Text } = Typography;
const nameOf = (r) => r?.caseReportId || r?.pair;
const datasetsOf = (r) => [r?.sourceDatasetTitle].flat().filter(Boolean).join(", ");

/**
 * "+N versions" chip of a canonical report when "One per patient" folds
 * versioned copies; clicking it lists the other versions, each opens its report.
 */
export default function ReportVersionsChip({ record, onOpen }) {
  const versions = record?._versions || [];
  if (!versions.length) return null;
  const content = (
    <div style={{ maxWidth: 420, maxHeight: 360, overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
      <Text type="secondary" style={{ fontSize: 12 }}>
        Shown: <Text strong>{nameOf(record)}</Text> (canonical). Other versions of the same patient data:
      </Text>
      <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
        {versions.map((v) => (
          <li key={`${v.datasetId}|${nameOf(v)}`}>
            <a
              href="#open"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onOpen && onOpen(e, v);
              }}
            >
              {nameOf(v)}
            </a>
            {datasetsOf(v) && <Text type="secondary" style={{ fontSize: 12 }}>{` (${datasetsOf(v)})`}</Text>}
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <span onClick={(e) => e.stopPropagation()}>
      <Popover trigger="click" title={`${versions.length} more version${versions.length === 1 ? "" : "s"}`} content={content} placement="bottomLeft">
        <Tag className="report-versions-chip" color="processing" style={{ cursor: "pointer" }} data-testid="report-versions-chip">
          +{versions.length} version{versions.length === 1 ? "" : "s"}
        </Tag>
      </Popover>
    </span>
  );
}
