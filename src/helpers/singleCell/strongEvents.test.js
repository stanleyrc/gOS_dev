import { isStrongEvent } from "./strongEvents";

describe("isStrongEvent", () => {
  it("needs 10% of tumor cells for deletions and 3 cells + 5% otherwise", () => {
    expect(isStrongEvent({ vartype: "HOMDEL", type: "SCNA", n_cells: 5, cell_fraction: 0.04 })).toBe(false);
    expect(isStrongEvent({ vartype: "HOMDEL", type: "SCNA", n_cells: 127, cell_fraction: 1 })).toBe(true);
    expect(isStrongEvent({ vartype: "AMP", type: "SCNA", n_cells: 2, cell_fraction: 0.5 })).toBe(false);
    expect(isStrongEvent({ vartype: "fusion", type: "Fusion", n_cells: 70, cell_fraction: 0.64 })).toBe(true);
    expect(isStrongEvent({ gene: "TP53" })).toBe(true);
  });
});
