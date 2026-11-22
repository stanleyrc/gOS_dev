# gOS / gCells track spec (`gos-track-spec`), version 0.4

One JSON document describes a stacked genome view: the loci, the units (cells or pseudobulk groups) in tree
order, and the tracks. The same file is read by the gOS track browser (tab "Track browser"), by gCells in R
(`gc$gt()`, `gc$iplot()`, `gc$gt_reads()`, drawn with gTrack) and by the Python reader (`gcells.py`). A view
built in a notebook opens in gOS; a gOS view can be exported as a spec and redrawn in R.

Status: **v0.4 draft (2026-11-21)**; v0.1 (2026-11-20) was written for milestone M1 of the track browser.
v0.4 defines the reserved types `cn_heatmap` and `atac`, adds the derived `cn_diff`, cell `filters`, clade selection
(`selection.clades` selects; it no longer hides) and `unavailable` reasons; every v0.3 file stays readable.
v0.3 adds per-window y scales (`windows[i].y`) and the view `layout` (row heights, pseudobulk-first, pins).
v0.2 adds `snv_reads`, `signature` and read grouping (`group_by`) on `reads`; every v0.1 file is a valid v0.2 file. Fields marked
*reserved* are named now so writers can emit them, but no reader acts on them yet.

## Versioning

- `spec` is always `"gos-track-spec"`; `version` is `"MAJOR.MINOR"`.
- A reader accepts any spec with the same MAJOR and ignores unknown fields (forward compatible within a major).
- MINOR bumps only add optional fields or track types. Renaming or removing a field, or changing a unit, is a MAJOR bump.
- Writers record what produced the file in `provenance` (tool, commit, params).

## Top level

```json
{
  "spec": "gos-track-spec",
  "version": "0.4",
  "id": "MGH303_12q_m1",
  "title": "MGH303 12q amplicon",
  "genome": "hg38",
  "patient": "MGH303",
  "loci": ["chr12:55,500,000-72,500,000", "chr11:39,200,000-39,700,000"],
  "units": { ... },
  "tracks": [ ... ],
  "provenance": { "tool": "gCells G1 | gOS interim", "commit": "<sha>", "created": "2026-11-20T23:00:00", "params": {} }
}
```

| field | type | meaning |
|---|---|---|
| `genome` | string | `hg38` or `hg19`. Coordinates are 1-based, closed, as in gGnome/GRanges. |
| `loci` | string[] | One or more windows shown side by side (split view). `chr` prefix optional; commas allowed. The order is the display order. |
| `units` | object | The stacked rows (below). Tracks without `per_unit` ignore it. |
| `tracks` | object[] | Top-to-bottom order. Per-unit tracks are drawn inside each unit row, in this order. |
| `filters` | object | (v0.4) cell filters, below. |
| `unavailable` | object | (v0.4) `{ "<track type>": "reason" }`: tracks that cannot exist for this dataset; drawn as "not available (reason)" rows. |
| `presets` | object[] | (v0.4, optional) locus presets `[{ "label", "locus" }]` for the jump list (also read from `loci_presets`). |

**Default spec of a dataset (v0.4).** Without `?trackspec=<url>`, gOS reads `{dataPath}{patient}/trackspec.json` when it
exists and opens that view; a link's own `tblocus`, `tbmode`, `tbh`, `tbpin` and filter parameters win over it.

## Windows (v0.3): per-window y scale

```json
"windows": [
  { "locus": "chr12:55,500,000-72,500,000", "y": { "mode": "auto", "min": 0, "max": 150, "log": true, "robust": false } },
  { "locus": "chr11:39,200,000-39,700,000", "y": { "mode": "auto", "min": 0, "max": 4, "log": false } }
]
```

- Optional; when present it has one entry per `loci` entry, in the same order (`locus` repeats it).
- `mode`: `auto` (from that window's max over the shown units; `robust: true` uses the 99th percentile and marks
  clipped values with an arrow), `shared` (all `shared` windows use one scale), `manual` (`min`, `max` as given).
- `log`: log1p CN axis. Readers default to log when the auto max is above 12.
- Every window prints its own ticks (0 / 2 / max); readers flag "y scale differs" when windows differ.
- Applies to graph, coverage, pseudobulk and pinned rows alike. `layout.share_y: true` forces one scale.

