/** @jest-environment node */
import { PushpinFilled, PushpinOutlined } from "@ant-design/icons";
import ColumnPinControl from "./columnPinControl";

describe("ColumnPinControl", () => {
  test.each([false, true])("renders an accessible native toggle (pinned=%s)", (pinned) => {
    const onToggle = jest.fn();
    const label = pinned ? "Unpin Gene" : "Pin Gene to the left";
    const button = new ColumnPinControl({ columnKey: "gene", pinned, label, onToggle }).render();
    expect(button.type).toBe("button");
    expect(button.props).toMatchObject({ type: "button", draggable: false, "aria-label": label, "aria-pressed": pinned });
    expect(button.props.children.type).toBe(pinned ? PushpinFilled : PushpinOutlined);
    const event = { stopPropagation: jest.fn() };
    button.props.onClick(event);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith("gene");
  });

  test("isolates keyboard events without suppressing native button activation", () => {
    const onToggle = jest.fn();
    const button = new ColumnPinControl({ onToggle }).render();
    const event = { stopPropagation: jest.fn(), preventDefault: jest.fn() };
    button.props.onKeyDown(event);
    button.props.onKeyUp(event);
    expect(event.stopPropagation).toHaveBeenCalledTimes(2);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(onToggle).not.toHaveBeenCalled();
  });
});
