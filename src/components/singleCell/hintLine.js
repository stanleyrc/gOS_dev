import React from "react";
import { Tooltip, Typography } from "antd";
import { InfoCircleOutlined } from "@ant-design/icons";

const { Text } = Typography;

/**
 * Explanatory text collapsed to one muted line: an info icon plus the start
 * of the text, cut with an ellipsis; hover shows all of it. Replaces the
 * multi-line help paragraphs under plots so they cost ~18 px, not 40-60.
 * `inline` renders only the icon (for card titles / control rows).
 */
export default function HintLine({ text, inline = false, style }) {
  if (!text) return null;
  const tip = <div style={{ maxWidth: 520, whiteSpace: "normal" }}>{text}</div>;
  if (inline) {
    return (
      <Tooltip title={tip} overlayStyle={{ maxWidth: 560 }}>
        <InfoCircleOutlined className="sc-hint-icon" />
      </Tooltip>
    );
  }
  return (
    <Tooltip title={tip} overlayStyle={{ maxWidth: 560 }} mouseEnterDelay={0.2}>
      <div className="sc-hint-line" style={style}>
        <InfoCircleOutlined className="sc-hint-icon" />
        <Text type="secondary">{text}</Text>
      </div>
    </Tooltip>
  );
}
