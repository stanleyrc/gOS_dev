import { splitMissingGenomes } from "./missingGenomes";

describe("splitMissingGenomes", () => {
  const clone = new Map([["a", "Normal"], ["b", "clone_1"], ["c", "normal"], ["d", "clone_2"], ["e", null]]);
  it("counts blank normal and non-normal rows separately", () => {
    const rows = [null, null, undefined, { x: 1 }, null];
    expect(splitMissingGenomes(rows, ["a", "b", "c", "d", "e"], clone)).toEqual({ normal: 2, other: 2 });
  });
  it("handles empty input and function lookup", () => {
    expect(splitMissingGenomes(undefined, [], clone)).toEqual({ normal: 0, other: 0 });
    expect(splitMissingGenomes([null], ["z"], () => "Normal")).toEqual({ normal: 1, other: 0 });
  });
});
