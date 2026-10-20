import { appendSnv, decodeColumn, fillDense, groupRanges, isColumnarTable, matrixOffsets, snvFromColumnar, tableVariants } from "./snvColumnar";
import { _workerSource, loadColumnarMatrix } from "./snvColumnarLoader";
import { snvFromSparse } from "./cellFiles";

// Synthetic fixture only (no patient data): 3 sites x 3 cells, written the way skilift gos_sc_snv_columnar.py writes them.
const chromoBins = { 1: { startPlace: 1, endPlace: 1000 }, 2: { startPlace: 1001, endPlace: 2000 }, 3: { startPlace: 2001, endPlace: 3000 } };

function encode(entries) {
  const n = entries.length;
  const offsets = [0];
  entries.forEach((e) => offsets.push(offsets[offsets.length - 1] + e.length));
  let head = 4 * (n + 1);
  head += (8 - (head % 8)) % 8;
  const buf = new ArrayBuffer(head + 8 * offsets[n]);
  const dv = new DataView(buf);
  offsets.forEach((o, i) => dv.setUint32(4 * i, o, true));
  let k = 0;
  entries.forEach((e) =>
    e.forEach(([c, r, a, g]) => {
      dv.setUint16(head + 8 * k, c, true);
      dv.setUint16(head + 8 * k + 2, r, true);
      dv.setUint16(head + 8 * k + 4, a, true);
      dv.setInt8(head + 8 * k + 6, g);
      k += 1;
    })
  );
  return { buf, head, offsets };
}

const entries = [
  [[0, 3, 2, 1], [2, 1, 1, -1]],
  [[1, 5, 0, 0], [2, 65535, 65535, 1]],
  [[0, 0, 4, -1]],
];
const { buf, head } = encode(entries);
const table = {
  format: "gos-sc-snv-cols/1",
  set: "tree",
  n_sites: 3,
  cells: ["c1", "c2", "c3"],
  columns: {
    id: { type: "str", values: ["chr1_100_A_G", "chr2_200_C_T", "chr3_300_G_A"] },
    category: { type: "dict", dict: ["truncal", "subclonal"], codes: [0, 1, -1] },
    anchor: { type: "dict", dict: ["c1|c3", "c2|c3"], codes: [0, 1, 1] },
    driver: { type: "bool", values: [0, 1, null] },
    clade_score: { type: "num", values: [0.9, null, 0.2] },
  },
  matrix: {
    file: "x.cells.bin",
    header_bytes: head,
    groups: [
      { key: "c1|c3", first_site: 0, n_sites: 1, byte_start: head, byte_end: head + 16 },
      { key: "c2|c3", first_site: 1, n_sites: 2, byte_start: head + 16, byte_end: head + 40 },
    ],
  },
};
// the same content as snv_matrix.json (compact)
const sparse = {
  variants: [
    { id: "chr1_100_A_G", category: "truncal", anchor: "c1|c3", driver: false, clade_score: 0.9 },
    { id: "chr2_200_C_T", category: "subclonal", anchor: "c2|c3", driver: true },
    { id: "chr3_300_G_A", anchor: "c2|c3", clade_score: 0.2 },
  ],
  cells: { c1: [[0, 3, 2, 1], [2, 0, 4, null]], c2: [[1, 5, 0, 0]], c3: [[0, 1, 1, null], [1, null, null, 1]] },
};

