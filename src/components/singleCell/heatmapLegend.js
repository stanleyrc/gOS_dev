import React from "react";
import { useTranslation } from "react-i18next";
import { Space, Typography } from "antd";
import {
  countTicks,
  expressionRGB,
  junctionColor,
  LONG_PALETTE_TICKS,
  normalizePalette,
  snvMissingColor,
  snvNaMode,
  ALT_BINS,
  GT_COLORS,
  depthColor,
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
  drivers = null,
}) {
  const { t } = useTranslation("common");
  const groups = [];
  if (type === "cn") {
    const p = normalizePalette(palette, palette?.preset);
    const colors = cnMode === "total" ? p.total : p.allelic;
    // long per-state palettes (deck: 0..100) show a few ticks instead of every state
    const states = colors.length > 16 ? LONG_PALETTE_TICKS.filter((k) => k < colors.length) : colors.map((c, k) => k);
    groups.push({
      key: "cn",
      title: `${t("components.single-cell.legend.cn")} (${t(`components.single-cell.cn-mode.${cnMode}`)})`,
      items: [
        ...states.map((k) => ({ color: colors[k], label: k === colors.length - 1 ? `${k}+` : `${k}` })),
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
  if (type === "drivers" && drivers) {
    const c = drivers.colors;
    const has = (cls) => drivers.entries.some((d) => d.cls === cls);
    if (has("snv")) {
      groups.push({
        key: "d-snv",
        title: "SNV / indel",
        items: [
          { color: c.mutant, label: "mutant" },
          { color: c.wildtype, label: "wild type" },
          { color: c.noCoverage, label: t("components.single-cell.side.no-reads") },
          ...(drivers.entries.some((d) => d.cls === "snv" && d.twoHit) ? [{ color: c.loss, label: "loss only (TSG second hit)" }, { color: c.bothHit, label: "SNV + loss (biallelic)" }] : []),
        ],
      });
    }
    if (has("amp") || has("homdel")) {
      const p = normalizePalette(drivers.palette, drivers.palette?.preset);
      groups.push({
        key: "d-cn",
        title: "Amp / del: copy number",
        items: [0, 1, 2, 3, 4, 6, 8].filter((k) => k < p.total.length).map((k) => ({ color: p.total[k], label: k === p.total.length - 1 ? `${k}+` : `${k}` })),
      });
    }
    if (has("fusion")) {
      groups.push({
        key: "d-fusion",
        title: "SV fusion",
        items: [
          { color: c.dna, label: "DNA" },
          { color: c.rna, label: "RNA only" },
          { color: c.both, label: "DNA + RNA" },
        ],
      });
    }
    if (has("complex")) groups.push({ key: "d-complex", title: "Complex event", items: [{ color: c.complex, label: "carrier (DM / TIC / BFB, gGnome event classifier)" }] });
  }
  if (snvMetric) {
    const rgb = (c) => `rgb(${c.join(",")})`;
    const naMode = snvNaMode();
    let items;
    let note = t("components.single-cell.legend.binned");
    if (snvMetric === "vaf") items = [0, 0.25, 0.5, 0.75, 1].map((v) => ({ color: grey(v), label: `${v}` }));
    else if (snvMetric === "gt") {
      items = [
        { color: GT_COLORS.alt, label: "alt" },
        { color: GT_COLORS.ref, label: "ref" },
      ];
      note = null;
    } else if (snvMetric === "alt") {
      items = ALT_BINS.map((b) => ({ color: b.color, label: b.label }));
      note = `zoomed in: ALT reads per cell in bins; zoomed out: grey = fraction of sites in the pixel with alt reads`;
    } else {
      const top = Math.max(1, Math.round(snvMax || 1));
      items = countTicks(top).map((v) => ({ color: rgb(depthColor(v, top)), label: v === top ? `${v}+` : `${v}` }));
      note = `zoomed in: read depth, log scale clipped at the 99th percentile; zoomed out: grey = fraction of sites with alt reads`;
    }
    groups.push({
      key: "snv",
      title: t(`components.single-cell.metric.${snvMetric}`),
      items: [...items, { color: snvMissingColor(), label: `${t("components.single-cell.side.no-reads")} (missing, ${naMode})` }],
      note,
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