## Layout (v0.3)

```json
"layout": { "row_height": 56, "overrides": { "graph": null, "coverage": 80 }, "auto_fit": true,
            "junction_height": 80, "reads_height": 220, "mode": "pseudobulk", "share_y": false,
            "pinned": ["clade:Clone 3", "cell:MGH303_MR_2_pl3_5a"], "clade_min_support": 25, "graph_style": "ggraph" }
```

- `row_height`: px per per-unit sub-row (12-200). Presets: compact 24, readable 56, large 120. `overrides` per track type.
- `auto_fit`: rows grow to fill the viewport, never below 40 px before scrolling.
- `mode`: `pseudobulk` (one row per clade, cells expandable under it) or `cells` (all units in tree order with the tree).
- `clade_min_support`: pseudobulk rows draw junctions carried by at least this % of the clade's cells (default 25).
- `graph_style`: `ggraph` (default: the standard gOS genome-graph component, gGnome.js look) or `canvas` (compact drawing).
- `pinned`: up to 3 rows (`clade:<group>` or `cell:<unit>`) drawn tall above the stack.
- (v0.4) `overrides.atac`: ATAC sub-row height (default 3/4 of `row_height`). gOS link parameters for the view:
  `tbmode=cells`, `tbsel`, `tbdepth`, `tbsphase`, `tbheat=0|genome`, `tbhpx`, `tbhcol=abs`, `tbatac=0`, `tbcopy=1`,
  `tbdiff=<by>:<a,..>:<b,..>`, `tblocus`, `tbpin`, `tbh`.

## Units

```json
"units": {
  "kind": "cell",
  "tree": "tree.nwk",
  "order": "tree",
  "list": [
    { "id": "MGH303_MR_2_pl3_5a", "label": "5a", "group": "Clone 3", "purity": 1, "ploidy": 1.98, "mean_depth": 6.81 }
  ],
  "groups": { "Clone 3": { "color": "#1f77b4" } }
}
```

- `kind`: `cell` or `pseudobulk` (a pseudobulk unit lists its member cells in `cells: [...]`).
- `tree`: Newick URL (relative to the spec) or null. Its tip names are unit ids. With `order: "tree"` rows follow the tree's leaf order and the tree is drawn at the left; `order: "list"` keeps `list` order.
- `purity`, `ploidy`: the unit's JaBbA fit. They set the CN axis of coverage tracks (below). Missing purity means 1.
- `mean_depth`: mean read depth of the unit (x), for the "expected depth" axis. Missing → that axis says "not available".
- `group` and `groups[...].color`: clade / clone coloring of the tree and row labels.
- `pseudobulk_graphs` (v0.3, optional): graphs fitted on a group's pooled cells (e.g. one JaBbA run per CN cluster),
  drawn as extra rows right under that group's clade pseudobulk row (in `cells` mode: above the cells). An array, or
  a URL (relative to the spec) to a JSON file `{ "pseudobulk_graphs": [...], "loci": [{ "label", "locus" }] }`.
  Without a spec gOS looks for `{dataPath}{patient}/pseudobulk_graphs.json`; a missing file means no such rows.

  ```json
  { "id": "H1299_c1_nonS_pl3.17", "label": "c1 non-S pseudobulk", "group": "c1", "n_cells": 29, "ploidy": 3.17,
    "purity": 1, "role": "recommended", "method": "JaBbA on pooled B reads", "url": "{dataPath}{unit}/complex.json" }
  ```

  `url` (gGnome.js JSON, `{unit}` = the entry id) defaults to `{dataPath}{unit}/complex.json`. Per group, an entry
  whose `role` starts with `recommended` is drawn first. `loci` in the file are locus presets for the dataset.

## Tracks

Common fields:

| field | type | meaning |
|---|---|---|
| `id` | string | unique within the spec |
| `type` | string | one of the types below |
| `title` | string | row label |
| `per_unit` | bool | true: one row per unit, `url` contains `{unit}` |
| `url` | string | data URL; relative URLs resolve against the spec's own URL (gOS also accepts `{dataPath}` for the dataset root) |
| `format` | string | file format (per type, below) |
| `height` | number | row height in px (per unit for per-unit tracks) |
| `y` | object | `{ "field": "...", "min": 0, "max": "auto" | number, "scale": "linear" | "log" }` |
| `color` | string | CSS color, or `"by_group"` |
| `visible` | bool | default true |

