import { buildDriverEntries } from "./driverLayer";
import { cohortEntries } from "./cohortOncoprint";
import { collapseFamilies, familyLabel, dominantMember, findEntryByKey, familyCountText, classificationText, familyClassifications, familyLinkLines } from "./complexFamilies";
import { driverKey } from "./driverContrast";
import { buildReadEvidence, normJunctionId } from "./junctionEvidence";

const cx = (o) => ({ type: "Complex SV", seqnames: "7", start: "1", end: "2", gene: "", cell_fraction: 0.5, ...o });
const dm = cx({ vartype: "DM", Variant: "DM (7)", Genome_Location: "7:41978527-55927140", cell_ids: "a,b,c,d", n_cells: 4, cell_fraction: 0.4, family_id: "P:F1", junction_ids: ["j1", "j2"] });
const dmSub = cx({ vartype: "DM", Variant: "DM (1,7)", Genome_Location: "7:41978527-55927140,1:176054688-181054722", cell_ids: "a,b", n_cells: 2, family_id: "P:F1", junction_ids: ["j2", "j3"] });
const rdd = cx({ vartype: "rDelDup", Variant: "rDelDup (1,7)", Genome_Location: "1:178054688-179054722,7:53954498-54954567", cell_ids: "a,b,c,d,e,f", n_cells: 6, family_id: "P:F1", junction_ids: ["j1"] });
const lone = cx({ vartype: "TIC", Variant: "TIC (3,9)", Genome_Location: "3:1-10,9:1-10", cell_ids: "x,y,z", n_cells: 3 }); // no family: unresolved / no file
const rows = [dm, dmSub, rdd, lone];

describe("event families", () => {
  test("dominant member prefers the DM with most cells", () => {
    expect(dominantMember([dm, dmSub, rdd])).toBe(dm); // rdd has more cells but is not DM
    expect(dominantMember([rdd])).toBe(rdd);
  });
  test("label: dominant classification, its chromosomes, others as subsets", () => {
    expect(familyLabel([dm, dmSub, rdd])).toBe("ecDNA chr7 (+chr1 in subsets)");
  });
  test("a 3-member family and an unresolved row collapse to 2 entries; carriers are the union", () => {
    const entries = buildDriverEntries(rows);
    expect(entries).toHaveLength(2);
    const f = entries.find((e) => e.family);
    expect(f.family.id).toBe("P:F1");
    expect(f.family.members).toHaveLength(3);
    expect(f.carriers.sort()).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(f.label).toBe("ecDNA chr7 (+chr1 in subsets)");
    expect(f.event.junction_ids.sort()).toEqual(["j1", "j2", "j3"]);
    expect(entries.find((e) => !e.family).label).toBe("TIC chr3↔chr9");
    expect(cohortEntries(rows)).toHaveLength(2);
  });
  test("cohort entry takes the union count; fraction scales from the dominant row's total", () => {
    const f = cohortEntries(rows).find((e) => e.family);
    expect(f.n).toBe(6);
    expect(f.fraction).toBeCloseTo(6 / 10); // dominant: 4 cells = 0.4 of 10 tumour cells
  });
  test("keys: family key is the dominant row's key; every member key resolves to the family entry", () => {
    const entries = buildDriverEntries(rows);
    const f = entries.find((e) => e.family);
    expect(f.key).toBe(driverKey(dm));
    expect(findEntryByKey(entries, driverKey(rdd))).toBe(f);
    expect(findEntryByKey(entries, driverKey(dmSub))).toBe(f);
    expect(findEntryByKey(entries, driverKey(lone))).toBe(entries.find((e) => !e.family));
    expect(findEntryByKey(entries, "nope")).toBeNull();
  });
  test("single-row family stays a plain entry; header text counts families and classifications", () => {
    const solo = cx({ vartype: "DM", Variant: "DM (5)", Genome_Location: "5:1-10", cell_ids: "a", family_id: "P:F9" });
    expect(collapseFamilies([solo]).families.size).toBe(0);
    expect(familyCountText(buildDriverEntries(rows))).toBe("2 complex-SV families (4 per-cell classifications)");
    expect(familyCountText([])).toBeNull();
  });
  test("classification text", () => {
    expect(classificationText(familyClassifications([dm, dmSub, rdd]))).toBe("rDelDup (1,7) in 6 cells, ecDNA (7) in 4 cells, ecDNA (1,7) in 2 cells");
  });
});

describe("family links", () => {
  const file = {
    members: [{ event_index: 1, Variant: "DM (1,7)", n_cells: 33 }, { event_index: 2, Variant: "rDelDup (1,7)", n_cells: 86 }, { event_index: 3, Variant: "TIC (4)", n_cells: 2 }],
    links: [
      { a: 2, b: 1, shared_ids: ["1:178554687+|7:54454498-", "x"], n_cells: 33, kind: "shared_junction" },
      { a: 3, b: 1, shared_ids: [], n_cells: 2, kind: "weak_attach" },
      { a: 1, b: 2, shared_ids: [], n_cells: 9, kind: "twin" },
    ],
  };
  test("lines for shared junction, weak attachment and twin", () => {
    const { lines, weak } = familyLinkLines(file);
    expect(lines[0]).toBe("rDelDup (1,7) - shared junction 1:178554687+|7:54454498- (+1 more) with DM (1,7) in 33 common cells");
    expect(lines[1]).toMatch(/TIC \(4\) attached, <3 cells/);
    expect(lines[2]).toMatch(/classifier twin/);
    expect([...weak]).toEqual(["TIC (4)"]);
    expect(familyLinkLines({}).lines).toEqual([]);
  });
});

describe("read evidence from junction_identity support", () => {
  test("rows need a carrier read; carriers first in tree order; missing cell is 0", () => {
    const support = { j1: { c1: 3, c2: 1, n1: 2 }, j2: { c1: 5 }, j3: { n1: 4 } };
    const ev = buildReadEvidence({ junctionIds: ["j1", "j2", "j3"], support, carriers: ["c2", "c1"], cellIds: ["n1", "n2", "c1", "c2"], cellOrder: ["n2", "c1", "n1", "c2"] });
    expect(ev.rows.map((r) => r.key)).toEqual(["j1", "j2"]); // j3 has no carrier read
    expect(ev.cells.map((c) => c.id)).toEqual(["c1", "c2", "n2", "n1"]);
    expect(ev.values[0].map((v) => v.cn)).toEqual([3, 1, 0, 2]);
    expect(ev.values[1].map((v) => v.state)).toEqual(["cn", "zero", "zero", "zero"]);
  });
  test("id normalisation sorts both ends", () => {
    expect(normJunctionId("7:5-|1:9+")).toBe("1:9+ | 7:5-");
  });
});
