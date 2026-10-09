import React, { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import * as d3 from "d3";
import { Card, Space, Table, Tag, Tooltip, Typography } from "antd";
import { FieldTimeOutlined } from "@ant-design/icons";
import filteredEventsActions from "../../redux/filteredEvents/actions";
import { amplificationTiming } from "../../helpers/singleCell/snvCopyNumber";
import { eventClass } from "../../helpers/singleCell/cohortStats";
import { isStrongEvent } from "../../helpers/singleCell/strongEvents";
import { eventGlobalPosition } from "../../helpers/singleCell/eventDomains";
import HintLine, { Provenance } from "./hintLine";
import { INK } from "../../helpers/singleCell/plotTheme";

const { Text } = Typography;
const pct = d3.format(".0%");

/**
 * Timing of each strong tier 1–2 amplification relative to the SNVs on the
 * amplicon: SNVs estimated at ≥ 1.5 mutant copies in a carrier cell were
 * present before the amplification (and duplicated with it), SNVs at ~1 copy
 * arose afterwards. A low pre-amplification fraction means an early
 * amplification; a high one, a late amplification on a mutated background.
 */
export default function AmpTimingCard() {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const { snv, cn } = useSelector((s) => s.SingleCell);
  const chromoBins = useSelector((s) => s.Settings.chromoBins);
  const events = useSelector((s) => s.FilteredEvents.filteredEvents);
  const rows = useMemo(() => {
    if (snv.status !== "ok" || cn.status !== "ok") return [];
    return (events || [])
      .filter((e) => Number(e.Tier ?? 9) <= 2 && eventClass(e) === "amp" && isStrongEvent(e))
      .map((e) => {
        const carriers = `${e.cell_ids || ""}`.split(",").filter(Boolean);
        const r = amplificationTiming(snv.data, cn.data, { globalPosition: eventGlobalPosition(e, chromoBins), carriers });
        return { key: `${e.gene}-${e.Genome_Location}`, event: e, gene: e.gene, carriers: carriers.length, ...(r || { nObs: 0, nSites: 0, preFraction: NaN, sites: [] }) };
      })
      .sort((a, b) => b.nSites - a.nSites);
  }, [events, snv, cn, chromoBins]);
  if (!rows.length) return null;
  const verdict = (r) => {
    if (!(r.nSites >= 3)) return { color: "default", label: t("components.single-cell.timing.few") };
    if (r.preFraction < 0.3) return { color: "geekblue", label: t("components.single-cell.timing.early") };
    if (r.preFraction > 0.6) return { color: "volcano", label: t("components.single-cell.timing.late") };
    return { color: "gold", label: t("components.single-cell.timing.mid") };
  };
  const columns = [
    { title: t("components.single-cell.results.gene"), dataIndex: "gene", width: 110, render: (g, r) => <Text strong style={{ cursor: "pointer" }} onClick={() => dispatch(filteredEventsActions.selectFilteredEvent(r.event, "plots"))}>{g}</Text> },
    { title: t("components.single-cell.cohort.ev-carriers"), dataIndex: "carriers", width: 80 },
    { title: t("components.single-cell.timing.sites"), dataIndex: "nSites", width: 90, render: (n, r) => <Tooltip title={r.sites.map((s) => `${s.id}${s.gene ? ` (${s.gene})` : ""}: ${s.medianCopies.toFixed(1)} copies in ${s.n} cells`).join("\n")}><span>{`${n} (${r.nObs} obs)`}</span></Tooltip> },
    {
      title: t("components.single-cell.timing.pre"),
      dataIndex: "preFraction",
      width: 220,
      render: (f, r) =>
        Number.isFinite(f) ? (
          <Space size={6}>
            <svg width={120} height={12}><rect width={120} height={12} fill={INK.empty} rx={3} /><rect width={120 * f} height={12} fill="#722ed1" rx={3} /></svg>
            <span>{`${pct(f)} (${r.sites.filter((s) => s.pre).length}/${r.nSites})`}</span>
          </Space>
        ) : (
          "–"
        ),
    },
    { title: t("components.single-cell.timing.verdict"), key: "verdict", width: 160, render: (_, r) => <Tag color={verdict(r).color}>{verdict(r).label}</Tag> },
  ];
  return (
    <Card size="small" title={<Space><FieldTimeOutlined />{t("components.single-cell.timing.title")}<Provenance id="ampTiming" /></Space>}>
      <Table size="small" className="sc-events-table" columns={columns} dataSource={rows} pagination={false} />
      <HintLine text={t("components.single-cell.timing.help")} />
    </Card>
  );
}
