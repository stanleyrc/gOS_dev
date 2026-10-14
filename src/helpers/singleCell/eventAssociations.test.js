import { describeRow, forestDomain, forestOf, fmtP, pickers, summaryRows, zMatrix } from "./eventAssociations";

const row = (event, outcome, o = {}) => ({
  event, label: event, cls: "amp", outcome, measure: "Hedges g", k: 3, k_up: 3, effect: 0.5, lo: 0.1, hi: 0.9, p: 0.01, q: 0.04, stouffer_q: 0.05, stouffer_z: 2.5,
  per_patient: [{ patient: "A", effect: 0.4, se: 0.2, p: 0.05, n_carriers: 10 }, { patient: "B", effect: 0.6, se: 0.3, p: 0.05, n_carriers: 8 }], ...o,
});
const data = {
  events: [{ event: "EGFR amp", label: "EGFR amp", cls: "amp", patients: ["A", "B"] }],
  results: [row("EGFR amp", "MES state"), row("EGFR amp", "S score", { q: 0.5, stouffer_q: 0.6, p: 0.2 }), row("PTEN homdel", "MES state", { k: 1, q: undefined }), row("SOX2 amp", "S score", { effect: -1, k_up: 0, q: 0.001 })],
};

describe("summaryRows", () => {
  it("keeps rows with a combined estimate, best q first", () => {
    const r = summaryRows(data);
    expect(r.map((x) => x.key)).toEqual(["SOX2 amp|S score", "EGFR amp|MES state", "EGFR amp|S score"]);
  });
  it("filters by q, outcome, class and direction", () => {
    expect(summaryRows(data, { maxQ: 0.05 })).toHaveLength(2);
    expect(summaryRows(data, { outcomes: ["MES state"] })).toHaveLength(1);
    expect(summaryRows(data, { direction: "down" }).map((x) => x.event)).toEqual(["SOX2 amp"]);
    expect(summaryRows(data, { classes: ["homdel"] })).toHaveLength(0);
  });
});

describe("forest", () => {
  it("lists patients then the pooled estimate with 95% intervals", () => {
    const f = forestOf(data.results[0]);
    expect(f.map((x) => x.kind)).toEqual(["patient", "patient", "pooled"]);
    expect(f[0].lo).toBeCloseTo(0.4 - 1.96 * 0.2);
    expect(f[2].n).toBe(18);
  });
  it("domain includes zero and is clipped", () => {
    const d = forestDomain([{ effect: 0.5, lo: 0.1, hi: 20 }]);
    expect(d[0]).toBeLessThan(0);
    expect(d[1]).toBeLessThan(9);
  });
});

describe("text and matrix", () => {
  it("describes direction and counts", () => {
    const s = describeRow({ ...data.results[0], measure: "log odds ratio", bestQ: 0.04 });
    expect(s).toMatch(/more likely/);
    expect(s).toMatch(/3 of 3 patients/);
    expect(describeRow({ ...data.results[1], effect: -0.2 })).toMatch(/lower/);
  });
  it("formats p", () => {
    expect(fmtP(0.5)).toBe("0.50");
    expect(fmtP(0.00012)).toBe("1.2e-4");
    expect(fmtP(NaN)).toBe("n/a");
  });
  it("builds the z matrix and pickers", () => {
    const m = zMatrix(data);
    expect(m.events[0].event).toBe("SOX2 amp");
    expect(m.cell.get("EGFR amp|MES state").stouffer_z).toBe(2.5);
    expect(pickers(data).events[0].nPatients).toBe(2);
  });
});
