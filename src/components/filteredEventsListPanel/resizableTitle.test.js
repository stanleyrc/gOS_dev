/** @jest-environment node */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Table } from "antd";
import { Resizable } from "react-resizable";
import ResizableTitle, {
  ColumnSortControl,
  MIN_COLUMN_WIDTH,
  clampColumnWidth,
  makeColumnsResizable,
} from "./resizableTitle";

describe("resizable filtered-events columns", () => {
  const previewFixture = () => {
    const tables = [0, 1].map(() => {
      const column = { style: { width: "120px" } };
      return {
        column,
        style: { width: "600px" },
        getBoundingClientRect: () => ({ width: 600 }),
        querySelector: jest.fn(() => column),
      };
    });
    const header = {
      style: { width: "" },
      parentElement: { children: [] },
      getBoundingClientRect: () => ({ width: 120 }),
      closest: () => ({ querySelectorAll: () => tables }),
    };
    header.parentElement.children = [{}, header];
    const handle = {
      style: {},
      closest: (selector) => selector === "th" ? header : null,
      getBoundingClientRect: () => ({ left: 120, top: 0 }),
    };
    return { header, handle, tables };
  };

  test("previews both table colgroups, not the callback's handle node, and restores on unmount", () => {
    const onResize = jest.fn();
    const title = makeTitle({ width: 120, onResize });
    const view = title.render();
    const { header, handle, tables } = previewFixture();
    const data = { node: handle, size: { width: 175 } };

    expect(view.type).toBe(Resizable);
    expect(view.props.width).toBe(120);
    expect(view.props.resizeHandles).toEqual(["e"]);
    expect(view.props.minConstraints).toEqual([MIN_COLUMN_WIDTH, 0]);
    view.props.onResize("event", data);
    expect(handle.style.width).toBeUndefined();
    expect(header.style.width).toBe("175px");
    tables.forEach((table) => {
      expect(table.column.style.width).toBe("175px");
      expect(table.style.width).toBe("655px");
      expect(table.querySelector).toHaveBeenCalledWith("colgroup col:nth-child(2)");
    });
    expect(onResize).toHaveBeenCalledWith("event", data);
    title.componentWillUnmount();
    expect(header.style.width).toBe("");
    tables.forEach((table) => {
      expect(table.column.style.width).toBe("120px");
      expect(table.style.width).toBe("600px");
    });
  });

  test("accumulates real Resizable deltas locally and commits once without snapping back on release", () => {
    const onResize = jest.fn();
    const onResizeStop = jest.fn();
    const title = makeTitle({ width: 120, onResize, onResizeStop });
    const { handle, tables } = previewFixture();
    const resizable = new Resizable({ ...Resizable.defaultProps, ...title.render().props });
    const drag = (handler, deltaX) => {
      resizable.props = { ...resizable.props, ...title.render().props };
      resizable.resizeHandler(handler, "e")(eventFor(null), { node: handle, deltaX, deltaY: 0 });
    };
    drag("onResizeStart", 0);
    [15, 15, 25, -10].forEach((delta) => drag("onResize", delta));
    expect(onResize.mock.calls.map(([, data]) => data.size.width)).toEqual([135, 150, 175, 165]);
    expect(tables[0].column.style.width).toBe("165px");
    expect(onResizeStop).not.toHaveBeenCalled();
    drag("onResizeStop", 0);
    expect(onResizeStop).toHaveBeenCalledTimes(1);
    expect(onResizeStop.mock.calls[0][1].size.width).toBe(165);
    expect(title.state.resizeWidth).toBeNull();
    expect(tables[0].style.width).toBe("600px");
    // AntD may have measured the live widths already: don't roll those col
    // nodes back behind React's back when the parent commits the same width.
    tables.forEach((table) => expect(table.column.style.width).toBe("165px"));
  });

  test("applies remembered widths while preserving existing header props", () => {
    const existingOnHeaderCell = jest.fn(() => ({ scope: "col" }));
    const resizeHandler = jest.fn();
    const resizeStopHandler = jest.fn();
    const getResizeHandler = jest.fn(() => resizeHandler);
    const getResizeStopHandler = jest.fn(() => resizeStopHandler);
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
      getResizeHandler,
      getResizeStopHandler
    );
    const headerProps = column.onHeaderCell(column);

    expect(column.width).toBe(260);
    expect(getResizeHandler).toHaveBeenCalledWith("variant");
    expect(getResizeStopHandler).toHaveBeenCalledWith("variant");
    expect(existingOnHeaderCell).toHaveBeenCalledWith(column);
    expect(headerProps).toEqual({
      scope: "col",
      width: 260,
      minWidth: MIN_COLUMN_WIDTH,
      onResize: resizeHandler,
      onResizeStop: resizeStopHandler,
    });
  });

  test("does not resize a column below the minimum width", () => {
    expect(clampColumnWidth(12.7)).toBe(MIN_COLUMN_WIDTH);
    expect(clampColumnWidth(145.7)).toBe(146);
  });

  test("preserves unsized columns and key fallback behavior", () => {
    const unsized = { key: "unsized", width: "auto" };
    const getResizeHandler = jest.fn(() => jest.fn());
    const columns = makeColumnsResizable(
      [unsized, { dataIndex: "gene", width: "125" }, { width: 130 }],
      { gene: 150 },
      getResizeHandler,
    );
    expect(columns[0]).toBe(unsized);
    expect(columns[1].width).toBe(150);
    columns[1].onHeaderCell(columns[1]);
    columns[2].onHeaderCell(columns[2]);
    expect(getResizeHandler.mock.calls.map(([key]) => key)).toEqual(["gene", 2]);
  });
});

