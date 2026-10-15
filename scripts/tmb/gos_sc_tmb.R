#!/usr/bin/env Rscript
## gos_sc_tmb.R: tumour mutational burden (TMB, mutations per callable Mb) per cell, clade and patient.
##
## usage: Rscript gos_sc_tmb.R   (env: DATA=<gOS data root>, DEPTH=<dir of <cell>.depth_counts.tsv>, OUT=<output root>,
##        PATIENTS=BWH69,BWH70,..., MIN_DEPTH=4, ALT_DEPTHS=3,5)
## writes OUT/<P>/tmb.json and OUT/_cohort/tmb.json (format gos-sc-tmb/1).
##
## Callable bases (per cell): mosdepth (fast-mode, MAPQ >= 20; default flag filter drops unmapped / secondary / QC-fail /
## duplicate reads) on the cell's CRAM, restricted to the patient's *diploid autosomal territory* = the autosomal non-N
## hg38 bases in 100 kb windows where >= half of the candidate sites pass the site filter's diploid_fraction >= 0.80 rule
## (total CN 2 in >= 80% of tumour cells). Callable bases = territory bases with depth >= MIN_DEPTH (files from
## analysis/tmb/scripts/depth_task.sh).
##
## Per-cell TMB: somatic SNVs called (alt genotype) in the cell at tree sites (cellphy_input == TRUE) with cell depth >=
## MIN_DEPTH, divided by that cell's callable Mb. Allelic dropout: sensitivity s_c = alt calls / covered sites among the
## cell's *truncal* sites (present in every tumour cell); corrected TMB = raw / s_c.
## Patient / clade TMB: site counts divided by territory Mb x discovery power. A candidate site must show alt reads in
## >= 2 cells, so for a group of k cells with per-cell coverage f_c (and per-cell detection f_c * s_c) the power is
## P(>= 2 of the k cells covered) (raw, "callable") or P(>= 2 detect) (corrected). Cell-private sites cannot be
## discovered this way: private TMB is the per-cell value (a lower bound).
suppressMessages({library(data.table); library(jsonlite)})

env = function(k, d) { v = Sys.getenv(k, ""); if (nzchar(v)) v else d }
DATA = env("DATA", "/gpfs/commons/projects/imielinski_web/sclarke/gOS_GBM_sc/data")
DEPTH = env("DEPTH", "/gpfs/commons/groups/imielinski_lab/projects/single_cell_GBM/analysis/tmb/out/depth")
OUT = env("OUT", "/gpfs/commons/groups/imielinski_lab/projects/single_cell_GBM/analysis/tmb/out/export")
PATIENTS = strsplit(env("PATIENTS", "BWH69,BWH70,MGH302,MGH303,MGH304,MGH305"), ",")[[1]]
MIN_DEPTH = as.integer(env("MIN_DEPTH", "4")); ALT_DEPTHS = setdiff(as.integer(strsplit(env("ALT_DEPTHS", "3,5"), ",")[[1]]), MIN_DEPTH)
DENOM = env("DENOM", "auto")   # mosdepth | sites | auto: callable fraction from the CRAM (mosdepth) or from truncal-site coverage
TERR = fread(env("TERRITORY", "/gpfs/commons/groups/imielinski_lab/projects/single_cell_GBM/analysis/tmb/out/territory_summary.tsv"))
NOISY = list(BWH69 = "BWH69 SNV calls are noisy (many single-cell-private sites); treat its TMB as an upper-bound mixture of real mutations and artefacts.")
PROV = "territory_bp, depth-threshold counts: mosdepth on the cell CRAM (analysis/tmb/scripts/depth_task.sh)"

## P(at least m successes) for independent Bernoulli(p_i): dynamic programme
pb_atleast = function(p, m = 2L) {
  if (length(p) < m) return(0)
  d = c(1, rep(0, m))                    # d[j+1] = P(exactly j successes), last cell lumps >= m
  for (pi in p) { nd = d * (1 - pi); nd[-1] = nd[-1] + d[-length(d)] * pi; nd[m + 1] = nd[m + 1] + d[m + 1] * pi; d = nd }
  d[m + 1]
}
med = function(x) if (any(is.finite(x))) median(x[is.finite(x)]) else NA_real_
r = function(x, k = 4) ifelse(is.finite(x), round(x, k), NA_real_)

cell_depth = function(cell, thr) {
  f = file.path(DEPTH, paste0(cell, ".depth_counts.tsv"))
  if (!file.exists(f)) return(NULL)
  x = fread(f); col = paste0(thr, "X")
  if (!col %in% names(x)) return(NULL)
  list(territory_bp = x$territory_bp[1], callable_bp = x[[col]][1])
}

