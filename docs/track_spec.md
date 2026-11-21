# gOS / gCells track spec (`gos-track-spec`), version 0.4

One JSON document describes a stacked genome view: the loci, the units (cells or pseudobulk groups) in tree
order, and the tracks. The same file is read by the gOS track browser (tab "Track browser"), by gCells in R
(`gc$gt()`, `gc$iplot()`, `gc$gt_reads()`, drawn with gTrack) and by the Python reader (`gcells.py`). A view
built in a notebook opens in gOS; a gOS view can be exported as a spec and redrawn in R.

Status: **v0.4 draft (2026-11-21)**; v0.4 adds the `hic` track type (contact maps over the windows); v0.1 (2026-11-20) was written for milestone M1 of the track browser.
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

### `hic` (v0.4: Hi-C contact maps over the windows)

```json
{ "id": "hic", "type": "hic", "title": "Hi-C contacts", "per_unit": true,
  "url": "{dataPath}{unit}/hic/index.json", "format": "gos-hic-tiles/1",
  "units": ["GBM39_cluster0", "GBM39_cluster2"], "mode": "triangle", "resolution": "auto",
  "normalization": "raw", "color": { "scale": "log", "max": "p99", "palette": "white-red" },
  "junctions": { "overlay": true, "source": "graph" }, "height": 420, "visible": true }
```

- **Layout (GxG gMap on a multi-range view):** the windows (`loci`) are concatenated into one axis in display order.
  Each window's cis block is on the diagonal; the trans blocks between windows are off it, so a junction between two
  windows is an off-diagonal hotspot. Window borders are drawn and labelled (W1, W2, W1×W2, ...).
- `units`: the units drawn, one map each, stacked in this order (cluster pseudobulks; a single cell's contacts where
  an export exists). A unit without an export draws "Hi-C not available (reason)".
- `mode`: `triangle` (default; rotated 45° with the diagonal on top, x aligned with the tracks above; a contact
  between screen columns xa ≤ xb is drawn at ((xa + xb) / 2, (xb − xa) / 2)) or `square` (both axes follow the window
  layout). `height` caps the triangle depth (px); pairs further apart than 2 × height are not drawn.
- `resolution`: `"auto"` (the finest bin size whose concatenated axis has at most about one bin per 1.5 px) or a bin
  size in bp present in the export (used when its axis stays under the reader's cap, 1,400 bins).
- `normalization`: `raw` (counts) or `balanced` (count × w1 × w2 with the export's ICE weights; filtered bins grey).
- `color`: `scale` `log` (log1p(v) / log1p(max), default) or `linear`; `max` a percentile `"p<q>"` of the drawn
  off-diagonal non-zero values (robust, default `p99`) or a number.
- `junctions.overlay`: the unit's `graph` track ALT edges drawn as circles at (bp1, bp2) when both breakends are in the
  windows (`source: "graph"`).
- Pan and zoom follow the shared windows; dragging or wheeling on a map moves the window under the cursor.

**Format `gos-hic-tiles/1`** (skilift `sc_export_hic_tiles()` from a cooler `.mcool`): `index.json` plus one
range-readable little-endian binary per resolution, read with HTTP Range requests:

| part | content |
|---|---|
| `index.json` | `format`, `unit`, `genome`, `source`, `storage` (`symmetric-upper`), `data_label`, `resolutions[]`: `res`, `file`, `nbins`, `nnz`, `sum`, `bytes`, `chroms[]` (`name` without "chr", `length`, `bin_offset`, `nbins`), `sections` (byte offsets), `balance` (`method` ICE or none, parameters, `converged`) |
| `r<res>.bin` | `[bin1 offsets u32 × (nbins + 1)] [weights f32 × nbins, NaN = filtered] [pixels (bin2 u32, count f32) × nnz]` |

Pixels are the cooler upper triangle sorted by bin1 then bin2, so a window's rows are one byte range
(`offsets[a] .. offsets[b + 1]`); contacts between two windows are in the rows of the earlier one. Readers fetch rows
in aligned blocks of 256 bins (cached across pans).

### Reserved types (M2–M4; names fixed now)

| type | format | notes |
|---|---|---|
| `walks` | gGnome.js walks JSON | gWalk layers (curated, peel, covariance, Method C), stacked paths with copies; `layer` field names the method |
| `cn_heatmap` | arrow / u16 bins | cells × bins in tree order |
| `cn_correlation_1d` | bigwig / arrow | correlation of each bin's CN with `anchor` locus across the selected units |
| `cn_correlation_2d` | arrow | bin × bin triangle, drawn like `hic` |
| `atac` | bigwig + bed.gz | pseudobulk signal and peaks; `per_copy: true` divides by CN |
| `segments`, `peaks` | bed.gz + tbi | |

(`snv_reads` and `signature` moved from planned to defined in v0.2.)

## Selection

`"selection": { "units": ["..."], "clades": ["Clone 3"] }` (optional) filters every per-unit track to those
units. gOS writes the current tree selection here on export.

## Changes

- **0.4 (2026-11-21):** `hic` track type (multi-window contact maps, triangle or square, raw or ICE-balanced, auto or
  fixed resolution, log color with a percentile max, graph junction overlay) and the `gos-hic-tiles/1` format.

- **0.3 (2026-11-21, later):** `layout.graph_style`; `graph` tracks are drawn with the gOS genome-graph component (intervals at CN colored by chromosome, junction arcs, CN axis); pseudobulk graphs are passed to it as gGnome.js JSON.
- **0.3 (2026-11-21):** `windows[i].y` per-window y scales; `layout` (row heights, auto-fit, pseudobulk mode, pins, share_y).

- **0.2 (2026-11-21):** `snv_reads` and `signature` track types; `reads.target`, `reads.group_by`, `reads.groups`.
- **0.1 (2026-11-20):** first version: coverage (two-axis), graph, reads, genes, junctions; reserved names.

## Conformance

- A reader must draw a clear "not available (reason)" row for a track whose file is missing; it never fills in
  placeholder data.
- gOS exports the current view (loci, units, visible tracks, selection) as a spec with **Export spec**; the R and
  Python readers take the same file.
