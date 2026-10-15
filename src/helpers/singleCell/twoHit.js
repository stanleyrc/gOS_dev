// Tumour-suppressor "two hits" per patient and gene (d3-free, jest-tested).
//
// A tumour suppressor is inactivated when both copies are hit. Hits come from
//   snv      truncating / splice / damaging-missense SNV or indel (Drivers entries, incl. rescued ones)
//   homdel   homozygous deletion (total CN 0)               = both copies lost
//   loh      LOH by loss (minor-allele CN 0, total CN below ploidy)
//   cnloh    copy-neutral LOH (minor-allele CN 0, total CN at ploidy)
//   sv       fusion / SV that breaks the gene (not "upstream of GENE")
// Loss calls come from tsg_loss.json (scripts/singleCell/export_tsg_loss.py: per-cell allelic.json at the
// gene). Per patient the file gives integer codes per cell (LOSS_CODE); without it only the filtered
// events' HOMDEL carriers are known and the call says so (`lossSource`).
//
// Per-cell hit count: snv 1 + sv 1 + (loh | cnloh) 1, homdel 2. A cell with >= 2 is biallelic.
// Gene class over the tumour cells:
//   biallelic    >= MIN_HIT_CELLS cells with two hits (and at least as many as homdel cells)
//   homdel       >= MIN_HIT_CELLS cells with both copies deleted
//   monoallelic  one kind of hit in >= MIN_HIT_CELLS cells
//   none         otherwise
// A truncal-looking SNV with VAF >= VAF_LOH and no LOH call is flagged `vafSuggestsLoh` (supporting
// evidence only: it does not make the gene biallelic).
import { eventClass } from "./cohortStats";
import { splitIds } from "./driverContrast";

export const MIN_HIT_CELLS = 3;
export const VAF_LOH = 0.9;

export const LOSS_CODE = { UNKNOWN: -1, BALANCED: 0, LOSS_KEPT: 1, LOH: 2, CNLOH: 3, HOMDEL: 4 };

/** GBM tumour suppressors (plus OncoKB role "Tumor Suppressor" on the event itself). */
export const GBM_TSG = ["PTEN", "NF1", "TP53", "CDKN2A", "CDKN2B", "RB1", "ATRX", "PTPN2", "NF2", "LZTR1", "SMARCB1", "CHEK2", "ARID1A", "ARID1B", "SETD2", "KMT2C", "KMT2D", "CIC", "FUBP1", "PIK3R1", "SPRED1", "STK11", "APC", "BRCA1", "BRCA2", "ATM"];

export const HIT_LABEL = { snv: "SNV / indel", homdel: "homozygous deletion", loh: "LOH (loss of the other allele)", cnloh: "copy-neutral LOH", sv: "SV / fusion" };
export const STATE_LABEL = { biallelic: "biallelic", homdel: "homozygous deletion", monoallelic: "monoallelic", none: "no hit" };

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

/** Gene symbol(s) as TSG names of an entry: SNV/homdel use event.gene, fusion partners that are inside the gene. */
function tsgGenesOf(entry, tsgSet) {
  const e = entry.event || {};
  if (entry.cls === "snv" || entry.cls === "homdel") return tsgSet(e.gene, e.role) ? [`${e.gene}`] : [];
  if (entry.cls === "fusion") {
    if (entry.upstreamOnly || isTrue(e.upstream_only)) return [];
    return `${e.gene || ""}`
      .split("::")
      .map((p) => p.trim())
      .filter((p) => p && !/^upstream of /i.test(p) && tsgSet(p, e.role))
      .map((p) => p);
  }
  return [];
}

/**
 * Two-hit calls of one patient.
 * @param entries driver entries (buildDriverEntries / cohortEntries): { key, cls, event, carriers, n, fraction }
 * @param opts.loss patient object of tsg_loss.json { cells, ploidy, genes: { GENE: codes } } or null
 * @param opts.tumorIds tumour cell ids (excludes normals; default every cell of the loss file / the carriers)
 * @param opts.genes TSG symbols (default GBM_TSG); event roles add more
 * @returns [{ gene, state, hits: [{ kind, label, n, fraction, ids, key?, vaf?, site? }], tumorN, cells: { both, snvOnly, lossOnly, ... }, ... }]
 */
