/** @jest-environment node */
/* eslint-disable import/first */

jest.mock("react-i18next", () => ({
  withTranslation: () => (Component) => Component,
}));
jest.mock("antd", () => ({
  Alert: "Alert",
  Modal: "Modal",
  Space: "Space",
  Spin: "Spin",
  Tabs: "Tabs",
  Typography: { Text: "Text" },
}));
jest.mock("../tracksModal", () => "TracksModal");
jest.mock("../alterationCard", () => "AlterationCard");
jest.mock("./index.style", () => "Wrapper");

import React from "react";
import { Modal, Spin, Tabs } from "antd";
import {
  getFilteredEventModalTab,
  ReportModal,
} from "./index";

function findElementByType(node, type) {
  if (!React.isValidElement(node)) return null;
  if (node.type === type) return node;

  for (const child of React.Children.toArray(node.props.children)) {
    const match = findElementByType(child, type);
    if (match) return match;
  }
  return null;
}

function modalProps(overrides = {}) {
  return {
    t: (key) => key,
    open: true,
    onClose: jest.fn(),
    afterOpenChange: jest.fn(),
    title: "TP53",
    initialTab: "detail",
    record: { uid: "event-1", gene: "TP53" },
    selectedVariantId: "event-1",
    genome: { loading: false },
    ...overrides,
  };
}

function createModal(overrides = {}) {
  const modal = new ReportModal(modalProps(overrides));
  modal.setState = (update) => {
    const nextState =
      typeof update === "function"
        ? update(modal.state, modal.props)
        : update;
    modal.state = { ...modal.state, ...nextState };
  };
  return modal;
}

describe("getFilteredEventModalTab", () => {
  it.each([
    ["detail", "alteration"],
    ["alteration", "alteration"],
    ["tracks", "plots"],
    ["plots", "plots"],
    ["variantQc", "variantQc"],
    [undefined, "alteration"],
    ["unknown", "alteration"],
  ])("maps %p to %s", (viewMode, expectedTab) => {
    expect(getFilteredEventModalTab(viewMode)).toBe(expectedTab);
  });
});

describe("ReportModal unified filtered-event inspection", () => {
  it("commits one lightweight shell before opening Plots", () => {
    const afterOpenChange = jest.fn();
    const modalComponent = createModal({
      initialTab: "tracks",
      afterOpenChange,
    });

    const openingView = modalComponent.render();
    const modal = findElementByType(openingView, Modal);

    expect(modal).not.toBeNull();
    expect(findElementByType(openingView, Spin)).not.toBeNull();
    expect(findElementByType(openingView, Tabs)).toBeNull();

    modal.props.afterOpenChange(true);

    const tabs = findElementByType(modalComponent.render(), Tabs);
    expect(afterOpenChange).toHaveBeenCalledWith(true);
    expect(tabs.props.activeKey).toBe("plots");
    expect(tabs.props.items.map(({ key }) => key)).toEqual([
      "plots",
      "alteration",
      "variantQc",
    ]);
    expect(tabs.props.items.map(({ label }) => label)).toEqual([
      "components.report-modal.tabs.plots",
      "components.report-modal.tabs.alteration",
      "components.report-modal.tabs.variantQc",
    ]);

    const plotsContent = tabs.props.items.find(
      ({ key }) => key === "plots",
    ).children;
    const tracks = findElementByType(plotsContent, "TracksModal");
    expect(tracks.props.contentView).toBe("plots");
    expect(tracks.props.selectedVariantId).toBe("event-1");
  });

  it("opens Alteration from detail mode and switches to Variant QC", () => {
    const modalComponent = createModal({ initialTab: "detail" });
    modalComponent.handleModalOpenChange(true);

    let tabs = findElementByType(modalComponent.render(), Tabs);
    const alteration = tabs.props.items.find(
      ({ key }) => key === "alteration",
    ).children;
    expect(tabs.props.activeKey).toBe("alteration");
    expect(alteration.type).toBe("AlterationCard");

    tabs.props.onChange("variantQc");
    tabs = findElementByType(modalComponent.render(), Tabs);
    const variantQcContent = tabs.props.items.find(
      ({ key }) => key === "variantQc",
    ).children;
    const variantQc = findElementByType(variantQcContent, "TracksModal");

    expect(tabs.props.activeKey).toBe("variantQc");
    expect(variantQc.props.contentView).toBe("variantQc");
    expect(
      tabs.props.items.find(({ key }) => key === "plots").children,
    ).toBeNull();
  });

  it("resets content and the cell-derived tab for the next selection", () => {
    const modalComponent = createModal({ initialTab: "tracks" });
    modalComponent.handleModalOpenChange(true);
    modalComponent.handleTabChange("variantQc");

    const previousProps = modalComponent.props;
    modalComponent.props = {
      ...previousProps,
      open: false,
      initialTab: "detail",
      record: { uid: "event-2", gene: "KRAS" },
      selectedVariantId: "event-2",
    };
    modalComponent.componentDidUpdate(previousProps);

    expect(modalComponent.state.contentReady).toBe(false);
    expect(modalComponent.state.activeTab).toBe("alteration");
  });
});
