import {
  NOT_IN_VERSION,
  alluvialLayout,
  burdenHistogram,
  chainIds,
  diagnosticsHeadline,
  diagnosticsRows,
  flowBetween,
  fmtCosine,
  reassignedFraction,
  resolveVersionId,
  siteAssignments,
  versionActivities,
  versionList,
  SBS96_CHANNELS,
} from "./signatureVersions";

const data = {
  versions: [
    { id: "v1_legacy", label: "1 Legacy", mode: "per_set", status: "ok", n: 10, n_singleton: 0, sets: [{ name: "truncal", n: 6, activities: [{ signature: "SBS1", activity: 2, fraction: 0.3, lo: 0.2, hi: 0.4 }, { signature: "SBS5", activity: 4, fraction: 0.7, lo: 0.6, hi: 0.8 }], cosine: 0.9, cosine_lo: 0.8, cosine_hi: 0.95 }, { name: "private", n: 4, activities: [] }] },
    { id: "v2_current", label: "2 Current", mode: "joint", status: "ok", n: 10, n_singleton: 0, sets: [{ name: "all", n: 10, activities: [{ signature: "SBS5", activity: 10, fraction: 1, lo: 0.9, hi: 1 }], cosine: 0.8 }] },
    { id: "v4", label: "4", mode: "joint", status: "unavailable", reason: "too few SNVs", n: 0, sets: [] },
  ],
  signature_codes: ["SBS1", "SBS5"],
  flows: {
    all: [{ from: "v1_legacy", to: "v2_current", rows: [["SBS5", "SBS5", 6], ["SBS1", "SBS5", 2], ["SBS1", "SBS1", 1], ["SBS5", NOT_IN_VERSION, 1]] }],
  },
  tree_sites: { id: ["a", "b"], group: ["truncal", "truncal"], assign: { v1_legacy: [1, 0], v2_current: [1, -1], v4: [0, 0] } },
  diagnostics: {
    groups: {
      singleton: { n: 100, cosine: { normal_singleton: 0.92, PTA_SCAN2: 0.7 }, entropy_bits: 6, entropy_max_bits: 6.58, cpg_ct_frac: 0.1, reads: { vaf_q: [0.1, 0.2, 0.3, 0.4, 0.5], frac_one_strand: 0.2 }, spectrum: new Array(96).fill(1 / 96) },
      truncal: { n: 5, cosine: { normal_singleton: 0.49, PTA_SCAN2: 0.2 }, reads: { vaf_q: [0.4, 0.45, 0.5, 0.55, 0.6] } },
      weird: { n: 1, cosine: {} },
    },
    cell_burden: { c1: { singleton: 1 }, c2: { singleton: 5 }, c3: { singleton: 9 } },
  },
};

describe("versions list and activities", () => {
  test("list flags availability", () => {
    const l = versionList(data);
    expect(l.map((v) => v.available)).toEqual([true, true, false]);
  });
  test("resolve falls back", () => {
    expect(resolveVersionId(data, "v4")).toBe("v4");
    expect(resolveVersionId(data, "zzz")).toBe("v2_current");
    expect(resolveVersionId({ versions: [] }, "x")).toBeNull();
  });
  test("legacy has several sets, unavailable has a reason", () => {
    expect(versionActivities(data.versions[0]).sets).toHaveLength(2);
    expect(versionActivities(data.versions[0]).sets[0].bars[0].signature).toBe("SBS5");
    expect(versionActivities(data.versions[2]).unavailable).toBe("too few SNVs");
  });
  test("cosine format", () => {
    expect(fmtCosine(0.9, 0.8, 0.95)).toBe("0.900 (0.800 to 0.950)");
    expect(fmtCosine(null)).toBe("not available");
  });
});

describe("flows and alluvial", () => {
  test("flowBetween swaps reversed pairs", () => {
    expect(flowBetween(data, "all", "v2_current", "v1_legacy").rows[0]).toEqual(["SBS5", "SBS5", 6]);
    expect(flowBetween(data, "all", "v1_legacy", "v4")).toBeNull();
    expect(flowBetween(data, "nope", "v1_legacy", "v2_current")).toBeNull();
  });
  test("chainIds dedups", () => {
    expect(chainIds(["a", "a", "b"])).toEqual(["a", "b"]);
  });
  test("layout stacks nodes, not-in-version last, link widths conserve", () => {
    const f = flowBetween(data, "all", "v1_legacy", "v2_current");
    const lay = alluvialLayout([f], { height: 100, gap: 0, minFrac: 0 });
    const right = lay.columns[1].nodes.map((n) => n.key);
    expect(right[right.length - 1]).toBe(NOT_IN_VERSION);
    expect(lay.columns[0].nodes[0].key).toBe("SBS5");
    expect(lay.links.reduce((a, l) => a + l.n, 0)).toBe(10);
    expect(lay.links.reduce((a, l) => a + l.h, 0)).toBeCloseTo(100, 5);
    const l = lay.links.find((x) => x.source === "SBS1" && x.target === "SBS5");
    expect(l.frac).toBeCloseTo(0.2);
  });
  test("small flows merge into other", () => {
    const f = { rows: [["A", "A", 1000], ["B", "A", 2], ["C", "A", 3]] };
    const lay = alluvialLayout([f], { minFrac: 0.01 });
    expect(lay.columns[0].nodes.map((n) => n.key)).toEqual(["A", "other"]);
    expect(lay.columns[0].nodes[1].n).toBe(5);
  });
  test("three column chain", () => {
    const f1 = { rows: [["A", "A", 5], ["B", "A", 5]] };
    const f2 = { rows: [["A", "X", 10]] };
    const lay = alluvialLayout([f1, f2], { minFrac: 0 });
    expect(lay.columns).toHaveLength(3);
    expect(lay.links).toHaveLength(3);
  });
  test("reassigned fraction ignores not-in-version", () => {
    expect(reassignedFraction(data.flows.all[0].rows)).toBeCloseTo(2 / 9);
  });
});

describe("diagnostics and assignments", () => {
  test("rows ordered and parsed", () => {
    const r = diagnosticsRows(data);
    expect(r.map((x) => x.group)).toEqual(["truncal", "singleton", "weird"]);
    expect(r[1].vafMedian).toBe(0.3);
    expect(r[1].spectrum).toHaveLength(96);
    expect(r[0].spectrum).toBeNull();
  });
  test("headline is computed", () => {
    expect(diagnosticsHeadline(data)).toContain("cosine 0.92 to normal-cell singletons (artifact) vs 0.49 for truncal");
    expect(diagnosticsHeadline({})).toBeNull();
  });
  test("burden histogram", () => {
    const h = burdenHistogram(data, "singleton", 4);
    expect(h.n).toBe(3);
    expect(h.median).toBe(5);
    expect(h.bins.reduce((a, b) => a + b.count, 0)).toBe(3);
    expect(burdenHistogram({}).bins).toEqual([]);
  });
  test("site assignment across versions", () => {
    expect(siteAssignments(data, "b").map((x) => x.signature)).toEqual(["SBS1", NOT_IN_VERSION, "SBS1"]);
    expect(siteAssignments(data, "zz")).toEqual([]);
  });
  test("96 channels in COSMIC order", () => {
    expect(SBS96_CHANNELS).toHaveLength(96);
    expect(SBS96_CHANNELS[0]).toBe("A[C>A]A");
    expect(SBS96_CHANNELS[16]).toBe("A[C>G]A");
    expect(SBS96_CHANNELS[95]).toBe("T[T>G]T");
  });
});
