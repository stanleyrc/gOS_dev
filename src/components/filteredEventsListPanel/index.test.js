/** @jest-environment node */
/* eslint-disable import/first */

jest.mock("react-dom", () => ({ createPortal: jest.fn() }));
jest.mock("react-i18next", () => ({
  withTranslation: () => (Component) => Component,
}));
jest.mock("react-router-dom", () => ({
  withRouter: (Component) => Component,
}));
jest.mock("react-in-viewport", () => (Component) => Component);
jest.mock("react-redux", () => ({
  connect: () => (Component) => Component,
}));
jest.mock("antd", () => {
  const Select = () => null;
  Select.Option = "SelectOption";

  return {
    Table: "Table",
    Button: "Button",
    Row: "Row",
    Col: "Col",
    Segmented: "Segmented",
    Skeleton: "Skeleton",
    Select,
    Checkbox: "Checkbox",
    Slider: "Slider",
  };
});
jest.mock("d3", () => ({
  group: (records, getKey) =>
    records.reduce((groups, record) => {
      const key = getKey(record);
      groups.set(key, [...(groups.get(key) || []), record]);
      return groups;
    }, new Map()),
}));
jest.mock("react-icons/cg", () => ({ CgArrowsBreakeH: "Icon" }));
jest.mock("../../helpers/utility", () => ({
  transitionStyle: () => ({}),
}));
jest.mock("../../redux/filteredEvents/actions", () => ({
  __esModule: true,
  default: {
    selectFilteredEvent: jest.fn(),
    setSelectedEventUids: jest.fn(),
    setColumnFilters: jest.fn(),
    resetColumnFilters: jest.fn(),
  },
}));
jest.mock("../../redux/interpretations/actions", () => ({
  __esModule: true,
  default: { updateInterpretation: jest.fn() },
}));
jest.mock("../../redux/interpretations/selectors", () => ({
  selectMergedEvents: jest.fn(),
}));
jest.mock("../../helpers/EventInterpretation", () => jest.fn());
jest.mock("../../helpers/userAuth", () => {
  const EventEmitter = require("eventemitter3");
  return {
    getCurrentUserId: jest.fn(() => null),
    userAuthRepository: { emitter: new EventEmitter() },
  };
});
jest.mock("./index.style", () => "Wrapper");
jest.mock("../errorPanel", () => "ErrorPanel");
jest.mock(
  "../filteredEventDetailsModal",
  () => "FilteredEventDetailsModal",
);
jest.mock("../tierDistributionBarChart", () => "TierDistributionBarChart");
jest.mock("./columnBuilders", () => ({ buildColumnsFromSettings: jest.fn() }));

import React from "react";
import { createPortal } from "react-dom";
import { buildColumnsFromSettings } from "./columnBuilders";
import { FilteredEventsListPanel } from "./index";
import ResizableTitle, { ColumnSortControl } from "./resizableTitle";
import { getCurrentUserId, userAuthRepository } from "../../helpers/userAuth";
import { COLUMN_LAYOUT_STORAGE_KEY, readColumnLayout, saveColumnLayout } from "../../helpers/filteredEventsColumnLayout";

function findElementByType(node, type) {
  if (!React.isValidElement(node)) return null;
  if (node.type === type) return node;
  if (node.type === "Skeleton" && node.props.loading) return null;

  for (const child of React.Children.toArray(node.props.children)) {
    const match = findElementByType(child, type);
    if (match) return match;
  }
  return null;
}

