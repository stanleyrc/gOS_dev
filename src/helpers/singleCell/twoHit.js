// Tumour-suppressor "two hits" per patient and gene (d3-free, jest-tested).
//
// A tumour suppressor is inactivated when both copies are hit. Hits come from
//   snv      truncating / splice / damaging-missense SNV or indel (Drivers entries, incl. rescued ones)
//   homdel   homozygous deletion (total CN 0)               = both copies lost
//   loh      LOH by loss (minor-allele CN 0, total CN below ploidy)
//   cnloh    copy-neutral LOH (minor-allele CN 0, total CN at ploidy)
//   sv       fusion / SV that breaks the gene (not "upstream of GENE")
//   germline germline-like SNV / indel in the gene (clinical_events.json, alt reads in normal cells). Constitutional, so in
//            every cell: it adds one hit only to cells with a somatic hit, and only when damaging (truncating / splice /
//            ClinVar pathogenic or likely pathogenic). Other germline variants (VUS, conflicting) are shown, never counted.
// Loss calls come from tsg_loss.json (scripts/singleCell/export_tsg_loss.py: per-cell allelic.json at the
// gene). Per patient the file gives integer codes per cell (LOSS_CODE); without it only the filtered
// events' HOMDEL carriers are known and the call says so (`lossSource`).
//
// Per-cell hit count: snv 1 + sv 1 + (loh | cnloh) 1, homdel 2. A cell with >= 2 is biallelic.
// Gene class over the tumour cells:
//   biallelic    >= max(MIN_HIT_CELLS, BIALLELIC_MIN_FRACTION of the tumour cells) with two hits (a biallelic subclone counts)
//   else the larger of: homdel (cells with both copies deleted) / monoallelic (cells with one hit), needing MIN_HIT_CELLS
//   none         otherwise
// A truncal-looking SNV with VAF >= VAF_LOH and no LOH call is flagged `vafSuggestsLoh` (supporting
// evidence only: it does not make the gene biallelic).
import { eventClass } from "./cohortStats";
import { splitIds } from "./driverContrast";
import { isGermlineLike } from "./clinicalEvents";

export const MIN_HIT_CELLS = 3;
export const VAF_LOH = 0.9;
export const BIALLELIC_MIN_FRACTION = 0.05;
export const SUMMARY_MIN_FRACTION = 0.1; // headline: a biallelic / homdel call must cover this fraction of the tumour cells

export const LOSS_CODE = { UNKNOWN: -1, BALANCED: 0, LOSS_KEPT: 1, LOH: 2, CNLOH: 3, HOMDEL: 4 };

/** GBM tumour suppressors (plus OncoKB role "Tumor Suppressor" on the event itself). */
export const GBM_TSG = ["PTEN", "NF1", "TP53", "CDKN2A", "CDKN2B", "RB1", "ATRX", "PTPN2", "NF2", "LZTR1", "SMARCB1", "CHEK2", "ARID1A", "ARID1B", "SETD2", "KMT2C", "KMT2D", "CIC", "FUBP1", "PIK3R1", "SPRED1", "STK11", "APC", "BRCA1", "BRCA2", "ATM"];

/** HOMDEL event flagged by srctools gos_sc_homdel_qc as a chromosome / arm-scale CN-0 call. */
export const isBroadCn0 = (e) => Boolean(e) && (e.broad_cn0 === true || `${e.broad_cn0}` === "true");
export const HIT_LABEL = { germline: "germline variant", snv: "SNV / indel", homdel: "homozygous deletion", loh: "LOH (loss of the other allele)", cnloh: "copy-neutral LOH", sv: "SV / fusion" };
export const STATE_LABEL = { biallelic: "biallelic", homdel: "homozygous deletion", monoallelic: "monoallelic", germline: "germline variant only", none: "no hit" };

const isTrue = (v) => v === true || `${v}` === "true";

/** True when an event's role marks the gene a tumour suppressor. */
export const roleIsTsg = (role) => /tumou?r suppressor/i.test(`${role ?? ""}`);

