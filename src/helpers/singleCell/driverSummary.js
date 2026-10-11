// Plain-language summaries of a patient's subclonal drivers for the Drivers
// tab's ranked board (and any other view that wants one line per driver):
// what the gene is, what the alteration does to it, which cells carry it,
// what differs in those cells and how strong the evidence is.
// d3-free so jest can test it.
import { GBM_GENES } from "./geneInfo";
import { GENE_SETS } from "./geneSets";
import { fisherExact, mannWhitney } from "./tests";
import { benjaminiHochberg } from "./rnaStats";
import { splitIds } from "./driverContrast";

/** Curated pathway of common cancer genes (one short phrase each). */
const PATHWAY_GENES = {
  "growth-factor receptor (RTK) signalling": "EGFR ERBB2 ERBB3 ERBB4 PDGFRA PDGFRB MET FGFR1 FGFR2 FGFR3 FGFR4 KIT KDR FLT3 FLT4 NTRK1 NTRK2 NTRK3 ALK ROS1 RET HGF NRG1 DDR2 PDGFB",
  "RAS / MAPK signalling": "KRAS NRAS HRAS BRAF RAF1 MAP2K1 MAP2K2 MAPK1 MAPK3 NF1 LZTR1 PTPN11 SOS1 CBL RRAS2 MAP3K1 MAP2K4 MAP3K13 SRC RAC1 RHOA ARHGAP35 ARHGAP26 PLCG1",
  "PI3K / AKT / mTOR signalling": "PIK3CA PIK3CB PIK3R1 PTEN AKT1 AKT2 MTOR TSC1 TSC2 STK11",
  "p53 pathway (DNA-damage checkpoint)": "TP53 MDM2 MDM4 PPM1D ATM CHEK2",
  "RB / cell-cycle control": "RB1 CDK4 CDK6 CDKN2A CDKN2B CDKN2C CDKN1B CCND1 CCND2 CCND3 CCNE1",
  "DNA repair": "BRCA1 BRCA2 PALB2 ATR PRKDC FANCA FANCC FANCD2 FANCE FANCF FANCG MSH2 MSH6 MLH1 PMS1 PMS2 POLE POLD1 ERCC2 ERCC3 ERCC4 ERCC5 XPA XPC RAD50 RAD51B NBN BLM WRN RECQL4 SLX4 MUTYH BRIP1 BARD1 CDK12 DDB2",
  "chromatin / epigenetic regulation": "ARID1A ARID1B ARID2 ARID4A SMARCA4 SMARCB1 SMARCE1 PBRM1 KMT2A KMT2C KMT2D NSD1 SETD2 EZH2 SUZ12 EP300 CREBBP ASXL1 ASXL2 DNMT3A TET1 TET2 IDH1 IDH2 KDM5A KDM5C ATRX DAXX CHD4 BRD3 BRD4 MLLT3 MLLT10 H3-3A CTCF BCL7A",
  "Hedgehog signalling": "GLI1 PTCH1 SMO SUFU",
  "Wnt / β-catenin signalling": "APC CTNNB1 AXIN1 AXIN2 RNF43 TCF7L2 LEF1 WIF1",
  "Notch signalling": "NOTCH1 NOTCH2 SPEN",
  "Hippo / NF2 signalling": "NF2 LATS1 LATS2 WWTR1",
  "transcription factor": "MYC MYCN MYCL MYB ETV1 ETV4 ETV5 ETV6 ERG FLI1 SOX2 DDIT3 PAX3 PAX5 PAX7 PAX8 KLF4 NR4A3 HMGA1 HMGA2 JUN CEBPA RUNX1 GATA2 GATA3 FOXA1 FOXO1 FOXP1 MAX MECOM CUX1 TBX3 ZFHX3 PRDM1 IKZF1 IKZF3 MITF",
  "JAK / STAT cytokine signalling": "JAK1 JAK2 JAK3 STAT3 STAT5B STAT6 SOCS1 PTPN2 SH2B3 IL6ST IL7R MPL CSF3R",
  "immune signalling / antigen presentation": "CARD11 B2M HLA-A HLA-B HLA-C CD274 PDCD1LG2 TNFAIP3 MYD88 BCL10 REL CIITA CD74 IRAK3 CD79A CD79B",
  "telomere maintenance": "TERT POT1",
  "TGF-β / BMP signalling": "TGFBR2 SMAD2 SMAD3 SMAD4 ACVR1 ACVR1B ACVR2A BMPR1A",
  "apoptosis": "BCL2 CASP8 FAS BIRC3 BCL6",
  "DNA topology / replication": "TOP1",
  "LDL-receptor family (cell-surface receptor, endocytosis)": "LRP1B LRP1",
  "RNA splicing / processing": "SF3B1 U2AF1 RBM15 QKI DDX5",
  "protein tyrosine phosphatase": "PTPRB PTPRT PTPRR PTPN13",
  "cell adhesion": "CDH1 CDH11 CTNND1 FAT1 ITGAV",
};
export const PATHWAY_OF = Object.entries(PATHWAY_GENES).reduce((m, [p, genes]) => {
  genes.split(" ").forEach((g) => {
    if (!m[g]) m[g] = p;
  });
  return m;
}, {});

