// Gene-level read-QC verdicts from <dataPath>_cohort/subclonal_drivers.json (hits[].read_qc.flags, written by
// srctools hit_read_qc.py). A gene is "read-QC flagged" when it has hits and every scanned hit carries >= 1 flag
// (spliced exon-exon alt reads, split-only alt, read-block ends, same allele in other patients). d3-free.

/** Map(gene -> { gene, nHits, nScanned, nFlagged, allFlagged, patients[], flags: [{ flag, n }], q, qQc }) */
export function geneReadQcMap(doc) {
  const out = new Map();
  (doc?.hits || []).forEach((h) => {
    if (!h?.gene) return;
    if (!out.has(h.gene)) out.set(h.gene, { gene: h.gene, nHits: 0, nScanned: 0, nFlagged: 0, patients: [], flagCounts: new Map() });
    const g = out.get(h.gene);
    g.nHits += 1;
    if (!g.patients.includes(h.patient)) g.patients.push(h.patient);
    if (!h.read_qc) return; // not scanned: neither flagged nor cleared
    g.nScanned += 1;
    const flags = h.read_qc.flags || [];
    if (flags.length) g.nFlagged += 1;
    // "same allele in A, B, C" varies per site; group it under one label
    new Set(flags.map((f) => (/^same allele in/.test(f) ? "same allele in other patients" : f))).forEach((f) => g.flagCounts.set(f, (g.flagCounts.get(f) || 0) + 1));
  });
  const rec = new Map((doc?.driver_genes || []).map((r) => [r.gene, r.recurrence_trunc]));
  out.forEach((g) => {
    g.allFlagged = g.nScanned > 0 && g.nScanned === g.nHits && g.nFlagged === g.nScanned;
    g.flags = [...g.flagCounts.entries()].map(([flag, n]) => ({ flag, n })).sort((a, b) => b.n - a.n);
    g.q = rec.get(g.gene)?.q_patients ?? null;
    g.qQc = rec.get(g.gene)?.q_patients_read_qc_pass ?? null;
    delete g.flagCounts;
  });
  return out;
}

/** Set of genes whose every hit is read-QC flagged. */
export const flaggedGenes = (doc) => new Set([...geneReadQcMap(doc).values()].filter((g) => g.allFlagged).map((g) => g.gene));

/** One-line explanation for a badge / tooltip. */
export function readQcText(g) {
  if (!g || !g.nFlagged) return "";
  const scope = g.allFlagged ? `all ${g.nHits} subclonal driver hits` : `${g.nFlagged} of ${g.nHits} subclonal driver hits`;
  const why = g.flags.map((f) => `${f.flag}${g.nHits > 1 ? ` (${f.n})` : ""}`).join("; ");
  const q = g.q != null && g.qQc != null ? ` Recurrence q ${g.q < 1e-3 ? g.q.toExponential(1) : g.q.toPrecision(2)} before QC, ${g.qQc >= 0.9995 ? "1" : g.qQc.toPrecision(2)} after.` : "";
  return `${scope} carry read-level artefact flags: ${why}. Likely cDNA carry-over / processed copy or alignment artefact rather than a somatic event.${q}`;
}