/** Truncating, splice, or missense with a loss-of-function / tier 1-2 call (or rescued from site evidence in a TSG). */
export function damagingSnv(event = {}) {
  const c = eventClass(event);
  if (c === "trunc" || c === "splice") return true;
  if (c === "missense") {
    const tier = Number(event.Tier);
    // rescued driver-gene missense (site evidence) counts: the rescue only keeps sites in curated driver genes
    return /loss/i.test(`${event.effect || ""}`) || (Number.isFinite(tier) && tier <= 2) || /site evidence/i.test(`${event.source || ""}`);
  }
  return false;
}

const pct = (x) => `${Math.round(x * 100)}%`;

/** ClinVar significance of a clinical row (clinical_events.json), or "". */
export const clinvarSignificance = (e = {}) => `${e?.clinical?.clinvar?.found ? e.clinical.clinvar.significance || "" : ""}`.replace(/_/g, " ");

/** A germline variant that can be a first hit: truncating / splice, or ClinVar pathogenic / likely pathogenic (not conflicting). */
export function damagingGermline(event = {}) {
  const c = eventClass(event);
  if (c === "trunc" || c === "splice") return true;
  const sig = clinvarSignificance(event);
  return /pathogenic/i.test(sig) && !/conflicting|uncertain|benign/i.test(sig);
}

/** Gene symbol(s) as TSG names of an entry: SNV/homdel use event.gene, fusion partners that are inside the gene. */
function tsgGenesOf(entry, tsgSet) {
  const e = entry.event || {};
  if (entry.cls === "snv" || entry.cls === "homdel") return tsgSet(e.gene, e.role) ? [`${e.gene}`] : [];
  if (entry.cls === "fusion") {
    if (entry.upstreamOnly || isTrue(e.upstream_only)) return [];
    // the event's OncoKB role belongs to the event, not to every partner: with two partners only the curated list decides
    const parts = `${e.gene || ""}`.split("::").map((p) => p.trim());
    return parts.filter((p) => p && !/^upstream of /i.test(p) && tsgSet(p, parts.length > 1 ? "" : e.role));
  }
  return [];
}

/**
 * Two-hit calls of one patient.
 * @param entries driver entries (buildDriverEntries / cohortEntries): { key, cls, event, carriers, n, fraction }
 * @param opts.loss patient object of tsg_loss.json { cells, ploidy, genes: { GENE: codes } } or null
 * @param opts.tumorIds tumour cell ids (excludes normals; default every cell of the loss file / the carriers)
 * @param opts.genes TSG symbols (default GBM_TSG); event roles add more
 * @param opts.phase patient object of tsg_phase.json { GENE: [{ a: "17:7674893", b: "17:7675088", relation: "trans" | "cis" | null }] }:
 *        two damaging SNVs known to be in trans count as two hits in a cell that carries both
 * @returns [{ gene, state, hits: [{ kind, label, n, fraction, ids, key?, vaf?, site? }], tumorN, cells: { both, snvOnly, lossOnly, ... }, ... }]
 */
