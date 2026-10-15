Per-cell germline het-SNP exporters for the gOS Cell tracks panel (hetsnps.arrow, hetblocks.json, hetsnps_pseudobulk.json).
hetsnps_cell.R <patient> <run_dir> <task> <ntasks> [outroot] [pairs]; hetsnps_patient.R <patient> <run_dir> [outroot].
Inputs: genotyping run normal_truth.tsv.gz (germline_het) + calls/*.calls.tsv.gz. Test: Rscript test_maf.R
