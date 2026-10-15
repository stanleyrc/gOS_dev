## Per-cell germline het-SNP export for gOS (hetsnps.arrow + hetblocks.json), 2026-10-15.
## Real data only: germline het sites = normal_truth truth_class == "germline_het" of the patient's genotyping run;
## per-cell ref/alt counts = observed_count_ref/alt in that run's calls/<NNNNN>_<pair>.calls.tsv.gz.
## Usage: Rscript hetsnps_cell.R <patient> <run_dir> <task> <ntasks> [outroot] [pairs_csv]
suppressMessages({library(data.table); library(arrow); library(jsonlite)})
args <- commandArgs(TRUE)
pat <- args[1]; run <- args[2]; task <- as.integer(args[3]); ntask <- as.integer(args[4])
root <- "/gpfs/commons/groups/imielinski_lab/projects/single_cell_GBM"
outroot <- if (length(args) >= 5 && nzchar(args[5])) args[5] else file.path(root, "analysis/hetsnps/out")
datadir <- "/gpfs/commons/projects/imielinski_web/sclarke/gOS_GBM_sc/data"
CAP_PER_CHR <- 2500L   # display rule: depth >= 2, at most 2500 points per chromosome (even thinning by position)
MIN_DEPTH_DISPLAY <- 2L
MIN_SNP_BLOCK <- 3L

fai <- fread(file.path(root, "data/ref/Homo_sapiens_assembly38.fasta.fai"), select = 1:2, col.names = c("chr", "len"))
fai <- fai[chr %in% paste0("chr", c(1:22, "X", "Y"))]
fai[, off := c(0, head(cumsum(as.numeric(len)), -1))]
chrs <- fai$chr

## truth
tr <- fread(cmd = paste("zcat", file.path(run, "normal_truth.tsv.gz")), select = c("mutation", "seqname", "position", "truth_class"))
het <- tr[truth_class == "germline_het" & seqname %in% chrs]
rm(tr)
setkey(het, mutation)
message(pat, ": ", nrow(het), " germline het sites")

## minor-allele-fraction MLE for phase-agnostic reads (per-SNP phase unknown): mixture 0.5*Bin(a|d,p)+0.5*Bin(a|d,1-p)
grid <- seq(0, 0.5, by = 0.01)
maf_mle <- function(a, d) {
  if (length(d) < 1) return(c(NA_real_, NA_real_, NA_real_))
  ll <- vapply(grid, function(p) sum(log(0.5 * dbinom(a, d, p) + 0.5 * dbinom(a, d, 1 - p) + 1e-300)), 0)
  m <- which.max(ll); ok <- which(ll >= max(ll) - 1.92)
  c(grid[m], grid[min(ok)], grid[max(ok)])
}

files <- list.files(file.path(run, "calls"), pattern = "calls.tsv.gz$", full.names = TRUE)
pairs <- sub("^[0-9]+_", "", sub("\\.calls\\.tsv\\.gz$", "", basename(files)))
if (length(args) >= 6 && nzchar(args[6])) { keep <- pairs %in% strsplit(args[6], ",")[[1]]; files <- files[keep]; pairs <- pairs[keep] }
idx <- seq_along(files); idx <- idx[((idx - 1) %% ntask) + 1 == task]

