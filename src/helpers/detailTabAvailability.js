export const DETAIL_TAB_KEYS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"];
// Tab 7 is the single-cell patient view. It only exists for patient entries,
// so it is never assumed enabled and is preferred when it is.
export const SINGLE_CELL_TAB_KEY = "7";
// Tab 8 holds RNA analyses for single-cell patients with an rna/ export.
export const SINGLE_CELL_RNA_TAB_KEY = "8";
// Tab 9 holds SBS signatures of a single-cell patient's SNVs.
export const SINGLE_CELL_SIGNATURES_TAB_KEY = "9";
// Tab 10 relates copy number and expression in the same cells (DNA + RNA).
export const SINGLE_CELL_RNA_CN_TAB_KEY = "10";
// Tab 11 is per-cell QC of a single-cell patient.
export const SINGLE_CELL_QC_TAB_KEY = "11";

const singleCellHasSignatures = (singleCell) =>
  Boolean(
    singleCell &&
      (singleCell.signatures?.status === "ok" ||
        (singleCell.snv?.status === "ok" && singleCell.snv.data?.variants?.some((v) => v.context)))
  );

export const sourceKeepsTabEnabled = (source) =>
  Boolean(
    source &&
      (source.loading || source.error != null || source.missing !== true)
  );

const assetKeepsTabEnabled = (present, error) =>
  Boolean(present || error != null);

const isNumeric = (value) =>
  typeof value === "number" && Number.isFinite(value);

const ppfitKeepsTabEnabled = (ppfit, metadata = {}) =>
  Boolean(
    ppfit &&
      (ppfit.loading ||
        ppfit.error != null ||
        (ppfit.missing !== true &&
          ((ppfit.data?.intervals || []).length > 0 ||
            (isNumeric(metadata.beta) && isNumeric(metadata.gamma)))))
  );

const singleCellKeepsTabEnabled = (singleCell) =>
  Boolean(
    singleCell &&
      (singleCell.loading ||
        singleCell.error != null ||
        (singleCell.missing !== true && singleCell.patient != null))
  );

export const getDetailTabAvailability = (state = {}) => {
  const genomeSources = [
    state.Genome,
    state.GenomeCoverage,
    state.MethylationBetaCoverage,
    state.MethylationIntensityCoverage,
    state.Hetsnps,
    state.Mutations,
    state.Allelic,
    state.Igv,
  ];
  const sageQc = state.SageQc || {};
  const snvplicity = state.Snvplicity || {};

  return {
    0: true,
    1: sourceKeepsTabEnabled(state.FilteredEvents),
    2: genomeSources.some(sourceKeepsTabEnabled),
    3: sourceKeepsTabEnabled(state.PopulationStatistics),
    4:
      sourceKeepsTabEnabled(sageQc) ||
      assetKeepsTabEnabled(
        sageQc.coverageOriginalPresent,
        sageQc.coverageOriginalError
      ) ||
      assetKeepsTabEnabled(
        sageQc.coverageDenoisedPresent,
        sageQc.coverageDenoisedError
      ),
    5:
      ppfitKeepsTabEnabled(state.Ppfit, state.CaseReport?.metadata) ||
      sourceKeepsTabEnabled(snvplicity) ||
      assetKeepsTabEnabled(snvplicity.imagePresent, snvplicity.imageError) ||
      assetKeepsTabEnabled(
        snvplicity.purpleSunrisePresent,
        snvplicity.purpleSunriseError
      ) ||
      assetKeepsTabEnabled(
        snvplicity.hetsnpsImagePresent,
        snvplicity.hetsnpsImageError
      ),
    6: sourceKeepsTabEnabled(state.SignatureStatistics),
    7: singleCellKeepsTabEnabled(state.SingleCell),
    8: state.SingleCell?.rna?.status === "ok",
    9: singleCellHasSignatures(state.SingleCell),
    10: state.SingleCell?.rna?.status === "ok",
    11: Boolean(state.SingleCell?.patient != null && state.SingleCell?.missing !== true && (state.SingleCell?.cells || []).length > 0),
  };
};

export const firstEnabledDetailTab = (availability = {}) => {
  if (availability[SINGLE_CELL_TAB_KEY] === true) return SINGLE_CELL_TAB_KEY;
  return (
    DETAIL_TAB_KEYS.find(
      (key) =>
        key !== SINGLE_CELL_TAB_KEY &&
        // single-cell RNA / signature tabs only exist for single-cell patients
        ([SINGLE_CELL_RNA_TAB_KEY, SINGLE_CELL_SIGNATURES_TAB_KEY, SINGLE_CELL_RNA_CN_TAB_KEY, SINGLE_CELL_QC_TAB_KEY].includes(key)
          ? availability[key] === true
          : availability[key] !== false)
    ) || null
  );
};
