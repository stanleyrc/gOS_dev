// Help Center index (components/singleCell/help/helpCenter.js): where every
// single-cell view lives, how it is computed, and longer method write-ups.
// Card entries reuse the provenance registry (provenance.js), so a card's
// hover and its Help Center entry never disagree; LOCATIONS adds where the
// card sits. Keep d3-free so jest can test the search.
import { PROVENANCE } from "./provenance";

// Detail-view tab keys (containers/detailView/index.js) and cohort views
// (singleCellCohortPanel.js analysisTabs).
export const TAB = {
  overall: 0,
  singleCell: 7,
  rna: 8,
  signatures: 9,
  rnaCn: 10,
  qc: 11,
  report: 12,
  circos: 13,
  ecdna: 14,
  evidence: 15,
  story: 16,
};

const P = (tab, anchor) => ({ scope: "patient", tab, anchor });
const C = (view, anchor) => ({ scope: "cohort", view, anchor });

/** Where each provenance id is shown: patient tabs and / or cohort views. */
export const LOCATIONS = {
  cnHeatmap: [P(TAB.singleCell), P(TAB.ecdna)],
  snvHeatmap: [P(TAB.singleCell)],
  junctionHeatmap: [P(TAB.singleCell)],
  phylogeny: [P(TAB.singleCell)],
  umap: [P(TAB.singleCell), P(TAB.rna)],
  cellTracks: [P(TAB.singleCell)],
  reads: [P(TAB.singleCell)],
  circos: [P(TAB.circos)],
  phyloBars: [P(TAB.singleCell), P(TAB.rnaCn)],
  branchDiff: [P(TAB.singleCell)],
  keyFindings: [P(TAB.report), P(TAB.overall), C("reports")],
  cloneFraction: [P(TAB.report), C("reports")],
  cladeFit: [P(TAB.report), C("drivers")],
  driverMatrix: [P(TAB.report), C("reports")],
  burden: [P(TAB.report), C("overview"), C("reports")],
  furtherFindings: [P(TAB.report), C("reports")],
  rnaFindings: [P(TAB.report), C("overview")],
  clonalHistory: [P(TAB.report)],
  ampTiming: [P(TAB.report)],
  branchRates: [P(TAB.report)],
  walks: [P(TAB.ecdna)],
  walkCopies: [P(TAB.ecdna)],
  walkNesting: [P(TAB.ecdna)],
  walkCooccurrence: [P(TAB.ecdna)],
  walkDiagram: [P(TAB.ecdna)],
  rnaComposition: [P(TAB.rna)],
  de: [P(TAB.rna)],
  markers: [P(TAB.rna), C("rna")],
  violin: [P(TAB.rna)],
  geneExplorer: [P(TAB.rna)],
  phyloExpression: [P(TAB.rna)],
  heritability: [P(TAB.rna)],
  rnaFusions: [P(TAB.rna)],
  splicing: [P(TAB.rna)],
  dosage: [P(TAB.rnaCn), C("rna")],
  signatureSets: [P(TAB.signatures)],
  signatureCompare: [P(TAB.signatures)],
  signatureTree: [P(TAB.signatures)],
  signatureFit: [P(TAB.signatures)],
  qc: [P(TAB.qc)],
  cellCycle: [P(TAB.evidence)],
  telomeres: [P(TAB.evidence)],
  readSlices: [P(TAB.evidence)],
  precomputeStatus: [P(TAB.evidence)],
  cohortOverview: [C("overview")],
  cohortHeatmap: [C("overview")],
  oncoprint: [C("drivers")],
  tmb: [C("mutations")],
  cohortSignatures: [C("mutations")],
  cohortAmplicons: [C("amplicons")],
  cohortEvents: [C("events")],
  cohortRna: [C("rna")],
  cohortSplicing: [C("rna")],
  cohortQc: [C("qc")],
  cohortScatter: [C("scatter")],
  figLandscape: [C("figures")],
  figPhyloSignal: [C("figures")],
  figSubclonal: [C("figures")],
  figClonalAmplicon: [C("figures")],
  paperFigures: [C("figures")],
  story: [P(TAB.story), C("story")],
  "story-ecdna": [P(TAB.story), C("story")],
  "story-heritability": [P(TAB.story), C("story")],
  "story-heritable": [P(TAB.story), C("story")],
  "story-programs": [P(TAB.story), C("story")],
  "story-junction-mechanisms": [P(TAB.story), C("story")],
  "story-junctions": [P(TAB.story), C("story")],
  "story-dosage": [P(TAB.story), C("story")],
  "story-states": [P(TAB.story), C("story")],
};

