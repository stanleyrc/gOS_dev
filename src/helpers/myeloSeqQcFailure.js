export const MYELOSEQ_QC_FAILURE_MESSAGE =
  "DNA/RNA QUANTITY/QUALITY NOT SUFFICIENT";
export const MYELOSEQ_QC_FAILURE_NOTE =
  "Please refer to peripheral blood NGS findings.";

export function hasFailedMyeloSeqQc(report) {
  return String(report?.metadata?.qcEvaluation || "")
    .trim()
    .toUpperCase() === "FAIL";
}
