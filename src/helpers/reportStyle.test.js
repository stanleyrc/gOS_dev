/** @jest-environment node */

import {
  CLASSIC_REPORT_STYLE,
  MYELOSEQ_REPORT_STYLE,
  isMyeloSeqReportStyle,
  resolveReportStyle,
} from "./reportStyle";

describe("dataset report style", () => {
  it.each([
    [undefined, MYELOSEQ_REPORT_STYLE],
    [null, MYELOSEQ_REPORT_STYLE],
    [{}, MYELOSEQ_REPORT_STYLE],
    [{ reportStyle: "unknown" }, MYELOSEQ_REPORT_STYLE],
    [{ reportStyle: "classic" }, CLASSIC_REPORT_STYLE],
    [{ reportStyle: "myeloseq" }, MYELOSEQ_REPORT_STYLE],
  ])("resolves %p to %s", (dataset, expected) => {
    expect(resolveReportStyle(dataset)).toBe(expected);
  });

  it("requires an explicit classic style", () => {
    expect(isMyeloSeqReportStyle()).toBe(true);
    expect(isMyeloSeqReportStyle({ reportStyle: "unknown" })).toBe(true);
    expect(isMyeloSeqReportStyle({ reportStyle: "classic" })).toBe(false);
    expect(isMyeloSeqReportStyle({ reportStyle: "myeloseq" })).toBe(true);
  });
});
