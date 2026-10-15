// Cohort view: open patients (and cells) in a new browser tab so the cohort view keeps its state.
// The preference is per browser (localStorage); the cohort panel marks itself mounted so the
// openCaseReport saga only redirects to a new tab from the cohort view, never from a patient page.
const KEY = "gos.sc.openPatientsInNewTab";
let cohortMounted = false;

export const setCohortMounted = (on) => {
  cohortMounted = Boolean(on);
};
export const isCohortMounted = () => cohortMounted;

export function getOpenInNewTab() {
  try {
    const v = window.localStorage.getItem(KEY);
    return v == null ? true : v === "1";
  } catch (e) {
    return true;
  }
}

export function setOpenInNewTab(on) {
  try {
    window.localStorage.setItem(KEY, on ? "1" : "0");
  } catch (e) {
    // storage blocked: the switch still works for this page
  }
}

/** URL of a case report (patient or cell id) in a dataset, from the current page URL: dataset + report only. */
export function caseReportUrl(href, datasetId, caseReportId) {
  const url = new URL(href);
  const out = new URL(`${url.origin}${url.pathname}`);
  out.searchParams.set("dataset", `${datasetId}`);
  out.searchParams.set("report", `${caseReportId}`);
  return out.toString();
}
