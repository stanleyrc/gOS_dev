import React, { Component } from "react";
import { Resizable } from "react-resizable";

export const MIN_COLUMN_WIDTH = 100;

export function clampColumnWidth(width) {
  return Math.max(MIN_COLUMN_WIDTH, Math.round(width));
}

export function makeColumnsResizable(
  columns,
  columnWidths,
  getResizeHandler
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
      }),
    };
  });
}

class ResizableTitle extends Component {
  stopPropagation = (event) => {
    event.stopPropagation();
  };

  render() {
    const {
      width,
      onResize,
      minWidth = MIN_COLUMN_WIDTH,
      className,
      ...restProps
    } = this.props;

    if (!width || !onResize) {
      return <th {...restProps} className={className} />;
    }

    return (
      <Resizable
        width={width}
        height={0}
        axis="x"
        minConstraints={[minWidth, 0]}
        resizeHandles={["e"]}
        onResize={onResize}
        draggableOpts={{ enableUserSelectHack: false }}
        className="filtered-events-resizable-header"
        handle={(handleAxis, ref) => (
          <span
            ref={ref}
            className={`filtered-events-resize-handle filtered-events-resize-handle-${handleAxis}`}
            onClick={this.stopPropagation}
            aria-hidden="true"
          />
        )}
      >
        <th {...restProps} className={className} />
      </Resizable>
    );
  }
}

export default ResizableTitle;
