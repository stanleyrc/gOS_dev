import React from "react";
import { useTranslation } from "react-i18next";
import { Button, Checkbox, InputNumber, Space, Tag, Tooltip, Typography } from "antd";

const { Text } = Typography;

/**
 * Compact walk chooser: the filters that hide spurious walks on one line,
 * then the passing walks as toggle chips grouped by family (walks that nest
 * in each other), each with its carrier count and median copies.
 */
export default function WalkPicker({ families, total, nCells, filters, setFilters, colorOf, selected, onSelect, onShowTable }) {
  const { t } = useTranslation("common");
  const set = (k) => (v) => setFilters({ ...filters, [k]: v });
  const sel = new Set(selected);
  const toggle = (id) => onSelect(sel.has(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const all = families.flat();
  return (
    <div>
      <Space wrap size={[12, 6]} style={{ marginBottom: 8 }}>
        <Space size={4}>
          <Text type="secondary">{t("components.single-cell.ecdna.min-cells")}</Text>
          <InputNumber size="small" min={1} value={filters.minCells} onChange={(v) => set("minCells")(v ?? 1)} style={{ width: 64 }} />
        </Space>
        <Space size={4}>
          <Text type="secondary">{t("components.single-cell.ecdna.min-median")}</Text>
          <InputNumber size="small" min={0} value={filters.minMedianCn} onChange={(v) => set("minMedianCn")(v ?? 0)} style={{ width: 64 }} />
        </Space>
        <Space size={4}>
          <Text type="secondary">{t("components.single-cell.ecdna.min-cn")}</Text>
          <InputNumber size="small" min={1} value={filters.minCn} onChange={(v) => set("minCn")(v ?? 1)} style={{ width: 64 }} />
        </Space>
        <Checkbox checked={filters.curatedOnly} onChange={(e) => set("curatedOnly")(e.target.checked)}>{t("components.single-cell.ecdna.curated-only")}</Checkbox>
        <Checkbox checked={filters.driverOnly} onChange={(e) => set("driverOnly")(e.target.checked)}>{t("components.single-cell.ecdna.driver-only")}</Checkbox>
        <Text type="secondary">{t("components.single-cell.ecdna.showing", { shown: all.length, total, cells: nCells })}</Text>
        <Button size="small" onClick={() => onSelect(all.map((w) => w.id))}>{t("components.single-cell.ecdna.pick-all")}</Button>
        <Button size="small" onClick={() => onSelect(all.filter((w) => w.curated).map((w) => w.id))}>{t("components.single-cell.ecdna.pick-curated")}</Button>
        <Button size="small" onClick={() => onSelect([])}>{t("components.single-cell.ecdna.pick-none")}</Button>
        {onShowTable && <Button size="small" type="link" onClick={onShowTable}>{t("components.single-cell.ecdna.show-table")}</Button>}
      </Space>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px" }}>
        {families.map((fam, f) => (
          <div key={f} style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", padding: "2px 6px", border: "1px dashed #d9d9d9", borderRadius: 6 }}>
            {fam.map((w) => {
              const on = sel.has(w.id);
              const c = colorOf(w.id);
              return (
                <Tooltip key={w.id} title={`${w.genes.length ? w.genes.join(", ") : w.label} · ${w.stats.ncells} cells · median ${w.stats.medianCn.toFixed(0)} copies${w.curated ? " · curated" : ""}`}>
                  <Tag
                    onClick={() => toggle(w.id)}
                    style={{ cursor: "pointer", margin: 0, borderColor: c, background: on ? c : "transparent", color: on ? "#fff" : c, fontWeight: 600, userSelect: "none" }}
                  >
                    {`${w.label.length > 28 ? `${w.label.slice(0, 27)}…` : w.label} · ${w.stats.ncells}`}
                  </Tag>
                </Tooltip>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