describe("native table pagination", () => {
  test.each([[1, 10], [2, 1]])("keeps native page %s and its %s rows", (current, rowCount) => {
    const records = Array.from({ length: 11 }, (_, uid) => ({ uid, gene: `gene-${uid}` }));
    const view = renderToStaticMarkup(
      <Table
        rowKey="uid"
        dataSource={records}
        columns={[{ key: "gene", dataIndex: "gene", title: "Gene" }]}
        components={{ header: { cell: ResizableTitle } }}
        pagination={{ pageSize: 10, defaultCurrent: current }}
        scroll={{ x: 600, y: 500 }}
      />,
    );

    expect(view.match(/data-row-key=/g)).toHaveLength(rowCount);
    expect(view).not.toContain("horizontal-scroll-controls");
    expect(view).toContain("ant-pagination");
    expect(view).toContain("ant-table-body");
  });
});

// The target models a descendant (including SVG) resolved through closest().
const targetFor = (marker) => {
  const target = {
    closest: (selector) => marker && selector.includes(marker) ? target : null,
  };
  return target;
};
const eventFor = (marker) => ({
  target: targetFor(marker),
  currentTarget: { contains: () => false },
  preventDefault: jest.fn(),
  stopPropagation: jest.fn(),
  dataTransfer: { setData: jest.fn(), getData: jest.fn(() => "foreign-column") },
});
const makeTitle = (props = {}) => {
  const title = new ResizableTitle({
    columnKey: "gene",
    sortControlOnly: true,
    onColumnDragStart: jest.fn(),
    onColumnDrop: jest.fn(),
    onColumnDragEnd: jest.fn(),
    ...props,
  });
  title.setState = (update) => { title.state = { ...title.state, ...update }; };
  return title;
};
const headerOf = (title) => {
  const view = title.render();
  return view.type === Resizable ? view.props.children : view;
};

