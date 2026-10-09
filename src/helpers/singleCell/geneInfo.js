// Gene information for the single-cell views: curated GBM context plus
// builders / parsers for the public services the gene card queries live
// (MyGene.info, NCBI E-utilities, OncoKB's cancer gene list; all allow
// browser requests). d3-free so it can be unit tested.
import { GENE_SETS } from "./geneSets";

/**
 * Genes with an established role in glioblastoma (TCGA GBM, Brennan et al.
 * 2013 Cell; WHO CNS5 2021) and common GBM markers. One line each.
 */
export const GBM_GENES = {
  EGFR: { kind: "driver", note: "Amplified in ~40-55% of IDH-wildtype GBM, often on ecDNA; EGFRvIII deletion; a WHO-defining molecular feature" },
  PTEN: { kind: "driver", note: "Deleted or mutated in ~40% of GBM (chr10 loss); activates PI3K/AKT" },
  TP53: { kind: "driver", note: "Mutated in ~30% of GBM; p53 pathway altered in ~85%" },
  CDKN2A: { kind: "driver", note: "Homozygous deletion in ~60% of GBM (9p21); RB and p53 pathways" },
  CDKN2B: { kind: "driver", note: "Co-deleted with CDKN2A at 9p21 in most GBM" },
  CDK4: { kind: "driver", note: "Amplified in ~15% of GBM (12q14); RB pathway" },
  CDK6: { kind: "driver", note: "Amplified in a minority of GBM; RB pathway" },
  MDM2: { kind: "driver", note: "Amplified in ~10% of GBM (12q15), often with CDK4 and on ecDNA; p53 pathway" },
  MDM4: { kind: "driver", note: "Amplified in a minority of GBM (1q32); p53 pathway" },
  RB1: { kind: "driver", note: "Deleted or mutated in ~10% of GBM; RB pathway" },
  NF1: { kind: "driver", note: "Mutated or deleted in ~10-15% of GBM; enriched in the mesenchymal subtype" },
  PIK3CA: { kind: "driver", note: "Mutated in ~10% of GBM; PI3K pathway" },
  PIK3R1: { kind: "driver", note: "Mutated in ~10% of GBM; PI3K regulatory subunit" },
  PDGFRA: { kind: "driver", note: "Amplified in ~10-15% of GBM; proneural subtype" },
  MET: { kind: "driver", note: "Amplified or fused (PTPRZ1-MET) in a subset of GBM" },
  MYCN: { kind: "driver", note: "Amplified in a subset of GBM, frequently on ecDNA" },
  MYC: { kind: "driver", note: "Amplified or overexpressed in a subset of GBM; stem-like programs" },
  TERT: { kind: "driver", note: "Promoter mutated in ~80% of IDH-wildtype GBM; a WHO-defining molecular feature" },
  IDH1: { kind: "driver", note: "R132H defines IDH-mutant astrocytoma (not GBM under WHO 2021)" },
  IDH2: { kind: "driver", note: "Mutations define IDH-mutant glioma (not GBM under WHO 2021)" },
  ATRX: { kind: "driver", note: "Lost in IDH-mutant astrocytoma; ALT telomere maintenance" },
  "H3-3A": { kind: "driver", note: "H3 K27M / G34R in diffuse midline and hemispheric pediatric gliomas" },
  BRAF: { kind: "driver", note: "V600E in epithelioid GBM and some pediatric gliomas" },
  FGFR3: { kind: "driver", note: "FGFR3-TACC3 fusions in ~3% of GBM" },
  LZTR1: { kind: "driver", note: "Significantly mutated in TCGA GBM" },
  STAG2: { kind: "driver", note: "Significantly mutated in TCGA GBM (cohesin)" },
  SPTA1: { kind: "driver", note: "Significantly mutated in TCGA GBM" },
  GABRA6: { kind: "driver", note: "Significantly mutated in TCGA GBM" },
  QKI: { kind: "driver", note: "Deleted or fused in a subset of gliomas" },
  SOX2: { kind: "marker", note: "Glioma stem-cell transcription factor; amplified in some GBM" },
  OLIG2: { kind: "marker", note: "Glial lineage factor expressed in most gliomas; OPC-like state" },
  GFAP: { kind: "marker", note: "Astrocytic marker; AC-like state" },
  CD44: { kind: "marker", note: "Mesenchymal / MES-like state marker" },
  CHI3L1: { kind: "marker", note: "YKL-40; mesenchymal / MES-like state marker" },
  PROM1: { kind: "marker", note: "CD133; proposed glioma stem-cell marker" },
  NES: { kind: "marker", note: "Nestin; neural stem / progenitor marker in glioma" },
  MGMT: { kind: "marker", note: "Promoter methylation predicts temozolomide response" },
};