// Duplicate story ids (two spellings used by story.json chapters): list once.
const HIDDEN = new Set(["story-heritable", "story-junctions"]);

const TREE_S = "tree.nwk (CellPhy, rooted)";
const SNV_S = "snv_matrix.json (`snvs` + `map`)";
const PRE = "data/<patient>/precompute/ (srctools precompute, gos_sc_precompute.py)";

/** Cards without a provenance hover; `anchor` = text of the card title used to scroll to it. */
export const EXTRA_CARDS = {
  fishPlot: {
    title: "Fish plot (clones along molecular time)",
    anchor: "fish plot",
    source: `${TREE_S}; ${SNV_S}`,
    calc: "Clades holding ≥ the chosen share of tumour cells, nested by ancestry; a band opens at its founding branch (x = SNV-scaled tree depth) and reaches its sampled share where the branch ends. One time point: order and nesting, not growth curves.",
    where: "browser",
    locations: [P(TAB.evidence, "fish plot")],
    keywords: "clone evolution muller timeline",
  },
  convergence: {
    title: "Convergent evolution (same event on independent branches)",
    anchor: "Convergent evolution",
    source: "filtered.events.json (`events`); tree.nwk",
    calc: "Arm-level gains / losses and focal amplifications / homozygous deletions of GBM drivers with ≥ 2 carrier clades whose common ancestor mostly lacks the event.",
    where: "browser",
    locations: [P(TAB.evidence, "Convergent evolution")],
    keywords: "parallel recurrent homoplasy",
  },
  mtdna: {
    title: "mtDNA copy number and heteroplasmy",
    anchor: "mtDNA",
    source: `${PRE}: chrM vs autosome read density and heteroplasmic chrM sites`,
    calc: "Copies per cell by clone; each heteroplasmic site's phylogenetic signal on the nuclear tree (Moran's I of the VAF). Sites that follow the tree are lineage markers; others are drift, artefacts or NUMT reads.",
    where: "both",
    locations: [P(TAB.evidence, "mtDNA")],
    keywords: "mitochondria lineage check",
  },
  fitness: {
    title: "Fitness from tree shape (local branching index)",
    anchor: "Fitness from tree shape",
    source: `${TREE_S}; rna/; ${PRE}`,
    calc: "Local branching index (LBI) per tumour cell (high = recently expanding lineage), by clone, correlated with GBM state programmes, proliferation, S-phase, telomeres, mtDNA and QC (Spearman ρ, BH q).",
    where: "browser",
    locations: [P(TAB.evidence, "Fitness from tree shape")],
    keywords: "LBI selection expansion growth",
  },
  rnaClone: {
    title: "DNA-anchored clone assignment from RNA",
    anchor: "DNA-anchored clone",
    source: "rna/ (Seurat export); clone labels (datafiles.json)",
    calc: "k-nearest-neighbour classifier on principal components of the most variable genes, trained on cells with DNA + RNA; leave-one-out accuracy; RNA-only cells get a clone with a vote share. Also an inferCNV-style check: centred expression per arm vs DNA copy number.",
    where: "browser",
    locations: [P(TAB.evidence, "DNA-anchored clone")],
    keywords: "knn classifier infercnv rna-only cells",
  },
  incoherence: {
    title: "Amplicons that do not follow the tree",
    anchor: "do not follow the tree",
    source: "<cell>/complex.json (`cells`); tree.nwk",
    calc: "Per-cell copies of an amplified segment in tree leaf order; copy numbers that jump between sister cells (not inherited) suggest extrachromosomal (ecDNA-like) segregation.",
    where: "browser",
    locations: [P(TAB.evidence, "do not follow the tree")],
    keywords: "ecdna incoherence segregation",
  },
  controls: {
    title: "Non-tumour cells as internal controls",
    anchor: "internal controls",
    source: "datafiles.json qc_* (`dataset`); <cell>/complex.json; rna/",
    calc: "Noise floor: the fraction of the genome called altered in diploid normal cells estimates the false-positive CN rate; their dropout and MAPD the technical floor. Also lists DNA tumour cells whose expression resembles non-malignant cells.",
    where: "browser",
    locations: [P(TAB.evidence, "internal controls")],
    keywords: "normal cells false positive noise floor mapd",
  },
  timing: {
    title: "Molecular timing from clock-like mutations",
    anchor: "Molecular timing",
    source: "signatures.json (`signatures`); snv_matrix.json",
    calc: "Uses SBS1 / SBS5 (from the joint fit) as a ruler: the tumour MRCA's position between zygote (0) and sampling (1), when each clade was founded, and ongoing clock burden per clone — each corrected for the cell's detection sensitivity (share of truncal sites it detects).",
    where: "browser",
    locations: [P(TAB.evidence, "Molecular timing")],
    keywords: "sbs1 sbs5 clock mrca age",
  },
  treeShape: {
    title: "Tree shape and chromosomal instability",
    anchor: null,
    source: "snv_matrix.json; tree.nwk; filtered.events.json",
    calc: "Per patient: trunk fraction of tumour SNVs, share of private one-cell SNVs, Sackin imbalance vs a Yule tree (> 1 = caterpillar-like, e.g. sweeps), spread of the local branching index, and subclonal / one-cell CN events.",
    where: "browser",
    locations: [C("treeshape")],
    keywords: "sackin yule imbalance trunk cin",
  },
};

