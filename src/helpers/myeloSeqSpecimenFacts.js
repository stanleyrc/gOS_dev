import { formatMyeloSeqSampleId } from "./myeloSeqReportFormatting";

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function firstValue(...values) {
  return values.find(hasValue);
}

export function getMyeloSeqSpecimenFacts(report) {
  const patient = report?.patient || {};
  const metadata = report?.metadata || {};
  const specimenType = firstValue(
    patient.primarySite,
    metadata.primary_site,
    metadata.primarySite,
  ) ?? "NA";

  return [
    ["Tumor sample", formatMyeloSeqSampleId(patient.caseId)],
    ["Specimen Type", specimenType],
    ["Clinical History", "NA"],
  ]
    .filter(([, value]) => hasValue(value))
    .map(([label, value]) => ({ label, value: String(value) }));
}
