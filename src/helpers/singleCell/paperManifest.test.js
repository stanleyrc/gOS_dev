import { bestImage, figureGroup, figureLabel, fitView, formatBuilt, panelStatus, panelTarget, parsePaperManifest, targetSearch, zoomAt } from "./paperManifest";

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
