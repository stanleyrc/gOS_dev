import { maskChrX, maskChrXRows, CHRX_MASK_NOTE } from "./chrxMask";
import { medianCnRow } from "./cellFiles";
import { buildBinIndex } from "./matrix";

const chromoBins = {
  1: { startPoint: 1, endPoint: 40, startPlace: 0 },
  2: { startPoint: 1, endPoint: 40, startPlace: 40 },
  X: { startPoint: 1, endPoint: 40, startPlace: 80 },
  Y: { startPoint: 1, endPoint: 40, startPlace: 120 },
};
// bins: 1 (2 bins), 2 (2 bins), X (4 bins of 10bp), Y (1 bin)
const chromosome = ["1", "1", "2", "2", "X", "X", "X", "X", "Y"];
const start = [1, 21, 1, 21, 1, 11, 21, 31, 1];
const end = [20, 40, 20, 40, 10, 20, 30, 40, 40];
const mk = (values) => ({
  binIndex: buildBinIndex({ chromosome, start, end }, chromoBins),
  values: Float32Array.from(values),
});

describe("maskChrX", () => {
  it("masks chrX CN 0 over most of chrX when autosomes are >= 1", () => {
    const r = mk([2, 2, 2, 2, 0, 0, 0, 0, 0]);
    const { row, masked } = maskChrX(r, chromoBins);
    expect(masked).toBe(true);
    expect([4, 5, 6, 7].every((k) => Number.isNaN(row.values[k]))).toBe(true);
    expect(row.values[8]).toBe(0); // chrY untouched
    expect(r.values[4]).toBe(0); // input not mutated
    expect(CHRX_MASK_NOTE).toMatch(/chrX masked/);
  });
  it("does not mask when only a partial (25%) stretch of chrX is CN 0", () => {
    const r = mk([2, 2, 2, 2, 0, 1, 1, 1, 1]);
    const out = maskChrX(r, chromoBins);
    expect(out.masked).toBe(false);
    expect(out.row).toBe(r);
  });
  it("does not mask a cell whose autosomes are also 0", () => {
    expect(maskChrX(mk([0, 0, 0, 0, 0, 0, 0, 0, 0]), chromoBins).masked).toBe(false);
  });
  it("an all-masked patient has chrX missing, not 0, in the median", () => {
    const rows = [mk([2, 2, 2, 2, 0, 0, 0, 0, 0]), mk([3, 3, 2, 2, 0, 0, 0, 0, 0])].map(
      (r) => maskChrX(r, chromoBins).row
    );
    const med = medianCnRow(rows, chromoBins, 10);
    const xi = [...med.binIndex.chromosome.keys()].filter((k) => med.binIndex.chromosome[k] === "X");
    expect(xi.length).toBeGreaterThan(0);
    xi.forEach((k) => expect(Number.isNaN(med.values[k])).toBe(true));
  });
  it("a masked cell does not drag the patient median to 0 when others are normal", () => {
    const rows = [mk([2, 2, 2, 2, 0, 0, 0, 0, 0]), mk([2, 2, 2, 2, 2, 2, 2, 2, 0]), mk([2, 2, 2, 2, 2, 2, 2, 2, 0])].map(
      (r) => maskChrX(r, chromoBins).row
    );
    const med = medianCnRow(rows, chromoBins, 10);
    const k = [...med.binIndex.chromosome.keys()].find((i) => med.binIndex.chromosome[i] === "X");
    expect(med.values[k]).toBe(2);
  });
  it("maskChrXRows masks per cell and reports masked ids (circos path)", () => {
    const rows = [mk([2, 2, 2, 2, 0, 0, 0, 0, 0]), mk([2, 2, 2, 2, 2, 2, 2, 2, 0])];
    const { rowOf, maskedIds } = maskChrXRows(["a", "b"], rows, chromoBins);
    expect([...maskedIds]).toEqual(["a"]);
    expect(Number.isNaN(rowOf.get("a").values[4])).toBe(true);
    expect(rowOf.get("b")).toBe(rows[1]);
    const med = medianCnRow([...rowOf.values()], chromoBins, 10);
    const k = [...med.binIndex.chromosome.keys()].find((i) => med.binIndex.chromosome[i] === "X");
    expect(med.values[k]).toBe(2);
  });
});
