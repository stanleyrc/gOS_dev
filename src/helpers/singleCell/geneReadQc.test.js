import { flaggedGenes, geneReadQcMap, readQcText } from "./geneReadQc";

const doc = {
  hits: [
    { patient: "PA", gene: "G1", read_qc: { flags: ["alt at read-block ends"] } },
    { patient: "PB", gene: "G1", read_qc: { flags: ["same allele in PA, PC"] } },
    { patient: "PA", gene: "G2", read_qc: { flags: ["alt at read-block ends"] } },
    { patient: "PB", gene: "G2", read_qc: { flags: [] } },
    { patient: "PA", gene: "G3" },
  ],
  driver_genes: [{ gene: "G1", recurrence_trunc: { q_patients: 0.01, q_patients_read_qc_pass: 1 } }],
};

test("gene is flagged only when every hit is scanned and flagged", () => {
  expect([...flaggedGenes(doc)]).toEqual(["G1"]);
  const m = geneReadQcMap(doc);
  expect(m.get("G2")).toMatchObject({ nFlagged: 1, allFlagged: false });
  expect(m.get("G3").allFlagged).toBe(false);
  expect(m.get("G1")).toMatchObject({ q: 0.01, qQc: 1 });
});

test("readQcText explains", () => {
  const m = geneReadQcMap(doc);
  expect(readQcText(m.get("G1"))).toMatch(/all 2 subclonal driver hits.*same allele in other patients.*after/);
  expect(readQcText(m.get("G3"))).toBe("");
});
