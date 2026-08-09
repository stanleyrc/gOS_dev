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
    Tag: "Tag",
    Table: "Table",
    Button: "Button",
    Space: "Space",
    Row: "Row",
    Col: "Col",
    Segmented: "Segmented",
    Skeleton: "Skeleton",
    Select,
    Checkbox: "Checkbox",
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
  roleColorMap: () => ({}),
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
jest.mock("../tracksModal", () => "TracksModal");
jest.mock("./index.style", () => "Wrapper");
jest.mock("../errorPanel", () => "ErrorPanel");
jest.mock("../reportModal", () => "ReportModal");
jest.mock("../tierDistributionBarChart", () => "TierDistributionBarChart");
jest.mock("./columnBuilders", () => ({ buildColumnsFromSettings: jest.fn() }));

import React from "react";
import { buildColumnsFromSettings } from "./columnBuilders";
import { FilteredEventsListPanel } from "./index";

function findElementByType(node, type) {
  if (!React.isValidElement(node)) return null;
  if (node.type === type) return node;

  for (const child of React.Children.toArray(node.props.children)) {
    const match = findElementByType(child, type);
    if (match) return match;
  }
  return null;
}

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

    const rowCheckbox = selectionColumn.render(null, records[1]);
    rowCheckbox.props.onChange({ target: { checked: true } });
    expect(setSelectedEventUids).toHaveBeenLastCalledWith([
      "tier-1",
      "tier-2",
    ]);

    const uidlessCheckbox = selectionColumn.render(null, records[3]);
    expect(uidlessCheckbox.props.disabled).toBe(true);
    uidlessCheckbox.props.onChange({ target: { checked: true } });
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

    expect(table.props.pagination).toEqual({ pageSize: 50 });
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
