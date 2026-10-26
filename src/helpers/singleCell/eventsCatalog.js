// One row per event of every type that is exported for a single-cell patient (d3-free). Used by the cohort "Events catalog" view
// and the per-patient Events tab. Sources: filtered.events.json (copy-number, fusions, complex SVs, driver SNVs), the SNV matrix
// sites (coding / driver sites), rna/fusions.json and walks.json. Nothing is invented: a field the export lacks is null.
import { eventClass, eventLabel } from "./cohortStats";
import { eventQuality } from "./eventQuality";

export const CATALOG_TYPES = [
  { key: "amp", label: "Amplification", source: "filtered.events.json" },
  { key: "homdel", label: "Homozygous deletion", source: "filtered.events.json" },
  { key: "cnother", label: "Copy-number event (class not set)", source: "filtered.events.json" },
  { key: "snv", label: "SNV / indel", source: "filtered.events.json + SNV matrix sites" },
  { key: "fusion", label: "Fusion (DNA)", source: "filtered.events.json" },
  { key: "rnafusion", label: "Fusion (RNA)", source: "rna/fusions.json" },
  { key: "complex", label: "Complex SV", source: "filtered.events.json" },
  { key: "ecdna", label: "ecDNA / amplicon walk", source: "walks.json" },
];
export const TYPE_LABEL = Object.fromEntries(CATALOG_TYPES.map((t) => [t.key, t.label]));

/** Event types that no exported file carries, with the reason shown in the legend and the exporter change proposed. */
export const UNAVAILABLE_TYPES = [
  {
    label: "Arm-level and chromosome-level gains / losses",
    reason: "no per-cell arm or segment summary is exported; filtered.events.json lists gene-level amplifications and deletions only",
    proposal: "skilift_dev inst/python/gos_single_cell/: new exporter arm_events.json = [{chrom, arm, state: gain|loss, mean_cn, frac_arm, n_cells, cells: [..]}] per patient, from the per-cell 100 kb copy number (cn_binned_100kb)",
  },
  {
    label: "Individual junctions / SVs (non-complex)",
    reason: "junctions are exported as heatmap layers and inside walks, not as a site list",
    proposal: "skilift_dev sc_* exporter: junctions_table.json = [{chr1, pos1, strand1, chr2, pos2, strand2, type, n_split_reads, n_cells, genes, cells: [..]}] per patient, from the multi-caller junction merge",
  },
  {
    label: "Non-coding SNVs",
    reason: "49k sites per patient are in the SNV matrix; the catalog lists coding and driver sites unless 'Include non-coding SNVs' is on",
    proposal: null,
  },
];

const num = (v) => (v == null || v === "" || v === "None" || !Number.isFinite(Number(v)) ? null : Number(v));
const CODING = /missense|stop_gained|stop_lost|start_lost|frameshift|inframe|splice_(donor|acceptor)|protein_altering|synonymous|initiator/;
export const isCodingConsequence = (c) => CODING.test(`${c || ""}`);
const bare = (c) => `${c ?? ""}`.replace(/^chr/i, "");

/** "chr:pos:ref>alt" from a variant id like chr2_25236935_C_A, or null. */
export function siteKeyOfVariantId(id) {
  const m = /^(?:chr)?([0-9XYM]+)_(\d+)_([ACGT]+)_([ACGT]+)$/i.exec(`${id || ""}`);
  return m ? `${m[1]}:${m[2]}:${m[3]}>${m[4]}` : null;
}
/** Same key from a filtered event of an SNV ("2:177234235-177234235 T>G"). */
export function siteKeyOfEvent(e) {
  const m = /^(?:chr)?([0-9XYM]+):(\d+)-\d+\s+([ACGT]+)>([ACGT]+)$/i.exec(`${e?.Variant_g || ""}`);
  return m ? `${m[1]}:${m[2]}:${m[3]}>${m[4]}` : null;
}

const locusOfEvent = (e) => {
  const chr = bare(e.seqnames);
  if (!chr) return e.Genome_Location || "";
  const s = num(e.start);
  const t = num(e.end);
  return s == null ? chr : t != null && t !== s ? `chr${chr}:${s}-${t}` : `chr${chr}:${s}`;
};

