// Report-only formatting. Source annotations and stored events remain unchanged.
export function formatMyeloSeqVariant(value) {
  const variant = String(value ?? "").trim();
  const parts = variant.split(/\s*[/,]\s*(?=[cp]\.)/i);
  const coding = parts.find((part) => /^c\.\S/i.test(part));
  const protein = parts.find((part) => /^p\.\S/i.test(part));
  return parts.length === 2 && coding && protein
    ? `${coding}, ${protein}`
    : variant;
}
