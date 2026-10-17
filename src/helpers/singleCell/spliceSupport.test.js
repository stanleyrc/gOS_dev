import { spliceSourceText, spliceSupportOf } from "./spliceSupport";

const doc = {
  patients: {
    P1: {
      G1: { support: "DNA+RNA", dna: [{ variant: "c.1-1G>C", n_cells: 10 }], rna: [{ text: "G1 cryptic acceptor", n_cells: 11 }] },
      G2: { support: "DNA", dna: [{ variant: "c.5+1G>A", n_cells: 4 }], rna: [] },
      G4: { support: "RNA", dna: [], rna: [{ text: "G4 exon skip", n_cells: 2 }] },
    },
  },
};

test("splice source per patient and gene", () => {
  expect(spliceSupportOf(doc, "P1", "G1").support).toBe("DNA+RNA");
  expect(spliceSupportOf(doc, "P1", "X")).toBeNull();
  expect(spliceSupportOf(null, "P1", "G1")).toBeNull();
  expect(spliceSourceText(doc, spliceSupportOf(doc, "P1", "G1"))).toMatch(/confirmed in RNA: G1 cryptic acceptor \(11 cells\)/);
  expect(spliceSourceText(doc, spliceSupportOf(doc, "P1", "G2"))).toMatch(/no aberrant splicing/);
  expect(spliceSourceText(doc, spliceSupportOf(doc, "P1", "G4"))).toMatch(/^RNA only/);
  expect(spliceSourceText(null, null)).toMatch(/not available/);
});
