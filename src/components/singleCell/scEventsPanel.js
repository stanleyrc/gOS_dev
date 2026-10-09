import React, { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Select, Space, Switch, Tag, Tooltip, Typography } from "antd";
import useTreeView from "./useTreeView";
import { cladeFitScore } from "../../helpers/singleCell/cladeFit";
import { segmentNoise } from "../../helpers/singleCell/segmentNoise";
import { eventGlobalPosition } from "../../helpers/singleCell/eventDomains";
import { eventClass } from "../../helpers/singleCell/cohortStats";
import FilteredEventsListPanel from "../filteredEventsListPanel";
import { EventsToHeatmapBar, isStrongEvent, selectEventColumn, useIsSingleCellPatient } from "./eventsToHeatmap";

/**
 * The filtered events table with the single-cell extras (strong-events
 * switch, clade-fit column and filter, pick events for the heatmap / tree)
 * when the open case is a single-cell patient; the plain table otherwise.
 * Used by the Filtered Events tab and the Overall tab.
 */
const EVIDENCE_COLORS = { likely: "volcano", possible: "gold", unlikely: "default" };
const num = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const filteredEventsHaveEvidence = (records) => (records || []).some((r) => r.driver_class);

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
  // width of the CN segment behind each deletion / amplification in its carriers
  const cn = useSelector((s) => s.SingleCell.cn);
  const records = useSelector((s) => s.FilteredEvents.filteredEvents);
  const chromoBins = useSelector((s) => s.Settings.chromoBins);
  const noiseCache = useRef(new Map());
  const noiseOf = (record) => {
    const key = `${record.uid}|${record.cell_ids}`;
    if (!noiseCache.current.has(key)) {
      const cls = eventClass(record);
      noiseCache.current.set(key, cls === "homdel" || cls === "amp" ? segmentNoise(cn.data, { globalPosition: eventGlobalPosition(record, chromoBins), carriers: `${record.cell_ids || ""}`.split(",").filter(Boolean) }) : null);
    }
    return noiseCache.current.get(key);
  };
  useEffect(() => noiseCache.current.clear(), [cn]);
  const columnFilters = useSelector((s) => s.FilteredEvents.columnFilters) || {};
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
          exportTitle: "clade_f1",
          exportValue: (record) => (Number.isFinite(cladeOf(record).score) ? cladeOf(record).score.toFixed(3) : null),
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
  const segmentColumn =
    cn.status === "ok"
      ? [
          {
            title: (
              <Tooltip title={t("components.single-cell.events.segment-help")}>
                <span>{t("components.single-cell.events.segment")}</span>
              </Tooltip>
            ),
            key: "segment",
            width: 90,
            exportTitle: "segment_width_mb",
            exportValue: (record) => (noiseOf(record) ? (noiseOf(record).medianWidthBp / 1e6).toFixed(3) : null),
            sorter: (a, b) => (noiseOf(a)?.medianWidthBp || Infinity) - (noiseOf(b)?.medianWidthBp || Infinity),
            render: (_, record) => {
              const n = noiseOf(record);
              if (!n) return "–";
              return (
                <Tooltip title={t("components.single-cell.events.segment-detail", { narrow: n.nNarrow, n: n.nCovered, flank: Number.isFinite(n.medianFlankCn) ? n.medianFlankCn.toFixed(0) : "–" })}>
                  <span style={{ color: n.narrow ? "#cf1322" : undefined, fontWeight: n.narrow ? 600 : 400 }}>{`${(n.medianWidthBp / 1e6).toFixed(n.medianWidthBp < 1e6 ? 2 : 1)} Mb`}</span>
                </Tooltip>
              );
            },
          },
        ]
      : [];
  // SNV driver evidence from the pipeline (gos_sc_snv_evidence.R): points, class and a readable summary
  const evidenceColumn = filteredEventsHaveEvidence(records)
    ? [
        {
          title: (
            <Tooltip title={t("components.single-cell.events.driver-evidence-help")}>
              <span>{t("components.single-cell.events.driver-evidence")}</span>
            </Tooltip>
          ),
          key: "driverEvidence",
          width: 110,
          sorter: (a, b) => (num(a.driver_score) ?? -1) - (num(b.driver_score) ?? -1),
          filters: ["likely", "possible", "unlikely"].map((v) => ({ text: v, value: v })),
          filteredValue: columnFilters.driverEvidence || null,
          onFilter: (value, record) => record.driver_class === value,
          render: (_, record) =>
            record.driver_class ? (
              <Tooltip title={record.driver_evidence}>
                <Tag color={EVIDENCE_COLORS[record.driver_class]}>{`${record.driver_class} ${record.driver_score}`}</Tag>
              </Tooltip>
            ) : (
              "–"
            ),
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
      <FilteredEventsListPanel additionalColumns={[...selectEventColumn(new Set(picked.keys()), toggle), ...evidenceColumn, ...cladeColumn, ...segmentColumn]} recordFilter={strongOnly || minClade ? recordFilter : null} />
    </>
  );
}
