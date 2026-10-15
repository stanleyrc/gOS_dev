// Cross-patient RNA differential on per-cell covariates (_cohort/rna_covariate_de.json from srctools
// gos_sc_rna_covariate_de.py). d3-free so jest can test it.
//
// One test = one comparison (carriers vs non-carriers of a driver, high vs low copy number of an oncogene,
// a clade vs its sister) run inside every patient (Wilcoxon, stratified by plate x cycling) and combined across
// patients (Stouffer z, Fisher p, number of patients with the same direction).

export const FAMILY_LABELS = { driver: "Driver carriers", cn: "Gene copy number", clade: "Clade vs sister" };
export const FAMILIES = Object.keys(FAMILY_LABELS);

/** Q cut and fold-change cut that define a robust hit (the same as the exporter). */
export const ROBUST = { q: 0.05, lfc: 0.5 };

/** Whether a gene row is a robust hit: >= 2 patients, same direction in every patient, q and |log2FC| past the cuts. */
export function isRobust(row, { q = ROBUST.q, lfc = ROBUST.lfc } = {}) {
  return Boolean(row) && row.n_patients >= 2 && row.n_concordant === row.n_patients && row.q_val < q && Math.abs(row.avg_log2FC) >= lfc;
}

/** Cells compared in a test, summed over its patients. */
export const testCells = (test) => (test?.patients || []).reduce((s, p) => ({ a: s.a + (p.n_a || 0), b: s.b + (p.n_b || 0) }), { a: 0, b: 0 });

/** Patients whose strata fell back from plate x cycling (less adjusted). */
export const looselyAdjusted = (test) => (test?.patients || []).filter((p) => !`${p.adjust}`.startsWith("plate+cycling")).map((p) => p.patient);

/** Table rows of the tests, filtered by family and text, sorted by robust hits then significant genes. */
export function testRows(data, { family = "all", query = "", combinableOnly = false, gene = null } = {}) {
  const needle = `${query || ""}`.trim().toLowerCase();
  return (data?.tests || [])
    .filter((t) => (family === "all" ? true : t.family === family))
    .filter((t) => (combinableOnly ? t.combinable : true))
    .filter((t) => (gene ? (t.genes || []).some((g) => g.gene === gene && g.q_val < 0.05) : true))
    .filter((t) => (needle ? `${t.label} ${t.group_a} ${t.group_b} ${t.top_up?.join(" ")} ${t.top_down?.join(" ")}`.toLowerCase().includes(needle) : true))
    .map((t) => ({ ...t, key: t.id, cells: testCells(t), family_label: FAMILY_LABELS[t.family] || t.family }))
    .sort((a, b) => b.n_robust - a.n_robust || b.n_sig_q05 - a.n_sig_q05 || a.label.localeCompare(b.label));
}

/** Rows for VolcanoPlot ({ gene, avg_log2FC, p_val, q_val }) from a test's compact volcano arrays; falls back to the gene table. */
export function volcanoRows(test) {
  const v = test?.volcano;
  if (v && Array.isArray(v.genes) && v.genes.length) {
    return v.genes.map((gene, i) => ({
      gene,
      avg_log2FC: v.lfc[i],
      p_val: Number.isFinite(v.p?.[i]) ? v.p[i] : v.q[i],
      q_val: v.q[i],
      pct_1: NaN,
      pct_2: NaN,
    }));
  }
  return (test?.genes || []).map((g) => ({ gene: g.gene, avg_log2FC: g.avg_log2FC, p_val: g.p_val, q_val: g.q_val, pct_1: g.pct_1, pct_2: g.pct_2 }));
}

/** Per-patient log2 fold changes of a gene row as [{ patient, lfc }], strongest first. */
export function perPatientLfc(row) {
  return Object.entries(row?.per || {})
    .map(([patient, lfc]) => ({ patient, lfc }))
    .sort((a, b) => Math.abs(b.lfc) - Math.abs(a.lfc));
}