describe("chevrons-only column sorting", () => {
  test.each([null, "ascend", "descend"])("renders a native button for %s", (sortOrder) => {
    const button = new ColumnSortControl({ title: "Gene", sortOrder }).render();
    expect(button.type).toBe("button");
    expect(button.props.type).toBe("button");
    expect(button.props["data-column-sort-control"]).toBeDefined();
    expect(button.props["aria-label"]).toBe("Sort Gene");
    expect(button.props.draggable).toBe(false);
    expect(button.props.onClick).toBeUndefined();
    expect(button.props.onKeyDown).toBeUndefined();
    const [up, down] = React.Children.toArray(button.props.children.props.children);
    expect(up.props.className.includes("active")).toBe(sortOrder === "ascend");
    expect(down.props.className.includes("active")).toBe(sortOrder === "descend");
  });

  test.each([{}, { width: 120, onResize: jest.fn() }])("gates both sized and unsized headers", (sizing) => {
    const onClick = jest.fn();
    const title = makeTitle({ ...sizing, onClick, title: "Sort Gene", tabIndex: 0, "aria-sort": "ascending" });
    const header = headerOf(title);
    for (const target of [null, "button", "input", ".ant-table-filter-trigger", ".filtered-events-resize-handle"]) {
      header.props.onClick(eventFor(target));
    }
    expect(onClick).not.toHaveBeenCalled();
    const sortEvent = eventFor("[data-column-sort-control]");
    header.props.onClick(sortEvent);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith(sortEvent);
    expect(header.props.tabIndex).toBeUndefined();
    expect(header.props.title).toBeUndefined();
    expect(header.props["aria-sort"]).toBe("ascending");
    for (const prop of ["sortControlOnly", "columnKey", "draggingColumnKey", "onColumnDragStart", "onColumnDrop", "onColumnDragEnd", "width", "minWidth", "onResize"]) {
      expect(header.props[prop]).toBeUndefined();
    }
  });

  test.each([["Enter", 13], [" ", 32]])("leaves %s to the button's native click without double sorting", (key, keyCode) => {
    const onClick = jest.fn();
    const onKeyDown = jest.fn();
    const title = makeTitle({ onClick, onKeyDown });
    const header = headerOf(title);
    const headerKey = { ...eventFor(null), key, keyCode };
    const buttonKey = { ...eventFor("[data-column-sort-control]"), key, keyCode };
    header.props.onKeyDown(headerKey);
    header.props.onKeyDown(buttonKey);
    expect(onKeyDown).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
    expect(buttonKey.preventDefault).not.toHaveBeenCalled();
    header.props.onClick(eventFor("[data-column-sort-control]"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("preserves custom non-sortable click and keyboard behavior", () => {
    const onClick = jest.fn();
    const onKeyDown = jest.fn();
    const title = makeTitle({ sortControlOnly: false, onClick, onKeyDown, title: "Help", tabIndex: 0 });
    const header = headerOf(title);
    const event = eventFor("button");
    header.props.onClick(event);
    header.props.onKeyDown(event);
    expect(onClick).toHaveBeenCalledWith(event);
    expect(onKeyDown).toHaveBeenCalledWith(event);
    expect(header.props.title).toBe("Help");
    expect(header.props.tabIndex).toBe(0);
  });

  test("gates the real AntD-injected callback before it triggers sorting", () => {
    let header;
    class CapturingHeader extends ResizableTitle {
      render() {
        const rendered = super.render();
        if (this.props.columnKey === "gene") header = rendered;
        return rendered;
      }
    }
    const onChange = jest.fn();
    const consumerClick = jest.fn((event) => event.stopPropagation());
    renderToStaticMarkup(
      <Table
        pagination={false}
        dataSource={[]}
        onChange={onChange}
        components={{ header: { cell: CapturingHeader } }}
        columns={[{
          key: "gene", title: "Gene", sorter: true,
          showSorterTooltip: false,
          sortIcon: ({ sortOrder }) => <ColumnSortControl title="Gene" sortOrder={sortOrder} />,
          onHeaderCell: () => ({ columnKey: "gene", sortControlOnly: true, onClick: consumerClick }),
        }]}
      />,
    );
    header.props.onClick(eventFor(null));
    header.props.onKeyDown({ ...eventFor("[data-column-sort-control]"), keyCode: 13 });
    expect(onChange).not.toHaveBeenCalled();
    expect(consumerClick).not.toHaveBeenCalled();
    header.props.onClick(eventFor("[data-column-sort-control]"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][2]).toMatchObject({ columnKey: "gene", order: "ascend" });
    expect(consumerClick).toHaveBeenCalledTimes(1);
  });
});

describe("isolated header gestures", () => {
  test.each(["[data-column-sort-control]", "button", "input", "select", "textarea", "a", "label", '[role="button"]', '[contenteditable]', ".ant-table-filter-trigger", ".filtered-events-resize-handle"])("does not drag from %s, even when dragstart targets the th", (marker) => {
    const title = makeTitle();
    const header = headerOf(title);
    header.props.onPointerDownCapture(eventFor(marker));
    const drag = eventFor(null);
    header.props.onDragStart(drag);
    expect(drag.preventDefault).toHaveBeenCalledTimes(1);
    expect(title.props.onColumnDragStart).not.toHaveBeenCalled();
    header.props.onPointerDownCapture(eventFor(null));
    const directDrag = eventFor(marker);
    header.props.onDragStart(directDrag);
    expect(directDrag.preventDefault).toHaveBeenCalledTimes(1);
  });

  test("title drag sets Firefox transfer data and suppresses click-release sorting", () => {
    const onClick = jest.fn();
    const onPointerDownCapture = jest.fn();
    const title = makeTitle({ onClick, onPointerDownCapture });
    const header = headerOf(title);
    expect(header.props.draggable).toBe(true);
    const pointer = eventFor(null);
    header.props.onPointerDownCapture(pointer);
    expect(onPointerDownCapture).toHaveBeenCalledWith(pointer);
    const drag = eventFor(null);
    header.props.onDragStart(drag);
    expect(drag.dataTransfer.effectAllowed).toBe("move");
    expect(drag.dataTransfer.setData).toHaveBeenCalledWith("text/plain", "gene");
    expect(title.props.onColumnDragStart).toHaveBeenCalledWith("gene", drag);
    header.props.onDragEnd(drag);
    expect(title.props.onColumnDragEnd).toHaveBeenCalledWith(drag);
    header.props.onClick(eventFor("[data-column-sort-control]"));
    expect(onClick).not.toHaveBeenCalled();
    header.props.onPointerDownCapture(eventFor("[data-column-sort-control]"));
    header.props.onClick(eventFor("[data-column-sort-control]"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("resize lifecycle preserves callbacks and blocks drag and release clicks", () => {
    const onClick = jest.fn();
    const onResizeStart = jest.fn();
    const onResizeStop = jest.fn();
    const title = makeTitle({ width: 120, onResize: jest.fn(), onClick, onResizeStart, onResizeStop });
    const view = title.render();
    const header = view.props.children;
    const edge = eventFor(".filtered-events-resize-handle");
    const data = { size: { width: 180, height: 0 } };
    view.props.onResizeStart(edge, data);
    expect(onResizeStart).toHaveBeenCalledWith(edge, data);
    expect(edge.preventDefault).toHaveBeenCalled();
    expect(edge.stopPropagation).toHaveBeenCalled();
    const drag = eventFor(null);
    header.props.onDragStart(drag);
    expect(drag.preventDefault).toHaveBeenCalledTimes(1);
    expect(title.props.onColumnDragStart).not.toHaveBeenCalled();
    header.props.onClick(eventFor("[data-column-sort-control]"));
    view.props.onResizeStop(edge, data);
    expect(onResizeStop).toHaveBeenCalledWith(edge, data);
    header.props.onClick(eventFor("[data-column-sort-control]"));
    expect(onClick).not.toHaveBeenCalled();
    header.props.onKeyDown({ ...eventFor("[data-column-sort-control]"), keyCode: 13 });
    header.props.onClick(eventFor("[data-column-sort-control]"));
    expect(onClick).toHaveBeenCalledTimes(1);
    view.props.handle("e", null).props.onClick(edge);
    expect(edge.stopPropagation).toHaveBeenCalled();
  });

  test.each([undefined, null, "gene"])("does not accept a foreign or same-column drop with source %s", (draggingColumnKey) => {
    const title = makeTitle({ draggingColumnKey });
    const header = headerOf(title);
    const event = eventFor(null);
    header.props.onDragOver(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    header.props.onDrop(event);
    expect(title.props.onColumnDrop).not.toHaveBeenCalled();
    expect(event.dataTransfer.getData).not.toHaveBeenCalled();
    expect(title.state.isDropTarget).toBe(false);
  });

  test("accepts a same-panel move and clears indicators and parent drag state", () => {
    const title = makeTitle({ draggingColumnKey: "tier" });
    const header = headerOf(title);
    const event = eventFor(null);
    header.props.onDragOver(event);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.dataTransfer.dropEffect).toBe("move");
    expect(headerOf(title).props.className).toContain("filtered-events-column-drop-target");
    header.props.onDrop(event);
    expect(title.props.onColumnDrop).toHaveBeenCalledWith("gene", event);
    expect(title.props.onColumnDragEnd).toHaveBeenCalledWith(event);
    expect(title.state.isDropTarget).toBe(false);
    expect(event.dataTransfer.getData).not.toHaveBeenCalled();
  });

  test("clears hover on leave, external cancellation and invalid control targets", () => {
    const title = makeTitle({ draggingColumnKey: "tier" });
    const header = headerOf(title);
    header.props.onDragOver(eventFor(null));
    header.props.onDragLeave({ ...eventFor(null), relatedTarget: {} });
    expect(title.state.isDropTarget).toBe(false);
    header.props.onDragOver(eventFor(null));
    header.props.onDragOver(eventFor(".ant-table-filter-trigger"));
    expect(title.state.isDropTarget).toBe(false);
    header.props.onDrop(eventFor(".filtered-events-resize-handle"));
    expect(title.props.onColumnDrop).not.toHaveBeenCalled();
    header.props.onDragOver(eventFor(null));
    const previousProps = title.props;
    title.props = { ...title.props, draggingColumnKey: null };
    title.componentDidUpdate(previousProps);
    expect(title.state.isDropTarget).toBe(false);
  });

  test("parent cancellation releases the source even if native dragend is lost", () => {
    const onClick = jest.fn();
    const title = makeTitle({ draggingColumnKey: "gene", onClick });
    const header = headerOf(title);
    header.props.onDragStart(eventFor(null));
    const previousProps = title.props;
    title.props = { ...title.props, draggingColumnKey: null };
    title.componentDidUpdate(previousProps);
    header.props.onPointerDownCapture(eventFor("[data-column-sort-control]"));
    header.props.onClick(eventFor("[data-column-sort-control]"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test("cancels an active source on unmount without setting local state or repeating callbacks", () => {
    const title = makeTitle();
    headerOf(title).props.onDragStart(eventFor(null));
    title.setState = jest.fn();
    title.componentWillUnmount();
    expect(title.props.onColumnDragEnd).toHaveBeenCalledTimes(1);
    expect(title.isDragging).toBe(false);
    expect(title.isResizing).toBe(false);
    expect(title.blockDrag).toBe(false);
    expect(title.setState).not.toHaveBeenCalled();
    title.componentWillUnmount();
    expect(title.props.onColumnDragEnd).toHaveBeenCalledTimes(1);
  });

  test("removing a drop target or an idle header does not cancel another header's drag", () => {
    const title = makeTitle({ draggingColumnKey: "tier" });
    headerOf(title).props.onDragOver(eventFor(null));
    title.componentWillUnmount();
    expect(title.props.onColumnDragEnd).not.toHaveBeenCalled();
  });

  test("source cancellation is safe across a StrictMode lifecycle remount", () => {
    const title = makeTitle({ onClick: jest.fn() });
    headerOf(title).props.onDragStart(eventFor(null));
    title.componentWillUnmount();
    title.componentDidMount();
    headerOf(title).props.onClick(eventFor("[data-column-sort-control]"));
    expect(title.props.onClick).toHaveBeenCalledTimes(1);
    headerOf(title).props.onDragStart(eventFor(null));
    headerOf(title).props.onDragEnd(eventFor(null));
    title.componentWillUnmount();
    expect(title.props.onColumnDragEnd).toHaveBeenCalledTimes(2);
  });

  test("cancels when the source header remains mounted but loses its drag contract", () => {
    const title = makeTitle();
    headerOf(title).props.onDragStart(eventFor(null));
    const previousProps = title.props;
    title.props = { ...previousProps, columnKey: undefined, onColumnDragEnd: undefined };
    title.componentDidUpdate(previousProps);
    expect(previousProps.onColumnDragEnd).toHaveBeenCalledTimes(1);
    expect(title.isDragging).toBe(false);
    expect(headerOf(title).props.draggable).not.toBe(true);
  });

  test("cleans up even when the parent drop callback throws", () => {
    const title = makeTitle({
      draggingColumnKey: "tier",
      onColumnDrop: () => { throw new Error("drop failed"); },
    });
    const header = headerOf(title);
    header.props.onDragOver(eventFor(null));
    expect(() => header.props.onDrop(eventFor(null))).toThrow("drop failed");
    expect(title.state.isDropTarget).toBe(false);
    expect(title.props.onColumnDragEnd).toHaveBeenCalledTimes(1);
  });

  test("does not make unconfigured or fixed/caller headers draggable", () => {
    const title = new ResizableTitle({ children: "Pinned" });
    expect(headerOf(title).props.draggable).not.toBe(true);
  });
});
