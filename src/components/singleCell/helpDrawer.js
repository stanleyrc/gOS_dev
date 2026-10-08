import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Drawer, Tooltip, Typography } from "antd";
import { QuestionCircleOutlined } from "@ant-design/icons";

const { Text, Paragraph, Title } = Typography;

const SECTIONS = [
  ["scores", ["clade-fit", "clade-score", "strong-events", "amplified-snv", "fga", "map-confidence", "categories"]],
  ["signatures", ["joint-fit", "assignment", "clade-vs-rest", "bootstrap"]],
  ["rna", ["tumor-only", "markers", "dosage", "composition"]],
  ["cohort", ["oncoprint", "per-mb", "convergence", "sigmat"]],
];

/** "?" button opening a drawer that defines every derived score and threshold used in the single-cell views. */
export default function HelpDrawer({ compact = false }) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Tooltip title={t("components.single-cell.help.title")}>
        <Button size="small" type={compact ? "text" : "default"} icon={<QuestionCircleOutlined />} onClick={() => setOpen(true)}>
          {compact ? null : t("components.single-cell.help.button")}
        </Button>
      </Tooltip>
      <Drawer open={open} onClose={() => setOpen(false)} width={520} title={t("components.single-cell.help.title")}>
        {SECTIONS.map(([section, keys]) => (
          <div key={section} style={{ marginBottom: 16 }}>
            <Title level={5}>{t(`components.single-cell.help.${section}`)}</Title>
            {keys.map((k) => (
              <Paragraph key={k} style={{ marginBottom: 6 }}>
                <Text strong>{t(`components.single-cell.help.${k}-name`)}</Text> — {t(`components.single-cell.help.${k}`)}
              </Paragraph>
            ))}
          </div>
        ))}
      </Drawer>
    </>
  );
}