export function twoHitCalls(entries = [], { loss = null, tumorIds = null, genes = GBM_TSG, phase = null, broadCn0 = null } = {}) {
  const geneSet = new Set(genes.map((g) => g.toUpperCase()));
  const isTsg = (g, role) => Boolean(g) && (geneSet.has(`${g}`.toUpperCase()) || roleIsTsg(role));
  let tumor = tumorIds && tumorIds.length ? new Set(tumorIds.map(String)) : null;
  if (!tumor && loss?.normal) tumor = new Set((loss.cells || []).filter((_, i) => !loss.normal[i]).map(String)); // tsg_loss.json flags normal cells
  const keep = (id) => !tumor || tumor.has(id);
  const lossCells = loss?.cells || [];
  const byGene = new Map();
  const slot = (g) => {
    if (!byGene.has(g)) byGene.set(g, { gene: g, hits: [] });
    return byGene.get(g);
  };
  // HOMDEL events whose CN-0 segment is chromosome / arm scale (srctools gos_sc_homdel_qc broad_cn0): a copy-number
  // calling problem in those cells, not a viable homozygous deletion; neither the event nor the per-cell allelic HOMDEL
  // calls of that gene are counted, and the call lists them as excluded
  const broad = new Map();
  // _cohort/broad_cn0.json for this patient (gene -> { mb, cells }): independent of view filters that may drop the event
  Object.entries(broadCn0 || {}).forEach(([g, b]) => broad.set(g, { mb: Number(b.mb), n: (b.cells || []).filter(keep).length, cells: new Set((b.cells || []).map(String)) }));
  entries.forEach((entry) => {
    const e = entry.event || {};
    if (entry.cls === "homdel" && isBroadCn0(e)) tsgGenesOf(entry, isTsg).forEach((g) => !broad.has(g) && broad.set(g, { mb: Number(e.cn0_segment_mb_median), n: splitIds(e.cell_ids).filter(keep).length, cells: null }));
  });
  entries.forEach((entry) => {
    const e = entry.event || {};
    const cls = entry.cls;
    if (cls !== "snv" && cls !== "homdel" && cls !== "fusion") return;
    if (cls === "homdel" && isBroadCn0(e)) return;
    if (entry.germline || isGermlineLike(e)) {
      // germline-like variants are never somatic hits; SNVs / indels in a TSG are listed as a germline hit
      if (cls !== "snv") return;
      tsgGenesOf(entry, isTsg).forEach((g) => {
        const ids = (entry.carriers || splitIds(e.cell_ids)).filter(keep);
        const protein = `${e.Variant || ""}` === "None" ? "" : `${e.Variant || ""}`;
        const sig = clinvarSignificance(e);
        const vaf = Number(e.VAF);
        slot(g).hits.push({
          kind: "germline", key: entry.key, ids, n: ids.length, fraction: entry.fraction, source: "clinical assay (germline-like)", role: e.role, event: e,
          protein, mutation: eventClass(e), site: `${e.seqnames}:${e.start}`, clinvar: sig || null, vaf: Number.isFinite(vaf) ? vaf : null,
          weak: !damagingGermline(e),
          text: `${g}${protein ? ` ${protein}` : ""} (germline${sig ? `, ClinVar ${sig}` : ""})`,
        });
      });
      return;
    }
    if (cls === "snv" && !damagingSnv(e)) return;
    tsgGenesOf(entry, isTsg).forEach((g) => {
      const ids = (entry.carriers || splitIds(e.cell_ids)).filter(keep);
      const hit = {
        kind: cls === "fusion" ? "sv" : cls === "snv" ? "snv" : "homdel",
        key: entry.key,
        ids,
        n: ids.length,
        fraction: entry.fraction,
        source: "filtered events",
        role: e.role,
        event: e,
      };
      if (cls === "snv") {
        const vaf = Number(e.VAF);
        hit.vaf = Number.isFinite(vaf) && e.VAF !== null && e.VAF !== "None" && e.VAF !== "" ? vaf : null;
        hit.protein = `${e.Variant || ""}` === "None" ? "" : `${e.Variant || ""}`;
        hit.mutation = eventClass(e);
        hit.site = `${e.seqnames}:${e.start}`;
        hit.rescued = /site evidence/i.test(`${e.source || ""}`) || /rescued/i.test(`${e.source || ""}`);
        hit.text = `${g}${hit.protein ? ` ${hit.protein}` : ""}`;
        hit.tier = Number.isFinite(Number(e.Tier)) ? Number(e.Tier) : null;
        // a missense kept only because it was rescued from site evidence (no loss-of-function call, tier 3+) is shown but not counted as a distinct hit
        hit.weak = hit.mutation === "missense" && !(/loss/i.test(`${e.effect || ""}`) || (hit.tier != null && hit.tier <= 2));
      } else if (cls === "fusion") hit.text = `${e.gene}`;
      else hit.text = `${g} homozygous deletion`;
      slot(g).hits.push(hit);
    });
  });
  // allelic CN calls
  const lossGenes = loss?.genes || {};
  Object.keys(lossGenes).forEach((g) => {
    if (!isTsg(g, "") && !byGene.has(g)) return;
    const codes = lossGenes[g];
    const groups = { [LOSS_CODE.HOMDEL]: [], [LOSS_CODE.LOH]: [], [LOSS_CODE.CNLOH]: [] };
    let covered = 0;
    codes.forEach((c, i) => {
      const id = `${lossCells[i]}`;
      if (!keep(id) || c === LOSS_CODE.UNKNOWN) return;
      covered += 1;
      if (groups[c]) groups[c].push(id);
    });
    const s = byGene.get(g);
    if (!s && !groups[LOSS_CODE.HOMDEL].length && !groups[LOSS_CODE.LOH].length && !groups[LOSS_CODE.CNLOH].length) return;
    const slotG = slot(g);
    slotG.lossCovered = covered;
    [[LOSS_CODE.HOMDEL, "homdel"], [LOSS_CODE.LOH, "loh"], [LOSS_CODE.CNLOH, "cnloh"]].forEach(([code, kind]) => {
      const ids = groups[code];
      if (!ids.length) return;
      // broad CN-0 artefact (see above): drop those cells' HOMDEL calls (all of them when the cell list is unknown)
      if (kind === "homdel" && broad.has(g)) {
        const bc = broad.get(g).cells;
        if (!bc) return;
        const kept = ids.filter((id) => !bc.has(id));
        ids.length = 0;
        kept.forEach((id) => ids.push(id));
        if (!ids.length) return;
      }
      if (kind === "homdel") slotG.hits = slotG.hits.filter((h) => h.kind !== "homdel"); // allelic calls replace the events' HOMDEL rows
      slotG.hits.push({ kind, ids, n: ids.length, fraction: covered ? ids.length / covered : 0, source: "per-cell allelic CN (allelic.json)", text: kind === "homdel" ? `${g} homozygous deletion` : `${HIT_LABEL[kind]} at ${g}` });
    });
    slotG.lossSource = "per-cell allelic.json";
  });
  // fractions from the tumour-cell denominators
  const denomFromEvents = entries.reduce((m, d) => {
    const mt = /^\s*\d+\s*\/\s*(\d+)/.exec(`${d.event?.cells || ""}`);
    return Math.max(m, mt ? Number(mt[1]) : 0);
  }, 0);
  const tumorN = tumor ? tumor.size : denomFromEvents || lossCells.length || 1;
  const out = [];
  broad.forEach((b, g) => {
    const sl = byGene.get(g);
    if (sl) sl.excluded = [{ label: `CN 0 over ${Number.isFinite(b.mb) ? b.mb.toFixed(1) : "?"} Mb (chromosome / arm scale) in ${b.n} cells: copy-number calling artefact, not counted as a homozygous deletion`, n: b.n }];
  });
  byGene.forEach((s) => {
    s.hits.forEach((h) => {
      if (h.source === "filtered events") h.fraction = Number.isFinite(h.fraction) && h.fraction > 0 ? h.fraction : h.n / tumorN;
    });
    out.push(classify(s, tumorN, Boolean(loss), transPairs(phase?.[s.gene])));
  });
  return out.filter((c) => c.hits.length).sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.gene.localeCompare(b.gene));
}