const GLIOMA_GMT = /GLIOMA|ASTROCYTE|NPC|OPC|OLIGO/i;

/** GBM cell-state programs (Neftel built-ins plus glioma-related 3CA programs) that contain the gene. */
export function gbmPrograms(gene, gmt = []) {
  const builtin = Object.entries(GENE_SETS)
    .filter(([term, genes]) => /Neftel/.test(term) && genes.includes(gene))
    .map(([term]) => term);
  const meta = gmt
    .filter((s) => GLIOMA_GMT.test(s.term) && s.genes.includes(gene))
    .map((s) => s.term.replace(/^3CA_\d+_/, "3CA ").replace(/_/g, " "));
  return [...builtin, ...meta];
}

/**
 * Aliases worth searching PubMed with: upper-case gene-like symbols that
 * carry a digit or are 5+ characters, so words such as "MARS" (MARS1) or
 * "CAT" do not pull in unrelated papers.
 */
export function searchAliases(symbol, aliases = []) {
  const list = Array.isArray(aliases) ? aliases : [aliases];
  const geneLike = (a) => /^[A-Z][A-Z0-9-]{2,}$/.test(`${a}`) && (/\d/.test(a) || a.length >= 5);
  return [...new Set([symbol, ...list.filter((a) => a !== symbol && geneLike(a))])].slice(0, 5);
}

const tiab = (terms) => terms.map((x) => `"${x}"[tiab]`).join(" OR ");

/** PubMed query for the gene (and its aliases) in glioblastoma / glioma ("GBM" alone also means gradient boosting machine). */
export const gliomaQuery = (symbol, aliases = []) => `(${tiab(searchAliases(symbol, aliases))}) AND (glioblastoma[tiab] OR glioma[tiab])`;

export const pubmedSearchUrl = (query) => `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(query)}`;

/** Fields of a MyGene.info hit the card shows. */
export function parseMyGene(hit) {
  if (!hit) return null;
  const pos = Array.isArray(hit.genomic_pos) ? hit.genomic_pos[0] : hit.genomic_pos;
  const alias = hit.alias == null ? [] : Array.isArray(hit.alias) ? hit.alias : [hit.alias];
  return {
    symbol: hit.symbol,
    name: hit.name || "",
    summary: hit.summary || "",
    aliases: alias,
    type: hit.type_of_gene || "",
    entrez: hit.entrezgene || hit._id,
    locus: pos?.chr ? `chr${pos.chr}:${Number(pos.start).toLocaleString()}` : "",
  };
}

/** OncoKB cancerGeneList.txt -> Map(symbol -> { type, sources, cgc }). */
export function parseCancerGeneList(text) {
  const lines = `${text || ""}`.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return new Map();
  const head = lines[0].split("\t");
  const col = (name) => head.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
  const iSym = col("Hugo Symbol");
  const iType = col("Gene Type");
  const iCgc = head.findIndex((h) => /COSMIC CGC/i.test(h));
  const iN = head.findIndex((h) => /# of occurrence/i.test(h));
  const map = new Map();
  lines.slice(1).forEach((line) => {
    const f = line.split("\t");
    if (!f[iSym]) return;
    const type = `${f[iType] || ""}`.replace(/_/g, " ").toLowerCase();
    map.set(f[iSym], { type: type === "insufficient evidence" ? "" : type, sources: Number(f[iN]) || 0, cgc: `${f[iCgc] || ""}`.toLowerCase() === "yes" });
  });
  return map;
}

/** External pages for the gene. */
export const geneLinks = (symbol, entrez) => [
  { label: "GeneCards", href: `https://www.genecards.org/cgi-bin/carddisp.pl?gene=${encodeURIComponent(symbol)}` },
  entrez && { label: "NCBI Gene", href: `https://www.ncbi.nlm.nih.gov/gene/${entrez}` },
  { label: "OncoKB", href: `https://www.oncokb.org/gene/${encodeURIComponent(symbol)}` },
  { label: "cBioPortal GBM", href: `https://www.cbioportal.org/results/oncoprint?cancer_study_list=gbm_tcga_pan_can_atlas_2018&Z_SCORE_THRESHOLD=2.0&RPPA_SCORE_THRESHOLD=2.0&profileFilter=mutations%2Cgistic&case_set_id=gbm_tcga_pan_can_atlas_2018_cnaseq&gene_list=${encodeURIComponent(symbol)}` },
  { label: "Protein Atlas", href: `https://www.proteinatlas.org/search/${encodeURIComponent(symbol)}` },
].filter(Boolean);