/**
 * Longer write-ups of how things are computed. `sections` are [heading, text]
 * pairs; `related` are card ids (provenance / EXTRA_CARDS) linked under it.
 */
export const METHODS = [
  {
    id: "m-pipeline",
    title: "From sequenced cells to gOS: the pipeline",
    keywords: "upload gos_sc_upload steps skilift srctools back end precompute register",
    summary: "Which pipeline step writes which file, and what the browser computes on top.",
    sections: [
      ["Per-cell and per-patient files", "srctools inst/gos_single_cell/gos_sc_upload.R rebuilds everything from all_pairs.rds, one patient at a time. Steps, in order: cells (per-cell complex.json, allelic.json, coverage.arrow, mutations.json; the patient's rooted tree.nwk), drivers (SnpEff + OncoKB on tree sites and basic-QC sites), snvs (snv_matrix.json read counts), map (each site placed on the tree), signatures (SBS96 contexts and SigProfilerAssignment fits), dataset (datafiles.json, with clone_id and qc_* per cell), cna (gGnome fusions and driver CNAs per cell), events (filtered.events.json), rna (Seurat export to rna/), walks (ecDNA walks.json), bams (reads.bam slices for IGV) and register (adds the dataset to gOS)."],
      ["Precompute and story", "Heavier read-level analyses (S-phase, telomeres, TERT promoter, mtDNA, slice BAMs) come from srctools precompute (gos_sc_precompute.py submit / run / status), written to data/<patient>/precompute/ and shown in the Evidence tab. The cohort narrative comes from analysis/story/scripts (story.py), copied to data/_cohort/story.json and shown in the Story views."],
      ["Browser vs back end", "Each card's database icon says where its numbers come from: “precomputed (back end)” is shown as stored; “computed in browser” is recomputed live from the loaded files, so it follows your filters and selections; “back end + browser” means precomputed inputs with browser maths on top."],
    ],
    related: ["precomputeStatus", "story"],
  },
  {
    id: "m-cn",
    title: "Copy number and junctions per cell",
    keywords: "jabba ggraph total cn allelic dryclean coverage segments junctions alt edges fga ploidy heatmap",
    summary: "JaBbA genome graphs per cell, how the heatmaps and FGA are derived.",
    sections: [
      ["Graphs", "Each cell's total copy number is its JaBbA junction-balanced genome graph (jabba_gg_slack1e3, else jabba_wg_slack1e3), lifted into complex.json: nodes carry integer copy number, ALT edges are the rearrangement junctions with their copy number. Allelic copy number comes from the balanced graph (balanced_gg) in allelic.json."],
      ["Coverage", "coverage.arrow is the dryclean-normalised 1 kb tumour coverage converted to absolute copy number with the cell's ploidy (rel2abs); the EGFR locus is masked where amplification overwhelms the fit."],
      ["Heatmaps", "The browser bins each cell's segments onto the genome grid; rows follow the tree. In the junction heatmap ALT edges are matched across cells by breakpoint (orientation-aware, within 1 kb) and coloured by their copy number in each cell (0 if absent)."],
      ["Derived numbers", "Fraction genome altered (FGA) = fraction of the genome whose CN differs from the cell's rounded ploidy (modal CN). Clone pseudobulk (circos, cohort heatmap) = median CN of the clone's or patient's cells per bin."],
    ],
    related: ["cnHeatmap", "junctionHeatmap", "cellTracks", "circos", "cohortHeatmap"],
  },
  {
    id: "m-tree",
    title: "Phylogeny and clones",
    keywords: "cellphy tree newick root outgroup normals upgma clade clone selection",
    summary: "How the tree is built and rooted, and what clones and clades are.",
    sections: [
      ["Tree", "tree.nwk is the CellPhy maximum-likelihood search tree on the patient's filtered SNV sites, rooted on the outgroup normal cells (skilift sc_root_tree). Without a tree.nwk gOS infers a UPGMA tree from the Jaccard distance of SNVs called in ≥ 2 cells, or from copy-number distance if no SNVs are shared; the heatmap title says which."],
      ["Clones and clades", "Clones are the clone_id labels written per cell by the dataset step. A clade is any internal node's set of descendant cells; click an internal node to select it. Long branches can be shortened for display only."],
      ["Fit of an alteration to the tree", "Clade F1 = best F1 between the cells carrying an alteration and any clade (1 = the carriers are exactly one clade); ≥ 0.7 is called clade-consistent."],
    ],
    related: ["phylogeny", "cladeFit", "branchDiff", "fitness", "treeShape"],
  },
  {
    id: "m-snv",
    title: "SNV genotypes, tree mapping and burden",
    keywords: "snv vaf genotype site_qc_matrices gq truncal subclonal private map confidence clade score burden tmb per mb amplified",
    summary: "From read counts per cell to site categories, burden and amplified SNVs.",
    sections: [
      ["Genotypes", "snv_matrix.json holds alt / total reads of every tree and driver site in every cell (from site_qc_matrices.rds AD / DP; genotype calls need PL GQ ≥ 10). VAF = alt / (ref + alt). A cell without coverage at a site is “no data”, not reference."],
      ["Mapping onto the tree", "The map step places each site on the rooted tree with a single-gain model: truncal = the tumour MRCA (all tumour cells), subclonal = another node inside the tumour clade, private = one cell, outside_tumor = a node outside the tumour clade. Map confidence (0–1) is low for sites whose alt cells scatter across clades. Clade score = F1 of the site's alt calls against its mapped clade."],
      ["Burden and rates", "Burden counts CellPhy-input sites per category. Per Mb divides by callable megabases (breadth of coverage × 3,100 Mb). Branch rates = sites gained per branch per callable Mb."],
      ["Amplified SNV", "A site in a cell with total CN ≥ 4 where VAF × CN ≥ 1.5 mutant copies: the mutation sits on the amplified allele, i.e. it arose before the amplification (amplification timing)."],
    ],
    related: ["snvHeatmap", "burden", "tmb", "branchRates", "ampTiming"],
  },
  {
    id: "m-drivers",
    title: "Driver alterations, clonality and clonal history",
    keywords: "oncokb snpeff drivers events filtered events tier strong events clonal subclonal rare convergence oncoprint",
    summary: "How driver events are called and pooled, and how clonality is scored.",
    sections: [
      ["Calls", "SNVs / indels are annotated with SnpEff + OncoKB; CNAs and fusions come from each cell's graph (cna step, gGnome fusions). skilift writes a filtered.events.json per cell; the events step pools them per patient with the carrier cells of each event."],
      ["Clonality", "Fraction of tumour cells = carrier cells / tumour cells (normals excluded). Clonal ≥ 85%, subclonal 10–85%, rare < 10%. Strong events: homozygous deletions in ≥ 10% of cells; anything else in ≥ 3 cells and ≥ 5% of cells (the default filter of oncoprint, report and convergence views)."],
      ["Clonal history", "Each event is placed on the branch above its best-fitting clade, with the SNVs gained on that branch and the signature that rises most against the parent."],
    ],
    related: ["driverMatrix", "cloneFraction", "keyFindings", "clonalHistory", "oncoprint", "convergence", "cohortEvents"],
  },
  {
    id: "m-signatures",
    title: "Mutational signatures",
    keywords: "sigprofiler cosmic sbs96 nnls bootstrap assignment cosine clock sbs1 sbs5",
    summary: "Joint fits, per-mutation assignment, clade tests and bootstrap intervals.",
    sections: [
      ["Fits", "Preset site sets (all tree sites, truncal / subclonal / private, each clone) are fitted to COSMIC v3.4 SBS (GRCh38) with SigProfilerAssignment in the signatures step. Sets without a back-end fit are fitted in the browser by NNLS with forward selection, restricted to the patient's signatures."],
      ["Assignment", "Each mutation gets the signature with the highest posterior P(signature | channel) ∝ activity × profile for its 96-channel context. Per-cell and per-clade burdens count distinct assigned mutations."],
      ["Statistics", "Clade vs rest: Fisher's exact test of a signature's count inside a clade against the rest of the tree. Bootstrap CIs: 100 refits on resampled mutations, 2.5–97.5 percentiles. Set similarity: cosine of SBS96 profiles. Molecular timing uses only the clock-like SBS1 / SBS5."],
    ],
    related: ["signatureSets", "signatureCompare", "signatureTree", "cohortSignatures", "timing"],
  },
  {
    id: "m-ecdna",
    title: "ecDNA and amplicon walks",
    keywords: "ecdna walks gwalk amplicon cplex copies carriers curated cn_filter nesting cooccurrence moran",
    summary: "Where walks and per-cell copies come from and how the ecDNA views summarise them.",
    sections: [
      ["Walks", "Cycles and paths through the patient's junction-balanced graph (gGnome gWalks) from db/amplicon_copies/all_patients.rds, with a copy number per cell from the CPLEX fit (amp_counts_dt). The walks step (skilift sc_export_walks) writes walks.json. Curated = passed the pipeline's cn_filter. Most raw walks are spurious; use the cell and copy filters."],
      ["Summaries", "Carriers = cells with ≥ the carrier threshold of copies; median copies over carriers; family totals and clone carrier %. Nesting = fraction of one walk's bases inside another. Co-occurrence groups cells by the set of walks they carry, with Spearman ρ between walks' copies."],
      ["Inherited or redrawn?", "Moran's I of walk copies on the tree with a z-score against 199 label permutations; chromosomal amplicons are inherited (high I), ecDNA copies are redrawn at each division (low I, jumps between sister cells)."],
    ],
    related: ["walks", "walkCopies", "walkNesting", "walkCooccurrence", "walkDiagram", "figPhyloSignal", "incoherence", "story-ecdna", "cohortAmplicons"],
  },
  {
    id: "m-rna",
    title: "RNA: linking, DE, markers, dosage and heritability",
    keywords: "seurat umap wilcoxon de log2fc markers composition chi-square dosage spearman violin moran heritability harmony pca program score tumor only",
    summary: "How RNA cells link to DNA cells and the tests behind each RNA card.",
    sections: [
      ["Data and linking", "rna/ is the lab's Seurat object exported per patient: log-normalised matrix, cells.json with metadata, the original UMAP and umap_dna (recomputed on RNA cells that also have DNA). RNA cells link to DNA cells by the same ID or the cell's rna_id. “Tumor only” hides cells annotated as non-malignant."],
      ["Differential expression", "Wilcoxon rank-sum per gene (Seurat FindMarkers defaults); log2FC = log2((Σ expm1(A) + 1) / nA) − log2((Σ expm1(B) + 1) / nB); Bonferroni / BH; gene-set over-representation by hypergeometric test. Markers come from Seurat FindAllMarkers in the pipeline for Seurat fields; DNA clones and other groups are tested in the browser."],
      ["Composition and dosage", "Composition: share of each state per group with a chi-square test of independence. Dosage: Spearman ρ between a gene's total CN and its expression across linked cells, least-squares slope, BH across genes."],
      ["Heritability", "Moran's I of per-cell state scores or genes on the tree with inverse patristic-distance weights (analytic z or permutations): high I = state inherited along the lineage, low = plastic."],
      ["Cohort", "Cohort UMAP: merged Seurat objects, Harmony on patient. Pooled DE merges matrices on gene names; per-patient DE combines p-values by Fisher's method. Cohort PCA: ≤ 1,500 cells, 1,000 most variable genes z-scored, top 10 PCs. Program score = mean per-gene z-score within a patient."],
    ],
    related: ["de", "markers", "rnaComposition", "dosage", "violin", "geneExplorer", "phyloExpression", "heritability", "umap", "cohortRna", "rnaFindings", "rnaClone"],
  },
  {
    id: "m-fusions-splicing",
    title: "RNA fusions and splicing",
    keywords: "star arriba chimeric fusion regtools leafcutter psi intron cluster sashimi egfrviii exon skipping novel junction",
    summary: "Per-cell STAR + Arriba fusions and regtools / LeafCutter-style splicing.",
    sections: [
      ["Fusions", "Each RNA cell is aligned with STAR (chimeric output) and called with Arriba; calls are merged per patient and matched against DNA junction events in the back end (rna/fusions.json). The browser filters them and shows carrier cells along the tree with DNA-match badges."],
      ["Splicing", "regtools extracts junction counts per cell; junctions are grouped into LeafCutter-style intron clusters (rna/splicing.json) and typed against the GTF (annotated, exon skip, novel donor / acceptor / pair). PSI is computed per group (clone or RNA field) in the browser; clusters are ranked by a Kruskal–Wallis test on per-cell PSI across groups (BH q). Between patients, clusters are tested by chi-square on pooled counts with BH q (data/_cohort/rna/splicing.json)."],
      ["Sashimi plots", "Exons of all GTF transcripts of the gene are collapsed and drawn near scale with introns log-compressed; each track pools a group's reads, arcs join the exon ends of each junction (width = reads, label = reads · PSI, dashed = unannotated)."],
      ["Known variants", "EGFRvIII (exon 1 → 8), EGFRvII, EGFR C-terminal deletions (Δ25–26, Δ25–27), MET exon 14 skipping and PDGFRA Δ8–9 are counted per cell from their alternative vs reference junction; carriers are shown along the tree with the gene's DNA copy number, and their RNA reads at the junction (rna/splice_reads/) open in IGV."],
    ],
    related: ["rnaFusions", "splicing", "cohortSplicing"],
  },
  {
    id: "m-evidence",
    title: "Read-level evidence (precompute)",
    keywords: "precompute sphase cell cycle replication timing telomere tert promoter slice bam mtdna evidence",
    summary: "What the Evidence tab precomputes from reads and how it is shown.",
    sections: [
      ["Cell cycle", "S-phase from DNA: coverage vs replication timing per cell (replicating cells show early-replicating regions at higher depth). Compared with RNA S / G2M scores."],
      ["TERT and telomeres", "Targeted calls at the TERT promoter hotspots and telomere repeat content per cell, summarised per clone with TERT expression and ATRX events."],
      ["Reads", "RG-tagged slice BAMs per region (data/<patient>/slices/) with per-cell genotypes; shown per clone in igv.js."],
      ["Status", "data/_precompute/status.json lists which analyses ran for which patient; cards say “not computed” with the missing step otherwise."],
    ],
    related: ["cellCycle", "telomeres", "readSlices", "mtdna", "precomputeStatus", "fishPlot", "fitness", "controls"],
  },
  {
    id: "m-story",
    title: "Story analyses (junction mechanisms, programs, inheritance)",
    keywords: "story microhomology split reads templated insertion bwa nmf meta-programs closest relative mantel dosage cross-modal",
    summary: "The precomputed cohort narrative behind the Story views.",
    sections: [
      ["Junction mechanisms", "Per-cell JaBbA ALT edges merged by breakpoint across cells. Split reads with a supplementary (SA) alignment at the partner breakpoint give the junction sequence: overlap = microhomology, gap = insertion (mode over reads). Inserts ≥ 15 bp are placed with bwa mem as local, chained, distant or repetitive templates."],
      ["Meta-programs", "Per-patient NMF (k 4–9, programs robust across k), clustered into meta-programs and labelled by hypergeometric tests against GBM / 3CA, Hallmark and GO sets; scores are control-gene matched."],
      ["Inheritance", "Each cell is compared with its closest tree relative (label match or score Spearman); the null permutes labels within clone × region × plate. Mantel test of tree vs expression distance."],
      ["Dosage and ecDNA", "Genes with ≥ 10% of cells off their modal CN: Spearman CN vs expression (BH), summarised per arm. ecDNA: carriers, variance / mean of copies, species co-occurrence (Fisher), copies by clone (Kruskal), copies vs expression."],
    ],
    related: ["story-junction-mechanisms", "story-programs", "story-heritability", "story-dosage", "story-ecdna", "story-states"],
  },
  {
    id: "m-qc",
    title: "Cell QC metrics",
    keywords: "qc reads depth breadth mad mapd gini ado dropout outliers ncount nfeature percent mt",
    summary: "Per-cell QC fields and how outliers are flagged.",
    sections: [
      ["DNA", "qc_* fields (reads, depth, breadth, MAD, Gini, allelic dropout…) are copied from all_pairs.rds by the dataset step. FGA, CN segment counts and chrX CN are computed in the browser from complex.json."],
      ["RNA", "nCount_RNA, nFeature_RNA and percent_mt from rna/cells.json."],
      ["Outliers", "A cell is flagged when a metric is > 3 MADs from its patient's median. Diploid normal cells give the noise floor (see Internal controls)."],
    ],
    related: ["qc", "cohortQc", "controls"],
  },
  {
    id: "m-using",
    title: "Using the single-cell views",
    keywords: "how to select cells clade zoom pan brush shortcut open cell report compare groups gene search",
    summary: "Selecting cells and clades, zooming, comparing groups.",
    sections: [
      ["Navigate the genome", "The navigation bar (brush strip, location box, gene search) on the Single-Cell tab drives all genome plots below it; brush several regions to see them side by side. Drag to pan, ⌘ / Ctrl / Alt-scroll to zoom, click a chromosome label to jump to it."],
      ["Select cells", "Click a leaf or heatmap row to pick a cell; ⌘ / Ctrl-click adds or removes, Shift-click selects a range, clicking an internal node selects its clade. Up to 6 selected cells get coverage and CN tracks; “Open cell report” opens the cell's own gOS report."],
      ["Compare groups", "On the RNA tab set group A and B from any selection (or clone vs rest) and run DE; results show as a volcano, gene table and gene-set enrichment, downloadable as TSV."],
      ["Find things", "Press ? anywhere (outside a text box) to open this Help Center; “Go” jumps to a card and highlights it."],
    ],
    related: ["phylogeny", "cellTracks", "de"],
  },
];

