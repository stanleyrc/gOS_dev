export const FILTERED_EVENT_DETAILS_TABS = Object.freeze({
  ALTERATION: "alteration",
  PLOTS: "plots",
  VARIANT_QC: "variantQc",
});

export const FILTERED_EVENT_DETAILS_LEGACY_TAB_ALIASES = Object.freeze({
  detail: FILTERED_EVENT_DETAILS_TABS.ALTERATION,
  tracks: FILTERED_EVENT_DETAILS_TABS.PLOTS,
});

export const FILTERED_EVENT_DETAILS_TAB_ORDER = Object.freeze([
  FILTERED_EVENT_DETAILS_TABS.PLOTS,
  FILTERED_EVENT_DETAILS_TABS.ALTERATION,
  FILTERED_EVENT_DETAILS_TABS.VARIANT_QC,
]);

export function normalizeFilteredEventDetailsTab(viewMode) {
  if (
    Object.prototype.hasOwnProperty.call(
      FILTERED_EVENT_DETAILS_LEGACY_TAB_ALIASES,
      viewMode,
    )
  ) {
    return FILTERED_EVENT_DETAILS_LEGACY_TAB_ALIASES[viewMode];
  }
  if (FILTERED_EVENT_DETAILS_TAB_ORDER.includes(viewMode)) {
    return viewMode;
  }
  return FILTERED_EVENT_DETAILS_TABS.ALTERATION;
}

export function getFilteredEventDetailsHeading(record = {}) {
  const normalizedRecord =
    record !== null && typeof record === "object" ? record : {};
  const roles =
    typeof normalizedRecord.role === "string"
      ? normalizedRecord.role
          .split(",")
          .map((role) => role.trim())
          .filter(Boolean)
      : [];

  return {
    gene: normalizedRecord.gene,
    name: normalizedRecord.name,
    type: normalizedRecord.type,
    roles,
    tier: normalizedRecord.tier,
    location: normalizedRecord.location,
  };
}

export function getInlineTracksProps({
  t,
  contentView,
  record,
  genome,
  mutations,
  genomeCoverage,
  methylationBetaCoverage,
  methylationIntensityCoverage,
  hetsnps,
  genes,
  igv,
  chromoBins,
  allelic,
}) {
  return {
    genome,
    mutations,
    genomeCoverage,
    methylationBetaCoverage,
    methylationIntensityCoverage,
    hetsnps,
    genes,
    igv,
    chromoBins,
    allelic,
    genomePlotTitle: t("components.tracks-modal.genome-plot"),
    genomePlotYAxisTitle: t("components.tracks-modal.genome-y-axis-title"),
    coveragePlotTitle: t("components.tracks-modal.coverage-plot"),
    coverageYAxisTitle: t("components.tracks-modal.coverage-copy-number"),
    coverageYAxis2Title: t("components.tracks-modal.coverage-count"),
    methylationBetaCoveragePlotTitle: t(
      "components.tracks-modal.methylation-beta-coverage-plot",
    ),
    methylationBetaCoverageYAxisTitle: t(
      "components.tracks-modal.methylation-beta-coverage-y-axis-title",
    ),
    methylationBetaCoverageYAxis2Title: t(
      "components.tracks-modal.methylation-beta-coverage-y-axis2-title",
    ),
    methylationIntensityCoveragePlotTitle: t(
      "components.tracks-modal.methylation-intensity-coverage-plot",
    ),
    methylationIntensityCoverageYAxisTitle: t(
      "components.tracks-modal.methylation-intensity-coverage-y-axis-title",
    ),
    methylationIntensityCoverageYAxis2Title: t(
      "components.tracks-modal.methylation-intensity-coverage-y-axis2-title",
    ),
    hetsnpPlotTitle: t("components.tracks-modal.hetsnp-plot"),
    hetsnpPlotYAxisTitle: t("components.tracks-modal.hetsnp-copy-number"),
    hetsnpPlotYAxis2Title: t("components.tracks-modal.hetsnp-count"),
    mutationsPlotTitle: t("components.tracks-modal.mutations-plot"),
    mutationsPlotYAxisTitle: t(
      "components.tracks-modal.mutations-plot-y-axis-title",
    ),
    allelicPlotTitle: t("components.tracks-modal.allelic-plot"),
    allelicPlotYAxisTitle: t(
      "components.tracks-modal.allelic-plot-y-axis-title",
    ),
    open: true,
    viewType: "inline",
    contentView,
    selectedVariantId: record?.uid,
  };
}
