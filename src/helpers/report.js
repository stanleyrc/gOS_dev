// Slugify helper for anchors/IDs
export function slugify(s) {
  const str = String(s || "")
    .trim()
    .toLowerCase();
  const ascii = str.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const cleaned = ascii.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "section";
}
