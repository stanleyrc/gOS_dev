import React from "react";
import { useTranslation } from "react-i18next";
import { Space, Typography } from "antd";
import {
  countTicks,
  expressionRGB,
  junctionColor,
  normalizePalette,
  snvMissingColor,
  vafRGB,
} from "../../helpers/singleCell/matrix";

const { Text } = Typography;

const Swatch = ({ color, label }) => (
  <span className="sc-legend-item">
    <span className="sc-legend-swatch" style={{ background: color }} />
    <Text type="secondary">{label}</Text>
  </span>
);

const grey = (v) => `rgb(${vafRGB(v).join(",")})`;
const countColor = (value, max) => {
  const t = Math.log1p(Math.max(0, Math.min(max, value))) / Math.log1p(Math.max(1, max));
  return `rgb(${Math.round(255 * t)},128,${Math.round(255 * (1 - t))})`;
};

export default function HeatmapLegend({
  type,
  cnMode = "total",
  palette = null,
  snvMetric = null,
  snvMax = 1,
  maxJunctionCn = 1,
  cloneColors = {},
  showClones = true,
  expression = null,
}) {
  const { t } = useTranslation("common");
  const groups = [];
  if (type === "cn") {
    const p = normalizePalette(palette);
    const colors = cnMode === "total" ? p.total : p.allelic;
    groups.push({
      key: "cn",
      title: `${t("components.single-cell.legend.cn")} (${t(`components.single-cell.cn-mode.${cnMode}`)})`,
      items: [
        ...colors.map((color, k) => ({ color, label: k === colors.length - 1 ? `${k}+` : `${k}` })),
        { color: p.missing, label: t("components.single-cell.legend.missing") },
      ],
    });
  } else if (type === "junctions") {
    const top = Math.max(1, Math.ceil(maxJunctionCn || 1));
    const steps = [...new Set([0, 1, Math.ceil(top / 2), top])].filter((v) => v <= top);
    groups.push({
      key: "junctions",
      title: t("components.single-cell.legend.junctions"),
      items: steps.map((v) => ({ color: junctionColor(v, top), label: `${v}` })),
    });
  }
  if (snvMetric) {
    const items =
      snvMetric === "vaf"
        ? [0, 0.25, 0.5, 0.75, 1].map((v) => ({ color: grey(v), label: `${v}` }))
        : countTicks(snvMax).map((v) => ({ color: countColor(v, snvMax), label: `${v}` }));
    groups.push({
      key: "snv",
      title: t(`components.single-cell.metric.${snvMetric}`),
      items: [...items, { color: snvMissingColor(), label: t("components.single-cell.side.no-reads") }],
      note: t("components.single-cell.legend.binned"),
    });
  }
  const clones = Object.keys(cloneColors);
  const rgb = (v) => {
    const c = expressionRGB(v, expression?.max);
    return c ? `rgb(${c.join(",")})` : "#fff";
  };
  return (
    <Space wrap size={[16, 4]} className="sc-legend">
      {groups.map((g) => (
        <Space key={g.key} size={4} wrap>
          <Text strong type="secondary">
            {g.title}
          </Text>
          {g.items.map((d) => (
            <Swatch key={d.label} {...d} />
          ))}
          {g.note && (
            <Text type="secondary" className="sc-hint">
              · {g.note}
            </Text>
          )}
        </Space>
      ))}
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
