/** @jest-environment node */
/* eslint-disable import/first */

jest.mock("../../helpers/utility", () => ({
  tierColor: () => "#000",
}));

import TierBadgeRenderer from "./columnRenderers/TierBadgeRenderer";

describe("TierBadgeRenderer", () => {
  test("keeps tiers in a fixed horizontal order", () => {
    const renderer = new TierBadgeRenderer({
      value: 2,
      record: { uid: "event-1" },
      getTierTooltipContent: jest.fn(),
    });
    const selector = renderer.render().props.children;

    expect(selector.props.className).toBe("tier-selector");
    expect(
      selector.props.children.map((tier) => tier.props["aria-label"])
    ).toEqual(["Set tier 1", "Current tier 2", "Set tier 3"]);
  });

  test("retiering an unselected badge does not select the event", () => {
    const record = { uid: "event-1" };
    const onTierChange = jest.fn();
    const selectFilteredEvent = jest.fn();
    const renderer = new TierBadgeRenderer({
      record,
      onTierChange,
      selectFilteredEvent,
    });
    const event = { stopPropagation: jest.fn() };

    renderer.handleTierChange(2)(event);

    expect(event.stopPropagation).toHaveBeenCalled();
    expect(onTierChange).toHaveBeenCalledWith(record, 2);
    expect(selectFilteredEvent).not.toHaveBeenCalled();
  });
});
