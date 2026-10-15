import React, { useMemo, useState } from "react";
import { useDispatch } from "react-redux";
import { useTranslation } from "react-i18next";
import { Alert, Button, Input, Popover, Segmented, Select, Space, Switch, Table, Tag, Tooltip, Typography } from "antd";
import { QuestionCircleOutlined } from "@ant-design/icons";
import singleCellActions from "../../../redux/singleCell/actions";
import settingsActions from "../../../redux/settings/actions";
import CellIgvPanel from "../cellIgvPanel";
import HintLine from "../hintLine";
import {
  EVENT_TYPES,
  EVENT_TYPE_LABEL,
  FRAME_LABEL,
  REGION_LABEL,
  bestLink,
  cloneEnriched,
  cloneText,
  eventCounts,
  filterSpliceEvents,
  fmtP,
  linkCarrierDnaCells,
  linkText,
  psiText,
  recurrenceText,
  snvLinkIgvView,
  sortSpliceEvents,
  usageText,
} from "../../../helpers/singleCell/spliceEventTable";

const { Text } = Typography;
const k = "components.single-cell.splicing";
const PAGE_SIZE = 10;
const TYPE_COLOR = { exon_skip: "volcano", alt_5: "purple", alt_3: "purple", novel_junction: "magenta", annotated_alt: "default" };
const pct = (p) => (Number.isFinite(p) ? `${Math.round(100 * p)}%` : "–");

/** Column title with a help tooltip. */
function Th({ label, help }) {
  return (
    <span>
      {label}{" "}
      <Tooltip title={help} overlayStyle={{ maxWidth: 440 }}>
        <QuestionCircleOutlined style={{ color: "rgba(0,0,0,0.45)" }} />
      </Tooltip>
    </span>
  );
}

/** Region / position tag of a linked SNV. */
function RegionTag({ link }) {
  const color = link.canonical ? "red" : link.region === "motif" ? "orange" : "default";
  return (
    <Tooltip title={REGION_LABEL[link.region] || link.region}>
      <Tag color={color} bordered={false} style={{ marginInlineEnd: 4 }}>
        {link.canonical ? "canonical" : link.region === "motif" ? "motif" : link.region === "shifted_segment" ? "shifted" : "near"}
      </Tag>
    </Tooltip>
  );
}

const linkLabel = (l) => `chr${l.chromosome}:${(l.position ?? 0).toLocaleString("en-US")} ${l.ref}>${l.alt}`;

/** One linked SNV as a clickable line: paints the SNV on the tree, selects its carriers, opens IGV. */
function LinkLine({ event, link, onPick, active }) {
  const { t } = useTranslation("common");
  const tested = Number.isFinite(link.p);
  return (
    <div style={{ lineHeight: 1.7, fontWeight: active ? 600 : 400 }}>
      <RegionTag link={link} />
      <Typography.Link onClick={() => onPick(event, link)}>{linkLabel(link)}</Typography.Link>
      <Text type="secondary" style={{ fontSize: 12 }}>
        {` · ${link.distance} bp ${link.site || ""} · `}
        {tested ? `${link.nCarriers}/${link.nNoncarriers} cells · PSI ${pct(link.psiCarriers)} vs ${pct(link.psiNoncarriers)} · p ${fmtP(link.p)}` : t(`${k}.ev-snv-untested`)}
        {link.consequence ? ` · ${link.consequence}` : ""}
      </Text>
    </div>
  );
}

/**
 * Event table of the splicing card: one row per spliced junction with a plain-language summary,
 * explicit units and header tooltips, a Recommended / All switch and a Linked SNV column.
 * onSashimi(event) opens the event's intron cluster in the sashimi plot below.
 */
