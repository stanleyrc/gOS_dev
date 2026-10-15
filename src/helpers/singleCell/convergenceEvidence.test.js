import {
  carrierGroups,
  convergenceEvidence,
  convergenceSummary,
  eventConvKey,
  evidenceTotals,
  parseConvSpec,
  rankEventCandidates,
  regionCarriers,
  resolveRegion,
  serializeConvSpec,
} from "./convergenceEvidence";
import { layoutTree, parseNewick } from "./newick";
import { buildBinIndex } from "./matrix";

// Synthetic tree: ((A,N1),(B,N2)) with 4 cells each, plus a normal cell z.
// Event E is carried by A and B (two groups); N1 and N2 are non-carriers.
const NWK = "(((a1:1,a2:1,a3:1,a4:1):1,(n1:1,n2:1,n3:1,n4:1):1):1,((b1:1,b2:1,b3:1,b4:1):1,(m1:1,m2:1,m3:1,m4:1):1):1,z:3);";
const layout = layoutTree(parseNewick(NWK));
const A = ["a1", "a2", "a3", "a4"];
const B = ["b1", "b2", "b3", "b4"];
const N1 = ["n1", "n2", "n3", "n4"];
const N2 = ["m1", "m2", "m3", "m4"];
const carriers = new Set([...A, ...B]);
const exclude = new Set(["z"]);

/** SNV matrix from per-site alt cell lists; every listed cell is covered at every site. */
function matrix(sites, cells = [...A, ...N1, ...B, ...N2, "z"]) {
  const variants = sites.map((s, k) => ({ id: `s${k}`, category: s.category || "subclonal" }));
  const status = cells.map((id) => Int8Array.from(sites, (s) => (s.alt.includes(id) ? 1 : s.nocov?.includes(id) ? -1 : 0)));
  return { cells, variants, status };
}