const clean = (v) => (v == null || v === "None" || v === "NA" || v === "" ? null : `${v}`.replace(/<[^>]+>/g, "").trim());
const num = (v) => {
  const x = Number(v);
  return v == null || v === "" || v === "None" || !Number.isFinite(x) ? null : x;
};

/** Alteration class of an event: amp | homdel | fusion | trunc | splice | missense | other. */
export function alterationKind(e = {}) {
  const vt = `${e.vartype || ""}`.toLowerCase();
  const ty = `${e.type || ""}`.toLowerCase();
  if (vt === "amp" || /amp/.test(ty)) return "amp";
  if (vt === "homdel" || /homdel|del/.test(ty)) return "homdel";
  if (/fusion/.test(vt) || /fusion/.test(ty) || `${e.fusion_genes || ""}`.includes("::")) return "fusion";
  if (/trunc|nonsense|frameshift/.test(ty)) return "trunc";
  if (/splice/.test(ty)) return "splice";
  if (/missense|inframe/.test(ty) || vt === "snv") return "missense";
  return "other";
}

/** Point mutations: per-cell calls need reads at the site, so carriers are under-called. */
export const isSnvKind = (kind) => ["trunc", "splice", "missense"].includes(kind);

export const KIND_LABEL = { amp: "Amplification", homdel: "Deletion (both copies)", fusion: "Fusion", trunc: "Truncating mutation", splice: "Splice-site mutation", missense: "Missense mutation", other: "Alteration" };

/** Genes of an event (both partners of a fusion). */
export const driverGenes = (e = {}) => (`${e.fusion_genes || ""}`.includes("::") ? `${e.fusion_genes}`.split("::") : [`${e.gene || ""}`]).filter(Boolean);

/** OncoKB role text -> "oncogene" | "tumor suppressor" | "oncogene and tumor suppressor" | null. */
export function roleOf(role) {
  const r = `${clean(role) || ""}`.toLowerCase();
  const onc = /oncogene/.test(r);
  const tsg = /suppressor/.test(r);
  if (onc && tsg) return "oncogene and tumor suppressor";
  if (onc) return "oncogene";
  if (tsg) return "tumor suppressor";
  return null;
}

/**
 * What a gene is, in plain language: role (OncoKB), pathway (curated), GBM
 * relevance (curated) and a one-sentence description (OncoKB gene summary of
 * the event when it is about this gene).
 */
export function geneBrief(gene, event = {}) {
  const own = `${event.gene || ""}` === gene || driverGenes(event).length === 1;
  const role = own ? roleOf(event.role) : null;
  const gbm = GBM_GENES[gene] || null;
  const summary = own ? clean(event.gene_summary) : null;
  const programs = Object.entries(GENE_SETS)
    .filter(([, genes]) => genes.includes(gene))
    .map(([name]) => name);
  return {
    gene,
    role,
    pathway: PATHWAY_OF[gene] || null,
    gbm: gbm ? { kind: gbm.kind, note: gbm.note } : null,
    summary,
    programs,
    known: Boolean(role || gbm || PATHWAY_OF[gene]),
  };
}

/** Breakpoint exons of a fusion from OncoKB-style Variant text ("Exon -1 (p.5'UTR)::Exon 5 (p.120)"). */
export function fusionExons(variant) {
  return `${variant || ""}`
    .replace(/^.*?Fusion\s*/i, "")
    .split("::")
    .map((p) => {
      const m = p.match(/Exon\s+(-?\d+)/i);
      return m ? Number(m[1]) : null;
    });
}