cdir <- file.path(outroot, pat, "counts"); dir.create(cdir, recursive = TRUE, showWarnings = FALSE)
for (i in idx) {
  pair <- pairs[i]
  celldir <- file.path(datadir, pair)
  if (!file.exists(file.path(celldir, "allelic.json"))) { message("skip (no gOS cell dir): ", pair); next }
  odir <- file.path(outroot, pat, "cells", pair); dir.create(odir, recursive = TRUE, showWarnings = FALSE)
  if (file.exists(file.path(odir, "hetblocks.json"))) { message("done already: ", pair); next }
  cl <- fread(cmd = paste("zcat", files[i]), select = c("mutation", "observed_count_ref", "observed_count_alt"))
  cl <- cl[mutation %chin% het$mutation]
  cl[, depth := observed_count_ref + observed_count_alt]
  cl <- cl[depth >= 1L]
  cl <- merge(cl, het[, .(mutation, seqname, position)], by = "mutation")
  setnames(cl, c("observed_count_ref", "observed_count_alt"), c("ref_count", "alt_count"))
  cl[, chrom := match(seqname, chrs)]
  setorder(cl, chrom, position)
  saveRDS(cl[, .(mutation, ref_count, alt_count)], file.path(cdir, paste0(pair, ".rds")))
  cl[, baf := alt_count / depth]
  n_all <- nrow(cl)

  ## ---- points: depth >= 2, cap per chromosome
  pts <- cl[depth >= MIN_DEPTH_DISPLAY]
  pts[, k := seq_len(.N), by = chrom]
  pts[, nchr := .N, by = chrom]
  pts <- pts[nchr <= CAP_PER_CHR | (k - 1) %% ceiling(nchr / CAP_PER_CHR) == 0]
  pts[, x := fai$off[chrom] + position]
  ## colour by depth: 2, 3-4, 5-9, 10+ (blue ramp, packed 0xRRGGBB like coverage.arrow)
  pal <- c(strtoi("9ECAE1", 16L), strtoi("6BAED6", 16L), strtoi("3182BD", 16L), strtoi("08306B", 16L))
  pts[, color := pal[1 + (depth >= 3) + (depth >= 5) + (depth >= 10)]]
  tab <- data.frame(x = pts$x, y = as.numeric(pts$baf), color = as.numeric(pts$color),
                    chrom = as.integer(pts$chrom), pos = as.integer(pts$position),
                    ref_count = as.integer(pts$ref_count), alt_count = as.integer(pts$alt_count), depth = as.integer(pts$depth))
  write_ipc_file(arrow_table(tab, schema = schema(x = float64(), y = float32(), color = float32(), chrom = int8(), pos = int32(),
                                                   ref_count = int32(), alt_count = int32(), depth = int32())),
                 file.path(odir, "hetsnps.arrow"))

  ## ---- blocks: one per allelic-CN segment from the cell's own allelic.json (red = major, blue = minor)
  al <- fromJSON(file.path(celldir, "allelic.json"))$intervals
  maj <- al[al$metadata$color == "#FF000080", ]; mnr <- al[al$metadata$color == "#0000FF80", ]
  blocks <- NULL
  if (nrow(maj) == nrow(mnr) && nrow(maj) > 0) {
    seg <- data.table(chr = paste0("chr", maj$chromosome), start = maj$startPoint, end = maj$endPoint, major_cn = maj$y, minor_cn = mnr$y)
    seg <- seg[chr %in% chrs]
    rows <- lapply(seq_len(nrow(seg)), function(s) {
      z <- cl[seqname == seg$chr[s] & position >= seg$start[s] & position <= seg$end[s] & depth >= 1L]
      zz <- z[depth >= 2L]
      est <- maf_mle(pmin(zz$alt_count, zz$ref_count), zz$depth)  # a is symmetric under the mixture, so min() is fine
      data.table(chr = seg$chr[s], start = seg$start[s], end = seg$end[s], major_cn = seg$major_cn[s], minor_cn = seg$minor_cn[s],
                 n_snps = nrow(z), n_snps_d2 = nrow(zz), depth = sum(z$depth),
                 mean_abs_dev = if (nrow(zz)) mean(abs(zz$baf - 0.5)) else NA_real_,
                 maf = if (nrow(zz) >= MIN_SNP_BLOCK) est[1] else NA_real_,
                 maf_lo = if (nrow(zz) >= MIN_SNP_BLOCK) est[2] else NA_real_,
                 maf_hi = if (nrow(zz) >= MIN_SNP_BLOCK) est[3] else NA_real_)
    })
    blocks <- rbindlist(rows)
    blocks[, expected_maf := ifelse(major_cn + minor_cn > 0, minor_cn / (major_cn + minor_cn), NA_real_)]
    blocks[, x0 := fai$off[match(chr, chrs)] + start]; blocks[, x1 := fai$off[match(chr, chrs)] + end]
    blocks[, chr := sub("^chr", "", chr)]
  }
  out <- list(pair = pair, source = paste0(pat, " genotyping calls + normal_truth germline_het; ", basename(run)),
              n_sites_total = nrow(het), n_sites_depth1 = n_all, n_points = nrow(tab),
              rules = list(points = paste0("depth>=", MIN_DEPTH_DISPLAY, ", <=", CAP_PER_CHR, " per chromosome (even thinning by position)"),
                           blocks = paste0("per allelic-CN segment (allelic.json); MAF = phase-agnostic mixture MLE over sites with depth>=2, 1.92-LL interval; blank if <", MIN_SNP_BLOCK, " sites")),
              blocks = if (is.null(blocks)) list() else blocks)
  write_json(out, file.path(odir, "hetblocks.json"), auto_unbox = TRUE, digits = 4, na = "null")
  message("wrote ", pair, ": ", n_all, " het obs, ", nrow(tab), " points, ", if (is.null(blocks)) 0 else nrow(blocks), " blocks")
}
