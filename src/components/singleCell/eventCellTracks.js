import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Alert, Button, Select, Space, Switch, Typography } from "antd";
import CellTracksPanel from "./cellTracksPanel";
import singleCellActions, { SC_MAX_TRACK_CELLS } from "../../redux/singleCell/actions";
import settingsActions from "../../redux/settings/actions";
import { locationToDomains } from "../../helpers/utility";
import { useIsSingleCellPatient } from "./eventsToHeatmap";
import { padDomains } from "../../helpers/singleCell/eventDomains";

const { Text } = Typography;
const PADS = [0, 5e4, 2.5e5, 1e6, 5e6];
const DEFAULT_PAD = 5e4;
const DEFAULT_MULTI = 3;

const padLabel = (bp) => (bp >= 1e6 ? `${bp / 1e6} Mb` : bp ? `${bp / 1e3} kb` : "none");

/** The event's locus (or loci, for fusions) widened by `pad` bp on each side. */
function paddedEventDomains(chromoBins, location, pad, genomeLength) {
  if (!location) return null;
  try {
    return padDomains(locationToDomains(chromoBins, location, { clampRanges: true }), pad, genomeLength);
  } catch (error) {
    return null;
  }
}

/**
 * Plots tab of a filtered event on a single-cell patient: the tracks of one
 * cell carrying the event (or several, with the toggle) around its locus.
 */
function SingleCellEventTracks({ record }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const { chromoBins, genomeLength } = useSelector((state) => state.Settings);
  const { cells, cloneColors } = useSelector((state) => state.SingleCell);
  const carriers = useMemo(() => `${record?.cell_ids || ""}`.split(",").filter(Boolean), [record]);
  const [pad, setPad] = useState(DEFAULT_PAD);
  const [multi, setMulti] = useState(false);
  const [one, setOne] = useState(null);
  const [many, setMany] = useState([]);
  useEffect(() => {
    setOne(carriers[0] || null);
    setMany(carriers.slice(0, DEFAULT_MULTI));
  }, [carriers]);

  const location = record?.actualLocation || record?.location;
  useEffect(() => {
    const domains = paddedEventDomains(chromoBins, location, pad, genomeLength);
    if (domains) dispatch(settingsActions.updateDomains(domains));
  }, [dispatch, chromoBins, location, pad, genomeLength]);

  const cloneOf = useMemo(() => new Map(cells.map((c) => [c.cell_id, c.clone_id])), [cells]);
  const options = carriers.map((id) => ({
    value: id,
    label: (
      <span>
        {cloneOf.get(id) != null && <span className="sc-swatch" style={{ background: cloneColors[cloneOf.get(id)] }} />}
        {id}
      </span>
    ),
  }));
  if (!carriers.length) {
    return <Alert type="info" showIcon message={t("components.single-cell.event-cells.no-cells")} />;
  }
  const shown = multi ? many : one ? [one] : [];

  return (
    <Space direction="vertical" size={8} style={{ width: "100%" }}>
      <Space wrap>
        <Text type="secondary">{t("components.single-cell.event-cells.carriers", { count: carriers.length })}</Text>
        <Switch size="small" checked={multi} onChange={setMulti} />
        <Text>{t("components.single-cell.event-cells.multiple")}</Text>
        {multi ? (
          <Select
            size="small"
            mode="multiple"
            maxCount={SC_MAX_TRACK_CELLS}
            style={{ minWidth: 360 }}
            value={many}
            onChange={setMany}
            options={options}
            maxTagCount="responsive"
            showSearch
          />
        ) : (
          <Select size="small" style={{ minWidth: 280 }} value={one} onChange={setOne} options={options} showSearch />
        )}
        <Text type="secondary">{t("components.single-cell.event-cells.pad")}</Text>
        <Select size="small" style={{ width: 100 }} value={pad} onChange={setPad} options={PADS.map((p) => ({ value: p, label: padLabel(p) }))} />
        <Button size="small" type="link" onClick={() => dispatch(singleCellActions.updateSelection(carriers))}>
          {t("components.single-cell.event-cells.select-all", { count: carriers.length })}
        </Button>
      </Space>
      <CellTracksPanel
        cellIds={shown}
        embedded
        title={t("components.single-cell.event-cells.title", { location: location || "" })}
        onRemove={(id) => (multi ? setMany(many.filter((c) => c !== id)) : setOne(null))}
      />
    </Space>
  );
}

/** Per-cell tracks on a single-cell patient, otherwise the bulk tracks (`fallback`). */
export default function EventTracks({ record, fallback }) {
  const singleCell = useIsSingleCellPatient();
  return singleCell ? <SingleCellEventTracks record={record} /> : fallback;
}
