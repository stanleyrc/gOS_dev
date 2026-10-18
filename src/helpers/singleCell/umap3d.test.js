import { normalizeCloud, orbit, rotationMatrix, projectPoint, projectAll, pickPoint, parseColor, indexUmap3d, defaultView3d, zoom3d, MAX_Z3 } from "./umap3d";

describe("umap3d", () => {
  it("normalises a cloud to [-1, 1] about its centre", () => {
    const { xyz } = normalizeCloud([{ x: 0, y: 10, z: -5 }, { x: 4, y: 20, z: 5 }]);
    expect(Math.max(...xyz.map(Math.abs))).toBeCloseTo(1);
    expect(xyz[0]).toBeCloseTo(-xyz[3]);
    expect(xyz[1]).toBeCloseTo(-1);
  });
  it("rotation matrices are orthonormal", () => {
    const R = rotationMatrix(0.7, -0.4);
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        const dot = R[i][0] * R[j][0] + R[i][1] * R[j][1] + R[i][2] * R[j][2];
        expect(dot).toBeCloseTo(i === j ? 1 : 0);
      }
    }
  });
  it("identity orientation projects x right and y up", () => {
    const v = { yaw: 0, pitch: 0, zoom: 1, panX: 0, panY: 0 };
    const o = projectPoint(v, 0, 0, 0, 400, 300);
    const r = projectPoint(v, 1, 0, 0, 400, 300);
    const u = projectPoint(v, 0, 1, 0, 400, 300);
    expect(o.sx).toBe(200);
    expect(r.sx).toBeGreaterThan(o.sx);
    expect(u.sy).toBeLessThan(o.sy);
    expect(projectPoint(v, 0, 0, 1, 400, 300).depth).toBeGreaterThan(0);
  });
  it("orbit clamps pitch and zoom is bounded", () => {
    expect(orbit(defaultView3d(), 0, 1e6).pitch).toBeLessThan(Math.PI / 2);
    expect(orbit(defaultView3d(), 100, 0).yaw).toBeGreaterThan(defaultView3d().yaw);
    expect(zoom3d(defaultView3d(), 1e9).zoom).toBe(MAX_Z3);
  });
  it("picks the nearest projected point within the radius", () => {
    const proj = projectAll({ yaw: 0, pitch: 0, zoom: 1, panX: 0, panY: 0 }, new Float32Array([0, 0, 0, 0.5, 0, 0]), 400, 300);
    expect(pickPoint(proj, proj.sx[1] + 2, proj.sy[1], 8)).toBe(1);
    expect(pickPoint(proj, 0, 0, 8)).toBe(-1);
    expect(pickPoint(proj, proj.sx[1], proj.sy[1], 8, (i) => i === 1)).toBe(-1);
  });
  it("prefers the nearer point of two overlapping ones", () => {
    const proj = { sx: Float32Array.from([10, 10]), sy: Float32Array.from([10, 10]), depth: Float32Array.from([-1, 1]) };
    expect(pickPoint(proj, 10, 10, 8)).toBe(1);
  });
  it("parses CSS colours", () => {
    expect(parseColor("#ff0000")).toEqual([1, 0, 0]);
    expect(parseColor("#0f0")).toEqual([0, 1, 0]);
    expect(parseColor("rgb(0, 0, 255)")).toEqual([0, 0, 1]);
    expect(parseColor("red")).toBeNull();
  });
  it("indexes umap3d.json cells, dropping non-finite rows", () => {
    const m = indexUmap3d({ cells: [{ rna_id: "a", x: 1, y: 2, z: 3 }, { rna_id: "b", x: null, y: 2, z: 3 }] });
    expect([...m.keys()]).toEqual(["a"]);
    expect(indexUmap3d(null).size).toBe(0);
  });
});
