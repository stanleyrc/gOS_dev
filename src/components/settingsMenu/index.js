import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Button, Divider, Popover, Segmented, Select, Space, Tooltip, Typography } from "antd";
import { BulbFilled, BulbOutlined, SettingOutlined } from "@ant-design/icons";
import { getAppTheme, onAppThemeChange, setAppTheme } from "../../helpers/appTheme";
import { THEMES } from "../../helpers/singleCell/themes";
import { CN_PALETTE_PRESETS } from "../../helpers/singleCell/matrix";
import singleCellActions from "../../redux/singleCell/actions";

const { Text } = Typography;

/**
 * Appearance settings in the top bar: light / dark, categorical colour
 * theme (clones, groups, UMAP fields, violins, signatures) and the
 * copy-number heatmap palette. All persist in this browser.
 */
export default function SettingsMenu() {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const [mode, setMode] = useState(getAppTheme());
  useEffect(() => onAppThemeChange(setMode), []);
  const layout = useSelector((state) => state.SingleCell.layout);
  const palette = useSelector((state) => state.SingleCell.palette);
  const theme = layout.theme || "tableau";
  const swatches = (colors) => (
    <span style={{ display: "inline-flex", gap: 1, marginRight: 6 }}>
      {colors.slice(0, 8).map((c, i) => (
        <span key={`${c}-${i}`} style={{ width: 9, height: 12, background: c, display: "inline-block", borderRadius: 1 }} />
      ))}
    </span>
  );
  const content = (
    <Space direction="vertical" size={10} style={{ width: 320 }}>
      <div>
        <Text strong>{t("settings.appearance")}</Text>
        <div style={{ marginTop: 4 }}>
          <Segmented
            value={mode}
            onChange={(v) => setAppTheme(v)}
            options={[
              { value: "light", label: <Space size={4}><BulbOutlined />{t("settings.light")}</Space> },
              { value: "dark", label: <Space size={4}><BulbFilled />{t("settings.dark")}</Space> },
            ]}
          />
        </div>
      </div>
      <Divider style={{ margin: "4px 0" }} />
      <div>
        <Text strong>{t("components.single-cell.palette.theme")}</Text>
        <Select
          style={{ width: "100%", marginTop: 4 }}
          value={theme}
          onChange={(value) => dispatch(singleCellActions.updateLayout({ theme: value }))}
          options={Object.entries(THEMES).map(([value, th]) => ({ value, label: <span>{swatches(th.colors)}{th.label}</span> }))}
        />
        <Text type="secondary" style={{ fontSize: 12 }}>{t("components.single-cell.palette.theme-help")}</Text>
      </div>
      <div>
        <Text strong>{t("settings.heatmap-palette")}</Text>
        <Select
          style={{ width: "100%", marginTop: 4 }}
          value={palette.preset}
          onChange={(preset) => dispatch(singleCellActions.updatePalette({ preset, ...CN_PALETTE_PRESETS[preset] }))}
          options={Object.keys(CN_PALETTE_PRESETS).map((value) => ({ value, label: <span>{swatches(CN_PALETTE_PRESETS[value].total)}{t(`components.single-cell.palette.presets.${value}`)}</span> }))}
        />
        <Text type="secondary" style={{ fontSize: 12 }}>{t("settings.heatmap-palette-help")}</Text>
      </div>
    </Space>
  );
  return (
    <Popover trigger="click" placement="bottomRight" title={t("settings.title")} content={content}>
      <Tooltip title={t("settings.title")}>
        <Button type="text" shape="circle" icon={<SettingOutlined />} style={{ marginRight: 4 }} />
      </Tooltip>
    </Popover>
  );
}
