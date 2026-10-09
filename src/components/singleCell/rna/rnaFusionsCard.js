import React, { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Alert, Button, Card, Empty, Input, InputNumber, Select, Space, Switch, Table, Tag, Tooltip, Typography } from "antd";
import { NodeIndexOutlined } from "@ant-design/icons";
import HintLine from "../hintLine";
import useTreeView from "../useTreeView";
import useContainerWidth from "../useContainerWidth";
import CellStripCanvas from "./cellStripCanvas";
import RnaFusionModal, { FusionLabel } from "./rnaFusionModal";
import filteredEventsActions from "../../../redux/filteredEvents/actions";
import { filterFusions, fusionStrip, isNonProductive, matchDnaEvent, rnaCellMaps } from "../../../helpers/singleCell/rnaFusions";
import { NO_READS_COLOR, NO_RNA_COLOR, readsColor } from "../../../helpers/singleCell/rnaColors";

const { Text } = Typography;
const k = "components.single-cell.rna-fusions";
const STRIP_H = 14;
const CONFIDENCES = ["low", "medium", "high"];
const confColor = { high: "green", medium: "gold", low: "default" };

/** Carrier cells of one fusion on the tree order (canvas, one column per cell). */
function FusionStrip({ fusion, order, rnaOfCell, width }) {
  const { t } = useTranslation("common");
  const strip = useMemo(() => fusionStrip(fusion, order, rnaOfCell), [fusion, order, rnaOfCell]);
  const n = order.length + strip.rnaOnly.length;
  const colorOf = (i) => {
    const v = i < order.length ? strip.values[i] : strip.rnaOnly[i - order.length];
    if (v < 0) return NO_RNA_COLOR;
    if (v === 0) return NO_READS_COLOR;
    return readsColor(v, strip.max);
  };
  const titleOf = (i) => {
    if (i >= order.length) return t(`${k}.strip-rna-only`, { reads: strip.rnaOnly[i - order.length] });
    const v = strip.values[i];
    const cell = order[i];
    return v < 0 ? t(`${k}.strip-cell-no-rna`, { cell }) : v === 0 ? t(`${k}.strip-cell-none`, { cell }) : t(`${k}.strip-cell`, { cell, reads: v });
  };
  return <CellStripCanvas n={n} width={width} height={STRIP_H} colorOf={colorOf} titleOf={titleOf} gaps={strip.rnaOnly.length ? [order.length] : []} />;
}

/**
 * RNA fusions of the patient (rna/fusions.json: STAR chimeric + Arriba per
 * cell, merged in the back end): filterable table with each fusion's
 * carrier cells along the phylogeny, DNA-match badges opening the DNA event,
 * and a popup with the cells and their reads in IGV.
 */
