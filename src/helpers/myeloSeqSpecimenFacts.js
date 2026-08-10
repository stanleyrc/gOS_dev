import { datasetHasField } from "./browseScope";

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function firstValue(...values) {
  return values.find(hasValue);
}

function reportHasPrimarySite(report) {
  const dataset = report?.dataset;
  return (
    !dataset ||
    !Array.isArray(dataset.fields) ||
    datasetHasField(dataset, "primary_site")
  );
}

export function getMyeloSeqSpecimenFacts(report) {
  const patient = report?.patient || {};
  const metadata = report?.metadata || {};
  const specimenType = reportHasPrimarySite(report)
    ? firstValue(
        patient.primarySite,
        metadata.primary_site,
        metadata.primarySite,
      )
    : "";

  return [
    ["Tumor sample", patient.caseId],
    ["Specimen Type", specimenType],
    ["Clinical History", "NA"],
  ]
    .filter(([, value]) => hasValue(value))
    .map(([label, value]) => ({ label, value: String(value) }));
}
