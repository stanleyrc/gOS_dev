/** @jest-environment node */
/* eslint-disable import/first */

jest.mock("antd", () => ({
  Button: "Button",
  Tooltip: "Tooltip",
}));
jest.mock("@ant-design/icons", () => ({ CopyOutlined: "CopyOutlined" }));
jest.mock("../../helpers/utility", () => ({
  copyTextToClipboard: jest.fn(),
}));

import { copyTextToClipboard } from "../../helpers/utility";
import CopyIconButton from "./index";

const makeStateSynchronous = (component) => {
  component.setState = (update) => {
    const nextState =
      typeof update === "function"
        ? update(component.state, component.props)
        : update;
    component.state = { ...component.state, ...nextState };
  };
  return component;
};

const createCopyButton = (props = {}) =>
  makeStateSynchronous(
    new CopyIconButton({
      value: "CASE-1",
      tooltipTitle: "Copy case ID",
      copiedTooltipTitle: "Copied!",
      failureTooltipTitle: "Unable to copy",
      ariaLabel: "Copy case ID to clipboard",
      className: "consumer-copy-button",
      ...props,
    }),
  );

describe("CopyIconButton", () => {
  let scheduledReset;

  beforeEach(() => {
    scheduledReset = null;
    copyTextToClipboard.mockReset();
    jest.spyOn(global, "setTimeout").mockImplementation((callback) => {
      scheduledReset = callback;
      return 17;
    });
    jest.spyOn(global, "clearTimeout").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("copies the exact value and temporarily confirms success", async () => {
    copyTextToClipboard.mockResolvedValue(true);
    const component = createCopyButton();
    const tooltip = component.render();
    const button = tooltip.props.children;
    const event = {
      detail: 1,
      currentTarget: { blur: jest.fn() },
      stopPropagation: jest.fn(),
    };

    expect(tooltip.props.title).toBe("Copy case ID");
    expect(button.props.className).toBe("consumer-copy-button");
    expect(button.props["aria-label"]).toBe("Copy case ID to clipboard");

    await button.props.onClick(event);

    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(event.currentTarget.blur).toHaveBeenCalledTimes(1);
    expect(copyTextToClipboard).toHaveBeenCalledWith("CASE-1");
    expect(component.render().props.title).toBe("Copied!");

    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 1500);
    scheduledReset();
    expect(component.render().props.title).toBe("Copy case ID");
  });

  it("shows failure feedback when the clipboard helper cannot copy", async () => {
    copyTextToClipboard.mockResolvedValue(false);
    const component = createCopyButton({ value: "1:100-1:100" });

    await component.render().props.children.props.onClick({
      stopPropagation: jest.fn(),
    });

    expect(copyTextToClipboard).toHaveBeenCalledWith("1:100-1:100");
    expect(component.render().props.title).toBe("Unable to copy");
  });

  it("clears a pending tooltip reset when unmounted", async () => {
    copyTextToClipboard.mockResolvedValue(true);
    const component = createCopyButton();

    await component.render().props.children.props.onClick({
      stopPropagation: jest.fn(),
    });
    expect(component.copyResetTimeout).toBe(17);

    component.componentWillUnmount();

    expect(clearTimeout).toHaveBeenCalledWith(17);
    expect(component.copyResetTimeout).toBeNull();
  });
});
