import React from "react";
import { useTranslation } from "react-i18next";
import { Button, Popover, Space, Typography } from "antd";
import { SettingOutlined } from "@ant-design/icons";

const { Text } = Typography;

/**
 * Secondary display settings of an ecDNA panel (scales, sizes, colouring) behind
 * one "Display" button, so the card header keeps only the main view switches.
 * rows: [{ label, control }] — each control is rendered as is.
 */
export default function DisplayMenu({ rows }) {
  const { t } = useTranslation("common");
  const content = (
    <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "8px 12px", alignItems: "center", maxWidth: 420 }}>
      {rows.filter(Boolean).map((r) => (
        <React.Fragment key={r.label}>
          <Text type="secondary">{r.label}</Text>
          <Space size={4}>{r.control}</Space>
        </React.Fragment>
      ))}
    </div>
  );
  return (
    <Popover trigger="click" placement="bottomRight" content={content} title={t("components.single-cell.ecdna.display")}>
      <Button size="small" icon={<SettingOutlined />}>{t("components.single-cell.ecdna.display")}</Button>
    </Popover>
  );
}
