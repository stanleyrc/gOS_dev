/** @jest-environment node */
/* eslint-disable import/first */

jest.mock("d3", () => ({}));
jest.mock("./field", () => class TestField {});

import {
  PRIMARY_SITE_ID,
  getPrimarySite,
  getRawPrimarySite,
  resolvePrimarySiteOptions,
} from "./primarySite";
import publicSettings from "../../public/settings.json";
import sharedSettings from "../../shared/settings.json";

const lung = { value: "LUAD", label: "Lung adenocarcinoma" };
const settings = {
  primarySiteOptions: {
    myeloseq: ["bone marrow aspirate", "peripheral blood", "na"],
    custom: [lung, "Other", "NA"],
    empty: [],
    malformed: "not an array",
  },
};
const dataset = {
  id: "dataset-1",
  reportStyle: "myeloseq",
  fields: [{ id: "primary_site" }],
};
const snapshot = { value: "retired", label: "Original selected label" };
const selectedKey = "PRIMARY_SITE___user-1___case-1";

const createState = (record = {}, metadata = { primary_site: "Bone marrow" }) => ({
  Settings: { dataset, data: settings },
  CaseReport: { id: "case-1", metadata },
  Interpretations: {
    selected: { [PRIMARY_SITE_ID]: selectedKey },
    byId: {
      [selectedKey]: {
        alterationId: PRIMARY_SITE_ID,
        datasetId: dataset.id,
        caseId: "case-1",
        authorId: "user-1",
        isCurrentUser: true,
        data: { primarySite: snapshot },
        ...record,
      },
    },
  },
});

const freezeDeep = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
};

describe("resolvePrimarySiteOptions", () => {
  const myeloSeqOptions = ["bone marrow aspirate", "peripheral blood", "na"]
    .map((value) => ({ value, label: value }));

  it.each([undefined, null, {}, { primarySiteOptions: "unknown" },
    { primarySiteOptions: "malformed" }, { primarySiteOptions: null },
    { primarySiteOptions: {} }, { primarySiteOptions: 42 },
    { primarySiteOptions: true }, { primarySiteOptions: "" },
    { primarySiteOptions: "toString" }])(
    "uses MyeloSeq choices for missing, unknown or malformed configuration %p",
    (input) => {
      expect(resolvePrimarySiteOptions({
        ...(input || {}),
        reportStyle: "myeloseq",
      }, settings)).toEqual(myeloSeqOptions);
    },
  );

  it("returns no choices for classic reports even when options are configured", () => {
    expect(resolvePrimarySiteOptions({
      reportStyle: "classic",
      primarySiteOptions: ["Custom"],
    }, settings)).toEqual([]);
  });

  it("uses a named replacement set and expands string shorthand", () => {
    expect(resolvePrimarySiteOptions({
      reportStyle: "myeloseq",
      primarySiteOptions: "custom",
    }, settings))
      .toEqual([lung, { value: "Other", label: "Other" }, { value: "NA", label: "NA" }]);
  });

  it("uses an explicit array as a replacement, not an extension", () => {
    expect(resolvePrimarySiteOptions({
      reportStyle: "myeloseq",
      primarySiteOptions: ["Custom"],
    }, settings))
      .toEqual([{ value: "Custom", label: "Custom" }]);
  });

  it.each([[[]], ["empty"]])("respects an explicitly empty catalog %p", (options) => {
    expect(resolvePrimarySiteOptions({
      reportStyle: "myeloseq",
      primarySiteOptions: options,
    }, settings)).toEqual([]);
  });

  it("trims, drops invalid entries and keeps the first occurrence of each value", () => {
    const options = [
      " First ", { value: "CODE ", label: " Display label " },
      "", "   ", null, undefined, false, 42, [], {},
      { value: "missing-label" }, { label: "missing-value" },
      { value: 1, label: "Number" }, { value: "code", label: 1 },
      { value: "empty-label", label: " " }, { value: " ", label: "Label" },
      { value: "First", label: "Duplicate" }, "CODE", "Last",
    ];
    const expected = [
      { value: "First", label: "First" },
      { value: "CODE", label: "Display label" },
      { value: "Last", label: "Last" },
    ];
    expect(resolvePrimarySiteOptions({
      reportStyle: "myeloseq",
      primarySiteOptions: options,
    }, settings)).toEqual(expected);
    expect(resolvePrimarySiteOptions(
      { reportStyle: "myeloseq" },
      { primarySiteOptions: { myeloseq: options } },
    )).toEqual(expected);
  });

  it.each([undefined, null, {}, { primarySiteOptions: null },
    { primarySiteOptions: [] }, { primarySiteOptions: { myeloseq: {} } }])(
    "returns an empty list if the MyeloSeq settings catalog is unavailable %p",
    (input) => expect(resolvePrimarySiteOptions(
      { reportStyle: "myeloseq" },
      input,
    )).toEqual([]),
  );

  it("does not fall back when an array contains only invalid entries", () => {
    expect(resolvePrimarySiteOptions({
      reportStyle: "myeloseq",
      primarySiteOptions: [null, 7],
    }, settings)).toEqual([]);
  });

  it("does not mutate or share option objects with source configuration", () => {
    const inputSettings = freezeDeep(JSON.parse(JSON.stringify(settings)));
    const inputDataset = freezeDeep({
      reportStyle: "myeloseq",
      primarySiteOptions: [lung],
    });
    const resolved = resolvePrimarySiteOptions(inputDataset, inputSettings);
    expect(resolved).toEqual([lung]);
    expect(resolved[0]).not.toBe(lung);
    expect(resolvePrimarySiteOptions({ reportStyle: "myeloseq" }, inputSettings)[0])
      .not.toBe(inputSettings.primarySiteOptions.myeloseq[0]);
  });
});

