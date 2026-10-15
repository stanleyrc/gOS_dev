import { SBS96 } from "./signatures";
import { aetiologyTag, formatSiteSignature, siteSignatureModel } from "./siteSignature";

// synthetic reference: A is concentrated on channel 0, B is flat, C on channel 1
const col = (f) => SBS96.map((_, i) => f(i));
const reference = {
  names: ["SBS_A", "SBS_B", "SBS_C"],
  columns: [col((i) => (i === 0 ? 0.9 : 0.1 / 95)), col(() => 1 / 96), col((i) => (i === 1 ? 1 : 0))],
};
const act = (o) => Object.entries(o).map(([signature, activity]) => ({ signature, activity }));

describe("siteSignatureModel", () => {
  const sets = [{ name: "subclonal", activities: act({ SBS_C: 50, SBS_B: 10 }) }, { name: "truncal", activities: act({ SBS_A: 0 }) }];
  const m = siteSignatureModel({ reference, sets, jointActivities: act({ SBS_A: 80, SBS_B: 20 }), fitName: "joint" });
  it("ranks by exposure x profile and sums to one", () => {
    const r = m.forVariant({ context: SBS96[0], category: "private" });
    expect(r.set).toBe("all");
    expect(r.ranked[0].signature).toBe("SBS_A");
    // 80*0.9 / (80*0.9 + 20/96)
    expect(r.ranked[0].prob).toBeCloseTo(72 / (72 + 20 / 96), 6);
    expect(r.ranked.reduce((s, x) => s + x.prob, 0)).toBeCloseTo(1, 9);
  });
  it("uses the site's own tree-site set when it has exposures, else the all fit", () => {
    expect(m.forVariant({ context: SBS96[1], category: "subclonal" })).toMatchObject({ set: "subclonal", ranked: [{ signature: "SBS_C" }, { signature: "SBS_B" }] });
    expect(m.forVariant({ context: SBS96[0], category: "truncal" }).set).toBe("all"); // truncal set has zero exposure
  });
  it("reports why there is no assignment", () => {
    expect(m.forVariant({ context: null }).reason).toMatch(/context/);
    expect(siteSignatureModel({ reference, jointActivities: [] }).forVariant({ context: SBS96[0] }).reason).toMatch(/no signature fit/);
    expect(formatSiteSignature(m.forVariant({}))).toMatch(/^not available \(/);
  });
});

describe("formatting", () => {
  it("lists top signatures with tags, set and fit", () => {
    const text = formatSiteSignature({ ranked: [{ signature: "SBS13", prob: 0.72 }, { signature: "SBS2", prob: 0.2 }, { signature: "SBS5", prob: 0.06 }, { signature: "SBS1", prob: 0.02 }], set: "subclonal", fit: "joint" }, { tagOf: (s) => (s === "SBS13" ? "APOBEC" : "") });
    expect(text).toBe("SBS13 (APOBEC) 0.72 · SBS2 0.20 · SBS5 0.06 · …, set: subclonal, fit: joint");
  });
  it("tags aetiologies", () => {
    expect(aetiologyTag("Activity of APOBEC family of cytidine deaminases")).toBe("APOBEC");
    expect(aetiologyTag("Unknown (clock-like signature)")).toBe("clock-like");
    expect(aetiologyTag("Unknown")).toBe("");
  });
});