describe("convergence evidence", () => {
  it("parses and serializes specs", () => {
    expect(parseConvSpec("cn:loss:delta:0.75:15q")).toEqual({ kind: "cn", dir: "loss", rule: "delta", thr: 0.75, region: "15q" });
    expect(parseConvSpec("cn:gain:abs:6:chr4:54000000-56000000").region).toBe("chr4:54000000-56000000");
    expect(parseConvSpec("ev:PDGFRA:AMP:55")).toEqual({ kind: "ev", key: "PDGFRA:AMP:55" });
    expect(parseConvSpec("cn:up:delta:1:15q")).toBeNull();
    expect(parseConvSpec("")).toBeNull();
    const s = { kind: "cn", dir: "gain", rule: "delta", thr: 3, region: "PDGFRA" };
    expect(parseConvSpec(serializeConvSpec(s))).toEqual(s);
    expect(eventConvKey({ gene: "PDGFRA", vartype: "AMP", start: 55 })).toBe("PDGFRA:AMP:55");
  });

  it("finds two carrier groups and the non-carrier clades", () => {
    const res = carrierGroups(layout, carriers, { exclude });
    expect(res.groups.map((g) => g.ids)).toEqual([A, B]);
    expect(res.groups.map((g) => g.name)).toEqual(["G1", "G2"]);
    expect(res.clades.map((c) => c.ids)).toEqual([N1, N2]);
    expect(res.scattered).toBe(0);
    expect(res.nonCarrierIds).not.toContain("z");
    expect(res.between).toEqual([expect.objectContaining({ i: 0, j: 1, nonCarriers: 8 })]);
  });

  it("tolerates a minority of non-carriers inside a group", () => {
    const res = carrierGroups(layout, new Set(["a1", "a2", "a3", ...B]), { exclude, tolerance: 0.25 });
    expect(res.groups).toHaveLength(2);
    expect(res.groups[0]).toMatchObject({ n: 4, carriers: 3 });
    const strict = carrierGroups(layout, new Set(["a1", "a2", "a3", ...B]), { exclude, tolerance: 0.1, minCells: 3 });
    expect(strict.groups.map((g) => g.carriers)).toEqual([4]); // A no longer qualifies as a clade at 10%
    expect(strict.scattered).toBe(3);
  });

  it("counts SNVs that split the groups and SNVs shared by them only", () => {
    const snv = matrix([
      { alt: [...A, ...N1] }, // G1 + N1, absent from G2 -> split[0][1]
      { alt: [...B, ...N2] }, // G2 + N2, absent from G1 -> split[1][0]
      { alt: [...A, ...N1], category: "outside_tumor" }, // ignored
      { alt: [...A, ...B] }, // shared by groups only
      { alt: [...A, ...N1, ...B, ...N2] }, // truncal: neither
      { alt: [...A, ...N1], nocov: ["b1", "b2"] }, // G2 has only 2 covered cells: not absent
    ]);
    const groups = carrierGroups(layout, carriers, { exclude });
    const ev = convergenceEvidence(snv, groups, null, { minCoveredAbsent: 3 });
    expect(ev.nTested).toBe(5);
    expect(ev.split).toEqual([
      [0, 1],
      [1, 0],
    ]);
    expect(ev.shared[0][1]).toBe(1);
    expect(evidenceTotals(ev)).toEqual({ split: 2, shared: 1 });
    expect(ev.sites.map((s) => s.group)).toEqual(["G1+N not G2", "G2+N not G1", "G1+G2 not N"]);
    expect(ev.sites[0]).toMatchObject({ id: "s0", k: 0, fi: 1, fj: 0, fk: 1 });
    const text = convergenceSummary("E", groups, ev);
    expect(text).toContain("2 carrier groups (G1 n=4, G2 n=4)");
    expect(text).toContain("1 SNV shared by carrier groups only");
  });

  it("restricts to the given columns and reports missing SNVs", () => {
    const snv = matrix([{ alt: [...A, ...N1] }, { alt: [...A, ...B] }]);
    const groups = carrierGroups(layout, carriers, { exclude });
    const ev = convergenceEvidence(snv, groups, [1]);
    expect(evidenceTotals(ev)).toEqual({ split: 0, shared: 1 });
    expect(convergenceSummary("E", groups, null, "no SNV matrix")).toContain("SNV evidence not available (no SNV matrix)");
    expect(convergenceEvidence(null, groups).sites).toEqual([]);
  });

  it("ranks filtered events by number of carrier groups", () => {
    const events = [
      { gene: "ONE", vartype: "AMP", start: 1, cell_ids: A.join(",") },
      { gene: "TWO", vartype: "AMP", start: 2, cell_ids: [...A, ...B].join(","), Tier: 2 },
      { gene: "FEW", vartype: "AMP", start: 3, cell_ids: "a1" },
    ];
    const ranked = rankEventCandidates(events, layout, { exclude });
    expect(ranked.map((r) => [r.label, r.nGroups])).toEqual([
      ["TWO amp", 2],
      ["ONE amp", 1],
    ]);
  });

  it("calls CN carriers over a region relative to the cell baseline", () => {
    const chromoBins = { 1: { startPlace: 1, endPlace: 100e6 }, 2: { startPlace: 100e6 + 1, endPlace: 200e6 } };
    const arms = [
      { name: "1", gStart: 1, gEnd: 100e6 },
      { name: "2", gStart: 100e6 + 1, gEnd: 200e6 },
    ];
    const row = (segs) => ({
      binIndex: buildBinIndex({ chromosome: segs.map((s) => s[0]), start: segs.map((s) => s[1]), end: segs.map((s) => s[2]) }, chromoBins),
      values: Float32Array.from(segs.map((s) => s[3])),
    });
    const cn = {
      cells: ["x", "y", "w"],
      rows: [row([["1", 0, 100e6, 2], ["2", 0, 100e6, 1]]), row([["1", 0, 100e6, 2], ["2", 0, 100e6, 2]]), row([["1", 0, 100e6, 4], ["2", 0, 100e6, 3]])],
    };
    const region = resolveRegion("2", { arms, chromoBins });
    expect(region.label).toBe("2");
    const calls = regionCarriers(cn, region, { dir: "loss", rule: "delta", thr: 0.75 }, arms);
    // baseline is the rounded median of the arm medians: x = round(1.5) = 2, w = round(3.5) = 4
    expect([...calls.entries()].filter(([, v]) => v.carrier).map(([k]) => k)).toEqual(["x", "w"]);
    const abs = regionCarriers(cn, region, { dir: "loss", rule: "abs", thr: 1 }, arms);
    expect(abs.get("x").carrier).toBe(true);
    expect(abs.get("w").carrier).toBe(false);
    expect(resolveRegion("chr2:10-20", { chromoBins })).toMatchObject({ gStart: 100e6 + 11, focal: true });
    expect(resolveRegion("PDGFRA", { genes: new Map([["PDGFRA", { start: 5, end: 9 }]]) })).toMatchObject({ gStart: 5, label: "PDGFRA" });
    expect(resolveRegion("nowhere", {})).toBeNull();
  });
});