describe("getRawPrimarySite", () => {
  it.each([
    [{ primary_site: " bone marrow aspirate " }, { value: "bone marrow aspirate", label: "bone marrow aspirate" }],
    [{ primarySite: "peripheral blood" }, { value: "peripheral blood", label: "peripheral blood" }],
    [{ primary_site: null, primarySite: "na" }, { value: "na", label: "na" }],
  ])("normalizes raw metadata %p", (metadata, expected) => {
    expect(getRawPrimarySite(metadata)).toEqual(expected);
  });

  it.each([
    undefined,
    null,
    {},
    { primary_site: undefined },
    { primary_site: null },
    { primary_site: "" },
    { primary_site: "   " },
    { primary_site: false },
    { primary_site: 42 },
    { primary_site: {} },
  ])("returns null for absent raw metadata %p", (metadata) => {
    expect(getRawPrimarySite(metadata)).toBeNull();
  });

  it("treats a present blank snake-case field as absent instead of using the alias", () => {
    expect(getRawPrimarySite({ primary_site: " ", primarySite: "peripheral blood" }))
      .toBeNull();
  });
});

describe("getPrimarySite", () => {
  it("exports the canonical interpretation ID", () => {
    expect(PRIMARY_SITE_ID).toBe("PRIMARY_SITE");
  });

  it("prefers the selected scoped current-user snapshot and retains a retired label", () => {
    const state = freezeDeep(createState());
    expect(getPrimarySite(state)).toEqual(snapshot);
    expect(getPrimarySite(state)).not.toBe(snapshot);
    expect(state.CaseReport.metadata.primary_site).toBe("Bone marrow");
  });

  it("retains the saved label when the catalog label for its value changes", () => {
    const saved = { value: "LUAD", label: "Previously selected lung label" };
    expect(getPrimarySite(createState({ data: { primarySite: saved } }))).toEqual(saved);
  });

  it("treats lowercase na as a saved choice rather than clearing to source metadata", () => {
    expect(getPrimarySite(createState({ data: { primarySite: { value: "na", label: "na" } } })))
      .toEqual({ value: "na", label: "na" });
  });

  it.each([
    { caseId: "case-2" }, { datasetId: "dataset-2" },
    { caseId: undefined }, { datasetId: undefined },
    { alterationId: "GLOBAL_NOTES" },
    { authorId: "other-user", isCurrentUser: false }, { isCurrentUser: undefined },
    { isCurrentUser: "true" }, { data: null }, { data: {} },
    { data: { primarySite: "not a snapshot" } },
    { data: { primarySite: { value: "CODE", label: "" } } },
    { data: { primarySite: { value: "CODE" } } },
  ])("ignores mismatched, other-author or malformed snapshots %p", (record) => {
    expect(getPrimarySite(createState(record))).toEqual({ value: "Bone marrow", label: "Bone marrow" });
  });

  it("does not infer a saved selection from an unselected byId entry", () => {
    const state = createState();
    state.Interpretations.selected = {};
    expect(getPrimarySite(state)).toEqual({ value: "Bone marrow", label: "Bone marrow" });
    state.Interpretations.selected[PRIMARY_SITE_ID] = "missing";
    expect(getPrimarySite(state)).toEqual({ value: "Bone marrow", label: "Bone marrow" });
  });

  it("supports report-style state.dataset when Settings.dataset is absent", () => {
    const state = createState();
    state.dataset = state.Settings.dataset;
    delete state.Settings.dataset;
    expect(getPrimarySite(state)).toEqual(snapshot);
    delete state.Settings;
    expect(getPrimarySite(state)).toEqual(snapshot);
  });

  it("prefers Settings.dataset over state.dataset for context and schema", () => {
    const state = createState();
    state.dataset = { id: "different-dataset", fields: [] };
    expect(getPrimarySite(state)).toEqual(snapshot);
    state.Settings.dataset = { id: "different-dataset", fields: [] };
    state.dataset = dataset;
    expect(getPrimarySite(state)).toBeNull();
  });

  it("matches string and numeric case/dataset identities without accepting missing context", () => {
    const state = createState({ caseId: "1", datasetId: "2" });
    state.CaseReport.id = 1;
    state.Settings.dataset = { id: 2, reportStyle: "myeloseq" };
    expect(getPrimarySite(state)).toEqual(snapshot);
    delete state.CaseReport.id;
    delete state.Interpretations.byId[selectedKey].caseId;
    expect(getPrimarySite(state)).toEqual({ value: "Bone marrow", label: "Bone marrow" });
    state.CaseReport.id = "1";
    state.Interpretations.byId[selectedKey].caseId = "1";
    delete state.Settings.dataset.id;
    delete state.Interpretations.byId[selectedKey].datasetId;
    expect(getPrimarySite(state)).toEqual({ value: "Bone marrow", label: "Bone marrow" });
  });

  it.each([[], [{ id: "tumor_type" }], ["primarySite"]].map((fields) => [fields]))(
    "returns null when the dataset schema excludes primary_site %p", (fields) => {
      const state = createState();
      state.Settings.dataset = { ...dataset, fields };
      expect(getPrimarySite(state)).toBeNull();
    },
  );

  it.each([["primary_site"], [{ name: "primary_site" }], undefined, null].map((fields) => [fields]))(
    "honors enabled or unspecified schema fields %p", (fields) => {
      const state = createState();
      state.Settings.dataset = { ...dataset, fields };
      expect(getPrimarySite(state)).toEqual(snapshot);
    },
  );

  it("allows metadata when neither dataset nor fields is supplied", () => {
    expect(getPrimarySite({ CaseReport: { metadata: { primary_site: "Legacy source" } } }))
      .toEqual({ value: "Legacy source", label: "Legacy source" });
  });

  it("uses primary_site before primarySite without changing metadata or tumor type", () => {
    const metadata = freezeDeep({
      primary_site: "  Legacy source  ", primarySite: "Alias", tumor_type: "Different tumor",
    });
    const state = freezeDeep({ CaseReport: { metadata } });
    expect(getPrimarySite(state)).toEqual({ value: "Legacy source", label: "Legacy source" });
    expect(metadata).toEqual({
      primary_site: "  Legacy source  ", primarySite: "Alias", tumor_type: "Different tumor",
    });
  });

  it("uses camelCase metadata when the snake_case field is unavailable", () => {
    expect(getPrimarySite({ CaseReport: { metadata: { primary_site: null, primarySite: "Peripheral blood" } } }))
      .toEqual({ value: "Peripheral blood", label: "Peripheral blood" });
  });

  it("does not map raw primary sites through the removed cancer catalog", () => {
    const state = createState({ isCurrentUser: false }, { primary_site: "LUAD" });
    expect(getPrimarySite(state)).toEqual({ value: "LUAD", label: "LUAD" });
  });

  it("ignores saved MyeloSeq overrides for classic reports", () => {
    const state = createState({}, { primary_site: "Liver" });
    state.Settings.dataset = { ...dataset, reportStyle: "classic" };
    expect(getPrimarySite(state)).toEqual({ value: "Liver", label: "Liver" });
  });

  it.each([undefined, null, "", "  ", false, 42, {}, []].map((value) => [value]))(
    "returns null for unavailable raw metadata %p without selecting an option", (value) => {
      const state = createState({ isCurrentUser: false }, { primary_site: value });
      expect(getPrimarySite(state)).toBeNull();
    },
  );

  it.each([undefined, null, "", "  "])(
    "ignores a saved override when raw primary_site is absent %p", (value) => {
      expect(getPrimarySite(createState({}, { primary_site: value }))).toBeNull();
    },
  );

  it("keeps explicit lowercase na eligible without a saved override", () => {
    expect(getPrimarySite(createState({ isCurrentUser: false }, { primary_site: "na" })))
      .toEqual({ value: "na", label: "na" });
  });

  it("returns null for missing state or case", () => {
    expect(getPrimarySite()).toBeNull();
    expect(getPrimarySite({})).toBeNull();
  });
});

describe.each([["public", publicSettings], ["shared", sharedSettings]])(
  "%s primary-site catalog", (name, config) => {
    it("contains only the default MyeloSeq specimen choices", () => {
      expect(resolvePrimarySiteOptions({ reportStyle: "myeloseq" }, config))
        .toEqual(["bone marrow aspirate", "peripheral blood", "na"]
          .map((value) => ({ value, label: value })));
      expect(config.primarySiteOptions).not.toHaveProperty("wholeGenome");
    });
  },
);

it("keeps both distributed primary-site catalog configurations identical", () => {
  expect(publicSettings.primarySiteOptions).toEqual(sharedSettings.primarySiteOptions);
});
