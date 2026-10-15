// Cis dosage of copy-number events: the expression of the event's OWN gene in carriers vs non-carriers of the event,
// and per cell the gene-locus copy number vs that gene's expression (Spearman), per patient and combined (Stouffer).
// This is the "dosage (cis)" counterpart of the "state association (trans)" of event_associations.json.
// d3-free so jest can test it. Reuses locusCn / spearmanTest / stouffer from cnExpression and mannWhitney from tests.
import { benjaminiHochberg, mannWhitney } from "./tests";
import { locusCn, normalQuantile, spearmanTest, stouffer } from "./cnExpression";

export const CN_CLASSES = ["amp", "gain", "homdel", "loss"];
/** Direction expression is expected to move in carriers: amp / gain up, homdel / loss down. */
export const expectedSign = (cls) => (cls === "amp" || cls === "gain" ? 1 : cls === "homdel" || cls === "loss" ? -1 : 0);
/** Events of the associations file that are copy-number events of a gene. */
export const cnEvents = (events) => (events || []).filter((e) => CN_CLASSES.includes(e.cls) && e.gene);

const median = (v) => {
  const s = v.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return NaN;
  const m = (s.length - 1) / 2;
  return (s[Math.floor(m)] + s[Math.ceil(m)]) / 2;
};
const mean = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN);

/** Carrier cell ids of an event: union of cell_ids of the patient's events of that gene and class. */
export function carrierSet(events, gene, cls, classOf, labelOf) {
  const out = new Set();
  (events || []).forEach((e) => {
    if (`${labelOf(e)}`.toUpperCase() === `${gene}`.toUpperCase() && classOf(e) === cls) `${e.cell_ids || ""}`.split(",").filter(Boolean).forEach((c) => out.add(c));
  });
  return out;
}

/**
 * One patient, one event.
 * @param cells [{ id, row }] tumour cells with RNA and a genome-graph row (row.binIndex / row.values)
 * @param expr Float array aligned with `cells` (the gene's expression), or null when the gene is not in the matrix
 * @param carriers Set of carrier cell ids
 * @param locus { start, end } global coordinates of the gene
 */
export function patientDosage({ cells, expr, carriers, locus, cls }) {
  if (!cells?.length) return { status: "unavailable", reason: "no linked DNA and RNA cells" };
  if (!expr) return { status: "unavailable", reason: "gene not in the expression matrix" };
  const car = [];
  const non = [];
  const cn = [];
  const ex = [];
  cells.forEach((c, i) => {
    const v = expr[i];
    if (!Number.isFinite(v)) return;
    (carriers.has(c.id) ? car : non).push(v);
    const k = locusCn(c.row, locus.start, locus.end);
    if (Number.isFinite(k)) {
      cn.push(k);
      ex.push(v);
    }
  });
  const mw = car.length >= 1 && non.length >= 1 ? mannWhitney(car, non) : null;
  const sign = expectedSign(cls);
  const diff = mean(car) - mean(non);
  const t = spearmanTest(cn, ex);
  return {
    status: "ok",
    nCarriers: car.length,
    nOthers: non.length,
    meanCarriers: mean(car),
    meanOthers: mean(non),
    medianCarriers: median(car),
    medianOthers: median(non),
    diff,
    p: mw ? mw.p : NaN,
    // signed z toward the expected direction is built in combineDosage; keep the raw sign here
    sign: Math.sign(diff) || 0,
    expected: sign,
    rho: t ? t.rho : NaN,
    rhoP: t ? t.p : NaN,
    rhoN: t ? t.n : 0,
    cn,
    ex,
    car,
    non,
  };
}

