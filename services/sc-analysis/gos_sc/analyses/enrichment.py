"""Over-representation of gene sets among a DE result's significant genes.

Hypergeometric test against the genes the DE job tested (its universe),
Benjamini-Hochberg across gene sets. Gene sets come from GMT files named in
the service config ("gene_sets": {"hallmark": "/path/h.all.symbols.gmt"}).
"""

from ..stats import benjamini_hochberg, hypergeom_sf

SPEC = {
    "title": "Gene-set enrichment of a DE result",
    "description": "Which gene sets are over-represented among the up- or down-regulated "
                   "genes of a finished DE analysis.",
    "version": "1",
    "inputs": ["source_job"],
    "executor": "local",
    "params": {
        "gene_set": {"type": "enum", "options": "$gene_sets", "label": "Gene-set collection"},
        "direction": {"type": "enum", "options": ["up", "down", "both"], "default": "up",
                      "label": "Genes higher in"},
        "q_cutoff": {"type": "number", "default": 0.05, "min": 0, "max": 1,
                     "label": "DE q-value cutoff"},
        "logfc_cutoff": {"type": "number", "default": 0.25, "min": 0, "max": 10,
                         "label": "Min. |log2 fold change|"},
        "min_size": {"type": "integer", "default": 5, "min": 1, "max": 1000,
                     "label": "Min. genes in a set (after universe filter)"},
        "max_size": {"type": "integer", "default": 500, "min": 1, "max": 5000,
                     "label": "Max. genes in a set"},
    },
}


def read_gmt(path):
    sets = []
    with open(path) as fh:
        for line in fh:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 3:
                continue
            sets.append((parts[0], parts[1], [g for g in parts[2:] if g]))
    return sets


def run(ctx, params, report):
    source = ctx.source_result
    if not source or source.get("type") != "de":
        raise ValueError("the source job is not a finished DE analysis")
    path = ctx.gene_set_path(params["gene_set"])
    universe = {r["gene"].upper() for r in source["genes"]}

    def selected(r):
        if r.get("q_val", 1) >= params["q_cutoff"] or abs(r["avg_log2FC"]) < params["logfc_cutoff"]:
            return False
        if params["direction"] == "up":
            return r["avg_log2FC"] > 0
        if params["direction"] == "down":
            return r["avg_log2FC"] < 0
        return True

    hits = {r["gene"].upper(): r["gene"] for r in source["genes"] if selected(r)}
    report(progress=0.2, message=f"{len(hits)} genes selected from the DE result")

    terms = []
    for name, description, members in read_gmt(path):
        in_universe = {g.upper() for g in members} & universe
        size = len(in_universe)
        if size < params["min_size"] or size > params["max_size"]:
            continue
        overlap = sorted(hits[g] for g in in_universe if g in hits)
        p = hypergeom_sf(len(overlap), len(universe), size, len(hits)) if overlap else 1.0
        terms.append({
            "term": name,
            "description": description if description not in ("", "NA", "na") else "",
            "size": size,
            "overlap": len(overlap),
            "expected": round(size * len(hits) / max(1, len(universe)), 3),
            "p_val": p,
            "genes": overlap,
        })
    for t, q in zip(terms, benjamini_hochberg([t["p_val"] for t in terms])):
        t["q_val"] = q
    terms.sort(key=lambda t: (t["p_val"], -t["overlap"]))
    warnings = []
    if not hits:
        warnings.append("No DE genes passed the cutoffs, so nothing can be enriched.")
    return {
        "type": "enrichment",
        "summary": {
            "source_job": ctx.source_job_id,
            "gene_set": params["gene_set"],
            "direction": params["direction"],
            "n_selected": len(hits),
            "n_universe": len(universe),
            "n_terms": len(terms),
            "n_significant": sum(1 for t in terms if t["q_val"] < 0.05),
            "warnings": warnings,
        },
        "columns": ["term", "size", "overlap", "expected", "p_val", "q_val", "genes"],
        "terms": terms,
    }
