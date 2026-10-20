import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Button, Divider, Popconfirm, Popover, Segmented, Select, Space, Tooltip, Typography } from "antd";
import { BulbFilled, BulbOutlined, ClearOutlined, ThunderboltFilled, SettingOutlined } from "@ant-design/icons";
import { getAppTheme, onAppThemeChange, setAppTheme } from "../../helpers/appTheme";
import { THEMES } from "../../helpers/singleCell/themes";
import { CN_PALETTE_PRESETS } from "../../helpers/singleCell/matrix";
import singleCellActions from "../../redux/singleCell/actions";
import useCellLabels from "../singleCell/useCellLabels";
import RememberViewSwitch from "./rememberViewSwitch";
import { clearSiteSettings } from "../../helpers/clearSiteSettings";

const { Text } = Typography;

/**
 * Appearance settings in the top bar: light / dark, categorical colour
 * theme (clones, groups, UMAP fields, violins, signatures) and the
 * copy-number heatmap palette. Display choices persist only if "Remember my view settings" is on.
 */
export default function SettingsMenu() {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const cellLabels = useCellLabels();
  const [mode, setMode] = useState(getAppTheme());
  useEffect(() => onAppThemeChange(setMode), []);
  const layout = useSelector((state) => state.SingleCell.layout);
  const palette = useSelector((state) => state.SingleCell.palette);
  const theme = layout.theme || "tableau";
  const swatches = (colors) => (
    <span style={{ display: "inline-flex", gap: 1, marginRight: 6 }}>
      {(colors.length > 16 ? [0, 2, 4, 6, 12, 20, 50, 100].map((k) => colors[Math.min(k, colors.length - 1)]) : colors.slice(0, 8)).map((c, i) => (
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
              { value: "cyberpunk", label: <Space size={4}><ThunderboltFilled />{t("settings.cyberpunk")}</Space> },
            ]}
          />
        </div>
      </div>
      <Divider style={{ margin: "4px 0" }} />
      <div>
        <Text strong>Cell labels</Text>
        <div style={{ marginTop: 4 }}>
          <Segmented
            value={cellLabels.mode}
            onChange={(v) => cellLabels.setMode(v)}
            options={[
              { value: "well", label: "Well name" },
              { value: "id", label: "Pair id" },
            ]}
          />
        </div>
        <Text type="secondary" style={{ fontSize: 12 }}>Single cells are shown by well name (e.g. BWH75_MR_3_pl3_10a) or by their numeric pair id (BWH75_432). URLs, files and joins always use the pair id.</Text>
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
      <Divider style={{ margin: "4px 0" }} />
      <RememberViewSwitch />
      <Divider style={{ margin: "4px 0" }} />
      <div>
        <Popconfirm
          placement="left"
          title={t("settings.clear-title")}
          description={<div style={{ maxWidth: 280 }}>{t("settings.clear-confirm")}</div>}
          okText={t("settings.clear-ok")}
          cancelText={t("settings.clear-cancel")}
          onConfirm={() => clearSiteSettings()}
        >
          <Button icon={<ClearOutlined />} block>{t("settings.clear")}</Button>
        </Popconfirm>
        <Text type="secondary" style={{ fontSize: 12 }}>{t("settings.clear-help")}</Text>
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
