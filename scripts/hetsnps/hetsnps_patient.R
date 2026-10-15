## Patient-level pseudo-bulk BAF / MAF from the per-cell counts written by hetsnps_cell.R.
## Usage: Rscript hetsnps_patient.R <patient> <run_dir> [outroot]
## Output: <outroot>/<patient>/hetsnps_pseudobulk.json  (all cells + per clone; 1 Mb bins)
suppressMessages({library(data.table); library(jsonlite)})
args <- commandArgs(TRUE); pat <- args[1]; run <- args[2]
root <- "/gpfs/commons/groups/imielinski_lab/projects/single_cell_GBM"
outroot <- if (length(args) >= 3 && nzchar(args[3])) args[3] else file.path(root, "analysis/hetsnps/out")
datadir <- "/gpfs/commons/projects/imielinski_web/sclarke/gOS_GBM_sc/data"
BIN <- 1e6
fai <- fread(file.path(root, "data/ref/Homo_sapiens_assembly38.fasta.fai"), select = 1:2, col.names = c("chr", "len"))
fai <- fai[chr %in% paste0("chr", c(1:22, "X", "Y"))]; fai[, off := c(0, head(cumsum(as.numeric(len)), -1))]
tr <- fread(cmd = paste("zcat", file.path(run, "normal_truth.tsv.gz")), select = c("mutation", "seqname", "position", "truth_class"))
het <- tr[truth_class == "germline_het"][, .(mutation, seqname, position)]; rm(tr)
fs <- list.files(file.path(outroot, pat, "counts"), pattern = "rds$", full.names = TRUE)
cl <- rbindlist(lapply(fs, function(f) {
  pair <- sub("\\.rds$", "", basename(f))
  m <- tryCatch(fromJSON(file.path(datadir, pair, "metadata.json")), error = function(e) NULL)
  clone <- if (!is.null(m) && !is.null(m$clone_id) && !is.na(m$clone_id[1])) as.character(m$clone_id[1]) else "NA"
  d <- readRDS(f); d[, `:=`(pair = pair, clone = clone)]; d
}))
message(pat, ": ", length(fs), " cells, ", nrow(cl), " cell-site observations")
grid <- seq(0, 0.5, by = 0.01)
mle <- function(a, d) {
  ll <- vapply(grid, function(p) sum(log(0.5 * dbinom(a, d, p) + 0.5 * dbinom(a, d, 1 - p) + 1e-300)), 0)
  ok <- which(ll >= max(ll) - 1.92); c(grid[which.max(ll)], grid[min(ok)], grid[max(ok)])
}
summarise <- function(sub) {
  s <- sub[, .(ref = sum(ref_count), alt = sum(alt_count), ncell = uniqueN(pair)), by = mutation]
  s[, depth := ref + alt]; s <- s[depth >= 2]
  s <- merge(s, het, by = "mutation"); s[, ch := match(seqname, fai$chr)]; s[, bin := (position - 1) %/% BIN]
  b <- s[, {e <- if (.N >= 5) mle(pmin(alt, ref), depth) else rep(NA_real_, 3)
            .(n_snps = .N, depth = sum(depth), baf = sum(alt) / sum(depth), maf = e[1], maf_lo = e[2], maf_hi = e[3])}, by = .(ch, bin)]
  setorder(b, ch, bin)
  b[, `:=`(chr = sub("^chr", "", fai$chr[ch]), start = bin * BIN + 1, end = pmin((bin + 1) * BIN, fai$len[ch]))]
  b[, x0 := fai$off[ch] + start]; b[, x1 := fai$off[ch] + end]
  b[, .(chr, start, end, x0, x1, n_snps, depth, baf = round(baf, 4), maf, maf_lo, maf_hi)]
}
res <- list(patient = pat, bin_size = BIN, source = paste0(pat, " genotyping calls + normal_truth germline_het; ", basename(run)),
            rules = "pooled over cells; sites with pooled depth>=2; bins with >=5 such sites get a phase-agnostic mixture MLE of the minor allele fraction (1.92-LL interval); baf = pooled alt/depth (germline-ref/alt orientation, informative within a clone)",
            n_cells = length(fs), groups = list())
res$groups[["all"]] <- list(n_cells = length(fs), bins = summarise(cl))
for (k in sort(unique(cl$clone))) {
  sub <- cl[clone == k]; res$groups[[paste0("clone:", k)]] <- list(n_cells = uniqueN(sub$pair), bins = summarise(sub))
}
write_json(res, file.path(outroot, pat, "hetsnps_pseudobulk.json"), auto_unbox = TRUE, digits = 4, na = "null")
