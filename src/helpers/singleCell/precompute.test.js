import {
  excludedCellIds,
  cellCycleConcordance,
  hotspotGenotypes,
  mergePrecomputeIntoCells,
  qcFlagLabel,
  siteCloneSummary,
  siteEvidence,
  spearman,
  statusRows,
} from "./precompute";

const calls = {
  cells: ["a", "b", "c"],
  clone: ["C1", "C1", "C2"],
  sites: [
    { id: "chr5:1295113:G>A", name: "TERT C228T", hotspot: true, n_mut: 2 },
    { id: "chr2:208248388:C>T", name: "IDH1 R132H", hotspot: true, n_mut: 0 },
    { id: "chr7:1:A>T", name: "X", hotspot: false, n_mut: 3 },
  ],
  dna: {
    "chr5:1295113:G>A": { alt: [3, 0, 2], dp: [6, 0, 4], p: [0.99, null, 0.95], call: ["mut", "nc", "mut"], miss: [0.1, 1, 0.2] },
    "chr2:208248388:C>T": { alt: [0, 0, 0], dp: [8, 9, 5], p: [0.01, 0.01, 0.02], call: ["wt", "wt", "wt"], miss: [0.1, 0.1, 0.2] },
  },
  rna: { "chr5:1295113:G>A": { alt: [1, 0, null], dp: [2, 0, null] } },
};

describe("precompute helpers", () => {
  it("labels QC flags", () => {
    expect(qcFlagLabel({ flags: "" })).toBe("pass");
    expect(qcFlagLabel({ flags: "high_mapd,doublet" })).toBe("doublet");
    expect(qcFlagLabel({ flags: "high_ado" })).toBe("high ado");
    expect(qcFlagLabel({ flags: "high_ado,high_mapd" })).toBe("several");
    expect(qcFlagLabel(null)).toBeNull();
  });

  it("reads hotspot genotypes, skipping non-hotspots and silent hotspots when asked", () => {
    expect(Object.keys(hotspotGenotypes(calls))).toEqual(["TERT C228T", "IDH1 R132H"]);
    expect(hotspotGenotypes(calls, { minMut: 1 })).toEqual({ "TERT C228T": { a: "mut", b: "nc", c: "mut" } });
  });

  it("merges precompute fields into cells without dropping existing fields", () => {
    const cells = [{ cell_id: "a", clone_id: "C1" }, { cell_id: "b", clone_id: "C1" }, { cell_id: "z" }];
    const out = mergePrecomputeIntoCells(cells, {
      qc: { cells: [{ cell_id: "a", ado: 0.1, mapd: 0.2, flags: "doublet" }] },
      sphase: { cells: [{ cell_id: "b", rt_cor: 0.2, s_call: true, s_prob: 0.9 }, { cell_id: "a", rt_cor: null }] },
      telomeres: { cells: [{ cell_id: "a", tel_rel: 1.5, tvr_frac: 0.1, alt_like: false }] },
      calls,
    });
    expect(out[0]).toMatchObject({ cell_id: "a", clone_id: "C1", "QC flag": "doublet", pc_ado: 0.1, "ALT-like": "no", "TERT C228T": "mutant" });
    expect(out[0]["DNA cycle"]).toBeUndefined();
    expect(out[1]).toMatchObject({ "DNA cycle": "S-phase", pc_s_prob: 0.9, "TERT C228T": "no call" });
    expect(out[2]).toEqual({ cell_id: "z" });
    expect(out[0]["IDH1 R132H"]).toBeUndefined();
  });

  it("returns cells unchanged when nothing is computed", () => {
    const cells = [{ cell_id: "a" }];
    expect(mergePrecomputeIntoCells(cells, {})).toBe(cells);
  });

  it("computes Spearman rho with ties", () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1);
    expect(spearman([1, 1, 2, 2], [1, 1, 2, 2])).toBeCloseTo(1);
    expect(spearman([1, 2], [1, 2])).toBeNull();
  });

  it("pairs DNA and RNA cell cycle and summarises clones", () => {
    const sphase = {
      cells: [
        { cell_id: "a", clone_id: "C1", rt_cor: 0.3, s_call: true },
        { cell_id: "b", clone_id: "C1", rt_cor: 0.0, s_call: false },
        { cell_id: "c", clone_id: "C2", rt_cor: -0.1, s_call: false },
        { cell_id: "d", clone_id: "C2", rt_cor: null },
      ],
    };
    const rna = [
      { cell_id: "a", S_Score: 0.5, G2M_Score: 0.1, Phase: "S" },
      { cell_id: "b", S_Score: 0.1, G2M_Score: 0.0, Phase: "G1" },
      { cell_id: "c", S_Score: -0.2, G2M_Score: 0.3, Phase: "G2M" },
    ];
    const r = cellCycleConcordance(sphase, rna);
    expect(r.points).toHaveLength(3);
    expect(r.nPaired).toBe(3);
    expect(r.rhoS).toBeCloseTo(1);
    const c1 = r.perClone.find((x) => x.clone === "C1");
    expect(c1).toMatchObject({ n: 2, dnaS: 1, nRna: 2, rnaCycling: 1 });
    expect(r.perClone.find((x) => x.clone === "C2").rnaFrac).toBe(1);
  });

  it("builds per-cell site evidence sorted by clone order", () => {
    const rows = siteEvidence(calls, "chr5:1295113:G>A", new Map([["c", "C0"]]), ["C0", "C1"]);
    expect(rows.map((r) => r.id)).toEqual(["c", "a", "b"]);
    expect(rows[1]).toMatchObject({ alt: 3, dp: 6, call: "mut", rnaAlt: 1, rnaDp: 2 });
    expect(siteCloneSummary(rows)).toEqual({ C0: { mut: 1, wt: 0, nc: 0, n: 1 }, C1: { mut: 1, wt: 0, nc: 1, n: 2 } });
    expect(siteEvidence(calls, "nope")).toEqual([]);
  });

  it("orders status rows and finds each patient's worst state", () => {
    const doc = {
      steps: [{ id: "inputs" }, { id: "qc" }],
      patients: {
        P2: { inputs: { state: "done" }, qc: { state: "stale" } },
        P1: { inputs: { state: "done" }, qc: { state: "done" } },
        P3: { inputs: { state: "failed" } },
      },
    };
    const s = statusRows(doc);
    expect(s.steps).toEqual(["inputs", "qc"]);
    expect(s.rows.map((r) => [r.patient, r.worst, r.nDone])).toEqual([
      ["P1", "done", 2],
      ["P2", "stale", 1],
      ["P3", "failed", 0],
    ]);
    expect(statusRows(null)).toEqual({ steps: [], rows: [] });
  });

  it("excludes cells by QC rules and a manual list", () => {
    const cells = mergePrecomputeIntoCells([{ cell_id: "a" }, { cell_id: "b" }, { cell_id: "c" }, { cell_id: "d" }], {
      qc: { cells: [{ cell_id: "a", flags: "doublet" }, { cell_id: "b", flags: "high_mapd", cn_inconsistent: true }, { cell_id: "c", flags: "" }] },
      sphase: { cells: [{ cell_id: "c", rt_cor: 0.2, s_call: true }] },
    });
    expect([...excludedCellIds(cells, ["doublet"])]).toEqual(["a"]);
    expect([...excludedCellIds(cells, ["cn_inconsistent", "s_phase"])].sort()).toEqual(["b", "c"]);
    expect([...excludedCellIds(cells, [], ["d"])]).toEqual(["d"]);
    expect(excludedCellIds(cells).size).toBe(0);
  });
});
