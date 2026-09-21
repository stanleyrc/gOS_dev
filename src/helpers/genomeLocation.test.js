/** @jest-environment node */
/* eslint-disable import/first */

// Isolate unrelated plotting dependencies, not the utility wrapper or parser.
jest.mock("d3", () => ({}));
jest.mock("./connection", () => class Connection {});
jest.mock("./interval", () => class Interval {});

import { locationToDomains } from "./genomeLocation";
import { locationToDomains as utilityLocationToDomains } from "./utility";

const chromoBins = Object.freeze({
  1: Object.freeze({ startPoint: 1, endPoint: 1000, startPlace: 1 }),
  2: Object.freeze({ startPoint: 1, endPoint: 500, startPlace: 1001 }),
  X: Object.freeze({ startPoint: 1, endPoint: 100, startPlace: 1501 }),
  ChRx: Object.freeze({ startPoint: 10, endPoint: 1010, startPlace: 1601 }),
});

describe.each([
  ["pure genome parser", locationToDomains],
  ["existing utility entry point", utilityLocationToDomains],
])("%s", (label, parse) => {
  test.each([
    ["1:500", [[250, 750]]],
    ["1:100", [[1, 350]]],
    ["1:1", [[1, 251]]],
    ["1:1000", [[750, 1000]]],
    ["2:499", [[1249, 1500]]],
    ["X:50", [[1501, 1600]]],
    ["ChRx:260", [[1601, 2101]]],
    ["1:100-200", [[100, 200]]],
    ["2:10-40", [[1010, 1040]]],
    ["1:100-1:200", [[100, 200]]],
    ["1:900-2:100", [[900, 1100]]],
    ["1:100-100", [[100, 100]]],
    ["1:100-1:100", [[100, 100]]],
    ["1:10-1:40|2:10-2:40", [[10, 40], [1010, 1040]]],
    ["2:10-40|1:100|X:1-X:100", [[1010, 1040], [1, 350], [1501, 1600]]],
    [" 1:100 | 2:10-40 ", [[1, 350], [1010, 1040]]],
  ])("maps %s without changing coordinate numbering", (location, expected) => {
    expect(parse(chromoBins, location)).toEqual(expected);
  });

  test.each([
    null,
    undefined,
    {},
    100,
    "",
    " ",
    "1",
    "1:",
    "1:100-",
    "1:100-200-300",
    "1:100:200",
    "1:100 A>G",
    "1:100|",
    "|1:100",
    "1:100||2:20",
    "3:100",
    "chr1:100",
    "x:50",
    "toString:100",
    "1:100-3:100",
    "1:0",
    "1:1001",
    "1:0-100",
    "1:100-1001",
    "1:100-2:501",
    "1:200-100",
    "1:200-1:100",
    "2:1-1:1000",
    "1:1.5",
    "1:1e2",
    "1:0x64",
    "1:+100",
    "1:-100",
    "1:NaN",
    "1:Infinity",
    "1:9007199254740992",
    "1:100-200junk",
    "1:100-200|2:501",
  ])("rejects malformed or invalid locations: %#", (location) => {
    expect(() => parse(chromoBins, location)).toThrow("Invalid genomic location");
  });

  test.each([
    ["1:-150-1:350", [[1, 350]]],
    ["1:-150-350", [[1, 350]]],
    ["1:749-1:1249", [[749, 1000]]],
    ["1:999-1:1001", [[999, 1000]]],
    ["1:0-1:1", [[1, 1]]],
    ["2:-10-2:750", [[1001, 1500]]],
    ["ChRx:0-2000", [[1601, 2601]]],
    ["1:-150-2:750", [[1, 1500]]],
    ["1:-150-350|2:400-750", [[1, 350], [1400, 1500]]],
    ["1:-200-1:-100", [[1, 1]]],
    ["1:1100-1200", [[1000, 1000]]],
  ])("only opt-in clips internally padded range %s", (location, expected) => {
    expect(() => parse(chromoBins, location)).toThrow("Invalid genomic location");
    expect(() => parse(chromoBins, location, { clampRanges: false }))
      .toThrow("Invalid genomic location");
    expect(parse(chromoBins, location, { clampRanges: true })).toEqual(expected);
  });

  test.each([
    "1:-100", // Point coordinates remain strict even with the range option.
    "1:1001",
    "1:1200-1100", // Both endpoints would clip to the same high bound.
    "1:-100-1:-200", // Both endpoints would clip to the same low bound.
    "1:1001-1:1000",
    "1:0-1:-1",
    "2:1-1:1000",
    "1:-150-unknown:350",
    "toString:-150-350",
    "1:--150-350",
    "1:-150--350junk",
    "1:-1.5-350",
    "1:-150-1:Infinity",
    "1:-150-1:9007199254740992",
    "1:-9007199254740992-1:350",
    "1:-150-350|",
    "1:-150-350|2:NaN-500",
  ])("clamping does not hide invalid data: %s", (location) => {
    expect(() => parse(chromoBins, location, { clampRanges: true }))
      .toThrow("Invalid genomic location");
  });

  test.each([
    { startPoint: 10, endPoint: 1, startPlace: 1 },
    { startPoint: 1.5, endPoint: 1000, startPlace: 1 },
    { startPoint: 1, endPoint: Infinity, startPlace: 1 },
    { startPoint: 1, endPoint: 1000, startPlace: NaN },
    { startPoint: 1, endPoint: 1000 },
    { startPoint: 1, endPoint: 1000, startPlace: Number.MAX_SAFE_INTEGER },
  ])("clamping still validates chromosome metadata and mapped places: %#", (bin) => {
    expect(() => parse({ 1: bin }, "1:-150-1:1500", { clampRanges: true }))
      .toThrow("Invalid genomic location");
  });

  it("preserves in-bound ranges and point flanks in internal mode", () => {
    expect(parse(chromoBins, "1:500|1:100-200|1:900-2:100", { clampRanges: true }))
      .toEqual([[250, 750], [100, 200], [900, 1100]]);
  });

  it("does not invent a zero-width viewport for a degenerate chromosome", () => {
    expect(() => parse({ tiny: { startPoint: 1, endPoint: 1, startPlace: 1 } }, "tiny:1"))
      .toThrow("Invalid genomic location");
  });
});
