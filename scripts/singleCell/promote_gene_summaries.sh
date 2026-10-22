#!/bin/bash
# Promote a staged gene_summaries build (build_gene_summaries.py --out <stage>) into gOS common/.
# Integrator only. Backs up any existing files as <file>.bak_<yymmdd>; never copies raw/.
# Usage: promote_gene_summaries.sh [stage_dir] [common_dir]
set -euo pipefail
STAGE=${1:-/gpfs/commons/groups/imielinski_lab/projects/single_cell_GBM/gos_datasets/gOS_GBM_sc/staging_gene_summaries_261022}
COMMON=${2:-/gpfs/commons/projects/imielinski_web/sclarke/gOS_common}
FILES="gene_summaries.tsv gene_summaries.tsv.gz gene_summaries_manifest.json"
for f in $FILES; do [ -s "$STAGE/$f" ] || { echo "missing $STAGE/$f" >&2; exit 1; }; done
head -1 "$STAGE/gene_summaries.tsv" | grep -q $'^symbol\t' || { echo "bad header in $STAGE/gene_summaries.tsv" >&2; exit 1; }
gzip -t "$STAGE/gene_summaries.tsv.gz"
TAG=$(date +%y%m%d)
for f in $FILES; do
  [ -e "$COMMON/$f" ] && cp -p "$COMMON/$f" "$COMMON/$f.bak_$TAG"
  cp "$STAGE/$f" "$COMMON/$f.tmp" && mv "$COMMON/$f.tmp" "$COMMON/$f"
done
cp "$STAGE/README.md" "$COMMON/gene_summaries_README.md"
chmod a+r "$COMMON"/gene_summaries*
echo "promoted $(($(wc -l < "$COMMON/gene_summaries.tsv") - 1)) genes to $COMMON"
