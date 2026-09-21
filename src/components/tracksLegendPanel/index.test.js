/** @jest-environment node */
/* eslint-disable import/first */

import React from "react";

jest.mock("react-container-dimensions", () => "ContainerDimensions");
jest.mock("react-in-viewport", () => (Component) => Component);
jest.mock("d3", () => ({ format: () => (value) => `${value}` }));
jest.mock("../../helpers/connection", () => class Connection {});
jest.mock("../../helpers/interval", () => class Interval {});
jest.mock("html-to-image", () => ({}));
jest.mock("./index.style", () => "Wrapper");
jest.mock("../genesPlotHiglass", () => "GenesPlot");
jest.mock("../cytobandsPlot", () => "CytobandsPlot");
jest.mock("./legend-multi-brush", () => "LegendMultiBrush");
jest.mock("./genomeRangePanel", () => "GenomeRangePanel");
jest.mock("../hoverLine", () => "HoverLine");

import { Card, Input, message } from "antd";
import { TracksLegendPanel } from "./index";

// Keep both utility functions and the shared parser real. Only plotting
// dependencies are isolated so these rendered Input contracts can run in Node.
const chromoBins = Object.freeze({
  1: Object.freeze({ startPoint: 1, endPoint: 1000, startPlace: 1, endPlace: 1000 }),
  2: Object.freeze({ startPoint: 1, endPoint: 500, startPlace: 1001, endPlace: 1500 }),
});
const initialDomains = Object.freeze([Object.freeze([100, 200])]);

function createPanel(overrides = {}) {
  const panel = new TracksLegendPanel({
    visible: true,
    loading: false,
    genesList: [],
    genesOptionsList: [],
    domains: initialDomains,
    chromoBins,
    selectedCoordinate: "hg38",
    yScaleMode: "common",
    t: (key) => key,
    updateDomains: jest.fn(),
    ...overrides,
  });
  panel.setState = jest.fn((update) => {
    panel.state = { ...panel.state, ...update };
  });
  return panel;
}

function findElementByType(node, type) {
  if (!React.isValidElement(node)) return null;
  if (node.type === type) return node;
  for (const child of React.Children.toArray(node.props.children)) {
    const match = findElementByType(child, type);
    if (match) return match;
  }
  return null;
}

function inputProps(panel) {
  const card = findElementByType(panel.render(), Card);
  return findElementByType(card.props.title, Input).props;
}

function change(panel, value) {
  inputProps(panel).onChange({ target: { value } });
}

