// Where each single-cell view's data comes from and what it computes, shown
// in the provenance hover of the card (components/singleCell/hintLine.js
// <Provenance id="..." />). One entry per card / derived number:
//   source: files read (and the gos_sc_upload.R step / skilift function that writes them)
//   calc:   what is computed from them
//   where:  "browser" (computed client-side), "backend" (precomputed by the
//           pipeline, shown as is) or "both" (precomputed inputs, browser maths)
// Keep each field to one or two short sentences. Pipeline:
// srctools inst/gos_single_cell/gos_sc_upload.R (steps cells, drivers, snvs,
// map, signatures, dataset, cna, events, rna, walks, bams, register) with
// skilift R/single-cell.R and R/single-cell-annotate.R.

export const WHERE = {
  browser: { label: "computed in browser", color: "geekblue" },
  backend: { label: "precomputed (back end)", color: "purple" },
  both: { label: "back end + browser", color: "cyan" },
};

const CELL_CN = "data/<cell>/complex.json per cell: JaBbA graph (jabba_gg_slack1e3, else jabba_wg) lifted by gos_sc_upload.R `cells` (skilift lift_gos_sc_cells)";
const SNV_MATRIX = "data/<patient>/snv_matrix.json: reads at every tree + driver site in every cell, `snvs` step from site_qc_matrices.rds (AD/DP counts, PL genotype GQ ≥ 10), sites mapped by `map`";
const TREE = "data/<patient>/tree.nwk: CellPhy search tree rooted on the outgroup normals (`cells` step, skilift sc_root_tree)";
const EVENTS = "data/<patient>/filtered.events.json: per-cell OncoKB drivers (SNVs, CNAs, fusions) pooled by gos_sc_upload.R `events` (skilift sc_patient_filtered_events)";
const SIGS = "data/<patient>/signatures.json: SigProfilerAssignment cosmic_fit (COSMIC v3.4 SBS, GRCh38) of preset site sets, `signatures` step";
const RNA = "data/<patient>/rna/: Seurat log-normalized matrix, cells.json (metadata, UMAP) from gos_sc_upload.R `rna` (skilift export_gos_sc_rna)";
const WALKS = "data/<patient>/walks.json: gWalks + per-cell walk copies (amp_counts_dt) from db/amplicon_copies/all_patients.rds, `walks` step (skilift sc_export_walks)";
const QC_EXPORT = "datafiles.json qc_* fields (reads, depth, breadth, MAD, Gini, ADO…) copied from all_pairs.rds by the `dataset` step";

// short forms for entries that read several files
const S = {
  CELL_CN: "<cell>/complex.json (`cells`)",
  SNV_MATRIX: "snv_matrix.json (`snvs` + `map`)",
  TREE: "tree.nwk (CellPhy, rooted)",
  EVENTS: "filtered.events.json (`events`)",
  SIGS: "signatures.json (`signatures`, SigProfilerAssignment)",
  RNA: "rna/ (`rna`, Seurat export)",
  WALKS: "walks.json (`walks`)",
  QC_EXPORT: "datafiles.json qc_* (`dataset`)",
};

