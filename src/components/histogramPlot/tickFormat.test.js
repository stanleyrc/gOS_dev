/** @jest-environment node */
/* eslint-disable import/first */

jest.mock("d3", () => {
  const decimal = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  });

  return {
    formatSpecifier: (format) => ({
      type: String(format).endsWith("s") ? "s" : String(format).slice(-1),
    }),
    format: (format) => {
      if (format === ",.2~f") return (value) => decimal.format(value);
      if (format === ".0%") {
        return (value) => `${(Number(value) * 100).toFixed(0)}%`;
      }
      if (format === ".1%") {
        return (value) => `${(Number(value) * 100).toFixed(1)}%`;
      }
      if (format === ",.3f") {
        return (value) => Number(value).toFixed(3);
      }
      throw new Error(`Unexpected format in test: ${format}`);
    },
  };
});

import {
  formatHistogramValue,
  getHistogramTickFormatter,
} from "./tickFormat";

describe("getHistogramTickFormatter", () => {
  it("uses ordinary decimals below the kilo threshold for SI formats", () => {
    const format = getHistogramTickFormatter("~s");

    expect(format(0)).toBe("0");
    expect(format(0.1)).toBe("0.1");
    expect(format(0.1234)).toBe("0.12");
    expect(format(-0.126)).toBe("-0.13");
    expect(format(1)).toBe("1");
  });

  it("uses compact suffixes with at most two decimal places", () => {
    const format = getHistogramTickFormatter(".6~s");

    expect(format(158489)).toBe("158.49k");
    expect(format(1584890)).toBe("1.58M");
    expect(format(25118864)).toBe("25.12M");
    expect(format(100000)).toBe("100k");
    expect(format(1500000)).toBe("1.5M");
    expect(format(999999)).toBe("1M");
  });

  it("preserves configured percentage formats", () => {
    const format = getHistogramTickFormatter(".0%");

    expect(format(0)).toBe("0%");
    expect(format(0.1)).toBe("10%");
    expect(format(1)).toBe("100%");
    expect(formatHistogramValue(0.063, ".1%")).toBe("6.3%");
  });

  it("preserves configured fixed-point formats", () => {
    expect(getHistogramTickFormatter(",.3f")(1.2346)).toBe("1.235");
  });

  it("does not label non-finite SI values", () => {
    const format = getHistogramTickFormatter("~s");

    expect(format(Number.NaN)).toBe("");
    expect(format(Number.POSITIVE_INFINITY)).toBe("");
  });
});