/** Stouffer combination of the per-patient carrier-vs-non-carrier tests (signed by the mean difference, weights sqrt(n carriers)). */
export function combineCarrierTests(perPatient) {
  let num = 0;
  let den = 0;
  perPatient.forEach((r) => {
    if (r.status !== "ok" || !Number.isFinite(r.p) || !(r.nCarriers >= 3) || !r.sign) return;
    const z = -r.sign * normalQuantile(Math.max(1e-300, Math.min(1, r.p)) / 2);
    const w = Math.sqrt(r.nCarriers);
    num += w * z;
    den += w * w;
  });
  if (!den) return { z: NaN, p: NaN };
  const z = num / Math.sqrt(den);
  return { z, p: 2 * (1 - normalCdf(Math.abs(z))) };
}
function normalCdf(x) {
  // Abramowitz-Stegun via complementary error function
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

/** Event-level dosage from per-patient results: Stouffer of the per-cell Spearman rho, and of the carrier-vs-non-carrier test. */
export function combineDosage(perPatient, cls) {
  const ok = perPatient.filter((r) => r.status === "ok");
  const rho = stouffer(ok.map((r) => ({ rho: r.rho, p: r.rhoP, n: r.rhoN })));
  const carrier = combineCarrierTests(ok);
  const sign = expectedSign(cls);
  return {
    k: ok.length,
    rho: rho.rho,
    rhoZ: rho.z,
    rhoP: rho.p,
    carrierZ: carrier.z,
    carrierP: carrier.p,
    // fraction of patients whose carriers move the expected way
    nExpected: ok.filter((r) => sign && r.sign === sign).length,
    meanCarriers: mean(ok.map((r) => r.meanCarriers)),
    meanOthers: mean(ok.map((r) => r.meanOthers)),
  };
}

/** Add BH q across events to the combined rho p-values (events without a p keep q = NaN). */
export function addDosageQ(rows) {
  const idx = rows.map((r, i) => (Number.isFinite(r.combined?.rhoP) ? i : -1)).filter((i) => i >= 0);
  const q = benjaminiHochberg(idx.map((i) => rows[i].combined.rhoP));
  const out = rows.map((r) => ({ ...r, q: NaN }));
  idx.forEach((i, k) => (out[i].q = q[k]));
  return out;
}

/** "rho (q)" cell text; "not available (...)" when there is no value. */
export function fmtRhoQ(rho, q) {
  if (!Number.isFinite(rho)) return null;
  const qq = Number.isFinite(q) ? (q >= 0.01 ? q.toFixed(2) : q.toExponential(0).replace("e-", "e-")) : "n/a";
  return `${rho >= 0 ? "+" : ""}${rho.toFixed(2)} (${qq})`;
}

/** Order for "rank by dosage": events with a dosage q first, ascending q, then larger |rho|; the rest keep their order after them. */
export function rankByDosage(rows, dosageOf) {
  const val = (r) => dosageOf(r);
  return [...rows].sort((a, b) => {
    const A = val(a);
    const B = val(b);
    const qa = Number.isFinite(A?.q) ? A.q : Infinity;
    const qb = Number.isFinite(B?.q) ? B.q : Infinity;
    return qa - qb || Math.abs(B?.combined?.rho || 0) - Math.abs(A?.combined?.rho || 0);
  });
}

const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : "n/a");
const fp = (p) => (!Number.isFinite(p) ? "n/a" : p >= 0.01 ? p.toFixed(2) : p.toExponential(1).replace("e+", "e"));

/** One-sentence reading of the cis dosage of an event (null while not computed). */
export function describeDosage(result) {
  if (!result) return null;
  const { event, combined: c } = result;
  if (!c.k) return `Cis dosage of ${event.label}: not available (no patient with RNA and copy-number rows).`;
  const dir = event.cls === "amp" || event.cls === "gain" ? "higher" : "lower";
  const ctrl = event.cls === "homdel" ? " Positive control: the gene should be near 0 in homdel carriers." : "";
  return `Cis dosage (${event.gene}, ${c.k} patients with RNA): mean log-normalized ${event.gene} expression is ${f2(c.meanCarriers)} in carriers of ${event.label} vs ${f2(c.meanOthers)} in other tumour cells (${c.nExpected} of ${c.k} patients ${dir} in carriers; Stouffer z ${f2(c.carrierZ)}, p ${fp(c.carrierP)}); per cell, ${event.gene} locus CN vs ${event.gene} expression has weighted rho ${f2(c.rho)} (Stouffer p ${fp(c.rhoP)}, q ${fp(result.q)}).${ctrl}`;
}