function eventRow(patient, e, i, ctx) {
  const cls = eventClass(e);
  let type = cls === "amp" || cls === "homdel" || cls === "fusion" || cls === "complex" ? cls : cls === "other" && e.type === "SCNA" ? "cnother" : "snv";
  if (cls === "promoter") type = "snv";
  const fraction = num(e.cell_fraction) ?? 0;
  const q = eventQuality(e, cls, { tree: ctx.tree, rnaFusions: ctx.rnaFusions, fraction });
  const tier = num(e.Tier);
  return {
    key: `${patient}|e|${i}`,
    patient,
    type,
    gene: eventLabel(e) || "",
    locus: locusOfEvent(e),
    detail: [e.Variant && e.Variant !== "None" ? e.Variant : e.Variant_g || "", type === "snv" && e.type ? `(${e.type})` : ""].filter(Boolean).join(" "),
    nCells: num(e.n_cells) ?? 0,
    fraction,
    clonality: q.clonality,
    tier: tier != null && tier <= 3 ? tier : null,
    driver: tier != null && tier <= 2,
    clade: q.cladeF1 != null ? `F1 ${q.cladeF1.toFixed(2)}` : null,
    source: "filtered.events.json",
    link: { tab: type === "fusion" || type === "complex" ? 7 : 7, heatmap: type === "snv" ? "snv" : type === "fusion" ? "junctions" : "cn", gene: e.gene && /^[A-Za-z0-9.-]+$/.test(e.gene) ? e.gene : null, location: type === "fusion" || type === "complex" ? null : locusOfEvent(e) },
    event: e,
  };
}

function variantRow(patient, v, nTumour) {
  const alt = num(v.alt_cells) ?? 0;
  const covered = (num(v.alt_in_clade) ?? 0) + (num(v.ref_in_clade) ?? 0) + (num(v.alt_outside_clade) ?? 0) + (num(v.ref_outside_clade) ?? 0);
  const denom = covered || nTumour || 0;
  const m = /^(?:chr)?([0-9XYM]+)_(\d+)_([ACGT]+)_([ACGT]+)$/i.exec(`${v.id || ""}`);
  const gene = `${v.gene || ""}`;
  return {
    key: `${patient}|v|${v.id}`,
    patient,
    type: "snv",
    gene: gene.startsWith("ENSG") ? "" : gene,
    locus: m ? `chr${m[1]}:${m[2]}` : `${v.id}`,
    detail: [m ? `${m[3]}>${m[4]}` : "", v.protein, `${v.consequence || ""}`.replace(/_variant/g, "").replace(/&/g, ", ")].filter(Boolean).join(" "),
    nCells: alt,
    fraction: denom ? alt / denom : 0,
    clonality: v.category === "truncal" ? "clonal" : v.category || null,
    tier: null,
    driver: Boolean(v.driver),
    clade: v.node != null && v.category === "subclonal" ? `node ${v.node} (${num(v.clade_cells) ?? "?"} cells)` : null,
    source: "SNV matrix sites",
    coding: isCodingConsequence(v.consequence),
    link: { tab: 7, heatmap: "snv", gene: gene && !gene.startsWith("ENSG") ? gene : null, location: m ? `chr${m[1]}:${m[2]}` : null },
    variant: v,
  };
}

function rnaFusionRow(patient, f, i, nRna) {
  const cells = num(f.n_cells) ?? 0;
  const tier = num(f.tier);
  return {
    key: `${patient}|r|${i}`,
    patient,
    type: "rnafusion",
    gene: [f.gene1, f.gene2].filter(Boolean).join("::").replace(/\([^)]*\)/g, ""),
    locus: [f.breakpoint1, f.breakpoint2].filter(Boolean).join(" | "),
    detail: [f.type, f.reading_frame && f.reading_frame !== "." ? `frame ${f.reading_frame}` : "", f.confidence].filter(Boolean).join(", "),
    nCells: cells,
    fraction: num(f.cell_fraction) ?? (nRna ? cells / nRna : 0),
    clonality: null,
    tier: tier != null && tier <= 3 ? tier : null,
    driver: tier != null && tier <= 2,
    clade: null,
    source: "rna/fusions.json",
    link: { tab: 8, heatmap: null, gene: null, location: null },
    rnaFusion: f,
  };
}

