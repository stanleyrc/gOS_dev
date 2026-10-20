import {
  JOINT_FORMAT,
  betterOn,
  cellFilesWithGenomes,
  cnSourceNote,
  cnSourceOptions,
  defaultCnSource,
  jointCellFile,
  parseJointManifest,
  resolveCnSource,
  withCnSource,
} from "./cnSource";

// synthetic manifest (no patient data)
const raw = (over = {}) => ({
  format: JOINT_FORMAT,
  patient: "P1",
  cells: ["c1", "c2"],
  cells_missing: [{ cell: "c3", reason: "solver failed" }],
  chromosomes: ["7", "13"],
  outside_chromosomes: "regular per-cell JaBbA",
  default_source: "regular",
  verdict: {
    much_better: false,
    criteria: [
      { key: "c1", label: "loose ends", pass: true },
      { key: "c2", label: "fit", pass: false },
    ],
  },
  ...over,
});

describe("cnSource", () => {
  test("parses a manifest and rejects other formats", () => {
    const m = parseJointManifest(raw());
    expect(m.cells).toEqual(["c1", "c2"]);
    expect(m.cellSet.has("c2")).toBe(true);
    expect(m.cellsMissing[0]).toEqual({ cell: "c3", reason: "solver failed" });
    expect(parseJointManifest({ format: "other", cells: ["a"] })).toBeNull();
    expect(parseJointManifest(raw({ cells: [] }))).toBeNull();
    expect(parseJointManifest(null)).toBeNull();
  });

  test("default follows the manifest only when joint is the declared default", () => {
    expect(defaultCnSource(parseJointManifest(raw()))).toBe("regular");
    expect(defaultCnSource(parseJointManifest(raw({ default_source: "joint" })))).toBe("joint");
    expect(defaultCnSource(null)).toBe("regular");
  });

  test("options, labels and notes", () => {
    const m = parseJointManifest(raw({ default_source: "joint" }));
    expect(cnSourceOptions(null)).toEqual([]);
    expect(cnSourceOptions(m).map((o) => o.label)).toEqual(["Regular", "Joint junction balance (default)"]);
    expect(betterOn(m)).toEqual(["loose ends"]);
    expect(cnSourceNote(m)).toMatch(/better on loose ends/);
    expect(cnSourceNote(parseJointManifest(raw()))).toMatch(/did not pass fit/);
    expect(cnSourceNote(null)).toMatch(/not available/);
  });

  test("resolve and per-cell paths", () => {
    const m = parseJointManifest(raw());
    expect(resolveCnSource("joint", m)).toBe("joint");
    expect(resolveCnSource("joint", null)).toBe("regular");
    expect(jointCellFile("c1")).toBe("sc_cn_joint/cells/c1/complex.json");
  });

  test("joint cell files never fall back to the regular genome", () => {
    const files = { c1: { genome: "R1", mutations: "M1" }, c2: { genome: "R2", mutations: null } };
    const out = cellFilesWithGenomes(files, { c1: "J1" });
    expect(out.c1).toEqual({ genome: "J1", mutations: "M1" });
    expect(out.c2.genome).toBeNull();
    expect(files.c1.genome).toBe("R1");
  });
});

describe("withCnSource", () => {
  const base = {
    cnSource: "regular",
    cnSourceRequested: "regular",
    cn: "regCn",
    junctions: "regJ",
    cellFiles: { c1: { genome: "R1", mutations: "M" } },
    cnRegular: { cn: "regCn", junctions: "regJ", cellFiles: { c1: { genome: "R1", mutations: "M" } } },
    cnJoint: { status: "idle", data: null },
  };
  test("joint waits for its data, then swaps cn, junctions and genomes; regular restores", () => {
    const pending = withCnSource(base, "joint");
    expect(pending.cnSource).toBe("regular");
    expect(pending.cnSourceRequested).toBe("joint");
    expect(pending.cn).toBe("regCn");
    const loaded = { ...pending, cnJoint: { status: "ok", data: { cn: "jCn", junctions: "jJ", genomes: { c1: "J1" } } } };
    const j = withCnSource(loaded, "joint");
    expect(j.cnSource).toBe("joint");
    expect(j.cn).toBe("jCn");
    expect(j.cellFiles.c1).toEqual({ genome: "J1", mutations: "M" });
    const r = withCnSource(j, "regular");
    expect(r.cn).toBe("regCn");
    expect(r.cellFiles.c1.genome).toBe("R1");
  });
  test("a failed joint load never relabels regular data", () => {
    const s = withCnSource({ ...base, cnJoint: { status: "error", data: null } }, "joint");
    expect(s.cnSource).toBe("regular");
  });
});
