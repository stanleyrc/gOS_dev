// Cohort "Tumour suppressor hits" view and patient badges (d3-free, jest-tested).
//
// Built on the per-patient two-hit calls of twoHit.js. For a gene in a patient it summarises
//   the distinct hits   SNV / indel (one per variant, with its class), LOH (loss or copy-neutral, one hit), homozygous
//                       deletion (both copies = 2 hits), SV breaking the gene; weak rescued missense and hits in too few
//                       tumour cells (MIN_HIT_CELLS, `minFraction` of the tumour cells) are not counted
//   whether the hits are in the same cells   cells with >= 2 hits (SNV+LOH, SNV+SNV in trans, SNV+SV, homdel) / tumour cells
//   clonal vs subclonal   the biallelic cells (else the most common hit) cover >= TSG_CLONAL_FRACTION of the tumour cells
//   hit count   distinct hits above; a homozygous deletion on its own counts 2 (both copies), next to another hit it is one hit
import { GBM_TSG, MIN_HIT_CELLS, SUMMARY_MIN_FRACTION, HIT_LABEL } from "./twoHit";

export const TSG_CLONAL_FRACTION = 0.8; // a little below 1 because allelic and read dropout hide some cells of a truncal hit
export const TSG_SOURCES = ["curated", "oncokb", "both"];
export const TSG_SOURCE_LABEL = { curated: "curated GBM TSG list", oncokb: "OncoKB tumour-suppressor role", both: "curated list + OncoKB role" };
export const DEFAULT_TSG_VIEW = { source: "curated", minHits: 2, minFraction: 0.1, genes: "" };

const KIND_ORDER = { snv: 0, sv: 1, loh: 2, homdel: 3 };
export const KIND_SHORT = { snv: "mut", sv: "SV", loh: "LOH", homdel: "homdel" };
const pctText = (x) => `${Math.round(100 * x)}%`;

/** Whether a call's gene belongs to the chosen gene list ("curated" GBM list, OncoKB role seen on its events, or either). */
export function inTsgSource(call, source = "curated") {
  if (source === "curated") return call.curated;
  if (source === "oncokb") return Boolean(call.role);
  return call.curated || Boolean(call.role);
}

/**
 * Distinct hits of a call. LOH by loss and copy-neutral LOH are one hit (one lost allele); a homozygous deletion is
 * one hit that removes both copies (`copies` 2).
 * @returns [{ kind, label, n, fraction, copies, mutation?, tier?, vaf?, key?, event? }]
 */
export function distinctHits(call, { minFraction = DEFAULT_TSG_VIEW.minFraction } = {}) {
  const tumorN = call.tumorN || 1;
  const ok = (n) => n >= MIN_HIT_CELLS && n / tumorN >= minFraction;
  const out = [];
  call.hits.forEach((h) => {
    if (h.kind === "loh" || h.kind === "cnloh" || h.weak) return;
    if (!ok(h.n)) return;
    if (h.kind === "snv") out.push({ kind: "snv", label: h.protein || `${h.mutation || "SNV"} ${h.site || ""}`.trim(), n: h.n, fraction: h.n / tumorN, copies: 1, mutation: h.mutation, tier: h.tier, vaf: h.vaf, key: h.key, event: h.event, rescued: h.rescued });
    else if (h.kind === "sv") {
      // breakpoints in one gene are one hit (two breakpoints could hit both copies, which the data cannot show)
      const prev = out.find((x) => x.kind === "sv");
      const ids = new Set([...(prev?.ids || []), ...h.ids]);
      if (prev) Object.assign(prev, { ids, n: ids.size, fraction: ids.size / tumorN, label: `${prev.label}, ${h.text}` });
      else out.push({ kind: "sv", label: `${h.text}`, ids, n: ids.size, fraction: ids.size / tumorN, copies: 1, key: h.key, event: h.event });
    }
    else if (h.kind === "homdel") out.push({ kind: "homdel", label: HIT_LABEL.homdel, n: h.n, fraction: h.n / tumorN, copies: 2, key: h.key, event: h.event });
  });
  const lossIds = new Set();
  let cn = 0;
  call.hits.forEach((h) => {
    if (h.kind === "loh" || h.kind === "cnloh") {
      h.ids.forEach((id) => lossIds.add(id));
      if (h.kind === "cnloh") cn += h.n;
    }
  });
  if (ok(lossIds.size)) out.push({ kind: "loh", label: cn && cn === lossIds.size ? "copy-neutral LOH" : "LOH", n: lossIds.size, fraction: lossIds.size / tumorN, copies: 1 });
  return out.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || b.n - a.n);
}

/** Missense hits kept only by a site-evidence rescue (tier 3, unknown effect): shown, not counted. */
export const weakHits = (call) => call.hits.filter((h) => h.kind === "snv" && h.weak && h.n >= MIN_HIT_CELLS).map((h) => ({ label: h.protein || h.site, n: h.n, tier: h.tier, vaf: h.vaf, event: h.event }));