/** What the alteration does to the gene(s), one or two plain sentences. */
export function alterationText(e = {}) {
  const kind = alterationKind(e);
  const genes = driverGenes(e);
  const g = genes[0] || "?";
  const role = roleOf(e.role);
  const variant = clean(e.Variant);
  switch (kind) {
    case "amp": {
      const cn = num(e.segment_cn);
      return `Extra copies of ${g}${cn != null ? ` (about ${Math.round(cn)} copies in carriers)` : ""}; more copies usually means more ${g} RNA and protein${role === "oncogene" ? " — a gain-of-function route for an oncogene" : ""}.`;
    }
    case "homdel":
      return `Both copies of ${g} are deleted, so the carriers cannot make it${role === "tumor suppressor" ? " — complete loss of a tumor suppressor" : ""}.`;
    case "trunc":
      return `${variant ? `${variant}: a` : "A"} premature stop in ${g} — the protein is cut short and the RNA is often degraded (loss of function${role === "tumor suppressor" ? " of a tumor suppressor" : ""}).`;
    case "splice":
      return `Changes a splice site of ${g}, so exons may be skipped or introns kept — usually loss of function${role === "tumor suppressor" ? " of a tumor suppressor" : ""}.`;
    case "missense":
      return `${variant || "An amino-acid change"} in ${g}${clean(e.effect) ? ` (${clean(e.effect).toLowerCase()})` : ""}.`;
    case "fusion": {
      const [a, b] = genes;
      const [ea, eb] = fusionExons(e.Variant);
      const frame = /out/i.test(`${e.vartype || ""}${e.Variant || ""}`) ? "out of frame" : /in-frame|^fusion$/i.test(`${e.vartype || ""}`) || /in-frame/i.test(`${e.Variant || ""}`) ? "in frame" : null;
      const promoterSwap = ea != null && ea < 1;
      const parts = [`The start of ${a}${ea != null && ea >= 1 ? ` (to exon ${ea})` : ""} is joined to ${b}${eb != null && eb >= 1 ? ` from exon ${eb}` : ""}${frame ? `, ${frame}` : ""}.`];
      if (promoterSwap) parts.push(`The break is in ${a}'s 5′ UTR, so the junction could put ${b} under ${a}'s promoter rather than make a chimeric protein.`);
      else if (frame === "out of frame") parts.push(`Out of frame: likely disrupts ${b} rather than making a working chimera.`);
      return parts.join(" ");
    }
    default:
      return clean(e.variant_summary) || `${KIND_LABEL[kind]} of ${g}.`;
  }
}

/** Expected direction of the gene's own expression in carriers: 1 up, -1 down, 0 no expectation. */
export function expectedDirection(kind) {
  if (kind === "amp") return 1;
  if (kind === "homdel" || kind === "trunc") return -1;
  return 0;
}

/**
 * Priority of a candidate driver for the ranked board (higher first) with
 * the reasons, from what is known before looking at expression.
 */
export function driverPriority(d) {
  const e = d.event || {};
  const reasons = [];
  let s = 0;
  const tier = Number(e.Tier) || d.tier || 9;
  if (tier === 1) {
    s += 40;
    reasons.push("OncoKB tier 1");
  } else if (tier === 2) {
    s += 25;
    reasons.push("OncoKB tier 2");
  }
  const genes = driverGenes(e);
  const role = roleOf(e.role);
  if (role) {
    s += 10;
    reasons.push(`cancer gene (${role})`);
  }
  if (genes.some((g) => GBM_GENES[g]?.kind === "driver")) {
    s += 12;
    reasons.push("known GBM driver gene");
  } else if (genes.some((g) => PATHWAY_OF[g])) s += 3;
  if (e.driver_class === "likely") {
    s += 8 + (num(e.driver_score) || 0);
    reasons.push(`SNV driver score ${num(e.driver_score) ?? "?"} (likely)`);
  } else if (e.driver_class === "possible") s += 2;
  else if (e.driver_class === "unlikely") s -= 6;
  const kind = alterationKind(e);
  if (kind === "fusion" && /out/i.test(`${e.vartype || ""}`)) s -= 4;
  const fit = d.fit && Number.isFinite(d.fit.score) ? d.fit.score : null;
  if (fit != null && fit >= 0.8) {
    s += 12;
    reasons.push(`carriers form one clade (fit ${fit.toFixed(2)})`);
  } else if (fit != null && fit < 0.5) {
    s -= isSnvKind(kind) ? 4 : 10;
    reasons.push(`carriers scattered on the tree (fit ${fit.toFixed(2)})`);
  }
  const n = d.carriers?.length || 0;
  if (n < 5) s -= 5;
  else if (n >= 10) s += 2;
  return { score: s, reasons };
}

