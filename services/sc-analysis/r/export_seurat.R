#!/usr/bin/env Rscript
# Pre-analysis export: a patient's Seurat object -> the patient folder's rna/
# layout read by the gOS analysis service (see gos_sc/store.py).
#
# Usage (inside a Seurat Singularity image):
#   Rscript export_seurat.R --rds patient.rds --out /srv/gos/data/SC-PT01 \
#       --datafiles /srv/gos/shared/datafiles.json --patient SC-PT01 \
#       [--assay RNA] [--reduction umap] [--cluster-col seurat_clusters] \
#       [--cell-type-col cell_type] [--meta-cols state,Phase,MES1]
#
# Links RNA cells to gOS cells using datafiles.json: a cell entry
# (entry_type "cell", patient_id = --patient) matches the RNA barcode equal to
# its rna_id, or to its own ID when rna_id is absent.
#
# --meta-cols adds further metadata columns to cells.json (used to colour the
# UMAP in gOS); columns missing from the object are skipped with a warning.
#
# Tested on BWH70 (Seurat 5.1.0, Assay5 RNA with counts/data/scale.data).

suppressPackageStartupMessages({
  library(Seurat)
  library(Matrix)
  library(jsonlite)
})
`%||%` <- function(a, b) if (is.null(a)) b else a

args <- commandArgs(trailingOnly = TRUE)
opt <- list(assay = "RNA", reduction = "umap", `cluster-col` = "seurat_clusters",
            `cell-type-col` = "cell_type", `meta-cols` = "", datafiles = NA, patient = NA)
i <- 1
while (i <= length(args)) {
  key <- sub("^--", "", args[[i]])
  opt[[key]] <- args[[i + 1]]
  i <- i + 2
}
stopifnot(!is.null(opt$rds), !is.null(opt$out))

obj <- readRDS(opt$rds)
assay <- opt$assay
DefaultAssay(obj) <- assay
if (inherits(obj[[assay]], "Assay5")) {
  obj[[assay]] <- JoinLayers(obj[[assay]])
  expr <- LayerData(obj, assay = assay, layer = "data")
} else {
  expr <- GetAssayData(obj, assay = assay, slot = "data")
}
expr <- as(expr, "CsparseMatrix")             # genes x cells
by_gene <- as(t(expr), "CsparseMatrix")       # cells x genes: column-compressed by gene
if (length(by_gene@x) > .Machine$integer.max) stop("too many non-zeros for int32 indptr")

rna_dir <- file.path(opt$out, "rna")
dir.create(rna_dir, recursive = TRUE, showWarnings = FALSE)
write_bin <- function(x, name, what) {
  con <- file(file.path(rna_dir, name), "wb")
  on.exit(close(con))
  if (what == "int") writeBin(as.integer(x), con, size = 4, endian = "little")
  else writeBin(as.numeric(x), con, size = 4, endian = "little")
}
write_bin(by_gene@p, "matrix.indptr.i32", "int")
write_bin(by_gene@i, "matrix.indices.i32", "int")
write_bin(by_gene@x, "matrix.data.f32", "float")
writeLines(rownames(expr), file.path(rna_dir, "genes.tsv"))

barcodes <- colnames(expr)
cell_id <- rep(NA_character_, length(barcodes))
if (!is.na(opt$datafiles)) {
  records <- fromJSON(opt$datafiles, simplifyVector = FALSE)
  for (r in records) {
    if (!identical(tolower(r$entry_type %||% ""), "cell")) next
    if (!is.na(opt$patient) && !identical(as.character(r$patient_id), opt$patient)) next
    id <- as.character(r$pair %||% r$case_id %||% r$id)
    rna <- as.character(r$rna_id %||% id)
    cell_id[barcodes == rna] <- id
  }
}

meta <- obj[[]]
num_or_null <- function(col) if (col %in% colnames(meta)) meta[barcodes, col] else NULL
cells <- data.frame(rna_id = barcodes, cell_id = cell_id, stringsAsFactors = FALSE)
extra <- trimws(strsplit(opt$`meta-cols`, ",")[[1]])
extra <- extra[nzchar(extra)]
absent <- setdiff(extra, colnames(meta))
if (length(absent)) warning("metadata columns not found: ", paste(absent, collapse = ", "))
for (col in unique(c(opt$`cluster-col`, opt$`cell-type-col`, "nCount_RNA", "nFeature_RNA", "percent.mt", extra))) {
  v <- num_or_null(col)
  if (!is.null(v)) cells[[gsub("[^A-Za-z0-9_]", "_", col)]] <- if (is.factor(v)) as.character(v) else v
}
if (opt$reduction %in% Reductions(obj)) {
  emb <- Embeddings(obj, reduction = opt$reduction)[barcodes, 1:2, drop = FALSE]
  cells$umap_1 <- emb[, 1]
  cells$umap_2 <- emb[, 2]
}
write_json(list(cells = cells), file.path(rna_dir, "cells.json"),
           auto_unbox = TRUE, na = "null", digits = NA, dataframe = "rows")

manifest <- list(
  format = "gos-sc-rna/1",
  n_cells = ncol(expr),
  n_genes = nrow(expr),
  n_matched = sum(!is.na(cell_id)),
  normalization = paste0("Seurat ", assay, " data layer"),
  source_rds = normalizePath(opt$rds),
  assay = assay,
  seurat_version = as.character(packageVersion("Seurat")),
  created = format(Sys.time(), "%Y-%m-%dT%H:%M:%S%z")
)
write_json(manifest, file.path(rna_dir, "manifest.json"), auto_unbox = TRUE, pretty = TRUE)
message(sprintf("wrote %d cells x %d genes (%d linked to gOS cells) to %s",
                ncol(expr), nrow(expr), sum(!is.na(cell_id)), rna_dir))
