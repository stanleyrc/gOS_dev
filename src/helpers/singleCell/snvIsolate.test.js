import { carrierRows, f1Comparison, isolateTable, spectrumFit, subsetLeafStates, tableTsv } from "./snvIsolate";
import { SBS96 } from "./signatures";

const snv = {
  cells: ["a", "b", "c"],
  variants: [
    { id: "chr1_5_A_C", chromosome: "chr1", position: 5, ref: "A", alt: "C", gene: "TP53", protein: "p.R1H", consequence: "missense_variant", category: "subclonal", cladeCells: 2, cladeScore: 0.9, context: "A[C>A]A" },
    { id: "chr1_9_G_T", chromosome: "chr1", position: 9, ref: "G", alt: "T", category: "truncal", cladeCells: 3, cladeScore: 0.4, context: "C[C>A]A" },
  ],
  status: [Int8Array.from([1, -1]), Int8Array.from([0, -1]), Int8Array.from([-1, -1])],
};
const annot = { cat: { category: ["subclonal", "truncal"], signature: ["SBS13", "SBS1"] }, num: { carriers: [1, 0], phylo: [0.9, 0.4] }, sigProb: [0.8, 0.3] };

test("carrier rows and leaf states", () => {
  expect([...carrierRows(snv, [0], [0, 1, 2])]).toEqual([0]);
  expect([...carrierRows(snv, [1], [0, 1, 2])]).toEqual([]);
  const idx = new Map([["a", 0], ["b", 1], ["c", 2]]);
  expect([...subsetLeafStates(snv, ["a", "b", "c", "z"], [0, 1], idx)]).toEqual([1, 0, -1, -1]);
});

test("table and tsv", () => {
  const rows = isolateTable(snv, annot, [0, 1]);
  expect(rows[0]).toMatchObject({ gene: "TP53", label: "TP53 p.R1H", carriers: 1, tree_site: "subclonal", signature: "SBS13" });
  const tsv = tableTsv(rows).split("\n");
  expect(tsv[0].split("\t")).toContain("clade_f1");
  expect(tsv).toHaveLength(4);
});

test("F1 comparison", () => {
  const r = f1Comparison(annot, [0]);
  expect(r.subsetMedian).toBeCloseTo(0.9);
  expect(r.allMedian).toBeCloseTo(0.65);
  expect(r.subset.counts[9]).toBe(1);
});

test("spectrum fit against a reference signature", () => {
  const col = new Float64Array(96);
  col[SBS96.indexOf("A[C>A]A")] = 1;
  const reference = { names: ["SBS13"], columns: [col] };
  const fit = spectrumFit(snv, [0], reference, "SBS13", annot);
  expect(fit.cosine).toBeCloseTo(1);
  expect(fit.high).toBe(1);
  const both = spectrumFit(snv, [0, 1], reference, "SBS13", annot);
  expect(both.cosine).toBeCloseTo(1 / Math.sqrt(2));
  expect(both.low).toBe(1);
});