one_patient = function(P) {
  pd = file.path(DATA, P)
  sm = fromJSON(file.path(pd, "snv_matrix.json"), simplifyVector = TRUE)
  var = as.data.table(sm$variants); var[, idx := .I - 1L]
  keep = var$cellphy_input %in% TRUE & var$category %in% c("truncal", "subclonal", "private")
  qcf = file.path(pd, "precompute", "qc.json")
  qc = if (file.exists(qcf)) as.data.table(fromJSON(qcf)$cells)[, .(cell_id, clone_id)] else data.table(cell_id = character(), clone_id = character())
  clone_of = function(cn) {
    i = match(cn, qc$cell_id); if (!is.na(i)) return(qc$clone_id[i])
    mf = file.path(DATA, cn, "metadata.json")
    if (file.exists(mf)) { m = fromJSON(mf); m = if (is.data.frame(m)) m[1, ] else m; if (!is.null(m$clone_id)) return(as.character(m$clone_id)) }
    NA_character_
  }
  cells = names(sm$cells)
  clone = vapply(cells, clone_of, "")
  tumor = !is.na(clone) & clone != "Normal"
  has_gt = any(vapply(sm$cells[seq_len(min(5, length(cells)))], function(m) !is.null(dim(m)) && ncol(m) >= 4, TRUE))
  cat(P, ": ", length(cells), " cells, ", sum(tumor), " tumour, genotype column ", has_gt, "\n", sep = "")
  cat_of = var$category; cat_of[!keep] = NA
  kk = var$clade_cells; kk[is.na(kk)] = 0

  rows = list()
  for (j in which(tumor)) {
    cn = cells[j]; m = sm$cells[[cn]]
    if (is.null(dim(m))) next
    i = m[, 1] + 1L
    dep = m[, 2] + m[, 3]
    alt = if (has_gt) m[, 4] %in% 1 else (!is.na(m[, 3]) & m[, 3] >= 2)
    ct = cat_of[i]
    res = list(cell_id = cn, clone_id = clone[j])
    for (thr in c(MIN_DEPTH, ALT_DEPTHS)) {
      ok = !is.na(dep) & dep >= thr & !is.na(ct)
      tr = ok & ct %in% "truncal"
      n_tr_cov = sum(tr); n_tr_alt = sum(tr & alt)
      cd = cell_depth(cn, thr)
      s = if (n_tr_cov >= 50) n_tr_alt / n_tr_cov else NA_real_
      pre = if (thr == MIN_DEPTH) "" else paste0("d", thr, "_")
      res[[paste0(pre, "callable_mb")]] = if (is.null(cd)) NA_real_ else cd$callable_bp / 1e6
      res[[paste0(pre, "callable_frac")]] = if (is.null(cd)) NA_real_ else cd$callable_bp / cd$territory_bp
      res[[paste0(pre, "callable_frac_sites")]] = n_tr_cov / max(1, sum(cat_of %in% "truncal"))
      res[[paste0(pre, "n_alt")]] = sum(ok & alt)
      res[[paste0(pre, "n_truncal_alt")]] = n_tr_alt; res[[paste0(pre, "n_truncal_covered")]] = n_tr_cov
      res[[paste0(pre, "n_subclonal_alt")]] = sum(ok & alt & ct %in% "subclonal")
      res[[paste0(pre, "n_private_alt")]] = sum(ok & alt & ct %in% "private")
      res[[paste0(pre, "sensitivity")]] = s
    }
    res$territory_mb = TERR[patient == P, territory_bp] / 1e6
    rows[[length(rows) + 1]] = res
  }
  cd = rbindlist(rows, fill = TRUE)
  ## callable-fraction source: CRAM depth (mosdepth) when every tumour cell has it, else coverage of the truncal sites
  cd[, callable_frac_md := callable_frac]
  n_md = sum(is.finite(cd$callable_frac))
  src = if (DENOM == "mosdepth" || (DENOM == "auto" && n_md >= 0.98 * nrow(cd))) "mosdepth" else "truncal_sites"
  cat(P, ": callable fraction from", src, "(mosdepth cells:", n_md, "of", nrow(cd), ")\n")
  if (src == "truncal_sites") for (pre in c("", paste0("d", ALT_DEPTHS, "_"))) {
    cd[[paste0(pre, "callable_frac")]] = cd[[paste0(pre, "callable_frac_sites")]]
    cd[[paste0(pre, "callable_mb")]] = cd[[paste0(pre, "callable_frac_sites")]] * cd$territory_mb
  }
  agree = cd[is.finite(callable_frac_md) & is.finite(callable_frac_sites)]
  agreement = if (nrow(agree) >= 3) list(n_cells = nrow(agree), pearson = r(cor(agree$callable_frac_md, agree$callable_frac_sites)), median_ratio_sites_over_mosdepth = r(median(agree$callable_frac_sites / agree$callable_frac_md))) else NULL
  for (pre in c("", paste0("d", ALT_DEPTHS, "_"))) {
    cm = cd[[paste0(pre, "callable_mb")]]; s = cd[[paste0(pre, "sensitivity")]]
    cd[[paste0(pre, "tmb_raw")]] = cd[[paste0(pre, "n_alt")]] / cm
    cd[[paste0(pre, "tmb_corrected")]] = cd[[paste0(pre, "n_alt")]] / (cm * s)
    cd[[paste0(pre, "tmb_truncal")]] = cd[[paste0(pre, "n_truncal_alt")]] / cm
    cd[[paste0(pre, "tmb_subclonal")]] = cd[[paste0(pre, "n_subclonal_alt")]] / cm
    cd[[paste0(pre, "tmb_private")]] = cd[[paste0(pre, "n_private_alt")]] / cm
  }
  cd = cd[is.finite(callable_mb)]
  fm = setNames(cd$callable_frac, cd$cell_id); sm_ = setNames(cd$sensitivity, cd$cell_id)
  sbar = med(cd$sensitivity); fbar = med(cd$callable_frac)
  terr = med(cd$territory_mb)

  ## ---- patient-level classes ----
  nT = nrow(cd)
  cnt = table(factor(cat_of[keep], levels = c("truncal", "subclonal", "private")))
  pcov = function(k) pb_atleast(rep(fbar, k)); pdet = function(k) pb_atleast(rep(fbar * sbar, k))
  cls = function(cat_) {
    ksz = kk[keep & cat_of %in% cat_]; ksz = pmin(ksz, nT)
    if (!length(ksz)) return(NULL)
    if (cat_ == "truncal") ksz = rep(nT, length(ksz))
    uk = unique(ksz); cov_ = setNames(vapply(uk, pcov, 0), uk); det_ = setNames(vapply(uk, pdet, 0), uk)
    pc = mean(cov_[as.character(ksz)]); pdt = mean(det_[as.character(ksz)])
    list(n_sites = length(ksz), median_clade_cells = med(ksz), callable_mb = terr * pc, discovery_power_callable = pc, discovery_power_detect = pdt,
         tmb_raw = length(ksz) / (terr * pc), tmb_corrected = length(ksz) / (terr * pdt))
  }
  tr = cls("truncal"); sb = cls("subclonal")
  pv = list(n_sites = as.integer(cnt["private"]), note = "lower bound: a site needs alt reads in >= 2 cells to enter the candidate set, so cell-private mutations are under-counted; per-cell median shown",
            tmb_raw = med(cd$tmb_private), tmb_corrected = med(cd$n_private_alt / (cd$callable_mb * cd$sensitivity)))
  patient = list(n_tumor_cells = nT, territory_mb = r(terr, 1), median_callable_frac = r(fbar), median_sensitivity = r(sbar),
                 sensitivity_range = r(range(cd$sensitivity, na.rm = TRUE)),
                 truncal = lapply(tr, function(v) if (is.numeric(v)) r(v) else v), subclonal = lapply(sb, function(v) if (is.numeric(v)) r(v) else v),
                 private = lapply(pv, function(v) if (is.numeric(v)) r(v) else v),
                 cell_tmb_raw = list(median = r(med(cd$tmb_raw)), min = r(min(cd$tmb_raw, na.rm = TRUE)), max = r(max(cd$tmb_raw, na.rm = TRUE))),
                 cell_tmb_corrected = list(median = r(med(cd$tmb_corrected)), min = r(min(cd$tmb_corrected, na.rm = TRUE)), max = r(max(cd$tmb_corrected, na.rm = TRUE))),
                 depth_sensitivity = lapply(setNames(ALT_DEPTHS, paste0("min_depth_", ALT_DEPTHS)), function(th) { pre = paste0("d", th, "_"); list(min_depth = th, median_callable_frac = r(med(cd[[paste0(pre, "callable_frac")]])), median_sensitivity = r(med(cd[[paste0(pre, "sensitivity")]])), cell_tmb_raw_median = r(med(cd[[paste0(pre, "tmb_raw")]])), cell_tmb_corrected_median = r(med(cd[[paste0(pre, "tmb_corrected")]]))) }))

  ## ---- clades ----
  cl = list()
  cf = file.path(pd, "clades.json")
  if (file.exists(cf)) {
    cj = fromJSON(cf, simplifyVector = FALSE)
    for (c in cj$clades) {
      cells_c = intersect(unlist(c$cells), cd$cell_id)
      if (length(cells_c) < 2 || is.null(c$n_private_snv)) next
      f = fm[cells_c]; s = sm_[cells_c]; s[!is.finite(s)] = sbar
      pc = pb_atleast(f); pdt = pb_atleast(f * s)
      n = c$n_private_snv
      cl[[length(cl) + 1]] = list(id = c$id, n_cells = length(cells_c), clone_id = c$clone_id, n_private_snv = n,
        callable_mb = r(terr * pc), discovery_power_callable = r(pc), discovery_power_detect = r(pdt),
        tmb_raw = r(n / (terr * pc)), tmb_corrected = r(n / (terr * pdt)),
        burden_per_1000_sites = if (is.null(c$mutation_burden)) NULL else c$mutation_burden, is_trunk = isTRUE(c$is_trunk))
    }
  }

  cells_out = lapply(seq_len(nrow(cd)), function(i) {
    x = as.list(cd[i]); lapply(x, function(v) if (is.numeric(v)) r(v, 4) else v)
  })
  list(patient = P, out = list(format = "gos-sc-tmb/1", patient = P, created = format(Sys.time(), "%Y-%m-%dT%H:%M:%S"),
    params = list(min_depth = MIN_DEPTH, alt_min_depths = as.list(ALT_DEPTHS), mapq = 20L, callable_source = src, mosdepth_vs_truncal_site_coverage = agreement, territory = "diploid autosomal territory (see method)",
                  sites = "tree sites (cellphy_input), categories from the CellPhy mutation map"),
    method = paste("Callable Mb = bases with depth >=", MIN_DEPTH, "(MAPQ >= 20, no dup/secondary/QC-fail) in the patient's diploid autosomal territory (CN 2 in >= 80% of tumour cells, hg38 non-N), from the cell CRAM. Per-cell TMB = alt calls at tree sites with depth >=", MIN_DEPTH, "/ callable Mb. Sensitivity = alt calls / covered sites among truncal sites; corrected = raw / sensitivity. Patient and clade TMB divide site counts by territory Mb x discovery power (a site needs alt reads in >= 2 cells)."),
    caveats = c(if (!is.null(NOISY[[P]])) NOISY[[P]], if (!has_gt) "No genotype column in snv_matrix: alt call = >= 2 alt reads.", "Private TMB is a lower bound (cell-private sites are not in the candidate set).", "Sensitivity is estimated on truncal sites, which are easier to discover than subclonal ones."),
    noisy = !is.null(NOISY[[P]]), provenance = PROV, patient_summary = patient, clades = cl, cells = cells_out))
}

