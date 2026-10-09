// TSV export of the Filtered Events table: the rows as currently filtered and
// sorted, the main event fields (only those some row has) and any caller
// columns that define exportValue(record) (e.g. single-cell clade fit).

export const TSV_FIELDS = [
  ["gene", (r) => r.gene],
  ["variant", (r) => r.variant ?? r.Variant],
  ["type", (r) => r.type],
  ["vartype", (r) => r.vartype],
  ["tier", (r) => r.tier ?? r.Tier],
  ["location", (r) => r.Variant_g || r.Genome_Location],
  ["fusion_gene_coords", (r) => r.fusion_gene_coords],
  ["role", (r) => r.role],
  ["effect", (r) => r.effect],
  ["cells", (r) => r.cells],
  ["n_cells", (r) => r.n_cells],
  ["n_normal_cells", (r) => r.n_normal_cells],
  ["cell_fraction", (r) => r.cell_fraction],
  ["VAF", (r) => r.VAF ?? r.vaf],
  ["alt", (r) => r.alt],
  ["ref", (r) => r.ref],
  ["segment_cn", (r) => r.segment_cn],
  ["estimated_altered_copies", (r) => r.estimated_altered_copies],
  ["fusion_cn", (r) => r.fusion_cn],
  ["driver_class", (r) => r.driver_class],
  ["driver_score", (r) => r.driver_score],
  ["driver_evidence", (r) => r.driver_evidence],
  ["sift", (r) => r.sift],
  ["polyphen", (r) => r.polyphen],
  ["cosmic_site", (r) => r.cosmic_site],
  ["cosmic_codon", (r) => r.cosmic_codon],
  ["cgc", (r) => r.cgc],
  ["intogen", (r) => r.intogen],
  ["cohort_patients", (r) => r.cohort_patients],
  ["therapeutics", (r) => r.therapeutics],
  ["resistances", (r) => r.resistances],
  ["diagnoses", (r) => r.diagnoses],
  ["prognoses", (r) => r.prognoses],
  ["variant_summary", (r) => r.variant_summary],
  ["effect_description", (r) => r.effect_description],
  ["gene_summary", (r) => r.gene_summary],
  ["cell_ids", (r) => r.cell_ids],
];

const blank = (v) => v == null || v === "" || (typeof v === "number" && !Number.isFinite(v));

export function tsvCell(v) {
  if (blank(v)) return "";
  if (Array.isArray(v)) return v.map(tsvCell).join(",");
  return `${v}`.replace(/<[^>]+>/g, "").replace(/[\t\r\n]+/g, " ").trim();
}

/** Rows in the table's order: the active column sorter, if any, applied to the records. */
export function sortForExport(records, columns, sortState) {
  const column = (columns || []).find((c) => c.key === sortState?.columnKey);
  const compare = typeof column?.sorter === "function" ? column.sorter : column?.sorter?.compare;
  if (!compare || !sortState?.order) return records;
  const sign = sortState.order === "descend" ? -1 : 1;
  return [...records].sort((a, b) => sign * compare(a, b));
}

/**
 * @param records rows to write
 * @param extraColumns [{ key, exportTitle | title, exportValue(record) }]
 */
export function eventsToTsv(records, extraColumns = []) {
  const rows = records || [];
  const fields = TSV_FIELDS.filter(([, get]) => rows.some((r) => !blank(get(r))));
  const extras = (extraColumns || []).filter((c) => typeof c.exportValue === "function");
  const header = [...fields.map(([name]) => name), ...extras.map((c) => c.exportTitle || (typeof c.title === "string" ? c.title : c.key))];
  const lines = rows.map((r) => [...fields.map(([, get]) => tsvCell(get(r))), ...extras.map((c) => tsvCell(c.exportValue(r)))].join("\t"));
  return [header.join("\t"), ...lines].join("\n") + "\n";
}

export function downloadTsv(text, filename) {
  const blob = new Blob([text], { type: "text/tab-separated-values;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