const LEVEL_RANK = { strong: 3, moderate: 2, weak: 1 };

/**
 * Order candidates for display: evidence level of the call first (tier,
 * SNV evidence, clade fit, carriers), then priority, then events travelling
 * with it (a clone-defining bundle), then carriers. Sets d.priority.
 * Works on drivers ({ event, carriers, fit }) or bundles ({ lead, members }).
 */
export function rankCandidates(items) {
  const key = (x) => {
    const d = x.lead || x;
    if (!d.priority) d.priority = driverPriority(d);
    const ev = evidenceStrength(d);
    return [LEVEL_RANK[ev.level], d.priority.score + Math.min(6, (x.members?.length || 1) - 1), d.carriers.length];
  };
  const keyed = items.map((x) => ({ x, k: key(x) }));
  keyed.sort((a, b) => b.k[0] - a.k[0] || b.k[1] - a.k[1] || b.k[2] - a.k[2]);
  return keyed.map((y) => y.x);
}

/** Clade F1 at or above which the carriers count as one branch of the tree: a key finding. */
export const KEY_FIT = 0.8;

/** True when a driver ({ event }) hits a cancer gene: OncoKB tier 1-2, a curated role, or a GBM gene. */
export function inCancerGene(d = {}) {
  const e = d.event || {};
  return Number(e.Tier) <= 2 || driverGenes(e).some((g) => {
    const b = geneBrief(g, e);
    return Boolean(b.role || b.gbm);
  });
}

/** Clade F1 of a driver or bundle, or null. */
export function cladeFit(x) {
  const d = (x && x.lead) || x || {};
  return d.fit && Number.isFinite(d.fit.score) ? d.fit.score : null;
}

/**
 * Key findings first: candidates whose carriers form one branch (clade F1 >=
 * KEY_FIT), highest F1 first (0.05 steps, ties keep the given rank), then the
 * rest in the given order.
 */
export function keyFindingsFirst(items, minFit = KEY_FIT) {
  const keyed = items.map((x, i) => ({ x, i, f: cladeFit(x) }));
  const key = keyed.filter((y) => y.f != null && y.f >= minFit).sort((a, b) => Math.round(b.f * 20) - Math.round(a.f * 20) || a.i - b.i);
  const rest = keyed.filter((y) => !(y.f != null && y.f >= minFit));
  return [...key, ...rest].map((y) => y.x);
}

/** Jaccard index of two id arrays. */
export function jaccard(a, b) {
  const A = new Set(a);
  let both = 0;
  b.forEach((x) => A.has(x) && (both += 1));
  const union = A.size + new Set(b).size - both;
  return union ? both / union : 0;
}

/**
 * Group drivers carried by (nearly) the same cells: such events travel
 * together (one clone), so they are one candidate with co-travellers rather
 * than many independent ones. Drivers are taken in priority order; each joins
 * the first bundle whose lead's carriers it matches with Jaccard >= minJaccard.
 * @param drivers [{ key, carriers, priority: { score } }]
 * @returns [{ key, lead, members: [driver] (lead first) }] in priority order
 */
export function bundleDrivers(drivers, { minJaccard = 0.8 } = {}) {
  const sorted = [...drivers].sort((a, b) => (b.priority?.score ?? 0) - (a.priority?.score ?? 0) || b.carriers.length - a.carriers.length);
  const bundles = [];
  sorted.forEach((d) => {
    const home = bundles.find((b) => jaccard(b.lead.carriers, d.carriers) >= minJaccard);
    if (home) home.members.push(d);
    else bundles.push({ key: d.key, lead: d, members: [d] });
  });
  return bundles;
}

const mean = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN);
const sd = (v, m = mean(v)) => (v.length > 1 ? Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)) : NaN);

/**
 * Expression of one gene in carriers (a) vs non-carriers (b), log-normalised
 * values: fold change of mean normalised expression, share of cells
 * detecting it, AUC (chance a carrier expresses more than a non-carrier) and
 * Mann-Whitney p.
 */