const list = (genes, n) => (genes || []).slice(0, n).join(", ");
const pretty = (term) => `${term || ""}`.replace(/^HALLMARK_|^3CA_\d+_/, "").replace(/_/g, " ").toLowerCase();

/** Strongest enrichment term of a test and direction ("up" | "down") that passes q, or null. */
export function topProgram(test, direction, maxQ = 0.05, exclude = null) {
  const hit = (test?.enrichment?.[direction] || []).find((e) => e.q <= maxQ && !(exclude && exclude.has(`${e.term}|${direction}`)));
  return hit ? { term: hit.term, collection: hit.collection, q: hit.q, pretty: pretty(hit.term) } : null;
}

/** One sentence reading a test, with its numbers. */
export function describeTest(test, { shared = null } = {}) {
  if (!test) return "";
  const k = test.k_patients;
  const where = test.combinable ? `${k} patients` : "one patient";
  const up = test.robust_up?.length ? test.robust_up : test.top_up;
  const down = test.robust_down?.length ? test.robust_down : test.top_down;
  const parts = [];
  if (test.id === "clade:top") parts.push("in each patient the hypermutated subclone (most private SNVs) vs its sister clade, tumour cells only");
  if (test.combinable) parts.push(`${test.n_robust} gene${test.n_robust === 1 ? "" : "s"} move the same way in all ${k} patients (q < 0.05, |log2FC| >= 0.5)`);
  else parts.push(`${test.n_sig_q05} gene${test.n_sig_q05 === 1 ? "" : "s"} at q < 0.05 in ${where}`);
  if (up?.length) parts.push(`higher in ${test.group_a}: ${list(up, 4)}`);
  if (down?.length) parts.push(`lower: ${list(down, 4)}`);
  const skip = shared && shared.length ? new Set(shared.map((x) => `${x.term}|${x.direction}`)) : null;
  const pu = topProgram(test, "up", 0.05, skip);
  const pd = topProgram(test, "down", 0.05, skip);
  if (pu) parts.push(`up program: ${pu.pretty} (q ${formatQ(pu.q)})`);
  if (pd) parts.push(`down program: ${pd.pretty} (q ${formatQ(pd.q)})`);
  return parts.join("; ");
}

export function formatQ(q) {
  if (!Number.isFinite(q)) return "–";
  if (q <= 0) return "<1e-300";
  return q < 1e-3 ? q.toExponential(0) : q.toFixed(3);
}

/**
 * Programs that lead most of the driver tests in the same direction: a tumour-wide or clade effect (cells of one clade
 * carry many events at once), not a property of one driver. Counted over combinable driver tests with robust genes.
 * @returns [{ term, direction, n, of, pretty }] most common first
 */
export function sharedPrograms(data, { minShare = 0.5, minTests = 4, top = 3, maxQ = 0.05 } = {}) {
  const tests = (data?.tests || []).filter((t) => t.family === "driver" && t.combinable && t.n_robust > 0);
  if (tests.length < minTests) return [];
  const count = new Map();
  tests.forEach((t) => {
    ["up", "down"].forEach((d) => {
      (t.enrichment?.[d] || []).filter((e) => e.q <= maxQ).slice(0, top).forEach((e) => {
        const k = `${e.term}|${d}`;
        count.set(k, (count.get(k) || 0) + 1);
      });
    });
  });
  return [...count.entries()]
    .filter(([, n]) => n / tests.length >= minShare)
    .map(([k, n]) => {
      const [term, direction] = k.split("|");
      return { term, direction, n, of: tests.length, pretty: pretty(term) };
    })
    .sort((a, b) => b.n - a.n);
}

const sign = (v) => (v > 0 ? "+" : "-");
const MITO = /^MT-/;
const RIBO = /^RP[LS]\d|^MRP[LS]/;

/** Direction-aware set of a test's significant top genes, for comparing tests with each other. */
export function geneSignature(test, q = ROBUST.q) {
  return new Set((test?.genes || []).filter((g) => g.q_val < q).map((g) => `${g.gene}${sign(g.avg_log2FC)}`));
}

