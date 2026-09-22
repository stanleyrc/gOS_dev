/** @jest-environment node */
/* eslint-disable import/first */
import React from "react";
jest.mock("../../helpers/field", () => class TestField {});
jest.mock("react-redux", () => ({ connect: () => (Component) => Component }));
jest.mock("react-i18next", () => ({ withTranslation: () => (Component) => Component }));
jest.mock("antd", () => ({ Select: "Select", Alert: "Alert", Button: "Button" }));
jest.mock("./index.style", () => "Wrapper");
jest.mock("../../helpers/userAuth", () => ({
  ensureUser: jest.fn(),
  getUser: () => ({ userId: "user-1", displayName: "User One" }),
}));
import { ensureUser } from "../../helpers/userAuth";
import { PrimarySiteSelect, mapStateToProps, mapDispatchToProps } from "./index";

const options = ["bone marrow aspirate", "peripheral blood", "na"]
  .map((label) => ({ value: label, label }));
function create(props = {}) {
  const component = new PrimarySiteSelect({
    caseId: "case-1", dataset: { id: "dataset-1" }, ready: true,
    value: options[2], options, t: (key) => key,
    savePrimarySite: jest.fn().mockResolvedValue({}), retry: jest.fn(), ...props,
  });
  component.setState = (update) => { component.state = { ...component.state, ...update }; };
  return component;
}
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};

beforeEach(() => { jest.clearAllMocks(); ensureUser.mockResolvedValue({}); });

