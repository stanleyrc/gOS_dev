#!/usr/bin/env Rscript
# Command analysis "de_pseudobulk": cross-patient DE with the patient as the
# replicate. Counts are summed per patient and group, then tested with edgeR
# quasi-likelihood. When a patient contributes cells to both groups the design
# is paired (~ patient + group). Writes result.json in the DE schema.
#
# UNTESTED in the environment it was written in (no R available there).

suppressPackageStartupMessages({
  library(Seurat)
  library(Matrix)
  library(edgeR)
  library(jsonlite)
})

job_dir <- commandArgs(trailingOnly = TRUE)[[1]]
manifest <- fromJSON(file.path(job_dir, "request.json"), simplifyVector = FALSE)
req <- manifest$request
min_cells <- req$params$min_cells

load_counts <- function(patient) {
  folder <- file.path(manifest$data_root, patient)
  rna_manifest <- fromJSON(file.path(folder, "rna", "manifest.json"))
  cells <- fromJSON(file.path(folder, "rna", "cells.json"))$cells
  obj <- readRDS(rna_manifest$source_rds)
  assay <- if (is.null(rna_manifest$assay)) DefaultAssay(obj) else rna_manifest$assay
  counts <- if (inherits(obj[[assay]], "Assay5")) {
    LayerData(JoinLayers(obj[[assay]]), layer = "counts")
  } else {
    GetAssayData(obj, assay = assay, slot = "counts")
  }
  list(counts = counts, cells = cells)
}

columns <- list()
samples <- data.frame(patient = character(), group = character(), n_cells = integer())
cache <- list()
for (side in c("A", "B")) {
  for (entry in req$groups[[side]]) {
    p <- entry$patient
    if (is.null(cache[[p]])) cache[[p]] <- load_counts(p)
    d <- cache[[p]]
    ids <- unlist(entry$cells)
    bc <- ifelse(ids %in% d$cells$cell_id, d$cells$rna_id[match(ids, d$cells$cell_id)],
                 ifelse(ids %in% d$cells$rna_id, ids, NA))
    bc <- intersect(unique(bc[!is.na(bc)]), colnames(d$counts))
    if (length(bc) < min_cells) next
    columns[[paste(p, side, sep = "__")]] <- Matrix::rowSums(d$counts[, bc, drop = FALSE])
    samples <- rbind(samples, data.frame(patient = p, group = side, n_cells = length(bc)))
  }
}
if (sum(samples$group == "A") < 2 || sum(samples$group == "B") < 2) {
  stop("pseudobulk DE needs at least 2 patients per group with enough cells (min_cells)")
}
genes <- Reduce(intersect, lapply(columns, names))
mat <- do.call(cbind, lapply(columns, function(v) v[genes]))

group <- factor(samples$group, levels = c("B", "A"))
paired <- any(table(samples$patient) > 1)
design <- if (paired) model.matrix(~ factor(samples$patient) + group) else model.matrix(~ group)
y <- DGEList(mat, group = group)
keep <- filterByExpr(y, group = group)
y <- calcNormFactors(y[keep, , keep.lib.sizes = FALSE])
y <- estimateDisp(y, design)
fit <- glmQLFit(y, design)
test <- glmQLFTest(fit, coef = "groupA")
tab <- topTags(test, n = Inf)$table
tab$gene <- rownames(tab)

genes_out <- lapply(seq_len(nrow(tab)), function(k) list(
  gene = tab$gene[k], avg_log2FC = tab$logFC[k], logCPM = tab$logCPM[k],
  p_val = tab$PValue[k], p_val_adj = min(1, tab$PValue[k] * nrow(tab)), q_val = tab$FDR[k]
))
result <- list(
  type = "de",
  summary = list(n_a = sum(samples$n_cells[samples$group == "A"]),
                 n_b = sum(samples$n_cells[samples$group == "B"]),
                 n_genes = length(genes), n_tested = nrow(tab),
                 n_significant = sum(tab$FDR < 0.05),
                 patients = unique(samples$patient), paired = paired,
                 samples = samples, warnings = list(),
                 method = "edgeR QL on patient pseudobulk"),
  columns = c("gene", "avg_log2FC", "logCPM", "p_val", "p_val_adj", "q_val"),
  genes = genes_out,
  labels = manifest$labels
)
write_json(result, file.path(job_dir, "result.json"), auto_unbox = TRUE, digits = NA,
           null = "null", dataframe = "rows")