const ORDER = { biallelic: 0, homdel: 1, monoallelic: 2, germline: 3, none: 4 };

/** Set of "siteA|siteB" (both orders) of the SNV pairs a phase record calls trans. */
function transPairs(recs) {
  const out = new Set();
  (recs || []).forEach((r) => {
    if (r.relation === "trans") {
      out.add(`${r.a}|${r.b}`);
      out.add(`${r.b}|${r.a}`);
    }
  });
  return out;
}

function classify(s, tumorN, hasLoss, trans = new Set()) {
  const per = new Map(); // cell -> hit count
  const sets = { snv: new Set(), sv: new Set(), loss: new Set(), homdel: new Set() };
  // a damaging germline variant is in every cell: one more hit in each cell with a somatic hit
  const germline = s.hits.filter((h) => h.kind === "germline");
  const germlineHit = germline.some((h) => !h.weak) ? 1 : 0;
  s.hits.forEach((h) => {
    if (h.kind === "germline") return;
    const set = h.kind === "snv" ? sets.snv : h.kind === "sv" ? sets.sv : h.kind === "homdel" ? sets.homdel : sets.loss;
    h.ids.forEach((id) => set.add(id));
  });
  // a cell called CN 0 that has reads carrying a (non-weak) mutation of the gene still holds a copy: count it as LOH, not a
  // homozygous deletion (the per-cell CN fit can place a single remaining copy at 0)
  let cn0WithAlt = 0;
  s.hits.forEach((h) => {
    if (h.kind !== "snv" || h.weak) return;
    h.ids.forEach((id) => {
      if (sets.homdel.has(id)) {
        sets.homdel.delete(id);
        sets.loss.add(id);
        cn0WithAlt += 1;
      }
    });
  });
  const cells = new Set([...sets.snv, ...sets.sv, ...sets.loss, ...sets.homdel]);
  // SNV hits per cell: two SNVs phased in trans on the same cell are two hits
  const snvHits = s.hits.filter((h) => h.kind === "snv");
  const snvIds = snvHits.map((h) => new Set(h.ids));
  const snvScore = (id) => {
    const mine = snvHits.filter((_, i) => snvIds[i].has(id));
    if (!mine.length) return 0;
    for (let i = 0; i < mine.length; i += 1) for (let j = i + 1; j < mine.length; j += 1) if (!mine[i].weak && !mine[j].weak && trans.has(`${mine[i].site}|${mine[j].site}`)) return 2;
    return 1;
  };
  let snvBiCells = 0;
  let biallelicCells = 0;
  let homdelCells = 0;
  let monoCells = 0;
  let snvAndLoss = 0;
  cells.forEach((id) => {
    const score = snvScore(id) + (sets.sv.has(id) ? 1 : 0) + (sets.loss.has(id) ? 1 : 0) + (sets.homdel.has(id) ? 2 : 0) + germlineHit;
    per.set(id, score);
    if (sets.snv.has(id) && score >= 2) snvBiCells += 1;
    if (sets.homdel.has(id)) homdelCells += 1;
    else if (score >= 2) biallelicCells += 1;
    else monoCells += 1;
    if (sets.snv.has(id) && (sets.loss.has(id) || sets.homdel.has(id))) snvAndLoss += 1;
  });
  // the class is the one that covers the most cells (ties: biallelic, homdel, monoallelic); a small
  // deleted subclone on a mostly LOH gene stays monoallelic and shows up in the hit list
  let state = "none";
  const top = Math.max(homdelCells, monoCells);
  if (biallelicCells >= Math.max(MIN_HIT_CELLS, BIALLELIC_MIN_FRACTION * tumorN)) state = "biallelic"; // a biallelic subclone counts
  else if (top >= MIN_HIT_CELLS) state = homdelCells === top ? "homdel" : "monoallelic";
  else if (germline.length && !cells.size) state = "germline";
  const topSnv = [...snvHits].sort((a, b) => b.n - a.n)[0];
  const hasLossCall = s.hits.some((h) => h.kind === "loh" || h.kind === "cnloh" || h.kind === "homdel");
  const vafSuggestsLoh = Boolean(topSnv && topSnv.vaf != null && topSnv.vaf >= VAF_LOH && topSnv.n >= MIN_HIT_CELLS && !hasLossCall);
  const call = {
    gene: s.gene,
    state,
    hits: s.hits.sort((a, b) => b.n - a.n),
    tumorN,
    biallelicCells,
    homdelCells,
    monoCells,
    snvCells: sets.snv.size,
    snvAndLossCells: snvAndLoss,
    germlineHit: Boolean(germlineHit), // a damaging germline variant counts as the first hit
    germline: germline.map((h) => ({ text: h.text, counted: !h.weak, clinvar: h.clinvar, n: h.n, key: h.key, event: h.event })),
    snvBiCells, // SNV carriers that have a second hit (loss, deletion, SV or a trans SNV)
    phased: [...trans].length > 0,
    role: s.hits.some((h) => roleIsTsg(h.role)) ? "Tumor Suppressor" : null,
    curated: GBM_TSG.includes(s.gene),
    vafSuggestsLoh,
    lossSource: s.lossSource || (hasLoss ? "tsg_loss.json has no entry for this gene" : "filtered events only (tsg_loss.json not available)"),
    lossIds: new Set([...sets.loss, ...sets.homdel]),
    excluded: [...(s.excluded || []), ...(cn0WithAlt ? [{ label: `${cn0WithAlt} cells called CN 0 carry mutant reads, so they keep a copy: counted as LOH, not homozygous deletion`, n: cn0WithAlt }] : [])],
  };
  call.text = describeCall(call);
  return call;
}