export default function RnaFusionsCard({ summary }) {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const source = useSelector((s) => s.SingleCell.rnaFusions);
  const events = useSelector((s) => s.FilteredEvents.filteredEvents);
  const { order } = useTreeView();
  const [ref, width] = useContainerWidth(1000);
  const [minCells, setMinCells] = useState(2);
  const [confidence, setConfidence] = useState("low");
  const [hideReadThrough, setHideReadThrough] = useState(true);
  const [keepDna, setKeepDna] = useState(true);
  const [knownOnly, setKnownOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(null);
  const data = source?.status === "ok" ? source.data : null;
  const { rnaOf } = useMemo(() => rnaCellMaps(data?.fusions || [], summary?.cells || []), [data, summary]);
  const shown = useMemo(
    () => filterFusions(data?.fusions || [], { minCells, confidence, hideReadThrough, keepDnaMatched: keepDna, knownOnly, query }),
    [data, minCells, confidence, hideReadThrough, keepDna, knownOnly, query]
  );
  const stripW = Math.max(160, Math.min(420, Math.round(width * 0.3)));

  const title = (
    <Space>
      <NodeIndexOutlined />
      <span>{t(`${k}.title`)}</span>
      <HintLine inline provenance="rnaFusions" text={t(`${k}.help`)} />
    </Space>
  );
  if (!data) {
    return (
      <Card size="small" title={title}>
        {source?.status === "error" ? (
          <Alert type="warning" showIcon message={t(`${k}.error`, { error: source.error?.message || `${source.error}` })} />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t(`${k}.none`)} />
        )}
      </Card>
    );
  }

  const openDna = (fusion) => {
    const record = matchDnaEvent(fusion, events);
    if (record) dispatch(filteredEventsActions.selectFilteredEvent(record, "reads"));
  };
  const columns = [
    {
      title: t(`${k}.col-fusion`),
      key: "fusion",
      fixed: "left",
      sorter: (a, b) => a.label.localeCompare(b.label),
      render: (_, f) => (
        <Space size={4} style={{ opacity: isNonProductive(f) ? 0.55 : 1 }}>
          <Button type="link" size="small" style={{ padding: 0, height: "auto", fontStyle: isNonProductive(f) ? "italic" : undefined }} onClick={() => setOpen(f)}>
            <FusionLabel fusion={f} />
          </Button>
          {f.known && (
            <Tooltip title={t(`${k}.known-tip`)}>
              <Tag color="purple">{t(`${k}.known`)}</Tag>
            </Tooltip>
          )}
        </Space>
      ),
    },
    { title: t(`${k}.col-frame`), dataIndex: "reading_frame", render: (v) => (v && v !== "." ? v : "–"), sorter: (a, b) => `${a.reading_frame}`.localeCompare(`${b.reading_frame}`) },
    {
      title: t(`${k}.col-confidence`),
      dataIndex: "confidence",
      sorter: (a, b) => CONFIDENCES.indexOf(a.confidence) - CONFIDENCES.indexOf(b.confidence),
      render: (v) => <Tag color={confColor[v] || "default"}>{v}</Tag>,
    },
    { title: t(`${k}.col-cells`), dataIndex: "n_cells", align: "right", defaultSortOrder: "descend", sorter: (a, b) => a.n_cells - b.n_cells || a.reads - b.reads },
    { title: t(`${k}.col-cells-dna`), dataIndex: "n_cells_dna", align: "right", sorter: (a, b) => a.n_cells_dna - b.n_cells_dna },
    { title: t(`${k}.col-reads`), dataIndex: "reads", align: "right", sorter: (a, b) => a.reads - b.reads },
    {
      title: t(`${k}.col-dna`),
      key: "dna",
      sorter: (a, b) => Number(Boolean(a.dna_match)) - Number(Boolean(b.dna_match)),
      render: (_, f) =>
        f.dna_match ? (
          <Tooltip title={t(f.dna_match.kind === "breakpoint" ? `${k}.dna-breakpoint-tip` : `${k}.dna-gene-pair-tip`, { gene: f.dna_match.event_gene, distance: f.dna_match.distance })}>
            <Tag color="blue" style={{ cursor: "pointer" }} onClick={() => openDna(f)}>
              {t(f.dna_match.kind === "breakpoint" ? `${k}.dna-breakpoint` : `${k}.dna-gene-pair`)}
            </Tag>
          </Tooltip>
        ) : null,
    },
    {
      title: t(`${k}.col-type`),
      dataIndex: "type",
      sorter: (a, b) => `${a.type}`.localeCompare(`${b.type}`),
      render: (v, f) => (isNonProductive(f) ? <Tooltip title={t(`${k}.non-productive`)}><Text type="secondary">{v}</Text></Tooltip> : v),
    },
    {
      title: (
        <Space size={4}>
          {t(`${k}.col-strip`)}
          <HintLine inline text={t(`${k}.strip-help`)} />
        </Space>
      ),
      key: "strip",
      width: stripW + 16,
      render: (_, f) => <FusionStrip fusion={f} order={order} rnaOfCell={rnaOf} width={stripW} />,
    },
  ];

  return (
    <Card size="small" title={title}>
      <div ref={ref}>
        <Space wrap style={{ marginBottom: 8 }}>
          <Input.Search size="small" allowClear placeholder={t(`${k}.search`)} style={{ width: 180 }} onSearch={setQuery} onChange={(e) => !e.target.value && setQuery("")} />
          <Text type="secondary">{t(`${k}.min-cells`)}</Text>
          <InputNumber size="small" min={1} max={500} value={minCells} onChange={(v) => setMinCells(v || 1)} style={{ width: 70 }} />
          <Text type="secondary">{t(`${k}.confidence`)}</Text>
          <Select size="small" style={{ width: 100 }} value={confidence} onChange={setConfidence} options={CONFIDENCES.map((c) => ({ value: c, label: c }))} />
          <Switch size="small" checked={hideReadThrough} onChange={setHideReadThrough} />
          <Text>{t(`${k}.hide-read-through`)}</Text>
          <Switch size="small" checked={keepDna} onChange={setKeepDna} />
          <Text>{t(`${k}.keep-dna`)}</Text>
          <Switch size="small" checked={knownOnly} onChange={setKnownOnly} />
          <Text>{t(`${k}.known-only`)}</Text>
          <Text type="secondary">{t(`${k}.shown`, { count: shown.length, total: data.fusions.length })}</Text>
        </Space>
        <Table
          size="small"
          rowKey="id"
          dataSource={shown}
          columns={columns}
          pagination={{ pageSize: 15, size: "small", showSizeChanger: true, pageSizeOptions: [15, 30, 60, 100] }}
          scroll={{ x: "max-content" }}
        />
      </div>
      <RnaFusionModal fusion={open} nCellsRna={data.nCellsRna} onClose={() => setOpen(null)} />
    </Card>
  );
}
