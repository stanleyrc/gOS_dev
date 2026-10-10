import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Alert, Button, Card, Col, Empty, Row, Segmented, Select, Space, Table, Tag, Tooltip, Typography } from "antd";
import { AimOutlined, ExperimentOutlined, NodeIndexOutlined, WarningOutlined } from "@ant-design/icons";
import singleCellActions from "../../../redux/singleCell/actions";
import settingsActions from "../../../redux/settings/actions";
import scaActions from "../../../redux/scAnalysis/actions";
import useTreeView from "../useTreeView";
import useRnaData from "../rna/useRnaData";
import useContainerWidth from "../useContainerWidth";
import usePlotTheme from "../usePlotTheme";
import HintLine from "../hintLine";
import { SC_GUTTER } from "../density";
import { TYPE } from "../../../helpers/singleCell/plotTheme";
import { formatP } from "../../../helpers/singleCell/tests";
import { fieldLabel } from "../../../helpers/singleCell/fieldLabels";
import { COMPARATOR_MODES, balanceTable, comparatorCells, plateOf, subclonalDrivers } from "../../../helpers/singleCell/driverContrast";
import { CARRIER_COLOR, COMPARATOR_COLOR, OTHER_COLOR } from "./useDriverEvidence";
import DriverGenomeCard from "./driverGenomeCard";
import DriverExpressionCard from "./driverExpressionCard";
import DriverPhenotypeCard from "./driverPhenotypeCard";
import DriverEvidenceCard from "./driverEvidenceCard";

const { Text } = Typography;
const isNormalClone = (clone) => /^normal$/i.test(`${clone || ""}`);
const pct = (x) => `${Math.round(x * 100)}%`;

/**
 * Cells in tree order as one strip: carriers, comparator, other tumor cells,
 * normals. Hover a cell for its id, group, clone and plate; click selects it on
 * the heatmap, Shift-click selects every cell of its group.
 */
function TreeStrip({ leaves, groupOf, clade, groupLabel, cloneOf, onSelect }) {
  const [ref, width] = useContainerWidth(600);
  const theme = usePlotTheme();
  const [hover, setHover] = useState(null);
  const h = 22;
  const top = 14;
  const n = leaves.length || 1;
  const w = width / n;
  const color = { a: CARRIER_COLOR, b: COMPARATOR_COLOR, o: OTHER_COLOR, n: theme.empty };
  const at = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - r.left) / w);
    return i >= 0 && i < leaves.length ? i : null;
  };
  const hid = hover != null ? `${leaves[hover]}` : null;
  return (
    <div ref={ref} style={{ width: "100%", position: "relative" }}>
      <svg
        width={width}
        height={top + h + 2}
        role="img"
        aria-label="cells in tree order"
        style={{ cursor: "pointer" }}
        onMouseMove={(e) => setHover(at(e))}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          const i = at(e);
          if (i == null) return;
          const id = `${leaves[i]}`;
          onSelect(e.shiftKey || e.metaKey ? leaves.map(String).filter((x) => groupOf(x) === groupOf(id)) : [id]);
        }}
      >
        {clade && (
          <g>
            <line x1={clade.first * w} x2={(clade.last + 1) * w} y1={6} y2={6} stroke={theme.textSecondary} strokeWidth={1.5} />
            <line x1={clade.first * w} x2={clade.first * w} y1={6} y2={11} stroke={theme.textSecondary} />
            <line x1={(clade.last + 1) * w} x2={(clade.last + 1) * w} y1={6} y2={11} stroke={theme.textSecondary} />
          </g>
        )}
        {leaves.map((id, i) => (
          <rect key={id} x={i * w} y={top} width={Math.max(w - (w > 3 ? 0.5 : 0), 0.6)} height={h} fill={color[groupOf(id)]} />
        ))}
        {hover != null && <rect x={hover * w - 1} y={top - 2} width={Math.max(w, 2) + 2} height={h + 4} fill="none" stroke={theme.text} strokeWidth={1.5} pointerEvents="none" />}
      </svg>
      {hid && (
        <div
          style={{
            position: "absolute",
            left: Math.min(Math.max(hover * w - 80, 0), Math.max(width - 300, 0)),
            top: top + h + 6,
            zIndex: 2,
            pointerEvents: "none",
            background: theme.raised,
            color: theme.text,
            border: `1px solid ${theme.border}`,
            borderRadius: 4,
            padding: "2px 8px",
            fontSize: TYPE.tick,
            whiteSpace: "nowrap",
            boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
          }}
        >
          {`${hid} · ${groupLabel(groupOf(hid))}${cloneOf(hid) != null ? ` · ${cloneOf(hid)}` : ""} · plate ${plateOf(hid) || "?"}`}
        </div>
      )}
    </div>
  );
}

/**
 * Subclonal driver deep-dive: the carriers of one driver against matched
 * non-carriers of the same tumor (sister clade / same plate / all), with what
 * else differs between them (DNA), expression tested within plates, cell
 * phenotypes and, for fusions, the RNA evidence of the driver itself.
 */
