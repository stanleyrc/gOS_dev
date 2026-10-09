/** @jest-environment node */
import VafRenderer from "./vafRenderer";

describe("VafRenderer", () => {
  test.each([
    [0.371, "37.10"], ["0.371", "37.10"], [0, "0.00"],
    [1, "100.00"], [0.00001, "0.00"], [0.123456, "12.35"], [37.1, "37.10"],
  ])("formats %p as %s", (value, expected) => {
    const record = Object.freeze({ vaf: value });
    expect(new VafRenderer({ value, record }).render()).toBe(expected);
    expect(record.vaf).toBe(value);
  });

  test.each([null, undefined, "", "  ", "invalid", NaN, Infinity])(
    "keeps a missing-value placeholder for %p", (value) => {
      expect(new VafRenderer({ value }).render().props).toMatchObject({ italic: true, disabled: true });
    },
  );
});
