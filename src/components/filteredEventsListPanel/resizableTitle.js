import React, { Component } from "react";
import { Resizable } from "react-resizable";
import { CaretDownOutlined, CaretUpOutlined } from "@ant-design/icons";

export const MIN_COLUMN_WIDTH = 100;

export function clampColumnWidth(width) {
  return Math.max(MIN_COLUMN_WIDTH, Math.round(width));
}

export function makeColumnsResizable(
  columns,
  columnWidths,
  getResizeHandler,
  getResizeStopHandler
) {
  return columns.map((column, index) => {
    const columnKey = column.key ?? column.dataIndex ?? index;
    const resizedWidth = columnWidths[columnKey];
    const width = resizedWidth ?? column.width;

    if (!Number.isFinite(Number(width)) || Number(width) <= 0) {
      return column;
    }

    const numericWidth = clampColumnWidth(Number(width));
    const originalOnHeaderCell = column.onHeaderCell;

    return {
      ...column,
      width: numericWidth,
      onHeaderCell: (currentColumn) => ({
        ...(typeof originalOnHeaderCell === "function"
          ? originalOnHeaderCell(currentColumn)
          : {}),
        width: numericWidth,
        minWidth: MIN_COLUMN_WIDTH,
        onResize: getResizeHandler(columnKey),
        onResizeStop: getResizeStopHandler?.(columnKey),
      }),
    };
  });
}

const SORT_CONTROL = "[data-column-sort-control]";
const NON_DRAGGABLE_TARGET = [
  SORT_CONTROL, "button", "input", "select", "textarea", "a", "label",
  '[role="button"]', '[role="checkbox"]', '[role="menuitem"]',
  '[contenteditable]:not([contenteditable="false"])',
  ".ant-table-filter-trigger", ".ant-table-filter-dropdown",
  ".filtered-events-resize-handle",
].join(",");

const targetMatches = (target, selector) => Boolean(
  (target?.closest ? target : target?.parentElement)?.closest(selector),
);

/** Native activation bubbles once to the gated AntD header callback. */
export class ColumnSortControl extends Component {
  render() {
    const { sortOrder, title } = this.props;
    return (
      <button
        type="button"
        className="filtered-events-sort-control ant-table-column-sorter ant-table-column-sorter-full"
        data-column-sort-control="true"
        draggable={false}
        aria-label={`Sort ${title}`}
      >
        <span className="ant-table-column-sorter-inner" aria-hidden="true">
          <CaretUpOutlined className={`ant-table-column-sorter-up${sortOrder === "ascend" ? " active" : ""}`} />
          <CaretDownOutlined className={`ant-table-column-sorter-down${sortOrder === "descend" ? " active" : ""}`} />
        </span>
      </button>
    );
  }
}

class ResizableTitle extends Component {
  state = { isDropTarget: false, resizeWidth: null };
  resizePreview = null;
  isResizing = false;
  isDragging = false;
  blockDrag = false;
  suppressClick = false;

  componentDidMount() {
    this.setDropTarget(false);
  }

  componentDidUpdate(previousProps) {
    if (this.isDragging && (
      previousProps.columnKey !== this.props.columnKey || !this.canDragColumn()
    )) {
      this.isDragging = false;
      this.blockDrag = false;
      this.setDropTarget(false);
      previousProps.onColumnDragEnd?.();
    }
    if (previousProps.draggingColumnKey !== this.props.draggingColumnKey) {
      this.setDropTarget(false);
      if (this.props.draggingColumnKey == null) {
        this.isDragging = false;
        this.blockDrag = false;
      }
    }
  }

  componentWillUnmount() {
    // Native dragend is not guaranteed when the source header disappears.
    const wasDragging = this.isDragging;
    this.isDragging = false;
    this.isResizing = false;
    this.blockDrag = false;
    this.suppressClick = false;
    this.restorePreviewWidth();
    if (wasDragging) this.props.onColumnDragEnd?.();
  }

