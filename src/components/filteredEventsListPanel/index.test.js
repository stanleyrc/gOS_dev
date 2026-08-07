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
jest.mock("antd", () => ({
  Tag: "Tag",
  Table: "Table",
  Button: "Button",
  Space: "Space",
  Row: "Row",
  Col: "Col",
  Segmented: "Segmented",
  Skeleton: "Skeleton",
  Select: "Select",
}));
jest.mock("d3", () => ({ group: jest.fn(() => new Map()) }));
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
    toggleEventUidSelection: jest.fn(),
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

import { FilteredEventsListPanel } from "./index";

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