function walkRow(patient, w, i, nCells) {
  const cells = num(w.ncells) ?? 0;
  const genes = Array.isArray(w.genes) ? w.genes.join(",") : `${w.genes || ""}`;
  const driverGenes = Array.isArray(w.driver_genes) ? w.driver_genes.join(",") : `${w.driver_genes || ""}`;
  return {
    key: `${patient}|w|${w.id ?? i}`,
    patient,
    type: "ecdna",
    gene: driverGenes || genes,
    locus: `${w.coordinates || ""}`.split(";").slice(0, 2).map((c) => `chr${c}`).join("; ") + (`${w.coordinates || ""}`.split(";").length > 2 ? " ..." : ""),
    detail: [w.label, w.circular ? "circular" : "linear", w.span ? `${(w.span / 1e6).toFixed(2)} Mb` : "", num(w.median_cn) != null ? `median CN ${w.median_cn}` : ""].filter(Boolean).join(", "),
    nCells: cells,
    fraction: nCells ? cells / nCells : 0,
    clonality: null,
    tier: null,
    driver: Boolean(driverGenes),
    clade: null,
    source: "walks.json",
    link: { tab: 14, heatmap: null, gene: null, location: null, walk: w.label || null },
    walk: w,
  };
}

/**
 * Rows of one patient. `files` = { events, variants, walks, rnaFusions, tree } (any may be null = file not available).
 * SNV matrix sites are listed when coding or driver (all sites with includeNoncoding); sites already in filtered.events are not repeated.
 */
export function buildPatientRows(patient, files = {}, { includeNoncoding = false } = {}) {
  const rows = [];
  const ctx = { tree: files.tree || null, rnaFusions: files.rnaFusions || null };
  const seen = new Set();
  (files.events || []).forEach((e, i) => {
    const r = eventRow(patient, e, i, ctx);
    rows.push(r);
    if (r.type === "snv") {
      const k = siteKeyOfEvent(e);
      if (k) seen.add(k);
    }
  });
  const variants = files.variants || [];
  const nTumour = variants.length ? Math.max(...variants.slice(0, 200).map((v) => (num(v.alt_in_clade) ?? 0) + (num(v.ref_in_clade) ?? 0) + (num(v.alt_outside_clade) ?? 0) + (num(v.ref_outside_clade) ?? 0))) : 0;
  for (const v of variants) {
    if (!includeNoncoding && !v.driver && !isCodingConsequence(v.consequence)) continue;
    if (!(num(v.alt_cells) > 0)) continue;
    if (seen.has(siteKeyOfVariantId(v.id))) continue;
    rows.push(variantRow(patient, v, nTumour));
  }
  const nRna = num(files.nRnaCells);
  (files.rnaFusions || []).forEach((f, i) => rows.push(rnaFusionRow(patient, f, i, nRna)));
  const nWalkCells = num(files.walks?.n_cells) ?? (Array.isArray(files.walks?.cells) ? files.walks.cells.length : null);
  (files.walks?.walks || []).forEach((w, i) => rows.push(walkRow(patient, w, i, nWalkCells)));
  return rows;
}

/** Non-coding sites left out of the rows of a patient (for the legend). */
export function countOmittedNoncoding(files = {}, includeNoncoding = false) {
  if (includeNoncoding) return 0;
  return (files.variants || []).filter((v) => !v.driver && !isCodingConsequence(v.consequence) && num(v.alt_cells) > 0).length;
}

/** Event types with no source file for this patient (data missing): [{ type, reason }]. */
export function missingSources(files = {}) {
  const out = [];
  if (!files.events) out.push({ type: "amp / homdel / fusion (DNA) / complex SV / driver SNVs", reason: "filtered.events.json not available" });
  if (!files.variants) out.push({ type: "SNV sites", reason: "SNV matrix (snv_variants.json) not available" });
  if (!files.rnaFusions) out.push({ type: "Fusion (RNA)", reason: "rna/fusions.json not available" });
  if (!files.walks) out.push({ type: "ecDNA / amplicon walk", reason: "walks.json not available" });
  return out;
}