/** One-line description: "PTEN p.R130* (VAF 99.6%, 458/462 cells) + LOH (minor CN 0 in 97% of cells) -> biallelic". */
export function describeCall(call) {
  const parts = call.hits
    .filter((h) => h.n >= 1)
    .map((h) => {
      const frac = `${h.n}/${call.tumorN} cells`;
      if (h.kind === "germline") return `${h.text}${h.weak ? ", not counted" : ""}`;
      if (h.kind === "snv") return `${h.text}${h.vaf != null ? ` (VAF ${(h.vaf * 100).toFixed(1)}%, ${frac})` : ` (${frac})`}`;
      if (h.kind === "homdel") return `homozygous deletion (${frac})`;
      if (h.kind === "loh") return `LOH by loss (minor CN 0 in ${frac})`;
      if (h.kind === "cnloh") return `copy-neutral LOH (minor CN 0 in ${frac})`;
      return `${h.text} (${frac})`;
    });
  const tail = call.state === "biallelic" ? " -> biallelic" : call.state === "homdel" ? " -> both copies lost" : call.state === "monoallelic" ? " -> monoallelic (one hit)" : call.state === "germline" ? " -> germline variant only, no somatic hit" : "";
  const sup = call.vafSuggestsLoh ? "; SNV VAF near 1 is consistent with LOH, which the allelic CN did not call" : "";
  return `${call.gene}: ${parts.join(" + ")}${tail}${sup}`;
}

