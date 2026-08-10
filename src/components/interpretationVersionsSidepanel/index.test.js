/** @jest-environment node */
/* eslint-disable import/first */

import React from "react";

jest.mock("react-i18next", () => ({
  withTranslation: () => (Component) => Component,
}));
jest.mock("antd", () => ({
  Drawer: "Drawer",
  Input: "Input",
  Table: "Table",
}));
jest.mock("../../helpers/interpretationHistory", () => ({
  getInterpretationSourceDatasetId: (record) => record.datasetId,
}));

import { InterpretationVersionsSidepanel } from "./index";

function findElementByType(node, type) {
  if (!React.isValidElement(node)) return null;
  if (node.type === type) return node;

  for (const child of React.Children.toArray(node.props.children)) {
    const match = findElementByType(child, type);
    if (match) return match;
  }
  return null;
}

describe("InterpretationVersionsSidepanel layout", () => {
  it("keeps pagination visible by scrolling rows instead of the drawer body", () => {
    const sidepanel = new InterpretationVersionsSidepanel({
      t: (key) => key,
      tableData: [],
      title: "Tier History",
      isOpen: true,
      onClose: jest.fn(),
      onSelect: jest.fn(),
    });

    const view = sidepanel.render();
    const drawer = findElementByType(view, "Drawer");
    const table = findElementByType(view, "Table");

    expect(drawer.props.styles).toEqual({
      body: { overflow: "hidden" },
    });
    expect(table.props.pagination).toEqual({ pageSize: 10 });
    expect(table.props.scroll).toEqual({
      x: "max-content",
      y: "calc(100vh - 280px)",
    });
  });

  it("reserves translated label widths even when the table has no rows", () => {
    const sidepanel = new InterpretationVersionsSidepanel({
      t: (key) =>
        key.endsWith("dateColumn")
          ? "Last Modified"
          : key.endsWith("authorColumn")
            ? "Author"
            : key,
      tableData: [],
      title: "Tier History",
      isOpen: true,
      onClose: jest.fn(),
      onSelect: jest.fn(),
      additionalColumns: [
        {
          title: "Interpretation Source",
          dataIndex: "source",
          key: "source",
        },
      ],
    });

    const table = findElementByType(sidepanel.render(), "Table");
    const columnsByKey = Object.fromEntries(
      table.props.columns.map((column) => [column.key, column]),
    );

    expect(columnsByKey.lastModified).toMatchObject({
      width: 152,
      minWidth: 152,
    });
    expect(columnsByKey.dataset).toMatchObject({
      width: 104,
      minWidth: 104,
    });
    expect(columnsByKey.source).toMatchObject({
      width: 192,
      minWidth: 192,
    });
  });
});
