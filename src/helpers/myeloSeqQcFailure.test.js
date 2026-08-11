/** @jest-environment node */

import {
  hasFailedMyeloSeqQc,
  MYELOSEQ_QC_FAILURE_MESSAGE,
  MYELOSEQ_QC_FAILURE_NOTE,
} from "./myeloSeqQcFailure";

describe("MyeloSeq QC failure results", () => {
  it("matches the FAIL evaluation displayed by the QC tag", () => {
    expect(
      hasFailedMyeloSeqQc({ metadata: { qcEvaluation: "FAIL" } }),
    ).toBe(true);
    expect(
      hasFailedMyeloSeqQc({ metadata: { qcEvaluation: " fail " } }),
    ).toBe(true);
    expect(
      hasFailedMyeloSeqQc({ metadata: { qcEvaluation: "WARN" } }),
    ).toBe(false);
    expect(hasFailedMyeloSeqQc({ metadata: {} })).toBe(false);
  });

  it("provides the approved insufficient-quality wording", () => {
    expect(MYELOSEQ_QC_FAILURE_MESSAGE).toBe(
      "DNA/RNA QUANTITY/QUALITY NOT SUFFICIENT",
    );
    expect(MYELOSEQ_QC_FAILURE_NOTE).toBe(
      "Please refer to peripheral blood NGS findings.",
    );
  });
});
