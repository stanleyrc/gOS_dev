import {
  FIT_JOINT,
  FIT_LEGACY,
  candidateSignatures,
  cohortDifferences,
  contrastRows,
  droppedSignatures,
  effectiveSignatures,
  exposureBars,
  fmtDiff,
  jointSetNames,
  patientSet,
  sigFitMode,
} from "./signatureJoint";

// synthetic fixtures only
const joint = {
  signature_set: [
    { signature: "SBS5", source: "base", set: "all", detail: "cosmic_fit of all sites" },
    { signature: "SBS13", source: "subset", set: "subclonal", detail: "x", stability: 0.92 },
  ],
  legacy_dropped: [{ signature: "SBS86", legacy_sets: "subclonal" }],
  sets: [
    { name: "clade: n1", group: "clade", activities: [] },
    { name: "subclonal", group: "tree", activities: [{ signature: "SBS5", fraction: 0.7, lo: 0.6, hi: 0.8, activity: 70 }, { signature: "SBS13", fraction: 0.3, lo: 0.2, hi: 0.4, activity: 30 }] },
    { name: "truncal", group: "tree", activities: [] },
  ],
  contrasts: [
    { contrast: "subclonal vs truncal", rows: [
      { signature: "SBS5", diff: -0.1, lo: -0.2, hi: 0.0, p: 0.06, q: 0.06 },
      { signature: "SBS13", diff: 0.3, lo: 0.2, hi: 0.4, p: 0.001, q: 0.002 },
    ] },
  ],
};

describe("signatureJoint", () => {
  it("defaults to the joint fit only when the file exists", () => {
    expect(sigFitMode({}, true)).toBe(FIT_JOINT);
    expect(sigFitMode({ sigFit: "legacy" }, true)).toBe(FIT_LEGACY);
    expect(sigFitMode({}, false)).toBe(FIT_LEGACY);
  });

  it("swaps the signatures source and keeps the legacy one otherwise", () => {
    const legacy = { status: "ok", data: { sets: [{ name: "all" }] } };
    const src = { status: "ok", data: joint };
    expect(effectiveSignatures(legacy, src, FIT_JOINT).data.fit).toBe(FIT_JOINT);
    expect(effectiveSignatures(legacy, src, FIT_LEGACY)).toBe(legacy);
    expect(effectiveSignatures(legacy, { status: "missing" }, FIT_JOINT)).toBe(legacy);
  });

  it("lists the patient set, dropped signatures, bars and set order", () => {
    expect(patientSet(joint).map((r) => r.signature)).toEqual(["SBS5", "SBS13"]);
    expect(droppedSignatures(joint)).toEqual([{ signature: "SBS86", sets: ["subclonal"], checks: [] }]);
    expect(exposureBars(joint, "subclonal")[0]).toMatchObject({ signature: "SBS5", lo: 0.6, hi: 0.8 });
    expect(jointSetNames(joint)).toEqual(["subclonal", "truncal", "clade: n1"]);
  });

  it("flags significant contrast rows and formats them", () => {
    const rows = contrastRows(joint.contrasts[0]);
    expect(rows[0].signature).toBe("SBS13");
    expect(rows.map((r) => r.significant)).toEqual([true, false]);
    expect(fmtDiff(rows[0])).toBe("+0.300 [0.200, 0.400]");
  });

  it("collects significant cohort differences by signature", () => {
    const cohort = { contrasts: [
      { patient: "A", contrast: "subclonal vs truncal", signature: "SBS13", diff: 0.2, lo: 0.1, hi: 0.3, p: 0.001, q: 0.01 },
      { patient: "B", contrast: "subclonal vs truncal", signature: "SBS13", diff: 0.1, lo: 0.05, hi: 0.2, p: 0.01, q: 0.03 },
      { patient: "B", contrast: "subclonal vs truncal", signature: "SBS5", diff: -0.1, lo: -0.3, hi: 0.1, p: 0.5, q: 0.5 },
    ] };
    const out = cohortDifferences(cohort);
    expect(out).toHaveLength(1);
    expect(out[0].patients.map((p) => p.patient)).toEqual(["A", "B"]);
    expect(out[0].direction).toBe("higher in the non-truncal set");
    expect(cohortDifferences(cohort, { onlySignificant: false })).toHaveLength(2);
  });

  it("finds below-threshold candidates and folds them into the per-site activities on request", () => {
    const j = {
      ...joint,
      legacy_dropped: [
        { signature: "SBS99", legacy_sets: ["subclonal"], checks: [{ set: "subclonal", frac: 0.047, lo: 0.04, hi: 0.053, delta_loglik: 156, p: 1e-70, cosine_gain: 0.0175, support: 0.19 }] },
        { signature: "SBS26", legacy_sets: ["subclonal"], checks: [{ set: "subclonal", frac: 0, lo: 0, hi: 0.01, delta_loglik: 0, p: 1, cosine_gain: 0, support: 0 }] },
      ],
    };
    expect(candidateSignatures(j).map((c) => c.signature)).toEqual(["SBS99"]);
    const legacy = { status: "ok", data: { sets: [] } };
    const off = effectiveSignatures(legacy, { status: "ok", data: j }, FIT_JOINT, false).data;
    expect(off.sets.find((x) => x.name === "subclonal").activities).toHaveLength(2);
    const on = effectiveSignatures(legacy, { status: "ok", data: j }, FIT_JOINT, true).data;
    const acts = on.sets.find((x) => x.name === "subclonal").activities;
    expect(on.candidatesIncluded).toBe(true);
    expect(acts.find((a) => a.signature === "SBS99").activity).toBeCloseTo(0.047 * 100, 6);
    expect(acts.reduce((t, a) => t + a.activity, 0)).toBeCloseTo(100, 6);
  });
});
