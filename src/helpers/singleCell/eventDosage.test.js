import { addDosageQ, carrierSet, cnEvents, combineDosage, expectedSign, fmtRhoQ, patientDosage, rankByDosage } from "./eventDosage";
import { locusCn } from "./cnExpression";
import { eventClass, eventLabel } from "./cohortStats";

// synthetic genome graph row: 4 bins of 100 over global 0-400
const rowWith = (cn) => ({ binIndex: { gStart: [0, 100, 200, 300], gEnd: [100, 200, 300, 400] }, values: [2, cn, 2, 2] });
const locus = { start: 110, end: 190 };

// 40 cells, first 12 are carriers with CN 6 at the gene (bin 1) and higher expression
function makeCells(amp = true) {
  const cells = [];
  const expr = [];
  for (let i = 0; i < 40; i += 1) {
    const carrier = i < 12;
    const cn = carrier ? (amp ? 6 : 0) : 2;
    cells.push({ id: `c${i}`, row: rowWith(cn) });
    expr.push(carrier ? (amp ? 3 + (i % 3) * 0.1 : 0) : 1 + (i % 5) * 0.2);
  }
  return { cells, expr, carriers: new Set(cells.slice(0, 12).map((c) => c.id)) };
}

describe("locusCn binary search", () => {
  it("matches the width-weighted mean over several bins", () => {
    expect(locusCn(rowWith(6), 150, 250)).toBeCloseTo((50 * 6 + 50 * 2) / 100);
    expect(locusCn(rowWith(6), 410, 500)).toBeNull();
    expect(locusCn(rowWith(6), 0, 400)).toBeCloseTo((2 + 6 + 2 + 2) / 4);
  });
});

describe("patientDosage", () => {
  it("amp carriers: higher expression and a positive CN-expression rho", () => {
    const { cells, expr, carriers } = makeCells(true);
    const r = patientDosage({ cells, expr, carriers, locus, cls: "amp" });
    expect(r.status).toBe("ok");
    expect(r.nCarriers).toBe(12);
    expect(r.nOthers).toBe(28);
    expect(r.diff).toBeGreaterThan(1);
    expect(r.sign).toBe(1);
    expect(r.rho).toBeGreaterThan(0.5);
    expect(r.p).toBeLessThan(0.001);
  });
  it("homdel carriers: expression ~0 (positive control), rho positive because CN 0 pairs with expression 0", () => {
    const { cells, expr, carriers } = makeCells(false);
    const r = patientDosage({ cells, expr, carriers, locus, cls: "homdel" });
    expect(r.medianCarriers).toBe(0);
    expect(r.sign).toBe(-1);
    expect(r.rho).toBeGreaterThan(0.5);
  });
  it("is unavailable without RNA or without the gene", () => {
    const { cells, carriers } = makeCells();
    expect(patientDosage({ cells: [], expr: [], carriers, locus, cls: "amp" }).status).toBe("unavailable");
    expect(patientDosage({ cells, expr: null, carriers, locus, cls: "amp" }).reason).toMatch(/matrix/);
  });
});

describe("combineDosage", () => {
  it("Stouffer across patients agrees in direction and counts expected-direction patients", () => {
    const { cells, expr, carriers } = makeCells(true);
    const a = patientDosage({ cells, expr, carriers, locus, cls: "amp" });
    const b = patientDosage({ cells, expr: expr.map((v) => v * 1.1), carriers, locus, cls: "amp" });
    const c = combineDosage([a, b, { status: "unavailable", reason: "no RNA" }], "amp");
    expect(c.k).toBe(2);
    expect(c.rho).toBeGreaterThan(0.5);
    expect(c.carrierZ).toBeGreaterThan(3);
    expect(c.nExpected).toBe(2);
  });
  it("adds BH q across events and ranks by it", () => {
    const rows = [
      { id: "a", combined: { rho: 0.2, rhoP: 0.04 } },
      { id: "b", combined: { rho: 0.7, rhoP: 0.0001 } },
      { id: "c", combined: { rho: NaN, rhoP: NaN } },
    ];
    const withQ = addDosageQ(rows);
    expect(withQ[1].q).toBeLessThan(withQ[0].q);
    expect(Number.isNaN(withQ[2].q)).toBe(true);
    expect(rankByDosage(withQ, (r) => r).map((r) => r.id)).toEqual(["b", "a", "c"]);
  });
});

describe("helpers", () => {
  it("expected sign by class and cn events filter", () => {
    expect(expectedSign("amp")).toBe(1);
    expect(expectedSign("homdel")).toBe(-1);
    expect(expectedSign("fusion")).toBe(0);
    expect(cnEvents([{ cls: "amp", gene: "SOX2" }, { cls: "snv", gene: "TP53" }, { cls: "homdel", gene: "" }])).toHaveLength(1);
  });
  it("carrier set unions the cell ids of that gene and class", () => {
    const events = [
      { gene: "SOX2", vartype: "AMP", type: "SCNA", cell_ids: "a,b" },
      { gene: "SOX2", vartype: "AMP", type: "SCNA", cell_ids: "b,c" },
      { gene: "SOX2", vartype: "HOMDEL", type: "SCNA", cell_ids: "z" },
    ];
    expect([...carrierSet(events, "sox2", "amp", eventClass, eventLabel)].sort()).toEqual(["a", "b", "c"]);
  });
  it("formats rho (q)", () => {
    expect(fmtRhoQ(0.456, 0.0004)).toBe("+0.46 (4e-4)");
    expect(fmtRhoQ(NaN, 0.1)).toBeNull();
  });
});
