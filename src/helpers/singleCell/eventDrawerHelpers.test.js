import { eventGenes, findVariantIndex, parseSite, pickIgvCells } from "./eventDrawerHelpers";

const variants = [{ id: "chr1_100_A_G" }, { id: "chr8_47819400_A_G" }, { id: "chr8_47819400_A_T" }];
const packed = (entries) => ({ idx: Int32Array.from(entries.map((e) => e[0])), vaf: Uint8Array.from(entries.map((e) => e[1])) });
const snvCells = { n1: packed([[1, 250]]), t1: packed([[1, 0]]), t2: packed([[1, 100]]), t3: packed([[1, 200], [2, 250]]), t4: packed([[0, 90]]) };
const cloneOf = new Map([["n1", "Normal"], ["t1", "Clone 2"], ["t2", "Clone 2"], ["t3", "Clone 3"], ["t4", "Clone 3"]]);

test("parseSite reads Variant_g and ids", () => {
  expect(parseSite("8:47819400-47819400 A>G")).toEqual({ chromosome: "8", position: 47819400, ref: "A", alt: "G" });
  expect(parseSite("chr8_47819400_A_G").position).toBe(47819400);
  expect(parseSite("8:5-9")).toEqual({ chromosome: "8", position: 5, ref: "", alt: "" });
  expect(parseSite("nonsense")).toBeNull();
});

test("findVariantIndex matches alleles", () => {
  expect(findVariantIndex(variants, parseSite("8:47819400-47819400 A>G"))).toBe(1);
  expect(findVariantIndex(variants, parseSite("8:47819400-47819400 A>T"))).toBe(2);
  expect(findVariantIndex(variants, parseSite("8:47819400-47819400 A>C"))).toBe(1);
  expect(findVariantIndex(variants, parseSite("9:1-1 A>C"))).toBe(-1);
});

test("pickIgvCells prefers tumour carriers with alt reads, highest VAF first", () => {
  const r = pickIgvCells({ site: parseSite("8:47819400-47819400 A>G"), variants, snvCells, carriers: ["n1", "t1", "t2", "t3", "t4"], cloneOf });
  expect(r).toEqual({ cells: ["t3", "t2"], basis: "alt-reads" });
});

test("pickIgvCells falls back to tumour carriers with a reason", () => {
  const r = pickIgvCells({ site: parseSite("8:47819400-47819400 A>G"), variants, snvCells: null, carriers: ["n1", "t1", "t2"], cloneOf });
  expect(r.cells).toEqual(["t1", "t2"]);
  expect(r.basis).toBe("carriers");
  expect(r.reason).toMatch(/not available/);
  expect(pickIgvCells({ site: parseSite("8:1-9"), variants, snvCells, carriers: ["t1"], cloneOf }).reason).toMatch(/point mutation/);
  expect(pickIgvCells({ site: parseSite("8:99-99 A>G"), variants, snvCells, carriers: ["t1"], cloneOf }).reason).toMatch(/not in/);
});

test("eventGenes", () => {
  expect(eventGenes({ gene: "SMIM1::CAMTA1", fusion_genes: "SMIM1::CAMTA1" })).toEqual(["SMIM1", "CAMTA1"]);
  expect(eventGenes({ fusion_genes: "upstream of TAF1L::IFNB1" })).toEqual(["TAF1L", "IFNB1"]);
  expect(eventGenes({ gene: "EGFR" })).toEqual(["EGFR"]);
  expect(eventGenes({ gene: "" })).toEqual([]);
});
