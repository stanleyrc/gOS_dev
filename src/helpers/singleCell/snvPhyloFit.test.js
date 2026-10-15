import { layoutTree, parseNewick } from "./newick";
import { fitchChanges, isPhyloPreset, PHYLO_PRESET, presetPassRate, siteFit, treeSiteFit } from "./snvPhyloFit";

const layout = layoutTree(parseNewick("(((a:1,b:1):1,(c:1,d:1):1):1,((e:1,f:1):1,(g:1,h:1):1):1);"));
const leaves = layout.leaves; // leaf order of the layout
const st = (alt, ref = leaves.filter((l) => !alt.includes(l)), miss = []) => Int8Array.from(leaves, (l) => (alt.includes(l) ? 1 : miss.includes(l) ? -1 : ref.includes(l) ? 0 : -1));

describe("fit metrics", () => {
  test("a clade site fits perfectly", () => {
    const f = siteFit(layout, st(["a", "b"]), null, 1);
    expect(f).toMatchObject({ f1: 1, precision: 1, recall: 1, dropout: 0, outside: 0, changes: 1, ci: 1 });
  });
  test("leaky site: a carrier outside the clade", () => {
    const f = siteFit(layout, st(["a", "b", "g"]), null, 1);
    expect(f.outside).toBe(1);
    expect(f.precision).toBeCloseTo(2 / 3);
    expect(f.changes).toBe(2);
    expect(f.ci).toBeCloseTo(0.5);
  });
  test("dropout site: ref calls inside the clade lower recall, missing cells do not", () => {
    const dropout = siteFit(layout, st(["a", "c", "d"], undefined, []));
    // clade (a,b,c,d) has b = ref
    expect(dropout.recall).toBeCloseTo(3 / 4);
    expect(dropout.dropout).toBeCloseTo(1 / 4);
    expect(dropout.outside).toBe(0);
    const missing = siteFit(layout, st(["a", "c", "d"], undefined, ["b"]));
    expect(missing.recall).toBe(1);
  });
  test("homoplasy: two separate gains", () => {
    const f = siteFit(layout, st(["a", "e"]));
    expect(f.changes).toBe(2);
    expect(f.ci).toBeCloseTo(0.5);
  });
  test("truncal site: no changes, ci 1", () => {
    expect(fitchChanges(layout, st(leaves))).toBe(0);
    expect(siteFit(layout, st(leaves)).ci).toBe(1);
  });
});

test("treeSiteFit over a matrix and the preset", async () => {
  const cells = leaves;
  const sites = [["a", "b"], ["a", "b", "g"], ["a", "e"]];
  const gt = cells.map((cell) => Int8Array.from(sites, (alt) => (alt.includes(cell) ? 1 : 0)));
  const snv = { cells, variants: sites.map((_, i) => ({ id: `s${i}` })), gt };
  const fit = await treeSiteFit(snv, layout, { minCarriers: 1 });
  expect(fit.n).toBe(3);
  expect(Array.from(fit.changes)).toEqual([1, 2, 2]);
  expect(Array.from(fit.outside)).toEqual([0, 1, 1]);
  const rate = presetPassRate(fit);
  expect(rate.pass).toBe(2); // the leaky site (1 outside, 2 changes, F1 0.8) passes the relaxed rule, the homoplasy site fails on F1
  expect(rate.fraction).toBeCloseTo(2 / 3);
  expect(isPhyloPreset(PHYLO_PRESET)).toBe(true);
});

test("too few carriers: F1 unscored, other metrics still computed", () => {
  const f = siteFit(layout, st(["a", "b"]));
  expect(Number.isNaN(f.f1)).toBe(true);
  expect(f.changes).toBe(1);
});
