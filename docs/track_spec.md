# gOS / gCells track spec (`gos-track-spec`), version 0.2

One JSON document describes a stacked genome view: the loci, the units (cells or pseudobulk groups) in tree
order, and the tracks. The same file is read by the gOS track browser (tab "Track browser"), by gCells in R
(`gc$gt()`, `gc$iplot()`, `gc$gt_reads()`, drawn with gTrack) and by the Python reader (`gcells.py`). A view
built in a notebook opens in gOS; a gOS view can be exported as a spec and redrawn in R.

Status: **v0.2 draft (2026-11-21)**; v0.1 (2026-11-20) was written for milestone M1 of the track browser.
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
  "version": "0.2",
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

### Reserved types (M2–M4; names fixed now)

| type | format | notes |
|---|---|---|
| `walks` | gGnome.js walks JSON | gWalk layers (curated, peel, covariance, Method C), stacked paths with copies; `layer` field names the method |
| `cn_heatmap` | arrow / u16 bins | cells × bins in tree order |
| `cn_correlation_1d` | bigwig / arrow | correlation of each bin's CN with `anchor` locus across the selected units |
| `cn_correlation_2d`, `hic` | mcool | bin × bin triangle (HiGlass style); graph junctions overlaid |
| `atac` | bigwig + bed.gz | pseudobulk signal and peaks; `per_copy: true` divides by CN |
| `segments`, `peaks` | bed.gz + tbi | |

(`snv_reads` and `signature` moved from planned to defined in v0.2.)

## Selection

`"selection": { "units": ["..."], "clades": ["Clone 3"] }` (optional) filters every per-unit track to those
units. gOS writes the current tree selection here on export.

## Changes

- **0.2 (2026-11-21):** `snv_reads` and `signature` track types; `reads.target`, `reads.group_by`, `reads.groups`.
- **0.1 (2026-11-20):** first version: coverage (two-axis), graph, reads, genes, junctions; reserved names.

## Conformance

- A reader must draw a clear "not available (reason)" row for a track whose file is missing; it never fills in
  placeholder data.
- gOS exports the current view (loci, units, visible tracks, selection) as a spec with **Export spec**; the R and
  Python readers take the same file.