describe("FilteredEventsListPanel saved browser layout", () => {
  let previousWindow;
  let storage;
  let listeners;
  let panels;

  beforeEach(() => {
    previousWindow = global.window;
    const items = new Map();
    storage = {
      getItem: jest.fn((key) => items.get(key) ?? null),
      setItem: jest.fn((key, value) => items.set(key, value)),
    };
    listeners = new Map();
    panels = [];
    global.window = {
      localStorage: storage,
      addEventListener: jest.fn((name, callback) => listeners.set(callback, name)),
      removeEventListener: jest.fn((name, callback) => listeners.delete(callback)),
    };
    getCurrentUserId.mockReset().mockReturnValue(null);
  });

  afterEach(() => {
    panels.forEach((panel) => panel.componentWillUnmount());
    userAuthRepository.emitter.removeAllListeners();
    getCurrentUserId.mockReturnValue(null);
    global.window = previousWindow;
  });

  function makePanel(id = "case-1", dataset = {}) {
    const panel = new FilteredEventsListPanel({
      id, dataset, inViewport: true,
      data: { filteredEventsColumns: ["gene", "tier"].map((key) => ({ id: key })) },
      additionalColumns: [{ key: "caller" }],
      resetColumnFilters: jest.fn(),
    });
    panel.setState = (update, callback) => {
      panel.state = { ...panel.state, ...(typeof update === "function" ? update(panel.state) : update) };
      callback?.();
    };
    panel.componentDidMount();
    panels.push(panel);
    return panel;
  }

  function reorder(panel, from = "gene", to = "tier", keys = ["gene", "tier"]) {
    panel.handleColumnDragStart(from);
    panel.handleColumnDrop(to, keys);
  }

  it("saves while signed out on resize completion/drop and restores across cases, reloads and datasets", () => {
    const panel = makePanel();
    panel.handleColumnResize("gene")(null, { size: { width: 310 } });
    expect(storage.setItem).not.toHaveBeenCalled();
    panel.handleColumnResizeStop("gene")(null, { size: { width: 340 } });
    reorder(panel);
    const restored = makePanel("case-2", { id: "other-dataset", defaultVisibleFilteredEventsColumns: ["gene"] });
    expect(restored.state).toMatchObject({ columnWidths: { gene: 340 }, columnOrderKeys: ["tier", "gene"], selectedColumnKeys: ["gene", "caller"], pageSize: 50 });
    expect(Object.keys(JSON.parse(storage.getItem(COLUMN_LAYOUT_STORAGE_KEY)))).toEqual(["columnWidths", "columnOrderKeys"]);
    expect(getCurrentUserId).not.toHaveBeenCalled();
    const previousProps = restored.props;
    restored.props = { ...restored.props, dataset: { defaultVisibleFilteredEventsColumns: ["tier"] } };
    restored.componentDidUpdate(previousProps);
    expect(restored.state.columnOrderKeys).toEqual(["tier", "gene"]);
  });

  it("keeps hidden/other-dataset column preferences across a reorder and Reset Filters", () => {
    saveColumnLayout({ columnWidths: { gene: 340, extra: 450 }, columnOrderKeys: ["gene", "extra", "tier"] });
    const panel = makePanel();
    reorder(panel);
    expect(readColumnLayout()).toEqual({ columnWidths: { gene: 340, extra: 450 }, columnOrderKeys: ["tier", "extra", "gene"] });
    panel.handleResetFilters();
    expect(readColumnLayout()).toEqual({ columnWidths: { gene: 340, extra: 450 }, columnOrderKeys: [] });
    expect(panel.state.columnWidths.gene).toBe(340);
  });

  it("does not share caller-owned column widths", () => {
    const panel = makePanel();
    panel.handleColumnResizeStop("caller")(null, { size: { width: 400 } });
    expect(panel.state.columnWidths.caller).toBe(400);
    expect(readColumnLayout().columnWidths).toEqual({});
  });

  it("shares one layout across sign-in, user changes and sign-out without reading identity", () => {
    const panel = makePanel();
    panel.handleColumnResizeStop("gene")(null, { size: { width: 440 } });
    reorder(panel);
    for (const userId of ["user-a", "user-b", null]) {
      getCurrentUserId.mockReturnValue(userId);
      userAuthRepository.emitter.emit("userChanged", userId ? { userId } : null);
      for (const callback of listeners.keys()) callback({ key: "gOS_user" });
      const restored = makePanel();
      expect(restored.state).toMatchObject({ columnWidths: { gene: 440 }, columnOrderKeys: ["tier", "gene"] });
      expect(panel.state).toMatchObject({ columnWidths: { gene: 440 }, columnOrderKeys: ["tier", "gene"] });
    }
    panel.handleColumnResizeStop("gene")(null, { size: { width: 500 } });
    expect(readColumnLayout().columnWidths.gene).toBe(500);
    expect(getCurrentUserId).not.toHaveBeenCalled();
    expect(userAuthRepository.emitter.listenerCount("userChanged")).toBe(0);
  });

  it("refreshes only layout/clear storage events and releases subscriptions on unmount", () => {
    const panel = makePanel();
    expect(listeners.size).toBe(1);
    saveColumnLayout({ columnWidths: { gene: 350 } });
    for (const callback of listeners.keys()) callback({ key: "gOS_user" });
    expect(panel.state.columnWidths).toEqual({});
    for (const callback of listeners.keys()) callback({ key: COLUMN_LAYOUT_STORAGE_KEY });
    expect(panel.state.columnWidths.gene).toBe(350);
    storage.getItem.mockReturnValue(null);
    for (const callback of listeners.keys()) callback({ key: null });
    expect(panel.state.columnWidths).toEqual({});
    panel.componentWillUnmount();
    expect(listeners.size).toBe(0);
  });

  it("keeps interactions functional if storage is unavailable", () => {
    storage.getItem.mockImplementation(() => { throw new Error("denied"); });
    storage.setItem.mockImplementation(() => { throw new Error("full"); });
    const panel = makePanel();
    panel.handleColumnResizeStop("gene")(null, { size: { width: 350 } });
    reorder(panel);
    expect(panel.state).toMatchObject({ columnWidths: { gene: 350 }, columnOrderKeys: ["tier", "gene"] });
  });
});

