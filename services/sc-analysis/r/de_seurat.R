#!/usr/bin/env Rscript
# Command analysis "de_seurat": Seurat FindMarkers between groups A and B of
# one patient. Called by the service runner as `Rscript de_seurat.R <job_dir>`;
# reads <job_dir>/request.json and writes <job_dir>/result.json in the same
# schema as the built-in de_wilcoxon analysis.
#
# UNTESTED in the environment it was written in (no R available there).

suppressPackageStartupMessages({
  library(Seurat)
  library(jsonlite)
})

job_dir <- commandArgs(trailingOnly = TRUE)[[1]]
manifest <- fromJSON(file.path(job_dir, "request.json"), simplifyVector = FALSE)
req <- manifest$request
params <- req$params

patients <- unique(unlist(lapply(c(req$groups$A, req$groups$B), function(e) e$patient)))
if (length(patients) != 1) {
  stop("de_seurat compares cells within one patient; use de_pseudobulk across patients")
}
folder <- file.path(manifest$data_root, patients[[1]])
rna_manifest <- fromJSON(file.path(folder, "rna", "manifest.json"))
cells <- fromJSON(file.path(folder, "rna", "cells.json"))$cells

to_barcodes <- function(entries) {
  ids <- unlist(lapply(entries, function(e) unlist(e$cells)))
  hit <- ifelse(ids %in% cells$cell_id, cells$rna_id[match(ids, cells$cell_id)],
                ifelse(ids %in% cells$rna_id, ids, NA))
  unique(hit[!is.na(hit)])
}
cells_a <- to_barcodes(req$groups$A)
cells_b <- to_barcodes(req$groups$B)
if (length(cells_a) < 3 || length(cells_b) < 3) stop("each group needs at least 3 cells with RNA")

obj <- readRDS(rna_manifest$source_rds)
if (!is.null(rna_manifest$assay)) DefaultAssay(obj) <- rna_manifest$assay
res <- FindMarkers(obj, ident.1 = cells_a, ident.2 = cells_b,
                   test.use = params$test_use, min.pct = params$min_pct,
                   logfc.threshold = params$logfc_threshold)
res$gene <- rownames(res)
res$q_val <- p.adjust(res$p_val, method = "BH")
res <- res[order(res$p_val), ]

genes <- lapply(seq_len(nrow(res)), function(k) list(
  gene = res$gene[k], avg_log2FC = res$avg_log2FC[k], pct_1 = res$pct.1[k],
  pct_2 = res$pct.2[k], p_val = res$p_val[k], p_val_adj = res$p_val_adj[k], q_val = res$q_val[k]
))
warnings <- list()
if (min(length(cells_a), length(cells_b)) < 20) {
  warnings <- list("Exploratory: a group has fewer than 20 cells.")
}
result <- list(
  type = "de",
  summary = list(n_a = length(cells_a), n_b = length(cells_b), n_genes = nrow(obj),
                 n_tested = nrow(res), n_significant = sum(res$p_val_adj < 0.05),
                 patients = patients, warnings = warnings,
                 method = paste0("Seurat FindMarkers (", params$test_use, ")")),
  columns = c("gene", "avg_log2FC", "pct_1", "pct_2", "p_val", "p_val_adj", "q_val"),
  genes = genes,
  labels = manifest$labels
)
write_json(result, file.path(job_dir, "result.json"), auto_unbox = TRUE, digits = NA, null = "null")