export default function DriverContrastPanel() {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const events = useSelector((s) => s.FilteredEvents.filteredEvents);
  const { cells, patient, driverFocus } = useSelector((s) => s.SingleCell);
  const { treeLayout } = useTreeView();
  const rna = useRnaData();
  const [mode, setMode] = useState("sister");

  const tumorIds = useMemo(() => {
    const normal = new Set(cells.filter((c) => isNormalClone(c.clone_id)).map((c) => `${c.cell_id}`));
    const ids = treeLayout?.leaves?.length ? treeLayout.leaves.map(String) : cells.map((c) => `${c.cell_id}`);
    return ids.filter((id) => !normal.has(id));
  }, [cells, treeLayout]);
  const cloneOfId = useMemo(() => new Map(cells.map((c) => [`${c.cell_id}`, c.clone_id])), [cells]);
  const normalIds = useMemo(() => new Set(cells.filter((c) => isNormalClone(c.clone_id)).map((c) => `${c.cell_id}`)), [cells]);

  const drivers = useMemo(() => subclonalDrivers(events || [], tumorIds, treeLayout), [events, tumorIds, treeLayout]);
  const driver = drivers.find((d) => d.key === driverFocus) || drivers[0] || null;
  useEffect(() => {
    if (driver && driver.key !== driverFocus) dispatch(singleCellActions.updateDriverFocus(driver.key));
  }, [driver, driverFocus, dispatch]);

  const comparator = useMemo(
    () => (driver ? comparatorCells(mode, driver.carriers, tumorIds, treeLayout, { minCells: Math.min(10, Math.max(5, Math.round(driver.carriers.length / 2))) }) : null),
    [driver, mode, tumorIds, treeLayout]
  );
  const carriers = driver?.carriers || [];
  const others = comparator?.cells || [];

  // per-cell attributes for the balance table: plate from the id, the rest from the RNA metadata
  const rnaCellOf = useMemo(() => {
    const m = new Map();
    (rna.summary?.cells || []).forEach((c) => c.cell_id && m.set(`${c.cell_id}`, c));
    return m;
  }, [rna.summary]);
  const rnaFields = useMemo(() => new Set((rna.summary?.fields || []).map((f) => f.name)), [rna.summary]);
  const balanceAttrs = ["plate", ...["Region", "Region_Annotation", "state", "Phase"].filter((f) => rnaFields.has(f))];
  const balance = useMemo(
    () =>
      driver
        ? balanceTable(carriers, others, balanceAttrs, (id, attr) => (attr === "plate" ? plateOf(id) : rnaCellOf.get(id)?.[attr] ?? null))
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [driver, carriers, others, rnaCellOf, balanceAttrs.join("|")]
  );
  const plateRow = balance.find((b) => b.attr === "plate");
  const carrierOnlyPlates = plateRow?.onlyA || [];

  if (!drivers.length) {
    return <Empty description={t("components.single-cell.drivers.none")} />;
  }

  const groupOf = (id) => {
    if (normalIds.has(id)) return "n";
    if (driver && carriers.includes(id)) return "a";
    if (others.includes(id)) return "b";
    return "o";
  };
  const clade =
    driver?.fit?.node != null && treeLayout?.nodes?.[driver.fit.node]
      ? { first: treeLayout.nodes[driver.fit.node].firstLeaf, last: treeLayout.nodes[driver.fit.node].lastLeaf }
      : null;
  const withRna = (ids) => ids.filter((id) => rna.rowOfId?.has(id)).length;
  const label = driver?.label || "";
  const useAsGroups = () => {
    const pid = patient?.caseReportId;
    dispatch(scaActions.setGroup("A", [{ patient: pid, cells: carriers }], t("components.single-cell.drivers.carriers-of", { label })));
    dispatch(scaActions.setGroup("B", [{ patient: pid, cells: others }], t(`components.single-cell.drivers.comparator-${mode}`)));
  };

  const driverOptions = drivers.map((d) => ({
    value: d.key,
    label: (
      <Space size={6}>
        <Text strong>{d.label}</Text>
        <Text type="secondary">
          {t("components.single-cell.drivers.option", { n: d.carriers.length, total: tumorIds.length, pct: pct(d.fraction) })}
        </Text>
        {Number.isFinite(d.fit?.score) && <Tag color={d.fit.score >= 0.8 ? "green" : d.fit.score >= 0.5 ? "gold" : "default"}>{`fit ${d.fit.score.toFixed(2)}`}</Tag>}
        {d.tier <= 3 && <Tag>{`tier ${d.tier}`}</Tag>}
      </Space>
    ),
    search: d.label,
  }));

  const balanceColumns = [
    { title: t("components.single-cell.drivers.attribute"), dataIndex: "attr", key: "attr", width: 150, render: (a) => (a === "plate" ? t("components.single-cell.drivers.plate") : fieldLabel(a)) },
    {
      title: (
        <span>
          <span style={{ color: CARRIER_COLOR }}>■</span> {t("components.single-cell.drivers.carriers")} / <span style={{ color: COMPARATOR_COLOR }}>■</span>{" "}
          {t("components.single-cell.drivers.comparator")}
        </span>
      ),
      key: "levels",
      render: (_, r) => (
        <Space size={[4, 4]} wrap>
          {r.levels.map((l) => (
            <Tag key={l.level} color={r.onlyA.includes(l.level) ? "orange" : undefined} style={{ marginInlineEnd: 0 }}>
              {`${l.level}: ${l.a} / ${l.b}`}
            </Tag>
          ))}
        </Space>
      ),
    },
    { title: "p", dataIndex: "p", key: "p", width: 110, render: (p) => (Number.isFinite(p) ? formatP(p) : "–") },
  ];

  return (
    <Row gutter={SC_GUTTER}>
      <Col span={24}>
        <Card
          size="small"
          title={
            <Space>
              <NodeIndexOutlined />
              <span>{t("components.single-cell.drivers.title")}</span>
            </Space>
          }
        >
          <Space direction="vertical" size={8} style={{ width: "100%" }}>
            <HintLine text={t("components.single-cell.drivers.hint")} />
            <Space wrap size={[12, 8]} align="center">
              <Text>{t("components.single-cell.drivers.driver")}</Text>
              <Select
                showSearch
                style={{ minWidth: 420 }}
                value={driver?.key}
                options={driverOptions}
                optionFilterProp="search"
                onChange={(k) => dispatch(singleCellActions.updateDriverFocus(k))}
              />
              <Text>{t("components.single-cell.drivers.compare-with")}</Text>
              <Segmented
                value={mode}
                onChange={setMode}
                options={COMPARATOR_MODES.map((m) => ({ value: m, label: t(`components.single-cell.drivers.mode-${m}`) }))}
              />
            </Space>
            <TreeStrip
              leaves={treeLayout?.leaves || []}
              groupOf={groupOf}
              clade={clade}
              groupLabel={(g) => ({ a: t("components.single-cell.drivers.carriers"), b: t("components.single-cell.drivers.comparator"), o: "other tumor cell", n: "normal cell" }[g] || g)}
              cloneOf={(id) => cloneOfId.get(id)}
              onSelect={(ids) => dispatch(singleCellActions.updateSelection(ids))}
            />
            <Space wrap size={[16, 4]} style={{ fontSize: TYPE.tick }}>
              <span>
                <span style={{ color: CARRIER_COLOR }}>■</span>{" "}
                {t("components.single-cell.drivers.legend-carriers", { n: carriers.length, rna: withRna(carriers) })}
              </span>
              <span>
                <span style={{ color: COMPARATOR_COLOR }}>■</span>{" "}
                {t("components.single-cell.drivers.legend-comparator", { n: others.length, rna: withRna(others) })}
              </span>
              <span>
                <span style={{ color: OTHER_COLOR }}>■</span> {t("components.single-cell.drivers.legend-other")}
              </span>
              {clade && <Text type="secondary">{t("components.single-cell.drivers.legend-clade", { inClade: driver.fit.inClade, clade: driver.fit.clade, fit: driver.fit.score.toFixed(2) })}</Text>}
            </Space>
            {driver && driver.fit && driver.fit.score < 0.5 && (
              <Alert type="warning" showIcon icon={<WarningOutlined />} message={t("components.single-cell.drivers.low-fit")} />
            )}
            {carrierOnlyPlates.length > 0 && (
              <Alert type="info" showIcon message={t("components.single-cell.drivers.plate-confound", { plates: carrierOnlyPlates.join(", ") })} />
            )}
            <Table size="small" pagination={false} rowKey="attr" columns={balanceColumns} dataSource={balance} />
            <Space wrap>
              <Button
                size="small"
                icon={<AimOutlined />}
                onClick={() => {
                  dispatch(singleCellActions.updateSelection(carriers));
                  dispatch(settingsActions.updateTab("7"));
                }}
              >
                {t("components.single-cell.drivers.select-carriers")}
              </Button>
              <Tooltip title={t("components.single-cell.drivers.use-groups-tip")}>
                <Button size="small" icon={<ExperimentOutlined />} onClick={useAsGroups}>
                  {t("components.single-cell.drivers.use-groups")}
                </Button>
              </Tooltip>
            </Space>
          </Space>
        </Card>
      </Col>
      {driver && (
        <>
          <Col span={24}>
            <DriverGenomeCard driver={driver} carriers={carriers} others={others} />
          </Col>
          <Col xs={24} xxl={14}>
            <DriverExpressionCard driver={driver} carriers={carriers} others={others} rna={rna} />
          </Col>
          <Col xs={24} xxl={10}>
            <DriverPhenotypeCard carriers={carriers} others={others} rna={rna} />
            <DriverEvidenceCard driver={driver} carriers={carriers} others={others} rna={rna} />
          </Col>
        </>
      )}
    </Row>
  );
}
