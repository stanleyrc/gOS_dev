import { LOSS_CODE, MIN_HIT_CELLS, biallelicOnlyRows, biallelicSummary, cohortCallIndex, secondHitMap, damagingSnv, describeCall, hitOverlap, twoHitCalls, twoHitStates } from "./twoHit";

// synthetic fixtures only
const cellsOf = (n, p = "c") => Array.from({ length: n }, (_, i) => `${p}${i}`);
const snvEntry = (gene, ids, extra = {}) => ({
  key: `${gene}-snv`,
  cls: "snv",
  carriers: ids,
  n: ids.length,
  fraction: ids.length / 10,
  event: { gene, type: "Trunc", vartype: "SNV", Variant: "p.R130*", VAF: 0.996, seqnames: "10", start: "100", Tier: "1", role: "Tumor Suppressor", cell_ids: ids.join(","), cells: `${ids.length}/10`, ...extra },
});
const homdelEntry = (gene, ids) => ({ key: `${gene}-hd`, cls: "homdel", carriers: ids, n: ids.length, fraction: ids.length / 10, event: { gene, type: "SCNA", vartype: "HOMDEL", role: "Tumor Suppressor", cells: `${ids.length}/10` } });
const lossFile = (cells, genes) => ({ cells, genes });

describe("damagingSnv", () => {
  it("accepts truncating and splice, rejects benign missense", () => {
    expect(damagingSnv({ type: "Trunc" })).toBe(true);
    expect(damagingSnv({ type: "Splice" })).toBe(true);
    expect(damagingSnv({ type: "Missense", Tier: "3", effect: "Unknown" })).toBe(false);
    expect(damagingSnv({ type: "Missense", Tier: "2", effect: "Unknown" })).toBe(true);
    expect(damagingSnv({ type: "Missense", Tier: "3", effect: "Loss-of-function" })).toBe(true);
  });
});

describe("twoHitCalls", () => {
  const cells = cellsOf(10);
  it("SNV + LOH in the same cells is biallelic and lists both hits", () => {
    const loss = lossFile(cells, { PTEN: cells.map((_, i) => (i < 9 ? LOSS_CODE.LOH : LOSS_CODE.BALANCED)) });
    const [c] = twoHitCalls([snvEntry("PTEN", cells)], { loss, tumorIds: cells });
    expect(c.state).toBe("biallelic");
    expect(c.hits.map((h) => h.kind).sort()).toEqual(["loh", "snv"]);
    expect(c.biallelicCells).toBe(9);
    expect(hitOverlap(c)).toEqual({ both: 9, snvOnly: 1, lossOnly: 0 });
    expect(c.vafSuggestsLoh).toBe(false);
    expect(c.text).toMatch(/PTEN p\.R130\* \(VAF 99\.6%, 10\/10 cells\) \+ LOH by loss \(minor CN 0 in 9\/10 cells\) -> biallelic/);
  });
  it("SNV with no LOH call and VAF near 1 stays monoallelic but is flagged", () => {
    const loss = lossFile(cells, { PTEN: cells.map(() => LOSS_CODE.BALANCED) });
    const [c] = twoHitCalls([snvEntry("PTEN", cells)], { loss, tumorIds: cells });
    expect(c.state).toBe("monoallelic");
    expect(c.vafSuggestsLoh).toBe(true);
    expect(c.text).toMatch(/consistent with LOH/);
  });
  it("SNV and LOH in different cells is not biallelic", () => {
    const loss = lossFile(cells, { PTEN: cells.map((_, i) => (i >= 5 ? LOSS_CODE.LOH : LOSS_CODE.BALANCED)) });
    const [c] = twoHitCalls([snvEntry("PTEN", cells.slice(0, 5))], { loss, tumorIds: cells });
    expect(c.state).toBe("monoallelic");
    expect(c.hits).toHaveLength(2);
    expect(hitOverlap(c).both).toBe(0);
  });
  it("homozygous deletion from allelic CN replaces the events' HOMDEL rows", () => {
    const loss = lossFile(cells, { CDKN2A: cells.map(() => LOSS_CODE.HOMDEL) });
    const [c] = twoHitCalls([homdelEntry("CDKN2A", cells.slice(0, 2))], { loss, tumorIds: cells });
    expect(c.state).toBe("homdel");
    expect(c.hits).toHaveLength(1);
    expect(c.hits[0].source).toMatch(/allelic/);
  });
  it("without a loss file only the events are used and the source says so", () => {
    const [c] = twoHitCalls([homdelEntry("PTEN", cells)], { loss: null, tumorIds: cells });
    expect(c.state).toBe("homdel");
    expect(c.lossSource).toMatch(/not available/);
  });
  it("fewer than MIN_HIT_CELLS cells is not a call", () => {
    const few = cells.slice(0, MIN_HIT_CELLS - 1);
    const [c] = twoHitCalls([snvEntry("PTEN", few)], { loss: null, tumorIds: cells });
    expect(c.state).toBe("none");
  });
  it("ignores non tumour-suppressor genes, benign missense and upstream-only fusions; copy-neutral LOH counts", () => {
    const loss = lossFile(cells, { PTEN: cells.map(() => LOSS_CODE.CNLOH) });
    const calls = twoHitCalls(
      [snvEntry("EGFR", cells, { role: "Oncogene" }), snvEntry("PTEN", cells, { type: "Missense", Tier: "3", effect: "Unknown" }), { key: "f", cls: "fusion", upstreamOnly: true, carriers: cells, fraction: 1, event: { gene: "upstream of PTEN::X", upstream_only: true } }],
      { loss, tumorIds: cells }
    );
    expect(calls.map((c) => c.gene)).toEqual(["PTEN"]);
    expect(calls[0].hits.map((h) => h.kind)).toEqual(["cnloh"]);
  });
  it("normal cells are excluded from the denominators", () => {
    const all = [...cells, "n0", "n1"];
    const loss = lossFile(all, { PTEN: all.map(() => LOSS_CODE.LOH) });
    const [c] = twoHitCalls([], { loss, tumorIds: cells });
    expect(c.hits[0].n).toBe(10);
    expect(c.hits[0].fraction).toBe(1);
  });
});

