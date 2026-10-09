import React, { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Button, Card, Col, Empty, Row, Space, Table, Typography } from "antd";
import { ZoomInOutlined } from "@ant-design/icons";
import settingsActions from "../../../redux/settings/actions";
import useContainerWidth from "../useContainerWidth";
import usePlotTheme from "../usePlotTheme";
import HintLine from "../hintLine";
import { SC_GUTTER_INNER } from "../density";
import { TYPE } from "../../../helpers/singleCell/plotTheme";
import { formatP } from "../../../helpers/singleCell/tests";
import { cnContrast, eventContrast } from "../../../helpers/singleCell/driverContrast";
import { CARRIER_COLOR, COMPARATOR_COLOR } from "./useDriverEvidence";

const { Text } = Typography;
const STEP = 1e6;
const Y_CAP = 8;

/** Chromosome and local position of a global coordinate. */
export function toLocal(chromoBins, g) {
  const entry = Object.entries(chromoBins || {}).find(([, v]) => g >= v.startPlace && g <= v.endPlace);
  return entry ? { chrom: entry[0], pos: Math.round(g - entry[1].startPlace) } : null;
}
const mb = (bp) => `${(bp / 1e6).toFixed(1)} Mb`;

/** Mean CN of carriers and comparator along the genome; hover reads both values out, click zooms the genome view there. */
function CnLines({ contrast, chromoBins, genomeLength, onZoom }) {
  const [ref, width] = useContainerWidth(800);
  const theme = usePlotTheme();
  const [hover, setHover] = useState(null); // index into contrast.positions
  const M = { left: 34, right: 8, top: 8, bottom: 22 };
  const H = 150;
  const plotW = Math.max(width - M.left - M.right, 10);
  const plotH = H - M.top - M.bottom;
  // y capped at CN 8 so amplicons (tens of copies) do not flatten everything else; clipped values hit the top edge
  const top = Math.max(...contrast.meanA.filter(Number.isFinite), ...contrast.meanB.filter(Number.isFinite), 0);
  const ymax = Math.min(Y_CAP, Math.max(4, Math.ceil(top)));
  const clipped = top > ymax;
  const x = (g) => M.left + (g / genomeLength) * plotW;
  const y = (v) => M.top + plotH - (Math.min(v, ymax) / ymax) * plotH;
  const path = (vals) => {
    let d = "";
    let open = false;
    contrast.positions.forEach((g, i) => {
      const v = vals[i];
      if (!Number.isFinite(v)) {
        open = false;
        return;
      }
      d += `${open ? "L" : "M"}${x(g).toFixed(1)},${y(v).toFixed(1)}`;
      open = true;
    });
    return d;
  };
  const chroms = Object.entries(chromoBins || {}).filter(([, v]) => v.endPlace <= genomeLength + 1);
  const ticks = Array.from({ length: ymax + 1 }, (_, k) => k).filter((k) => ymax <= 6 || k % 2 === 0);
  const tickLabel = (k) => (clipped && k === ymax ? `≥${k}` : `${k}`);
  const indexAt = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const g = ((e.clientX - r.left - M.left) / plotW) * genomeLength;
    if (g < 0 || g > genomeLength) return null;
    const i = Math.round((g - contrast.positions[0]) / STEP);
    return Math.max(0, Math.min(contrast.positions.length - 1, i));
  };
  const region = hover != null ? contrast.regions.find((r) => contrast.positions[hover] >= r.start && contrast.positions[hover] <= r.end) : null;
  const hx = hover != null ? x(contrast.positions[hover]) : null;
  const where = hover != null ? toLocal(chromoBins, contrast.positions[hover]) : null;
  const fmt = (v) => (Number.isFinite(v) ? v.toFixed(2) : "–");
  return (
    <div ref={ref} style={{ width: "100%", position: "relative" }}>
      <svg
        width={width}
        height={H}
        role="img"
        aria-label="mean copy number of carriers and comparator along the genome"
        style={{ cursor: "zoom-in" }}
        onMouseMove={(e) => setHover(indexAt(e))}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          const i = indexAt(e);
          if (i == null) return;
          // a shaded region zooms to the region, elsewhere to 10 Mb around the position
          const g = contrast.positions[i];
          const r = contrast.regions.find((q) => g >= q.start && g <= q.end);
          if (r) onZoom(r.start - STEP / 2, r.end + STEP / 2);
          else onZoom(g - 5e6, g + 5e6);
        }}
      >
        {contrast.regions.map((r, i) => (
          <rect key={i} x={x(r.start - STEP / 2)} width={Math.max(x(r.end + STEP / 2) - x(r.start - STEP / 2), 2)} y={M.top} height={plotH} fill={theme.hoverFill} />
        ))}
        {ticks.map((k) => (
          <g key={k}>
            <line x1={M.left} x2={M.left + plotW} y1={y(k)} y2={y(k)} stroke={theme.grid} />
            <text x={M.left - 6} y={y(k) + 4} textAnchor="end" fontSize={TYPE.tick} fill={theme.muted}>
              {tickLabel(k)}
            </text>
          </g>
        ))}
        {chroms.map(([c, v], i) => (
          <g key={c}>
            {i > 0 && <line x1={x(v.startPlace)} x2={x(v.startPlace)} y1={M.top} y2={M.top + plotH} stroke={theme.border} />}
            {(v.endPlace - v.startPlace) / genomeLength > 0.012 && (
              <text x={x((v.startPlace + v.endPlace) / 2)} y={H - 6} textAnchor="middle" fontSize={TYPE.tick} fill={theme.muted}>
                {c}
              </text>
            )}
          </g>
        ))}
        {region && (
          <rect x={x(region.start - STEP / 2)} width={Math.max(x(region.end + STEP / 2) - x(region.start - STEP / 2), 2)} y={M.top} height={plotH} fill="none" stroke={theme.hover} pointerEvents="none" />
        )}
        <path d={path(contrast.meanB)} fill="none" stroke={COMPARATOR_COLOR} strokeWidth={1.4} />
        <path d={path(contrast.meanA)} fill="none" stroke={CARRIER_COLOR} strokeWidth={1.4} />
        {hover != null && (
          <g pointerEvents="none">
            <line x1={hx} x2={hx} y1={M.top} y2={M.top + plotH} stroke={theme.textSecondary} strokeDasharray="3 3" />
            {Number.isFinite(contrast.meanA[hover]) && <circle cx={hx} cy={y(contrast.meanA[hover])} r={3.5} fill={CARRIER_COLOR} />}
            {Number.isFinite(contrast.meanB[hover]) && <circle cx={hx} cy={y(contrast.meanB[hover])} r={3.5} fill={COMPARATOR_COLOR} />}
          </g>
        )}
        <text x={4} y={M.top + plotH / 2} fontSize={TYPE.tick} fill={theme.textSecondary} transform={`rotate(-90 10 ${M.top + plotH / 2})`} textAnchor="middle">
          CN
        </text>
      </svg>
      {hover != null && where && (
        <div
          style={{
            position: "absolute",
            left: Math.min(Math.max(hx + 10, 0), Math.max(width - 260, 0)),
            top: M.top,
            pointerEvents: "none",
            background: theme.raised,
            color: theme.text,
            border: `1px solid ${theme.border}`,
            borderRadius: 4,
            padding: "2px 8px",
            fontSize: TYPE.tick,
            lineHeight: 1.5,
            whiteSpace: "nowrap",
            boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
          }}
        >
          <div style={{ fontWeight: 600 }}>{`${where.chrom}:${mb(where.pos)}`}</div>
          <div style={{ color: CARRIER_COLOR }}>{`carriers ${fmt(contrast.meanA[hover])}`}</div>
          <div style={{ color: COMPARATOR_COLOR }}>{`comparator ${fmt(contrast.meanB[hover])}`}</div>
          <div style={{ color: theme.muted }}>{region ? `region Δ ${region.diff > 0 ? "+" : ""}${region.diff.toFixed(2)} · click to zoom` : "click to zoom (10 Mb)"}</div>
        </div>
      )}
    </div>
  );
}

