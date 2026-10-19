import { PAPER_CLADE_NAMED, PAPER_CLADE_SEQ, PAPER_STATE, paperAmpColor, paperCladeLabel, paperCloneColors, paperCnCss, paperCnPacked, paperEgfrColor, paperStateColor, ramp, rgbHex } from "./paperPalette";

describe("paper palette", () => {
  it("ramps interpolate and clamp", () => {
    const r = ramp([0, 10], ["#000000", "#FFFFFF"]);
    expect(rgbHex(r(-1))).toBe("#000000");
    expect(rgbHex(r(5))).toBe("#808080");
    expect(rgbHex(r(99))).toBe("#FFFFFF");
  });
  it("CN ramp hits the figure stops (purple baseline below 2, black at 100)", () => {
    expect(paperCnCss(0)).toBe("#2C3E9C");
    expect(paperCnCss(1)).toBe("#A08BD0");
    expect(paperCnCss(2)).toBe("#FBE2B3");
    expect(paperCnCss(250)).toBe("#000000");
    expect(paperCnPacked(2)).toBe(paperCnPacked(2.1));
    expect(paperCnPacked(NaN)).toBe(0xffffffff);
  });
  it("labels and colours clades as the paper does", () => {
    expect(paperCladeLabel("P1", "Clone2")).toBe("Clade 2");
    expect(paperCladeLabel("MGH303", "Clone 4")).toBe("CI");
    expect(paperCladeLabel("P1", "Normal")).toBe("Normal");
    const c = paperCloneColors("P1", ["Clone2", "Clone1", "Normal"]);
    expect(c.Clone1).toBe(PAPER_CLADE_SEQ[0]);
    expect(c.Clone2).toBe(PAPER_CLADE_SEQ[1]);
    expect(c.Normal).toBe(PAPER_CLADE_NAMED.Normal);
    expect(paperCloneColors("MGH303", ["Clone 1", "Clone 4"])).toEqual({ "Clone 1": PAPER_CLADE_NAMED.EC1, "Clone 4": PAPER_CLADE_NAMED.CI });
  });
  it("maps states, amplicons and ecEGFR variants", () => {
    expect(paperStateColor("MES-like")).toBe(PAPER_STATE.MES);
    expect(paperStateColor("npc")).toBe(PAPER_STATE.NPC);
    expect(paperStateColor("unknown")).toBeNull();
    expect(paperAmpColor("ecEGFR")).toBe("#1FA39B");
    expect(paperAmpColor("CDK4+MDM2")).toBe("#9B86BD");
    expect(paperEgfrColor("wEGFR")).toBe("#2B6CA3");
    expect(paperEgfrColor("sEGFR")).toBe("#5BC8F0");
    expect(paperEgfrColor("shorter_sEGFR")).toBe("#2E9E3E");
    expect(paperEgfrColor("wEGFR_var2")).toBe("#8E3FA0");
    expect(paperEgfrColor("MAP3K1")).toBeNull();
  });
});
