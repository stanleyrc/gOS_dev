import React, { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { Button, Card, Collapse, Input, Select, Space, Table, Tag, Typography } from "antd";
import { ExportOutlined, SelectOutlined } from "@ant-design/icons";
import singleCellActions, { SC_MAX_TRACK_CELLS } from "../../redux/singleCell/actions";
import datasetsActions from "../../redux/datasets/actions";
import { naturalCompare, representativeCells } from "../../helpers/singleCell/matrix";
import { snakeCaseToHumanReadable } from "../../helpers/utility";

const { Text } = Typography;
const MAX_EXTRA_COLUMNS = 6;
const HIDDEN_KEYS = new Set([
  "cell_id",
  "clone_id",
  "id",
  "pair",
  "caseReportId",
  "datasetId",
  "sourceDatasetTitle",
  "entry_type",
  "entryType",
  "patient_id",
  "visible",
  "summary",
  "tags",
  "visibleTags",
  "qcMetrics",
  "qcEvaluation",
]);

const formatValue = (v) =>
  typeof v === "number" ? (Number.isInteger(v) ? v.toLocaleString() : v.toFixed(3)) : v == null ? "" : `${v}`;

export default function CellSelectionPanel() {
  const { t } = useTranslation("common");
  const dispatch = useDispatch();
  const { cells, order, cloneColors, selectedCellIds, patient } = useSelector(
    (state) => state.SingleCell
  );
  const openCell = (cellId) =>
    patient && dispatch(datasetsActions.openCaseReport(patient.datasetId, cellId));
  const [query, setQuery] = useState("");
  const setSelection = (ids) => dispatch(singleCellActions.updateSelection(ids));

  const cellById = useMemo(() => new Map(cells.map((c) => [c.cell_id, c])), [cells]);
  const clones = useMemo(
    () => [...new Set(cells.map((c) => c.clone_id).filter((c) => c != null))].sort(naturalCompare),
    [cells]
  );

  const extraKeys = useMemo(() => {
    const keys = new Set();
    cells.slice(0, 200).forEach((c) =>
      Object.keys(c).forEach((k) => {
        const v = c[k];
        if (!HIDDEN_KEYS.has(k) && (typeof v === "number" || typeof v === "string" || typeof v === "boolean")) {
          keys.add(k);
        }
      })
    );
    // Only attributes that differ between cells are worth a column.
    const varies = (k) => new Set(cells.map((c) => c[k])).size > 1;
    return [...keys].filter(varies).slice(0, MAX_EXTRA_COLUMNS);
  }, [cells]);

  const rows = useMemo(() => {
    const rank = new Map(order.map((id, k) => [id, k]));
    const q = query.trim().toLowerCase();
    return cells
      .filter(
        (c) =>
          !q ||
          c.cell_id.toLowerCase().includes(q) ||
          `${c.clone_id ?? ""}`.toLowerCase() === q ||
          extraKeys.some((k) => `${c[k] ?? ""}`.toLowerCase().includes(q))
      )
      .sort((a, b) => (rank.get(a.cell_id) ?? 0) - (rank.get(b.cell_id) ?? 0))
      .map((c) => ({ key: c.cell_id, ...c }));
  }, [cells, order, query, extraKeys]);

  const cloneTag = (clone) =>
    clone == null ? (
      <Text type="secondary">—</Text>
    ) : (
      <Tag color={cloneColors[clone]} style={{ marginRight: 0 }}>
        {clone}
      </Tag>
    );

  const columns = [
    {
      title: t("components.single-cell.table.cell"),
      dataIndex: "cell_id",
      key: "cell_id",
      sorter: (a, b) => naturalCompare(a.cell_id, b.cell_id),
      ellipsis: true,
    },
    {
      title: t("components.single-cell.table.clone"),
      dataIndex: "clone_id",
      key: "clone_id",
      width: 90,
      sorter: (a, b) => naturalCompare(a.clone_id ?? "", b.clone_id ?? ""),
      render: cloneTag,
    },
    {
      title: "",
      key: "open",
      width: 44,
      render: (_, record) => (
        <Button
          size="small"
          type="text"
          icon={<ExportOutlined />}
          title={t("components.single-cell.tracks.open-cell")}
          onClick={(e) => {
            e.stopPropagation();
            openCell(record.cell_id);
          }}
        />
      ),
    },
    ...extraKeys.map((k) => ({
      title: snakeCaseToHumanReadable(k),
      dataIndex: k,
      key: k,
      ellipsis: true,
      sorter: (a, b) =>
        typeof a[k] === "number" && typeof b[k] === "number"
          ? a[k] - b[k]
          : naturalCompare(a[k] ?? "", b[k] ?? ""),
      render: formatValue,
    })),
  ];

  const overflow = selectedCellIds.length - SC_MAX_TRACK_CELLS;

  return (
    <Card
      size="small"
      title={
        <Space>
          <SelectOutlined />
          <span>{t("components.single-cell.selection.title")}</span>
          <Text type="secondary">
            {t("components.single-cell.selection.count", { count: selectedCellIds.length })}
          </Text>
        </Space>
      }
      extra={
        <Space wrap>
          <Select
            size="small"
            style={{ width: 170 }}
            placeholder={t("components.single-cell.selection.select-clone")}
            value={null}
            disabled={!clones.length}
            onChange={(clone) =>
              setSelection(order.filter((id) => cellById.get(id)?.clone_id === clone))
            }
            options={clones.map((clone) => ({ value: clone, label: cloneTag(clone) }))}
          />
          <Button size="small" onClick={() => setSelection(representativeCells(cells, order, SC_MAX_TRACK_CELLS))}>
            {t("components.single-cell.selection.one-per-clone")}
          </Button>
          <Button size="small" disabled={!selectedCellIds.length} onClick={() => setSelection([])}>
            {t("components.single-cell.selection.clear")}
          </Button>
        </Space>
      }
    >
      <Space wrap size={[4, 4]}>
        {selectedCellIds.length === 0 && (
          <Text type="secondary">{t("components.single-cell.selection.empty")}</Text>
        )}
        {selectedCellIds.slice(0, 60).map((id) => {
          const clone = cellById.get(id)?.clone_id;
          return (
            <Tag
              key={id}
              closable
              color={clone != null ? cloneColors[clone] : undefined}
              onClose={(e) => {
                e.preventDefault();
                setSelection(selectedCellIds.filter((c) => c !== id));
              }}
            >
              {id}
            </Tag>
          );
        })}
        {selectedCellIds.length > 60 && (
          <Text type="secondary">
            {t("components.single-cell.selection.more", { count: selectedCellIds.length - 60 })}
          </Text>
        )}
      </Space>
      {overflow > 0 && (
        <div>
          <Text type="warning">
            {t("components.single-cell.selection.track-limit", { limit: SC_MAX_TRACK_CELLS })}
          </Text>
        </div>
      )}
      <Collapse
        ghost
        size="small"
        style={{ marginTop: 8 }}
        items={[
          {
            key: "table",
            label: t("components.single-cell.selection.browse", { count: cells.length }),
            children: (
              <>
                <Input.Search
                  allowClear
                  size="small"
                  placeholder={t("components.single-cell.selection.search")}
                  style={{ maxWidth: 320, marginBottom: 8 }}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <Table
                  size="small"
                  columns={columns}
                  dataSource={rows}
                  pagination={{ pageSize: 20, showSizeChanger: true }}
                  scroll={{ x: true }}
                  rowSelection={{
                    selectedRowKeys: selectedCellIds,
                    preserveSelectedRowKeys: true,
                    onChange: (keys) => {
                      // Keep the existing order for cells already selected.
                      const keySet = new Set(keys);
                      const kept = selectedCellIds.filter((id) => keySet.has(id));
                      const added = keys.filter((id) => !selectedCellIds.includes(id));
                      setSelection([...kept, ...added]);
                    },
                  }}
                  onRow={(record) => ({
                    onDoubleClick: () => setSelection([record.cell_id]),
                  })}
                />
              </>
            ),
          },
        ]}
      />
    </Card>
  );
}
