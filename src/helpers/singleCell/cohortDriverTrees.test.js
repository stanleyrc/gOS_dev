import { buildDriverEntries, entryStates } from "./driverLayer";
import { alignPatient, cellStatus, eventSnvColumns, parseCdt, patientColumnMap, rowAtY, selectSharedColumns, serializeCdt, sharedKeyOf, slimSnv } from "./cohortDriverTrees";

const ev = (o) => ({ Tier: 1, vartype: "SNV", type: "missense", Genome_Location: "7:1", n_cells: 20, cell_fraction: 0.5, ...o });
const ids = (n, p) => Array.from({ length: n }, (_, i) => `${p}${i}`);

const A = ids(10, "a");
const B = ids(10, "b");
const evA = [
  ev({ gene: "EGFR", type: "missense", Variant: "A289V", seqnames: "7", start: 10, cell_ids: A.slice(0, 6).join(",") }),
  ev({ gene: "PTEN", vartype: "homdel", type: "homdel", Genome_Location: "10:5", cell_ids: A.join(",") }),
  ev({ gene: "TP53", type: "missense", Genome_Location: "17:3", seqnames: "17", start: 3, cell_ids: A.slice(0, 4).join(","), role: "TSG" }),
];
const evB = [
  ev({ gene: "PTEN", vartype: "homdel", type: "homdel", Genome_Location: "10:5", cell_ids: B.slice(0, 7).join(",") }),
  ev({ gene: "EGFR", type: "missense", Variant: "G598V", seqnames: "7", start: 99, Genome_Location: "7:99", cell_ids: B.slice(0, 5).join(",") }),
  ev({ gene: "MYC", vartype: "amp", type: "amp", Genome_Location: "8:1", cell_ids: B.slice(0, 5).join(",") }),
];
const entriesA = buildDriverEntries(evA, { tumorIds: A });
const entriesB = buildDriverEntries(evB, { tumorIds: B });

describe("cohort driver trees: shared columns", () => {
  test("same gene + class = same key across patients, different variants", () => {
    const ka = entriesA.find((e) => e.event.gene === "EGFR");
    const kb = entriesB.find((e) => e.event.gene === "EGFR");
    expect(ka.key).not.toBe(kb.key);
    expect(sharedKeyOf(ka)).toBe(sharedKeyOf(kb));
  });
  test("one entry per key; the strongest wins", () => {
    const more = buildDriverEntries([...evA, ev({ gene: "EGFR", Variant: "R108K", seqnames: "7", start: 55, Genome_Location: "7:55", cell_ids: A.slice(0, 2).join(",") })], { tumorIds: A });
    const m = patientColumnMap(more).get("snv|EGFR");
    expect(m.entry.n).toBe(6);
    expect(m.others).toHaveLength(1);
  });
  test("columns ranked by patients; identical for all patients; missing events are null, not dropped", () => {
    const { columns } = selectSharedColumns({ a: entriesA, b: entriesB }, { preset: "all", maxCols: 10 });
    const keys = columns.map((c) => c.key);
    expect(keys.slice(0, 2).sort()).toEqual(["homdel|PTEN", "snv|EGFR"]);
    expect(keys).toEqual(expect.arrayContaining(["snv|TP53", "amp|MYC"]));
    const sa = new Map(entriesA.map((e) => [e.key, Float32Array.of(2)]));
    const al = alignPatient(columns, entriesA, sa);
    const bl = alignPatient(columns, entriesB, new Map());
    expect(al.map((c) => c.column.key)).toEqual(bl.map((c) => c.column.key));
    expect(al).toHaveLength(columns.length);
    expect(al.find((c) => c.column.key === "amp|MYC").entry).toBeNull();
    expect(bl.find((c) => c.column.key === "snv|TP53").entry).toBeNull();
    expect(al.find((c) => c.column.key === "snv|TP53").entry.event.gene).toBe("TP53");
  });
  test("gene picker restricts columns; maxCols caps the default", () => {
    expect(selectSharedColumns({ a: entriesA, b: entriesB }, { preset: "all", genes: ["myc"] }).columns.map((c) => c.key)).toEqual(["amp|MYC"]);
    expect(selectSharedColumns({ a: entriesA, b: entriesB }, { preset: "all", maxCols: 2 }).columns).toHaveLength(2);
  });
  test("Types and tier filters", () => {
    const { columns } = selectSharedColumns({ a: entriesA, b: entriesB }, { preset: "all", classes: ["amp"] });
    expect(columns.map((c) => c.key)).toEqual(["amp|MYC"]);
    const t3 = buildDriverEntries([ev({ gene: "ZZZ3", Tier: 3, cell_ids: A.slice(0, 5).join(",") })], { tumorIds: A });
    expect(selectSharedColumns({ a: t3 }, { preset: "all", maxTier: 2 }).columns).toHaveLength(0);
    expect(selectSharedColumns({ a: t3 }, { preset: "all", maxTier: 3 }).columns).toHaveLength(1);
  });
});

