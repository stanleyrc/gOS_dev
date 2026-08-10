/** @jest-environment node */
/* eslint-disable import/first */

import React from "react";

jest.mock("react-redux", () => ({
  connect: () => (Component) => Component,
}));
jest.mock("react-i18next", () => ({
  withTranslation: () => (Component) => Component,
}));
jest.mock("antd", () => {
  const Descriptions = () => null;
  Descriptions.Item = "DescriptionsItem";
  return {
    Card: "Card",
    Tag: "Tag",
    Typography: { Title: "Title", Text: "Text" },
    Descriptions,
    Avatar: "Avatar",
    Button: "Button",
    Tooltip: "Tooltip",
  };
});
jest.mock("react-icons/bs", () => ({ BsDashLg: "Dash" }));
jest.mock("./index.style", () => "Wrapper");
jest.mock("../../helpers/utility", () => ({
  tierColor: () => "blue",
  getTimeAgo: () => "recently",
}));
jest.mock("../../redux/interpretations/actions", () => ({
  __esModule: true,
  default: {
    fetchInterpretationsForCase: jest.fn(),
    updateInterpretation: jest.fn(),
  },
}));
jest.mock("../editableTextBlock", () => "EditableTextBlock");
jest.mock("../editablePillsBlock", () => "EditablePillsBlock");
jest.mock("../../helpers/interpretationHistory", () => ({
  getInterpretationSourceCaseId: (record) => record.caseId,
  getTierCountsForInterpretations: () => ({ 1: 0, 2: 0, 3: 0 }),
  getEffectiveFrequency: (record) => record.frequency || 1,
}));
jest.mock("../interpretationVersionsSidepanel", () =>
  "InterpretationVersionsSidepanel"
);
jest.mock("../../redux/interpretations/selectors", () => ({
  getInterpretationForAlteration: jest.fn(),
  getAllInterpretationsForEvent: jest.fn(() => []),
  getBaseEvent: jest.fn(),
}));
jest.mock("../tierDistributionBarChart", () => "TierDistributionBarChart");
jest.mock("../interpretationsAvatar", () => "InterpretationsAvatar");

import { AlterationCard } from "./index";

function findElementByClassName(node, className) {
  if (!React.isValidElement(node)) return null;
  const classes = `${node.props.className || ""}`.split(/\s+/);
  if (classes.includes(className)) return node;

  for (const child of React.Children.toArray(node.props.children)) {
    const match = findElementByClassName(child, className);
    if (match) return match;
  }
  return null;
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

function collectText(node) {
  if (node == null || typeof node === "boolean") return [];
  if (typeof node === "string" || typeof node === "number") {
    return [String(node)];
  }
  if (Array.isArray(node)) return node.flatMap(collectText);
  if (!React.isValidElement(node)) return [];
  return React.Children.toArray(node.props.children).flatMap(collectText);
}

describe("AlterationCard Tier History control", () => {
  it("renders a badge button beside the variant name", () => {
    const card = new AlterationCard({
      t: (key) =>
        [
          "components.alteration-card.tier-history",
          "components.interpretationVersionsSidepanel.tierHistoryTitle",
        ].includes(key)
          ? "Tier History"
          : key,
      record: {
        uid: "event-1",
        gene: "TP53",
        variant: "p.R175H",
        tier: 2,
      },
      interpretation: null,
      allInterpretations: [],
      baseRecord: { tier: 2 },
      tierCounts: { 1: 0, 2: 0, 3: 0 },
      interpretationsStatus: "succeeded",
      datasets: [],
    });
    card.setState = (nextState) => {
      card.state = { ...card.state, ...nextState };
    };

    const rendered = card.render();
    const heading = findElementByClassName(rendered, "variant-heading");
    const headingChildren = React.Children.toArray(heading.props.children);
    const historyTooltip = headingChildren[headingChildren.length - 1];
    const historyButton = historyTooltip.props.children;

    expect(collectText(heading).join(" ")).toContain("p.R175H Tier History");
    expect(historyButton.props).toMatchObject({
      type: "default",
      shape: "round",
      size: "small",
      className: "tier-history-button",
    });
    expect(collectText(rendered)).not.toContain("Switch Version");

    const historySidepanel = findElementByType(
      rendered,
      "InterpretationVersionsSidepanel",
    );
    expect(historySidepanel.props.title).toBe("Tier History");

    historyButton.props.onClick();
    expect(card.state.showVersions).toBe(true);
  });
});
