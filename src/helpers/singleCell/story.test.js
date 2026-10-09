import { headerCase, matrixExtent, normalizeStory, sentencesAbout, stackRows, storyForPatient, typeset } from "./story";

const raw = {
  format: "gos-sc-story/1",
  title: "T",
  chapters: [
    { id: "a", title: "ecDNA", body: ["MDM2 in MGH303 (rho 0.66); CDK4 in MGH304 (rho 0.69).", "Other text."] },
    { id: "b", title: "Programs", body: ["Nothing about patients."] },
    { title: null },
  ],
  patients: { MGH303: { vignettes: [{ id: "v", title: "V", body: ["x"] }, { bad: 1 }] }, EMPTY: { vignettes: [] } },
};

describe("story helpers", () => {
  test("normalizeStory keeps well-formed sections and rejects other formats", () => {
    const s = normalizeStory(raw);
    expect(s.chapters.map((c) => c.id)).toEqual(["a", "b"]);
    expect(Object.keys(s.patients)).toEqual(["MGH303"]);
    expect(s.patients.MGH303.vignettes).toHaveLength(1);
    expect(normalizeStory({ format: "other" })).toBeNull();
    expect(normalizeStory(null)).toBeNull();
  });

  test("storyForPatient returns vignettes and chapters naming the patient", () => {
    const s = normalizeStory(raw);
    const p = storyForPatient(s, "MGH303");
    expect(p.vignettes).toHaveLength(1);
    expect(p.chapters.map((c) => c.id)).toEqual(["a"]);
    expect(storyForPatient(s, "MGH30").chapters).toEqual([]); // whole-word match
  });

  test("sentencesAbout picks the sentences that name the patient", () => {
    expect(sentencesAbout("BWH70 is first. MGH303 has MDM2. Last one.", "MGH303")).toEqual(["MGH303 has MDM2."]);
  });

  test("stackRows normalizes to shares or keeps counts", () => {
    const fig = { categories: ["a", "b"], rows: [{ label: "P", values: [1, 3] }], normalize: true };
    const [r] = stackRows(fig);
    expect(r.total).toBe(4);
    expect(r.segments[0]).toMatchObject({ x0: 0, x1: 0.25, share: 0.25 });
    expect(r.segments[1].x1).toBeCloseTo(1);
    const [c] = stackRows({ ...fig, normalize: false });
    expect(c.segments[1]).toMatchObject({ x0: 1, x1: 4 });
  });

  test("matrixExtent ignores missing values", () => {
    expect(matrixExtent([[0.2, null], [-0.5, NaN]])).toBe(0.5);
    expect(matrixExtent([])).toBe(1);
  });
});

describe("typeset / headerCase", () => {
  it("typesets comparison operators", () => {
    expect(typeset("4 MH >= 5 bp, median CN >= 5")).toBe("4 MH ≥ 5 bp, median CN ≥ 5");
    expect(typeset("ecDNA species (>= 10% of cells)")).toBe("ecDNA species (≥ 10% of cells)");
    expect(typeset("a <= b != c")).toBe("a ≤ b ≠ c");
    expect(typeset(null)).toBe("");
  });
  it("capitalises table headers", () => {
    expect(headerCase("tumor cells")).toBe("Tumor cells");
    expect(headerCase("ecDNA species (>= 10% of cells)")).toBe("ecDNA species (≥ 10% of cells)");
    expect(headerCase("")).toBe("");
  });
});
