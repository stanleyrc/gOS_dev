// Cohort "Subclonal" view: recurrent subclonal driver SNVs, length-aware recurrence, pathway roll-up and
// subclonal / per-clade signature shifts, from <dataPath>_cohort/subclonal_drivers.json
// (srctools gos_sc_subclonal_drivers.py). d3-free so it can be unit tested.

export const STATUS_LABEL = {
  subclonal: "subclonal",
  clonal: "clonal",
  discordant: "fraction / tree disagree",
  indeterminate: "indeterminate (dropout)",
  unknown: "unknown",
};
export const STATUS_COLOR = { subclonal: "blue", clonal: "default", discordant: "orange", indeterminate: "default", unknown: "default" };
export const CLASS_LABEL = { trunc: "truncating", splice: "splice", missense: "missense (damaging)" };

/** p / q formatting: 2 significant digits, scientific below 1e-3, "1" at 1. */
export function fmtP(p) {
  if (p == null || !Number.isFinite(Number(p))) return "n/a";
  const v = Number(p);
  if (v >= 0.9995) return "1";
  if (v < 1e-3) return v.toExponential(1).replace("e-", "e−");
  return v.toPrecision(2);
}

export const pct = (x, d = 0) => (x == null || !Number.isFinite(Number(x)) ? "n/a" : `${(100 * Number(x)).toFixed(d)}%`);

/** "clonal or subclonal" as the user reads it: carrier fraction + tree node, e.g. "29% · private node". */
export function clonalityText(hit) {
  const node = hit?.tree?.category ? `${hit.tree.category} node` : "not on the tree";
  const t = hit?.clonality_test; // read-evidence rows: exported dropout-aware test (detection vs truncal SNVs at the same depth)
  if (t && t.status) {
    const exp = t.expected_detection != null ? ` vs ${pct(t.expected_detection)} expected` : "";
    return `${t.status} (dropout-aware: ${pct(t.observed_detection)} of ${t.n_covered} covered cells${exp}) · ${node}`;
  }
  return `${pct(hit?.carrier_fraction)} of tumour cells · ${node}`;
}

/** Gene rows of the driver-hit table, with their hits attached and sorted (patients with subclonal hits, hits, q). */
export function driverGeneRows(doc) {
  const hits = doc?.hits || [];
  return (doc?.driver_genes || [])
    .map((g) => {
      const hs = hits.filter((h) => h.gene === g.gene).sort((a, b) => a.patient.localeCompare(b.patient) || (b.carrier_fraction || 0) - (a.carrier_fraction || 0));
      const notes = hs.filter((h) => h.note).map((h) => ({ patient: h.patient, site: h.site, ...h.note }));
      return { ...g, key: g.gene, hits: hs, notes, q: g.recurrence_trunc?.q_patients ?? null, p: g.recurrence_trunc?.p_patients ?? null };
    })
    .sort(
      (a, b) =>
        b.patients_subclonal.length - a.patients_subclonal.length ||
        b.n_hits_subclonal - a.n_hits_subclonal ||
        (a.q ?? 1) - (b.q ?? 1) ||
        a.gene.localeCompare(b.gene)
    );
}

/** Recurrence rows for one variant set ("trunc" | "nonsyn"), at most `limit`, optionally only genes with >= minPatients. */
export function recurrenceRows(doc, set = "trunc", { limit = 50, minPatients = 1 } = {}) {
  const block = (doc?.recurrence || []).find((r) => r.set === set);
  if (!block) return { rows: [], nTested: 0 };
  const rows = block.rows.filter((r) => r.patients >= minPatients).slice(0, limit);
  return { rows: rows.map((r) => ({ ...r, key: r.gene })), nTested: block.n_genes_tested };
}

/** Top recurrent genes for headline cards: q_patients < qMax, or the best few with >= 2 patients when none pass. */
export function headlineGenes(doc, { qMax = 0.1, max = 5 } = {}) {
  const { rows } = recurrenceRows(doc, "trunc", { limit: 200 });
  const sig = rows.filter((r) => r.q_patients < qMax);
  // genes that stop being significant once read-QC-flagged sites are removed are demoted below the ones that pass
  // strict q (excluding read-QC / paralog filters) when the export has it, else the older read-QC-pass q
  const qStrict = (r) => (r.q_patients_strict != null ? r.q_patients_strict : r.q_patients_read_qc_pass);
  const qcFails = (r) => qStrict(r) != null && qStrict(r) >= qMax;
  const sigPass = sig.filter((r) => !qcFails(r));
  const base = sig.length ? sig : rows.filter((r) => r.patients >= 2);
  const pick = [...base.filter((r) => !qcFails(r)), ...base.filter(qcFails)].slice(0, max);
  return pick.map((r) => ({
    gene: r.gene,
    patients: (r.per_patient || []).map((x) => x.patient),
    hits: r.hits,
    expected: r.expected_hits,
    p: r.p_patients,
    q: r.q_patients,
    qNoBwh69: r.q_patients_no_bwh69,
    patientsQc: r.patients_read_qc_pass ?? null,
    qQc: r.q_patients_read_qc_pass ?? null,
    patientsStrict: r.patients_strict ?? null,
    qStrict: r.q_patients_strict ?? null,
    qcFailed: qcFails(r),
    significant: r.q_patients < qMax && !qcFails(r),
    nPassing: sigPass.length,
  }));
}

