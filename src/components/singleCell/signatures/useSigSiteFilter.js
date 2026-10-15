import { useMemo } from "react";
import { useSelector } from "react-redux";
import { useSnvAnnot } from "../snvAnnotTracks";
import { allowedSites } from "../../../helpers/singleCell/signatureFilter";

/** The shared SNV site filters as seen by the Signatures tab: { allowed, n, m, active }. */
export default function useSigSiteFilter() {
  const { snv, layout } = useSelector((s) => s.SingleCell);
  const snvData = snv.status === "ok" ? snv.data : null;
  const annot = useSnvAnnot(snvData);
  return useMemo(() => allowedSites(snvData, layout, annot), [snvData, layout, annot]);
}