  stopPropagation = (event) => {
    event.stopPropagation();
  };

  setDropTarget = (isDropTarget) => {
    if (this.state.isDropTarget !== isDropTarget) this.setState({ isDropTarget });
  };

  handlePointerDownCapture = (event) => {
    // dragstart may target the draggable th, not the original pressed child.
    this.blockDrag = targetMatches(event.target, NON_DRAGGABLE_TARGET);
    if (!this.isResizing && !this.isDragging) this.suppressClick = false;
    this.props.onPointerDownCapture?.(event);
  };

  handleClick = (event) => {
    if (this.isResizing || this.isDragging || this.suppressClick) {
      this.suppressClick = false;
      return;
    }
    // AntD sorts BEFORE invoking the consumer's onHeaderCell.onClick.
    if (!this.props.sortControlOnly || targetMatches(event.target, SORT_CONTROL)) {
      this.props.onClick?.(event);
    }
  };

  handleKeyDown = (event) => {
    if (this.isResizing || this.isDragging) return;
    this.suppressClick = false;
    // Do not invoke AntD's Enter handler: the native button generates a click.
    // Do not preventDefault either; that would disable native button activation.
    if (!this.props.sortControlOnly) this.props.onKeyDown?.(event);
  };

  applyPreviewWidth = ({ node, size } = {}) => {
    if (!Number.isFinite(size?.width)) return;
    // react-resizable supplies the handle span, not the table header.
    const header = node?.closest?.("th");
    if (!header) return;
    if (!this.resizePreview) {
      const cellIndex = Array.from(header.parentElement.children).indexOf(header);
      const container = header.closest(".ant-table-container");
      const tables = Array.from(container?.querySelectorAll(
        ".ant-table-header > table, .ant-table-body > table, .ant-table-content > table"
      ) || []);
      this.resizePreview = {
        header,
        headerStyleWidth: header.style.width,
        columnWidth: header.getBoundingClientRect().width,
        tables: tables.map((table) => {
          const column = table.querySelector(`colgroup col:nth-child(${cellIndex + 1})`);
          return {
            table, column,
            width: table.getBoundingClientRect().width,
            tableStyleWidth: table.style.width,
            columnStyleWidth: column?.style.width,
          };
        }),
      };
    }
    const width = clampColumnWidth(size.width);
    const preview = this.resizePreview;
    preview.header.style.width = `${width}px`;
    // AntD renders separate header/body tables. Grow their total widths too,
    // otherwise fixed layout takes space from neighboring columns.
    preview.tables.forEach(({ table, column, width: tableWidth }) => {
      if (column) column.style.width = `${width}px`;
      table.style.width = `${tableWidth + width - preview.columnWidth}px`;
    });
  };

  restorePreviewWidth = (keepColumnWidths = false) => {
    const preview = this.resizePreview;
    if (!preview) return;
    preview.header.style.width = preview.headerStyleWidth;
    preview.tables.forEach(({ table, column, tableStyleWidth, columnStyleWidth }) => {
      table.style.width = tableStyleWidth;
      if (column && !keepColumnWidths) column.style.width = columnStyleWidth;
    });
    this.resizePreview = null;
  };

  handleResize = (event, data) => {
    if (!Number.isFinite(data?.size?.width)) return;
    this.applyPreviewWidth(data);
    // Resizable adds each movement delta to its controlled width. Update only
    // this header during a drag; the expensive row tree commits once on release.
    this.setState({ resizeWidth: clampColumnWidth(data.size.width) });
    this.props.onResize?.(event, data);
  };

  handleResizeStart = (event, data) => {
    // Cancel native header dragging/text selection before it can steal the mouse.
    event.preventDefault();
    event.stopPropagation();
    this.isResizing = true;
    this.suppressClick = true;
    this.setDropTarget(false);
    this.props.onResizeStart?.(event, data);
  };

