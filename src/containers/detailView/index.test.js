/** @jest-environment node */
/* eslint-disable import/first */

import React from "react";

jest.mock("react-redux", () => ({
  connect: () => (Component) => Component,
}));
jest.mock("react-i18next", () => ({
  withTranslation: () => (Component) => Component,
}));
jest.mock("react-router-dom", () => ({
  withRouter: (Component) => Component,
}));
jest.mock("antd", () => ({
  Skeleton: "Skeleton",
  Affix: "Affix",
  Tabs: "Tabs",
}));
jest.mock("../../components/headerPanel", () => "HeaderPanel");
jest.mock("../../tabs/summaryTab", () => "SummaryTab");
jest.mock("../../tabs/filteredEventsTab", () => "FilteredEventsTab");
jest.mock("../../tabs/tracksTab", () => "TracksTab");
jest.mock("../../tabs/populationTab", () => "PopulationTab");
jest.mock("../../tabs/sageQcTab", () => "SageQcTab");
jest.mock("../../tabs/binQCTab", () => "BinQCTab");
jest.mock("../../tabs/signaturesTab", () => "SignaturesTab");
jest.mock("./index.style", () => "Wrapper");

import { DetailView } from "./index";

const availability = (overrides = {}) => ({
  0: true,
  1: true,
  2: true,
  3: true,
  4: true,
  5: true,
  6: true,
  ...overrides,
});

const props = (overrides = {}) => ({
  t: (key) => key,
  loading: false,
  pair: "PAIR-1",
  tab: "1",
  tabAvailability: availability(),
  canReturnToResults: true,
  updateTab: jest.fn(),
  updateCaseReport: jest.fn(),
  ...overrides,
});

const findElement = (node, type) => {
  if (Array.isArray(node)) {
    return node.map((child) => findElement(child, type)).find(Boolean);
  }
  if (!React.isValidElement(node)) return null;
  if (node.type === type) return node;
  return findElement(node.props.children, type);
};

describe("DetailView disabled tabs", () => {
  it("routes a disabled active tab to the first enabled tab", () => {
    const componentProps = props({
      tab: "2",
      tabAvailability: availability({ 0: false, 1: true, 2: false }),
    });
    const detailView = new DetailView(componentProps);

    detailView.redirectDisabledTab();

    expect(componentProps.updateTab).toHaveBeenCalledWith("1");
  });

  it("does not reroute an enabled active tab", () => {
    const componentProps = props();
    const detailView = new DetailView(componentProps);

    detailView.redirectDisabledTab();

    expect(componentProps.updateTab).not.toHaveBeenCalled();
  });

  it("marks unavailable Ant Tabs items disabled", () => {
    const detailView = new DetailView(
      props({ tabAvailability: availability({ 2: false, 5: false }) })
    );
    const tabs = findElement(detailView.render(), "Tabs");

    expect(tabs.props.items.find(({ key }) => key === "2").disabled).toBe(true);
    expect(tabs.props.items.find(({ key }) => key === "5").disabled).toBe(true);
    expect(tabs.props.items.find(({ key }) => key === "1").disabled).toBe(false);
  });
});
