import { barPixels, modalPloidy, ploidyAxisMax, ploidyBarFraction, ploidyDeviationColor, ploidyTooltipLines } from "./ploidyBars";
import { PC_FIELDS } from "./precompute";

const cells = [{ ploidy: 2 }, { ploidy: 2.1 }, { ploidy: 2.05 }, { ploidy: 3.9 }, { ploidy: null }, { ploidy: 1, normal: true }];

describe("ploidy bars", () => {
  it("finds the modal ploidy ignoring normals and missing values", () => {
    expect(modalPloidy(cells)).toBe(2);
    expect(modalPloidy([])).toBeNull();
  });
  it("scales bars to the axis max", () => {
    const max = ploidyAxisMax(cells, 2);
    expect(max).toBeCloseTo(3.9);
    expect(ploidyBarFraction(1.95, 3.9)).toBeCloseTo(0.5);
    expect(ploidyBarFraction(undefined, 3.9)).toBe(0);
    expect(barPixels(0.001, 20)).toBe(1);
    expect(barPixels(0, 20)).toBe(0);
    expect(barPixels(0.5, 20)).toBe(10);
  });
  it("colours by deviation", () => {
    expect(ploidyDeviationColor(0)).toBe("#8c8c8c");
    expect(ploidyDeviationColor(1.5)).not.toBe(ploidyDeviationColor(-1.5));
    expect(ploidyDeviationColor(null)).toBe("#bfbfbf");
  });
  it("describes the fit on hover", () => {
    const l = ploidyTooltipLines({ ploidy: 3.9, purity: 0.8, [PC_FIELDS.cnResid]: 0.1, [PC_FIELDS.qcFlags]: "cn_inconsistent" }, 2);
    expect(l.map((x) => x[0])).toEqual(["Ploidy", "Purity", "vs patient mode", "Fit residual (coverage vs CN)", "Fit QC"]);
    expect(l[2][1]).toContain("+1.90");
    expect(ploidyTooltipLines({}, 2)[0][1]).toBe("not fitted");
  });
});