export function twoHitCalls(entries = [], { loss = null, tumorIds = null, genes = GBM_TSG } = {}) {
  const geneSet = new Set(genes.map((g) => g.toUpperCase()));
  const isTsg = (g, role) => Boolean(g) && (geneSet.has(`${g}`.toUpperCase()) || roleIsTsg(role));
  const tumor = tumorIds && tumorIds.length ? new Set(tumorIds.map(String)) : null;
  const keep = (id) => !tumor || tumor.has(id);
  const lossCells = loss?.cells || [];
  const byGene = new Map();
  const slot = (g) => {
    if (!byGene.has(g)) byGene.set(g, { gene: g, hits: [] });
    return byGene.get(g);
  };
  entries.forEach((entry) => {
    const e = entry.event || {};
    const cls = entry.cls;
    if (cls !== "snv" && cls !== "homdel" && cls !== "fusion") return;
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
      };
      if (cls === "snv") {
        const vaf = Number(e.VAF);
        hit.vaf = Number.isFinite(vaf) && e.VAF !== null && e.VAF !== "None" && e.VAF !== "" ? vaf : null;
        hit.protein = `${e.Variant || ""}` === "None" ? "" : `${e.Variant || ""}`;
        hit.mutation = eventClass(e);
        hit.site = `${e.seqnames}:${e.start}`;
        hit.rescued = /site evidence/i.test(`${e.source || ""}`) || /rescued/i.test(`${e.source || ""}`);
        hit.text = `${g}${hit.protein ? ` ${hit.protein}` : ""}`;
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
  byGene.forEach((s) => {
    s.hits.forEach((h) => {
      if (h.source === "filtered events") h.fraction = Number.isFinite(h.fraction) && h.fraction > 0 ? h.fraction : h.n / tumorN;
    });
    out.push(classify(s, tumorN, Boolean(loss)));
  });
  return out.filter((c) => c.hits.length).sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.gene.localeCompare(b.gene));
}

const ORDER = { biallelic: 0, homdel: 1, monoallelic: 2, none: 3 };

function classify(s, tumorN, hasLoss) {
  const per = new Map(); // cell -> hit count
  const sets = { snv: new Set(), sv: new Set(), loss: new Set(), homdel: new Set() };
  s.hits.forEach((h) => {
    const set = h.kind === "snv" ? sets.snv : h.kind === "sv" ? sets.sv : h.kind === "homdel" ? sets.homdel : sets.loss;
    h.ids.forEach((id) => set.add(id));
  });
  const cells = new Set([...sets.snv, ...sets.sv, ...sets.loss, ...sets.homdel]);
  let biallelicCells = 0;
  let homdelCells = 0;
  let snvAndLoss = 0;
  cells.forEach((id) => {
    const score = (sets.snv.has(id) ? 1 : 0) + (sets.sv.has(id) ? 1 : 0) + (sets.loss.has(id) ? 1 : 0) + (sets.homdel.has(id) ? 2 : 0);
    per.set(id, score);
    if (sets.homdel.has(id)) homdelCells += 1;
    else if (score >= 2) biallelicCells += 1;
    if (sets.snv.has(id) && (sets.loss.has(id) || sets.homdel.has(id))) snvAndLoss += 1;
  });
  const anyCells = Math.max(...s.hits.map((h) => h.n));
  let state = "none";
  if (biallelicCells >= MIN_HIT_CELLS && biallelicCells >= homdelCells) state = "biallelic";
  else if (homdelCells >= MIN_HIT_CELLS) state = "homdel";
  else if (anyCells >= MIN_HIT_CELLS) state = "monoallelic";
  const snvHits = s.hits.filter((h) => h.kind === "snv");
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
    snvCells: sets.snv.size,
    snvAndLossCells: snvAndLoss,
    vafSuggestsLoh,
    lossSource: s.lossSource || (hasLoss ? "tsg_loss.json has no entry for this gene" : "filtered events only (tsg_loss.json not available)"),
    lossIds: new Set([...sets.loss, ...sets.homdel]),
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
      if (h.kind === "snv") return `${h.text}${h.vaf != null ? ` (VAF ${(h.vaf * 100).toFixed(1)}%, ${frac})` : ` (${frac})`}`;
      if (h.kind === "homdel") return `homozygous deletion (${frac})`;
      if (h.kind === "loh") return `LOH by loss (minor CN 0 in ${frac})`;
      if (h.kind === "cnloh") return `copy-neutral LOH (minor CN 0 in ${frac})`;
      return `${h.text} (${frac})`;
    });
  const tail = call.state === "biallelic" ? " -> biallelic" : call.state === "homdel" ? " -> both copies lost" : call.state === "monoallelic" ? " -> monoallelic (one hit)" : "";
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
      const kinds = [...new Set(c.hits.filter((h) => h.n >= MIN_HIT_CELLS).map((h) => h.kind))];
      const cells = c.state === "homdel" ? c.homdelCells : c.biallelicCells;
      if (!byGene.has(c.gene)) byGene.set(c.gene, []);
      byGene.get(c.gene).push({ patient, state: c.state, combo: kinds.map((k) => ({ snv: "SNV", homdel: "homdel", loh: "LOH", cnloh: "cnLOH", sv: "SV" }[k])).join(" + "), cells, fraction: c.tumorN ? cells / c.tumorN : 0, text: c.text });
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
