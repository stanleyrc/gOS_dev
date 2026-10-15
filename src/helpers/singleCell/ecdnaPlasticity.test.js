import { cardPoints, detailGenes, detailOutcomes, detailSources, fmtEffect, isHeritable, plasticityRows, quadrant, scatterPoints } from "./ecdnaPlasticity";

const src = (rho, p, q) => ({
  mean: 20, cv: 0.5, frac_high: 0.5,
  heritability: { rho, p_within_clone: p },
  top_state: { label: "AC state", beta: 0.2, q: 0.2 },
  top_resid: { label: "MP1", beta_resid: -0.3, q_resid: q },
  tests: [{ outcome: "AC", p_resid: 0.2 }, { outcome: "MP1", p_resid: 0.001 }],
});
const data = {
  rows: [
    { patient: "P1", gene: "EGFR", n_cells: 100, n_rna: 90, sources: { total: src(0.0, 0.7, 0.01), walk: src(0.8, 0.001, 0.01) } },
    { patient: "P2", gene: "MDM2", n_cells: 50, n_rna: 50, sources: { total: src(0.1, 0.5, 0.5) } },
  ],
};

test("quadrants separate plastic from lineage-bound", () => {
  expect(quadrant(data.rows[0].sources.total)).toBe("plastic");
  expect(quadrant(data.rows[0].sources.walk)).toBe("lineage-bound");
  expect(quadrant(data.rows[1].sources.total)).toBe("unlinked");
  expect(quadrant(null)).toBe("none");
  expect(isHeritable(src(0.5, 0.2, 1))).toBe(false);
});

test("rows are per source and scatter uses |residual effect|", () => {
  expect(plasticityRows(data, "walk")).toHaveLength(1);
  const rows = plasticityRows(data, "total");
  expect(rows).toHaveLength(2);
  const pts = scatterPoints(rows);
  expect(pts[0]).toMatchObject({ x: 0, y: 0.3, sig: true });
  expect(pts[1].sig).toBe(false);
});

test("detail helpers", () => {
  const detail = {
    rows: data.rows.slice(0, 1),
    outcomes: { MP1: { label: "MP1", values: [1, null, 3] } },
    genes: { EGFR: { ids: ["a", "b", "c"], clone: ["x", "x", "y"], clade: ["u", "u", "v"], total: [4, 5, 6], total_resid: [0, 1, -1] } },
  };
  expect(detailGenes(detail)).toEqual(["EGFR"]);
  expect(detailSources(detail, "EGFR")).toEqual(["total", "walk"]);
  expect(detailOutcomes(detail, "EGFR", "total")[0].outcome).toBe("MP1");
  expect(cardPoints(detail, "EGFR", "total", "MP1")).toHaveLength(2);
  expect(cardPoints(detail, "EGFR", "total", "MP1", true)[1]).toMatchObject({ x: -1, y: 3, clone: "y" });
  expect(cardPoints(detail, "EGFR", "walk", "MP1")).toEqual([]);
});

test("fmtEffect", () => {
  expect(fmtEffect(0.274, 0.0004)).toBe("+0.27 (q <0.001)");
  expect(fmtEffect(NaN)).toBe("n/a");
});
