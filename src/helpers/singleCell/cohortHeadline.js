// Cohort headline: the few cross-patient results the Overview leads with
// (shared truncal drivers, ecDNA prevalence, subclonal drivers). Built from
// each patient's buildPatientReport() output and walks.json. Pure functions.

const CLASS_WORD = { amp: "amplification", homdel: "deletion", fusion: "fusion", trunc: "truncating", splice: "splice", missense: "missense", complex: "complex SV", other: "alteration" };

// ecDNA calls that count for prevalence: circular walk in >= 3 cells at median CN >= 4
// (the ecDNA / amplicons view defaults)
export const ECDNA_MIN_CELLS = 3;
export const ECDNA_MIN_MEDIAN_CN = 4;

const geneList = (v) =>
  (Array.isArray(v) ? v : `${v ?? ""}`.split(/[,;+]/))
    .map((g) => `${g}`.trim())
    .filter((g) => g && g !== "NA" && g !== "None");

/** Circular amplicons of a walks.json passing the prevalence thresholds. */
export function ecdnaWalks(walksFile) {
  const walks = Array.isArray(walksFile?.walks) ? walksFile.walks : [];
  return walks.filter((w) => w && w.circular && Number(w.ncells) >= ECDNA_MIN_CELLS && Number(w.median_cn) >= ECDNA_MIN_MEDIAN_CN);
}

/**
 * Drivers seen in >= minPatients patients, keyed gene + class, with the
 * patients where the driver is truncal (clonal) and where it is subclonal.
 * @param patients [{ id, report }]
 */
export function recurrentDrivers(patients = [], { minPatients = 2 } = {}) {
  const byKey = new Map();
  patients.forEach(({ id, report }) => {
    if (!report) return;
    const seen = new Set();
    [...(report.clonal || []), ...(report.subclonal || [])].forEach((d) => {
      if (!d.gene || d.class === "fusion" || d.class === "complex") return;
      const key = `${d.gene}|${d.class}`;
      if (seen.has(key)) return;
      seen.add(key);
      if (!byKey.has(key)) byKey.set(key, { gene: d.gene, class: d.class, word: CLASS_WORD[d.class] || d.class, truncal: [], subclonal: [] });
      byKey.get(key)[d.clonality === "clonal" ? "truncal" : "subclonal"].push(id);
    });
  });
  return [...byKey.values()]
    .map((r) => ({ ...r, patients: [...r.truncal, ...r.subclonal] }))
    .filter((r) => r.patients.length >= minPatients)
    .sort((a, b) => b.patients.length - a.patients.length || b.truncal.length - a.truncal.length || a.gene.localeCompare(b.gene));
}

/** ecDNA prevalence: patients with >= 1 circular amplicon and the oncogenes they carry (by patient count). */
export function ecdnaPrevalence(patients = []) {
  const carriers = [];
  const genes = new Map();
  let nSpecies = 0;
  patients.forEach(({ id, walks }) => {
    const ec = ecdnaWalks(walks);
    if (!ec.length) return;
    carriers.push(id);
    nSpecies += ec.length;
    const mine = new Set(ec.flatMap((w) => geneList(w.driver_genes)));
    mine.forEach((g) => genes.set(g, [...(genes.get(g) || []), id]));
  });
  const oncogenes = [...genes.entries()]
    .map(([gene, ids]) => ({ gene, patients: ids }))
    .sort((a, b) => b.patients.length - a.patients.length || a.gene.localeCompare(b.gene));
  return { carriers, nSpecies, oncogenes, nAssessed: patients.filter((p) => p.walks).length };
}