describe("twoHitStates and cohort summary", () => {
  it("combines the SNV state with the loss set per cell", () => {
    const out = twoHitStates(Float32Array.from([2, 2, 1, 1, 0, 0]), ["a", "b", "c", "d", "e", "f"], new Set(["a", "c", "e"]));
    expect(Array.from(out)).toEqual([4, 2, 3, 1, 3, 0]);
  });
  it("lists biallelic and homdel genes with patients and hit combos", () => {
    const cells = cellsOf(10);
    const b = twoHitCalls([snvEntry("PTEN", cells)], { loss: lossFile(cells, { PTEN: cells.map(() => LOSS_CODE.LOH) }), tumorIds: cells });
    const h = twoHitCalls([], { loss: lossFile(cells, { CDKN2A: cells.map(() => LOSS_CODE.HOMDEL) }), tumorIds: cells });
    const s = biallelicSummary({ P1: b, P2: h, P3: b });
    expect(s.map((x) => [x.gene, x.patients.length])).toEqual([["PTEN", 2], ["CDKN2A", 1]]);
    expect(s[0].patients[0].combo).toBe("SNV + LOH");
    expect(describeCall(h[0])).toMatch(/both copies lost/);
  });
});

describe("second hit map and biallelic-only rows", () => {
  const cells = cellsOf(10);
  it("maps SNV entry keys to the loss cells; drops genes with too few loss cells", () => {
    const calls = twoHitCalls([snvEntry("PTEN", cells), snvEntry("NF1", cells)], {
      loss: lossFile(cells, { PTEN: cells.map(() => LOSS_CODE.LOH), NF1: cells.map((_, i) => (i < 2 ? LOSS_CODE.LOH : LOSS_CODE.BALANCED)) }),
      tumorIds: cells,
    });
    const m = secondHitMap(calls);
    expect([...m.keys()]).toEqual(["PTEN-snv"]);
    expect(m.get("PTEN-snv").size).toBe(10);
  });
  it("keeps only biallelic or homdel cells", () => {
    const calls = twoHitCalls([snvEntry("PTEN", cells), snvEntry("NF1", cells)], {
      loss: lossFile(cells, { PTEN: cells.map(() => LOSS_CODE.LOH), NF1: cells.map(() => LOSS_CODE.BALANCED) }),
      tumorIds: cells,
    });
    const index = cohortCallIndex({ P1: calls });
    const rows = [
      { gene: "PTEN", nPatients: 2, cells: { P1: { fraction: 1 }, P2: { fraction: 0.5 } } },
      { gene: "NF1", nPatients: 1, cells: { P1: { fraction: 1 } } },
    ];
    const out = biallelicOnlyRows(rows, index);
    expect(out).toHaveLength(1);
    expect(Object.keys(out[0].cells)).toEqual(["P1"]);
    expect(out[0].nPatients).toBe(1);
  });
});
