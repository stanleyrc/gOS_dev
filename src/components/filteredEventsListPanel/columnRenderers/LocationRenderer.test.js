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
// Keep the real coordinate formatter, utility wrapper, and parser in this journey.
jest.mock("d3", () => ({}));
jest.mock("../../../helpers/connection", () => class Connection {});
jest.mock("../../../helpers/interval", () => class Interval {});

import { domainsToLocation, locationToDomains } from "../../../helpers/utility";
import LocationRenderer from "./LocationRenderer";

describe("LocationRenderer", () => {
  it("uses a Gene-style action for Tracks and delegates copying separately", () => {
    const record = Object.freeze({
      uid: "event-1",
      Variant_g: "17:7577568-7577568 C>A",
    });
    const selectFilteredEvent = jest.fn();
    const renderer = new LocationRenderer({
      value: record.Variant_g,
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
    expect(locationButton.props.children).toBe("17:7577568 C>A");
    expect(locationTooltip.props.title).toBe("17:7577568 C>A");
    expect(locationButton.props["aria-label"]).toBe(
      "Open coordinates 17:7577568 C>A in Plots",
    );
    expect(record.Variant_g).toBe("17:7577568-7577568 C>A");
    expect(selectFilteredEvent.mock.calls[0][0]).toBe(record);
    expect(copyButton.props.value).toBe("17:7577568");
    expect(copyButton.props.tooltipTitle).toBe("Copy coordinates");
    expect(copyButton.props.copiedTooltipTitle).toBe("Copied!");
    expect(copyButton.props.ariaLabel).toBe(
      "Copy coordinates 17:7577568 to clipboard",
    );
    expect(copyButton.props.className).toBe(
      "filtered-events-location-copy-button",
    );
    expect(selectFilteredEvent).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["1:500-500 A>G", "1:500 A>G", "1:500", [250, 750]],
    ["1:100-100 A>G", "1:100 A>G", "1:100", [1, 350]],
    ["1:1000-1000 A>G", "1:1000 A>G", "1:1000", [750, 1000]],
    ["ChRx:500-500 c > t", "ChRx:500 c > t", "ChRx:500", [1250, 1750]],
    ["1:500-501 A>G", "1:500-501 A>G", "1:500-501", [500, 501]],
    ["1:500-500 AC>A", "1:500-500 AC>A", "1:500-500", [500, 500]],
    ["1:500-500 A>AC", "1:500-500 A>AC", "1:500-500", [500, 500]],
    ["1:500-500 AC>GT", "1:500-500 AC>GT", "1:500-500", [500, 500]],
  ])("round-trips the displayed copy value through the real genome parser: %s", (value, display, copy, domain) => {
    const renderer = new LocationRenderer({ value });
    const [tooltip, copyButton] = React.Children.toArray(renderer.render().props.children);
    const chromoBins = {
      1: { startPoint: 1, endPoint: 1000, startPlace: 1, endPlace: 1000 },
      ChRx: { startPoint: 1, endPoint: 1000, startPlace: 1001, endPlace: 2000 },
    };

    expect(tooltip.props.children.props.children).toBe(display);
    expect(copyButton.props.value).toBe(copy);
    const url = new URL("http://localhost/");
    url.searchParams.set("location", copyButton.props.value);
    const pastedDomains = locationToDomains(chromoBins, url.searchParams.get("location"));
    expect(pastedDomains).toEqual([domain]);
    expect(locationToDomains(chromoBins, domainsToLocation(chromoBins, pastedDomains)))
      .toEqual(pastedDomains);
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
