import { neighbourPanelIndex, panelSequence, popupFit, popupKeyAction } from "./paperPopup";

const figs = [
  { id: "f1", panels: [{ letter: "A", svg: "a" }, { letter: "B" }, { letter: "C", png: "c" }] },
  { id: "f2", panels: [{ letter: "A", svg: "a2" }] },
];

describe("popupFit", () => {
  test.each([[1440, 900], [1920, 1080], [1280, 720]])("fits %ix%i", (w, h) => {
    const f = popupFit(w, h, { hasTabs: true });
    expect(f.modalWidth).toBeLessThanOrEqual(w);
    expect(f.viewHeight + 24 + 56 + 48 + 40 + 72 + 64 + 40).toBeLessThanOrEqual(h);
    expect(f.viewHeight).toBeGreaterThanOrEqual(160);
  });
  test("tabs take space, tiny window floors", () => {
    expect(popupFit(1440, 900, { hasTabs: true }).viewHeight).toBeLessThan(popupFit(1440, 900).viewHeight);
    expect(popupFit(300, 200).viewHeight).toBe(160);
    expect(popupFit(0, 0).modalWidth).toBeGreaterThan(0);
  });
});

describe("panel navigation", () => {
  const seq = panelSequence(figs);
  test("skips panels without an image, keeps figure order", () => {
    expect(seq.map((s) => `${s.figId}${s.letter}`)).toEqual(["f1A", "f1C", "f2A"]);
  });
  test("next / prev cross figures and wrap", () => {
    expect(seq[neighbourPanelIndex(seq, { figId: "f1", letter: "C" }, 1)].figId).toBe("f2");
    expect(seq[neighbourPanelIndex(seq, { figId: "f2", letter: "A" }, 1)].letter).toBe("A");
    expect(seq[neighbourPanelIndex(seq, { figId: "f2", letter: "A" }, 1)].figId).toBe("f1");
    expect(seq[neighbourPanelIndex(seq, { figId: "f1", letter: "A" }, -1)].figId).toBe("f2");
  });
  test("no wrap stops; unknown / single gives -1", () => {
    expect(neighbourPanelIndex(seq, { figId: "f2", letter: "A" }, 1, false)).toBe(-1);
    expect(neighbourPanelIndex(seq, { figId: "x", letter: "A" }, 1)).toBe(-1);
    expect(neighbourPanelIndex(seq.slice(0, 1), { figId: "f1", letter: "A" }, 1)).toBe(-1);
  });
});

describe("popupKeyAction", () => {
  test("arrows, not while typing or with modifiers", () => {
    expect(popupKeyAction({ key: "ArrowLeft", target: { tagName: "DIV" } })).toBe("prev");
    expect(popupKeyAction({ key: "ArrowRight", target: { tagName: "DIV" } })).toBe("next");
    expect(popupKeyAction({ key: "ArrowRight", target: { tagName: "INPUT" } })).toBeNull();
    expect(popupKeyAction({ key: "ArrowRight", shiftKey: true, target: {} })).toBeNull();
    expect(popupKeyAction({ key: "a", target: {} })).toBeNull();
  });
});
