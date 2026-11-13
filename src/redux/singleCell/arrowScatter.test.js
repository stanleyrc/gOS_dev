/** @jest-environment node */
import { tableFromArrays, tableToIPC } from "apache-arrow";

jest.mock("d3", () => {
  const chain = new Proxy(function chainFn() {}, { get: (t, p) => (p === Symbol.toPrimitive ? () => 0 : chain), apply: () => chain });
  return new Proxy({}, { get: (t, p) => (p === "__esModule" ? true : chain) });
});
jest.mock("axios", () => {
  const fn = { get: jest.fn(), head: jest.fn(), isCancel: () => false };
  return { __esModule: true, default: fn, ...fn };
});

const { arrowScatter } = require("./loaders");

const ipc = (y) =>
  tableToIPC(
    tableFromArrays({ x: Float64Array.from(y.map((_, i) => i * 1000)), y: Float32Array.from(y), color: Int32Array.from(y.map(() => 0)) }),
    "file"
  );
const close = (a, b) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 4));

describe("arrowScatter coverage -> copy number", () => {
  test("applies cov_slope / cov_intercept to coverage y (relative coverage)", () => {
    const r = arrowScatter(ipc([1, 4.8, 0.5]), 3.4255, 0, true);
    close(r.dataPointsY1, [3.4255, 16.4424, 1.71275]);
    close(r.dataPointsY2, [1, 4.8, 0.5]);
    expect(r.hasFit).toBe(true);
  });
  test("non-zero intercept", () => {
    close(arrowScatter(ipc([10, 20]), 0.6163, -0.0619, true).dataPointsY1, [6.1011, 12.2641]);
  });
  test("slope 1 / intercept 0 leaves CN-unit y unchanged", () => {
    close(arrowScatter(ipc([2, 3.5, 7]), 1, 0, true).dataPointsY1, [2, 3.5, 7]);
  });
  test("no fit (absent or null slope) treats coverage y as CN", () => {
    for (const [s, i] of [[undefined, undefined], [null, null], [NaN, 0]]) {
      const r = arrowScatter(ipc([2, 3]), Number(s), Number(i), true);
      close(r.dataPointsY1, [2, 3]);
      expect(r.hasFit).toBe(true);
    }
  });
  test("no fit and not CN (het SNPs without slope) keeps hasFit false", () => {
    expect(arrowScatter(ipc([2, 3]), NaN, NaN, false).hasFit).toBe(false);
  });
});