  handleResizeStop = (event, data) => {
    this.applyPreviewWidth(data);
    // AntD has already measured the live body widths into its header state.
    // Restoring old col widths here would bypass React's unchanged-style check
    // and leave the header stuck at the old size after the parent commits.
    this.restorePreviewWidth(true);
    this.isResizing = false;
    this.suppressClick = true;
    this.setState({ resizeWidth: null });
    this.props.onResizeStop?.(event, data);
  };

  canDragColumn = () => this.props.columnKey != null &&
    typeof this.props.onColumnDragStart === "function" &&
    typeof this.props.onColumnDrop === "function";

  canDrop = (event) => this.canDragColumn() && !this.isResizing &&
    this.props.draggingColumnKey != null &&
    this.props.draggingColumnKey !== this.props.columnKey &&
    !targetMatches(event.target, NON_DRAGGABLE_TARGET);

  handleDragStart = (event) => {
    if (!this.canDragColumn() || this.isResizing || this.blockDrag ||
        targetMatches(event.target, NON_DRAGGABLE_TARGET)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    this.isDragging = true;
    this.suppressClick = true;
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(this.props.columnKey));
    }
    this.props.onColumnDragStart(this.props.columnKey, event);
  };

  handleDragOver = (event) => {
    const allowed = this.canDrop(event);
    this.setDropTarget(allowed);
    if (allowed) {
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    }
  };

  handleDragLeave = (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) this.setDropTarget(false);
  };

  handleDragEnd = (event) => {
    const wasDragging = this.isDragging || this.props.draggingColumnKey != null;
    this.isDragging = false;
    this.blockDrag = false;
    this.suppressClick = true;
    this.setDropTarget(false);
    if (wasDragging) this.props.onColumnDragEnd?.(event);
  };

  handleDrop = (event) => {
    try {
      if (this.canDrop(event)) {
        event.preventDefault();
        event.stopPropagation();
        // Parent state, never external transfer text, selects the source key.
        this.props.onColumnDrop(this.props.columnKey, event);
      }
    } finally {
      this.handleDragEnd(event);
    }
  };

  render() {
    const {
      width, onResize, onResizeStart, onResizeStop,
      minWidth = MIN_COLUMN_WIDTH,
      className, sortControlOnly, columnKey, draggingColumnKey,
      onColumnDragStart, onColumnDrop, onColumnDragEnd,
      onClick, onKeyDown, onPointerDownCapture, title, tabIndex,
      ...restProps
    } = this.props;
    const dragProps = this.canDragColumn() ? {
      draggable: true,
      onDragStart: this.handleDragStart,
      onDragEnter: this.handleDragOver,
      onDragOver: this.handleDragOver,
      onDragLeave: this.handleDragLeave,
      onDrop: this.handleDrop,
      onDragEnd: this.handleDragEnd,
    } : {};
    const header = (
      <th
        {...restProps}
        {...dragProps}
        className={[className, this.state.isDropTarget && "filtered-events-column-drop-target"].filter(Boolean).join(" ") || undefined}
        title={sortControlOnly ? undefined : title}
        tabIndex={sortControlOnly ? undefined : tabIndex}
        onClick={this.handleClick}
        onKeyDown={this.handleKeyDown}
        onPointerDownCapture={this.handlePointerDownCapture}
      />
    );
    if (!width || !onResize) return header;

    return (
      <Resizable
        width={this.state.resizeWidth ?? width}
        height={0}
        axis="x"
        minConstraints={[minWidth, 0]}
        resizeHandles={["e"]}
        onResize={this.handleResize}
        onResizeStart={this.handleResizeStart}
        onResizeStop={this.handleResizeStop}
        draggableOpts={{ enableUserSelectHack: false }}
        className="filtered-events-resizable-header"
        handle={(handleAxis, ref) => (
          <span
            ref={ref}
            className={`filtered-events-resize-handle filtered-events-resize-handle-${handleAxis}`}
            onClick={this.stopPropagation}
            draggable={false}
            aria-hidden="true"
          />
        )}
      >
        {header}
      </Resizable>
    );
  }
}

export default ResizableTitle;
