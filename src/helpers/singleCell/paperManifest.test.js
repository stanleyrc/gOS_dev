import { anchoredPanels, bestImage, lettersLabel, panelAt, panelLettersById, panelRegions, figureGroup, figureLabel, fitView, formatBuilt, panelStatus, panelTarget, parsePaperManifest, targetSearch, zoomAt } from "./paperManifest";

const manifest = {
  format: "gos-sc-paper-figures/1",
  synced: "2026-01-02T03:04:05",
  srctools: { sha: "abc1234", uncommitted_changes: false },
  figures: [
    {
      id: "Figure2",
      title: "Synthetic",
      svg: "figures/Figure2.svg",
      png: "figures/Figure2.preview.png",
      pdf: "figures/Figure2.pdf",
      width_pt: 500,
      height_pt: 400,
      built: "2026-01-02T01:00:00",
      panels: [
        { letter: "A", status: "ready", svg: "panels/Figure2_A.svg", view: { panel: "2A", patient: "P1" } },
        { letter: "B", status: "partial", reason: "3 of 4 patients", png: "panels/Figure2_B.png" },
        { letter: "C", status: "na", reason: "not exported" },
      ],
    },
    { id: "FigureS3" },
    { id: "FigureV1_trees" },
    { title: "no id" },
  ],
};

describe("paper figures manifest", () => {
  it("parses figures, resolves files and counts incomplete panels", () => {
    const m = parsePaperManifest(manifest, "https://x/data/_cohort/paper_figures/");
    expect(m.figures.map((f) => f.id)).toEqual(["Figure2", "FigureS3", "FigureV1_trees"]);
    const f = m.figures[0];
    expect(f.svg).toBe("https://x/data/_cohort/paper_figures/figures/Figure2.svg");
    expect(f.nIncomplete).toBe(2);
    expect(f.panels.map((p) => p.status)).toEqual(["ready", "partial", "not available"]);
    expect(bestImage(f.panels[1])).toBe("https://x/data/_cohort/paper_figures/panels/Figure2_B.png");
    expect(bestImage(f.panels[2])).toBeNull();
    expect(parsePaperManifest({})).toBeNull();
  });
  it("labels and groups figures", () => {
    expect([figureLabel("Figure4"), figureLabel("FigureS1"), figureLabel("FigureV2_ecdna_new")]).toEqual(["Fig 4", "Fig S1", "Fig V2"]);
    expect([figureGroup("Figure4"), figureGroup("FigureS6"), figureGroup("FigureV3_x")]).toEqual(["main", "supplementary", "extra"]);
    expect(panelStatus("Ready")).toBe("ready");
    expect(formatBuilt("2026-10-19T23:45:05")).toBe("2026-10-19 23:45");
  });
  it("links panels to their interactive views", () => {
    const t = panelTarget({ panel: "4B", patient: "P1" });
    expect(t).toEqual({ kind: "interactive", panel: "4B", patient: "P1", label: null });
    expect(targetSearch(t, "?dataset=d&scview=overview&figpatient=old")).toBe("?dataset=d&scview=figures&figmode=interactive&figpanel=4B&figpatient=P1");
    expect(targetSearch(panelTarget({ scview: "drivers" }), "?dataset=d")).toBe("?dataset=d&scview=drivers");
    expect(targetSearch(panelTarget({ tab: 12, patient: "P2" }), "?dataset=d")).toBe("?dataset=d&report=P2&tab=12");
    expect(panelTarget(null)).toBeNull();
    expect(panelTarget({})).toBeNull();
  });
  it("zooms about a point and fits", () => {
    const v = zoomAt({ k: 1, x: 0, y: 0 }, 2, 100, 50);
    expect(v).toEqual({ k: 2, x: -100, y: -50 });
    expect(zoomAt({ k: 10, x: 0, y: 0 }, 4, 0, 0).k).toBe(12);
    const f = fitView(200, 100, 416, 216, 8);
    expect(f).toEqual({ k: 2, x: 8, y: 8 });
  });
});

describe("paper figure layout", () => {
  const fig = {
    id: "Figure9",
    panels: [
      { letter: "A", anchor: { x: 0, y: 0 } },
      { letter: "B", anchor: { x: 0, y: 100 } },
      { letter: "C", anchor: { x: 200, y: 0 } },
      { letter: "D", anchor: { x: 150, y: 102 } },
      { letter: "E" },
    ],
  };
  const a = anchoredPanels(fig);
  it("finds the panel under a point", () => {
    expect(a.map((p) => p.letter)).toEqual(["A", "B", "C", "D"]);
    expect(panelAt(a, 50, 50).letter).toBe("A");
    expect(panelAt(a, 250, 50).letter).toBe("C");
    expect(panelAt(a, 50, 150).letter).toBe("B");
    expect(panelAt(a, 180, 150).letter).toBe("D");
    expect(panelAt(a, -20, -20)).toBeNull();
  });
  it("approximates panel rectangles", () => {
    const r = Object.fromEntries(panelRegions(a, 300, 200, { grid: 30 }).map((b) => [b.letter, b]));
    expect(r.A).toMatchObject({ x0: 0, y0: 0, x1: 200 });
    expect(r.D.x0).toBe(150);
    expect(r.C.y1).toBeGreaterThan(90);
    expect(r.C.y1).toBeLessThanOrEqual(100);
  });
  it("maps interactive panels to their paper letters", () => {
    const m = parsePaperManifest({ figures: [{ id: "Figure4", panels: [{ letter: "B", view: { panel: "pf" } }, { letter: "F", view: { panel: "bars" } }] }, { id: "Figure5", panels: [{ letter: "D", view: { panel: "pf" } }] }] });
    const l = panelLettersById(m);
    expect(lettersLabel(l.get("pf"))).toBe("Fig 4B · Fig 5D");
    expect(lettersLabel([{ figure: "Fig 1", letter: "f" }, { figure: "Fig 1", letter: "g" }])).toBe("Fig 1f, g");
    expect(lettersLabel(undefined)).toBe("");
  });
});
