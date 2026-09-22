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
jest.mock("@ant-design/icons", () => ({
  BarChartOutlined: "BarChartOutlined",
}));
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
  ALL_DATASETS_ROUTE_VALUE: "all",
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
jest.mock("../copyIconButton", () => "CopyIconButton");
jest.mock("../reportButtonsPanel", () => "ReportButtonsPanel");
jest.mock("../primarySiteSelect", () => "PrimarySiteSelect");
jest.mock("../../assets/images/cbioportal_icon.png", () => "cbioportal.png");
jest.mock("../../assets/images/ctgov_logo.png", () => "ctgov.png");

import { HeaderPanel } from "./index";

const originalWindow = global.window;
afterEach(() => {
  if (originalWindow === undefined) delete global.window;
  else global.window = originalWindow;
});

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
  it.each([
    ["myeloseq", true, "bone marrow aspirate", 1],
    ["myeloseq", false, "bone marrow aspirate", 1],
    ["myeloseq", false, undefined, 1],
    [undefined, false, undefined, 1],
    ["unknown", false, undefined, 1],
    ["classic", true, "bone marrow aspirate", 0],
    ["classic", false, "bone marrow aspirate", 0],
    ["classic", false, undefined, 0],
  ])("selector for style %p, field enabled %p, raw site %p", (reportStyle, enabled, primary_site, count) => {
    const component = new HeaderPanel({
      t: (key) => key,
      report: "case-1",
      dataset: {
        reportStyle,
        fields: enabled ? [{ id: "primary_site" }] : [],
      },
      metadata: { primary_site }, plots: [],
    });
    const find = (node) => {
      if (Array.isArray(node)) return node.flatMap(find);
      if (!React.isValidElement(node)) return [];
      return [node, ...find(node.props.children)];
    };
    const nodes = find(component.render());
    expect(nodes.filter((node) => node.type === "PrimarySiteSelect")).toHaveLength(count);
    expect(collectText(component.render()).includes("bone marrow aspirate"))
      .toBe(reportStyle === "classic" && enabled && Boolean(primary_site));
    component.props = { ...component.props, report: null };
    expect(component.render()).toBeNull();
  });

  it("edits one existing site slot while retaining populated tumor metadata", () => {
    const fields = ["tumor_type", "disease", "primary_site", "tumor_details"].map((id) => ({ id }));
    const panel = new HeaderPanel({
      t: (key) => key,
      report: "case-1",
      dataset: { reportStyle: "myeloseq", fields },
      plots: [],
      metadata: {
        tumor_type: "CHOL", disease: "Adenocarcinoma", primary_site: "Liver",
        tumor_details: "Intrahepatic cholangiocarcinoma",
      },
    });
    const find = (node) => {
      if (Array.isArray(node)) return node.flatMap(find);
      if (!React.isValidElement(node)) return [];
      return [node, ...find(node.props.children)];
    };
    const nodes = find(panel.render());
    expect(nodes.find((node) => node.type === "Avatar").props.children).toBe("CHOL");
    const line = nodes.find((node) => node.props.className === "case-metadata-line");
    const children = React.Children.toArray(line.props.children);
    expect(children.map((node) => node.type)).toEqual(["span", "PrimarySiteSelect", "span"]);
    expect(collectText(children)).toEqual(["Adenocarcinoma", "Intrahepatic cholangiocarcinoma"]);
    expect(nodes.filter((node) => node.type === "PrimarySiteSelect")).toHaveLength(1);
    expect(nodes.some((node) => node.props.className === "ant-pro-page-container-extraContent")).toBe(false);
  });

  it("uses the selector when reportStyle is omitted", () => {
    const fields = ["tumor_type", "disease", "primary_site", "tumor_details"].map((id) => ({ id }));
    const panel = new HeaderPanel({
      t: (key) => key,
      report: "case-1",
      dataset: { fields },
      plots: [],
      metadata: {
        tumor_type: "CHOL",
        disease: "Adenocarcinoma",
        primary_site: "peripheral blood",
        tumor_details: "Intrahepatic cholangiocarcinoma",
      },
    });
    const find = (node) => {
      if (Array.isArray(node)) return node.flatMap(find);
      if (!React.isValidElement(node)) return [];
      return [node, ...find(node.props.children)];
    };
    const nodes = find(panel.render());
    const line = nodes.find((node) => node.props.className === "case-metadata-line");
    const children = React.Children.toArray(line.props.children);
    expect(children.map((node) => node.type)).toEqual(["span", "PrimarySiteSelect", "span"]);
    expect(collectText(children)).toEqual([
      "Adenocarcinoma",
      "Intrahepatic cholangiocarcinoma",
    ]);
  });

  it("shows raw primary site for an explicit classic report", () => {
    const fields = ["disease", "primary_site", "tumor_details"].map((id) => ({ id }));
    const panel = new HeaderPanel({
      t: (key) => key,
      report: "case-1",
      dataset: { reportStyle: "classic", fields },
      plots: [],
      metadata: {
        disease: "Adenocarcinoma",
        primary_site: "Liver",
        tumor_details: "Intrahepatic cholangiocarcinoma",
      },
    });
    const find = (node) => {
      if (Array.isArray(node)) return node.flatMap(find);
      if (!React.isValidElement(node)) return [];
      return [node, ...find(node.props.children)];
    };
    const nodes = find(panel.render());
    const line = nodes.find((node) => node.props.className === "case-metadata-line");
    const children = React.Children.toArray(line.props.children);
    expect(children.map((node) => node.type)).toEqual(["span", "span", "span"]);
    expect(collectText(children)).toEqual([
      "Adenocarcinoma",
      "Liver",
      "Intrahepatic cholangiocarcinoma",
    ]);
    expect(nodes.filter((node) => node.type === "PrimarySiteSelect")).toHaveLength(0);
  });

  it.each([
    ["missing", {}],
    ["null", { primary_site: null }],
    ["empty", { primary_site: "" }],
    ["whitespace", { primary_site: "   " }],
  ])("shows the MyeloSeq selector but no classic site for %s raw metadata", (name, primarySiteMetadata) => {
    const fields = ["disease", "primary_site", "tumor_details"].map((id) => ({ id }));
    const panel = new HeaderPanel({
      t: (key) => key,
      report: "case-1",
      dataset: { fields },
      plots: [],
      metadata: {
        disease: "Adenocarcinoma",
        tumor_details: "Details",
        ...primarySiteMetadata,
      },
    });
    const find = (node) => {
      if (Array.isArray(node)) return node.flatMap(find);
      if (!React.isValidElement(node)) return [];
      return [node, ...find(node.props.children)];
    };
    const nodes = find(panel.render());
    const line = nodes.find((node) => node.props.className === "case-metadata-line");
    const children = React.Children.toArray(line.props.children);
    expect(children.map((node) => node.type)).toEqual(["span", "PrimarySiteSelect", "span"]);
    expect(collectText(children)).toEqual(["Adenocarcinoma", "Details"]);
    expect(nodes.filter((node) => node.type === "PrimarySiteSelect")).toHaveLength(1);
    panel.props = { ...panel.props, dataset: { fields, reportStyle: "classic" } };
    const classicNodes = find(panel.render());
    const classicLine = classicNodes.find((node) => node.props.className === "case-metadata-line");
    expect(React.Children.toArray(classicLine.props.children).map((node) => node.type))
      .toEqual(["span", "span"]);
    expect(classicNodes.filter((node) => node.type === "PrimarySiteSelect")).toHaveLength(0);
  });

  it("keeps explicit lowercase na eligible for the selector", () => {
    const panel = new HeaderPanel({
      t: (key) => key,
      report: "case-1",
      dataset: { fields: [{ id: "primary_site" }] },
      plots: [],
      metadata: { primary_site: "na" },
    });
    const find = (node) => {
      if (Array.isArray(node)) return node.flatMap(find);
      if (!React.isValidElement(node)) return [];
      return [node, ...find(node.props.children)];
    };
    expect(find(panel.render()).filter((node) => node.type === "PrimarySiteSelect"))
      .toHaveLength(1);
  });

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

  it("shows QC metric details when qcMetrics is included in the dataset schema", () => {
    const qcMetricsField = {
      id: "qcMetrics",
      title: "Quality Control Metrics",
      type: "string",
      external: true,
    };
    const qcMetrics = [
      {
        code: "PASS",
        title: "Fraction of reads aligned (1) >= 90%",
      },
      {
        code: "WARN",
        title: "Percent on target (0.0065) < 80%",
      },
      {
        code: "FAIL",
        title: "Mean target depth (1.41) < 500X",
      },
    ];
    const panel = new HeaderPanel({
      t: (key) => key,
      report: "case-qc-failure",
      dataset: {
        schema: [qcMetricsField],
        fields: [qcMetricsField],
      },
      metadata: {
        pair: "PAIR-QC-FAILURE",
        qcMetrics,
        qcEvaluation: "FAIL",
      },
      plots: [],
    });

    const pageHeader = panel.render().props.children[0];
    const toolbarGroups = React.Children.toArray(
      pageHeader.props.subTitle.props.children,
    );
    const badges = React.Children.toArray(
      toolbarGroups[0].props.children,
    );
    const qcPopover = badges[0];

    expect(qcPopover.type).toBe("Popover");
    expect(qcPopover.props.children.type).toBe("Tag");
    expect(qcPopover.props.children.props.children).toBe("FAIL");
    expect(collectText(qcPopover.props.content)).toEqual(
      qcMetrics.map(({ title }) => title),
    );
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

  it("orders uniformly sized metadata actions after a labeled sex badge", () => {
    const labels = {
      "components.header-panel.patient-sex-tooltip": "Patient's sex",
      "components.header-panel.view-report": "View Report",
      "components.header-panel.cbioportal-button": "cBioPortal",
      "components.header-panel.clinical-trials-button": "Clinical Trials",
      "components.patient-case-switcher.patient-level":
        "View Patient Aggregations",
      "components.patient-case-switcher.patient-level-aria-label":
        "View patient aggregations",
    };
    global.window = {
      location: {
        href: "https://gos.test/app?dataset=dataset-1&report=case-1&tab=2",
      },
    };
    const panel = new HeaderPanel({
      t: (key) => labels[key] || key,
      report: "case-1",
      dataset: {
        schema: [{ id: "inferred_sex" }],
        fields: [{ id: "inferred_sex" }],
      },
      metadata: {
        pair: "PAIR-1",
        patient_id: "PATIENT-1",
        inferred_sex: "Female",
        qcMetrics: [],
        qcEvaluation: null,
      },
      plots: [],
    });

    const pageHeader = panel.render().props.children[0];
    const toolbar = pageHeader.props.subTitle;
    const toolbarGroups = React.Children.toArray(toolbar.props.children);
    const badges = React.Children.toArray(
      toolbarGroups[0].props.children,
    );
    const actions = React.Children.toArray(
      toolbarGroups[1].props.children,
    );

    expect(badges[0].type).toBe("Tooltip");
    expect(badges[0].props.title).toBe("Patient's sex");
    expect(badges[0].props.children.props).toMatchObject({
      className: "patient-sex-badge",
      "aria-label": "Patient's sex: Female",
      children: "Female",
    });
    expect(actions.map((action) => action.type)).toEqual([
      "Button",
      "ReportButtonsPanel",
      "Tooltip",
      "Tooltip",
    ]);
    expect(actions[0].props.className).toBe("patient-level-view-link");
    expect(actions[0].props.icon.type).toBe("BarChartOutlined");
    expect(actions[2].props.children.props["aria-label"]).toBe("cBioPortal");
    expect(actions[3].props.children.props["aria-label"]).toBe(
      "Clinical Trials",
    );

    const patientLevelUrl = new URL(actions[0].props.href);
    expect(actions[0].props.target).toBe("_blank");
    expect(actions[0].props.rel).toBe("noopener noreferrer");
    expect(actions[0].props.onClick).toBeUndefined();
    expect(patientLevelUrl.searchParams.get("scope")).toBe("all");
    expect(patientLevelUrl.searchParams.get("view")).toBe(
      "patient-aggregations",
    );
    expect(patientLevelUrl.searchParams.get("patient_id")).toBe("PATIENT-1");
    expect(patientLevelUrl.searchParams.has("dataset")).toBe(false);
    expect(patientLevelUrl.searchParams.has("report")).toBe(false);
    expect(patientLevelUrl.searchParams.has("tab")).toBe(false);
  });

  it("delegates case-ID copy with case-specific initial guidance", () => {
    const labels = {
      "components.header-panel.copy-case-id-tooltip": "Copy case ID",
      "components.header-panel.copy-tooltip-success": "Copied!",
      "components.header-panel.copy-tooltip-failure": "Unable to copy",
      "components.header-panel.copy-case-id-aria-label":
        "Copy case ID to clipboard",
    };
    const panel = new HeaderPanel({
      t: (key) => labels[key] || key,
      metadata: { pair: "CASE-42" },
    });

    const view = panel.renderPairTitle("CASE-42");
    const copyControl = view.props.copyControl;

    expect(copyControl.type).toBe("CopyIconButton");
    expect(copyControl.props.value).toBe("CASE-42");
    expect(copyControl.props.tooltipTitle).toBe("Copy case ID");
    expect(copyControl.props.copiedTooltipTitle).toBe("Copied!");
    expect(copyControl.props.failureTooltipTitle).toBe("Unable to copy");
    expect(copyControl.props["ariaLabel"]).toBe(
      "Copy case ID to clipboard",
    );
  });
});
