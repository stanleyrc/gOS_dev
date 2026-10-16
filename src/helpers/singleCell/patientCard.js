// Data joins for the compact single-cell patient card on the home page (d3-free).
import { eventClass, eventLabel } from "./cohortStats";

const NON_CLONE = /^(normal|unassigned)$/i;

/** "Clones: A (12 cells), B (15 cells)" (datafiles summary) -> [{ name, n }] */
export function parseClones(summary) {
  const m = `${summary || ""}`.match(/^Clones:\s*(.+)$/m);
  if (!m) return [];
  return m[1]
    .split(/\),\s*/)
    .map((s) => s.replace(/\)$/, "").match(/^(.*?)\s*\((\d+)\s+cells?$/))
    .filter(Boolean)
    .map((x) => ({ name: x[1].trim(), n: Number(x[2]) }));
}

/** Tumour clones (Normal / Unassigned set aside). */
export const tumourClones = (clones) => (clones || []).filter((c) => !NON_CLONE.test(c.name));

/** Tree provenance from the datafiles record: { kind: "older" | "current" | "none", file, noSnvs, text } */
export function treeSource(record) {
  const det = `${record?.tumor_details || ""}`;
  const m = det.match(/^old tree\s*\(([^)]*)\)/i);
  if (m) return { kind: "older", file: m[1], noSnvs: /no snvs yet/i.test(det), text: det };
  if (/^Tree:\s*included/m.test(`${record?.summary || ""}`)) return { kind: "current", file: null, noSnvs: false, text: "" };
  return { kind: "none", file: null, noSnvs: false, text: det };
}

/** Top `n` tier-1 events by tumour-cell fraction, one per label: [{ label, cls, fraction }] */
export function keyDrivers(events, n = 3) {
  const seen = new Set();
  return (events || [])
    .filter((e) => Number(e.Tier ?? e.tier) === 1)
    .map((e) => ({ label: eventLabel(e), cls: eventClass(e), fraction: Number(e.cell_fraction) || 0 }))
    .filter((e) => e.label)
    .sort((a, b) => b.fraction - a.fraction)
    .filter((e) => (seen.has(e.label) ? false : (seen.add(e.label), true)))
    .slice(0, n);
}

/** Single-cell TMB for the card: median per-cell mutations per Mb (QC-corrected), null when absent. */
export function cardTmb(tmbDoc, patient) {
  const p = (tmbDoc?.patients || []).find((x) => x.patient === patient);
  const v = p?.patient_summary?.cell_tmb_corrected?.median;
  return Number.isFinite(v) ? { value: v, noisy: !!p.noisy } : null;
}

/** Vignette entry (cells, RNA-linked cells, top finding) for one patient, or null. */
export function cardVignette(vignettes, patient) {
  const all = vignettes?.patients;
  const p = Array.isArray(all) ? all.find((x) => x.patient === patient) : all?.[patient];
  if (!p) return null;
  const f = (p.findings || [])[0];
  return { nCells: p.n_cells, nTumor: p.n_tumor, nNormal: p.n_normal, nRna: p.n_rna_linked, headline: f ? { short: f.short, text: f.text } : null };
}
