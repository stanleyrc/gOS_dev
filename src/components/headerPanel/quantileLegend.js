import React from "react";
import { Space, Tag, Typography } from "antd";
import { legendColors } from "../../helpers/utility";
import { QUANTILE_LABELS } from "../../helpers/singleCell/patientSummary";

const { Text } = Typography;

/** The lower 25% / mid 50% / top 25% colour key; `what` names the binned quantity (shown before the tags). */
export default function QuantileLegend({ what }) {
  return (
    <Space size={[0, 4]} wrap className="quantile-legend" data-testid="quantile-legend">
      {what ? <Text type="secondary" style={{ marginRight: 6, fontSize: 12 }}>{`${what}:`}</Text> : null}
      {QUANTILE_LABELS.map((label, i) => (
        <Tag key={label} color={legendColors()[i]}>{label}</Tag>
      ))}
    </Space>
  );
}
