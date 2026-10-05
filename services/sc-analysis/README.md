# gOS single-cell analysis service

The analysis back end gOS calls from the Single-Cell tab. Pick two groups of cells, choose an analysis, and the result (volcano plot, gene table, enrichment) comes back into the app. It is plain Python 3 with no packages to install. Analyses run on local worker processes or on Slurm, and results are cached and written into the case folders.

## Quick start (demo)

```bash
cd services/sc-analysis
cp config.example.json config.json      # paths are relative to this file
./run.sh                                # http://127.0.0.1:8787
# in another shell, from the repo root:
CI=false yarn start                     # the dev server proxies /sc-api to 8787
```

Open the **DEMO Single-Cell Dataset**, choose a patient and go to the Single-Cell tab. Then:

1. Pick "Clone vs rest" (or set A and B from a selection).
2. Click **Run**.
3. Click a gene in the result to show its expression beside the tree.

## What a patient needs

The service reads each patient's pre-analysed RNA from `<data_root>/<patient>/rna/`, written once by the export script from the lab's Seurat object:

```bash
singularity exec seurat.sif Rscript r/export_seurat.R \
  --rds /path/SC-PT01.rds --out /srv/gos/data/SC-PT01 \
  --datafiles /srv/gos/datafiles.json --patient SC-PT01
```

RNA cells are linked to gOS cells by ID. The link is the cell's own ID, or the `rna_id` on its `datafiles.json` entry. RNA-only cells are kept and can be included in analyses by RNA ID. The file layout is documented at the top of `gos_sc/store.py`.

## Analyses

| ID | Where it runs | What it does |
| --- | --- | --- |
| `de_wilcoxon` | built in (Python) | Cell-level DE between groups A and B, with FindMarkers defaults (log2FC with pseudocount 1, `min_pct`, `logfc_threshold`, Wilcoxon rank-sum, Bonferroni + BH) |
| `enrichment_ora` | built in (Python) | Hypergeometric over-representation of gene sets among a DE result's up or down genes; needs `gene_sets` in the config |
| `de_seurat` | command (R in Singularity) | Seurat `FindMarkers` on the patient's Seurat object (wilcox, MAST or t) |
| `de_pseudobulk` | command (R in Singularity) | Cross-patient DE: counts summed per patient and group, then edgeR quasi-likelihood with the patient as replicate (paired when possible) |

The two R analyses are off until the config names an image and enables them. **They were written without access to R and have not been run yet**; test them on one patient before relying on them. The Python analyses are covered by `tests/`.

To add an analysis, either add a module under `gos_sc/analyses/` (a `SPEC` dict and `run(ctx, params, report)`), or declare a command in the config. A command gets `{job_dir}`, `{data_root}`, `{image}` and `{service_root}` substituted, reads `request.json` and must write `result.json`.

## Config

See `config.example.json`.

- `datasets` maps the gOS dataset ID to the folder holding its case folders.
- The `executor` block sets the default (`local` or `slurm`), the number of local workers, and the `sbatch` arguments. Each analysis can override its executor in `analyses`.

In gOS, a dataset turns the feature on with `"analysisApi": "sc-api/"` in `datasets.json`.

## Running it for real

- **Apache:** `deploy/apache.conf` forwards `<gOS URL>/sc-api/` to the service.
- **Keeping it up:** `deploy/gos-sc-analysis.service` is a systemd user service. tmux (`tmux new -s gos-sc ./run.sh`) works too, but the service stops when that session or the machine does.
- **Slurm:** set `"executor": {"default": "slurm"}`. Each job becomes an `sbatch` script in its job folder. The service watches `squeue` and marks a job failed if it leaves the queue without a result.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/catalogue` | Analyses, their parameter schemas, gene-set collections |
| GET | `/rna?dataset=&patient=` | Whether the patient has RNA, with cell and gene counts |
| GET | `/genes?dataset=&patient=&q=` | Gene-name autocomplete |
| GET | `/expression?dataset=&patient=&gene=` | One gene across all of the patient's cells |
| POST | `/jobs` | `{analysis, dataset, groups: {A: [{patient, cells}], B: [...]}, params, labels}` or `{analysis, dataset, source_job, params}` |
| GET | `/jobs?dataset=&patient=` | Analysis history |
| GET | `/jobs/<id>` | Status: queued, running, done or failed, plus progress |
| GET | `/jobs/<id>/result` | The result table |

Job IDs are hashes of the request (analysis, version, cells, parameters), so a repeated request returns the cached result. Each job's folder (`<patient>/analyses/<id>/`, or `_cohort/analyses/<id>/` across patients) holds `request.json`, `status.json`, `result.json` and logs.

## Tests

```bash
cd services/sc-analysis && python3 -m unittest discover -s tests -v
```
