/** @jest-environment node */

import { getDensityPlotVariableSelection } from "./sageQc";

describe("getDensityPlotVariableSelection", () => {
  const fields = [
    { name: "z_numeric", type: "int" },
    { name: "a_enum", type: "enum" },
    { name: "ignored", type: "string" },
    { name: "a_numeric", type: "float" },
    { name: "z_enum", type: "enum" },
  ];

  it("preserves the existing option order and default for each variable", () => {
    const { options, variables } = getDensityPlotVariableSelection(fields);

    expect(options.xVariable.map((field) => field.name)).toEqual([
      "a_numeric",
      "z_numeric",
    ]);
    expect(options.yVariable.map((field) => field.name)).toEqual([
      "z_numeric",
      "a_numeric",
    ]);
    expect(options.colorVariable.map((field) => field.name)).toEqual([
      "a_enum",
      "a_numeric",
      "z_enum",
      "z_numeric",
    ]);
    expect(variables).toEqual({
      xVariable: "a_numeric",
      yVariable: "z_numeric",
      colorVariable: "a_enum",
    });
    expect(fields.map((field) => field.name)).toEqual([
      "z_numeric",
      "a_enum",
      "ignored",
      "a_numeric",
      "z_enum",
    ]);
  });

  it("keeps selected values and falls back for a falsy selection", () => {
    const { variables } = getDensityPlotVariableSelection(fields, {
      xVariable: "z_numeric",
      yVariable: "",
      colorVariable: "not_in_options",
    });

    expect(variables).toEqual({
      xVariable: "z_numeric",
      yVariable: "z_numeric",
      colorVariable: "not_in_options",
    });
  });

  it("leaves defaults undefined when no fields are allowed", () => {
    const { options, variables } = getDensityPlotVariableSelection([
      { name: "label", type: "string" },
    ]);

    expect(options).toEqual({
      xVariable: [],
      yVariable: [],
      colorVariable: [],
    });
    expect(variables).toEqual({
      xVariable: undefined,
      yVariable: undefined,
      colorVariable: undefined,
    });
  });
});
