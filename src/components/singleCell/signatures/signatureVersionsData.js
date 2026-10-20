import { useSelector } from "react-redux";
import { hasVersions } from "../../../helpers/singleCell/signatureVersions";

/** signature_versions.json of the open patient: { data, missing } (missing = card text "not available (...)"). */
export default function useSignatureVersions() {
  const src = useSelector((s) => s.SingleCell.signatureVersions);
  const data = src?.status === "ok" && hasVersions(src.data) ? src.data : null;
  return { data, loading: src?.status === "loading", missing: !data };
}

export const NOT_EXPORTED = "not available (signature_versions.json not exported for this patient)";
