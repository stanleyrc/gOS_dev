// Link from a driver tag (home card, patient overview, cohort table) to that driver in its patient:
// Single-Cell tab, Drivers layer, the driver added to the selection and its drawer open.
// A plain href, so command / ctrl / middle click opens a new tab.
import { driverKey } from "./driverContrast";

// view params of the page the link starts from that would not apply to the patient's Drivers layer
const DROP = ["scview", "drvpreset", "drvadd", "drvrm", "drvf", "drvopen", "heatmap", "tab", "evsite", "walk", "umap", "scsel"];

/** URL of `event` (a filtered event) in patient `patient`; keeps dataset and other params of `href`. */
export function driverHref(patient, event, href = window.location.href) {
  const url = new URL(href);
  DROP.forEach((k) => url.searchParams.delete(k));
  url.searchParams.set("report", `${patient}`);
  url.searchParams.set("tab", "7");
  url.searchParams.set("heatmap", "drivers");
  if (event) {
    const key = driverKey(event);
    url.searchParams.set("drvadd", key);
    url.searchParams.set("drvopen", key);
  }
  return url.toString();
}

/** Click handler for a link inside a clickable card: keep the link's own navigation, stop the card's. */
export const linkClick = (e) => e.stopPropagation();