describe("cohort driver trees: per-cell states use the patient layer helper", () => {
  const snv = {
    cells: A,
    variants: [{ id: "chr7_10_A_T", driver: true }, { id: "chr1_5_A_T" }],
    status: A.map((c, i) => Int8Array.from([i < 3 ? 1 : i < 8 ? 0 : -1, 0])),
  };
  test("slimSnv keeps the mapped column and entryStates agrees with the full matrix", () => {
    const withSnv = buildDriverEntries(evA, { tumorIds: A, snv });
    const egfr = withSnv.find((e) => e.event.gene === "EGFR");
    expect(egfr.snvColumn).toBe(0);
    const slim = slimSnv(snv, eventSnvColumns(withSnv));
    expect(slim.variants).toHaveLength(1);
    const again = buildDriverEntries(evA, { tumorIds: A, snv: slim });
    const e2 = again.find((e) => e.event.gene === "EGFR");
    const full = entryStates(egfr, { order: A, snv, snvRows: Int32Array.from(A, (_, i) => i) });
    const part = entryStates(e2, { order: A, snv: slim, snvRows: Int32Array.from(A, (_, i) => i) });
    expect([...part]).toEqual([...full]);
    expect([...full].slice(0, 10)).toEqual([2, 2, 2, 1, 1, 1, 1, 1, 0, 0]);
  });
  test("cell status text", () => {
    const egfr = entriesA.find((e) => e.event.gene === "EGFR");
    expect(cellStatus(egfr, 2).status).toBe("mutant");
    expect(cellStatus(egfr, 0).status).toBe("no coverage");
    expect(cellStatus(null, 0).kind).toBe("absent");
    expect(cellStatus(entriesB.find((e) => e.cls === "amp"), 5).status).toMatch(/copy number 5/);
    expect(cellStatus(entriesB.find((e) => e.cls === "amp"), NaN).kind).toBe("none");
  });
});

describe("cohort driver trees: URL and geometry", () => {
  test("round trip of the cdt params", () => {
    const s = { preset: "subclonal", maxTier: 3, strongOnly: false, classes: ["amp", "fusion"], genes: ["EGFR", "MYC"], maxCols: 8, colPx: 20, height: "tall" };
    const q = serializeCdt(s);
    expect(q.cdtp).toBe("subclonal");
    expect(parseCdt(`?${new URLSearchParams(q)}`)).toEqual(s);
  });
  test("defaults serialize to nothing and bad values fall back", () => {
    expect(serializeCdt({})).toEqual({});
    const p = parseCdt("?cdtp=x&cdtt=9&cdtw=999&cdth=huge&cdtc=nope");
    expect(p.preset).toBe("recommended");
    expect(p.maxTier).toBe(2);
    expect(p.colPx).toBe(30);
    expect(p.height).toBe("compact");
    expect(p.classes).toBeNull();
  });
  test("rowAtY maps pixels to cells", () => {
    expect(rowAtY(0, 100, 1000)).toBe(0);
    expect(rowAtY(99.9, 100, 1000)).toBe(999);
    expect(rowAtY(50, 100, 0)).toBe(-1);
  });
});
