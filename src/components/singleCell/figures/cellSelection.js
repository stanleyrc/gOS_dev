import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Button, Space, Tag, Tooltip, Typography } from "antd";
import { CloseOutlined, ExpandOutlined } from "@ant-design/icons";

const { Text } = Typography;

// One cell selection shared by every Paper figure panel: any panel can set
// it (brush, lasso, tree node, bar, table row) and every panel shades the
// cells that are not in it. The popup (SelectedCellsModal) shows the cells.
const SelectionContext = createContext(null);

/** Modifier keys -> how a gesture combines with the current selection. */
export const selectMode = (event) => (event?.altKey ? "remove" : event?.shiftKey || event?.metaKey || event?.ctrlKey ? "add" : "replace");

export function CellSelectionProvider({ children }) {
  const [selection, setSelection] = useState(null); // { patient, cells: Set, label, source }
  const [open, setOpen] = useState(false);

  const select = useCallback((patient, ids, { label, source, mode = "replace" } = {}) => {
    setSelection((cur) => {
      const list = [...ids];
      let cells;
      if (mode === "replace" || !cur || cur.patient !== patient) cells = new Set(list);
      else if (mode === "add") cells = new Set([...cur.cells, ...list]);
      else cells = new Set([...cur.cells].filter((id) => !list.includes(id)));
      if (!cells.size) return null;
      const merged = mode !== "replace" && cur && cur.patient === patient;
      return { patient, cells, label: merged ? `${cur.label} ${mode === "add" ? "+" : "−"} ${label || "cells"}` : label || "selected cells", source };
    });
  }, []);
  const clear = useCallback(() => setSelection(null), []);
  const value = useMemo(() => ({ selection, select, clear, open, setOpen }), [selection, select, clear, open]);
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function useCellSelection() {
  return useContext(SelectionContext) || { selection: null, select: () => {}, clear: () => {}, open: false, setOpen: () => {} };
}

/** The selected cells of `patient` (Set) or null when the selection is elsewhere / empty. */
export function useSelectedIn(patient) {
  const { selection } = useCellSelection();
  return selection && selection.patient === patient ? selection.cells : null;
}

/** Sticky bar: what is selected, open the popup, clear. */
export function SelectionBar() {
  const { selection, clear, open, setOpen } = useCellSelection();
  // the floating bar steps aside while the popup is open
  return (
    <div className={`sc-fig-selbar${selection && !open ? " is-active" : ""}`}>
      {selection ? (
        <Space size={8} wrap>
          <Tag color="blue" style={{ marginInlineEnd: 0 }}>{`${selection.cells.size} cell${selection.cells.size === 1 ? "" : "s"}`}</Tag>
          <Text strong>{selection.patient}</Text>
          <Text type="secondary" ellipsis style={{ maxWidth: 420 }}>{selection.label}</Text>
          <Button size="small" type="primary" icon={<ExpandOutlined />} onClick={() => setOpen(true)}>
            View cells
          </Button>
          <Tooltip title="Clear the selection (Esc)">
            <Button size="small" icon={<CloseOutlined />} onClick={clear} />
          </Tooltip>
        </Space>
      ) : (
        <Text type="secondary">
          Select cells in any panel: drag across rows or a violin, lasso in a scatter, click a tree node, bar or row. Shift adds, Alt removes.
        </Text>
      )}
    </div>
  );
}