/** Pathway x patient matrix: [{ pathway, genes, cells: [{ patient, available, subclonal, clonal, other }] }], patients. */
export function pathwayMatrix(doc) {
  const patients = (doc?.patients || []).map((p) => p.patient);
  const rows = (doc?.pathways || []).map((pw) => ({
    pathway: pw.pathway,
    genes: pw.genes,
    cells: patients.map((p) => {
      const c = pw.patients?.[p] || { available: false };
      return { patient: p, available: !!c.available, subclonal: c.subclonal || [], clonal: c.clonal || [], other: (c.other_truncating || []).map((o) => o.gene) };
    }),
  }));
  rows.forEach((r) => {
    r.nSubclonal = r.cells.filter((c) => c.subclonal.length).length;
    r.nAny = r.cells.filter((c) => c.subclonal.length || c.clonal.length || c.other.length).length;
  });
  return { patients, rows };
}

/**
 * Called clades of one patient in tree order (depth-first from the root, larger child first), each with its
 * fitted fractions keyed by signature and the significant shifts (q < qMax) against the truncal set / its parent.
 */
export function cladeSignatureRows(doc, patient, { qMax = 0.1, shifts = null } = {}) {
  const block = doc?.clade_signatures?.[patient];
  if (!block) return { signatures: [], rows: [], truncal: null };
  const sh = shifts || (doc?.signature_shifts || []).filter((s) => s.patient === patient);
  const byId = new Map(block.clades.map((c) => [c.clade, c]));
  const kids = new Map();
  block.clades.forEach((c) => {
    const p = c.parent && byId.has(c.parent) ? c.parent : null;
    if (!kids.has(p)) kids.set(p, []);
    kids.get(p).push(c);
  });
  kids.forEach((l) => l.sort((a, b) => (b.n_cells || 0) - (a.n_cells || 0) || a.clade.localeCompare(b.clade)));
  const out = [];
  const walk = (c, depth) => {
    const frac = {};
    (c.fractions || []).forEach((f) => {
      frac[f.signature] = f;
    });
    const tests = {};
    (c.vs || []).forEach((t) => {
      if (t.q != null && t.q < qMax) {
        if (!tests[t.signature]) tests[t.signature] = [];
        tests[t.signature].push(t);
      }
    });
    const flagged = sh.filter((s) => s.clade === c.clade);
    out.push({ ...c, key: c.clade, depth, frac, tests, flagged });
    (kids.get(c.clade) || []).forEach((k) => walk(k, depth + 1));
  };
  (kids.get(null) || []).forEach((r) => walk(r, 0));
  const truncal = {};
  (block.truncal?.fractions || []).forEach((f) => {
    truncal[f.signature] = f;
  });
  return { signatures: block.signatures || [], added: block.added || [], rows: out, truncal, nTruncal: block.truncal?.n_sites ?? 0 };
}

/** Short label of a clade shift: "SBS13 +8 pts vs n182 (q 0.017)". */
export function shiftText(s) {
  const pts = Math.round(100 * s.diff);
  const vs = s.vs === "truncal" ? "truncal" : `${s.vs}`.replace(/^[A-Z0-9]+_/, "");
  return `${s.signature} ${pts > 0 ? "+" : ""}${pts} pts vs ${vs} (q ${fmtP(s.q)})`;
}

/** Cohort list of significant clade shifts grouped by signature and direction: [{ key, signature, up, n, patients, shifts }]. */
export function shiftSummary(doc) {
  const m = new Map();
  (doc?.signature_shifts || []).forEach((s) => {
    const k = `${s.signature}|${s.diff > 0 ? "up" : "down"}`;
    if (!m.has(k)) m.set(k, { key: k, signature: s.signature, up: s.diff > 0, shifts: [] });
    m.get(k).shifts.push(s);
  });
  return [...m.values()]
    .map((g) => ({ ...g, n: g.shifts.length, patients: [...new Set(g.shifts.map((s) => s.patient))].sort() }))
    .sort((a, b) => b.patients.length - a.patients.length || b.n - a.n);
}

/** Signature contrasts (truncal vs subclonal / private) of every patient: flat rows. */
export function contrastRows(doc, { contrast = "subclonal vs truncal" } = {}) {
  const out = [];
  (doc?.patients || []).forEach((p) => {
    (p.signature_contrasts || [])
      .filter((c) => c.contrast === contrast)
      .forEach((c) =>
        (c.rows || []).forEach((r) => out.push({ key: `${p.patient}|${r.signature}`, patient: p.patient, n_a: c.n_a, n_b: c.n_b, ...r }))
      );
  });
  return out;
}

/**
 * Cohort Clade F1 filter (singleCellCohortPanel): whether an event survives. SNVs are exempt: with a few reads
 * per cell at a site most carriers show no alt read, so even a clonal SNV cannot reach F1 0.5 against its
 * clade (sparse carriers look "scattered"); SNV quality is judged by the site-evidence verdict instead.
 * `includeSnv` (the header's "incl. SNVs" switch) applies the threshold to SNVs too.
 */
export function passesCladeFilter(event, score, minF1, { includeSnv = false } = {}) {
  if (isSnvEvent(event) && !includeSnv) return true;
  return !Number.isFinite(score) || score >= minF1;
}

export function isSnvEvent(e) {
  return /^(snv|indel)$/i.test(`${e?.vartype || ""}`) || /^(trunc|splice|missense|inframe)/i.test(`${e?.type || ""}`);
}

const EXCLUDE_LABELS = {
  exon_split: "spliced reads",
  split_only: "split reads only",
  read_end: "alt at read ends",
  low_carrier_vaf: "low carrier VAF",
  single_read: "single-read carriers",
  paralog: "paralog site",
  recurrent_allele: "allele in other patients",
};

/** Labels for the excluding filter codes of a hit (hit.excluded_reason); [] when none or the export predates the filters. */
export function excludedLabels(hit) {
  return (hit?.excluded_reason || []).map((c) => ({ code: c, label: EXCLUDE_LABELS[c] || c }));
}

/** "strict q" column value: null (not available) when the export has no strict test. */
export function strictQ(row) {
  return row?.q_patients_strict ?? null;
}