export const PROVENANCE = {
  /* ---- Single-Cell tab ---- */
  cnHeatmap: {
    title: "Copy-number heatmap",
    source: CELL_CN,
    calc: "Each cell's segment CN is binned onto the genome grid in the browser; rows follow the tree. Allelic modes read allelic.json (balanced_gg).",
    where: "both",
  },
  snvHeatmap: {
    title: "SNV heatmap",
    source: SNV_MATRIX,
    calc: "VAF = alt / (ref + alt) per cell and site, binned to pixels in the browser; site categories (truncal / subclonal / private) come from the `map` step.",
    where: "both",
  },
  junctionHeatmap: {
    title: "Junction copy number",
    source: CELL_CN,
    calc: "ALT edges of each cell's graph matched across cells by breakpoint in the browser; colour = the junction's copy number in that cell.",
    where: "both",
  },
  phylogeny: {
    title: "Phylogeny",
    source: TREE,
    calc: "Parsed and laid out in the browser; long branches can be shortened. Without tree.nwk a UPGMA tree is inferred from SNVs, else from CN.",
    where: "both",
  },
  umap: {
    title: "RNA UMAP",
    source: RNA,
    calc: "Coordinates precomputed (original Seurat UMAP, or umap_dna recomputed on cells with DNA); k-means / PCA options run in the browser.",
    where: "both",
  },
  cellTracks: {
    title: "Cell tracks",
    source: "data/<cell>/coverage.arrow (dryclean 1 kb coverage, rel2abs with ploidy), complex.json, allelic.json, hetsnps.arrow — `cells` step",
    calc: "Drawn as stored; no browser computation beyond binning for display.",
    where: "backend",
  },
  reads: {
    title: "Reads (IGV)",
    source: "data/<cell>/reads.bam: slices around SNV sites and junction breakpoints cut from each cell's BAM/CRAM by the `bams` step (skilift lift_gos_sc_bams)",
    calc: "Shown as aligned in igv.js.",
    where: "backend",
  },
  circos: {
    title: "Circos",
    source: CELL_CN,
    calc: "Pseudobulk clones = median CN of the clone's cells; junctions shared by ≥ the chosen fraction of its cells, computed in the browser.",
    where: "both",
  },
  phyloBars: {
    title: "Tree bars",
    source: "datafiles.json cell attributes, snv_matrix.json, rna/ and signatures.json",
    calc: "Per-cell values, or means per clone / clade; clade signature bars are NNLS fits on the clade's pooled sites in the browser.",
    where: "both",
  },
  /* ---- Report ---- */
  keyFindings: {
    title: "Key findings",
    source: `${S.EVENTS}; ${S.SNV_MATRIX}; ${S.SIGS}`,
    calc: "Clonal vs subclonal drivers from carrier fraction and clade F1 on the tree; burden counts by site category, all in the browser.",
    where: "both",
  },
  cloneFraction: {
    title: "Fraction of tumor cells",
    source: EVENTS,
    calc: "Carrier cells (cell_ids of the event) / tumor cells of the patient (normals excluded), in the browser.",
    where: "both",
  },
  cladeFit: {
    title: "Clade F1",
    source: `${S.EVENTS}; ${S.TREE}`,
    calc: "Best F1 between the carrier cells and any clade of the displayed tree (1 = carriers form exactly one clade), in the browser.",
    where: "browser",
  },
  driverMatrix: {
    title: "Driver alterations by cell",
    source: `${S.EVENTS}; ${S.TREE}`,
    calc: "Tier 1–2 events x cells in tree order; rows ordered by the depth of their best-fitting clade; fraction + clade F1 at right.",
    where: "both",
  },
  burden: {
    title: "SNV burden by tree position",
    source: SNV_MATRIX,
    calc: "Counts of CellPhy-input sites per category: truncal (tumor MRCA), subclonal, private, from the `map` step's one-gain tree mapping.",
    where: "both",
  },
  furtherFindings: {
    title: "Further findings",
    source: `${S.RNA}; ${S.CELL_CN}; ${S.SIGS}`,
    calc: "State composition per clone (chi-square), CN vs expression of drivers (Spearman), signature shifts per clone — all in the browser.",
    where: "browser",
  },
  clonalHistory: {
    title: "Clonal history",
    source: `${S.TREE}; ${S.EVENTS}; ${S.SNV_MATRIX}`,
    calc: "Each event placed on the branch above its best-fitting clade; SNVs gained per branch and the signature rising most vs the parent, in the browser.",
    where: "browser",
  },
  ampTiming: {
    title: "Amplification timing",
    source: `${S.SNV_MATRIX}; ${S.CELL_CN}`,
    calc: "Mutant copies = VAF x CN per SNV in carrier cells; ≥ 1.5 copies = before the amplification. Pre-amp fraction computed in the browser.",
    where: "browser",
  },
  branchRates: {
    title: "Mutation rates along the tree",
    source: `${S.SNV_MATRIX}; ${S.QC_EXPORT}`,
    calc: "Sites gained per branch per callable Mb (median breadth x 3,100 Mb); private-SNV rate vs the rest (Mann-Whitney), in the browser.",
    where: "browser",
  },
  /* ---- ecDNA ---- */
  walks: {
    title: "ecDNA / amplicon walks",
    source: WALKS,
    calc: "Walks as exported (reference-adjacent nodes merged); filters (min cells, median copies, curated) applied in the browser.",
    where: "both",
  },
  walkCopies: {
    title: "Walk copies",
    source: WALKS,
    calc: "Per-cell copies as fitted upstream; family totals, clone carrier % and median copies among carriers computed in the browser.",
    where: "both",
  },
  walkNesting: {
    title: "How the walks nest",
    source: WALKS,
    calc: "Fraction of one walk's bases inside another (interval overlap of their nodes), in the browser.",
    where: "browser",
  },
  walkCooccurrence: {
    title: "Walk co-occurrence",
    source: WALKS,
    calc: "Cells grouped by the set of walks present at ≥ the copy threshold; Spearman ρ for walk vs walk copies, in the browser.",
    where: "browser",
  },
  walkDiagram: {
    title: "Walk structure",
    source: `${WALKS}; genes from the app's GENCODE track`,
    calc: "Nodes, strands and ALT junctions as exported; genes overlapping the nodes looked up in the browser.",
    where: "both",
  },
  /* ---- RNA ---- */
  rnaComposition: {
    title: "Cell composition",
    source: RNA,
    calc: "Share of each level (e.g. state) per group; chi-square test of independence, in the browser.",
    where: "browser",
  },
  de: {
    title: "Differential expression",
    source: RNA,
    calc: "Wilcoxon rank-sum per gene (Seurat FindMarkers defaults), avg_log2FC, Bonferroni / BH; gene-set ORA (hypergeometric) — in the browser.",
    where: "browser",
  },
  markers: {
    title: "Marker genes",
    source: `data/<patient>/rna/markers.json (Seurat FindAllMarkers, rna step); ${S.RNA}`,
    calc: "Pipeline markers for Seurat fields; DNA clones and other groups tested in the browser (Wilcoxon, BH).",
    where: "both",
  },
  violin: {
    title: "Expression violins",
    source: RNA,
    calc: "Gaussian KDE (Silverman bandwidth) of log-normalized expression per group; module score = mean of the set's genes.",
    where: "browser",
  },
  geneExplorer: {
    title: "Gene explorer",
    source: RNA,
    calc: "Expression by clone / state / region with a rank test and % expressing, in the browser.",
    where: "browser",
  },
  phyloExpression: {
    title: "Expression on the phylogeny",
    source: `${S.RNA}; ${S.TREE}`,
    calc: "Genes from DE / picks / most variable / gene sets; z-scored per gene and aligned to the tree rows in the browser.",
    where: "browser",
  },
  dosage: {
    title: "Dosage vs expression",
    source: `${S.CELL_CN}; ${S.RNA}`,
    calc: "CN at the gene locus per cell vs its expression in the same cell; Spearman ρ, least-squares slope, BH across genes — in the browser.",
    where: "browser",
  },
  /* ---- Signatures ---- */
  signatureSets: {
    title: "Signatures of site sets",
    source: `${SIGS}; SBS96 contexts on snv_matrix.json variants`,
    calc: "Backend SigProfiler fits where present; other sets fitted by NNLS on the patient's signatures in the browser (bootstrap intervals).",
    where: "both",
  },
  signatureFit: {
    title: "Signature fit quality",
    source: `${S.SIGS}: per set the SigProfiler input SBS96, its reconstruction and fit stats (skilift sc_add_signature_fit_quality)`,
    calc: "Residual per channel; decomposed catalogs (channels split by activity × COSMIC profile) and their cosine to the scaled profile, as in bulk.",
    where: "both",
  },
  signatureCompare: {
    title: "Signatures across site sets",
    source: `${SIGS}; SBS96 contexts on snv_matrix.json variants`,
    calc: "Backend fits plus browser NNLS for sets without one; cosine similarity of the sets' SBS96 profiles.",
    where: "both",
  },
  signatureTree: {
    title: "Signatures along the phylogeny",
    source: `${S.SIGS}; ${S.SNV_MATRIX}`,
    calc: "Each mutation assigned to its most probable signature given the joint fit; clade bars count unique assigned sites, in the browser.",
    where: "both",
  },
  /* ---- QC ---- */
  qc: {
    title: "Cell QC",
    source: `${S.QC_EXPORT}; ${S.CELL_CN}; rna/cells.json (nCount_RNA, nFeature_RNA, percent_mt)`,
    calc: "FGA vs rounded ploidy, CN segments and chrX CN computed in the browser; outliers = > 3 MADs from the patient median.",
    where: "both",
  },
  /* ---- cohort ---- */
  cohortOverview: {
    title: "Single-cell patients",
    source: "datafiles.json (clone_id per cell from the `dataset` step) and each patient's metadata.json",
    calc: "Cell and clone counts per patient, in the browser.",
    where: "both",
  },
  cohortHeatmap: {
    title: "Cohort CN heatmap",
    source: CELL_CN,
    calc: "Per patient the median CN of its cells per bin (or one row per clone / cell), in the browser.",
    where: "both",
  },
  oncoprint: {
    title: "Oncoprint",
    source: EVENTS,
    calc: "Strongest alteration per gene and patient, shaded by fraction of tumor cells; clade F1 filter applied in the browser.",
    where: "both",
  },
  tmb: {
    title: "Mutation burden (TMB)",
    source: SNV_MATRIX,
    calc: "CellPhy-input sites counted by tree category per patient; per Mb uses median breadth x 3,100 Mb. In the browser.",
    where: "both",
  },
  cohortSignatures: {
    title: "Cohort signatures",
    source: SIGS,
    calc: "Backend fits per set compared across patients; truncal vs later counts by Fisher's exact test in the browser.",
    where: "both",
  },
  cohortAmplicons: {
    title: "Cohort amplicons",
    source: WALKS,
    calc: "Walk copies per patient, carrier fractions and co-occurrence of driver amplicons, in the browser.",
    where: "both",
  },
  cohortEvents: {
    title: "All events",
    source: EVENTS,
    calc: "Every patient's filtered events, filtered and sorted in the browser.",
    where: "backend",
  },
  cohortRna: {
    title: "Cohort RNA",
    source: "data/_cohort/rna/cells.json (merged Seurat objects, Harmony on patient, UMAP; `register` step, skilift sc_export_cohort_rna) and each patient's rna/",
    calc: "Composition (chi-square), gene expression and DE across patients computed in the browser.",
    where: "both",
  },
  cohortQc: {
    title: "Cohort cell QC",
    source: QC_EXPORT,
    calc: "Box-and-strip per patient; outliers > 3 MADs within the patient, in the browser.",
    where: "both",
  },
  cohortScatter: {
    title: "Patient scatter",
    source: `${S.SNV_MATRIX}; ${S.EVENTS}; ${S.QC_EXPORT}`,
    calc: "Per-patient metrics (burden, diversity, FGA, …) summarised in the browser.",
    where: "browser",
  },
  figLandscape: {
    title: "Amplicon landscape",
    source: WALKS,
    calc: "Per patient and driver-gene walk set: copies per cell summed over the set's walks (violin + box), % of cells carrying, upset of sets — in the browser.",
    where: "both",
  },
  figPhyloSignal: {
    title: "Inherited or redrawn?",
    source: `${S.WALKS}; ${S.TREE}; ${S.QC_EXPORT}`,
    calc: "Moran's I of walk copies on the tree, z vs 199 label permutations; depth, ploidy and SNV counts as controls. In the browser.",
    where: "browser",
  },
  figSubclonal: {
    title: "Subclonal findings",
    source: `${S.EVENTS}; ${S.WALKS}; ${S.TREE}`,
    calc: "Driver events and amplicons in part of a tumour; tumour-cell fraction and clade F1 per finding, events sharing carriers merged. In the browser.",
    where: "browser",
  },
  figClonalAmplicon: {
    title: "Clonal amplicon view",
    source: `${S.SNV_MATRIX}; ${S.CELL_CN}; ${S.WALKS}; ${S.TREE}`,
    calc: "Cells in tree order with whole-genome SNV VAF, CN across the walk region and walk copies side by side; drawn in the browser.",
    where: "both",
  },
  /* ---- RNA fusions / splicing / heritability / branch diff ---- */
  rnaFusions: {
    title: "RNA fusions",
    source: "data/<patient>/rna/fusions.json: STAR chimeric + Arriba run per RNA cell, merged with DNA-event matches in the back end",
    calc: "Filtering, carrier cells along the tree and DNA-match badges in the browser.",
    where: "both",
  },
  splicing: {
    title: "Splicing",
    source: "data/<patient>/rna/splicing.json: regtools junction counts per cell, LeafCutter-style intron clusters, known variants (back end)",
    calc: "PSI per group (clone or RNA field) and per-cell junction usage in tree order, in the browser.",
    where: "both",
  },
  cohortSplicing: {
    title: "Splicing between patients",
    source: "data/_cohort/rna/splicing.json: clusters whose junction usage differs between patients (chi-square, BH q; back end)",
    calc: "Search and per-patient sashimi-lite of the chosen cluster drawn in the browser.",
    where: "both",
  },
  heritability: {
    title: "Heritable vs plastic state",
    source: `${S.RNA}; ${S.TREE}`,
    calc: "Moran's I of per-cell state scores / genes with inverse patristic-distance weights (analytic z or permutations), in the browser.",
    where: "browser",
  },
  branchDiff: {
    title: "Branch diff",
    source: `${S.CELL_CN}; ${S.SNV_MATRIX}; ${S.RNA}`,
    calc: "Clade vs sister clade: CN segments and junctions that differ, SNVs mapped to the branch with a signature fit, DE — in the browser.",
    where: "browser",
  },
  /* ---- Evidence (precompute) ---- */
  cellCycle: {
    title: "Cell cycle",
    source: "data/<patient>/precompute/sphase.json + sphase_profiles.json (coverage vs replication timing, srctools precompute); RNA S / G2M from rna/cells.json",
    calc: "DNA and RNA cell-cycle calls compared per cell in the browser.",
    where: "both",
  },
  telomeres: {
    title: "TERT and telomeres",
    source: "data/<patient>/precompute/telomeres.json + region_calls.json (targeted TERT promoter calls, telomere content; srctools precompute)",
    calc: "Per-clone summaries with TERT expression (rna/) and ATRX events, in the browser.",
    where: "both",
  },
  readSlices: {
    title: "Read evidence",
    source: "data/<patient>/slices/ RG-tagged slice BAMs + regions.json, precompute/region_calls.json (srctools precompute)",
    calc: "Reads shown per clone in igv.js; per-cell genotypes as precomputed.",
    where: "backend",
  },
  precomputeStatus: {
    title: "Precompute status",
    source: "data/_precompute/status.json (gos_sc_precompute.py status) and precompute/manifest.json per patient",
    calc: "Shown as written; no browser computation.",
    where: "backend",
  },
  paperFigures: {
    title: "Paper figures",
    source: `${S.WALKS}; ${S.SNV_MATRIX}; ${S.TREE}; ${S.EVENTS}`,
    calc: "Amplicon landscape, phylogenetic signal (Moran's I with permutations), subclonal findings and clonal amplicon views, computed in the browser.",
    where: "browser",
  },
  rnaFindings: {
    title: "RNA key findings",
    source: `${S.RNA}; clone labels (datafiles.json); ${S.EVENTS}`,
    calc: "State mix; clone x state / cycling / region (Fisher, BH); driver gene in carriers vs others (Wilcoxon); clone markers (Wilcoxon DE).",
    where: "browser",
  },
  /* ---- Story tab (precomputed by analysis/story/scripts in the project folder) ---- */
  story: {
    title: "Single-cell story",
    source: "_cohort/story.json from analysis/story/scripts/story.py (junctions, split reads, inserts, ecDNA, modules, heritability, dosage, cross-modal)",
    calc: "All text and numbers are computed by the scripts; the tab only renders them.",
    where: "backend",
  },
  "story-ecdna": {
    title: "ecDNA vignette",
    source: `${S.WALKS}; ${S.RNA}`,
    calc: "Carriers and variance/mean of copies; species co-occurrence (Fisher); copies by clone (Kruskal); gene copies vs expression (Spearman, BH).",
    where: "backend",
  },
  "story-heritability": {
    title: "Inherited programs",
    source: `${S.TREE}; ${S.RNA}; module scores (modules.py)`,
    calc: "Each cell vs its closest tree relative (label match or score Spearman); null permutes within clone x region x plate. Mantel: tree vs expression distance.",
    where: "backend",
  },
  "story-heritable": {
    title: "Inherited programs",
    source: `${S.TREE}; ${S.RNA}`,
    calc: "Closest-relative statistic with a clone x region x plate permutation null.",
    where: "backend",
  },
  "story-programs": {
    title: "Meta-programs",
    source: S.RNA,
    calc: "Per-patient NMF (k 4-9, robust programs), clustered into meta-programs; labels by hypergeometric test vs GBM/3CA, Hallmark, GO; control-matched scores.",
    where: "backend",
  },
  "story-junction-mechanisms": {
    title: "Junction mechanisms",
    source: "per-cell JaBbA graph ALT edges (balanced_gg) merged by breakpoint; read slices data/<cell>/reads.bam",
    calc: "Split reads with an SA alignment at the partner: overlap = microhomology, gap = insertion (mode over reads); inserts >= 15 bp placed with bwa mem.",
    where: "backend",
  },
  "story-junctions": {
    title: "Junction mechanisms",
    source: "per-cell JaBbA graph ALT edges; read slices data/<cell>/reads.bam",
    calc: "Split-read microhomology / insertion per junction; templated-insert sources from bwa mem.",
    where: "backend",
  },
  "story-dosage": {
    title: "Copy-number dosage",
    source: "per-cell JaBbA graphs (total CN at each gene); rna/ matrix",
    calc: "Genes with >= 10% of cells off their modal CN: Spearman CN vs expression (BH); summarized per chromosome arm.",
    where: "backend",
  },
  "story-states": {
    title: "Clones, states and place",
    source: `${S.RNA}; clone labels (datafiles.json)`,
    calc: "Chi-square of state x clone and region x clone.",
    where: "backend",
  },
};

export const provenanceOf = (id) => PROVENANCE[id] || null;
