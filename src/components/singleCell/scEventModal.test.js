import React from "react";
import { Provider } from "react-redux";
import { combineReducers, createStore } from "redux";
import { render, screen } from "@testing-library/react";

jest.mock("../filteredEventDetailsModal", () => (props) => <div data-testid="modal" data-open={String(props.open)} data-gene={props.record?.gene} />);

const makeStore = (tab, record) => {
  const constant = (value) => (s = value) => s;
  return createStore(
    combineReducers({
      FilteredEvents: constant({ selectedFilteredEvent: record, viewMode: "plots" }),
      Settings: constant({ tab, chromoBins: {} }),
      Genome: constant({}),
      Mutations: constant({}),
      Allelic: constant({}),
      GenomeCoverage: constant({}),
      MethylationBetaCoverage: constant({}),
      MethylationIntensityCoverage: constant({}),
      Hetsnps: constant({}),
      Genes: constant({}),
      Igv: constant({}),
    })
  );
};

describe("ScEventModal", () => {
  it("renders the popup on single-cell tabs when an event is selected", () => {
    const ScEventModal = require("./scEventModal").default;
    render(
      <Provider store={makeStore(12, { gene: "CDK4", uid: "x" })}>
        <ScEventModal />
      </Provider>
    );
    const modal = screen.getByTestId("modal");
    expect(modal.getAttribute("data-open")).toBe("true");
    expect(modal.getAttribute("data-gene")).toBe("CDK4");
  });
  it("stays out of the way on the Overall and Filtered Events tabs", () => {
    const ScEventModal = require("./scEventModal").default;
    render(
      <Provider store={makeStore(1, { gene: "CDK4", uid: "x" })}>
        <ScEventModal />
      </Provider>
    );
    expect(screen.queryByTestId("modal")).toBeNull();
  });
});
