export const MYELOSEQ_REPORT_STYLE = "myeloseq";
export const CLASSIC_REPORT_STYLE = "classic";

/** MyeloSeq is the compatibility default; classic requires an explicit opt-in. */
export function resolveReportStyle(dataset) {
  return dataset?.reportStyle === CLASSIC_REPORT_STYLE
    ? CLASSIC_REPORT_STYLE
    : MYELOSEQ_REPORT_STYLE;
}

export function isMyeloSeqReportStyle(dataset) {
  return resolveReportStyle(dataset) === MYELOSEQ_REPORT_STYLE;
}
