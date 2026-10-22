// d3-free helpers for the gene-pin Select shared by the heatmap toolbar and
// the cell-tracks toggle row (both read/write layout.pinnedGenes).

/** Select options from the Genes.optionsList ({label, value}) entries. */
export const geneSelectOptions = (optionsList) =>
  (optionsList || []).filter((o) => o && o.label != null).map((o) => ({ value: o.label, label: o.label }));

/** Case-insensitive prefix match used as the Select filter. */
export const genePrefixMatch = (input, option) =>
  `${option && option.value != null ? option.value : ""}`.toUpperCase().startsWith(`${input || ""}`.toUpperCase());
