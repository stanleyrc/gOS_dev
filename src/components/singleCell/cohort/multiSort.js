import React, { useMemo, useState } from "react";
import { Button, Space, Typography } from "antd";
import { arrowOf, badgeText, nextSortKeys, sortBadge, sortRows } from "../../../helpers/singleCell/multiSort";

const { Text } = Typography;

/**
 * Multi-column sorting for an antd Table: click a header to sort by it, shift-click to add more sort keys
 * (a key cycles ascending, descending, removed). Headers show an arrow and, with several keys, their order.
 * Columns marked `sortable: true` (key = dataIndex, or `sortValue(row)` for a computed value; `firstDir: "desc"`
 * for numeric columns that should start high-to-low) are sorted here, not by antd.
 * @returns { columns, rows, keys, setKeys, clear, hint }
 */
export default function useMultiSort(columns, rows, initialKeys = []) {
  const [keys, setKeys] = useState(initialKeys);
  const accessors = useMemo(() => {
    const out = {};
    columns.forEach((c) => {
      if (c.sortable) out[c.dataIndex || c.key] = c.sortValue || ((r) => r[c.dataIndex || c.key]);
    });
    return out;
  }, [columns]);
  const sorted = useMemo(() => sortRows(rows, keys, accessors), [rows, keys, accessors]);
  const cols = columns.map((c) => {
    if (!c.sortable) return c;
    const id = c.dataIndex || c.key;
    const badge = sortBadge(keys, id);
    const { sortable, sortValue, firstDir, ...rest } = c;
    return {
      ...rest,
      title: (
        <span style={{ userSelect: "none", whiteSpace: "nowrap" }}>
          {c.title}
          {badge && (
            <span style={{ marginLeft: 4, fontSize: 11 }} aria-label={`sort ${badge.order}`}>
              {arrowOf(badge)}
              {badgeText(badge) && (
                <sup style={{ marginLeft: 1, fontWeight: 700, background: "#1677ff", color: "#fff", borderRadius: 8, padding: "0 4px" }}>{badgeText(badge)}</sup>
              )}
            </span>
          )}
        </span>
      ),
      onHeaderCell: (...a) => ({
        ...(c.onHeaderCell ? c.onHeaderCell(...a) : {}),
        style: { cursor: "pointer" },
        onClick: (ev) => setKeys((k) => nextSortKeys(k, id, { shift: ev.shiftKey, firstDir: firstDir || "asc" })),
        title: (c.onHeaderCell && c.onHeaderCell(...a)?.title) || "Click to sort; shift-click to add a sort column",
      }),
    };
  });
  const hint = (
    <Space size={6}>
      <Text type="secondary" style={{ fontSize: 12 }}>Shift-click headers to sort by several columns.</Text>
      {keys.length > 0 && <Button size="small" type="link" onClick={() => setKeys([])}>Clear sort</Button>}
    </Space>
  );
  return { columns: cols, rows: sorted, keys, setKeys, clear: () => setKeys([]), hint };
}