describe("columnar SNV site sets", () => {
  it("decodes columns", () => {
    expect(decodeColumn(table.columns.category)).toEqual(["truncal", "subclonal", null]);
    expect(decodeColumn(table.columns.driver)).toEqual([false, true, null]);
    expect(tableVariants(table)[1]).toEqual({ id: "chr2_200_C_T", category: "subclonal", anchor: "c2|c3", driver: true });
    expect(isColumnarTable(table)).toBe(true);
    expect(isColumnarTable({ format: "compact" })).toBe(false);
  });

  it("matches snvFromSparse on the same content", () => {
    const cellIds = ["c3", "c1", "c2", "c4"]; // display order differs from the table's; c4 has no reads
    const offsets = matrixOffsets(buf, table);
    const dense = fillDense(offsets, buf.slice(head), 0, 0, 3, table.cells, cellIds);
    const a = snvFromColumnar(table, dense, cellIds, chromoBins);
    const b = snvFromSparse(sparse, cellIds, chromoBins);
    expect(a.variants.map((v) => [v.id, v.category, v.driver, v.cladeScore])).toEqual(b.variants.map((v) => [v.id, v.category, v.driver, v.cladeScore]));
    for (let r = 0; r < cellIds.length; r += 1) {
      expect(Array.from(a.status[r])).toEqual(Array.from(b.status[r]));
      expect(Array.from(a.alt[r])).toEqual(Array.from(b.alt[r]));
      expect(Array.from(a.depth[r])).toEqual(Array.from(b.depth[r]));
      expect(Array.from(a.gt[r])).toEqual(Array.from(b.gt[r]));
    }
    // a call without counts: genotype kept, no reads
    expect(a.gt[0][1]).toBe(1);
    expect(a.status[0][1]).toBe(-1);
    expect(Number.isNaN(a.alt[0][1])).toBe(true);
  });

  it("decodes one branch block from its byte range", () => {
    const [range] = groupRanges(table, ["c2|c3"]);
    expect(range).toEqual({ siteStart: 1, siteEnd: 3, byteStart: head + 16, byteEnd: head + 40 });
    const offsets = matrixOffsets(buf, table);
    const block = buf.slice(range.byteStart, range.byteEnd);
    const dense = fillDense(offsets, block, offsets[range.siteStart], range.siteStart, range.siteEnd, table.cells, ["c1", "c2", "c3"]);
    const snv = snvFromColumnar(table, dense, ["c1", "c2", "c3"], chromoBins, { siteStart: 1 });
    expect(snv.variants.map((v) => v.id)).toEqual(["chr2_200_C_T", "chr3_300_G_A"]);
    expect(Array.from(snv.alt[0])).toEqual([NaN, 4]);
    expect(Array.from(snv.status[1])).toEqual([0, -1]);
    // adjacent branches merge into one range
    expect(groupRanges(table, ["c1|c3", "c2|c3"])).toEqual([{ siteStart: 0, siteEnd: 3, byteStart: head, byteEnd: head + 40 }]);
  });

  it("appends a CN-mapped set to the tree-site matrix", () => {
    const cellIds = ["c1", "c2", "c3"];
    const base = snvFromSparse({ variants: sparse.variants.slice(0, 2), cells: { c1: [[0, 3, 2, 1]], c2: [[1, 5, 0, 0]] } }, cellIds, chromoBins);
    const extra = snvFromSparse(
      { variants: [{ id: "chr2_200_C_T" }, { id: "chr3_300_G_A", cn_mapped: true, status: "trunk", lost_in: "n12", category: "cn_mapped" }], cells: { c3: [[1, 0, 4]] } },
      ["c3", "c1", "c2"],
      chromoBins
    );
    const m = appendSnv(base, extra);
    expect(m.variants.map((v) => v.id)).toEqual(["chr1_100_A_G", "chr2_200_C_T", "chr3_300_G_A"]);
    expect(m.variants[2]).toMatchObject({ index: 2, cnMapped: true, cnStatus: "trunk", lostIn: "n12", category: "cn_mapped" });
    expect(Array.from(m.status[2])).toEqual([-1, -1, 1]); // c3 (row 2 in base order) carries it
    expect(Array.from(m.alt[0])).toEqual([2, NaN, NaN]);
    expect(Array.from(m.gt[0])).toEqual([1, -1, -1]);
    expect(m.appended).toEqual({ set: null, first: 2, count: 1 });
    expect(appendSnv(base, null)).toBe(base);
  });

  it("loads through the main-thread fallback without Worker", async () => {
    const saved = global.fetch;
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => buf }));
    try {
      const dense = await loadColumnarMatrix("x.cells.bin", table, ["c1", "c2", "c3"], { useWorker: false });
      expect(Array.from(dense.status)).toEqual([1, -1, 1, -1, 0, -1, 1, -1, -1]);
      const [range] = groupRanges(table, ["c2|c3"]);
      const part = await loadColumnarMatrix("x.cells.bin", table, ["c1", "c2", "c3"], { range, useWorker: false });
      expect(part.n).toBe(2);
      expect(Array.from(part.alt.subarray(0, 2))).toEqual([NaN, 4]);
    } finally {
      global.fetch = saved;
    }
  });

  it("ships a worker source that parses", () => {
    // eslint-disable-next-line no-new-func
    expect(() => new Function(_workerSource())).not.toThrow();
  });
});