### `coverage` (two-axis)

```json
{ "id": "cov", "type": "coverage", "per_unit": true, "url": "{dataPath}{unit}/coverage.arrow",
  "format": "arrow", "value": "cn", "y": { "max": "auto" }, "height": 44,
  "axes": { "left": "cn", "right": "expected_depth" }, "raw_depth": null }
```

- **Plotted value:** the dryclean foreground `f` (coverage relative to the panel of normals). The pixel position is linear in f.
- **Left axis, CN** from the unit's purity p and ploidy ψ: `CN = (f·(pψ + 2(1−p)) − 2(1−p)) / p`; for a single cell (p = 1), `CN = f·ψ`. The axis label shows p and ψ.
- **Right axis, "expected depth (×)"** = `f × mean_depth`. It is exact for the normalized signal; raw read depth is not 1-to-1 with it (GC, mappability, PTA amplification bias).
- `value` says what the file stores: `"f"` (foreground) or `"cn"` (foregroundabs, i.e. already CN under the unit's p/ψ; readers invert it with `f = (p·CN + 2(1−p)) / (pψ + 2(1−p))`). The interim gOS files (`coverage.arrow`, columns `x` = genome-wide coordinate of the bin start, `y` = foregroundabs, `color`) are `value: "cn"`.
- `raw_depth` (*reserved*, M1+): URL of raw binned depth for the overlay toggle, drawn on its own axis.
- `bin_min_reads` (*reserved*, M3): for low-pass units, bins merge until each has at least this many reads.

Formats: `arrow` (interim, whole genome per unit), `bigwig` (G1 target: one per unit per layer, range-read).

### `graph` (genome graph)

```json
{ "id": "graph", "type": "graph", "per_unit": true, "url": "{dataPath}{unit}/complex.json",
  "format": "gggnome-json", "y": { "field": "cn", "max": "auto" }, "height": 56 }
```

gGnome.js JSON (`intervals` with `chromosome`, `startPoint`, `endPoint`, `y` = CN, `iid`; `connections` with
`source`, `sink` = ±iid, `type` ∈ REF/ALT/LOOSE, `weight` = CN). A positive sign means the interval's end, a
negative sign its start. Nodes are drawn at CN; ALT edges as arcs; an ALT edge with one end outside every locus
is drawn as a stub toward the window edge, labelled with the partner locus. Clicking an ALT edge opens the
`reads` track at both breakends.

### `reads` (igv.js alignment pane)

```json
{ "id": "reads", "type": "reads", "per_unit": false, "format": "bam",
  "url": "{dataPath}{patient}/slices/junctions.dna.bam", "read_group": "unit",
  "fallback_url": "{dataPath}{unit}/reads.bam", "window": 300, "max_units": 6,
  "target": "junction", "group_by": "unit" }
```

Follows the locus model. Multi-locus: one igv.js reference frame per locus (e.g. both breakends of a
junction). `read_group: "unit"` filters a pooled BAM to the unit by its `RG` tag. Precomputed BAM slices only;
whole CRAMs are never needed.

- `target` (v0.2): `junction` (both breakends), `snv` (see `snv_reads`) or `window` (the current loci, only
  when each window is at most `max_window` bp, default 50,000).
- `group_by` (v0.2): `unit` (one read pane per unit, at most `max_units`), `group` (one pane per clade / clone:
  reads of all its units, by `RG` membership in a pooled BAM; needs a pooled slice), or `all` (one pane, every
  unit pooled). Panes follow tree order. `groups` (optional) overrides membership: `{ "Clone 3": ["cell", ...] }`.
- A reader without a pooled slice for the target says "grouped reads not available (no pooled slice)" and falls
  back to per-unit panes.

### `snv_reads` (v0.2: base-level reads at chosen SNVs)

```json
{ "id": "snvreads", "type": "snv_reads", "format": "bam",
  "url": "{dataPath}{patient}/slices/drivers.dna.bam", "read_group": "unit",
  "fallback_url": "{dataPath}{unit}/reads.bam",
  "sites": [ { "id": "chr12_57751234_C_T", "chrom": "chr12", "pos": 57751234, "ref": "C", "alt": "T", "label": "CDK4 p.R24C" } ],
  "window": 40, "group_by": "group", "sort": "alt_first", "max_units": 6 }
```

- One reference frame per site (`window` bp either side; default 40, i.e. base level). Several sites are a
  split view.
- Reads carrying `alt` at `pos` are highlighted and sorted first (`sort: "alt_first"`; igv.js BASE sort).
- `group_by` as for `reads` (`unit`, `group`, `all`), panes in tree order. Each pane is labelled with its alt / total read count at the site when the reader can count it.
- `sites` may instead be a URL to a TSV/JSON with the same columns (`id, chrom, pos, ref, alt, label`).

### `signature` (v0.2: SBS spectrum or exposures per unit)

```json
{ "id": "sig", "type": "signature", "per_unit": true,
  "url": "{dataPath}{patient}/signatures_cells.json", "format": "gos-signatures-json",
  "mode": "spectrum", "channels": "SBS96", "normalize": "fraction", "height": 40,
  "signatures": ["SBS1", "SBS5", "SBS40"], "fit": "patient" }
```

- `mode: "spectrum"`: the 96-channel trinucleotide spectrum per unit (bars in COSMIC channel order, colored
  by the six substitution classes). `normalize`: `count` or `fraction`.
- `mode: "exposures"`: signature exposures per unit (stacked bar of `signatures`, fractions or counts), from
  one fit per patient on all of its mutations with each mutation assigned (`fit: "patient"`; per-clade refits
  are not part of the spec).
- Units without enough SNVs show "not available (n SNVs)"; `min_snvs` (default 20) sets the cut-off.
- Not tied to the locus: it is drawn in the unit row beside the genome tracks (a fixed-width column) or as its
  own panel. `group_by: "group"` pools units per clade.
- Formats: `gos-signatures-json` (existing gOS exports), `tsv` (`unit, channel, value` or `unit, signature, value`).

### `genes`

`{ "id": "genes", "type": "genes", "url": "genes/hg38.arrow", "format": "gos-genes-arrow", "height": 40 }`

### `junctions` (patient-level junction table)

```json
{ "id": "jx", "type": "junctions", "url": "{dataPath}{patient}/junctions_table.json",
  "format": "gos-sc-junctions-table", "y": { "field": "n_cells_tumour" }, "min": { "n_cells_tumour": 10 } }
```

Arcs (or stubs for inter-locus partners) with the number of supporting cells. *Per-unit support* (split reads,
discordant pairs, rescue tier per junction × unit) is *reserved* as `junction_support`: format `bedpe.gz`
(tabix) or `arrow`, columns `junction_id, unit, split, discordant, tier`.

### `events` (v0.3: interval annotations, e.g. amplicon process classes and ecDNA calls)

```json
{ "id": "events", "type": "events", "url": "{dataPath}{patient}/events.json", "format": "gos-events-json", "height": 44 }
```

File: `{ "events": [ { "id", "kind": "amplicon" | "arm", "chrom", "start", "end", "class", "status", "confidence",
"ecdna_call", "genes" } ] }`. Drawn in the header in two lanes (amplicons, arm events); hover shows the class, status
and ecDNA-caller call. Without a spec gOS looks for `{dataPath}{patient}/events.json`; a missing file hides the lane.

### `cn_heatmap` (v0.4: cells x bins in tree order)

```json
{ "id": "cnhm", "type": "cn_heatmap", "url": "{dataPath}{patient}/cn_heatmap/index.json", "format": "gos-cn-heatmap-u16",
  "row_px": 3, "strips": ["clade", "plate", "time_point", "s_phase", "qc_mapd", "depth", "ecdna_call"],
  "colors": "ploidy", "genome_wide": false }
```

Index format `gos-cn-heatmap-u16` (version 1):

```json
{ "format": "gos-cn-heatmap-u16", "version": 1, "scale": 100, "na": 65535, "order": "tree",
  "cells": ["<cell id>", "..."],
  "chroms": [ { "chrom": "1", "file": "chr1.u16", "starts": [1, 500001], "ends": [500000, 1000000] } ],
  "lod": { "file": "genome_5mb.u16", "bin_size": 5000000, "bins": [ { "chrom": "1", "start": 1, "end": 5000000 } ] } }
```

- `cells` is the row order of every matrix (tree leaf order). Each `.u16` is little-endian uint16, row major,
  n_cells x n_bins, value = round(CN x `scale`), `na` = no value. Coordinates 1-based closed, chrom without "chr".
  File names are relative to the index.
- `lod`: genome-wide level of detail; each value is the median of the 500 kb CNs inside the 5 Mb bin.
- Readers draw the shared windows from the chromosome files (only the windows' chromosomes are fetched) and the
  genome-wide view (`genome_wide: true`) from the LOD file. Rows follow the view's unit order; selected clades first.
- `colors`: `ploidy` (default; CN shifted so the unit's rounded ploidy is drawn as neutral 2, palette 0 .. >= 8) or
  `absolute` (CN 2 neutral). NA is grey.
- `strips` (left annotations, from the unit attributes; a strip with no values is not drawn): `clade`, `plate`,
  `time_point`, `s_phase`, `qc_mapd`, `depth`, `ecdna_call` (the ecDNA caller's per-cell call; a caller call, not
  proof of ecDNA).
- Mode `pseudobulk` (clades): one band per clade = median CN of the clade's shown cells (after `filters`), expandable
  to its cells; mode `cells`: one row per cell (rows share the block's pixel rows when there are many cells).
- Interaction (gOS): click a band selects the clade (`selection.clades`); click a cell row pins that cell's rows
  (`layout.pinned`); genome-wide, click a chromosome opens it.
- `row_px`: pixel height per cell row (1-12).
- Writers may name strips by their attribute (`clone_id` = `clade`, `depth_class` = `depth`) and give `colors` as
  `{ "neutral": "ploidy" | 2, "max": 8 }`; readers treat these as the forms above.

### `atac` (v0.4: accessibility pools and per-cell ATAC)

```json
{ "id": "atac", "type": "atac", "url": "{dataPath}{patient}/atac/index.json", "format": "gos-atac-index",
  "per_copy": false, "cell_url": "{dataPath}{unit}/atac.arrow", "height": 40 }
```

Index format `gos-atac-index` (version 1):

```json
{ "format": "gos-atac-index", "version": 1, "unit": "cpm", "bin_size": 1000,
  "pools": [ { "id": "c1", "group": "c1", "n_cells": 29, "fragments": 1234567, "bigwig": "c1.bw",
               "peaks": "c1.peaks.bed.gz", "cells": ["..."] } ],
  "all": { "id": "all", "bigwig": "all.bw", "peaks": "all.peaks.bed.gz", "n_cells": 383 } }
```

- One pool per clade (`group` = the clade; SW620 joint also has time-point pools `tp_T0` ... with `group: null`) plus
  `all`. bigWig: chrom names `chr1`.., A-read (ATAC) fragment coverage, CPM per `bin_size` bp, with zoom levels;
  readers range-read it and use the coarsest zoom level whose reduction is <= bp per pixel. Peaks: MACS3 narrowPeak,
  bgzip (+ tabix); drawn as ticks under the pool signal.
- Clade rows draw their pool; cell rows draw `cell_url` (per-cell 500 kb `atac.arrow`: `x` = genome-wide bin start,
  `y` = CPM). `per_cell: { "url", "format", "bin_size", "unit" }` is accepted as an equivalent form.
- `per_copy: true` divides the signal by the clade's median CN in the 500 kb heat-map bin (cell rows: the cell's CN),
  i.e. fragments per copy; bins with CN <= 0.05 or no CN are gaps.
- With cell `filters` on, a clade's pool is recomputed in the browser as the mean of its shown cells' 500 kb ATAC
  (the row says "browser pool of n shown cells"); bigWig pools always contain all of the clade's cells.
- `events.json` amplicons may carry `fragments_per_copy` and `atac_vs_cn` (shown on hover).

### `cn_diff` (v0.4: derived difference track, no file)

```json
{ "id": "cndiff", "type": "cn_diff", "by": "time_point", "a": ["T11", "T12"], "b": ["T0"], "height": 60 }
```

Median CN of the shown units of set A minus set B per heat-map bin (needs the `cn_heatmap` track), drawn as signed
bars (gains red, losses blue) on a symmetric axis per window. `by`: `clade` (A and B are clade names) or
`time_point` (unit attribute `time_point`). Empty `a` / `b`: readers pick a default (clade 1 vs 2; latest vs first
time point). The row states the n on each side.

### Reserved types (M2–M4; names fixed now)

| type | format | notes |
|---|---|---|
| `walks` | gGnome.js walks JSON | gWalk layers (curated, peel, covariance, Method C), stacked paths with copies; `layer` field names the method |
| `cn_correlation_1d` | bigwig / arrow | correlation of each bin's CN with `anchor` locus across the selected units |
| `cn_correlation_2d`, `hic` | mcool | bin × bin triangle (HiGlass style); graph junctions overlaid |
| `segments`, `peaks` | bed.gz + tbi | |

(`snv_reads` and `signature` moved from planned to defined in v0.2; `cn_heatmap` and `atac` in v0.4.)

## Selection and filters

`"selection": { "units": ["..."], "clades": ["Clone 3"] }` (optional).

- `units` filters every per-unit track to those units (e.g. a tree node's cells).
- `clades` (v0.4) **selects**: those clades' rows are outlined and moved to the top (each in tree order), the others
  are dimmed. In v0.3 files `clades` filtered; readers apply v0.3 semantics to `version: "0.3"` files. gOS URL: `tbsel`.
- Hiding is a filter: `"filters": { "clades": [...] }` keeps only those clades ("hide others").

```json
"filters": { "depth": "deep", "s_phase": "hide", "clades": ["j1", "j2"] }
```

- `depth`: `all` (default) or `deep` (unit attribute `depth_class == "deep"`, i.e. >= 1e5 good B fragments; from
  `depth` when the class is absent). gOS URL `tbdepth=deep`.
- `s_phase`: `show` (default), `hide` (drop units with `s_phase` TRUE) or `only`. gOS URL `tbsphase`.
- Clade medians (heat-map bands, pseudobulk rows, `cn_diff`) and browser ATAC pools are recomputed from the shown
  units; row labels state the n used.

Unit attributes used by v0.4 (in `units.list` or the gOS cell records): `plate`, `time_point`, `replicate`,
`s_phase`, `qc_mapd`, `depth` (good B fragments), `depth_class`, `ecdna_call`. gOS writes the current selection and
filters here on export.

## Changes

- **0.4 (2026-11-21, dATAC v2):** `cn_heatmap` (index `gos-cn-heatmap-u16`, uint16 matrices per chromosome + 5 Mb
  LOD, strips) and `atac` (index `gos-atac-index`, bigWig pools + narrowPeak, per-cell `atac.arrow`, `per_copy`)
  defined; derived `cn_diff`; `filters` (depth, S-phase, clades); `selection.clades` selects instead of filtering;
  `unavailable` reasons; `presets`; the dataset default `{dataPath}{patient}/trackspec.json`.

- **0.3 (2026-11-21, dATAC):** `events` track type; `units.pseudobulk_graphs` (exported pseudobulk graphs per group, e.g. cluster JaBbA fits) and the per-dataset `pseudobulk_graphs.json` with locus presets.
- **0.3 (2026-11-21, later):** `layout.graph_style`; `graph` tracks are drawn with the gOS genome-graph component (intervals at CN colored by chromosome, junction arcs, CN axis); pseudobulk graphs are passed to it as gGnome.js JSON.
- **0.3 (2026-11-21):** `windows[i].y` per-window y scales; `layout` (row heights, auto-fit, pseudobulk mode, pins, share_y).

- **0.2 (2026-11-21):** `snv_reads` and `signature` track types; `reads.target`, `reads.group_by`, `reads.groups`.
- **0.1 (2026-11-20):** first version: coverage (two-axis), graph, reads, genes, junctions; reserved names.

## Conformance

- A reader must draw a clear "not available (reason)" row for a track whose file is missing; it never fills in
  placeholder data.
- gOS exports the current view (loci, units, visible tracks, selection) as a spec with **Export spec**; the R and
  Python readers take the same file.
