import { VERDICTS, verdictOf, sortNovel, portraitHref, featureTally, holdsOrNot, portraitUnavailable } from "./portrait";

const matrix = {
  patients: ["A", "B", "C", "D"],
  features: [
    { key: "f1", label: "F1" },
    { key: "f2", label: "F2" },
    { key: "f3", label: "F3" },
  ],
  cells: {
    A: { f1: { verdict: "consistent" }, f2: { verdict: "inconsistent" }, f3: { verdict: "not_testable" } },
    B: { f1: { verdict: "consistent" }, f2: { verdict: "inconsistent" }, f3: { verdict: "not_applicable" } },
    C: { f1: { verdict: "inconsistent" }, f2: { verdict: "consistent" }, f3: { verdict: "not_testable" } },
    D: { f1: { verdict: "not_applicable" }, f2: { verdict: "inconsistent" }, f3: { verdict: "not_testable" } },
  },
};

describe("portrait helpers", () => {
  it("maps verdicts and falls back to not testable", () => {
    expect(verdictOf("consistent").glyph).toBe("✓");
    expect(verdictOf("nonsense")).toBe(VERDICTS.not_testable);
  });
  it("sorts novel items by status, stable within a status", () => {
    const out = sortNovel([{ id: 1, status: "exploratory" }, { id: 2, status: "robust" }, { id: 3, status: "candidate" }, { id: 4, status: "robust" }]);
    expect(out.map((n) => n.id)).toEqual([2, 4, 3, 1]);
  });
  it("builds patient and cohort links that keep the dataset and drop stale parameters", () => {
    const base = "https://x.org/gOS_dev/?dataset=gbm-sc&scview=qc&report=OLD&tab=3";
    const cohort = new URL(portraitHref({ scview: "eventassoc", evassoc: "EGFR amp" }, base));
    expect(cohort.searchParams.get("dataset")).toBe("gbm-sc");
    expect(cohort.searchParams.get("scview")).toBe("eventassoc");
    expect(cohort.searchParams.get("evassoc")).toBe("EGFR amp");
    expect(cohort.searchParams.get("report")).toBeNull();
    const patient = new URL(portraitHref({ report: "P1", tab: 14, walk: "EGFR 1" }, base));
    expect(patient.searchParams.get("report")).toBe("P1");
    expect(patient.searchParams.get("tab")).toBe("14");
    expect(patient.searchParams.get("walk")).toBe("EGFR 1");
    expect(patient.searchParams.get("scview")).toBeNull();
    expect(portraitHref(null)).toBe("#");
  });
  it("tallies verdicts over applicable patients only", () => {
    expect(featureTally(matrix, "f1").text).toBe("2/3 patients match, 1 does not, 1 n/a");
    expect(featureTally(matrix, "f3").counts.not_testable).toBe(3);
    expect(featureTally(null, "f1").text).toBe("not available");
  });
  it("splits features into holds, mixed, fails and open", () => {
    const r = holdsOrNot(matrix);
    expect(r.holds.map((f) => f.key)).toEqual(["f1"]);
    expect(r.fails.map((f) => f.key)).toEqual(["f2"]);
    expect(r.open.map((f) => f.key)).toEqual(["f3"]);
    const m2 = { patients: ["A", "B"], features: [{ key: "g" }], cells: { A: { g: { verdict: "consistent" } }, B: { g: { verdict: "inconsistent" } } } };
    expect(holdsOrNot(m2).mixed.map((f) => f.key)).toEqual(["g"]);
  });
  it("lets the cohort-level link verdict decide for genotype-state links", () => {
    const r = holdsOrNot(matrix, { f1: { verdict: "not_testable" }, f2: { verdict: "consistent" } });
    expect(r.open.map((f) => f.key)).toEqual(["f1", "f3"]);
    expect(r.holds.map((f) => f.key)).toEqual(["f2"]);
  });
  it("explains a missing portrait", () => {
    expect(portraitUnavailable(null, "P1")).toMatch(/not available/);
    expect(portraitUnavailable({}, "P1")).toBeNull();
  });
});