export function expressionEffect(a, b, { pseudo = 0.05 } = {}) {
  if (!a.length || !b.length) return null;
  const lin = (v) => mean(v.map((x) => Math.expm1(x)));
  const mw = mannWhitney(a, b);
  const det = (v) => v.filter((x) => x > 0).length / v.length;
  return {
    log2fc: Math.log2((lin(a) + pseudo) / (lin(b) + pseudo)),
    detA: det(a),
    detB: det(b),
    auc: Number.isFinite(mw.U) ? mw.U / (a.length * b.length) : NaN,
    p: mw.p,
    nA: a.length,
    nB: b.length,
  };
}

/**
 * Standardised difference (Cohen's d with an approximate 95% CI) and
 * Mann-Whitney p of a per-cell score between carriers (a) and non-carriers (b).
 */
export function scoreEffect(a, b) {
  if (a.length < 2 || b.length < 2) return null;
  const ma = mean(a);
  const mb = mean(b);
  const pooled = Math.sqrt(((a.length - 1) * sd(a, ma) ** 2 + (b.length - 1) * sd(b, mb) ** 2) / (a.length + b.length - 2));
  const d = pooled > 0 ? (ma - mb) / pooled : 0;
  const se = Math.sqrt((a.length + b.length) / (a.length * b.length) + (d * d) / (2 * (a.length + b.length)));
  return { d, lo: d - 1.96 * se, hi: d + 1.96 * se, p: mannWhitney(a, b).p, meanA: ma, meanB: mb, nA: a.length, nB: b.length };
}

/** scoreEffect for each program ({ name, a, b }) with BH q across them, sorted by p. */
export function programEffects(programs) {
  const rows = programs.map((pr) => ({ name: pr.name, ...scoreEffect(pr.a, pr.b) })).filter((r) => Number.isFinite(r.d));
  const q = benjaminiHochberg(rows.map((r) => r.p));
  rows.forEach((r, k) => (r.q = q[k]));
  return rows.sort((x, y) => x.p - y.p);
}

/**
 * Shift in categorical cell state between carriers and non-carriers: for each
 * level, share in each group and Fisher p; the level with the largest
 * significant (or largest) change first.
 * @param levels [{ level, a, b }] counts (balanceTable row levels)
 */
export function stateShift(levels) {
  const nA = levels.reduce((s, l) => s + l.a, 0);
  const nB = levels.reduce((s, l) => s + l.b, 0);
  if (!nA || !nB) return [];
  return levels
    .map((l) => ({ level: l.level, shareA: l.a / nA, shareB: l.b / nB, a: l.a, b: l.b, p: fisherExact(l.a, nA - l.a, l.b, nB - l.b).p }))
    .sort((x, y) => x.p - y.p || Math.abs(y.shareA - y.shareB) - Math.abs(x.shareA - x.shareB));
}

/**
 * RNA splicing findings whose cells are enriched in the carriers (Fisher test
 * over cells with RNA): linked events worth checking with the driver.
 * @param findings normalised splice findings ({ id, gene, text, cells })
 * @param carriers / others cell ids with RNA
 */
export function linkedSpliceFindings(findings, carriers, others, { maxP = 0.01, minCells = 3 } = {}) {
  const A = new Set(carriers);
  const B = new Set(others);
  return (findings || [])
    .map((f) => {
      let a = 0;
      let b = 0;
      (f.cells || []).forEach((c) => {
        if (A.has(c)) a += 1;
        else if (B.has(c)) b += 1;
      });
      if (a < minCells) return null;
      const { p } = fisherExact(a, A.size - a, b, B.size - b);
      return a / (A.size || 1) > b / (B.size || 1) && p <= maxP ? { finding: f, a, b, fracA: a / (A.size || 1), fracB: b / (B.size || 1), p } : null;
    })
    .filter(Boolean)
    .sort((x, y) => x.p - y.p);
}

/** Plate make-up confound: carriers concentrated on plates the non-carriers barely use. */
export function plateConfound(plateRow) {
  if (!plateRow || !Number.isFinite(plateRow.p) || plateRow.p > 0.01) return null;
  const nA = plateRow.nA || 1;
  const nB = plateRow.nB || 1;
  const skewed = plateRow.levels.filter((l) => l.a / nA - l.b / nB >= 0.2).map((l) => l.level);
  return skewed.length ? { plates: skewed, p: plateRow.p } : null;
}

