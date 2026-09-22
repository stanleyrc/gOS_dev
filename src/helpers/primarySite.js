import { datasetHasField } from "./browseScope";
import { isMyeloSeqReportStyle } from "./reportStyle";

export const PRIMARY_SITE_ID = "PRIMARY_SITE";

/** A valid option has nonblank string value/label; strings are config shorthand. */
function normalizeOption(entry) {
  if (typeof entry === "string") {
    const value = entry.trim();
    return value ? { value, label: value } : null;
  }
  if (
    !entry ||
    typeof entry !== "object" ||
    Array.isArray(entry) ||
    typeof entry.value !== "string" ||
    typeof entry.label !== "string"
  ) {
    return null;
  }
  const value = entry.value.trim();
  const label = entry.label.trim();
  return value && label ? { value, label } : null;
}

/** Return normalized source metadata, or null when the raw site is absent. */
export function getRawPrimarySite(metadata) {
  const raw = metadata?.primary_site ?? metadata?.primarySite;
  return typeof raw === "string" ? normalizeOption(raw) : null;
}

/** Resolve MyeloSeq specimen choices from Settings.data without mutation. */
export function resolvePrimarySiteOptions(dataset, settings) {
  if (!isMyeloSeqReportStyle(dataset)) return [];

  const catalogs = settings?.primarySiteOptions;
  const configured = dataset?.primarySiteOptions;
  const named =
    typeof configured === "string" &&
    Object.prototype.hasOwnProperty.call(catalogs || {}, configured)
      ? catalogs[configured]
      : null;
  const entries = Array.isArray(configured)
    ? configured
    : Array.isArray(named)
      ? named
      : catalogs?.myeloseq;
  const seen = new Set();
  return (Array.isArray(entries) ? entries : []).reduce((options, entry) => {
    const option = normalizeOption(entry);
    if (option && !seen.has(option.value)) {
      seen.add(option.value);
      options.push(option);
    }
    return options;
  }, []);
}

/** Return the scoped current-user snapshot or metadata fallback; only classic is schema-gated. */
export function getPrimarySite(state = {}) {
  const dataset = state?.Settings?.dataset || state?.dataset;
  if (!isMyeloSeqReportStyle(dataset) && !datasetHasField(dataset, "primary_site")) return null;

  const fallback = getRawPrimarySite(state?.CaseReport?.metadata);

  const caseId = state?.CaseReport?.id;
  const datasetId = dataset?.id;
  const selectedKey = state?.Interpretations?.selected?.[PRIMARY_SITE_ID];
  const interpretation = selectedKey
    ? state?.Interpretations?.byId?.[selectedKey]
    : null;
  // Hydration/save assigns isCurrentUser; keep this projection free of auth I/O.
  if (
    isMyeloSeqReportStyle(dataset) &&
    caseId != null &&
    `${caseId}`.trim() &&
    datasetId != null &&
    `${datasetId}`.trim() &&
    interpretation?.alterationId === PRIMARY_SITE_ID &&
    interpretation.isCurrentUser === true &&
    `${interpretation.caseId}` === `${caseId}` &&
    `${interpretation.datasetId}` === `${datasetId}`
  ) {
    const saved = interpretation.data?.primarySite;
    const snapshot = typeof saved === "object" ? normalizeOption(saved) : null;
    if (snapshot) return snapshot;
  }

  if (!fallback) return null;
  return resolvePrimarySiteOptions(dataset, state?.Settings?.data)
    .find((option) => option.value === fallback.value) || fallback;
}