/** Score definitions (components.single-cell.help.<key>-name / <key>), by section. */
export const HELP_SECTIONS = [
  ["scores", ["clade-fit", "clade-score", "strong-events", "amplified-snv", "walks", "fga", "map-confidence", "categories"]],
  ["signatures", ["joint-fit", "assignment", "clade-vs-rest", "bootstrap"]],
  ["rna", ["tumor-only", "markers", "dosage", "composition"]],
  ["cohort", ["oncoprint", "per-mb", "convergence", "sigmat", "cohort-de", "cohort-pca", "program-score"]],
];

const norm = (s) => (s == null ? "" : String(s)).toLowerCase();

/**
 * Flat list of searchable entries. `t` resolves tab / view labels and the
 * definition texts (components.single-cell.help.*), `defs` is the
 * helpDrawer SECTIONS list of [section, keys].
 */
export function buildHelpEntries({ defs = HELP_SECTIONS, t = (k) => k } = {}) {
  const cards = Object.entries(PROVENANCE)
    .filter(([id]) => !HIDDEN.has(id))
    .map(([id, p]) => ({ kind: "card", id, title: p.title, source: p.source, calc: p.calc, where: p.where, locations: LOCATIONS[id] || [], keywords: "" }));
  const extras = Object.entries(EXTRA_CARDS).map(([id, e]) => ({ kind: "card", id, ...e }));
  const methods = METHODS.map((m) => ({ kind: "method", ...m, text: m.sections.map(([h, b]) => `${h} ${b}`).join(" ") }));
  const definitions = defs.flatMap(([section, keys]) =>
    keys.map((k) => ({
      kind: "definition",
      id: `def-${k}`,
      key: k,
      section,
      title: t(`components.single-cell.help.${k}-name`),
      text: t(`components.single-cell.help.${k}`),
      keywords: t(`components.single-cell.help.${section}`),
    })),
  );
  const all = [...cards, ...extras, ...methods, ...definitions];
  return all.map((e) => ({
    ...e,
    _title: norm(e.title),
    _hay: norm([e.title, e.keywords, e.summary, e.text, e.source, e.calc, (e.locations || []).map((l) => locationLabel(l, t)).join(" ")].join(" ")),
  }));
}

