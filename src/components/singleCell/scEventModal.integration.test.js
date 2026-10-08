import { TextDecoder, TextEncoder } from "util";
import React from "react";

// apache-arrow (reached through helpers/utility) needs these in jsdom
if (typeof global.TextDecoder === "undefined") global.TextDecoder = TextDecoder;
if (typeof global.TextEncoder === "undefined") global.TextEncoder = TextEncoder;
import { Provider } from "react-redux";
import { combineReducers, createStore } from "redux";
import { act, render, screen } from "@testing-library/react";

// d3 is ESM-only (Jest cannot parse it) and only reached through import-time
// helpers of unrelated reducers here: a chainable stand-in is enough.
jest.mock("d3", () => {
  const chain = new Proxy(function chainFn() {}, { get: (t, p) => (p === Symbol.toPrimitive ? () => 0 : chain), apply: () => chain });
  return new Proxy({}, { get: (t, p) => (p === "__esModule" ? true : chain) });
});
// children that pull in d3 / igv are stubbed; everything else is real
jest.mock("../tracksModal", () => () => <div data-testid="tracks" />);
jest.mock("./eventCellTracks", () => ({ __esModule: true, default: () => <div data-testid="event-tracks" />, EventReads: () => <div data-testid="event-reads" /> }));
jest.mock("../alterationCard", () => () => <div data-testid="alteration" />);

describe("ScEventModal with the real reducers and modal", () => {
  it("shows the popup after selectFilteredEvent on a single-cell tab", async () => {
    const reducers = require("../../redux/reducers").default;
    const filteredEventsActions = require("../../redux/filteredEvents/actions").default;
    const settingsActions = require("../../redux/settings/actions").default;
    const ScEventModal = require("./scEventModal").default;
    const store = createStore(combineReducers(reducers));
    act(() => {
      store.dispatch(settingsActions.updateTab(12));
    });
    render(
      <Provider store={store}>
        <ScEventModal />
      </Provider>
    );
    expect(document.querySelector(".ant-modal")).toBeNull();
    await act(async () => {
      store.dispatch(filteredEventsActions.selectFilteredEvent({ uid: "e1", gene: "MDM2", type: "SCNA", role: "Oncogene", tier: "1", location: "12:1-2", cell_ids: "a,b", vartype: "AMP" }, "plots"));
    });
    expect(store.getState().FilteredEvents.selectedFilteredEvent?.gene).toBe("MDM2");
    expect(`${store.getState().Settings.tab}`).toBe("12");
    expect(document.querySelector(".ant-modal")).not.toBeNull();
    expect(screen.getAllByText(/MDM2/).length).toBeGreaterThan(0);
  });
});
