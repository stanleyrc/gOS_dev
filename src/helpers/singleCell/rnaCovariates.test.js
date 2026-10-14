import { groupedFieldOptions, mergeCovariates, strataUnits } from "./rnaCovariates";

const summary = {
  cells: [{ rna_id: "r1", state: "MES" }, { rna_id: "r2", state: "AC" }, { rna_id: "r3", state: "AC" }],
  fields: [{ name: "state", numeric: false, levels: ["MES", "AC"] }],
};
const cov = {
  fields: [
    { name: "Driver: EGFR amp", group: "Driver event", numeric: false },
    { name: "CN: EGFR", group: "Copy number", numeric: true },
    { name: "state", group: "x", numeric: false },
  ],
  cells: { r1: { "Driver: EGFR amp": "carrier", "CN: EGFR": 40, state: "OVERRIDE" }, r2: { "Driver: EGFR amp": "non-carrier", "CN: EGFR": 2 } },
};

describe("mergeCovariates", () => {
  it("adds covariate fields and values, keeps existing columns", () => {
    const out = mergeCovariates(summary, cov);
    expect(out.cells[0]["Driver: EGFR amp"]).toBe("carrier");
    expect(out.cells[0].state).toBe("MES");
    expect(out.cells[2]["Driver: EGFR amp"]).toBeUndefined();
    expect(out.fields.map((f) => f.name)).toEqual(["state", "Driver: EGFR amp", "CN: EGFR"]);
    expect(out.fields[1].levels).toEqual(["carrier", "non-carrier"]);
    expect(out.fields[2].numeric).toBe(true);
    expect(out.fieldGroups).toMatchObject({ state: "RNA metadata", "Driver: EGFR amp": "Driver event", "CN: EGFR": "Copy number" });
    expect(summary.cells[0]["Driver: EGFR amp"]).toBeUndefined();
  });
  it("passes through without covariates", () => {
    expect(mergeCovariates(summary, null).fields).toEqual(summary.fields);
    expect(mergeCovariates(null, cov)).toBeNull();
  });
  it("drops fields with too many levels", () => {
    const many = { fields: [{ name: "Clade", group: "Lineage" }], cells: Object.fromEntries(Array.from({ length: 70 }, (_, i) => [`c${i}`, { Clade: `k${i}` }])) };
    const s = { cells: Array.from({ length: 70 }, (_, i) => ({ rna_id: `c${i}` })), fields: [] };
    expect(mergeCovariates(s, many).fields).toHaveLength(0);
  });
});

describe("groupedFieldOptions", () => {
  it("groups with RNA metadata first", () => {
    const o = groupedFieldOptions(["Driver: X", "state", "Plate"], { "Driver: X": "Driver event", state: "RNA metadata", Plate: "Sample" });
    expect(o.map((g) => g.label)).toEqual(["RNA metadata", "Driver event", "Sample"]);
  });
});

describe("strataUnits", () => {
  const cells = [{ p: "x" }, { p: "x" }, { p: "x" }, { p: "y" }, { p: "y" }, { p: "y" }, { p: "x" }, { p: "x" }, { p: "x" }];
  const m = { patient: "P", idxA: [0, 1, 2, 3, 4, 5], idxB: [6, 7, 8] };
  it("returns the patient as one unit without a field", () => {
    expect(strataUnits(m, cells, null)).toEqual([{ patient: "P", label: "P", level: null, idxA: m.idxA, idxB: m.idxB }]);
  });
  it("keeps strata with enough cells in both groups", () => {
    const u = strataUnits(m, cells, "p");
    expect(u).toHaveLength(1);
    expect(u[0]).toMatchObject({ label: "P · x", idxA: [0, 1, 2], idxB: [6, 7, 8] });
  });
});