/** Label of a location, e.g. "Single-Cell Report" or "Single-Cell Cohort › Drivers". */
export function locationLabel(loc, t = (k) => k) {
  if (!loc) return "";
  if (loc.scope === "patient") return t(`containers.detail-view.tabs.tab${loc.tab}`);
  return `${t("containers.list-view.tabs.single-cell-cohort")} › ${t(`components.single-cell.cohort.view-${loc.view}`)}`;
}

const KIND_ORDER = { card: 0, method: 1, definition: 2 };

/**
 * Rank entries for a query: every term must appear somewhere; title hits
 * (whole word > prefix > substring) outrank body hits. Empty query returns
 * all entries in their natural order.
 */
export function searchHelp(entries, query, { kind = "all" } = {}) {
  const pool = kind === "all" ? entries : entries.filter((e) => e.kind === kind);
  const terms = norm(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return pool;
  const scored = [];
  for (const e of pool) {
    let score = 0;
    let ok = true;
    for (const term of terms) {
      const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
      if (e._title.split(/[^a-z0-9]+/).includes(term)) score += 10;
      else if (re.test(e._title)) score += 6;
      else if (e._title.includes(term)) score += 4;
      else if (re.test(e._hay)) score += 2;
      else if (e._hay.includes(term)) score += 1;
      else {
        ok = false;
        break;
      }
    }
    if (ok) scored.push([score, e]);
  }
  scored.sort((a, b) => b[0] - a[0] || KIND_ORDER[a[1].kind] - KIND_ORDER[b[1].kind]);
  return scored.map(([, e]) => e);
}

/** Card entry by id (for methods' related links). */
export const helpCardById = (entries, id) => entries.find((e) => e.kind === "card" && e.id === id) || null;
