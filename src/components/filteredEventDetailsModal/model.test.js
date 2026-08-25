/** @jest-environment node */

import {
  FILTERED_EVENT_DETAILS_LEGACY_TAB_ALIASES,
  FILTERED_EVENT_DETAILS_TAB_ORDER,
  FILTERED_EVENT_DETAILS_TABS,
  getFilteredEventDetailsHeading,
  getInlineTracksProps,
  normalizeFilteredEventDetailsTab,
} from "./model";

describe("filtered event details tabs", () => {
  it("defines the canonical tab order and legacy boundary aliases", () => {
    expect(FILTERED_EVENT_DETAILS_TAB_ORDER).toEqual([
      FILTERED_EVENT_DETAILS_TABS.PLOTS,
      FILTERED_EVENT_DETAILS_TABS.ALTERATION,
      FILTERED_EVENT_DETAILS_TABS.VARIANT_QC,
    ]);
    expect(FILTERED_EVENT_DETAILS_LEGACY_TAB_ALIASES).toEqual({
      detail: FILTERED_EVENT_DETAILS_TABS.ALTERATION,
      tracks: FILTERED_EVENT_DETAILS_TABS.PLOTS,
    });
  });

  it.each([
    ["detail", "alteration"],
    ["alteration", "alteration"],
    ["tracks", "plots"],
    ["plots", "plots"],
    ["variantQc", "variantQc"],
    [undefined, "alteration"],
    ["unknown", "alteration"],
  ])("normalizes %p to %s", (viewMode, expectedTab) => {
    expect(normalizeFilteredEventDetailsTab(viewMode)).toBe(expectedTab);
  });
});

describe("getFilteredEventDetailsHeading", () => {
  it("normalizes role labels while preserving heading field values", () => {
    expect(
      getFilteredEventDetailsHeading({
        gene: "TP53",
        name: "p.R248Q",
        type: "Missense",
        role: " oncogenic, resistance , ",
        tier: 1,
        location: "17:7577539-7577539 G>A",
      }),
    ).toEqual({
      gene: "TP53",
      name: "p.R248Q",
      type: "Missense",
      roles: ["oncogenic", "resistance"],
      tier: 1,
      location: "17:7577539-7577539 G>A",
    });
  });

  it("uses an empty role list for absent or non-string roles", () => {
    expect(getFilteredEventDetailsHeading().roles).toEqual([]);
    expect(getFilteredEventDetailsHeading({ role: null }).roles).toEqual([]);
    expect(getFilteredEventDetailsHeading({ role: 3 }).roles).toEqual([]);
  });

  it.each([null, "not a record"])(
    "normalizes the %p boundary to an empty heading record",
    (record) => {
      expect(getFilteredEventDetailsHeading(record)).toEqual({
        gene: undefined,
        name: undefined,
        type: undefined,
        roles: [],
        tier: undefined,
        location: undefined,
      });
    },
  );
});

describe("getInlineTracksProps", () => {
  it("adapts the active event and track data without modal-only no-op props", () => {
    const data = {
      genome: { kind: "genome" },
      mutations: { kind: "mutations" },
      genomeCoverage: { kind: "genomeCoverage" },
      methylationBetaCoverage: { kind: "methylationBetaCoverage" },
      methylationIntensityCoverage: {
        kind: "methylationIntensityCoverage",
      },
      hetsnps: { kind: "hetsnps" },
      genes: { kind: "genes" },
      igv: { kind: "igv" },
      chromoBins: [{ chromosome: "1" }],
      allelic: { kind: "allelic" },
    };
    const t = (key) => `translated:${key}`;

    const tracksProps = getInlineTracksProps({
      ...data,
      t,
      contentView: FILTERED_EVENT_DETAILS_TABS.VARIANT_QC,
      record: { uid: "event-7" },
      loading: true,
      title: "must not leak",
    });

    expect(tracksProps).toEqual({
      ...data,
      genomePlotTitle: "translated:components.tracks-modal.genome-plot",
      genomePlotYAxisTitle:
        "translated:components.tracks-modal.genome-y-axis-title",
      coveragePlotTitle: "translated:components.tracks-modal.coverage-plot",
      coverageYAxisTitle:
        "translated:components.tracks-modal.coverage-copy-number",
      coverageYAxis2Title:
        "translated:components.tracks-modal.coverage-count",
      methylationBetaCoveragePlotTitle:
        "translated:components.tracks-modal.methylation-beta-coverage-plot",
      methylationBetaCoverageYAxisTitle:
        "translated:components.tracks-modal.methylation-beta-coverage-y-axis-title",
      methylationBetaCoverageYAxis2Title:
        "translated:components.tracks-modal.methylation-beta-coverage-y-axis2-title",
      methylationIntensityCoveragePlotTitle:
        "translated:components.tracks-modal.methylation-intensity-coverage-plot",
      methylationIntensityCoverageYAxisTitle:
        "translated:components.tracks-modal.methylation-intensity-coverage-y-axis-title",
      methylationIntensityCoverageYAxis2Title:
        "translated:components.tracks-modal.methylation-intensity-coverage-y-axis2-title",
      hetsnpPlotTitle: "translated:components.tracks-modal.hetsnp-plot",
      hetsnpPlotYAxisTitle:
        "translated:components.tracks-modal.hetsnp-copy-number",
      hetsnpPlotYAxis2Title:
        "translated:components.tracks-modal.hetsnp-count",
      mutationsPlotTitle:
        "translated:components.tracks-modal.mutations-plot",
      mutationsPlotYAxisTitle:
        "translated:components.tracks-modal.mutations-plot-y-axis-title",
      allelicPlotTitle: "translated:components.tracks-modal.allelic-plot",
      allelicPlotYAxisTitle:
        "translated:components.tracks-modal.allelic-plot-y-axis-title",
      open: true,
      viewType: "inline",
      contentView: FILTERED_EVENT_DETAILS_TABS.VARIANT_QC,
      selectedVariantId: "event-7",
    });
  });
});
