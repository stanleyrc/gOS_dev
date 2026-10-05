"""Cell-level differential expression between two groups of cells.

Mirrors Seurat's FindMarkers defaults (test.use = "wilcox"):
  - avg_log2FC = log2(mean(expm1(x_A)) + 1) - log2(mean(expm1(x_B)) + 1)
    on log-normalised data, with pseudocount 1;
  - genes tested only if detected in >= min_pct of either group and
    |avg_log2FC| >= logfc_threshold;
  - p_val from a two-sided Wilcoxon rank-sum test;
  - p_val_adj = Bonferroni over all genes in the data (Seurat's convention),
    plus q_val = Benjamini-Hochberg over the tested genes.
Groups may span patients; then the genes compared are those present in
every patient involved, and the result carries a pooling warning.
"""

import math

from ..stats import benjamini_hochberg, bonferroni, wilcoxon_ranksum

SPEC = {
    "title": "Differential expression (cell-level Wilcoxon)",
    "description": "Genes that differ between group A and group B, tested cell by cell "
                   "like Seurat's FindMarkers.",
    "version": "1",
    "inputs": ["groups"],
    "executor": "local",
    "params": {
        "min_pct": {"type": "number", "default": 0.1, "min": 0, "max": 1,
                    "label": "Min. fraction of cells detected"},
        "logfc_threshold": {"type": "number", "default": 0.1, "min": 0, "max": 10,
                            "label": "Min. |log2 fold change|"},
        "min_cells_per_group": {"type": "integer", "default": 3, "min": 1, "max": 1000,
                                "label": "Min. cells per group"},
    },
}

EXPLORATORY_BELOW = 20


def run(ctx, params, report):
    groups = ctx.groups  # {"A": [(PatientRna, set(columns))...], "B": [...]}
    n_a = sum(len(cols) for _, cols in groups["A"])
    n_b = sum(len(cols) for _, cols in groups["B"])
    if min(n_a, n_b) < params["min_cells_per_group"]:
        raise ValueError(
            f"each group needs at least {params['min_cells_per_group']} cells with RNA "
            f"(A has {n_a}, B has {n_b})"
        )

    patients = []
    for side in ("A", "B"):
        for rna, _ in groups[side]:
            if rna not in patients:
                patients.append(rna)
    genes = list(patients[0].genes)
    if len(patients) > 1:
        shared = set(genes)
        for rna in patients[1:]:
            shared &= set(rna.genes)
        genes = [g for g in genes if g in shared]
    n_all_genes = len(genes)

    def collect(side, gene):
        nonzero = []
        for rna, cols in groups[side]:
            hit = rna.gene(gene)
            if hit is None:
                continue
            for i, v in zip(*hit):
                if i in cols and v > 0:
                    nonzero.append(v)
        return nonzero

    rows = []
    min_pct = params["min_pct"]
    threshold = params["logfc_threshold"]
    step = max(1, n_all_genes // 50)
    for k, gene in enumerate(genes):
        if k % step == 0:
            report(progress=k / max(1, n_all_genes), message=f"testing genes ({k}/{n_all_genes})")
        a = collect("A", gene)
        b = collect("B", gene)
        pct_1 = len(a) / n_a
        pct_2 = len(b) / n_b
        if max(pct_1, pct_2) < min_pct:
            continue
        mean_a = sum(math.expm1(v) for v in a) / n_a
        mean_b = sum(math.expm1(v) for v in b) / n_b
        lfc = math.log2(mean_a + 1) - math.log2(mean_b + 1)
        if abs(lfc) < threshold:
            continue
        p, auc = wilcoxon_ranksum(a, n_a - len(a), b, n_b - len(b))
        rows.append({
            "gene": gene,
            "avg_log2FC": round(lfc, 5),
            "pct_1": round(pct_1, 4),
            "pct_2": round(pct_2, 4),
            "p_val": p,
            "auc": round(auc, 4),
            "mean_a": round(math.log1p(mean_a), 5),
            "mean_b": round(math.log1p(mean_b), 5),
        })

    p_values = [r["p_val"] for r in rows]
    for r, adj, q in zip(rows, bonferroni(p_values, n_all_genes), benjamini_hochberg(p_values)):
        r["p_val_adj"] = adj
        r["q_val"] = q
    rows.sort(key=lambda r: (r["p_val"], -abs(r["avg_log2FC"])))

    warnings = []
    if min(n_a, n_b) < EXPLORATORY_BELOW:
        warnings.append(f"Exploratory: a group has fewer than {EXPLORATORY_BELOW} cells.")
    if len(patients) > 1:
        warnings.append(
            "Cells from several patients are pooled, so p-values are inflated; "
            "use the pseudobulk analysis for cross-patient claims."
        )
    if ctx.missing:
        warnings.append(f"{len(ctx.missing)} selected cells have no RNA profile and were left out.")

    return {
        "type": "de",
        "summary": {
            "n_a": n_a,
            "n_b": n_b,
            "n_genes": n_all_genes,
            "n_tested": len(rows),
            "n_significant": sum(1 for r in rows if r["p_val_adj"] < 0.05),
            "patients": [rna.patient for rna in patients],
            "warnings": warnings,
        },
        "columns": ["gene", "avg_log2FC", "pct_1", "pct_2", "p_val", "p_val_adj", "q_val",
                    "auc", "mean_a", "mean_b"],
        "genes": rows,
    }