/** Overlap of the first SNV hit and the loss hits: cells with both / only SNV / only loss. */
export function hitOverlap(call) {
  const snv = new Set();
  call.hits.filter((h) => h.kind === "snv").forEach((h) => h.ids.forEach((id) => snv.add(id)));
  const both = [...snv].filter((id) => call.lossIds.has(id)).length;
  return { both, snvOnly: snv.size - both, lossOnly: call.lossIds.size - both };
}

/** State codes per cell of an SNV column when a second hit exists (see twoHitStates). */
export const TWO_HIT = { NONE: 0, NEITHER: 1, SNV: 2, LOSS: 3, BOTH: 4 };

/**
 * Per-cell combined state of an SNV column.
 * @param snvStates Float32Array from entryStates (0 no coverage, 1 WT, 2 mutant)
 * @param order cell ids aligned to snvStates
 * @param lossIds Set of cell ids with the second hit (call.lossIds)
 * @returns Float32Array, 0 no coverage and no loss / 1 neither / 2 SNV only / 3 loss only / 4 both
 */
export function twoHitStates(snvStates, order, lossIds) {
  const out = new Float32Array(snvStates.length);
  for (let i = 0; i < snvStates.length; i += 1) {
    const v = snvStates[i];
    const l = lossIds.has(`${order[i]}`);
    out[i] = v === 2 ? (l ? TWO_HIT.BOTH : TWO_HIT.SNV) : l ? TWO_HIT.LOSS : v === 1 ? TWO_HIT.NEITHER : TWO_HIT.NONE;
  }
  return out;
}

/** Hover text of an SNV column state (0 no coverage, 1 WT, 2 mutant, 3 second hit only, 4 SNV + second hit). */
export const twoHitStatus = (v) => ({ 4: "SNV + loss: both hits (biallelic)", 3: "loss only (LOH / deletion at the gene, no SNV read)", 2: "mutant", 1: "wild type", 0: "no coverage" }[v] || "no coverage");