/** Share of the smaller signature that is in both (0 when either is empty). */
export function signatureOverlap(a, b) {
  if (!a.size || !b.size) return 0;
  let both = 0;
  a.forEach((x) => b.has(x) && (both += 1));
  return both / Math.min(a.size, b.size);
}

/**
 * A reading caution for tests whose lead genes are mitochondrial or ribosomal (library quality / size, not biology), or "".
 */
export function qcNote(test) {
  const lead = [...(test?.robust_up || []), ...(test?.robust_down || [])].slice(0, 8);
  const n = lead.filter((g) => MITO.test(g) || RIBO.test(g)).length;
  return n >= 3 ? "Lead genes are mitochondrial / ribosomal (a MYC / translation program, or a library-quality effect): check percent_mt and library size before reading this as biology." : "";
}

/**
 * The robust findings for the Key findings headline cards: combinable tests (>= 2 patients) with at least
 * `minRobust` robust genes, best first. Tests that call the same genes in the same direction (carriers of different
 * events that sit on the same clade) are folded into one card (`also`). Copy-number tests are kept but marked
 * `control`, since much of a dosage signal is cis, and rank after driver and clade tests.
 * @returns [{ id, family, title, text, patients, nRobust, test, control, also: [labels], note }]
 */
export function headlineFindings(data, { max = 5, minRobust = 1, minPatients = 2, overlap = 0.4 } = {}) {
  const shared = sharedPrograms(data);
  const tests = (data?.tests || []).filter((t) => t.combinable && t.k_patients >= minPatients && t.n_robust >= minRobust);
  const scored = tests.map((t) => {
    const skip = new Set(shared.map((x) => `${x.term}|${x.direction}`));
    const prog = Math.max(topProgram(t, "up", 0.05, skip) ? 1 : 0, topProgram(t, "down", 0.05, skip) ? 1 : 0);
    const dosage = t.family === "cn" ? 0.5 : 1;
    return { t, score: dosage * (Math.min(t.n_robust, 200) + 25 * prog + 5 * t.k_patients) };
  });
  scored.sort((a, b) => b.score - a.score);
  const cards = [];
  scored.forEach(({ t }) => {
    const sig = geneSignature(t);
    const twin = cards.find((c) => signatureOverlap(c.sig, sig) >= overlap);
    if (twin) {
      twin.also.push(t.label.replace(/: .*$/, ""));
      return;
    }
    cards.push({
      id: t.id, family: t.family, title: t.label, text: describeTest(t, { shared }), patients: (t.patients || []).map((p) => p.patient),
      nRobust: t.n_robust, test: t, control: t.family === "cn", also: [], note: qcNote(t), sig,
    });
  });
  const out = cards.slice(0, shared.length ? Math.max(1, max - 1) : max).map(({ sig, ...c }) => c);
  if (shared.length) {
    const phrase = shared.slice(0, 4).map((x) => `${x.pretty} ${x.direction}`).join(", ");
    out.unshift({
      id: "shared", family: "shared", title: "Shared by most driver tests: a tumour-wide / clade effect",
      text: `${phrase} lead ${shared[0].n} of ${shared[0].of} driver tests. Carriers of different drivers sit on the same clades, so this is shown once here and not credited to each driver.`,
      patients: [], nRobust: 0, test: null, control: false, also: [], note: "",
    });
  }
  return out;
}

/**
 * Violin groups of one gene: per patient, group A then group B, from the exported cell indices of the test.
 * @param perPatient [{ patient, values: number[] | null (expression per row of the patient's cells.json), a: number[], b: number[], reason?: string }]
 * @returns { groups: [{ key, label, sublabel, color, values, cluster }], unavailable: [{ patient, reason }] }
 */
