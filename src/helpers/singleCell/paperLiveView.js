// Live patient views behind paper-figure panels (d3-free, unit tested).
//
// A figure panel drawn from one patient's rows (tree, CN / SNV matrices, walk copies, genome tracks) can be swapped for
// the patient's own gOS components: the Single-Cell tab's genome navigator + phylogeny & heatmap (zoom / pan, gene
// track modes, cell selection), or the ecDNA patient figure for panels with walk copies. This module decides which
// component backs a panel and with which genome windows / cells it opens, so the live view starts where the print is.

const COPIES = /\bcopies\b|\bwalks?\b/i;

/** Unique genome windows of a panel's genome-axis regions, in figure order: [{ chr, from, to }]. */
export function panelWindows(sidecar, panel) {
  const want = `${panel}`.toLowerCase();
  const out = [];
  const seen = new Set();
  (sidecar?.regions || []).forEach((r) => {
    if (`${r.panel ?? ""}`.toLowerCase() !== want || r.axis?.type !== "genome") return;
    const wins = Array.isArray(r.axis.windows) && r.axis.windows.length ? r.axis.windows : [r.axis];
    wins.forEach((w) => {
      if (w?.chr == null || !Number.isFinite(+w.from) || !Number.isFinite(+w.to) || +w.to <= +w.from) return;
      const k = `${w.chr}:${+w.from}-${+w.to}`;
      if (seen.has(k)) return;
      seen.add(k);
      out.push({ chr: `${w.chr}`.replace(/^chr/i, ""), from: +w.from, to: +w.to });
    });
  });
  return out;
}

/**
 * Panels with a live patient counterpart: [{ panel, patient, kind, windows, cells }].
 * kind: "ecdna" (walk / ecDNA copies: the patient ecDNA figure), "tracks" (a few example cells' genome tracks: the
 * patient view with those cells selected), "heatmap" (tree + matrices: the patient Single-Cell phylogeny & heatmap).
 * cells: the example cells of a tracks panel (selected when the live view opens), else [].
 */
export function livePanels(sidecar) {
  const by = new Map();
  (sidecar?.regions || []).forEach((r) => {
    if (r.kind !== "rows" || !r.panel || !r.patient) return;
    const key = `${r.panel}`;
    const p = by.get(key) || { panel: key, patient: `${r.patient}`, regions: [] };
    p.regions.push(r);
    by.set(key, p);
  });
  return [...by.values()].map(({ panel, patient, regions }) => {
    const maxRows = Math.max(0, ...regions.map((r) => (Array.isArray(r.rows) ? r.rows.length : 0)));
    const copies = regions.some((r) => COPIES.test(`${r.label || ""}`));
    const windows = panelWindows(sidecar, panel);
    const kind = copies ? "ecdna" : maxRows > 5 ? "heatmap" : maxRows > 0 || windows.length ? "tracks" : "heatmap";
    const cells = kind === "tracks" ? [...new Set(regions.flatMap((r) => (Array.isArray(r.rows) && r.rows.length <= 5 ? r.rows : [])).map((c) => `${c}`))] : [];
    return { panel, patient, kind, windows, cells };
  });
}

/** The live panel spec of a letter (case-insensitive), or null. */
export const livePanel = (panels, letter) => (panels || []).find((p) => `${p.panel}`.toLowerCase() === `${letter}`.toLowerCase()) || null;

/**
 * Store domains ([[start, end]] in the genome-wide coordinates of chromoBins, startPlace = position 1) for windows,
 * clipped to the chromosome. Unknown chromosomes are dropped.
 */
export function windowsToDomains(windows, chromoBins) {
  return (windows || [])
    .map((w) => {
      const b = chromoBins?.[`${w.chr}`];
      if (!b || !Number.isFinite(b.startPlace)) return null;
      const len = Number.isFinite(b.endPoint) ? b.endPoint : Number.isFinite(b.endPlace) ? b.endPlace - b.startPlace : Infinity;
      // startPlace is position 1 of the chromosome
      const from = Math.max(1, Math.min(w.from, len));
      const to = Math.max(from + 1, Math.min(w.to, len));
      return [b.startPlace + from - 1, b.startPlace + to - 1];
    })
    .filter(Boolean);
}

/** The whole genome as one domain (first chromosome start to last chromosome end), or [] without chromoBins. */
export function wholeGenomeDomains(chromoBins) {
  const bins = Object.values(chromoBins || {}).filter((b) => Number.isFinite(b?.startPlace) && Number.isFinite(b?.endPlace));
  if (!bins.length) return [];
  return [[Math.min(...bins.map((b) => b.startPlace)), Math.max(...bins.map((b) => b.endPlace))]];
}

/**
 * What a live view opens with for `patient` on panel spec p: the printed patient starts at the panel's windows and
 * example cells; any other patient at the whole genome with no preset selection.
 */
export function liveStart(p, patient, chromoBins) {
  if (!p) return { patient, kind: "heatmap", domains: wholeGenomeDomains(chromoBins), cells: [], printed: false };
  const printed = `${patient}` === `${p.patient}`;
  const domains = printed ? windowsToDomains(p.windows, chromoBins) : [];
  return {
    patient: `${patient}`,
    kind: p.kind,
    domains: domains.length ? domains : wholeGenomeDomains(chromoBins),
    cells: printed ? p.cells : [],
    printed,
  };
}