const list = (items, max = 4) => (items.length > max ? `${items.slice(0, max).join(", ")} +${items.length - max}` : items.join(", "));
const and = (items) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}` : items[0] || "");

/**
 * TERT promoter headline from _cohort/hotspot_rescue.json (exporter gos_sc_hotspot_rescue): patients with a rescued
 * TERT C228T / C250T call, with the read evidence. Patients whose site evidence was not computed are "not assessed".
 * @param doc hotspot_rescue.json ({ patients: { id: { assessed, reason, sites: [{ name, called, tumor, tumour_cells, level, ... }] } } })
 * @param ids patient ids of the cohort in view
 */
export function tertHeadline(doc, ids = []) {
  const pts = doc?.patients;
  if (!pts || !ids.length) return null;
  const assessed = ids.filter((id) => pts[id]?.assessed);
  const notAssessed = ids.filter((id) => !pts[id]?.assessed);
  if (!assessed.length) return null;
  const isTert = (s) => /^TERT /.test(`${s.name}`);
  const calls = [];
  const noSupport = [];
  assessed.forEach((id) => {
    const tert = (pts[id].sites || []).filter(isTert);
    const hit = tert.filter((s) => s.called);
    if (hit.length) hit.forEach((s) => calls.push({ id, site: s }));
    else noSupport.push(id);
  });
  const variants = (name) => calls.filter((c) => c.site.name === name).map((c) => c.id);
  const c228 = variants("TERT C228T");
  const c250 = variants("TERT C250T");
  const reads = (s) => `${s.tumor.alt_f + s.tumor.alt_r}/${s.tumor.alt_f + s.tumor.alt_r + s.tumor.ref_f + s.tumor.ref_r} reads, ${s.tumor.cells_alt}/${s.tumor.cells_cov} cells`;
  const evidence = calls.map((c) => `${c.id} ${c.site.name.replace("TERT ", "")} ${reads(c.site)}${c.site.level === "weak" ? " (weak)" : ""}`);
  const patientsHit = [...new Set(calls.map((c) => c.id))];
  return {
    key: "tert",
    value: patientsHit.length,
    total: ids.length,
    title: `TERT promoter mutated in ${patientsHit.length} of ${ids.length} tumors: ${[c228.length ? `C228T in ${c228.length}` : "", c250.length ? `C250T in ${c250.length}` : ""].filter(Boolean).join(", ") || "none"}`,
    detail: [
      `Not in the SNV calls (GC-rich, low depth): recovered from read-level site evidence. Alt reads / all reads, cells with an alt read / covered cells: ${evidence.join("; ")}`,
      noSupport.length ? `No alt reads: ${list(noSupport, 6)}` : "",
      notAssessed.length ? `Not assessed (site evidence not computed): ${list(notAssessed, 6)}` : "",
    ].filter(Boolean).join(". "),
    patients: patientsHit,
    view: "drivers",
  };
}

/**
 * Headline findings, most important first:
 * [{ key, value, total, title, detail, patients, view }]
 *   value / total: the number shown large ("4 / 9"); view: cohort sub-view to open.
 */
export function cohortHeadline(patients = [], { hotspots = null } = {}) {
  if (!patients.length) return [];
  const out = [];
  const withReport = patients.filter((p) => p.report);
  const nTumors = withReport.length;

  // 1. shared truncal drivers (truncal in >= 2 tumors), most shared first
  if (nTumors) {
    const recurrent = recurrentDrivers(withReport);
    const shared = recurrent.filter((r) => r.truncal.length >= 2).sort((a, b) => b.truncal.length - a.truncal.length || b.patients.length - a.patients.length);
    const withTruncal = withReport.filter((p) => (p.report.clonal || []).length).length;
    if (shared.length) {
      const sharing = [...new Set(shared.flatMap((r) => r.truncal))];
      const alsoSub = shared.filter((r) => r.subclonal.length >= 2).map((r) => `${r.gene} ${r.word} is subclonal in ${r.subclonal.length} more (${r.subclonal.join(", ")})`);
      out.push({
        key: "drivers",
        value: sharing.length,
        total: nTumors,
        title: `Shared truncal drivers: ${and(shared.slice(0, 3).map((r) => `${r.gene} ${r.word} (${r.truncal.length} tumors)`))}`,
        detail: [...alsoSub.slice(0, 2), `${withTruncal} of ${nTumors} tumors have at least one truncal driver (in ≥ 85% of tumor cells)`].join(". "),
        patients: sharing,
        view: "drivers",
      });
    } else if (recurrent.length) {
      const top = recurrent[0];
      out.push({
        key: "drivers",
        value: top.patients.length,
        total: nTumors,
        title: `Most recurrent driver: ${top.gene} ${top.word} (${top.patients.length} tumors)`,
        detail: `${withTruncal} of ${nTumors} tumors have at least one truncal driver (in ≥ 85% of tumor cells)`,
        patients: top.patients,
        view: "drivers",
      });
    }
  }

  // 1b. TERT promoter hotspot rescued from site evidence
  const tert = tertHeadline(hotspots, patients.map((p) => p.id));
  if (tert) out.push(tert);

  // 2. ecDNA prevalence, among tumors with amplicon reconstruction (walks.json)
  const ec = ecdnaPrevalence(patients);
  if (ec.nAssessed) {
    const notAssessed = patients.filter((p) => !p.walks).map((p) => p.id);
    const genes = ec.oncogenes.filter((g) => g.patients.length >= 2).map((g) => `${g.gene} (${g.patients.length})`);
    out.push({
      key: "ecdna",
      value: ec.carriers.length,
      total: ec.nAssessed,
      title: `${ec.carriers.length === ec.nAssessed ? "Every" : `${ec.carriers.length} of ${ec.nAssessed}`} reconstructed tumor${ec.carriers.length === ec.nAssessed ? " carries" : "s carry"} ecDNA: ${ec.nSpecies} circular amplicons`,
      detail: [genes.length ? `Recurrent oncogenes on ecDNA: ${genes.join(", ")}` : "", notAssessed.length ? `Not reconstructed: ${list(notAssessed)}` : ""].filter(Boolean).join(". "),
      patients: ec.carriers,
      view: "amplicons",
    });
  }

  // 3. subclonal drivers: drivers present in only part of the tumor
  if (nTumors) {
    const withSub = withReport.filter((p) => (p.report.subclonal || []).length);
    const nSub = withSub.reduce((s, p) => s + p.report.subclonal.length, 0);
    const recurrentSub = recurrentDrivers(withReport)
      .filter((r) => r.subclonal.length >= 2)
      .sort((a, b) => b.subclonal.length - a.subclonal.length)
      .slice(0, 3)
      .map((r) => `${r.gene} ${r.word} (${r.subclonal.length})`);
    if (withSub.length) {
      out.push({
        key: "subclonal",
        value: withSub.length,
        total: nTumors,
        title: `${withSub.length === nTumors ? "Every tumor carries" : `${withSub.length} of ${nTumors} tumors carry`} subclonal drivers: ${nSub} alterations in only part of the tumor`,
        detail: recurrentSub.length ? `Recurrently subclonal: ${recurrentSub.join(", ")}` : "",
        patients: withSub.map((p) => p.id),
        view: "drivers",
      });
    }
  }
  return out;
}
