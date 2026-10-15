## Per-patient diploid callable territory: genome in 100 kb windows; a window is in the territory if >=50% of the
## candidate sites inside it pass the site-filter's diploid_fraction >= 0.80 rule (allelic_total_cn == 2 in >=80% of tumor cells);
## empty windows inherit the nearest non-empty window on the same chromosome. Intersected with autosome non-N bases.
suppressMessages({library(data.table)})
man = fread("/gpfs/commons/groups/imielinski_lab/projects/single_cell_GBM/analysis/site_filter/patient_manifest.tsv")
W = 1e5; nonN = fread("out/autosome_nonN.bed", col.names = c("chr","s","e"))
fai = fread("/gpfs/commons/groups/imielinski_lab/projects/single_cell_GBM/data/ref/Homo_sapiens_assembly38.fasta.fai")[V1 %in% paste0("chr",1:22), .(chr=V1, len=V2)]
res = list()
for (p in c("BWH69","BWH70","MGH302","MGH303","MGH304","MGH305")) {
  f = man[patient == p, site_candidates]
  s = fread(f, select = c("seqname","position","diploid_fraction","tumor_cells_total"))
  s = s[seqname %in% fai$chr & is.finite(diploid_fraction)]
  s[, w := (position - 1) %/% W]
  b = s[, .(n = .N, frac = mean(diploid_fraction >= 0.8)), by = .(chr = seqname, w)]
  allw = fai[, .(w = 0:((len - 1) %/% W)), by = chr]
  b = merge(allw, b, by = c("chr","w"), all.x = TRUE)
  b[, dip := frac >= 0.5]
  nearest = function(x) { ok = which(!is.na(x)); if (!length(ok)) return(rep(FALSE, length(x))); if (length(ok) == 1L) return(rep(x[ok], length(x))); x[ok[pmax(1L, pmin(length(ok), round(approx(ok, seq_along(ok), xout = seq_along(x), rule = 2, ties = "ordered")$y)))]] }
  setorder(b, chr, w); b[, dip := nearest(dip), by = chr]
  setorder(b, chr, w)
  d = b[dip == TRUE, .(chr, s = w * W, e = pmin((w + 1) * W, fai$len[match(chr, fai$chr)]))]
  ## intersect with non-N via foverlaps
  setkey(nonN, chr, s, e); setkey(d, chr, s, e)
  ov = foverlaps(d, nonN, type = "any", nomatch = NULL)
  ov = ov[, .(chr, s = pmax(s, i.s), e = pmin(e, i.e))][e > s]
  ## merge adjacent
  setorder(ov, chr, s); ov[, g := cumsum(c(TRUE, s[-1] != e[-.N] | chr[-1] != chr[-.N]))]
  ov = ov[, .(chr = chr[1], s = min(s), e = max(e)), by = g][, g := NULL]
  fwrite(ov, sprintf("out/territory_%s.bed", p), sep = "\t", col.names = FALSE, scipen = 100)
  chrfrac = b[, .(frac = mean(dip)), by = chr]
  cat(p, "sites", nrow(s), "territory Mb", round(ov[, sum(e - s)] / 1e6, 1), " of autosomal nonN ", round(nonN[, sum(e - s)] / 1e6, 1), "\n")
  cat("  chr diploid frac:", paste0(sub("chr", "", chrfrac$chr), "=", round(chrfrac$frac, 2), collapse = " "), "\n")
  res[[p]] = data.table(patient = p, territory_bp = ov[, sum(e - s)])
}
fwrite(rbindlist(res), "out/territory_summary.tsv", sep = "\t")
