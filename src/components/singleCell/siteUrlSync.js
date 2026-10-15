import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import singleCellActions from "../../redux/singleCell/actions";
import { SITE_URL_PARAMS, parseSiteState, serializeSiteState } from "../../helpers/singleCell/snvAnnot";

/**
 * Keeps the site-filter state (sntracks, snfilter, sncat, ... sigfit) and the URL in sync.
 * Mounted once in the detail view so a link straight to any single-cell tab
 * (Signatures included) honours the filter, not only the Single-Cell tab.
 */
export default function SiteUrlSync() {
  const dispatch = useDispatch();
  const layout = useSelector((s) => s.SingleCell.layout) || {};
  const patient = useSelector((s) => s.SingleCell.patient);
  const [readFor, setReadFor] = useState(null);

  // a link carries the tracks and filter; read once when each patient has loaded
  useEffect(() => {
    if (!patient || readFor === patient) return;
    setReadFor(patient);
    try {
      const patch = parseSiteState(window.location.search);
      if (Object.keys(patch).length) dispatch(singleCellActions.updateLayout(patch));
    } catch (e) {
      // no window
    }
  }, [readFor, patient, dispatch]);

  useEffect(() => {
    if (!patient || readFor !== patient) return;
    try {
      const url = new URL(window.location.href);
      SITE_URL_PARAMS.forEach((k) => url.searchParams.delete(k));
      Object.entries(serializeSiteState(layout)).forEach(([k, v]) => url.searchParams.set(k, v));
      if (url.toString() !== window.location.href) window.history.replaceState(window.history.state, "", url.toString());
    } catch (e) {
      // no history
    }
  }, [readFor, patient, layout]);

  return null;
}