let error;
beforeEach(() => {
  error = jest.spyOn(message, "error").mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe("TracksLegendPanel coordinate drafts", () => {
  it("derives canonical text from current domains when there is no draft", () => {
    const panel = createPanel();
    expect(inputProps(panel).value).toBe("1:100-1:200");

    panel.props = { ...panel.props, domains: [[1010, 1040], [300, 400]] };
    expect(inputProps(panel).value).toBe("2:10-2:40|1:300-1:400");
    expect(panel.state.locationString).toBeNull();
    expect(panel.props.updateDomains).not.toHaveBeenCalled();
  });

  it("does nothing on blur without an edit", () => {
    const panel = createPanel();
    inputProps(panel).onBlur();
    expect(panel.setState).not.toHaveBeenCalled();
    expect(panel.props.updateDomains).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it.each(["", " ", "\t\n"])("keeps blank draft %j until blur then restores", (draft) => {
    const panel = createPanel();
    change(panel, draft);
    expect(inputProps(panel).value).toBe(draft);
    expect(panel.props.updateDomains).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();

    inputProps(panel).onBlur();
    expect(inputProps(panel).value).toBe("1:100-1:200");
    expect(panel.state.locationString).toBeNull();
    expect(panel.props.domains).toBe(initialDomains);
    expect(panel.props.updateDomains).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("does not dispatch, validate, or navigate on edits or Enter, and never reloads on blur", () => {
    const originalWindow = global.window;
    const navigate = jest.fn();
    const href = "https://gos.test/?location=1%3A100-1%3A200&report=case-1";
    const location = { assign: navigate, replace: navigate, reload: navigate };
    Object.defineProperty(location, "href", { get: () => href, set: navigate });
    global.window = {};
    Object.defineProperty(global.window, "location", {
      get: () => location,
      set: navigate,
    });
    try {
      const panel = createPanel();
      for (const draft of ["", "1:", "1:50", "1:500"]) {
        change(panel, draft);
        const input = inputProps(panel);
        const enter = { key: "Enter", target: { value: draft } };
        input.onPressEnter?.(enter);
        input.onKeyDown?.(enter);
        input.onKeyPress?.(enter);
        input.onKeyUp?.(enter);
        expect(inputProps(panel).value).toBe(draft);
        expect(panel.props.updateDomains).not.toHaveBeenCalled();
        expect(error).not.toHaveBeenCalled();
        expect(navigate).not.toHaveBeenCalled();
        expect(input.onPressEnter).toBeUndefined();
      }
      inputProps(panel).onBlur();
      expect(panel.props.updateDomains).toHaveBeenCalledWith([[250, 750]]);
      for (const draft of ["", "invalid"]) {
        change(panel, draft);
        inputProps(panel).onBlur();
      }
      expect(panel.props.updateDomains).toHaveBeenCalledTimes(1);
      expect(navigate).not.toHaveBeenCalled();
      expect(window.location.href).toBe(href);
    } finally {
      if (originalWindow === undefined) delete global.window;
      else global.window = originalWindow;
    }
  });

  it.each([
    ["1:500", [[250, 750]], "1:250-1:750"],
    ["1:1", [[1, 251]], "1:1-1:251"],
    ["1:1000", [[750, 1000]], "1:750-1:1000"],
    ["2:499", [[1249, 1500]], "2:249-2:500"],
    ["1:300-400", [[300, 400]], "1:300-1:400"],
    ["1:300-1:400", [[300, 400]], "1:300-1:400"],
    ["1:900-2:100", [[900, 1100]], "1:900-2:100"],
    [" 2:10-40 | 1:300-1:400 ", [[1010, 1040], [300, 400]], "2:10-2:40|1:300-1:400"],
  ])("commits valid %s only on blur through the real parser", (draft, domains, canonical) => {
    const panel = createPanel();
    change(panel, draft);
    expect(inputProps(panel).value).toBe(draft);
    expect(panel.props.updateDomains).not.toHaveBeenCalled();

    inputProps(panel).onBlur();
    expect(panel.props.updateDomains).toHaveBeenCalledTimes(1);
    expect(panel.props.updateDomains).toHaveBeenCalledWith(domains);
    expect(panel.props.domains).toBe(initialDomains);
    expect(panel.state.locationString).toBeNull();
    expect(error).not.toHaveBeenCalled();

    // Emulate Redux supplying the committed domains; no stale draft masks them.
    panel.props = { ...panel.props, domains };
    expect(inputProps(panel).value).toBe(canonical);
    inputProps(panel).onBlur();
    expect(panel.props.updateDomains).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["1:100-1:200", [[100, 200]]],
    [" 1:100-200 ", [[100, 200]]],
    ["1:500", [[250, 750]]],
    ["1:100-200|2:10-40", [[100, 200], [1010, 1040]]],
  ])("does not dispatch equivalent domains for %s", (draft, domains) => {
    const panel = createPanel({ domains });
    change(panel, draft);
    inputProps(panel).onBlur();
    expect(panel.props.updateDomains).not.toHaveBeenCalled();
    expect(panel.state.locationString).toBeNull();
    expect(error).not.toHaveBeenCalled();
  });

  it.each([
    "not a coordinate",
    "1:",
    "1:100 A>G",
    "3:100",
    "1:0",
    "1:1001",
    "1:900-1100",
    "1:-150-1:350",
    "1:200-100",
    "1:100-200|2:501",
    "1:100|",
  ])("restores invalid %s with feedback and preserves domains", (draft) => {
    const panel = createPanel();
    change(panel, draft);
    expect(inputProps(panel).value).toBe(draft);
    expect(error).not.toHaveBeenCalled();

    expect(() => inputProps(panel).onBlur()).not.toThrow();
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith("components.tracks-legend-panel.invalid-location");
    expect(panel.props.updateDomains).not.toHaveBeenCalled();
    expect(panel.props.domains).toBe(initialDomains);
    expect(panel.state.locationString).toBeNull();
    expect(inputProps(panel).value).toBe("1:100-1:200");
  });

  it.each(["", "   ", "invalid", "2:10-40"])(
    "keeps draft %j across a prop update and restores latest domains on blur",
    (draft) => {
      const panel = createPanel();
      change(panel, draft);
      const latestDomains = [[1010, 1040]];
      panel.props = { ...panel.props, domains: latestDomains };
      expect(inputProps(panel).value).toBe(draft);

      inputProps(panel).onBlur();
      expect(inputProps(panel).value).toBe("2:10-2:40");
      expect(panel.props.domains).toBe(latestDomains);
      expect(panel.props.updateDomains).not.toHaveBeenCalled();
      expect(panel.state.locationString).toBeNull();
      expect(error).toHaveBeenCalledTimes(draft === "invalid" ? 1 : 0);
    },
  );
});