export function violinGroups(perPatient, { colorA = "#C2185B", colorB = "#1F5FA8", labelA = "A", labelB = "B" } = {}) {
  const groups = [];
  const unavailable = [];
  (perPatient || []).forEach((p) => {
    if (!p.values || !Array.isArray(p.a) || !Array.isArray(p.b)) {
      unavailable.push({ patient: p.patient, reason: p.reason || "expression not loaded" });
      return;
    }
    const pick = (idx) => idx.map((i) => p.values[i]).filter((v) => Number.isFinite(v));
    groups.push({ key: `${p.patient} A`, label: labelA, sublabel: "", color: colorA, values: pick(p.a), cluster: p.patient });
    groups.push({ key: `${p.patient} B`, label: labelB, sublabel: "", color: colorB, values: pick(p.b), cluster: p.patient });
  });
  return { groups, unavailable };
}

/** "<id>" without the patient prefix, e.g. MGH303_n209 -> n209. */
export const shortClade = (id) => `${id || ""}`.replace(/^.*_/, "");

/** Specs for the Clade comparison card (?cmpA / ?cmpB): the clade and its sister clade(s). */
export const cladeCompareSpecs = (cladeId) => ({ a: `clade:${cladeId}`, b: `sister:clade:${cladeId}` });

/** Rows of the per-patient table of the hardened highest-burden clade test (test.clade_info joined with test.patients). */
export function cladeTopRows(test) {
  const per = new Map((test?.patients || []).map((p) => [p.patient, p]));
  return (test?.clade_info || []).map((i) => {
    const p = per.get(i.patient) || {};
    return {
      key: i.patient, patient: i.patient, included: Boolean(i.included), reason: i.reason, clade: i.clade || null, burden_rel: i.burden_rel ?? null,
      n_private_snv: i.n_private_snv ?? null, top_signature: i.top_signature || null, n_a: p.n_a ?? i.n_a ?? null, n_b: p.n_b ?? i.n_b ?? null,
      adjust: p.adjust || null, d_mt: p.d_mt ?? null, d_lib: p.d_lib ?? null,
    };
  });
}

/**
 * Why a sensitivity (unrestricted) test cannot be read as a finding: patients whose
 * "highest-burden" clade has no SNV-based burden (burden_rel 0 or missing, so the clade
 * was not chosen by burden) and patients with fewer than minCells cells on a side.
 */
export function sensitivityProblems(test, minCells = 15) {
  const noBurden = [];
  const small = [];
  (test?.patients || []).forEach((p) => {
    if (p.burden_rel == null || p.burden_rel === 0) noBurden.push(p.patient);
    else if ((p.n_a ?? 0) < minCells || (p.n_b ?? 0) < minCells) small.push(`${p.patient} (${p.n_a} vs ${p.n_b})`);
  });
  return { noBurden, small };
}

/** Leading enrichment terms (q <= maxQ, first `top` per direction) of `test` that the hardened `reference` test does not report in the same direction. */
export function sensitivityOnlyTerms(test, reference, { top = 3, maxQ = 0.05 } = {}) {
  const out = [];
  ["up", "down"].forEach((d) => {
    const ref = new Set((reference?.enrichment?.[d] || []).map((e) => e.term));
    (test?.enrichment?.[d] || []).filter((e) => e.q == null || e.q <= maxQ).slice(0, top).forEach((e) => {
      if (!ref.has(e.term)) out.push({ term: e.term, direction: d });
    });
  });
  return out;
}

/** Flag for the leading genes of a test: "mito", "ribo" or "" when at least 3 of the first 8 lead genes are of that kind. */
export function leadFlag(genes) {
  const lead = (genes || []).slice(0, 8);
  if (lead.filter((g) => MITO.test(g)).length >= 3) return "mito";
  if (lead.filter((g) => RIBO.test(g)).length >= 3) return "ribo";
  return "";
}

/** Signed difference text: "+0.12" / "-1.4" or "–" when missing. */
export const fmtDiff = (v, digits = 2) => (Number.isFinite(v) ? `${v > 0 ? "+" : ""}${v.toFixed(digits)}` : "–");