dir.create(file.path(OUT, "_cohort"), recursive = TRUE, showWarnings = FALSE)
coh = list()
for (P in PATIENTS) {
  res = tryCatch(one_patient(P), error = function(e) { message(P, ": ", conditionMessage(e)); NULL })
  if (is.null(res)) next
  dir.create(file.path(OUT, P), showWarnings = FALSE)
  write_json(res$out, file.path(OUT, P, "tmb.json"), auto_unbox = TRUE, na = "null", digits = NA, null = "null")
  ## cohort: per-cell arrays are compact (id, raw, corrected, callable_mb, sensitivity)
  o = res$out
  coh[[P]] = list(patient = P, noisy = o$noisy, caveats = o$caveats, patient_summary = o$patient_summary,
                  cells = lapply(o$cells, function(c) c[c("cell_id", "clone_id", "n_alt", "callable_mb", "sensitivity", "tmb_raw", "tmb_corrected")]),
                  clades = o$clades)
}
write_json(list(format = "gos-sc-tmb-cohort/1", created = format(Sys.time(), "%Y-%m-%dT%H:%M:%S"), method = "see per-patient method",
                params = list(min_depth = MIN_DEPTH, alt_min_depths = as.list(ALT_DEPTHS)), patients = unname(coh)),
           file.path(OUT, "_cohort", "tmb.json"), auto_unbox = TRUE, na = "null", digits = NA, null = "null")
cat("wrote", OUT, "\n")