export default function SpliceEventsTable({ events = [], onSashimi, cellMap = {}, spliceReads = {}, patientId = null }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const [mode, setMode] = useState("recommended");
  const [query, setQuery] = useState("");
  const [eventType, setEventType] = useState("all");
  const [linkedOnly, setLinkedOnly] = useState(false);
  const [novelOnly, setNovelOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [active, setActive] = useState(null); // { eventId, variantId }
  const counts = useMemo(() => eventCounts(events), [events]);
  const rows = useMemo(() => sortSpliceEvents(filterSpliceEvents(events, { mode, query, eventType, linkedOnly, novelOnly })), [events, mode, query, eventType, linkedOnly, novelOnly]);
  const activeEvent = events.find((e) => e.id === active?.eventId);
  const activeLink = activeEvent?.snvLinks.find((l) => l.variantId === active?.variantId);
  const igvView = useMemo(() => (activeEvent && activeLink ? snvLinkIgvView(activeEvent, activeLink, { cellMap, spliceReads, patientId }) : null), [activeEvent, activeLink, cellMap, spliceReads, patientId]);

  const pickLink = (event, link) => {
    setActive({ eventId: event.id, variantId: link.variantId });
    // the existing SNV paint / selection: the site on the heatmap and the carriers selected
    dispatch(singleCellActions.updateLayout({ snvSiteIds: [link.variantId], snvCategories: null, snvCellphyOnly: false, snvDriversOnly: false }));
    const carriers = linkCarrierDnaCells(link, cellMap);
    if (carriers.length) dispatch(singleCellActions.updateSelection(carriers));
  };
  const toTree = () => dispatch(settingsActions.updateTab("7"));
  const reset = (fn) => (v) => {
    fn(v);
    setPage(1);
  };

  if (!events.length) return <Text type="secondary">{t(`${k}.events-none`)}</Text>;
  const columns = [
    {
      title: <Th label={t(`${k}.ev-col-event`)} help={t(`${k}.ev-col-event-help`)} />,
      key: "event",
      width: 380,
      render: (_, e) => (
        <div style={{ whiteSpace: "normal" }}>
          <Typography.Link onClick={() => onSashimi(e)} style={{ fontSize: 13 }}>
            {e.summary}
          </Typography.Link>
          {e.flags.length > 0 && (
            <div>
              <Text type="warning" style={{ fontSize: 11.5 }}>{`${t(`${k}.ev-flags`)}: ${e.flags.join("; ")}`}</Text>
            </div>
          )}
          {e.recommended && e.reasons.length > 0 && (
            <div>
              <Text type="secondary" style={{ fontSize: 11.5 }}>{`${t(`${k}.ev-reasons`)}: ${e.reasons.join(", ")}`}</Text>
            </div>
          )}
        </div>
      ),
    },
    {
      title: <Th label={t(`${k}.ev-col-type`)} help={t(`${k}.ev-col-type-help`)} />,
      dataIndex: "eventType",
      render: (v) => <Tag color={TYPE_COLOR[v]}>{EVENT_TYPE_LABEL[v]}</Tag>,
    },
    {
      title: <Th label={t(`${k}.ev-col-annot`)} help={t(`${k}.ev-col-annot-help`)} />,
      dataIndex: "annotated",
      render: (v) => <Tag color={v ? "default" : "magenta"}>{v ? "annotated" : "novel"}</Tag>,
    },
    {
      title: <Th label={t(`${k}.ev-col-psi`)} help={t(`${k}.ev-col-psi-help`)} />,
      key: "psi",
      align: "right",
      sorter: (a, b) => (a.psi || 0) - (b.psi || 0),
      render: (_, e) => psiText(e),
    },
    {
      title: <Th label={t(`${k}.ev-col-cells`)} help={t(`${k}.ev-col-cells-help`)} />,
      key: "cells",
      align: "right",
      sorter: (a, b) => a.cellsUsing - b.cellsUsing,
      render: (_, e) => usageText(e),
    },
    {
      title: <Th label={t(`${k}.ev-col-clone`)} help={t(`${k}.ev-col-clone-help`)} />,
      key: "clone",
      render: (_, e) => <Text type={cloneEnriched(e) ? undefined : "secondary"} strong={cloneEnriched(e)} style={{ fontSize: 12.5 }}>{cloneText(e)}</Text>,
    },
    {
      title: <Th label={t(`${k}.ev-col-frame`)} help={t(`${k}.ev-col-frame-help`)} />,
      dataIndex: "frame",
      render: (v) => <Tag color={v === "frameshift" ? "red" : undefined}>{FRAME_LABEL[v] || v}</Tag>,
    },
    {
      title: <Th label={t(`${k}.ev-col-gene`)} help={t(`${k}.ev-col-gene-help`)} />,
      dataIndex: "cancerGene",
      render: (v, e) => (v ? <Tag color="gold">{e.gene}</Tag> : <Text type="secondary">–</Text>),
    },
    {
      title: <Th label={t(`${k}.ev-col-recur`)} help={t(`${k}.ev-col-recur-help`)} />,
      key: "recur",
      render: (_, e) => <Text style={{ fontSize: 12.5 }}>{recurrenceText(e)}</Text>,
    },
    {
      title: <Th label={t(`${k}.ev-col-snv`)} help={t(`${k}.ev-col-snv-help`)} />,
      key: "snv",
      width: 340,
      render: (_, e) => {
        const best = bestLink(e);
        if (!best) return <Text type="secondary">{t(`${k}.ev-snv-none`)}</Text>;
        return (
          <div style={{ whiteSpace: "normal" }}>
            <LinkLine event={e} link={best} onPick={pickLink} active={active?.eventId === e.id && active?.variantId === best.variantId} />
            {e.snvLinks.length > 1 && (
              <Popover
                trigger="click"
                title={t(`${k}.ev-snv-title`, { gene: e.gene, summary: "" })}
                content={
                  <div style={{ maxWidth: 560 }}>
                    {e.snvLinks.map((l) => (
                      <LinkLine key={l.variantId} event={e} link={l} onPick={pickLink} active={active?.eventId === e.id && active?.variantId === l.variantId} />
                    ))}
                  </div>
                }
              >
                <Typography.Link style={{ fontSize: 12 }}>{`+${e.snvLinks.length - 1} more`}</Typography.Link>
              </Popover>
            )}
          </div>
        );
      },
    },
  ];
  return (
    <Space direction="vertical" size={8} style={{ width: "100%" }}>
      <Space wrap>
        <Text strong>{t(`${k}.events-title`)}</Text>
        <HintLine inline text={t(`${k}.events-help`)} />
        <Segmented
          size="small"
          value={mode}
          onChange={reset(setMode)}
          options={[
            { value: "recommended", label: `${t(`${k}.events-mode-recommended`)} (${counts.recommended})` },
            { value: "all", label: `${t(`${k}.events-mode-all`)} (${counts.all})` },
          ]}
        />
        <Input.Search size="small" allowClear placeholder={t(`${k}.events-search`)} style={{ width: 170 }} onSearch={reset(setQuery)} onChange={(e) => !e.target.value && reset(setQuery)("")} />
        <Select
          size="small"
          style={{ width: 160 }}
          value={eventType}
          onChange={reset(setEventType)}
          options={[{ value: "all", label: t(`${k}.events-type-all`) }, ...EVENT_TYPES.map((v) => ({ value: v, label: EVENT_TYPE_LABEL[v] }))]}
        />
        <Switch size="small" checked={novelOnly} onChange={reset(setNovelOnly)} />
        <Text>{t(`${k}.events-novel-only`)}</Text>
        <Switch size="small" checked={linkedOnly} onChange={reset(setLinkedOnly)} />
        <Text>{t(`${k}.events-linked-only`)}</Text>
      </Space>
      <Text type="secondary" style={{ fontSize: 12 }}>
        {t(`${k}.events-counts`, { shown: rows.length, all: counts.all, recommended: counts.recommended, linked: counts.linked })}
      </Text>
      <Table
        size="small"
        rowKey="id"
        dataSource={rows}
        locale={{ emptyText: t(`${k}.events-none-shown`) }}
        pagination={{ pageSize: PAGE_SIZE, size: "small", showSizeChanger: false, current: page, onChange: setPage }}
        scroll={{ x: "max-content" }}
        columns={columns}
        rowClassName={(e) => (active?.eventId === e.id ? "ant-table-row-selected" : "")}
      />
      {activeEvent && activeLink && (
        <Space direction="vertical" size={6} style={{ width: "100%" }}>
          <Alert
            type="info"
            showIcon
            message={t(`${k}.ev-snv-painted`, { id: activeLink.variantId })}
            description={linkText(activeLink)}
            action={
              <Space direction="vertical" size={4}>
                <Button size="small" type="primary" onClick={toTree}>
                  {t(`${k}.ev-snv-paint`)}
                </Button>
                <Button size="small" onClick={() => onSashimi(activeEvent)}>
                  {t(`${k}.ev-open-sashimi`)}
                </Button>
              </Space>
            }
          />
          {igvView ? <CellIgvPanel view={igvView} embedded /> : <Text type="secondary">{t(`${k}.findings-igv-none`)}</Text>}
        </Space>
      )}
    </Space>
  );
}