/** One gene in one patient: hits, count, same-cell fraction, clonality. */
export function summarizeCall(call, patient, opts = {}) {
  const hits = distinctHits(call, opts);
  const nHits = hits.length === 1 && hits[0].kind === "homdel" ? 2 : hits.length;
  const tumorN = call.tumorN || 1;
  const sameCells = call.biallelicCells + call.homdelCells; // cells with >= 2 hits (a homozygous deletion is both copies)
  const sameFraction = nHits >= 2 ? sameCells / tumorN : 0;
  const top = hits.reduce((m, h) => Math.max(m, h.fraction), 0);
  const clonalFraction = sameFraction > 0 ? sameFraction : top;
  const carrierFraction = call.snvCells ? call.snvBiCells / call.snvCells : null;
  const kinds = [...new Set(hits.map((h) => h.kind))];
  const out = {
    patient,
    gene: call.gene,
    call,
    hits,
    nHits,
    kinds,
    multi: nHits >= 2,
    sameCells,
    sameFraction,
    carrierFraction,
    clonal: clonalFraction >= TSG_CLONAL_FRACTION,
    clonalFraction,
    state: nHits >= 2 && sameFraction >= SUMMARY_MIN_FRACTION ? "biallelic" : nHits >= 2 ? "different cells" : nHits === 1 ? "one hit" : "none",
    phased: call.phased,
    weak: weakHits(call),
  };
  out.badge = badgeText(out);
  return out;
}

/** "TP53 x3 (biallelic, 98%)" - the hit count and, when the hits share cells, the fraction of tumour cells with both. */
export function badgeText(s) {
  const n = s.nHits;
  if (n < 2) return `${s.gene} (${n ? "one hit" : "no hit"})`;
  return `${s.gene} ×${n} (${s.state === "biallelic" ? "biallelic" : "hits in different cells"}${s.sameFraction > 0 ? `, ${pctText(s.sameFraction)}` : ""})`;
}

/** Hover text: every hit with its cells, the overlap and the clonality. */
export function summaryTitle(s) {
  const t = s.call.tumorN;
  const lines = s.hits.map((h) => `${h.kind === "snv" ? `${h.mutation || "SNV"} ${h.label}${h.vaf != null ? ` (VAF ${(h.vaf * 100).toFixed(0)}%)` : ""}` : h.label}: ${h.n}/${t} tumour cells (${pctText(h.fraction)})`);
  const tail = [];
  if (s.nHits >= 2) {
    tail.push(`${s.sameCells}/${t} tumour cells (${pctText(s.sameFraction)}) have two hits in the same cell${s.carrierFraction != null ? `; ${pctText(s.carrierFraction)} of the mutation carriers` : ""}`);
    tail.push(s.clonal ? "clonal" : "subclonal");
  }
  s.weak.forEach((w) => tail.push(`not counted: missense ${w.label} (tier ${w.tier ?? "?"}, unknown effect; ${w.n}/${t} tumour cells)`));
  if (s.phased) tail.push("two mutations phased in trans (read fragments covering both sites)");
  return [`${s.gene} in ${s.patient}`, ...lines, ...tail, `loss source: ${s.call.lossSource}`].join("\n");
}

/**
 * Cohort grid.
 * @param callsByPatient { patient: twoHitCalls[] }
 * @param view { source, minHits, minFraction, genes (comma / space separated filter) }
 * @returns { patients: [{ patient, tally }], rows: [{ gene, nMulti, cells: { patient: summary } }], hiddenSingle, geneCount }
 */
export function tsgHitGrid(callsByPatient = {}, view = DEFAULT_TSG_VIEW) {
  const v = { ...DEFAULT_TSG_VIEW, ...(view || {}) };
  const wanted = `${v.genes || ""}`.split(/[\s,;]+/).filter(Boolean).map((g) => g.toUpperCase());
  const summaries = [];
  Object.entries(callsByPatient).forEach(([patient, calls]) => {
    (calls || []).forEach((c) => {
      if (!inTsgSource(c, v.source)) return;
      if (wanted.length && !wanted.some((g) => c.gene.toUpperCase().startsWith(g))) return;
      const s = summarizeCall(c, patient, { minFraction: v.minFraction });
      if (s.nHits >= 1) summaries.push(s);
    });
  });
  const rowsBy = new Map();
  summaries.forEach((s) => {
    if (!rowsBy.has(s.gene)) rowsBy.set(s.gene, { gene: s.gene, cells: {}, nMulti: 0, nBiallelic: 0, nHits: 0 });
    const r = rowsBy.get(s.gene);
    r.cells[s.patient] = s;
    r.nHits += s.nHits;
    if (s.multi) r.nMulti += 1;
    if (s.state === "biallelic") r.nBiallelic += 1;
  });
  const all = [...rowsBy.values()];
  const rows = all
    .filter((r) => (v.minHits >= 2 ? r.nMulti > 0 : true))
    .sort((a, b) => b.nMulti - a.nMulti || b.nBiallelic - a.nBiallelic || b.nHits - a.nHits || a.gene.localeCompare(b.gene));
  const tallies = Object.keys(callsByPatient).map((patient) => patientTally(summaries.filter((s) => s.patient === patient), patient));
  tallies.sort((a, b) => b.nMulti - a.nMulti || b.biallelic.length - a.biallelic.length || b.nHits - a.nHits || a.patient.localeCompare(b.patient));
  return { patients: tallies, rows, hiddenSingle: all.length - rows.length, geneCount: all.length, view: v };
}

