import {
  distanceProfile,
  euclidDistances,
  fmtP,
  knn,
  labelClustering,
  mantel,
  neighbourhoodEnrichment,
  nicheEnrichment,
  normalizeSpatial,
  placeTissue,
  spatialHeadlines,
  spatialWeights,
  treeSpaceMantel,
  valueClustering,
} from "./spatial";

// Two well-separated patches of 10 cells each on a jittered grid.
function twoPatches() {
  const pts = [];
  for (let i = 0; i < 10; i += 1) pts.push({ id: `a${i}`, x: (i % 5) * 10 + (i % 3), y: Math.floor(i / 5) * 10, fields: {} });
  for (let i = 0; i < 10; i += 1) pts.push({ id: `b${i}`, x: 500 + (i % 5) * 10, y: 300 + Math.floor(i / 5) * 10 + (i % 2), fields: {} });
  return pts;
}

// Tree ((a0..a9),(b0..b9)) as a layout: leaves at depth 5, clades at depth 4.
function twoCladeLayout(ids) {
  const nodes = [
    { isLeaf: false, x: 0, children: [1, 2], firstLeaf: 0, lastLeaf: 19 },
    { isLeaf: false, x: 4, children: [], firstLeaf: 0, lastLeaf: 9 },
    { isLeaf: false, x: 4, children: [], firstLeaf: 10, lastLeaf: 19 },
  ];
  ids.forEach((_, i) => {
    nodes.push({ isLeaf: true, x: 5, children: [], firstLeaf: i, lastLeaf: i });
    nodes[i < 10 ? 1 : 2].children.push(nodes.length - 1);
  });
  return { leaves: ids, nodes };
}

