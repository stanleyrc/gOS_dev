import { HOVER_CLOSE_MS, HOVER_OPEN_MS, PATIENT_RAIL, cohortGroupOfView, firstEnabledItem, cohortRail, isPhoneWidth, patientGroupOfTab, railContext } from "./navRail";
import { finderHref } from "./welcomeCards";
import { normalizeMethods, searchMethods } from "./methodsDoc";

describe("navRail", () => {
  it("group icons go to the first enabled page; hover intent delays are short and positive", () => {
    expect(firstEnabledItem([{ id: "a", disabled: true }, { id: "b" }, { id: "c" }]).id).toBe("b");
    expect(firstEnabledItem([{ id: "a", disabled: true }])).toBeNull();
    expect(firstEnabledItem(undefined)).toBeNull();
    expect(HOVER_OPEN_MS).toBeGreaterThan(0);
    expect(HOVER_OPEN_MS).toBeLessThanOrEqual(400);
    expect(HOVER_CLOSE_MS).toBeGreaterThan(0);
  });
  it("maps tabs (incl. retired 16, 17) to groups", () => {
    expect(patientGroupOfTab("7")).toBe("tree");
    expect(patientGroupOfTab(16)).toBe("report");
    expect(patientGroupOfTab(17)).toBe("tree");
    expect(patientGroupOfTab(99)).toBeNull();
    expect(PATIENT_RAIL.flatMap((g) => g.tabs.map((t) => t.tab)).sort((a, b) => a - b)).toEqual([7, 8, 9, 10, 11, 12, 13, 14, 15, 18]);
  });
  it("builds cohort groups with labels", () => {
    const views = [{ key: "a", group: "g1" }, { key: "b", group: "g2" }];
    const rail = cohortRail(["g1", "g2"], views, (k, key) => `${k}:${key}`);
    expect(rail[1].items[0]).toEqual({ view: "b", label: "view:b", desc: "purpose:b" });
    expect(cohortGroupOfView(views, "b")).toBe("g2");
  });
  it("chooses the context and phone layout", () => {
    expect(railContext({ report: "P", singleCellTabAvailable: true, hasCohort: true })).toBe("patient");
    expect(railContext({ report: null, singleCellTabAvailable: false, hasCohort: true })).toBe("cohort");
    expect(railContext({ report: "bulk", singleCellTabAvailable: false, hasCohort: true })).toBeNull();
    expect(isPhoneWidth(390)).toBe(true);
    expect(isPhoneWidth(1700)).toBe(false);
  });
  it("makes cohort links only for cohort cards", () => {
    expect(finderHref({ scope: "cohort", view: "qc" })).toBe("?scview=qc");
    expect(finderHref({ scope: "patient", tab: 7 })).toBeNull();
  });
});

describe("methodsDoc", () => {
  const doc = { format: "gos_methods_v1", sections: [
    { id: "cn", title: "CN calling", body_md: "JaBbA on **bins**.", sources: ["a/b.md"], status: "ok" },
    { id: "cn", title: "Trees", body_md: "CellPhy. to confirm: bootstraps", sources: "c.md" },
    { title: "", body_md: "dropped" },
  ] };
  it("normalises, de-duplicates ids and flags to-confirm", () => {
    const r = normalizeMethods(doc);
    expect(r.ok).toBe(true);
    expect(r.sections.map((s) => s.id)).toEqual(["cn", "cn-x"]);
    expect(r.sections[0].toConfirm).toBe(false);
    expect(r.sections[1].toConfirm).toBe(true);
    expect(r.sections[1].sources).toEqual(["c.md"]);
    expect(searchMethods(r.sections, "cellphy")).toHaveLength(1);
  });
  it("reports missing text instead of inventing it", () => {
    expect(normalizeMethods(null)).toEqual({ ok: false, reason: "methods text pending (methods.json not found)" });
    expect(normalizeMethods({ format: "x", sections: [] }).ok).toBe(false);
    expect(normalizeMethods({ sections: [] }).reason).toMatch(/pending/);
  });
});
