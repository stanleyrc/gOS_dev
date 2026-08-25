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
  Tag: "Tag",
  Typography: { Text: "Text" },
}));
jest.mock("../tracksModal", () => "TracksModal");
jest.mock("../alterationCard", () => "AlterationCard");
jest.mock("../../helpers/utility", () => ({
  roleColorMap: () => ({ oncogenic: "red", resistance: "blue" }),
}));
jest.mock("./index.style", () => "Wrapper");

import React from "react";
import { Modal, Spin, Tabs } from "antd";
import { FilteredEventDetailsModal } from "./index";

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
    initialTab: "detail",
    record: { uid: "event-1", gene: "TP53" },
    genome: { loading: false },
    ...overrides,
  };
}

function createModal(overrides = {}) {
  const modal = new FilteredEventDetailsModal(modalProps(overrides));
  modal.setState = (update) => {
    const nextState =
      typeof update === "function"
        ? update(modal.state, modal.props)
        : update;
    modal.state = { ...modal.state, ...nextState };
  };
  return modal;
}

describe("FilteredEventDetailsModal", () => {
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
      "components.filtered-event-details-modal.tabs.plots",
      "components.filtered-event-details-modal.tabs.alteration",
      "components.filtered-event-details-modal.tabs.variantQc",
    ]);

    const plotsContent = tabs.props.items.find(
      ({ key }) => key === "plots",
    ).children;
    const tracks = findElementByType(plotsContent, "TracksModal");
    expect(tracks.props).toMatchObject({
      open: true,
      viewType: "inline",
      contentView: "plots",
      genome: { loading: false },
      selectedVariantId: "event-1",
    });
    expect(tracks.props).not.toHaveProperty("handleOkClicked");
    expect(tracks.props).not.toHaveProperty("handleCancelClicked");
    expect(tracks.props).not.toHaveProperty("modalTitle");
    expect(tracks.props).not.toHaveProperty("loading");
  });

  it("derives the ordered heading and role colors from the record", () => {
    const modalComponent = createModal({
      record: {
        uid: "event-1",
        gene: "TP53",
        name: "p.R248Q",
        type: "Missense",
        role: " oncogenic, resistance ",
        tier: 1,
        location: "17:7577539-7577539 G>A",
      },
    });

    const modal = findElementByType(modalComponent.render(), Modal);
    const headingParts = React.Children.toArray(
      modal.props.title.props.children,
    ).map((part) =>
      React.isValidElement(part)
        ? {
            type: part.type,
            label: part.props.children,
            color: part.props.color,
          }
        : part,
    );

    expect(headingParts).toEqual([
      "TP53",
      "p.R248Q",
      "Missense",
      { type: "Tag", label: "oncogenic", color: "red" },
      { type: "Tag", label: "resistance", color: "blue" },
      1,
      "17:7577539-7577539 G>A",
    ]);
    expect(modal.props.title).not.toBe("Report");
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
    };
    modalComponent.componentDidUpdate(previousProps);

    expect(modalComponent.state.contentReady).toBe(false);
    expect(modalComponent.state.activeTab).toBe("alteration");
  });
});
