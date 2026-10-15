// Links out for a gene / mutation (d3-free): cBioPortal GBM and pan-cancer, OncoKB, COSMIC.
const PANCAN = ["acc", "blca", "brca", "cesc", "chol", "coadread", "dlbc", "esca", "gbm", "hnsc", "kich", "kirc", "kirp", "laml", "lgg", "lihc",
  "luad", "lusc", "meso", "ov", "paad", "pcpg", "prad", "sarc", "skcm", "stad", "tgct", "thca", "thym", "ucec", "ucs", "uvm"].map((s) => `${s}_tcga_pan_can_atlas_2018`);
const GBM = ["gbm_tcga_pan_can_atlas_2018", "gbm_tcga_pub2013"];
const CBIO = "https://www.cbioportal.org/results/mutations";

const cbio = (studies, gene) => `${CBIO}?cancer_study_list=${studies.join(",")}&case_set_id=all&gene_list=${encodeURIComponent(gene)}`;

/** Protein change without the "p." prefix, or null when there is none (e.g. "p.R2566*" -> "R2566*"). */
export function proteinChange(protein) {
  const p = `${protein || ""}`.trim().replace(/^p\./, "");
  return p && p !== "None" && p !== "?" && /[A-Z*]/.test(p) ? p : null;
}

/** Gene symbols of an event label ("GENEA::GENEB" fusions give both; "chr7 amp (MET, +1)" style labels give none). */
export function linkGenes(label) {
  return `${label || ""}`.split(/::|,|\s+/).map((s) => s.trim()).filter((s) => /^[A-Z][A-Z0-9-]{1,14}$/.test(s) && !/^CHR/.test(s));
}

/** [{ key, label, href }] for a gene, plus mutation-level links when a protein change is given. */
export function externalLinks(gene, protein = null) {
  if (!gene) return [];
  const g = encodeURIComponent(gene);
  const p = proteinChange(protein);
  const out = [
    { key: "cbio-gbm", label: "cBioPortal GBM", href: cbio(GBM, gene) },
    { key: "cbio-pancan", label: "cBioPortal pan-cancer (TCGA)", href: cbio(PANCAN, gene) },
    { key: "oncokb", label: "OncoKB gene", href: `https://www.oncokb.org/gene/${g}` },
  ];
  if (p) {
    out.push({ key: "oncokb-var", label: `OncoKB ${p}`, href: `https://www.oncokb.org/gene/${g}/${encodeURIComponent(p)}` });
    out.push({ key: "cosmic-var", label: `COSMIC ${p}`, href: `https://cancer.sanger.ac.uk/cosmic/search?q=${encodeURIComponent(`${gene} ${p}`)}` });
  } else {
    out.push({ key: "cosmic", label: "COSMIC gene", href: `https://cancer.sanger.ac.uk/cosmic/gene/analysis?ln=${g}` });
  }
  return out;
}
