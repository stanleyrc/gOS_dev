import React from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Alert, Button, Checkbox, Space, Typography } from "antd";
import { HeatMapOutlined } from "@ant-design/icons";
import singleCellActions from "../../redux/singleCell/actions";
import settingsActions from "../../redux/settings/actions";
import { eventSnvSiteId } from "../../helpers/singleCell/snvSites";
import { locationToDomains } from "../../helpers/genomeLocation";
import { SINGLE_CELL_TAB_KEY } from "../../helpers/detailTabAvailability";

const { Text } = Typography;
const GENE_PAD = 2e6; // bp shown around a copy-number / fusion gene

/** True on a single-cell patient's report (its Filtered Events come from the cells). */
export { isStrongEvent } from "../../helpers/singleCell/strongEvents";

export const useIsSingleCellPatient = () =>
  useSelector((state) => state.SingleCell.patient != null && !state.SingleCell.missing);

/** Checkbox column for FilteredEventsListPanel's additionalColumns. */
export const selectEventColumn = (selected, toggle) => [
  {
    title: "",
    key: "select",
    width: 44,
    fixed: "left",
    align: "center",
    render: (_, record) => (
      <Checkbox checked={selected.has(record.uid)} onChange={(e) => toggle(record, e.target.checked)} />
    ),
  },
];

/**
 * Bar above a single-cell patient's Filtered Events: send the picked events to
 * the Single-Cell heatmap. SNVs restrict the SNV heatmap to those sites;
 * copy-number changes and fusions zoom the CN heatmap to their genes. The
 * cells carrying the events (cell_ids) are selected either way.
 */
export function EventsToHeatmapBar({ picked, onClear }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const chromoBins = useSelector((state) => state.Settings.chromoBins);
  const snvIds = new Set(useSelector((state) => state.SingleCell.snv?.data?.variants || []).map((v) => v.id));
  const events = [...picked.values()];
  const siteIds = events.map(eventSnvSiteId).filter(Boolean);
  const inMatrix = siteIds.filter((id) => snvIds.has(id));
  const genes = events.filter((e) => !eventSnvSiteId(e));
  const cellIds = [...new Set(events.flatMap((e) => `${e.cell_ids || ""}`.split(",").filter(Boolean)))];

  const show = () => {
    if (cellIds.length) dispatch(singleCellActions.updateSelection(cellIds));
    if (inMatrix.length) {
      dispatch(singleCellActions.updateLayout({ snvSiteIds: inMatrix, snvCategories: null, snvCellphyOnly: false, snvDriversOnly: false }));
      dispatch(singleCellActions.updateHeatmapType("snv"));
    } else if (genes.length) {
      const location = genes
        .map((e) => {
          const chr = [].concat(e.chromosome)[0];
          const s = Number([].concat(e.startPoint)[0]);
          const en = Number([].concat(e.endPoint)[0]);
          return chr && Number.isFinite(s) && Number.isFinite(en)
            ? `${chr}:${Math.max(1, s - GENE_PAD)}-${chr}:${en + GENE_PAD}`
            : null;
        })
        .filter(Boolean)
        .join("|");
      if (location) {
        try {
          dispatch(settingsActions.updateDomains(locationToDomains(chromoBins, location, { clampRanges: true })));
        } catch (e) {
          // an unparseable location just leaves the view where it is
        }
      }
      dispatch(singleCellActions.updateHeatmapType("cn"));
    }
    dispatch(settingsActions.updateTab(SINGLE_CELL_TAB_KEY));
  };

  return (
    <Alert
      type="info"
      showIcon
      icon={<HeatMapOutlined />}
      style={{ marginBottom: 8 }}
      message={
        <Space wrap>
          <Text>{t("components.single-cell.events.picked", { count: events.length })}</Text>
          {events.length > 0 && (
            <Text type="secondary">
              {t("components.single-cell.events.summary", { snvs: inMatrix.length, genes: genes.length, cells: cellIds.length })}
            </Text>
          )}
          <Button size="small" type="primary" disabled={!inMatrix.length && !genes.length} onClick={show}>
            {t("components.single-cell.events.show")}
          </Button>
          {events.length > 0 && (
            <Button size="small" type="text" onClick={onClear}>
              {t("components.single-cell.selection.clear")}
            </Button>
          )}
          {events.length === 0 && <Text type="secondary">{t("components.single-cell.events.help")}</Text>}
        </Space>
      }
    />
  );
}
