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
import GeneRenderer from "./GeneRenderer";

const record = {
  uid: "1:100-1:100",
  gene: "CASZ1",
  variant: "c.*2285_*2286delTT",
  type: "UTR",
};

describe("GeneRenderer interpretation glyph", () => {
  it("uses repository-wide exact-event history, including imported records", () => {
    getAllInterpretationsForEvent.mockReturnValue([{ authorId: "imported" }]);
    const renderer = new GeneRenderer({
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

  it("truncates long gene names inside their column", () => {
    getAllInterpretationsForEvent.mockReturnValue([]);
    const renderer = new GeneRenderer({
      value: "RUNX1::RUNX1T1",
      record,
      selectFilteredEvent: jest.fn(),
    }).render();
    const tooltip = renderer.props.children;
    const content = tooltip.props.children;
    const [geneText] = React.Children.toArray(content.props.children);
    const styles = fs.readFileSync(
      path.resolve(__dirname, "../index.style.js"),
      "utf8",
    );
    const geneLinkStyles = styles.match(
      /\.filtered-events-gene-link\.ant-btn \{([^}]*)\}/,
    )[1];
    const geneTextStyles = styles.match(
      /\.filtered-events-gene-text \{([^}]*)\}/,
    )[1];

    expect(renderer.props.className).toBe("filtered-events-gene-link");
    expect(content.props.className).toBe("filtered-events-gene-content");
    expect(geneText.props.className).toBe("filtered-events-gene-text");
    expect(geneText.props.children).toBe("RUNX1::RUNX1T1");
    expect(geneLinkStyles).toContain("width: 100%");
    expect(geneLinkStyles).toContain("overflow: hidden");
    expect(geneTextStyles).toContain("text-overflow: ellipsis");
    expect(geneTextStyles).toContain("white-space: nowrap");
  });
});
