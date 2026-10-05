import React from "react";
import { useTranslation } from "react-i18next";
import { Space, Typography } from "antd";
import {
  CN_STATE_COLORS,
  SNV_STATUS_COLORS,
  expressionRGB,
  junctionColor,
} from "../../helpers/singleCell/matrix";

const { Text } = Typography;

const Swatch = ({ color, label }) => (
  <span className="sc-legend-item">
    <span className="sc-legend-swatch" style={{ background: color }} />
    <Text type="secondary">{label}</Text>
  </span>
);

export default function HeatmapLegend({
  type,
  maxJunctionCn = 1,
  cloneColors = {},
  showClones = true,
  expression = null,
}) {
  const { t } = useTranslation("common");
  let items = [];
  if (type === "cn") {
    items = CN_STATE_COLORS.map((color, k) => ({
      color,
      label: k === CN_STATE_COLORS.length - 1 ? `${k}+` : `${k}`,
    }));
  } else if (type === "snv") {
    items = [
      { color: SNV_STATUS_COLORS.present, label: t("components.single-cell.snv.present") },
      { color: SNV_STATUS_COLORS.absent, label: t("components.single-cell.snv.absent") },
      { color: SNV_STATUS_COLORS.missing, label: t("components.single-cell.snv.missing") },
    ];
  } else if (type === "junctions") {
    const top = Math.max(1, Math.ceil(maxJunctionCn || 1));
    const steps = [...new Set([0, 1, Math.ceil(top / 2), top])].filter((v) => v <= top);
    items = steps.map((v) => ({ color: junctionColor(v, top), label: `${v}` }));
  }
  const clones = Object.keys(cloneColors);
  const rgb = (v) => {
    const c = expressionRGB(v, expression?.max);
    return c ? `rgb(${c.join(",")})` : "#fff";
  };
  return (
    <Space wrap size={[12, 4]} className="sc-legend">
      {items.length > 0 && (
        <Space size={4} wrap>
          <Text strong type="secondary">
            {t(`components.single-cell.legend.${type}`)}
          </Text>
          {items.map((d) => (
            <Swatch key={d.label} {...d} />
          ))}
        </Space>
      )}
      {expression && (
        <Space size={4} wrap>
          <Text strong type="secondary">
            {t("components.single-cell.legend.expression", { gene: expression.gene })}
          </Text>
          <Swatch color={rgb(0)} label="0" />
          <Swatch color={rgb(expression.max / 2)} label={(expression.max / 2).toFixed(1)} />
          <Swatch color={rgb(expression.max)} label={expression.max.toFixed(1)} />
          <Swatch color="#fff" label={t("components.single-cell.tooltip.no-rna")} />
        </Space>
      )}
      {showClones && clones.length > 0 && (
        <Space size={4} wrap>
          <Text strong type="secondary">
            {t("components.single-cell.legend.clones")}
          </Text>
          {clones.map((clone) => (
            <Swatch key={clone} color={cloneColors[clone]} label={clone} />
          ))}
        </Space>
      )}
    </Space>
  );
}
