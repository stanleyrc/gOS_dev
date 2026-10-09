import React from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Button, ColorPicker, Popover, Select, Space, Tooltip, Typography } from "antd";
import { BgColorsOutlined } from "@ant-design/icons";
import singleCellActions from "../../redux/singleCell/actions";
import { CN_PALETTE_PRESETS } from "../../helpers/singleCell/matrix";
import { THEMES } from "../../helpers/singleCell/themes";
import { DEFAULT_FIGURE_STYLE, FIGURE_STYLES } from "../../helpers/singleCell/figureStyle";

const { Text } = Typography;

const stateLabel = (k, n) => (k === n - 1 ? `${k}+` : `${k}`);

/** Pick the chart drawing style (axes, grid, weights, spacing) for every chart and Paper figure. */
export function ChartStyleSelect({ style }) {
  const dispatch = useDispatch();
  const value = useSelector((state) => state.SingleCell.layout.figureStyle) || DEFAULT_FIGURE_STYLE;
  return (
    <Select
      size="small"
      style={{ width: 150, ...style }}
      value={value}
      onChange={(v) => dispatch(singleCellActions.updateLayout({ figureStyle: v }))}
      options={Object.entries(FIGURE_STYLES).map(([v, st]) => ({ value: v, label: st.label }))}
    />
  );
}

/** Pick the categorical colour theme (persists in this browser with the layout). */
export function ThemeSelect({ style }) {
  const dispatch = useDispatch();
  const theme = useSelector((state) => state.SingleCell.layout.theme) || "tableau";
  return (
    <Select
      size="small"
      style={{ width: 240, ...style }}
      value={theme}
      onChange={(value) => dispatch(singleCellActions.updateLayout({ theme: value }))}
      options={Object.entries(THEMES).map(([value, th]) => ({
        value,
        label: (
          <Space size={4}>
            <span style={{ display: "inline-flex", gap: 1 }}>
              {th.colors.slice(0, 6).map((c) => (
                <span key={c} style={{ width: 9, height: 12, background: c, display: "inline-block", borderRadius: 1 }} />
              ))}
            </span>
            {th.label}
          </Space>
        ),
      }))}
    />
  );
}

/** Edit the copy-number colours (total and allelic); choices persist in this browser. */
export default function PaletteEditor() {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const palette = useSelector((state) => state.SingleCell.palette);
  const update = (patch) => dispatch(singleCellActions.updatePalette({ ...palette, ...patch }));
  const setColor = (key, k, hex) => {
    const list = [...palette[key]];
    list[k] = hex;
    update({ [key]: list });
  };
  const applyPreset = (preset) =>
    dispatch(singleCellActions.updatePalette({ preset, ...CN_PALETTE_PRESETS[preset] }));

  const row = (key) => (
    <Space size={2} wrap>
      {palette[key].map((color, k) => (
        <Space key={k} direction="vertical" size={0} align="center">
          <ColorPicker
            size="small"
            value={color}
            disabledAlpha
            onChangeComplete={(c) => setColor(key, k, c.toHexString())}
          />
          <Text type="secondary" style={{ fontSize: 12.5 }}>
            {stateLabel(k, palette[key].length)}
          </Text>
        </Space>
      ))}
    </Space>
  );

  const content = (
    <Space direction="vertical" size={8} style={{ maxWidth: 520 }}>
      <Space wrap>
        <Text strong>{t("components.single-cell.palette.theme")}</Text>
        <ThemeSelect />
        <Text strong>Chart style</Text>
        <ChartStyleSelect />
      </Space>
      <Text type="secondary" style={{ fontSize: 13 }}>
        {t("components.single-cell.palette.theme-help")}
      </Text>
      <Space wrap>
        <Text>{t("components.single-cell.palette.preset")}</Text>
        <Select
          size="small"
          style={{ width: 200 }}
          value={palette.preset}
          onChange={applyPreset}
          options={Object.keys(CN_PALETTE_PRESETS).map((value) => ({
            value,
            label: t(`components.single-cell.palette.presets.${value}`),
          }))}
        />
        <Button size="small" onClick={() => applyPreset(palette.preset)}>
          {t("components.single-cell.palette.reset")}
        </Button>
      </Space>
      <Text strong>{t("components.single-cell.palette.total")}</Text>
      {row("total")}
      <Text strong>{t("components.single-cell.palette.allelic")}</Text>
      {row("allelic")}
      <Space>
        <Text strong>{t("components.single-cell.palette.missing")}</Text>
        <ColorPicker
          size="small"
          value={palette.missing}
          disabledAlpha
          onChangeComplete={(c) => update({ missing: c.toHexString() })}
        />
      </Space>
      <Text type="secondary" style={{ fontSize: 13 }}>
        {t("components.single-cell.palette.note")}
      </Text>
    </Space>
  );

  return (
    <Popover trigger="click" placement="bottomRight" title={t("components.single-cell.palette.title")} content={content}>
      <Tooltip title={t("components.single-cell.palette.title")}>
        <Button size="small" icon={<BgColorsOutlined />} />
      </Tooltip>
    </Popover>
  );
}
