// Genes the genome gene track labels first on single-cell patient pages: the GBM core genes plus the patient's own
// driver events (tier 1-2). d3-free.
import { driverGenes } from "./driverSummary";

export const GBM_CORE_GENES = ["EGFR", "PDGFRA", "CDK4", "CDK6", "MDM2", "MDM4", "MET", "CDKN2A", "CDKN2B", "PTEN", "NF1", "TP53", "RB1", "TERT", "PIK3CA", "PIK3R1", "IDH1", "ATRX", "MYCN", "SMARCA4", "BRAF"];

/** Sorted unique gene symbols: GBM core genes + genes of the events with Tier <= maxTier. */
export function priorityGenes(events, maxTier = 2) {
  const set = new Set(GBM_CORE_GENES);
  (events || []).forEach((e) => {
    if (Number(e?.Tier ?? e?.tier ?? 9) > maxTier) return;
    driverGenes(e).forEach((g) => set.add(g));
  });
  return [...set].sort();
}

// memoised on the events array so react-redux does not re-render on unrelated state changes
let lastEvents = null;
let lastValue = null;
export function priorityGenesMemo(events) {
  if (events === lastEvents && lastValue) return lastValue;
  lastEvents = events;
  lastValue = priorityGenes(events);
  return lastValue;
}
