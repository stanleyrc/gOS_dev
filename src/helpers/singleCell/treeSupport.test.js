import { parseNewick, layoutTree } from "./newick";
import { annotateSupport, canonicalKey, conflictSummary, fnv1a32, labelSupport, splitKey, isTbeOnly, supportBin, supportSummary, supportValue } from "./treeSupport";

// Same synthetic tree as the exporter's unit test: (((a,b),c),(d,(e,f)))
const shared = ["a", "b", "c", "d", "e", "f"];
const entry = (extra = {}) => ({
  n_leaves_shared: 6,
  excluded_leaves: [],
  ref_leaf: "a",
  splits: [
    { key: splitKey(["c", "d", "e", "f"]), size: 4, fbp: 0.75, tbe: 0.8 }, // ab | cdef (canonical side excludes a)
    { key: splitKey(["d", "e", "f"]), size: 3, fbp: 0.75 }, // abc | def
    { key: splitKey(["e", "f"]), size: 2, fbp: 1 },
  ],
  ...extra,
});

describe("treeSupport", () => {
  it("hashes like the exporter", () => {
    expect(fnv1a32("a")).toBe("e40c292c");
    expect(splitKey(["b", "a"])).toBe(splitKey(["a", "b"]));
  });

  it("canonical side excludes the reference leaf and trivial splits are null", () => {
    expect(canonicalKey(["a", "b"], shared)).toBe(splitKey(["c", "d", "e", "f"]));
    expect(canonicalKey(["a"], shared)).toBeNull();
    expect(canonicalKey(["a", "b", "c", "d", "e"], shared)).toBeNull();
  });

  it("annotates the nodes whose clade is a split", () => {
    const root = parseNewick("(((a,b),c),(d,(e,f)));");
    const r = annotateSupport(root, entry());
    expect(r.ok).toBe(true);
    expect(r.mapped).toBe(4); // abc|def is the root split: both root children carry it
    const found = [];
    const walk = (n) => {
      if (n.support) found.push(n.support.fbp);
      (n.children || []).forEach(walk);
    };
    walk(r.root);
    expect(found.sort()).toEqual([0.75, 0.75, 0.75, 1]);
    expect(root.children[0].support).toBeUndefined(); // input untouched
  });

  it("matches case/dash-insensitively and honours excluded leaves", () => {
    const root = parseNewick("(((A,b),c),((d,x-1),(E,f)));");
    const r = annotateSupport(root, entry({ excluded_leaves: ["x_1"] }));
    expect(r.ok).toBe(true);
    expect(r.mapped).toBe(4); // abc|def is the root split: both root children carry it
  });

  it("does not annotate a tree that does not match the entry", () => {
    const r = annotateSupport(parseNewick("((a,b),(c,(d,(e,(f,g)))));"), entry());
    expect(r.ok).toBe(false);
    expect(r.mapped).toBe(0);
  });

  it("bins and summarises support", () => {
    expect([0.2, 0.5, 0.69, 0.7, 0.89, 0.9, 1].map(supportBin)).toEqual([0, 1, 1, 2, 2, 3, 3]);
    expect(supportBin(undefined)).toBe(-1);
    const layout = layoutTree(annotateSupport(parseNewick("(((a,b),c),(d,(e,f)));"), entry()).root);
    expect(supportSummary(layout)).toEqual({ n: 4, median: 0.75, nGe70: 4, tbeOnly: false });
  });

  it("falls back to TBE for trees without a bootstrap proportion", () => {
    const tbe = { n_leaves_shared: 6, excluded_leaves: [], ref_leaf: "a", splits: [{ key: splitKey(["c", "d", "e", "f"]), size: 4, fbp: null, tbe: 0.9 }, { key: splitKey(["d", "e", "f"]), size: 3, fbp: null, tbe: 0.5 }] };
    const layout = layoutTree(annotateSupport(parseNewick("(((a,b),c),(d,(e,f)));"), tbe).root);
    const sum = supportSummary(layout);
    expect([sum.n, sum.nGe70, sum.tbeOnly]).toEqual([3, 1, true]); // the abc and def nodes are one split;
    expect(sum.median).toBeCloseTo(0.5);
    expect(supportValue({ fbp: null, tbe: 0.4 })).toBe(0.4);
    expect(supportValue({ fbp: 0.2, tbe: 0.4 })).toBe(0.2);
    expect(supportValue(undefined)).toBeNaN();
    expect(isTbeOnly({ fbp: null, tbe: 0.4 })).toBe(true);
    expect(isTbeOnly({ fbp: 0.1, tbe: 0.4 })).toBe(false);
  });

  it("finds the clades one tree lacks and their support", () => {
    const a = layoutTree(annotateSupport(parseNewick("(((a,b),c),(d,(e,f)));"), entry()).root);
    const b = layoutTree(parseNewick("(((a,c),b),(d,(e,f)));"));
    const common = new Set(shared);
    const c = conflictSummary(a, b, common);
    expect(c.a.unique).toBe(1); // ab is absent from b
    expect(c.a.uniqueSupported).toBe(1);
    expect(c.b.unique).toBe(1); // ac
    expect(c.b.uniqueNoValue).toBe(1);
    expect(c.a.total).toBe(3);
  });

  it("labels only sparse trees", () => {
    expect(labelSupport(40)).toBe(true);
    expect(labelSupport(130)).toBe(false);
  });
});
