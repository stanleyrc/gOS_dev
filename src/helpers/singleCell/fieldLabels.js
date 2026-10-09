// Display names for cell metadata fields (Seurat columns, pipeline exports).
// The raw name stays the key everywhere; only what the user reads changes:
// "Region_Annotation" -> "Region annotation", "state" -> "State".

const KNOWN = {
  clone_id: "Clone",
  state: "State",
  seurat_clusters: "Seurat cluster",
  Clone_Annotation: "Clone annotation",
  Phase: "Cell-cycle phase",
  nCount_RNA: "RNA counts",
  nFeature_RNA: "Genes detected",
  percent_mt: "Mitochondrial reads (%)",
  "percent.mt": "Mitochondrial reads (%)",
  orig_ident: "Sample",
  "orig.ident": "Sample",
  patient_id: "Patient",
  pair: "Patient",
};

/** Human-readable name of a metadata field; unknown names are tidied, not guessed. */
export function fieldLabel(name) {
  if (name === null || name === undefined) return "";
  const raw = `${name}`;
  if (KNOWN[raw]) return KNOWN[raw];
  const words = raw
    .replace(/[._]+/g, " ")
    .replace(/([a-z])([A-Z][a-z])/g, "$1 $2")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return raw;
  return words
    .map((w, i) => {
      // keep acronyms / mixed-case ids (RNA, CN, MGH303, G2M); lower-case plain capitalised words
      const plain = /^[A-Z][a-z]+$/.test(w);
      const lower = /^[a-z]+$/.test(w);
      if (i === 0) return lower ? w[0].toUpperCase() + w.slice(1) : w;
      return plain ? w.toLowerCase() : w;
    })
    .join(" ");
}
