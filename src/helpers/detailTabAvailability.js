export const DETAIL_TAB_KEYS = ["0", "1", "2", "3", "4", "5", "6"];

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
  };
};

export const firstEnabledDetailTab = (availability = {}) =>
  DETAIL_TAB_KEYS.find((key) => availability[key] !== false) || null;