/**
 * How strong the case for this driver is, from the call itself (tier, SNV
 * driver evidence, clade fit, number of carriers) and supporting RNA.
 * @returns { level: "strong" | "moderate" | "weak", score, reasons: [string], cautions: [string] }
 */
export function evidenceStrength(d, { rnaSupport = null, confound = null } = {}) {
  const e = d.event || {};
  const reasons = [];
  const cautions = [];
  let s = 0;
  const tier = Number(e.Tier) || 9;
  if (tier <= 2) {
    s += 2;
    reasons.push(`OncoKB tier ${tier}`);
  }
  if (e.driver_class === "likely") {
    s += 1;
    reasons.push(`SNV driver evidence: ${clean(e.driver_evidence) || `score ${e.driver_score}`}`);
  } else if (e.driver_class === "unlikely") cautions.push("SNV driver evidence: unlikely");
  const fit = d.fit && Number.isFinite(d.fit.score) ? d.fit.score : null;
  if (fit != null && fit >= 0.8) {
    s += 2;
    reasons.push(`carriers form one clade (${d.fit.inClade} of ${d.fit.clade} cells, fit ${fit.toFixed(2)})`);
  } else if (fit != null && fit >= 0.5) {
    s += 1;
    reasons.push(`carriers mostly one clade (fit ${fit.toFixed(2)})`);
  } else if (fit != null && isSnvKind(alterationKind(e))) {
    s -= 1;
    cautions.push(`carriers spread over the tree (fit ${fit.toFixed(2)}); a cell is only called when it has reads at the site, so true carriers are under-counted — still one clone is possible, as are noise or convergence`);
  } else if (fit != null) {
    s -= 2;
    cautions.push(`carriers scattered on the tree (fit ${fit.toFixed(2)}): possible noise or convergence`);
  }
  const n = d.carriers?.length || 0;
  if (n >= 10) s += 1;
  else if (n < 5) cautions.push(`only ${n} carrier cells`);
  const alt = num(e.alt);
  if (alterationKind(e) !== "fusion" && alt != null && alt > 0 && num(e.VAF) != null) reasons.push(`${alt} alt reads, pooled VAF ${num(e.VAF).toFixed(2)}`);
  if (rnaSupport?.chimericCells > 0) {
    s += 2;
    reasons.push(`chimeric RNA reads in ${rnaSupport.chimericCells} carrier cells`);
  } else if (rnaSupport && rnaSupport.withRna > 0 && rnaSupport.chimericCells === 0) cautions.push(`no chimeric RNA reads in ${rnaSupport.withRna} carrier cells with RNA`);
  if (rnaSupport?.dosageAgrees) {
    s += 1;
    reasons.push("the gene's own expression moves the expected way");
  }
  if (confound) cautions.push(`carriers concentrated on plate(s) ${confound.plates.join(", ")}: plate / region differences can look like driver effects`);
  const level = s >= 5 ? "strong" : s >= 3 ? "moderate" : "weak";
  return { level, score: s, reasons, cautions };
}

const fmtFold = (lfc) => {
  const f = 2 ** Math.abs(lfc);
  return `${f >= 10 ? Math.round(f) : f.toFixed(1)}×`;
};
const pct = (x) => `${Math.round(x * 100)}%`;

/** Direction word of an effect. */
export function effectWord(lfc, p, { alpha = 0.05, minLfc = 0.5 } = {}) {
  if (!Number.isFinite(lfc) || !Number.isFinite(p) || p > alpha || Math.abs(lfc) < minLfc) return "no clear change";
  return lfc > 0 ? `${fmtFold(lfc)} higher` : `${fmtFold(lfc)} lower`;
}

/**
 * One line per driver for reports and vignettes, e.g.
 * "ZNF345::MLLT3 fusion in 65 of 130 tumor cells (50%, one clade); travels with the 12q GLI1 amplicon; MLLT3 expression no clear change; evidence moderate."
 * @param s summary from summarizeDriver
 */
