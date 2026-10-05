# Single-cell WGS in gOS

gOS shows single-cell whole-genome data with the same building blocks it uses for bulk cases. **Every cell is an ordinary case folder**, so it carries the same per-case files a bulk case does. A **patient** is a case folder that groups its cells and holds the phylogeny. Bulk datasets are unaffected: nothing changes unless a manifest uses `entry_type`.

## Manifest (`datafiles.json`)

Mark each entry with `entry_type`:

| `entry_type` | Meaning | Required link |
| --- | --- | --- |
| `"patient"` | A single-cell patient. Opens the **Single-Cell** tab. | `patient_id` (optional; defaults to the entry's own ID) |
| `"cell"` | One cell. Opens the normal case report for that cell. | `patient_id` = the patient's ID |
| absent | Ordinary bulk case (unchanged behaviour) | — |

Cell entries can also carry `clone_id` plus any per-cell attributes, such as `ploidy`, `quality`, `total_reads` or `cell_type`. These appear in the cell browser and drive clone colours. Cell entries are hidden from the case list and aggregations, so a patient with thousands of cells doesn't swamp them. You reach cells through their patient, and a cell's report has a banner linking back to its patient.

```json
[
  { "pair": "PT01", "entry_type": "patient", "patient_id": "PT01", "tumor_type": "GBM" },
  { "pair": "PT01-cell-0001", "entry_type": "cell", "patient_id": "PT01", "clone_id": "A", "ploidy": 2.9 },
  { "pair": "PT01-cell-0002", "entry_type": "cell", "patient_id": "PT01", "clone_id": "B", "ploidy": 3.1 }
]
```

## Folders

```
data/<patient>/metadata.json   entry_type "patient" (also fine to rely on the manifest)
data/<patient>/tree.nwk        optional Newick tree; leaf names = cell case IDs
data/<cell>/metadata.json      cov_slope / cov_intercept, hets_slope / hets_intercept as in bulk
data/<cell>/complex.json       genome graph — total CN (nodes) and junctions (ALT edges)
data/<cell>/coverage.arrow     binned read depth (x, y, color), same format as bulk
data/<cell>/allelic.json       allelic CN, same format as bulk
data/<cell>/hetsnps.arrow      het-SNP counts, same format as bulk
data/<cell>/mutations.json     annotated SNVs/indels, same format as bulk
```

Any other bulk file you put in a cell folder (`filtered.events.json`, `sage.qc.json`, …) simply lights up the matching tab in that cell's report.

## What is built from which file

| View | Source |
| --- | --- |
| Total-CN heatmap row of a cell | that cell's `complex.json` intervals (`y` = copy number), the same data as its Total CN graph |
| Junction-CN heatmap | each cell's `complex.json` `ALT` connections. Breakpoints are matched across cells within 1 kb (orientation-aware). Value is the connection `weight`, or 0 if the cell lacks that junction. |
| SNV heatmap | each cell's `mutations.json`. A variant is "called" in a cell that lists it with alt reads, "not called" in a cell whose file lacks it, and "no data" for a cell without `mutations.json`. |
| Phylogeny | `<patient>/tree.nwk` when present. Otherwise it's inferred: UPGMA on Jaccard distance of SNVs called in ≥2 cells, or on copy-number distance if there are no shared SNVs. The heatmap title says which. |
| Cell tracks | coverage, total CN, allelic CN, het SNPs, SNVs from the cell's own files |
| Cohort heatmap | each cell's `complex.json`. Either one row per cell, ordered by each patient's tree, or one median row per patient. Reads at most 2,000 cells per patient. |

## Using it

- **Patient → Single-Cell tab:** the genome navigation bar (brush strip, location box, gene search) sits on top and drives everything below, exactly like Genome View. Brush several regions to see them side by side.
- **Heatmap:** the phylogeny is aligned to rows, with a clone colour strip. You can switch between Total CN, SNVs and Junction CN. To zoom, drag to pan, or ⌘/Ctrl/Alt-scroll, or use the zoom buttons; click a chromosome label to jump to it.
- **Selecting cells:** click a leaf or row to pull up that cell. ⌘/Ctrl-click adds or removes cells, Shift-click selects a range, and clicking an internal node selects its clade. The cell browser below lets you search, sort and pick cells by clone.
- **Cell tracks:** these appear below the heatmap for the selected cells (up to 6 at a time). Coverage and Total CN are shown by default; Allelic CN, Het SNPs and SNVs are toggles. "Open cell report" opens the cell's full gOS report.
- **Case list → Single-Cell Cohort tab:** appears when the dataset has patients. It shows cell and clone counts, clone composition, and the cohort CN heatmap. Click a patient to open it.

## RNA analyses

Patients with pre-analysed RNA (a `rna/` folder written by `services/sc-analysis/r/export_seurat.R` from the lab's Seurat object) get two more things in the Single-Cell tab:

- **Compare groups:** set group A and group B from any selection, or with a clone-vs-rest preset. Then pick an analysis and run it. Results show as a volcano plot, a gene table and gene-set enrichment, with TSV download and a history of past runs.
- **Gene beside the tree:** search a gene, or click one in a result, to add an expression column next to the clone strip. Clicking a gene also moves the genome view to it.

Both talk to the analysis service in `services/sc-analysis` (see its README), enabled per dataset with `"analysisApi": "sc-api/"` in `datasets.json`. RNA cells link to gOS cells by the same ID, or by an `rna_id` on the cell's `datafiles.json` entry.

## Demo

`python3 scripts/generate_sc_demo.py` regenerates the **DEMO Single-Cell Dataset**: 3 patients and 94 cells, with synthetic RNA for most cells plus a few RNA-only cells, and demo gene sets in `shared/genesets/`. SC-PT01 ships a `tree.nwk`; the others are inferred from SNVs, and two SC-PT03 cells deliberately lack `mutations.json`. The generator uses pyarrow when available, else `scripts/arrow_minimal.py`, which needs `flatbuffers`.

## Not yet covered

- Selecting cells in the cohort view opens the patient, but doesn't pre-select those cells.