describe("PrimarySiteSelect", () => {
  it("saves an author-owned option snapshot with canonical case/dataset IDs", async () => {
    const component = create();
    await component.handleChange("bone marrow aspirate");
    expect(ensureUser).toHaveBeenCalledTimes(1);
    expect(component.props.savePrimarySite).toHaveBeenCalledWith(expect.objectContaining({
      caseId: "case-1", datasetId: "dataset-1", alterationId: "PRIMARY_SITE",
      authorId: "user-1", data: { primarySite: options[0] },
    }));
    expect(component.state).toEqual({ saving: false, error: null });
  });

  it("does not save an unchanged or unconfigured value, or save before hydration", async () => {
    const component = create();
    await component.handleChange("na");
    await component.handleChange("not-an-option");
    component.props = { ...component.props, ready: false };
    await component.handleChange("bone marrow aspirate");
    expect(component.props.savePrimarySite).not.toHaveBeenCalled();
  });

  it("serializes saves and leaves the prior controlled value visible on error", async () => {
    const pending = deferred();
    const component = create({ savePrimarySite: jest.fn(() => pending.promise) });
    const save = component.handleChange("bone marrow aspirate");
    await new Promise(setImmediate);
    await component.handleChange("peripheral blood");
    expect(component.props.savePrimarySite).toHaveBeenCalledTimes(1);
    expect(component.state.saving).toBe(true);
    expect(component.render().props.children[0].props.disabled).toBe(true);
    pending.resolve();
    await save;
    component.props.savePrimarySite.mockRejectedValueOnce(new Error("offline"));
    await component.handleChange("peripheral blood");
    expect(component.state.error).toBe("components.primary-site.save-error");
    expect(component.render().props.children[0].props.value).toBe("na");
  });

  it("does not write if sign-in is cancelled", async () => {
    ensureUser.mockRejectedValueOnce(new Error("cancelled"));
    const component = create();
    await component.handleChange("peripheral blood");
    expect(component.props.savePrimarySite).not.toHaveBeenCalled();
    expect(component.state).toEqual({ saving: false, error: null });
  });

  it.each(["case", "dataset", "unmount"])("ignores sign-in continuation after %s changes", async (change) => {
    const pending = deferred();
    ensureUser.mockReturnValueOnce(pending.promise);
    const component = create();
    const save = component.handleChange("peripheral blood");
    const previous = component.props;
    if (change === "unmount") component.componentWillUnmount();
    else {
      component.props = { ...previous, ...(change === "case" ? { caseId: "case-2" } : { dataset: { id: "dataset-2" } }) };
      component.componentDidUpdate(previous);
    }
    pending.resolve();
    await save;
    expect(component.props.savePrimarySite).not.toHaveBeenCalled();
  });

  it("does not apply a late completion to a newly selected case", async () => {
    const pending = deferred();
    const component = create({ savePrimarySite: () => pending.promise });
    const save = component.handleChange("peripheral blood");
    await Promise.resolve();
    const previous = component.props;
    component.props = { ...previous, caseId: "case-2" };
    component.componentDidUpdate(previous);
    component.state = { saving: true, error: "new case status" };
    pending.resolve();
    await save;
    expect(component.state).toEqual({ saving: true, error: "new case status" });
  });

  it("keeps an out-of-catalog current value readable without adding a writable choice", () => {
    const component = create({ value: { value: "Legacy", label: "Legacy site" } });
    const select = component.render().props.children[0];
    expect(select.props.options).toContainEqual({ value: "Legacy", label: "Legacy site", headerLabel: "Legacy site", disabled: true });
    expect(select.props["aria-label"]).toBe("components.primary-site.label");
  });

  it("keeps the saved label consistent with the report after a catalog rename", () => {
    const component = create({
      value: { value: "BRCA", label: "Saved name" },
      options: [{ value: "BRCA", label: "New catalog name" }],
    });
    expect(component.render().props.children[0].props.options).toEqual([
      { value: "BRCA", label: "BRCA — Saved name", headerLabel: "Saved name" },
    ]);
  });

  it("edits the existing label without a box, fixed input width, or repeated acronym", () => {
    const component = create({
      value: { value: "THCA", label: "Thyroid carcinoma" },
      options: [{ value: "THCA", label: "Thyroid carcinoma" }],
    });
    const [select, measure] = component.render().props.children;
    expect(select.props.bordered).toBe(false);
    expect(select.props.style?.width).toBeUndefined();
    expect(select.props.optionLabelProp).toBe("headerLabel");
    expect(select.props.options).toEqual([
      { value: "THCA", label: "THCA — Thyroid carcinoma", headerLabel: "Thyroid carcinoma" },
    ]);
    expect(select.props.showSearch).toBe(true);
    expect(select.props.title).toContain("Thyroid carcinoma");
    expect(measure.props["aria-hidden"]).toBe(true);
    expect(measure.props.children).toBe("Thyroid carcinoma");
  });

  it("shows a retry action after hydration failure", () => {
    const component = create({ ready: false, loadError: true });
    const children = React.Children.toArray(component.render().props.children);
    const alert = children.find((child) => child.type === "Alert");
    expect(alert.props.message).toBe("components.primary-site.load-error");
    alert.props.action.props.onClick();
    expect(component.props.retry).toHaveBeenCalledWith("case-1");
  });

  it("keeps hydration retry visible even if a concurrent save cleared shared failure status", () => {
    const props = mapStateToProps({
      CaseReport: { id: "case-1" }, Settings: { dataset: { id: "dataset-1" } },
      Interpretations: { status: "succeeded", loadedContext: null, loadError: "Read failed" },
    });
    expect(props.ready).toBe(false);
    expect(props.loadError).toBe(true);
  });

  it("allows the first choice without source metadata while retaining readiness restrictions", async () => {
    const props = mapStateToProps({
      CaseReport: { id: "case-1", metadata: {} },
      Settings: {
        dataset: { id: "dataset-1", fields: [] },
        data: { primarySiteOptions: { myeloseq: options } },
      },
      Interpretations: { loadedContext: { caseId: "case-1", datasetId: "dataset-1" } },
    });
    expect(props).toMatchObject({ value: null, options, ready: true });
    const component = create(props);
    expect(component.render().props.children[0].props).toMatchObject({
      disabled: false, value: undefined, placeholder: "components.primary-site.label",
    });
    await component.handleChange("peripheral blood");
    expect(component.props.savePrimarySite).toHaveBeenCalledWith(expect.objectContaining({
      data: { primarySite: options[1] },
    }));
    component.props = { ...component.props, ready: false };
    expect(component.render().props.children[0].props.disabled).toBe(true);
    component.props = { ...component.props, ready: true, options: [] };
    expect(component.render().props.children[0].props.disabled).toBe(true);
  });

  it("maps saved value and options without source metadata or a dataset field", () => {
    const props = mapStateToProps({
      CaseReport: { id: "case-1", metadata: {} },
      Settings: {
        dataset: { id: "dataset-1", fields: [] },
        data: { primarySiteOptions: { myeloseq: options } },
      },
      Interpretations: { status: "succeeded", loadedContext: { caseId: "case-1", datasetId: "dataset-1" },
        selected: { PRIMARY_SITE: "saved" }, byId: { saved: { alterationId: "PRIMARY_SITE", isCurrentUser: true, caseId: "case-1", datasetId: "dataset-1", data: { primarySite: options[0] } } } },
    });
    expect(props).toMatchObject({ value: options[0], options, ready: true });
  });

  it("waits for repository acknowledgment rather than resolving at dispatch", async () => {
    const dispatch = jest.fn();
    const props = mapDispatchToProps(dispatch);
    const payload = { alterationId: "PRIMARY_SITE" };
    const promise = props.savePrimarySite(payload);
    const action = dispatch.mock.calls[0][0];
    expect(action.interpretation).toBe(payload);
    action.completion(new Error("offline"));
    await expect(promise).rejects.toThrow("offline");
  });
});
