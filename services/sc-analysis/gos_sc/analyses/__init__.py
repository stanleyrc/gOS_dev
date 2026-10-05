"""Analysis catalogue: built-in Python analyses plus command analyses
(e.g. R scripts in Singularity images) declared in the service config."""

from . import de_wilcoxon, enrichment

BUILTINS = {
    "de_wilcoxon": de_wilcoxon,
    "enrichment_ora": enrichment,
}

# Command analyses shipped with the service. They only appear in the
# catalogue when the config gives them an image (and enables them).
COMMAND_TEMPLATES = {
    "de_seurat": {
        "title": "Differential expression (Seurat FindMarkers)",
        "description": "Seurat's FindMarkers on the patient's Seurat object, run in a "
                       "Singularity image.",
        "version": "1",
        "inputs": ["groups"],
        "executor": "slurm",
        "command": ["singularity", "exec", "--bind", "{data_root}", "{image}",
                    "Rscript", "{service_root}/r/de_seurat.R", "{job_dir}"],
        "params": {
            "test_use": {"type": "enum", "options": ["wilcox", "MAST", "t"], "default": "wilcox",
                         "label": "Test"},
            "min_pct": {"type": "number", "default": 0.1, "min": 0, "max": 1,
                        "label": "Min. fraction of cells detected"},
            "logfc_threshold": {"type": "number", "default": 0.1, "min": 0, "max": 10,
                                "label": "Min. |log2 fold change|"},
        },
    },
    "de_pseudobulk": {
        "title": "Cross-patient DE (pseudobulk, edgeR)",
        "description": "Sums counts per patient and group, then tests with edgeR using the "
                       "patient as the replicate (paired when a patient is in both groups).",
        "version": "1",
        "inputs": ["groups"],
        "executor": "slurm",
        "command": ["singularity", "exec", "--bind", "{data_root}", "{image}",
                    "Rscript", "{service_root}/r/de_pseudobulk_edger.R", "{job_dir}"],
        "params": {
            "min_cells": {"type": "integer", "default": 10, "min": 1, "max": 10000,
                          "label": "Min. cells per patient and group"},
        },
    },
}