describe("FilteredEventsListPanel default visible columns", () => {
  it("applies dataset defaults on mount and Reset Filters", () => {
    const resetColumnFilters = jest.fn();
    const panel = new FilteredEventsListPanel({
      additionalColumns: [{ key: "caller-column" }],
      data: {
        filteredEventsColumns: [{ id: "gene" }, { id: "tier" }],
      },
      dataset: {
        optionalFilteredEventsColumns: [{ id: "dataset-column" }],
        defaultVisibleFilteredEventsColumns: [
          "tier",
          "dataset-column",
          "unknown-column",
        ],
      },
      resetColumnFilters,
    });
    panel.fetchTierCountsForRecords = jest.fn();
    panel.setState = (nextState) => {
      panel.state = { ...panel.state, ...nextState };
    };

    panel.componentDidMount();

    expect(panel.state.selectedColumnKeys).toEqual([
      "tier",
      "dataset-column",
      "caller-column",
    ]);

    panel.state.selectedColumnKeys = ["gene"];
    panel.handleResetFilters();

    expect(resetColumnFilters).toHaveBeenCalledTimes(1);
    expect(panel.state.selectedColumnKeys).toEqual([
      "tier",
      "dataset-column",
      "caller-column",
    ]);
  });

  it("preserves a user's selection when callers recreate equivalent column props", () => {
    const previousProps = {
      additionalColumns: [{ key: "caller-column" }],
      data: {
        filteredEventsColumns: [{ id: "gene" }, { id: "tier" }],
      },
      dataset: {
        optionalFilteredEventsColumns: [{ id: "dataset-column" }],
        defaultVisibleFilteredEventsColumns: ["tier", "dataset-column"],
      },
    };
    const panel = new FilteredEventsListPanel(previousProps);
    panel.state = { ...panel.state, selectedColumnKeys: ["gene"] };
    panel.initializeSelectedColumns = jest.fn();
    panel.fetchTierCountsForRecords = jest.fn();
    const previousState = { ...panel.state };

    panel.props = {
      ...previousProps,
      additionalColumns: [{ key: "caller-column" }],
      data: {
        filteredEventsColumns: [{ id: "gene" }, { id: "tier" }],
      },
      dataset: {
        optionalFilteredEventsColumns: [{ id: "dataset-column" }],
        defaultVisibleFilteredEventsColumns: ["tier", "dataset-column"],
      },
    };
    panel.componentDidUpdate(previousProps, previousState);

    expect(panel.initializeSelectedColumns).not.toHaveBeenCalled();
    expect(panel.state.selectedColumnKeys).toEqual(["gene"]);
  });

  it("reapplies defaults when the effective column configuration changes", () => {
    const previousProps = {
      additionalColumns: [],
      data: { filteredEventsColumns: [{ id: "gene" }, { id: "tier" }] },
      dataset: { defaultVisibleFilteredEventsColumns: ["gene"] },
    };
    const panel = new FilteredEventsListPanel(previousProps);
    panel.initializeSelectedColumns = jest.fn();
    panel.fetchTierCountsForRecords = jest.fn();
    const previousState = { ...panel.state };

    panel.props = {
      ...previousProps,
      dataset: { defaultVisibleFilteredEventsColumns: ["tier"] },
    };
    panel.componentDidUpdate(previousProps, previousState);

    expect(panel.initializeSelectedColumns).toHaveBeenCalledTimes(1);
  });

  it("renders dataset columns in the configured default order", () => {
    buildColumnsFromSettings.mockReturnValue([
      { key: "gene", title: "Gene", width: 120 },
      { key: "tier", title: "Tier", width: 120 },
      { key: "dataset-column", title: "Dataset", width: 120 },
    ]);
    const panel = new FilteredEventsListPanel({
      t: (key) => key,
      id: "case-1",
      filteredEvents: [],
      originalFilteredEvents: [],
      selectedFilteredEvent: null,
      selectedEventUids: [],
      columnFilters: {},
      viewMode: "detail",
      loading: false,
      error: null,
      missing: false,
      selectFilteredEvent: jest.fn(),
      setSelectedEventUids: jest.fn(),
      additionalColumns: [
        { key: "caller-column", title: "Caller", width: 120 },
      ],
      data: {
        filteredEventsColumns: [
          { id: "gene" },
          { id: "tier" },
          { id: "dataset-column" },
        ],
      },
      dataset: {
        id: "dataset-1",
        defaultVisibleFilteredEventsColumns: [
          "dataset-column",
          "tier",
          "gene",
        ],
      },
      inViewport: true,
    });
    panel.state = {
      ...panel.state,
      selectedColumnKeys: [
        "dataset-column",
        "tier",
        "gene",
        "caller-column",
      ],
    };

    const table = findElementByType(panel.render(), "Table");

    expect(table.props.columns.map(({ key }) => key)).toEqual([
      "select",
      "caller-column",
      "dataset-column",
      "tier",
      "gene",
    ]);
  });
});