/**
 * What else separates carriers from the comparator on the DNA: mean copy number
 * of each group along the genome (regions differing by >= 0.5 copies shaded)
 * and other events whose carrier fraction differs (co-travelling events that
 * could explain an expression difference as well as the driver).
 */
export default function DriverGenomeCard({ driver, carriers, others }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const cn = useSelector((s) => s.SingleCell.cn);
  const events = useSelector((s) => s.FilteredEvents.filteredEvents);
  const { chromoBins, genomeLength } = useSelector((s) => s.Settings);
  const cnData = cn.status === "ok" ? cn.data : null;
  const positions = useMemo(() => {
    const out = [];
    for (let g = STEP / 2; g < (genomeLength || 0); g += STEP) out.push(g);
    return out;
  }, [genomeLength]);
  const contrast = useMemo(() => (cnData && positions.length ? cnContrast(cnData, carriers, others, positions) : null), [cnData, carriers, others, positions]);
  const coEvents = useMemo(() => eventContrast(events || [], carriers, others, driver.key), [events, carriers, others, driver.key]);

  const zoom = (start, end) => {
    dispatch(settingsActions.updateDomains([[Math.max(1, Math.round(start - 2e6)), Math.round(Math.min(genomeLength, end + 2e6))]]));
    dispatch(settingsActions.updateTab("7"));
  };
  const regionRows = (contrast?.regions || [])
    .map((r, i) => {
      const a = toLocal(chromoBins, r.start - STEP / 2);
      const b = toLocal(chromoBins, r.end + STEP / 2);
      return { key: i, ...r, where: a ? `${a.chrom}:${mb(Math.max(a.pos, 0))}–${b && b.chrom === a.chrom ? mb(b.pos) : "end"}` : "?" };
    })
    .sort((p, q) => Math.abs(q.diff) * (q.end - q.start + STEP) - Math.abs(p.diff) * (p.end - p.start + STEP));

  return (
    <Card size="small" title={t("components.single-cell.drivers.genome-title")}>
      <Space direction="vertical" size={8} style={{ width: "100%" }}>
        <HintLine text={t("components.single-cell.drivers.genome-hint")} />
        {contrast ? (
          <CnLines contrast={contrast} chromoBins={chromoBins} genomeLength={genomeLength} onZoom={(a, b) => zoom(a, b)} />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("components.single-cell.drivers.no-cn")} />
        )}
        <Row gutter={SC_GUTTER_INNER}>
          <Col xs={24} xl={12}>
            <Text strong>{t("components.single-cell.drivers.cn-regions", { n: regionRows.length })}</Text>
            <Table
              size="small"
              rowKey="key"
              pagination={regionRows.length > 8 ? { pageSize: 8, size: "small" } : false}
              dataSource={regionRows}
              locale={{ emptyText: t("components.single-cell.drivers.no-cn-regions") }}
              columns={[
                { title: t("components.single-cell.drivers.region"), dataIndex: "where", key: "where" },
                { title: t("components.single-cell.drivers.carriers"), dataIndex: "meanA", key: "a", align: "right", render: (v) => v.toFixed(2) },
                { title: t("components.single-cell.drivers.comparator"), dataIndex: "meanB", key: "b", align: "right", render: (v) => v.toFixed(2) },
                { title: "Δ CN", dataIndex: "diff", key: "d", align: "right", render: (v) => `${v > 0 ? "+" : ""}${v.toFixed(2)}` },
                {
                  title: "",
                  key: "zoom",
                  width: 40,
                  render: (_, r) => <Button size="small" type="text" icon={<ZoomInOutlined />} onClick={() => zoom(r.start - STEP / 2, r.end + STEP / 2)} aria-label="zoom" />,
                },
              ]}
            />
          </Col>
          <Col xs={24} xl={12}>
            <Text strong>{t("components.single-cell.drivers.co-events", { n: coEvents.length })}</Text>
            <Table
              size="small"
              rowKey="key"
              pagination={coEvents.length > 8 ? { pageSize: 8, size: "small" } : false}
              dataSource={coEvents}
              locale={{ emptyText: t("components.single-cell.drivers.no-co-events") }}
              columns={[
                { title: t("components.single-cell.drivers.event"), dataIndex: "label", key: "label" },
                { title: t("components.single-cell.drivers.carriers"), key: "a", align: "right", render: (_, r) => `${r.a} (${Math.round(r.fracA * 100)}%)` },
                { title: t("components.single-cell.drivers.comparator"), key: "b", align: "right", render: (_, r) => `${r.b} (${Math.round(r.fracB * 100)}%)` },
                { title: "p", dataIndex: "p", key: "p", align: "right", render: (p) => formatP(p) },
              ]}
            />
          </Col>
        </Row>
      </Space>
    </Card>
  );
}