/** Per-patient tally: TSGs with >= 2 hits, those biallelic (same cells), text "3 TSGs biallelic: TP53, PTEN, NF1". */
export function patientTally(summaries = [], patient = "") {
  const multi = summaries.filter((s) => s.multi).sort((a, b) => b.sameFraction - a.sameFraction || b.nHits - a.nHits || a.gene.localeCompare(b.gene));
  const biallelic = multi.filter((s) => s.state === "biallelic");
  const apart = multi.filter((s) => s.state !== "biallelic");
  const text = biallelic.length
    ? `${biallelic.length} TSG${biallelic.length > 1 ? "s" : ""} biallelic: ${biallelic.map((s) => s.gene).join(", ")}`
    : multi.length
    ? `${multi.length} TSG${multi.length > 1 ? "s" : ""} with two hits in different cells: ${multi.map((s) => s.gene).join(", ")}`
    : "no TSG with two hits";
  return {
    patient,
    nMulti: multi.length,
    biallelic: biallelic.map((s) => s.gene),
    apart: apart.map((s) => s.gene),
    nHits: multi.reduce((s, x) => s + x.nHits, 0),
    text: biallelic.length && apart.length ? `${text}; different cells: ${apart.map((s) => s.gene).join(", ")}` : text,
    multi,
  };
}

/** Badge row of one patient (patient card, home card): the multi-hit curated GBM TSGs, best first. */
export function patientBadges(calls = [], patient = "", { source = "curated", minFraction = DEFAULT_TSG_VIEW.minFraction } = {}) {
  return patientTally(
    calls.filter((c) => inTsgSource(c, source)).map((c) => summarizeCall(c, patient, { minFraction })).filter((s) => s.nHits >= 1),
    patient
  ).multi;
}

/** URL target event of a summary: the first mutation, else the deletion / SV event (null = LOH only: open the Drivers layer). */
export const summaryEvent = (s) => (s.hits.find((h) => h.event) || {}).event || null;

/** The gene list actually used: curated GBM list, OncoKB-role genes seen on events, and the genes with allelic CN calls. */
export function tsgGeneInfo(callsByPatient = {}, lossGenes = []) {
  const oncokb = new Set();
  Object.values(callsByPatient).forEach((calls) => (calls || []).forEach((c) => c.role && oncokb.add(c.gene)));
  const curated = [...GBM_TSG];
  return {
    curated,
    oncokbOnly: [...oncokb].filter((g) => !curated.includes(g)).sort(),
    lossCovered: [...lossGenes].sort(),
    text: `Curated GBM tumour-suppressor list (${curated.length}: ${curated.join(", ")}) and genes whose events carry the OncoKB role "Tumor Suppressor". Allelic LOH is exported for ${lossGenes.length} genes (_cohort/tsg_loss.json); other genes show mutations, deletions and SVs only.`,
  };
}

/**
 * Drivers layer order: the entries of a gene with >= 2 hits sit together (at the position of its first entry).
 * @param entries driver entries (shown order), @param calls twoHitCalls of the patient
 */
export function groupMultiHitEntries(entries = [], calls = [], { minFraction = DEFAULT_TSG_VIEW.minFraction } = {}) {
  const multi = new Set(calls.filter((c) => c.curated || c.role).map((c) => summarizeCall(c, "", { minFraction })).filter((s) => s.multi).map((s) => s.gene));
  if (!multi.size) return entries;
  const geneOf = (d) => (d.cls === "snv" || d.cls === "homdel") && d.event?.gene && multi.has(d.event.gene) ? d.event.gene : null;
  const out = [];
  const done = new Set();
  entries.forEach((d) => {
    const g = geneOf(d);
    if (!g) {
      out.push(d);
      return;
    }
    if (done.has(g)) return;
    done.add(g);
    entries.filter((x) => geneOf(x) === g).forEach((x) => out.push(x));
  });
  return out;
}

/** Number of hits a driver entry's gene has (for the column flag), 0 when it is not part of a multi-hit TSG. */
export function entryHitCount(entry, calls = [], opts = {}) {
  const g = entry.event?.gene;
  const c = g && calls.find((x) => x.gene === g);
  if (!c || !(c.curated || c.role)) return 0;
  const s = summarizeCall(c, "", opts);
  return s.multi ? s.nHits : 0;
}
