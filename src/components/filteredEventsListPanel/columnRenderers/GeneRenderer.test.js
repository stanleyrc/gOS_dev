/** @jest-environment node */

/* eslint-disable import/first */

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
    const renderer = GeneRenderer({
      value: "CASZ1",
      record,
      selectFilteredEvent: jest.fn(),
    });
    const tooltipChildren = renderer.props.children.props.children;

    expect(getAllInterpretationsForEvent).toHaveBeenCalledWith(
      mockState,
      record,
    );
    expect(tooltipChildren[0].type).toBe(InterpretationsAvatar);
    expect(tooltipChildren[0].props.tooltipText).toBe(
      "Found 1 interpretation(s)",
    );
  });
});
