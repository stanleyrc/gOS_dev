import { curvePanels, partialRhoLookup, quantileBins, runningMedian, spearman, zscore } from "./tmbCurve";

const line = (n, f) => Array.from({ length: n }, (_, i) => ({ x: i, y: f(i) }));

describe("tmbCurve", () => {
  test("zscore centres and scales, constant gives zeros, NaN kept", () => {
    const z = zscore([1, 2, 3, NaN]);
    expect(z[0]).toBeCloseTo(-1.2247, 3);
    expect(z[3]).toBeNaN();
    expect(zscore([2, 2, 2])).toEqual([0, 0, 0]);
  });
  test("spearman is monotone-invariant", () => {
    const x = [1, 2, 3, 4, 5, 6];
    expect(spearman(x, x.map((v) => v ** 3))).toBeCloseTo(1, 6);
    expect(spearman(x, x.map((v) => -v))).toBeCloseTo(-1, 6);
    expect(spearman([1, 2], [1, 2])).toBeNaN();
  });
  test("runningMedian follows a ramp and needs 8 points", () => {
    expect(runningMedian(line(5, (i) => i))).toEqual([]);
    const t = runningMedian(line(60, (i) => i), { grid: 10 });
    expect(t).toHaveLength(10);
    expect(t[9].y).toBeGreaterThan(t[0].y);
    expect(t.every((p) => p.lo <= p.y && p.y <= p.hi)).toBe(true);
  });
  test("quantileBins are equal count with CI around the mean", () => {
    const b = quantileBins(line(50, (i) => i), 5);
    expect(b).toHaveLength(5);
    expect(b.map((x) => x.n)).toEqual([10, 10, 10, 10, 10]);
    expect(b[0].y).toBeCloseTo(4.5, 6);
    expect(b[0].lo).toBeLessThan(b[0].y);
    expect(quantileBins(line(6, (i) => i), 5)).toHaveLength(2);
  });
  const doc = {
    patients: { A: { noisy: false }, B: { noisy: true } },
    cells: {
      A: { cell: ["a1", "a2", "a3", "a4", "a5"], subclonal: [1, 2, 3, 4, 5], "Cov": [5, 4, 3, 2, NaN] },
      B: { cell: ["b1", "b2", "b3", "b4"], subclonal: [1, 2, 3, 4], "Cov": [1, 2, 3, 4] },
    },
    genes: { "subclonal|qc": { up: [{ gene: "G", mean_r: 0.2, p: 0.01, q: 0.03, per: { A: 0.3 } }], down: [] } },
    numeric: [{ covariate: "Cov", measure: "subclonal", adjust: "qc", per_patient: { A: { r: -0.5 } }, combined: { mean_r: -0.5 } }],
  };
  test("curvePanels drops missing cells, pools z-scored, honours noisy", () => {
    const r = curvePanels(doc, "subclonal", { covariate: "Cov" });
    expect(r.panels.map((p) => p.n)).toEqual([4, 4]);
    expect(r.panels[0].rho).toBeCloseTo(-1, 6);
    expect(r.pooled.n).toBe(8);
    expect(r.pooled.points.reduce((s, p) => s + p.x, 0)).toBeCloseTo(0, 6);
    expect(curvePanels(doc, "subclonal", { covariate: "Cov", excludeNoisy: true }).panels).toHaveLength(1);
  });
  test("curvePanels with gene vectors keyed by cell id", () => {
    const r = curvePanels(doc, "subclonal", { yByPatient: { A: { a1: 1, a2: 2, a3: 3, a4: 4, a5: 9 } } });
    expect(r.panels).toHaveLength(1);
    expect(r.panels[0].n).toBe(5);
  });
  test("partialRhoLookup", () => {
    expect(partialRhoLookup(doc, { gene: "G", measure: "subclonal", adjust: "qc" }).per.A).toBe(0.3);
    expect(partialRhoLookup(doc, { covariate: "Cov", measure: "subclonal", adjust: "qc" }).per.A).toBe(-0.5);
    expect(partialRhoLookup(doc, { gene: "Z", measure: "subclonal", adjust: "qc" })).toBeNull();
  });
});
