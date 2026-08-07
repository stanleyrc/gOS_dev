/** @jest-environment node */

import { Resizable } from "react-resizable";
import ResizableTitle, {
  MIN_COLUMN_WIDTH,
  clampColumnWidth,
  makeColumnsResizable,
} from "./resizableTitle";

describe("resizable filtered-events columns", () => {
  test("wraps a sized header with an east-edge resize handle", () => {
    const onResize = jest.fn();
    const title = new ResizableTitle({ width: 120, onResize });
    const rendered = title.render();

    expect(rendered.type).toBe(Resizable);
    expect(rendered.props.width).toBe(120);
    expect(rendered.props.resizeHandles).toEqual(["e"]);
    expect(rendered.props.minConstraints).toEqual([MIN_COLUMN_WIDTH, 0]);
    expect(rendered.props.onResize).toBe(onResize);
  });

  test("applies remembered widths while preserving existing header props", () => {
    const existingOnHeaderCell = jest.fn(() => ({ scope: "col" }));
    const resizeHandler = jest.fn();
    const getResizeHandler = jest.fn(() => resizeHandler);
    const columns = [
      {
        key: "variant",
        width: 120,
        onHeaderCell: existingOnHeaderCell,
      },
    ];

    const [column] = makeColumnsResizable(
      columns,
      { variant: 260 },
      getResizeHandler
    );
    const headerProps = column.onHeaderCell(column);

    expect(column.width).toBe(260);
    expect(getResizeHandler).toHaveBeenCalledWith("variant");
    expect(existingOnHeaderCell).toHaveBeenCalledWith(column);
    expect(headerProps).toEqual({
      scope: "col",
      width: 260,
      minWidth: MIN_COLUMN_WIDTH,
      onResize: resizeHandler,
    });
  });

  test("does not resize a column below the minimum width", () => {
    expect(clampColumnWidth(12.7)).toBe(MIN_COLUMN_WIDTH);
    expect(clampColumnWidth(145.7)).toBe(146);
  });
});
