/** @jest-environment node */

/* eslint-disable import/first */

import fs from "fs";
import path from "path";
import React from "react";

const mockState = { Interpretations: { byGene: {} } };
jest.mock("../../../redux/interpretations/selectors", () => ({
  getAllInterpretationsForEvent: jest.fn(),
}));

jest.mock("../../../redux/store", () => ({
  store: { getState: () => mockState },
}));

import InterpretationsAvatar from "../../interpretationsAvatar";
import { getAllInterpretationsForEvent } from "../../../redux/interpretations/selectors";
import EventDetailRenderer from "./eventDetailRenderer";

const record = {
  uid: "1:100-1:100",
  gene: "CASZ1",
  variant: "c.*2285_*2286delTT",
  type: "UTR",
};

describe("EventDetailRenderer", () => {
  it("opens the selected event in detail mode", () => {
    getAllInterpretationsForEvent.mockReturnValue([]);
    const selectFilteredEvent = jest.fn();
    const renderer = new EventDetailRenderer({
      value: "c.*2285_*2286delTT",
      record,
      selectFilteredEvent,
    }).render();

    renderer.props.onClick();

    expect(selectFilteredEvent).toHaveBeenCalledWith(record, "detail");
  });

  it("uses repository-wide exact-event history, including imported records", () => {
    getAllInterpretationsForEvent.mockReturnValue([{ authorId: "imported" }]);
    const renderer = new EventDetailRenderer({
      value: "CASZ1",
      record,
      selectFilteredEvent: jest.fn(),
    }).render();
    const tooltip = renderer.props.children;
    const content = tooltip.props.children;
    const [avatar] = React.Children.toArray(content.props.children);

    expect(getAllInterpretationsForEvent).toHaveBeenCalledWith(
      mockState,
      record,
    );
    expect(avatar.type).toBe(InterpretationsAvatar);
    expect(avatar.props.tooltipText).toBe("Found 1 interpretation(s)");
  });

  it("truncates long event values inside their column", () => {
    getAllInterpretationsForEvent.mockReturnValue([]);
    const renderer = new EventDetailRenderer({
      value: "RUNX1::RUNX1T1",
      record,
      selectFilteredEvent: jest.fn(),
    }).render();
    const tooltip = renderer.props.children;
    const content = tooltip.props.children;
    const [detailText] = React.Children.toArray(content.props.children);
    const styles = fs.readFileSync(
      path.resolve(__dirname, "../index.style.js"),
      "utf8",
    );
    const detailLinkStyles = styles.match(
      /\.filtered-events-detail-link\.ant-btn \{([^}]*)\}/,
    )[1];
    const detailTextStyles = styles.match(
      /\.filtered-events-detail-text \{([^}]*)\}/,
    )[1];

    expect(renderer.props.className).toBe("filtered-events-detail-link");
    expect(content.props.className).toBe("filtered-events-detail-content");
    expect(detailText.props.className).toBe("filtered-events-detail-text");
    expect(detailText.props.children).toBe("RUNX1::RUNX1T1");
    expect(detailLinkStyles).toContain("width: 100%");
    expect(detailLinkStyles).toContain("overflow: hidden");
    expect(detailTextStyles).toContain("text-overflow: ellipsis");
    expect(detailTextStyles).toContain("white-space: nowrap");
  });
});