export const emptyCatalogFilters = () => ({ query: "", types: [], minCells: 0, driverOnly: false, clonality: [] });

/** Filter rows: text over patient / type / gene / locus / detail, type multi-select, min carrier cells, driver-only. */
export function filterCatalogRows(rows, f = emptyCatalogFilters()) {
  const terms = `${f.query || ""}`.toUpperCase().split(/\s+/).filter(Boolean);
  const types = f.types?.length ? new Set(f.types) : null;
  const clon = f.clonality?.length ? new Set(f.clonality) : null;
  const min = Number(f.minCells) || 0;
  return rows.filter((r) => {
    if (types && !types.has(r.type)) return false;
    if (min && r.nCells < min) return false;
    if (f.driverOnly && !r.driver) return false;
    if (clon && !clon.has(r.clonality)) return false;
    if (terms.length) {
      const hay = `${r.patient} ${TYPE_LABEL[r.type] || r.type} ${r.gene} ${r.locus} ${r.detail}`.toUpperCase();
      if (!terms.every((t) => hay.includes(t))) return false;
    }
    return true;
  });
}

const SORT_VALUE = {
  type: (r) => TYPE_LABEL[r.type] || r.type,
  tier: (r) => (r.tier == null ? 99 : r.tier),
  driver: (r) => (r.driver ? 1 : 0),
};
/** Stable sort by column key and direction ("asc" | "desc"); missing values go last. */
export function sortCatalogRows(rows, key = "nCells", dir = "desc") {
  const val = SORT_VALUE[key] || ((r) => r[key]);
  const sign = dir === "asc" ? 1 : -1;
  return rows
    .map((r, i) => [r, i])
    .sort(([a, i], [b, j]) => {
      const x = val(a);
      const y = val(b);
      const xm = x == null || x === "";
      const ym = y == null || y === "";
      if (xm || ym) return xm && ym ? i - j : xm ? 1 : -1;
      const c = typeof x === "number" && typeof y === "number" ? x - y : `${x}`.localeCompare(`${y}`, undefined, { numeric: true });
      return c ? sign * c : i - j;
    })
    .map(([r]) => r);
}

export const CSV_COLUMNS = [
  ["patient", "patient"],
  ["type", "type"],
  ["gene", "gene"],
  ["locus", "locus"],
  ["detail", "detail"],
  ["nCells", "n_cells"],
  ["fraction", "cell_fraction"],
  ["clonality", "clonality"],
  ["tier", "driver_tier"],
  ["driver", "driver"],
  ["clade", "clade"],
  ["source", "source_file"],
];
const csvCell = (v) => {
  if (v == null) return "";
  const s = `${v}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** CSV text of the rows (header + one line per row). */
export function catalogToCsv(rows) {
  const lines = [CSV_COLUMNS.map(([, h]) => h).join(",")];
  rows.forEach((r) => {
    lines.push(
      CSV_COLUMNS.map(([k]) => {
        if (k === "type") return csvCell(TYPE_LABEL[r.type] || r.type);
        if (k === "fraction") return csvCell(Number.isFinite(r.fraction) ? Math.round(r.fraction * 1e4) / 1e4 : "");
        if (k === "driver") return csvCell(r.driver ? "yes" : "no");
        return csvCell(r[k]);
      }).join(",")
    );
  });
  return lines.join("\n") + "\n";
}

/** Query string that opens the row's event in the matching tab of its patient report. */
export function catalogLinkQuery(row, { dataset = "gbm-sc" } = {}) {
  const p = new URLSearchParams();
  p.set("dataset", dataset);
  p.set("report", row.patient);
  const l = row.link || {};
  p.set("tab", `${l.tab ?? 7}`);
  if (l.heatmap) p.set("heatmap", l.heatmap);
  if (l.walk) p.set("walk", l.walk);
  if (l.location && l.tab === 7) p.set("location", l.gene || l.location);
  return p.toString();
}

/** Counts per type of the given rows, in CATALOG_TYPES order. */
export function countsByType(rows) {
  const c = {};
  rows.forEach((r) => (c[r.type] = (c[r.type] || 0) + 1));
  return CATALOG_TYPES.map((t) => ({ ...t, count: c[t.key] || 0 }));
}
