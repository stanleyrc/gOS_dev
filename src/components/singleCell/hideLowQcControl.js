import React from "react";
import { Checkbox, Tag, Tooltip, Typography } from "antd";
import useCovQc from "./useCovQc";

const { Text } = Typography;

/**
 * Single-Cell toolbar toggle: hide the cells failing the coverage QC thresholds (edited in the QC tab) from
 * the heatmap, tree, tissue map, Compare Trees and every other view. Renders nothing for patients whose cells
 * carry no coverage QC metrics.
 */
export default function HideLowQcControl() {
  const { hide, setHide, available, failed, total } = useCovQc();
  if (!available) return null;
  return (
    <span className="sc-hide-low-qc" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <Tooltip title="Hide cells with noisy or dropped-out coverage (thresholds in the QC tab) from every view; the tree is pruned to the remaining cells">
        <Checkbox checked={hide} onChange={(e) => setHide(e.target.checked)}>
          Hide low-QC cells
        </Checkbox>
      </Tooltip>
      {hide ? (
        <Tag color={failed ? "orange" : "default"} style={{ marginInlineEnd: 0 }}>
          {failed} of {total} hidden
        </Tag>
      ) : (
        <Text type="secondary">{failed} would be hidden</Text>
      )}
    </span>
  );
}
