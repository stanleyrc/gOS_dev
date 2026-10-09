import React from "react";
import { useTranslation } from "react-i18next";
import { Button, Checkbox, Divider, InputNumber, Space, Tooltip, Typography } from "antd";
import RareControl, { useRareMax } from "./rareControl";
import { familyLabel } from "../../../helpers/singleCell/walkCopies";
import { shortLabel } from "../../../helpers/singleCell/walkPlotState";
import { INK } from "../../../helpers/singleCell/plotTheme";

const { Text } = Typography;
const carriers = (w) => w.stats?.ncells ?? w.ncells ?? 0;
// 8-digit hex tint of a walk colour (d3 scheme colours are #rrggbb)
const tint = (c, a) => (/^#[0-9a-f]{6}$/i.test(c) ? `${c}${Math.round(a * 255).toString(16).padStart(2, "0")}` : c);

/**
 * Compact walk chooser: the filters that hide spurious walks on one line,
 * then the passing walks as toggle chips grouped by family (walks that nest
 * in each other, named by their most widely carried gene), each with its
 * carrier count. Ticked chips are filled with the walk's colour, the
 * highlighted (focused) walk is ringed; hovering a chip marks its lane in
 * the plot below.
 */
export default function WalkPicker({ families, total, nCells, filters, setFilters, colorOf, selected, onSelect, onShowTable, tableOpen = false, focus = null, onHover }) {
  const { t } = useTranslation("common");
  const set = (k) => (v) => setFilters({ ...filters, [k]: v });
  const sel = new Set(selected);
  const toggle = (id) => onSelect(sel.has(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const all = families.flat();
  const rareMax = useRareMax();
  const nShown = all.filter((w) => sel.has(w.id)).length;
  return (
    <div className="sc-walk-picker">
      <Space wrap size={[14, 6]} style={{ marginBottom: 10 }}>
        <Space size={4}>
          <Text type="secondary">{t("components.single-cell.ecdna.min-cells")}</Text>
          <InputNumber size="small" min={1} value={filters.minCells} onChange={(v) => set("minCells")(v ?? 1)} style={{ width: 60 }} />
        </Space>
        <Space size={4}>
          <Text type="secondary">{t("components.single-cell.ecdna.min-median")}</Text>
          <InputNumber size="small" min={0} value={filters.minMedianCn} onChange={(v) => set("minMedianCn")(v ?? 0)} style={{ width: 60 }} />
        </Space>
        <Space size={4}>
          <Text type="secondary">{t("components.single-cell.ecdna.min-cn")}</Text>
          <InputNumber size="small" min={1} value={filters.minCn} onChange={(v) => set("minCn")(v ?? 1)} style={{ width: 60 }} />
        </Space>
        <RareControl />
        <Checkbox checked={filters.curatedOnly} onChange={(e) => set("curatedOnly")(e.target.checked)}>{t("components.single-cell.ecdna.curated-only")}</Checkbox>
        <Checkbox checked={filters.driverOnly} onChange={(e) => set("driverOnly")(e.target.checked)}>{t("components.single-cell.ecdna.driver-only")}</Checkbox>
      </Space>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        <Text strong>{t("components.single-cell.ecdna.pick-shown", { shown: nShown, pass: all.length })}</Text>
        <Text type="secondary">{t("components.single-cell.ecdna.showing", { shown: all.length, total, cells: nCells })}</Text>
        <Divider type="vertical" />
        <Space size={4}>
          <Button size="small" onClick={() => onSelect(all.map((w) => w.id))}>{t("components.single-cell.ecdna.pick-all")}</Button>
          <Button size="small" onClick={() => onSelect(all.filter((w) => w.curated).map((w) => w.id))} disabled={!all.some((w) => w.curated)}>{t("components.single-cell.ecdna.pick-curated")}</Button>
          <Button size="small" onClick={() => onSelect(all.filter((w) => carriers(w) > rareMax).map((w) => w.id))}>{t("components.single-cell.ecdna.pick-common")}</Button>
          <Button size="small" onClick={() => onSelect([])}>{t("components.single-cell.ecdna.pick-none")}</Button>
        </Space>
        {onShowTable && (
          <Button size="small" type={tableOpen ? "primary" : "default"} ghost={tableOpen} onClick={onShowTable} style={{ marginLeft: "auto" }}>
            {t(tableOpen ? "components.single-cell.ecdna.hide-table" : "components.single-cell.ecdna.show-table")}
          </Button>
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 10px" }} onMouseLeave={() => onHover && onHover(null)}>
        {families.map((fam, f) => (
          <div key={f} style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", padding: "4px 6px", border: `1px solid var(--sc-border-soft, ${INK.borderSoft})`, borderRadius: 6, background: `var(--sc-panel-alt, ${INK.panelAlt})` }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: INK.muted, textTransform: "uppercase", letterSpacing: 0.4, marginRight: 2 }}>{familyLabel(fam, carriers)}</span>
            {fam.map((w) => {
              const on = sel.has(w.id);
              const c = colorOf(w.id);
              const rare = carriers(w) <= rareMax;
              const focused = focus === w.id;
              return (
                <Tooltip key={w.id} mouseEnterDelay={0.4} title={`${w.label} · ${w.genes.length ? w.genes.join(", ") : "no genes"} · ${carriers(w)} cells · median ${(w.stats?.medianCn ?? 0).toFixed(0)} copies${w.curated ? " · curated" : ""}${rare ? " · rare" : ""} — ${t(on ? "components.single-cell.ecdna.chip-hide" : "components.single-cell.ecdna.chip-show")}`}>
                  <span
                    role="checkbox"
                    aria-checked={on}
                    tabIndex={0}
                    data-walk-chip={w.id}
                    onClick={() => toggle(w.id)}
                    onKeyDown={(e) => {
                      if (e.key !== " " && e.key !== "Enter") return;
                      e.preventDefault();
                      toggle(w.id);
                    }}
                    onMouseEnter={() => onHover && onHover(on ? w.id : null)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      height: 22,
                      padding: "0 7px",
                      borderRadius: 11,
                      cursor: "pointer",
                      userSelect: "none",
                      fontSize: 12,
                      lineHeight: "20px",
                      border: `1px ${rare ? "dashed" : "solid"} ${on ? c : `var(--sc-border, ${INK.border})`}`,
                      background: on ? tint(c, 0.16) : `var(--sc-panel, ${INK.panel})`,
                      color: on ? `var(--sc-text, ${INK.text})` : `var(--sc-muted, ${INK.muted})`,
                      boxShadow: focused ? `0 0 0 2px ${c}` : "none",
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: 4, flex: "none", background: on ? c : "transparent", border: `1.5px solid ${c}` }} />
                    <span style={{ fontWeight: on ? 600 : 400 }}>{shortLabel(w.label, 26)}</span>
                    {w.curated && <span style={{ color: INK.ok, fontWeight: 700 }}>✓</span>}
                    <span style={{ color: INK.muted, fontSize: 11, fontVariantNumeric: "tabular-nums" }}>{carriers(w)}</span>
                  </span>
                </Tooltip>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
