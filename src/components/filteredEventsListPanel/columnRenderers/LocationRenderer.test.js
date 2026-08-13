/** @jest-environment node */
/* eslint-disable import/first */

import fs from "fs";
import path from "path";
import React from "react";

jest.mock("antd", () => ({
  Button: "Button",
  Tooltip: "Tooltip",
  Typography: { Text: "Text" },
}));
jest.mock("react-icons/bs", () => ({ BsDashLg: "Dash" }));
jest.mock("../../copyIconButton", () => "CopyIconButton");

import LocationRenderer from "./LocationRenderer";

describe("LocationRenderer", () => {
  it("uses a Gene-style action for Tracks and delegates copying separately", () => {
    const record = { uid: "event-1" };
    const selectFilteredEvent = jest.fn();
    const renderer = new LocationRenderer({
      value: "17:7577568-7577568 C>A",
      record,
      selectFilteredEvent,
    });

    const cell = renderer.render();
    const [locationTooltip, copyButton] = React.Children.toArray(
      cell.props.children,
    );
    const locationButton = locationTooltip.props.children;
    const locationEvent = { preventDefault: jest.fn() };

    expect(locationButton.type).toBe("Button");
    expect(locationButton.props.type).toBe("link");
    expect(locationButton.props.className).toContain(
      "filtered-events-location-link",
    );
    locationButton.props.onClick(locationEvent);
    expect(locationEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(selectFilteredEvent).toHaveBeenCalledWith(record, "tracks");

    expect(copyButton.type).toBe("CopyIconButton");
    expect(locationButton.props.children).toBe("17:7577568-7577568 C>A");
    expect(locationButton.props["aria-label"]).toBe(
      "Open coordinates 17:7577568-7577568 C>A in Plots",
    );
    expect(copyButton.props.value).toBe("17:7577568-7577568");
    expect(copyButton.props.tooltipTitle).toBe("Copy coordinates");
    expect(copyButton.props.copiedTooltipTitle).toBe("Copied!");
    expect(copyButton.props.ariaLabel).toBe(
      "Copy coordinates 17:7577568-7577568 to clipboard",
    );
    expect(copyButton.props.className).toBe(
      "filtered-events-location-copy-button",
    );
    expect(selectFilteredEvent).toHaveBeenCalledTimes(1);
  });

  it("uses event-row hover without sticky cell focus to reveal copy", () => {
    const styles = fs.readFileSync(
      path.resolve(__dirname, "../index.style.js"),
      "utf8",
    );

    expect(styles).toContain(".filtered-events-event-row:hover");
    expect(styles).toContain(
      ".filtered-events-location-copy-button.ant-btn:focus-visible",
    );
    expect(styles).not.toContain(
      ".filtered-events-location-cell:focus-within",
    );
  });

  it("keeps missing coordinates noninteractive", () => {
    const renderer = new LocationRenderer({ value: null });

    expect(renderer.render().type).toBe("Text");
  });
});