export function driverOneLiner(s) {
  if (!s) return "";
  const parts = [`${s.label} (${KIND_LABEL[s.kind].toLowerCase()}) in ${s.n} of ${s.total} tumor cells (${pct(s.fraction)}${s.fit != null && s.fit >= 0.8 ? ", one clade" : ""})`];
  const co = [...(s.keyCoTravellers || []).map((k) => k.label), ...(s.coTravellers || []).filter((l) => !(s.keyCoTravellers || []).some((k) => k.label === l))];
  if (co.length) parts.push(`travels with ${co.slice(0, 3).join(", ")}${co.length > 3 ? ` +${co.length - 3}` : ""}`);
  (s.dosage || []).slice(0, 2).forEach((g) => parts.push(`${g.gene} RNA ${effectWord(g.log2fc, g.p)}`));
  const prog = (s.programs || []).find((p) => p.q < 0.1);
  if (prog) parts.push(`${prog.name} program ${prog.d > 0 ? "up" : "down"} (d ${prog.d.toFixed(1)})`);
  if (s.evidence) parts.push(`evidence ${s.evidence.level}`);
  return `${parts.join("; ")}.`;
}

/**
 * Everything the board shows for one driver bundle.
 * @param bundle { lead, members } from bundleDrivers
 * @param ctx {
 *   total: tumor cells, nonCarriers: tumor cell ids not carrying the lead,
 *   expr: (gene, ids) -> number[] | null (log-normalised values of cells with RNA),
 *   programScores: [{ name, of: (ids) -> number[] }],
 *   stateOf: (ids) -> [{ level, a, b }] counts or null (pass both groups),
 *   cnRegions: [{ where, diff, meanA, meanB }] from cnContrast, sorted by size,
 *   chimeric: { withRna, chimericCells } | null,
 *   spliceLinks: from linkedSpliceFindings,
 *   plateRow: balanceTable plate row
 * }
 */
export function summarizeDriver(bundle, ctx) {
  const d = bundle.lead;
  const e = d.event || {};
  const kind = alterationKind(e);
  const genes = driverGenes(e);
  const carriers = d.carriers;
  const others = ctx.nonCarriers || [];
  const expDir = expectedDirection(kind);
  const dosage = genes
    .map((g) => {
      const a = ctx.expr ? ctx.expr(g, carriers) : null;
      const b = ctx.expr ? ctx.expr(g, others) : null;
      if (!a || !b) return null;
      const eff = expressionEffect(a, b);
      if (!eff) return null;
      const changed = eff.p <= 0.05 && Math.abs(eff.log2fc) >= 0.5;
      return { gene: g, ...eff, expected: expDir, agrees: expDir !== 0 && changed && Math.sign(eff.log2fc) === expDir, opposite: expDir !== 0 && changed && Math.sign(eff.log2fc) === -expDir, changed };
    })
    .filter(Boolean);
  const programs = ctx.programScores
    ? programEffects(
        ctx.programScores
          .map((p) => ({ name: p.name, a: p.of(carriers), b: p.of(others) }))
          .filter((p) => p.a.length >= 3 && p.b.length >= 3)
      )
    : [];
  const stateLevels = ctx.stateOf ? ctx.stateOf(carriers, others) : null;
  const state = stateLevels ? stateShift(stateLevels) : [];
  const confound = plateConfound(ctx.plateRow);
  const rnaSupport = {
    ...(ctx.chimeric || {}),
    dosageAgrees: dosage.some((g) => g.agrees),
  };
  if (!ctx.chimeric) {
    delete rnaSupport.withRna;
    delete rnaSupport.chimericCells;
  }
  const evidence = evidenceStrength(d, { rnaSupport: kind === "fusion" || rnaSupport.dosageAgrees ? rnaSupport : null, confound });
  const coTravellers = bundle.members.slice(1).map((m) => m.label);
  // co-travelling events in GBM driver / cancer genes, most notable first (e.g. EGFR AMP riding with MET AMP)
  const keyCoTravellers = bundle.members
    .slice(1)
    .map((m) => ({ label: m.label, gbm: driverGenes(m.event).some((g) => GBM_GENES[g]?.kind === "driver"), cancer: Boolean(roleOf(m.event?.role)) || driverGenes(m.event).some((g) => PATHWAY_OF[g]) }))
    .filter((m) => m.gbm || m.cancer)
    .sort((a, b) => b.gbm - a.gbm)
    .map((m) => ({ label: m.label, gbm: m.gbm }));
  const out = {
    key: d.key,
    label: d.label,
    kind,
    genes,
    briefs: genes.map((g) => geneBrief(g, e)),
    alteration: alterationText(e),
    n: carriers.length,
    total: ctx.total,
    fraction: carriers.length / (ctx.total || 1),
    fit: d.fit && Number.isFinite(d.fit.score) ? d.fit.score : null,
    fitDetail: d.fit || null,
    coTravellers,
    keyCoTravellers,
    members: bundle.members,
    priority: d.priority || driverPriority(d),
    dosage,
    programs,
    state,
    cn: (ctx.cnRegions || []).slice(0, 3),
    chimeric: ctx.chimeric || null,
    spliceLinks: ctx.spliceLinks || [],
    confound,
    evidence,
    nRnaA: dosage[0]?.nA ?? programs[0]?.nA ?? 0,
    nRnaB: dosage[0]?.nB ?? programs[0]?.nB ?? 0,
  };
  out.oneLiner = driverOneLiner(out);
  return out;
}

