import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Space, Switch, Tooltip, Typography } from "antd";
import Wrapper from "./index.style";
import FilteredEventsListPanel from "../../components/filteredEventsListPanel";
import {
  EventsToHeatmapBar,
  isStrongEvent,
  selectEventColumn,
  useIsSingleCellPatient,
} from "../../components/singleCell/eventsToHeatmap";

/**
 * Filtered events. On a single-cell patient's report the events can be picked
 * and shown on the Single-Cell heatmap.
 */
export default function FilteredEventsTab() {
  const { t } = useTranslation("common");
  const singleCell = useIsSingleCellPatient();
  const [strongOnly, setStrongOnly] = useState(true);
  const [picked, setPicked] = useState(new Map()); // uid -> event
  const toggle = (record, on) =>
    setPicked((prev) => {
      const next = new Map(prev);
      if (on) next.set(record.uid, record);
      else next.delete(record.uid);
      return next;
    });
  if (!singleCell) {
    return (
      <Wrapper>
        <FilteredEventsListPanel />
      </Wrapper>
    );
  }
  return (
    <Wrapper>
      <Space style={{ marginBottom: 8 }}>
        <Switch size="small" checked={strongOnly} onChange={setStrongOnly} />
        <Tooltip title={t("components.single-cell.events.strong-help")}>
          <Typography.Text>{t("components.single-cell.events.strong-only")}</Typography.Text>
        </Tooltip>
      </Space>
      <EventsToHeatmapBar picked={picked} onClear={() => setPicked(new Map())} />
      <FilteredEventsListPanel
        additionalColumns={selectEventColumn(new Set(picked.keys()), toggle)}
        recordFilter={strongOnly ? isStrongEvent : null}
      />
    </Wrapper>
  );
}
