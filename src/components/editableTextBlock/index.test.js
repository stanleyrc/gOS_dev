/** @jest-environment node */
/* eslint-disable import/first */

import React from "react";

jest.mock("antd", () => {
  class Input {}
  Input.TextArea = "TextArea";
  class Collapse {}
  Collapse.Panel = "CollapsePanel";
  return { Button: "Button", Collapse, Input };
});
jest.mock("@ant-design/icons", () => ({
  EditOutlined: "EditOutlined",
  SaveOutlined: "SaveOutlined",
}));

import EditableTextBlock from ".";

function findElementByType(node, type) {
  if (!React.isValidElement(node)) return null;
  if (node.type === type) return node;

  for (const child of React.Children.toArray(node.props.children)) {
    const match = findElementByType(child, type);
    if (match) return match;
  }
  return null;
}

function createEditingBlock(overrides = {}) {
  const block = new EditableTextBlock({
    title: "Variant Summary",
    value: "Original",
    onChange: jest.fn(),
    ...overrides,
  });
  block.state = { editing: true, draft: "Edited value" };
  block.setState = (update) => {
    const nextState =
      typeof update === "function"
        ? update(block.state, block.props)
        : update;
    block.state = { ...block.state, ...nextState };
  };
  return block;
}

describe("EditableTextBlock save controls", () => {
  it("saves from the visible button without blurring first", () => {
    const block = createEditingBlock();
    const view = block.render();
    const saveButton = findElementByType(view, "Button");
    const mouseDownEvent = { preventDefault: jest.fn() };

    saveButton.props.onMouseDown(mouseDownEvent);
    saveButton.props.onClick();

    expect(mouseDownEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(block.props.onChange).toHaveBeenCalledWith("Edited value");
    expect(block.state.editing).toBe(false);
  });

  it("saves on Escape and stops the event-details modal from closing", () => {
    const block = createEditingBlock();
    const textArea = findElementByType(block.render(), "TextArea");
    const event = {
      key: "Escape",
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
    };

    textArea.props.onKeyDown(event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(block.props.onChange).toHaveBeenCalledWith("Edited value");
    expect(block.state.editing).toBe(false);
  });

  it("keeps ordinary textarea keys editable", () => {
    const block = createEditingBlock();
    const textArea = findElementByType(block.render(), "TextArea");
    const event = {
      key: "Enter",
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
    };

    textArea.props.onKeyDown(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
    expect(block.props.onChange).not.toHaveBeenCalled();
    expect(block.state.editing).toBe(true);
  });
});
