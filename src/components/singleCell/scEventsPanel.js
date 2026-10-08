import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Select, Space, Switch, Tooltip, Typography } from "antd";
import useTreeView from "./useTreeView";
import { cladeFitScore } from "../../helpers/singleCell/cladeFit";
import FilteredEventsListPanel from "../filteredEventsListPanel";
import { EventsToHeatmapBar, isStrongEvent, selectEventColumn, useIsSingleCellPatient } from "./eventsToHeatmap";

/**
 * The filtered events table with the single-cell extras (strong-events
 * switch, clade-fit column and filter, pick events for the heatmap / tree)
 * when the open case is a single-cell patient; the plain table otherwise.
 * Used by the Filtered Events tab and the Overall tab.
 */
export default function ScEventsPanel() {
  const { t } = useTranslation("common");
  const singleCell = useIsSingleCellPatient();
  const [strongOnly, setStrongOnly] = useState(true);
  const [minClade, setMinClade] = useState(0);
  const { treeLayout } = useTreeView();
  // clade fit of each event's carriers on the displayed tree (memo per event by cell_ids)
  const cladeCache = useRef(new Map());
  const cladeOf = (record) => {
    const key = `${record.uid}|${record.cell_ids}`;
    if (!cladeCache.current.has(key)) cladeCache.current.set(key, cladeFitScore(`${record.cell_ids || ""}`.split(",").filter(Boolean), treeLayout));
    return cladeCache.current.get(key);
  };
  useEffect(() => cladeCache.current.clear(), [treeLayout]);
  const [picked, setPicked] = useState(new Map()); // uid -> event
  const toggle = (record, on) =>
    setPicked((prev) => {
      const next = new Map(prev);
      if (on) next.set(record.uid, record);
      else next.delete(record.uid);
      return next;
    });
  if (!singleCell) return <FilteredEventsListPanel />;

  const cladeColumn = treeLayout
    ? [
        {
          title: (
            <Tooltip title={t("components.single-cell.events.clade-score-help")}>
              <span>{t("components.single-cell.events.clade-score")}</span>
            </Tooltip>
          ),
          key: "cladeScore",
          width: 90,
          sorter: (a, b) => (cladeOf(a).score || 0) - (cladeOf(b).score || 0),
          render: (_, record) => {
            const c = cladeOf(record);
            if (!Number.isFinite(c.score)) return "–";
            return (
              <Tooltip title={t("components.single-cell.events.clade-score-detail", { inClade: c.inClade, clade: c.clade, carriers: c.carriers })}>
                <span style={{ color: c.score < 0.5 ? "#cf1322" : c.score >= 0.8 ? "#237804" : undefined, fontWeight: c.score >= 0.8 ? 600 : 400 }}>{c.score.toFixed(2)}</span>
              </Tooltip>
            );
          },
        },
      ]
    : [];
  const recordFilter = (record) => (!strongOnly || isStrongEvent(record)) && (!minClade || !treeLayout || !(cladeOf(record).score < minClade));
  return (
    <>
      <Space style={{ marginBottom: 8 }}>
        <Switch size="small" checked={strongOnly} onChange={setStrongOnly} />
        <Tooltip title={t("components.single-cell.events.strong-help")}>
          <Typography.Text>{t("components.single-cell.events.strong-only")}</Typography.Text>
        </Tooltip>
        {treeLayout && (
          <>
            <Typography.Text type="secondary">{t("components.single-cell.events.clade-score")}</Typography.Text>
            <Select size="small" style={{ width: 120 }} value={minClade} onChange={setMinClade} options={[0, 0.5, 0.7, 0.8, 0.9].map((v) => ({ value: v, label: v ? `≥ ${v}` : t("components.single-cell.events.clade-any") }))} />
          </>
        )}
      </Space>
      <EventsToHeatmapBar picked={picked} onClear={() => setPicked(new Map())} />
      <FilteredEventsListPanel additionalColumns={[...selectEventColumn(new Set(picked.keys()), toggle), ...cladeColumn]} recordFilter={strongOnly || minClade ? recordFilter : null} />
    </>
  );
}
