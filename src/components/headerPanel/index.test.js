/** @jest-environment node */
/* eslint-disable import/first */

import React from "react";

jest.mock("react-redux", () => ({
  connect: () => (Component) => Component,
}));
jest.mock("react-i18next", () => ({
  withTranslation: () => (Component) => Component,
}));
jest.mock("@ant-design/pro-components", () => ({ PageHeader: "PageHeader" }));
jest.mock("antd", () => ({
  Space: "Space",
  Tag: "Tag",
  Avatar: "Avatar",
  Tooltip: "Tooltip",
  Divider: "Divider",
  Popover: "Popover",
  Typography: { Text: "Text" },
  Button: "Button",
}));
jest.mock("d3", () => ({ format: () => (value) => `${value}` }));
jest.mock("../../helpers/utility", () => ({
  legendColors: () => ["a", "b", "c"],
  coverageQCFields: () => [],
  getColorMarker: () => "gray",
  orderListViewFilters: [],
  copyTextToClipboard: jest.fn(),
}));
jest.mock("../../helpers/metadata", () => ({
  getNestedValue: (record, path) =>
    `${path}`.split(".").reduce((value, key) => value?.[key], record),
  valueFormat: () => ".2f",
  hrdFields: ["b1_score"],
  sv_countFields: [],
  headerList: [
    "tmb",
    "hrd.b1_2_score",
    "tumor_median_coverage",
  ],
  msiFields: [],
  hrdDividers: {},
  msiLabels: {},
  qcMetricsClasses: {},
}));
jest.mock("../../helpers/browseScope", () => ({
  datasetHasField: (dataset, fieldId) =>
    (dataset?.fields || []).some(
      (field) => (field.id || field.name) === fieldId,
    ),
}));
jest.mock("./index.style", () => "Wrapper");
jest.mock("../cbioportal", () => ({ CbioportalModal: "CbioportalModal" }));
jest.mock("../clinicalTrialsModal", () => ({
  ClinicalTrialsModal: "ClinicalTrialsModal",
}));
jest.mock("../patientCaseSwitcher", () => "PatientCaseSwitcher");
jest.mock("../reportButtonsPanel", () => "ReportButtonsPanel");
jest.mock("../../assets/images/cbioportal_icon.png", () => "cbioportal.png");
jest.mock("../../assets/images/ctgov_logo.png", () => "ctgov.png");

import { HeaderPanel } from "./index";

const collectText = (node) => {
  if (node == null || typeof node === "boolean") return [];
  if (typeof node === "string" || typeof node === "number") {
    return [`${node}`];
  }
  if (Array.isArray(node)) return node.flatMap(collectText);
  if (!React.isValidElement(node)) return [];
  return [
    node.props.children,
    node.props.title,
    node.props.subTitle,
    node.props.extra,
  ].flatMap(collectText);
};

describe("HeaderPanel schema metadata", () => {
  it("suppresses omitted raw values and preserves Purity/Ploidy with N/A", () => {
    const panel = new HeaderPanel({
      t: (key) => (key === "general.not-applicable" ? "N/A" : key),
      report: "case-1",
      dataset: {
        schema: [{ id: "purity" }, { id: "hrd.b1_2_score" }],
        fields: [{ id: "purity" }, { id: "hrd.b1_2_score" }],
      },
      metadata: {
        pair: "PAIR-1",
        purity: 0.37,
        ploidy: 4.8,
        tmb: 999,
        hrd: {
          b1_2_score: 0.2,
          b1_score: "SCHEMA-OMITTED-HRD-DETAIL",
        },
        inferred_sex: "SCHEMA-OMITTED-SEX",
        tumor_details: "SCHEMA-OMITTED-DETAILS",
        qcMetrics: [
          { code: "FAIL", title: "SCHEMA-OMITTED-QC-DETAIL" },
        ],
        qcEvaluation: "FAIL",
      },
      plots: [],
    });

    const text = collectText(panel.render()).join(" ");

    expect(text).toContain("0.37");
    expect(text).toContain("N/A");
    expect(text).not.toContain("4.8");
    expect(text).not.toContain("999");
    expect(text).not.toContain("SCHEMA-OMITTED");
  });

  it("hides the paired metadata component when both fields are omitted", () => {
    const panel = new HeaderPanel({
      t: (key) => (key === "general.not-applicable" ? "N/A" : key),
      report: "case-no-pp",
      dataset: {
        schema: [{ id: "snv_count" }],
        fields: [{ id: "snv_count" }],
      },
      metadata: {
        pair: "PAIR-NO-PP",
        purity: 0.93,
        ploidy: 9.3,
        snv_count: 31,
        qcMetrics: [],
        qcEvaluation: null,
      },
      plots: [],
    });

    const text = collectText(panel.render()).join(" ");

    expect(text).not.toContain("purity-ploidy-title");
    expect(text).not.toContain("0.93");
    expect(text).not.toContain("9.3");
  });

  it("keeps configured paired components visible when their values are unavailable", () => {
    const panel = new HeaderPanel({
      t: (key) => (key === "general.not-applicable" ? "N/A" : key),
      report: "case-configured-na",
      dataset: {
        schema: [
          { id: "purity" },
          { id: "ploidy" },
          { id: "tumor_median_coverage" },
        ],
        fields: [
          { id: "purity" },
          { id: "ploidy" },
          { id: "tumor_median_coverage" },
        ],
      },
      metadata: {
        pair: "PAIR-CONFIGURED-NA",
        purity: null,
        ploidy: null,
        tumor_median_coverage: null,
        normal_median_coverage: null,
        qcMetrics: [],
        qcEvaluation: null,
      },
      plots: [],
    });

    const text = collectText(panel.render()).join(" ");

    expect(text).toContain("purity-ploidy-title");
    expect(text).toContain("metadata.tumor_median_coverage.short");
    expect(text).toContain("N/A");
  });
});