/** Attach each call to the driver entries behind its hits (entry.twoHit), so tooltips and drawers can list both hits. */
export function attachCalls(entries = [], calls = []) {
  const byKey = new Map();
  calls.forEach((c) => c.hits.forEach((h) => h.key && byKey.set(h.key, c)));
  entries.forEach((d) => {
    if (byKey.has(d.key)) d.twoHit = byKey.get(d.key);
    else if (d.twoHit) delete d.twoHit;
  });
  return entries;
}

/** Index calls by gene for one patient. */
export const callsByGene = (calls = []) => new Map(calls.map((c) => [c.gene, c]));

/**
 * Cohort oncoprint cell for a gene: the call to draw as a split / 2x glyph.
 * @param callsByPatient { patient: calls[] }
 * @returns Map "patient|gene" -> call
 */
export function cohortCallIndex(callsByPatient = {}) {
  const out = new Map();
  Object.entries(callsByPatient).forEach(([p, calls]) => (calls || []).forEach((c) => out.set(`${p}|${c.gene}`, c)));
  return out;
}

/**
 * Cohort headline "Biallelic TSG inactivation": per gene the patients with a biallelic (or homozygous deletion) call.
 * @returns [{ gene, patients: [{ patient, state, combo, fraction }], nBiallelic, nHomdel }]
 */
export function biallelicSummary(callsByPatient = {}) {
  const byGene = new Map();
  Object.entries(callsByPatient).forEach(([patient, calls]) => {
    (calls || []).forEach((c) => {
      if (c.state !== "biallelic" && c.state !== "homdel") return;
      if ((c.state === "homdel" ? c.homdelCells : c.biallelicCells) < SUMMARY_MIN_FRACTION * c.tumorN) return;
      const kinds = [...new Set(c.hits.filter((h) => h.n >= MIN_HIT_CELLS && !(h.kind === "germline" && h.weak)).map((h) => h.kind))];
      const cells = c.state === "homdel" ? c.homdelCells : c.biallelicCells;
      if (!byGene.has(c.gene)) byGene.set(c.gene, []);
      byGene.get(c.gene).push({ patient, state: c.state, combo: kinds.map((k) => ({ germline: "germline", snv: "SNV", homdel: "homdel", loh: "LOH", cnloh: "cnLOH", sv: "SV" }[k])).join(" + "), cells, fraction: c.tumorN ? cells / c.tumorN : 0, text: c.text });
    });
  });
  return [...byGene.entries()]
    .map(([gene, patients]) => ({ gene, patients, nBiallelic: patients.filter((p) => p.state === "biallelic").length, nHomdel: patients.filter((p) => p.state === "homdel").length }))
    .sort((a, b) => b.patients.length - a.patients.length || b.nBiallelic - a.nBiallelic || a.gene.localeCompare(b.gene));
}

export const fractionText = pct;

/**
 * ctx.twoHit for driverLayer.entryStates: Map SNV-entry key -> Set of cells with the second hit, only for
 * genes whose loss hit covers at least MIN_HIT_CELLS cells.
 */
export function secondHitMap(calls = []) {
  const out = new Map();
  calls.forEach((c) => {
    if (c.lossIds.size < MIN_HIT_CELLS) return;
    c.hits.filter((h) => h.kind === "snv").forEach((h) => out.set(h.key, c.lossIds));
  });
  return out;
}

/**
 * Oncoprint rows restricted to biallelic / homozygous-deletion calls ("biallelic only").
 * @param rows [{ gene: string, cells: { patient: cell } }] (cohort oncoprint rows)
 * @param index Map "patient|gene" -> call (cohortCallIndex)
 * @returns rows whose cells all have such a call (other cells dropped, empty rows removed)
 */
export function biallelicOnlyRows(rows = [], index = new Map()) {
  const out = [];
  rows.forEach((r) => {
    const cells = {};
    Object.entries(r.cells).forEach(([p, cell]) => {
      const c = index.get(`${p}|${r.gene}`);
      if (c && (c.state === "biallelic" || c.state === "homdel")) cells[p] = cell;
    });
    const ps = Object.keys(cells);
    if (!ps.length) return;
    out.push({ ...r, cells, nPatients: ps.length, maxFraction: Math.max(...ps.map((p) => cells[p].fraction ?? 0)) });
  });
  return out;
}
