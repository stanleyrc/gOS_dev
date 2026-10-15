import { NONE, activeCount, decodeFilters, distinctValues, emptyFilters, encodeFilters, filterRows, rowPasses, setColumnFilter } from "./eventFilters";

const rows = [
  { patient: "P1", gene: "EGFR", role: "oncogene", variant: "p.A289V", fraction: 0.9, nCells: 90 },
  { patient: "P1", gene: "PTEN", role: "", variant: "p.R130*", fraction: 0.2, nCells: 20 },
  { patient: "P2", gene: "EGFR", role: "oncogene", variant: "", fraction: 0.5, nCells: 50 },
  { patient: "P3", gene: "TP53", role: "tsg", variant: "c.1-2del", fraction: NaN, nCells: 0 },
];

describe("eventFilters", () => {
  test("empty state keeps everything", () => {
    expect(filterRows(rows, emptyFilters())).toHaveLength(4);
    expect(activeCount(emptyFilters())).toBe(0);
  });
  test("categorical is OR within a column and AND across columns", () => {
    let f = setColumnFilter(emptyFilters(), "cat", "patient", ["P1", "P2"]);
    expect(filterRows(rows, f)).toHaveLength(3);
    f = setColumnFilter(f, "cat", "gene", ["EGFR"]);
    expect(filterRows(rows, f).map((r) => r.patient)).toEqual(["P1", "P2"]);
  });
  test("missing categorical values match the none label", () => {
    const f = setColumnFilter(emptyFilters(), "cat", "role", [NONE]);
    expect(filterRows(rows, f).map((r) => r.gene)).toEqual(["PTEN"]);
    expect(distinctValues(rows, "role")).toEqual(["oncogene", "tsg", NONE]);
  });
  test("numeric range has open ends and rejects NaN", () => {
    expect(filterRows(rows, setColumnFilter(emptyFilters(), "num", "fraction", [0.2, 0.5])).map((r) => r.gene)).toEqual(["PTEN", "EGFR"]);
    expect(filterRows(rows, setColumnFilter(emptyFilters(), "num", "fraction", [0.6, null]))).toHaveLength(1);
    expect(filterRows(rows, setColumnFilter(emptyFilters(), "num", "fraction", [null, 1]))).toHaveLength(3);
  });
  test("text is a case-insensitive contains", () => {
    expect(filterRows(rows, setColumnFilter(emptyFilters(), "text", "variant", "DEL")).map((r) => r.patient)).toEqual(["P3"]);
    expect(rowPasses(rows[2], setColumnFilter(emptyFilters(), "text", "variant", "p."))).toBe(false);
  });
  test("accessors override row fields", () => {
    const f = setColumnFilter(emptyFilters(), "cat", "cls", ["x"]);
    expect(rowPasses(rows[0], f, { cls: () => "x" })).toBe(true);
  });
  test("clearing a filter removes it", () => {
    let f = setColumnFilter(emptyFilters(), "cat", "gene", ["EGFR"]);
    f = setColumnFilter(f, "num", "fraction", [null, null]);
    f = setColumnFilter(f, "cat", "gene", []);
    expect(activeCount(f)).toBe(0);
  });
  test("url round trip with awkward characters", () => {
    let f = setColumnFilter(emptyFilters(), "cat", "gene", ["A,B", "C;D", NONE]);
    f = setColumnFilter(f, "num", "fraction", [0.1, null]);
    f = setColumnFilter(f, "num", "nCells", [null, 40]);
    f = setColumnFilter(f, "text", "variant", "p.A=1~");
    const s = encodeFilters(f);
    expect(s.split("_")).toHaveLength(4);
    expect(s).toMatch(/^[A-Za-z0-9~:@!,._-]+$/);
    expect(decodeFilters(s)).toEqual(f);
    expect(activeCount(f)).toBe(4);
  });
  test("decode tolerates junk", () => {
    expect(decodeFilters("")).toEqual(emptyFilters());
    expect(decodeFilters("garbage_x@a,b_y:_z!_q@1")).toEqual(emptyFilters());
    expect(encodeFilters(emptyFilters())).toBe("");
  });
});