describe("spatial", () => {
  it("normalises row and columnar spatial.json and types fields", () => {
    const rows = normalizeSpatial({
      units: "um",
      cells: [
        { cell_id: "c1", x: 1, y: 2, clone_id: "Clone 1", EGFR: 8 },
        { cell: "c2", x: "3", y: 4, clone_id: "Clone 2", EGFR: 2 },
        { pair: "c3", x: null, y: 4 },
      ],
    });
    expect(rows.points.map((p) => p.id)).toEqual(["c1", "c2"]);
    expect(rows.units).toBe("um");
    expect(rows.fields.find((f) => f.name === "EGFR").numeric).toBe(true);
    expect(rows.fields.find((f) => f.name === "clone_id").levels).toEqual(["Clone 1", "Clone 2"]);
    const cols = normalizeSpatial({ cells: { cell_id: ["x", "y"], x: [0, 1], y: [0, 1], state: ["MES", "AC"] } });
    expect(cols.points).toHaveLength(2);
    expect(cols.points[1].fields.state).toBe("AC");
    expect(normalizeSpatial(null).points).toEqual([]);
  });

  it("finds nearest neighbours and builds symmetric weights", () => {
    const pts = twoPatches();
    const nb = knn(pts, 3);
    expect(nb[0]).toHaveLength(3);
    expect(nb[0].every((j) => j < 10)).toBe(true);
    const w = spatialWeights(pts, 3);
    expect(w.n).toBe(20);
    for (let i = 0; i < 20; i += 1) for (let j = 0; j < 20; j += 1) expect(w.W[i * 20 + j]).toBe(w.W[j * 20 + i]);
    expect(w.S0).toBeGreaterThan(0);
    expect(spatialWeights(pts.slice(0, 3), 3)).toBeNull();
    const D = euclidDistances(pts.slice(0, 2));
    expect(D[1]).toBeCloseTo(Math.hypot(11, 0));
  });

  it("calls a spatially segregated clone clustered and a scattered one not", () => {
    const pts = twoPatches();
    const w = spatialWeights(pts, 4);
    const patchy = pts.map((p) => (p.id.startsWith("a") ? "Clone 1" : "Clone 2"));
    const rows = labelClustering(w, patchy, { nPerm: 199 });
    expect(rows[0].pPerm).toBeLessThan(0.05);
    expect(rows[0].I).toBeGreaterThan(0.5);
    const mixed = pts.map((_, i) => (i % 2 ? "Clone 1" : "Clone 2"));
    const r2 = labelClustering(w, mixed, { nPerm: 199 });
    expect(r2.every((r) => r.pPerm > 0.05)).toBe(true);
    const v = valueClustering(w, pts.map((p) => (p.id.startsWith("a") ? 8 : 2)), { nPerm: 99 });
    expect(v.pPerm).toBeLessThan(0.05);
    expect(valueClustering(w, pts.map(() => 1))).toBeNull();
  });

  it("scores neighbourhood enrichment within and between labels", () => {
    const pts = twoPatches();
    const w = spatialWeights(pts, 4);
    const labels = pts.map((p) => (p.id.startsWith("a") ? "A" : "B"));
    const e = neighbourhoodEnrichment(w, labels, { nPerm: 199 });
    expect(e.labels).toEqual(["A", "B"]);
    expect(e.z[0][0]).toBeGreaterThan(2);
    expect(e.z[0][1]).toBeLessThan(-2);
    expect(e.observed[0][1]).toBe(e.observed[1][0]);
    expect(neighbourhoodEnrichment(w, pts.map(() => "A"))).toBeNull();
  });

  it("detects a clone sitting in high-score neighbourhoods", () => {
    const pts = twoPatches();
    const w = spatialWeights(pts, 4);
    // patch b is "hypoxic"; clone X lives in patch b
    const scores = pts.map((p) => (p.id.startsWith("b") ? 1 : 0));
    const labels = pts.map((p) => (p.id.startsWith("b") ? "X" : "Y"));
    const rows = nicheEnrichment(w, labels, scores, { nPerm: 199 });
    const x = rows.find((r) => r.label === "X");
    expect(x.diff).toBeGreaterThan(0.5);
    expect(x.p).toBeLessThan(0.05);
  });

  it("runs a Mantel test between tree and physical distance", () => {
    const pts = twoPatches();
    const layout = twoCladeLayout(pts.map((p) => p.id));
    const m = treeSpaceMantel(layout, pts, { nPerm: 199 });
    expect(m.cells).toBe(20);
    expect(m.r).toBeGreaterThan(0.5);
    expect(m.p).toBeLessThan(0.05);
    // shuffled positions: no association
    const shuffled = pts.map((p, i) => ({ ...p, x: pts[(i * 7) % 20].x, y: pts[(i * 7) % 20].y }));
    const m2 = treeSpaceMantel(layout, shuffled, { nPerm: 199 });
    expect(m2.r).toBeLessThan(m.r);
    expect(treeSpaceMantel(null, pts)).toBeNull();
    const prof = distanceProfile(layout, pts, 4);
    expect(prof).toHaveLength(4);
    expect(prof[0].tree).toBeLessThan(prof[3].tree);
    const flat = mantel(new Float64Array(9), new Float64Array(9), 3);
    expect(Number.isNaN(flat.r)).toBe(true);
  });

  it("writes plain-language headlines, significant findings first", () => {
    const lines = spatialHeadlines({
      clustering: [
        { label: "Clone 2", n: 30, I: 0.31, EI: -0.01, pPerm: 0.002 },
        { label: "Clone 1", n: 40, I: 0.01, EI: -0.01, pPerm: 0.4 },
      ],
      mantel: { r: 0.05, p: 0.3, cells: 70 },
      enrichment: { labels: ["Clone 1", "Myeloid"], z: [[3, 2.5], [2.5, 1]], observed: [[10, 6], [6, 2]] },
      niche: [{ score: "hypoxia", rows: [{ label: "Clone 1", mean: 0.4, background: 0.1, diff: 0.3, p: 0.01 }] }],
    });
    expect(lines[0].text).toBe("Clone 2 is spatially clustered (Moran's I = 0.31, p = 0.002, 30 cells).");
    expect(lines.some((l) => l.text.startsWith("Clone 1 and Myeloid are neighbours"))).toBe(true);
    expect(lines.some((l) => l.text.includes("higher-hypoxia"))).toBe(true);
    expect(lines[lines.length - 1].text).toMatch(/^Tree distance does not track/);
    const none = spatialHeadlines({ clustering: [{ label: "Clone 1", n: 5, I: 0.02, EI: -0.1, pPerm: 0.5 }] });
    expect(none[0].text).toMatch(/^No clone is spatially clustered/);
    expect(fmtP(0.0004)).toBe("< 0.001");
  });

  it("places tissue coordinates preserving aspect ratio", () => {
    const placed = placeTissue([{ x: 0, y: 0 }, { x: 100, y: 50 }], 220, 220, 10);
    expect(placed[0].px).toBeCloseTo(10);
    expect(placed[1].px).toBeCloseTo(210);
    // 200 px per 100 units in x, so 50 units in y = 100 px, centred vertically
    expect(placed[1].py - placed[0].py).toBeCloseTo(100);
    expect(placeTissue([], 10, 10)).toEqual([]);
  });
});
