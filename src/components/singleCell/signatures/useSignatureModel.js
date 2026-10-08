import { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { loadCosmic } from "../signaturePanel";
import { fitSignatures, sbs96Counts } from "../../../helpers/singleCell/signatures";
import { assignSignatures, channelPosteriors } from "../../../helpers/singleCell/signatureAssign";

/**
 * The patient's signature model: one joint fit over all SNV sites with a
 * context (the backend SigProfiler "all" fit when present, else a browser
 * fit), channel posteriors, and every mutation's assigned signature.
 * Returns { ready, reference, activities, posteriors, assignment, source }.
 */
export default function useSignatureModel() {
  const { snv, signatures } = useSelector((s) => s.SingleCell);
  const snvData = snv.status === "ok" ? snv.data : null;
  const [reference, setReference] = useState(null);
  useEffect(() => {
    let active = true;
    loadCosmic().then((r) => active && setReference(r)).catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return useMemo(() => {
    if (!reference || !snvData || !snvData.variants.some((v) => v.context)) return { ready: false };
    const backend = signatures.status === "ok" ? (signatures.data?.sets || []).find((s) => s.name === "all") : null;
    let activities;
    let source;
    if (backend?.activities?.length) {
      activities = backend.activities.map((a) => ({ signature: a.signature, activity: Number(a.activity) || 0 }));
      source = "backend";
    } else {
      const { counts } = sbs96Counts(snvData.variants.map((v) => v.context).filter(Boolean));
      activities = fitSignatures(counts, reference).activities;
      source = "browser";
    }
    const posteriors = channelPosteriors(reference, activities);
    const assignment = assignSignatures(snvData.variants, posteriors);
    return { ready: true, reference, activities, posteriors, assignment, source };
  }, [reference, snvData, signatures]);
}
