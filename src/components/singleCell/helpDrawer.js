import React from "react";
import { useTranslation } from "react-i18next";
import { Button, Tooltip } from "antd";
import { QuestionCircleOutlined } from "@ant-design/icons";
import { openHelpCenter } from "../../helpers/singleCell/helpNav";

/**
 * "?" button opening the Help Center (components/singleCell/help/helpCenter.js,
 * mounted once in the top bar): searchable definitions of every derived score,
 * where each analysis lives and how it is computed.
 */
export default function HelpDrawer({ compact = false, query, kind }) {
  const { t } = useTranslation("common");
  return (
    <Tooltip title={t("components.single-cell.help.title")}>
      <Button size="small" type={compact ? "text" : "default"} icon={<QuestionCircleOutlined />} onClick={() => openHelpCenter({ query, kind })}>
        {compact ? null : t("components.single-cell.help.button")}
      </Button>
    </Tooltip>
  );
}