describe("FilteredEventsListPanel header interactions", () => {
  beforeEach(() => jest.useFakeTimers({ doNotFake: ["performance"] }));
  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  function makePanel() {
    buildColumnsFromSettings.mockReturnValue([
      { key: "gene", title: "Gene", width: 164, sorter: true },
      { key: "tier", title: "Tier", width: 120, sorter: true },
      { key: "pinned", title: "Pinned", width: 120, fixed: "left" },
      { key: "location", title: "Location", width: 200 },
    ]);
    const panel = new FilteredEventsListPanel({
      t: (key) => key,
      filteredEvents: [], originalFilteredEvents: [], selectedEventUids: [],
      additionalColumns: [{ key: "caller", title: "Caller", width: 120, sorter: true }],
      data: { filteredEventsColumns: ["gene", "tier", "pinned", "location"].map((id) => ({ id })) },
      dataset: {}, inViewport: true, columnFilters: {},
      resetColumnFilters: jest.fn(), setColumnFilters: jest.fn(),
    });
    panel.setState = (update) => {
      panel.state = { ...panel.state, ...(typeof update === "function" ? update(panel.state) : update) };
    };
    panel.componentDidMount();
    return panel;
  }

  const table = (panel) => findElementByType(panel.render(), "Table");
  const keys = (panel) => table(panel).props.columns.map((column) => column.key);
  const header = (panel, key) => {
    const column = table(panel).props.columns.find((item) => item.key === key);
    return column.onHeaderCell?.(column) || {};
  };

  it("moves real data headers while report, caller, and pinned columns stay put", () => {
    const panel = makePanel();
    expect(keys(panel)).toEqual(["select", "caller", "gene", "tier", "pinned", "location"]);
    for (const key of ["select", "caller", "pinned"]) {
      expect(header(panel, key).onColumnDragStart).toBeUndefined();
    }
    header(panel, "gene").onColumnDragStart("gene");
    expect(header(panel, "location").draggingColumnKey).toBe("gene");
    header(panel, "location").onColumnDrop("location");
    expect(keys(panel)).toEqual(["select", "caller", "tier", "location", "pinned", "gene"]);
    expect(panel.state.draggingColumnKey).toBeNull();
  });

  it("preserves order, widths, sorting and page size across hide/show and equivalent props", () => {
    const panel = makePanel();
    header(panel, "location").onColumnDragStart("location");
    header(panel, "gene").onColumnDrop("gene");
    panel.handleColumnResizeStop("gene")(null, { size: { width: 290 } });
    panel.handleTableChange({ pageSize: 10 }, { tier: [1] }, { columnKey: "gene", order: "descend" });
    panel.handleColumnSelectionChange(["gene", "caller", "pinned", "location"]);
    panel.handleColumnSelectionChange(["gene", "tier", "caller", "pinned", "location"]);
    panel.componentDidUpdate({ ...panel.props });
    expect(keys(panel)).toEqual(["select", "caller", "location", "gene", "pinned", "tier"]);
    const gene = table(panel).props.columns.find((column) => column.key === "gene");
    expect(gene.width).toBe(290);
    expect(gene.sortOrder).toBe("descend");
    expect(table(panel).props.pagination).toMatchObject({ pageSize: 10 });
    expect(panel.props.setColumnFilters).toHaveBeenCalledWith({ tier: [1] });
  });

  it("resets user order and drag state with defaults/configuration without losing pagination", () => {
    const panel = makePanel();
    header(panel, "gene").onColumnDragStart("gene");
    header(panel, "location").onColumnDrop("location");
    panel.state.pageSize = 10;
    panel.handleResetFilters();
    expect(keys(panel)).toEqual(["select", "caller", "gene", "tier", "pinned", "location"]);
    expect(panel.state.columnOrderKeys).toEqual([]);
    header(panel, "gene").onColumnDragStart("gene");
    const previousProps = panel.props;
    panel.props = { ...panel.props, dataset: { defaultVisibleFilteredEventsColumns: ["location", "gene"] } };
    panel.componentDidUpdate(previousProps);
    expect(keys(panel)).toEqual(["select", "caller", "location", "gene"]);
    expect(panel.state.draggingColumnKey).toBeNull();
    expect(panel.state.pageSize).toBe(10);
  });

  it("installs chevron-only sorting even on caller columns and independent resize handlers", () => {
    const panel = makePanel();
    for (const key of ["gene", "tier", "caller"]) {
      const column = table(panel).props.columns.find((item) => item.key === key);
      expect(header(panel, key).sortControlOnly).toBe(true);
      const control = column.sortIcon({ sortOrder: "ascend" });
      expect(control.type).toBe(ColumnSortControl);
      expect(control.props.sortOrder).toBe("ascend");
      expect(control.props.title).toBe(column.title);
    }
    expect(header(panel, "location").sortControlOnly).toBe(false);
    header(panel, "gene").onResize(null, { size: { width: 310 } });
    expect(panel.state.sortState).toEqual({ columnKey: null, order: null });
    header(panel, "gene").onColumnDragStart("gene");
    header(panel, "gene").onColumnDragEnd();
    expect(panel.state.draggingColumnKey).toBeNull();
    expect(keys(panel)).toEqual(["select", "caller", "gene", "tier", "pinned", "location"]);
  });

  const dragEvent = () => ({
    target: { closest: () => null },
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
    dataTransfer: { setData: jest.fn(), getData: jest.fn(() => "gene") },
  });
  const makeHeader = (panel, key) => {
    const title = new ResizableTitle(header(panel, key));
    title.setState = (update) => { title.state = { ...title.state, ...update }; };
    title.componentDidMount();
    return title;
  };
  const expectForeignDropIgnored = (panel, previousOrder) => {
    const target = makeHeader(panel, "location");
    const event = dragEvent();
    target.handleDragOver(event);
    target.handleDrop(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.dataTransfer.getData).not.toHaveBeenCalled();
    expect(keys(panel)).toEqual(previousOrder);
    target.componentWillUnmount();
  };

  it("cancels a removed source header so a foreign drop after remount cannot reorder", () => {
    const panel = makePanel();
    const previousOrder = keys(panel);
    const source = makeHeader(panel, "gene");
    source.handleDragStart(dragEvent());
    expect(panel.state.draggingColumnKey).toBe("gene");
    source.componentWillUnmount();
    expect(panel.state.draggingColumnKey).toBeNull();
    expectForeignDropIgnored(panel, previousOrder);
  });

  it.each([
    ["loading", { loading: true }],
    ["out of viewport", { inViewport: false }],
    ["missing", { missing: true }],
    ["error", { error: new Error("unavailable") }],
    ["event selection changes", { selectedFilteredEvent: { uid: "selected" } }],
  ])("cancels active drag when %s, before returning to a fresh header", (_, changedProps) => {
    const panel = makePanel();
    const previousOrder = keys(panel);
    header(panel, "gene").onColumnDragStart("gene");
    const previousProps = panel.props;
    panel.props = { ...previousProps, ...changedProps };
    panel.componentDidUpdate(previousProps);
    expect(panel.state.draggingColumnKey).toBeNull();
    const unavailableProps = panel.props;
    panel.props = previousProps;
    panel.componentDidUpdate(unavailableProps);
    expectForeignDropIgnored(panel, previousOrder);
  });

  it("cancels on column visibility, event-type and table changes without resetting user order", () => {
    const panel = makePanel();
    header(panel, "tier").onColumnDragStart("tier");
    header(panel, "gene").onColumnDrop("gene");
    const previousOrder = keys(panel);
    const selectedKeys = panel.state.selectedColumnKeys;
    header(panel, "gene").onColumnDragStart("gene");
    panel.handleColumnSelectionChange(selectedKeys.filter((key) => key !== "gene"));
    expect(panel.state.draggingColumnKey).toBeNull();
    panel.handleColumnSelectionChange(selectedKeys);
    expectForeignDropIgnored(panel, previousOrder);
    header(panel, "gene").onColumnDragStart("gene");
    panel.handleSegmentedChange("snv");
    expect(panel.state.draggingColumnKey).toBeNull();
    header(panel, "gene").onColumnDragStart("gene");
    panel.handleTableChange({ pageSize: 10 }, {}, { columnKey: "tier", order: "ascend" });
    expect(panel.state.draggingColumnKey).toBeNull();
    expectForeignDropIgnored(panel, previousOrder);
  });

  it("ignores child cleanup during parent teardown, but accepts it after a StrictMode remount", () => {
    const panel = makePanel();
    const source = makeHeader(panel, "gene");
    source.handleDragStart(dragEvent());
    panel.componentWillUnmount();
    const setState = panel.setState;
    panel.setState = jest.fn(setState);
    source.componentWillUnmount();
    expect(panel.setState).not.toHaveBeenCalled();
    panel.componentDidMount();
    expect(panel.state.draggingColumnKey).toBeNull();
    const nextSource = makeHeader(panel, "gene");
    nextSource.handleDragStart(dragEvent());
    nextSource.componentWillUnmount();
    expect(panel.state.draggingColumnKey).toBeNull();
  });

  it("uses the table's native horizontal scrollbar and native pagination", () => {
    const panel = makePanel();
    panel.props = { ...panel.props, filteredEvents: [{ uid: "event", eventType: "snv" }] };
    const table = findElementByType(panel.render(), "Table");

    expect(table.props.pagination).toEqual({ pageSize: 50 });
    expect(table.props.scroll).toEqual({ x: expect.any(Number), y: 500 });
    expect(table.props.scroll.x).toBeGreaterThan(0);
    expect(table.props.dataSource).toBe(panel.props.filteredEvents);
    expect(findElementByType(panel.render(), "Slider")).toBeNull();
  });

  it("styles both native scrollbars at rest instead of relying on an overlay scrollbar gutter", () => {
    const Wrapper = jest.requireActual("./index.style").default;
    const styles = Wrapper.componentStyle.rules.join("");

    expect(styles).toMatch(/\.ant-table-body,[^{]*\.ant-table-content\s*\{[^}]*overflow-x: scroll !important/);
    expect(styles).toMatch(/\.ant-table-body,[^{]*\.ant-table-content\s*\{[^}]*scrollbar-gutter: stable/);
    expect(styles).toMatch(/\.ant-table-body\s*\{[^}]*overflow-y: scroll !important/);
    expect(styles).toMatch(/&::-webkit-scrollbar\s*\{[^}]*width: 12px;[^}]*height: 12px/);
    expect(styles).toMatch(/&::-webkit-scrollbar-thumb\s*\{[^}]*background: #8c8c8c/);
    expect(styles).toMatch(/&::-webkit-scrollbar-track,[^{]*&::-webkit-scrollbar-corner\s*\{[^}]*background: #f0f0f0/);
    // Non-auto standard scrollbar styles override WebKit pseudo-elements in Chrome.
    expect(styles).toContain("scrollbar-width: auto");
    expect(styles).toContain("scrollbar-color: auto");
    expect(styles).not.toContain("horizontal-scroll-controls");
  });

  it("updates the table's native overflow width after a column resize", () => {
    const panel = makePanel();
    const before = findElementByType(panel.render(), "Table");
    panel.handleColumnResizeStop("gene")(null, { size: { width: 400 } });
    const after = findElementByType(panel.render(), "Table");

    expect(after.props.scroll.x).toBeGreaterThan(before.props.scroll.x);
  });
});

describe("FilteredEventsListPanel resize commits", () => {
  let panel;

  beforeEach(() => {
    panel = new FilteredEventsListPanel({});
    panel.setState = jest.fn((update) => {
      panel.state = {
        ...panel.state,
        ...(typeof update === "function" ? update(panel.state) : update),
      };
    });
  });

  afterEach(() => panel.componentWillUnmount());

  it("stages rapid drag widths without rerendering and commits the latest width once on stop", () => {
    panel.state.columnWidths = { location: 250 };
    const resize = panel.handleColumnResize("gene");
    [180, 210, 290, 360].forEach((width) => resize(null, { size: { width } }));

    expect(panel.setState).not.toHaveBeenCalled();
    panel.handleColumnResizeStop("gene")(null, { size: { width: 410 } });
    expect(panel.setState).toHaveBeenCalledTimes(1);
    expect(panel.state.columnWidths).toEqual({ gene: 410, location: 250 });
  });

  it("ignores invalid widths and clamps the final committed width", () => {
    const resize = panel.handleColumnResize("gene");
    [NaN, Infinity, undefined].forEach((width) => resize(null, { size: { width } }));
    expect(panel.setState).not.toHaveBeenCalled();

    panel.handleColumnResizeStop("gene")(null, { size: { width: -20 } });
    expect(panel.state.columnWidths.gene).toBe(100);
  });

  it("discards staged widths on unmount and accepts a fresh commit after remount", () => {
    panel.handleColumnResize("gene")(null, { size: { width: 260 } });
    panel.componentWillUnmount();
    panel.handleColumnResizeStop("gene")(null, { size: { width: 300 } });
    expect(panel.setState).not.toHaveBeenCalled();

    panel.componentDidMount();
    panel.setState.mockClear();
    panel.handleColumnResizeStop("tier")(null, { size: { width: 140 } });
    expect(panel.setState).toHaveBeenCalledTimes(1);
    expect(panel.state.columnWidths).toEqual({ tier: 140 });
  });
});

describe("FilteredEventsListPanel pagination", () => {
  it("updates the controlled page size when the per-page selection changes", () => {
    const records = Array.from({ length: 60 }, (_, index) => ({
      uid: `event-${index}`,
      eventType: "snv",
    }));
    const setColumnFilters = jest.fn();
    buildColumnsFromSettings.mockReturnValue([]);
    const panel = new FilteredEventsListPanel({
      t: (key) => key,
      id: "case-1",
      filteredEvents: records,
      originalFilteredEvents: records,
      selectedFilteredEvent: null,
      selectedEventUids: [],
      columnFilters: {},
      viewMode: "detail",
      loading: false,
      error: null,
      missing: false,
      selectFilteredEvent: jest.fn(),
      setSelectedEventUids: jest.fn(),
      setColumnFilters,
      additionalColumns: [],
      data: { filteredEventsColumns: [] },
      dataset: { id: "dataset-1" },
      inViewport: true,
    });
    panel.setState = (update) => {
      const nextState =
        typeof update === "function"
          ? update(panel.state, panel.props)
          : update;
      panel.state = { ...panel.state, ...nextState };
    };

    const table = findElementByType(panel.render(), "Table");
    expect(table.props.pagination).toEqual({ pageSize: 50 });
    expect(table.props.pagination.current).toBeUndefined();
    expect(table.props.dataSource).toBe(records);

    table.props.onChange({ current: 1, pageSize: 10 }, {}, {});

    expect(panel.state.pageSize).toBe(10);
    expect(findElementByType(panel.render(), "Table").props.pagination).toMatchObject({
      pageSize: 10,
    });
  });
});

describe("FilteredEventsListPanel report selection", () => {
  it("renders a labeled fixed tri-state checkbox column outside resizable data columns", () => {
    const records = [
      { uid: "tier-1", tier: 1 },
      { uid: "tier-2", tier: "2" },
      { uid: "tier-3", tier: 3 },
      { uid: null, tier: 1 },
    ];
    const setSelectedEventUids = jest.fn();
    buildColumnsFromSettings.mockReturnValue([
      { key: "gene", title: "Gene", width: 140 },
    ]);
    const panel = new FilteredEventsListPanel({
      t: (key) => key,
      id: "case-1",
      filteredEvents: records,
      originalFilteredEvents: records,
      selectedFilteredEvent: null,
      selectedEventUids: ["tier-1"],
      columnFilters: {},
      viewMode: "detail",
      loading: false,
      error: null,
      missing: false,
      selectFilteredEvent: jest.fn(),
      setSelectedEventUids,
      additionalColumns: [],
      data: { filteredEventsColumns: [{ id: "gene" }] },
      dataset: { id: "dataset-1" },
      inViewport: true,
    });
    panel.state = {
      ...panel.state,
      selectedColumnKeys: ["gene"],
    };

    const table = findElementByType(panel.render(), "Table");
    const selectionColumn = table.props.columns[0];

    expect(selectionColumn).toMatchObject({
      key: "select",
      width: 150,
      fixed: "left",
      align: "center",
    });
    expect(selectionColumn.title).toMatchObject({
      type: "Checkbox",
      props: {
        checked: false,
        indeterminate: true,
        children: "components.filtered-events-panel.add-to-report",
      },
    });
    expect(table.props.columns[1].width).toBe(140);

    selectionColumn.title.props.onChange();
    expect(setSelectedEventUids).toHaveBeenCalledWith([
      "tier-1",
      "tier-2",
      "tier-3",
    ]);

    const { props: rowCheckboxProps } = selectionColumn.render(null, records[1]);
    rowCheckboxProps.onChange({ target: { checked: true } });
    expect(setSelectedEventUids).toHaveBeenLastCalledWith([
      "tier-1",
      "tier-2",
    ]);

    const { props: uidlessCheckboxProps } = selectionColumn.render(null, records[3]);
    expect(uidlessCheckboxProps.disabled).toBe(true);
    uidlessCheckboxProps.onChange({ target: { checked: true } });
    expect(setSelectedEventUids).toHaveBeenCalledTimes(2);

    panel.props = {
      ...panel.props,
      selectedEventUids: ["tier-1", "tier-2", "tier-3"],
    };
    expect(panel.getHeaderCheckboxState(records)).toEqual({
      checked: true,
      indeterminate: false,
    });

    panel.handleHeaderCheckboxChange(records);
    expect(setSelectedEventUids).toHaveBeenLastCalledWith([]);

    buildColumnsFromSettings.mockReturnValue([
      {
        key: "gene",
        title: "Gene",
        width: 140,
        filteredValue: ["missing"],
        onFilter: (value, record) => record.gene === value,
      },
    ]);
    setSelectedEventUids.mockClear();
    const emptyHeaderCheckbox = findElementByType(
      panel.render(),
      "Table"
    ).props.columns[0].title;

    expect(emptyHeaderCheckbox.props.disabled).toBe(true);
    emptyHeaderCheckbox.props.onChange();
    expect(setSelectedEventUids).not.toHaveBeenCalled();
  });

  it("selects every filtered row across pages and preserves rows hidden by filters", () => {
    const matchingRecords = Array.from({ length: 53 }, (_, index) => ({
      uid: `matching-${index}`,
      tier: (index % 3) + 1,
      group: "matching",
      eventType: "snv",
    }));
    const outsideSelected = {
      uid: "outside-selected",
      tier: 1,
      group: "outside",
      eventType: "snv",
    };
    const outsideUnselected = {
      uid: "outside-unselected",
      tier: 3,
      group: "matching",
      eventType: "cna",
    };
    const records = [
      ...matchingRecords,
      outsideSelected,
      outsideUnselected,
    ];
    const initiallySelected = records
      .filter((record) => +record.tier === 1 || +record.tier === 2)
      .map((record) => record.uid);
    const setSelectedEventUids = jest.fn();
    const filterColumns = [
      {
        key: "tier",
        title: "Tier",
        width: 120,
        filteredValue: [1, 2, 3],
        onFilter: (value, record) => +record.tier === +value,
      },
      {
        key: "group",
        title: "Group",
        width: 120,
        filteredValue: ["matching"],
        onFilter: (value, record) => record.group === value,
      },
    ];
    buildColumnsFromSettings.mockReturnValue(filterColumns);
    const panel = new FilteredEventsListPanel({
      t: (key) => key,
      id: "case-1",
      filteredEvents: records,
      originalFilteredEvents: records,
      selectedFilteredEvent: null,
      selectedEventUids: initiallySelected,
      columnFilters: { tier: [1, 2, 3], group: ["matching"] },
      viewMode: "detail",
      loading: false,
      error: null,
      missing: false,
      selectFilteredEvent: jest.fn(),
      setSelectedEventUids,
      additionalColumns: [],
      data: {
        filteredEventsColumns: [{ id: "tier" }, { id: "group" }],
      },
      dataset: { id: "dataset-1" },
      inViewport: true,
    });
    panel.state = {
      ...panel.state,
      eventType: "snv",
      selectedColumnKeys: ["tier", "group"],
    };

    const table = findElementByType(panel.render(), "Table");
    const headerCheckbox = table.props.columns[0].title;

    expect(table.props.pagination).toMatchObject({ pageSize: 50 });
    expect(headerCheckbox.props.checked).toBe(false);
    expect(headerCheckbox.props.indeterminate).toBe(true);

    headerCheckbox.props.onChange();

    const selectedAcrossPages = setSelectedEventUids.mock.calls[0][0];
    expect(new Set(selectedAcrossPages)).toEqual(
      new Set([
        ...matchingRecords.map((record) => record.uid),
        outsideSelected.uid,
      ])
    );
    expect(selectedAcrossPages).not.toContain(outsideUnselected.uid);

    panel.props = {
      ...panel.props,
      selectedEventUids: selectedAcrossPages,
    };
    headerCheckbox.props.onChange();
    expect(setSelectedEventUids).toHaveBeenLastCalledWith([
      outsideSelected.uid,
    ]);
  });
});

describe("FilteredEventsListPanel filtered event details presentation", () => {
  it.each(["tracks", "detail"])(
    "routes an id-less %s selection through FilteredEventDetailsModal after the table handoff",
    (viewMode) => {
      const selectedEvent = {
        uid: "17:7577568-17:7577568",
        gene: "TP53",
        location: "17:7577568-7577568 C>A",
        eventType: "snv",
      };
      const selectFilteredEvent = jest.fn();
      buildColumnsFromSettings.mockReturnValue([]);
      createPortal.mockClear();
      const previousDocument = global.document;
      global.document = { body: {} };

      const panel = new FilteredEventsListPanel({
        t: (key) => key,
        id: "case-1",
        filteredEvents: [selectedEvent],
        originalFilteredEvents: [selectedEvent],
        selectedFilteredEvent: selectedEvent,
        selectedEventUids: [],
        columnFilters: {},
        viewMode,
        loading: false,
        error: null,
        missing: false,
        selectFilteredEvent,
        setSelectedEventUids: jest.fn(),
        setColumnFilters: jest.fn(),
        resetColumnFilters: jest.fn(),
        additionalColumns: [],
        data: { filteredEventsColumns: [] },
        dataset: { id: "dataset-1" },
        inViewport: true,
      });
      panel.setState = (update) => {
        const nextState =
          typeof update === "function"
            ? update(panel.state, panel.props)
            : update;
        panel.state = { ...panel.state, ...nextState };
      };

      const view = panel.render();
      const openingTable = findElementByType(view, "Table");
      const filteredEventDetailsModal = createPortal.mock.calls[0][0];

      expect(openingTable).not.toBeNull();
      expect(openingTable.props.rowClassName).toBe(
        "filtered-events-event-row",
      );
      expect(filteredEventDetailsModal.type).toBe(
        "FilteredEventDetailsModal",
      );
      expect(filteredEventDetailsModal.props.open).toBe(true);
      expect(filteredEventDetailsModal.props.initialTab).toBe(viewMode);
      expect(filteredEventDetailsModal.props.record).toBe(selectedEvent);
      expect(filteredEventDetailsModal.props).not.toHaveProperty("title");
      expect(filteredEventDetailsModal.props).not.toHaveProperty(
        "selectedVariantId",
      );

      panel.handleColumnDragStart("gene");
      filteredEventDetailsModal.props.afterOpenChange(true);

      expect(panel.state.draggingColumnKey).toBeNull();
      expect(panel.state.filteredEventDetailsModalPresented).toBe(true);
      expect(findElementByType(panel.render(), "Table")).toBeNull();

      const previousProps = panel.props;
      panel.props = { ...panel.props, selectedFilteredEvent: null };
      panel.componentDidUpdate(previousProps);

      expect(panel.state.filteredEventDetailsModalPresented).toBe(false);
      global.document = previousDocument;
    },
  );
});

describe("FilteredEventsListPanel exact-event histogram", () => {
  it("renders weighted history without a current-user retier", () => {
    const record = {
      uid: "1:100-1:100",
      gene: "TP53",
      variant: "p.Arg1Gly / c.1A>G",
      type: "Missense",
    };
    const panel = new FilteredEventsListPanel({
      filteredEvents: [record],
      originalFilteredEvents: [{ ...record, tier: 2 }],
      tierCountsByEvent: {
        '["1:100-1:100","TP53","p.Arg1Gly / c.1A>G","Missense"]': {
          1: 7,
          2: 1,
          3: 0,
        },
      },
      interpretationsStatus: "succeeded",
    });

    const tooltip = panel.getTierTooltipContent(record);

    expect(tooltip.type).toBe("TierDistributionBarChart");
    expect(tooltip.props.tierCounts).toEqual({ 1: 7, 2: 1, 3: 0 });
    expect(tooltip.props.variant).toBe("p.Arg1Gly / c.1A>G");
  });
});
