// Report-only formatting. Source annotations and stored events remain unchanged.
export function getMyeloSeqVariantType(finding) {
  const suppliedType = String(finding?.variant_type ?? "").trim();
  return (suppliedType || String(finding?.type ?? "").trim()).toUpperCase();
}

export function isMyeloSeqFusion(finding) {
  if (String(finding?.variant_type ?? "").trim()) {
    return getMyeloSeqVariantType(finding) === "FUSION";
  }
  return /fusion/i.test(`${finding?.eventType || ""} ${finding?.type || ""}`);
}

export function getMyeloSeqInsertionSize(finding) {
  if (getMyeloSeqVariantType(finding) !== "FLT3ITD") return undefined;
  const variant = String(finding?.sourceVariant ?? finding?.Variant ?? finding?.variant ?? "");
  const range = variant.match(/\bc\.(\d+)_(\d+)(?=[a-z*]|\s|$)/i);
  if (!range) return undefined;
  const start = Number(range[1]);
  const end = Number(range[2]);
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start > 0 && end >= start
    ? end - start + 1
    : undefined;
}

export function formatMyeloSeqDepth(value) {
  if (value == null || String(value).trim() === "") return "";
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return new Intl.NumberFormat("en-US", {
    useGrouping: false,
    maximumFractionDigits: 0,
  }).format(number);
}

export function formatMyeloSeqVaf(value) {
  if (value == null || String(value).trim() === "") return "";
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  const percent = Math.abs(number) <= 1 ? number * 100 : number;
  return percent.toFixed(2);
}

export function formatMyeloSeqVariant(value) {
  const variant = String(value ?? "").trim();
  const parts = variant.split(/\s*[/,]\s*(?=[cp]\.)/i);
  const coding = parts.find((part) => /^c\.\S/i.test(part));
  const protein = parts.find((part) => /^p\.\S/i.test(part));
  return parts.length === 2 && coding && protein
    ? `${coding}, ${protein}`
    : variant;
}
