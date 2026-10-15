# TMB exporter (callable-Mb tumour mutational burden)
Order: cell_table.R (cell -> CRAM table) -> mk_bed.py (autosome non-N BED) -> territory.R (per-patient diploid territory BED)
-> depth_worker.sh / depth_task2.sh (sbatch; mosdepth per cell, validation/denominator) -> gos_sc_tmb.R (writes <P>/tmb.json, _cohort/tmb.json)
-> fill_clades.py (burden_per_mb in clades.json). Paths are set by env/defaults inside each script; outputs stage under analysis/tmb/out.
