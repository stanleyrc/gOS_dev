import { annotationFromSearch, annotationToSearch, annotationWidth, cellSignatureFit, dominantSignature, normaliseActivities, signatureSegments, signatureTooltip } from "./cellSignatures";
import { signatureColor } from "./signatureColors";

const sig = { sets: [{ name: "clone: Clone 2", n: 200, activities: [{ signature: "SBS5", activity: 40 }, { signature: "SBS1", activity: 160 }], stats: { cosine: 0.95 } }, { name: "subclonal", n: 140, activities: [{ signature: "SBS2", activity: 140 }] }] };
test("clone mapping, subclonal fallback, normal cells, and absent fits", () => {
  expect(dominantSignature(cellSignatureFit({ clone_id: "Clone 2" }, sig))).toBe("SBS1");
  expect(dominantSignature(cellSignatureFit({ clone_id: "Clone 3" }, sig))).toBe("SBS2");
  expect(cellSignatureFit({ clone_id: "Normal" }, sig)).toBeNull();
  expect(cellSignatureFit({ normal_for_pon: true }, sig)).toBeNull();
  expect(cellSignatureFit({ clone_id: "Clone 2" }, { sets: [] })).toBeNull();
  expect(signatureTooltip(null, "no clone signature fits available for this patient")[0][1]).toContain("not available (no clone signature fits");
});
test("per-cell fits use the specified cell and flag low mutation counts", () => {
  const per = { cells: [{ cell_id: "a", n: 200, exposures: { SBS3: 0.7, SBS5: 0.3 }, cosine: 0.9 }, { cell_id: "b", n: 99, too_few: true, exposures: {} }] };
  expect(dominantSignature(cellSignatureFit({ cell_id: "a" }, sig, per))).toBe("SBS3");
  expect(cellSignatureFit({ cell_id: "b" }, sig, per)).toBeNull();
  expect(cellSignatureFit({ cell_id: "c" }, sig, per)).toBeNull();
});
test("stacked geometry covers the strip with top four and explicit tail", () => {
  const fit = { activities: normaliseActivities([6, 5, 4, 3, 2, 1].map((activity, i) => ({ signature: `SBS${i + 1}`, activity }))) };
  [8, 12, 24].forEach((width) => {
    const parts = signatureSegments(fit, width);
    expect(parts).toHaveLength(5);
    expect(parts[4].signature).toBe("Other");
    expect(parts.reduce((s, p) => s + p.width, 0)).toBe(width);
    expect(parts.every((p) => p.width >= 0)).toBe(true);
  });
  expect(signatureSegments(null, 24)).toEqual([]);
});
test("normalization rejects invalid values and resolves ties deterministically", () => {
  expect(normaliseActivities([{ signature: "SBS2", activity: 2 }, { signature: "SBS1", activity: 2 }, { signature: "SBS3", activity: null }]).map((x) => x.signature)).toEqual(["SBS1", "SBS2"]);
  expect(signatureTooltip(cellSignatureFit({ clone_id: "Clone 2" }, sig)).flat().join(" ")).toContain("fitted per clone, not per cell");
});
test("annotation width and signature mode round trip with unrelated URL state retained", () => {
  const layout = { stripWidth: 24, signatureTrack: false, cellSignatureMode: "stacked" };
  expect(annotationFromSearch(`?report=P&${new URLSearchParams(annotationToSearch(layout))}`)).toEqual(layout);
  expect(annotationFromSearch("?annw=&annsigmode=bad")).toEqual({});
  expect(annotationWidth(null)).toBe(14);
  expect(annotationWidth(1000)).toBe(60);
});
test("SBS colors are independent of visitation order", () => {
  const first = signatureColor("SBS5");
  signatureColor("SBS40c"); signatureColor("SBS1");
  expect(signatureColor("SBS5")).toBe(first);
  expect(signatureColor("SBS5", "zissou")).not.toBe(first);
});
