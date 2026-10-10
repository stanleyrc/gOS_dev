// Structured "key findings" of a single-cell patient, derived from the
// patient-level filtered events, the tree-mapped SNV sites, the SBS
// signature fits and the cells' clone labels. Pure functions.

import { eventClass } from "./cohortStats";
import { isStrongEvent } from "./strongEvents";
import { snvCategoryCounts } from "./cohortStats";
import { fisherExact } from "./tests";

export const CLONAL_FRACTION = 0.85;
export const RARE_FRACTION = 0.1;
export const CLONE_DEFINING_IN = 0.6; // fraction of the clone's cells carrying the event
export const CLONE_DEFINING_OUT = 0.2; // fraction of the other tumor cells carrying it

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const isNormal = (clone) => /^normal$/i.test(`${clone || ""}`);

/** Per-clone carrier fractions of an event, from its cell_ids and the cells' clones. */
export function cloneFractions(event, cloneOf, cloneSizes) {
  const carriers = `${event.cell_ids || ""}`.split(",").filter(Boolean);
  const counts = {};
  carriers.forEach((id) => {
    const clone = cloneOf.get(id);
    if (clone == null || isNormal(clone)) return;
    counts[clone] = (counts[clone] || 0) + 1;
  });
  const out = {};
  const tumorTotal = Object.entries(cloneSizes).filter(([c]) => !isNormal(c)).reduce((s, [, v]) => s + v, 0);
  const carriersTotal = Object.entries(counts).reduce((s, [, v]) => s + v, 0);
  Object.keys(cloneSizes).forEach((clone) => {
    if (isNormal(clone)) return;
    const n = counts[clone] || 0;
    const size = cloneSizes[clone];
    // Fisher's exact test: carriers in this clone vs in the other tumor cells
    const { p, oddsRatio } = fisherExact(n, size - n, carriersTotal - n, tumorTotal - size - (carriersTotal - n));
    out[clone] = { n, size, fraction: size ? n / size : 0, p, oddsRatio };
  });
  return out;
}

/** Clones an event defines: carried by most of the clone and few other tumor cells. */
export function definingClones(fractions, tumorCells) {
  return Object.entries(fractions)
    .filter(([, f]) => f.size >= 3 && f.fraction >= CLONE_DEFINING_IN)
    .filter(([clone, f]) => {
      const others = Object.entries(fractions).filter(([c]) => c !== clone);
      const outN = others.reduce((s, [, g]) => s + g.n, 0);
      const outSize = Math.max(1, tumorCells - f.size);
      return outN / outSize <= CLONE_DEFINING_OUT;
    })
    .map(([clone]) => clone);
}

/** Short label of an alteration for the report. */
export function eventLabel(event) {
  const cls = eventClass(event);
  const gene = event.fusion_genes || event.gene || event.name || "?";
  if (cls === "amp") return `${gene} amplification`;
  if (cls === "homdel") return `${gene} homozygous deletion`;
  if (cls === "fusion") return `${gene} fusion`;
  const variant = event.Variant && `${event.Variant}`.trim() ? ` ${event.Variant}` : "";
  return `${gene}${variant} (${event.type || cls})`;
}

/**
 * Build the report.
 * @param events patient-level filtered events
 * @param cells manifest cell records ({ cell_id, clone_id, ... })
 * @param variants snv_matrix variants (with category / cellphy_input / driver)
 * @param signatures signatures.json ({ sets: [{ name, n, activities }] })
 * @param selectedUids uids ticked under "Add to report" in the Filtered Events
 *   table; when non-empty the drivers are the ticked strong Tier 1-2 events
 *   plus any ticked Tier 3 event, else all strong Tier 1-2 events
 */
