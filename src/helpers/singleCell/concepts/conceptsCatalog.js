// Guide > Concepts: the menu of interactive explainers, their references and deep links to real results, and the
// reader of the Figure 2 Moran's I table. d3-free.

/** Built explainers first, then proposed ones (ranked by value). */
export const CONCEPTS = [
  {
    id: "balance",
    title: "Junction balance",
    status: "built",
    blurb: "Copy number has to be conserved where segments meet: junctions explain the copy-number steps.",
    refs: [
      { text: "Hadi K, Yao X, Behr JM, et al. Distinct classes of complex structural variation uncovered across thousands of cancer genome graphs. Cell 2020;183:197-210.", href: "https://doi.org/10.1016/j.cell.2020.08.006" },
    ],
  },
  {
    id: "joint",
    title: "Joint junction balance across cells",
    status: "built",
    blurb: "New in this paper: one shared segmentation for all cells, with breakpoints at the junction breakends.",
    refs: [
      { text: "Dewhurst SM, Yao X, Rosiene J, et al. Structural variant evolution after telomere crisis. Cancer Discov 2021;11(5):1064-1081 (disjoint segmentation of many samples)", href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC8027843/" },
      { text: "Hadi K, et al. Cell 2020 (JaBbA).", href: "https://doi.org/10.1016/j.cell.2020.08.006" },
    ],
  },
  {
    id: "path",
    title: "PATH: heritability and state transitions",
    status: "built",
    blurb: "Do related cells share a state? Moran's I on the tree, a permutation null, and transition estimates.",
    refs: [
      { text: "Schiffman JS, D'Avino AR, Prieto T, et al. Defining heritability, plasticity, and transition dynamics of cellular phenotypes in somatic evolution. Nat Genet 2024.", href: "https://doi.org/10.1038/s41588-024-01920-6" },
      { text: "PATH R package (landau-lab/PATH).", href: "https://github.com/landau-lab/PATH" },
      { text: "Moran PAP. Notes on continuous stochastic phenomena. Biometrika 1950;37:17-23.", href: "https://doi.org/10.2307/2332142" },
    ],
  },
  { id: "walks", title: "Walk decomposition of ecDNA, and integrated vs free copy noise", status: "proposed", blurb: "How a balanced graph is read out as circular walks, and why free ecDNA copies vary more from cell to cell than integrated ones." },
  { id: "snvsig", title: "Per-SNV signature assignment; why singletons are noisy", status: "proposed", blurb: "Posterior signature of each SNV, and how few-cell sites mix PTA artefacts into the spectra (ties in to the signature versions)." },
  { id: "phylo", title: "Trees from PTA SNVs", status: "proposed", blurb: "Allelic dropout, site filtering, CellPhy and bootstrap support on a toy matrix." },
  { id: "convergent", title: "Convergent copy-number events", status: "proposed", blurb: "Two independent origins of the same event on one tree, and how to tell them from one origin plus loss." },
  { id: "cnmapped", title: "Copy-number-mapped SNVs (timing)", status: "proposed", blurb: "SNVs on 1 vs 2 copies of a gained segment date the gain." },
];

/** Cohort deep link: ?dataset=<ds>&scview=<view>. */
export function cohortHref(view, base = "", dataset = "gbm-sc") {
  return `${base}?dataset=${encodeURIComponent(dataset)}&scview=${encodeURIComponent(view)}`;
}

/** Concepts deep link: ?dataset=<ds>&scview=concepts&concept=<id>. */
export const conceptHref = (id, base = "", dataset = "gbm-sc") => `${cohortHref("concepts", base, dataset)}&concept=${encodeURIComponent(id)}`;

/** Patient deep link: ?dataset=<ds>&report=<P>&tab=<n>[&extra]. */
export function patientHref(patient, tab, extra = {}, base = "", dataset = "gbm-sc") {
  const q = new URLSearchParams({ dataset, report: patient, tab: `${tab}`, ...extra });
  return `${base}?${q.toString()}`;
}

export const FIG2_MORAN_FILE = "fig2_moran_I_by_patient_state.tsv";

/** Tab-separated text with a header row -> array of objects (numbers parsed where the whole field is numeric). */
export function parseTsv(text) {
  if (typeof text !== "string" || !text.trim()) return [];
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.length);
  const head = lines[0].split("\t");
  return lines.slice(1).map((l) => {
    const f = l.split("\t");
    return Object.fromEntries(head.map((h, i) => {
      const v = f[i] ?? "";
      return [h, v !== "" && v !== "NA" && Number.isFinite(Number(v)) ? Number(v) : v === "NA" ? null : v];
    }));
  });
}

/**
 * Figure 2 Moran's I table (patient, src, state, I, Z, n; src = "Jake tree" | "New tree") -> { ok, patients, states,
 * sources, get(patient, state, src) }; { ok: false, reason } when the rows are missing or malformed.
 */
export function fig2Moran(rows) {
  const need = ["patient", "src", "state", "I", "Z"];
  if (!Array.isArray(rows) || !rows.length) return { ok: false, reason: "Figure 2 Moran's I table not exported to gOS" };
  if (!need.every((k) => k in rows[0])) return { ok: false, reason: `Figure 2 table lacks columns ${need.filter((k) => !(k in rows[0])).join(", ")}` };
  const uniq = (k) => Array.from(new Set(rows.map((r) => r[k])));
  const map = new Map(rows.map((r) => [`${r.patient}|${r.state}|${r.src}`, r]));
  return { ok: true, patients: uniq("patient"), states: uniq("state"), sources: uniq("src"), get: (p, s, src) => map.get(`${p}|${s}|${src}`) || null };
}