/** Carriers of an event restricted to the given tumor ids. */
export const carriersOf = (e, tumor) => splitIds(e.cell_ids).filter((id) => tumor.has(id));

/** Chromosome and local position of a global coordinate. */
export function toLocalPosition(chromoBins, g) {
  const entry = Object.entries(chromoBins || {}).find(([, v]) => g >= v.startPlace && g <= v.endPlace);
  return entry ? { chrom: entry[0], pos: Math.max(0, Math.round(g - entry[1].startPlace)) } : null;
}

/**
 * Copy-number regions worth naming next to a driver: large or strong
 * differences between carriers and non-carriers (cnContrast regions), with
 * a readable location and the amplified / deleted cancer genes inside.
 * @param regions cnContrast regions ({ start, end, meanA, meanB, diff }, global coordinates, grid step `step`)
 * @param scna [{ gene, global }] amplification / deletion events with their global position
 */
export function describeCnRegions(regions, chromoBins, scna = [], { step = 1e6, minDiff = 0.8, max = 4, mergeGap = 10e6 } = {}) {
  const mb = (bp) => (bp / 1e6).toFixed(bp >= 1e7 ? 0 : 1);
  // neighbouring pieces of one change (e.g. an amplicon split by a dip) become one region, reported at its peak
  const merged = [];
  [...(regions || [])]
    .filter((r) => Math.abs(r.diff) >= minDiff)
    .sort((a, b) => a.start - b.start)
    .forEach((r) => {
      const prev = merged[merged.length - 1];
      const chrom = toLocalPosition(chromoBins, r.start)?.chrom;
      if (prev && prev.chrom === chrom && Math.sign(prev.diff) === Math.sign(r.diff) && r.start - prev.end <= mergeGap) {
        prev.end = r.end;
        prev.pieces += 1;
        if (Math.abs(r.diff) > Math.abs(prev.diff)) Object.assign(prev, { diff: r.diff, meanA: r.meanA, meanB: r.meanB });
      } else merged.push({ ...r, chrom, pieces: 1 });
    });
  const rank = (g) => (GBM_GENES[g]?.kind === "driver" ? 0 : PATHWAY_OF[g] ? 1 : 2);
  return merged
    .filter((r) => r.end > r.start || Math.abs(r.diff) >= 2)
    .map((r) => {
      const lo = r.start - step / 2;
      const hi = r.end + step / 2;
      const a = toLocalPosition(chromoBins, Math.max(lo, 0));
      const b = toLocalPosition(chromoBins, hi);
      // genes within one grid step of the edges (the grid samples the middle of each step)
      const genes = [...new Set(scna.filter((s) => s.global >= lo - step && s.global <= hi + step).map((s) => s.gene))].sort((x, y) => rank(x) - rank(y) || x.localeCompare(y));
      return {
        ...r,
        lo,
        hi,
        where: a ? `chr${a.chrom}:${mb(a.pos)}–${b && b.chrom === a.chrom ? mb(b.pos) : "end"} Mb` : "?",
        genes,
        weight: Math.abs(r.diff) * Math.log2(2 + (hi - lo) / step),
      };
    })
    .filter((r) => r.where !== "?")
    .sort((x, y) => y.weight - x.weight)
    .slice(0, max);
}

/** A candidate worth listing by default: positive priority or a gene with a known cancer / GBM role. */
export function isKnownDriver(d) {
  const score = d.priority?.score ?? driverPriority(d).score;
  return score > 0 || driverGenes(d.event).some((g) => geneBrief(g, d.event).known);
}

/** Genes worth naming in a region: curated pathway genes and GBM genes. */
export const LANDMARK_GENES = new Set([...Object.keys(PATHWAY_OF), ...Object.keys(GBM_GENES)]);