export function buildPatientReport({ patient, events = [], cells = [], variants = [], signatures = null, selectedUids = null }) {
  const cloneOf = new Map(cells.map((c) => [c.cell_id, c.clone_id]));
  const tumor = cells.filter((c) => !isNormal(c.clone_id));
  const cloneSizes = {};
  tumor.forEach((c) => {
    const clone = c.clone_id ?? "Unassigned";
    cloneSizes[clone] = (cloneSizes[clone] || 0) + 1;
  });

  const tierOf = (e) => num(e.tier ?? e.Tier); // tier: as re-tiered by the user (merged interpretations)
  const picked = Array.isArray(selectedUids) && selectedUids.length ? new Set(selectedUids) : null;
  const drivers = events
    // tier 1-2 events start out ticked, so they still need to be strong; tier 3 picks always count
    .filter((e) => (tierOf(e) ?? 9) <= 2 ? isStrongEvent(e) && (!picked || picked.has(e.uid)) : Boolean(picked) && e.uid != null && picked.has(e.uid))
    .map((e) => {
      const fraction = num(e.cell_fraction) ?? 0;
      const fractions = cloneFractions(e, cloneOf, cloneSizes);
      return {
        event: e,
        label: eventLabel(e),
        gene: e.gene || e.fusion_genes,
        class: eventClass(e),
        tier: tierOf(e),
        role: e.role && e.role !== "None" ? e.role : null,
        effect: e.effect && e.effect !== "None" ? e.effect : null,
        fraction,
        nCells: num(e.n_cells) ?? 0,
        cells: e.cells,
        clonality: fraction >= CLONAL_FRACTION ? "clonal" : fraction >= RARE_FRACTION ? "subclonal" : "rare",
        fractions,
        definingClones: definingClones(fractions, tumor.length),
        unverified: eventClass(e) === "fusion",
      };
    })
    .sort((a, b) => b.fraction - a.fraction || (a.tier ?? 9) - (b.tier ?? 9));

  // De-duplicate fusions that share a 3' partner (same breakpoint, several 5' genes).
  const seenFusion = new Set();
  const dedup = drivers.filter((d) => {
    if (d.class !== "fusion") return true;
    const partner = `${d.gene}`.split("::")[1] || d.gene;
    const key = `${partner}:${d.cells}`;
    if (seenFusion.has(key)) return false;
    seenFusion.add(key);
    return true;
  });

  const clonal = dedup.filter((d) => d.clonality === "clonal");
  const subclonal = dedup.filter((d) => d.clonality === "subclonal");
  const rare = dedup.filter((d) => d.clonality === "rare");

  const clones = Object.entries(cloneSizes)
    .sort((a, b) => b[1] - a[1])
    .map(([clone, size]) => ({
      clone,
      size,
      fraction: tumor.length ? size / tumor.length : 0,
      defining: dedup.filter((d) => d.definingClones.includes(clone)),
      carried: dedup.filter((d) => d.fractions[clone]?.fraction >= 0.5 && !d.definingClones.includes(clone) && d.clonality !== "clonal"),
    }));

  const burden = snvCategoryCounts(variants);
  const snvDrivers = variants.filter((v) => v.driver === true);

  const setOf = (name) => (signatures?.sets || []).find((s) => s.name === name);
  const share = (set) => {
    const acts = (set?.activities || []).map((a) => ({ signature: a.signature, activity: Number(a.activity) || 0 }));
    const total = acts.reduce((s, a) => s + a.activity, 0) || 1;
    return acts.map((a) => ({ ...a, share: a.activity / total })).sort((a, b) => b.share - a.share);
  };
  const sigAll = share(setOf("all"));
  const sigTruncal = share(setOf("truncal"));
  const sigSub = share(setOf("subclonal"));
  const emerging = sigSub.filter((s) => s.share >= 0.1 && (sigTruncal.find((x) => x.signature === s.signature)?.share || 0) < 0.03);

  // Tier 3 SNVs the pipeline's driver evidence (gos_sc_snv_evidence.R) calls likely drivers
  const inReport = new Set(dedup.map((d) => d.event));
  const candidates = events
    .filter((e) => e.driver_class === "likely" && !inReport.has(e) && (tierOf(e) ?? 9) > 2)
    .map((e) => ({ event: e, label: eventLabel(e), gene: e.gene, score: num(e.driver_score), evidence: e.driver_evidence || "", fraction: num(e.cell_fraction) ?? 0 }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || b.fraction - a.fraction);

  return {
    patient,
    picked: Boolean(picked),
    candidates,
    nCells: cells.length,
    nTumorCells: tumor.length,
    nNormalCells: cells.length - tumor.length,
    clones,
    clonal,
    subclonal,
    rare,
    burden,
    snvDrivers,
    signatures: { all: sigAll.slice(0, 5), truncal: sigTruncal.slice(0, 4), subclonal: sigSub.slice(0, 4), emerging, n: setOf("all")?.n ?? null },
    caveats: [
      ...(dedup.some((d) => d.unverified) ? ["fusions-unverified"] : []),
      ...(events.some((e) => eventClass(e) === "homdel" && !isStrongEvent(e)) ? ["homdel-noise"] : []),
    ],
  };
}
