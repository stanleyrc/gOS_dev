import {
  focusFromSearch,
  initialFocus,
  searchWithFocus,
  isFocusToggleKey,
  focusHeatmapHeight,
  rowPixels,
  MIN_FOCUS_HEIGHT,
  MAX_FOCUS_ROW_PX,
} from "./focusMode";

describe("focus mode link", () => {
  test("reads focus=1 / 0 and ignores other values as off", () => {
    expect(focusFromSearch("?focus=1")).toBe(true);
    expect(focusFromSearch("?a=2&focus=true")).toBe(true);
    expect(focusFromSearch("?focus=0")).toBe(false);
    expect(focusFromSearch("?a=1")).toBeNull();
  });
  test("link beats session memory", () => {
    expect(initialFocus("?focus=0", "1")).toBe(false);
    expect(initialFocus("?focus=1", null)).toBe(true);
    expect(initialFocus("", "1")).toBe(true);
    expect(initialFocus("", null)).toBe(false);
  });
  test("searchWithFocus keeps the other parameters", () => {
    expect(searchWithFocus("?tab=7&report=P1", true)).toBe("?tab=7&report=P1&focus=1");
    expect(searchWithFocus("?tab=7&focus=1", false)).toBe("?tab=7");
    expect(searchWithFocus("?focus=1", false)).toBe("");
  });
});

describe("isFocusToggleKey", () => {
  const ev = (o) => ({ key: "f", target: { tagName: "DIV" }, ...o });
  test("plain f toggles", () => expect(isFocusToggleKey(ev({}))).toBe(true));
  test("not while typing or with modifiers", () => {
    expect(isFocusToggleKey(ev({ target: { tagName: "INPUT" } }))).toBe(false);
    expect(isFocusToggleKey(ev({ target: { tagName: "DIV", isContentEditable: true } }))).toBe(false);
    expect(isFocusToggleKey(ev({ ctrlKey: true }))).toBe(false);
    expect(isFocusToggleKey(ev({ metaKey: true }))).toBe(false);
    expect(isFocusToggleKey(ev({ key: "g" }))).toBe(false);
    expect(isFocusToggleKey(ev({ defaultPrevented: true }))).toBe(false);
  });
});

describe("focusHeatmapHeight", () => {
  test("fills the room left by the fixed chrome", () => {
    // body 800 px, content 900 with a 600 px row area: chrome 300
    expect(focusHeatmapHeight({ bodyClient: 800, contentHeight: 900, rowAreaHeight: 600, nRows: 2000 })).toBe(496);
  });
  test("is stable when re-run at its own result", () => {
    const h1 = focusHeatmapHeight({ bodyClient: 800, contentHeight: 900, rowAreaHeight: 600, nRows: 2000 });
    const h2 = focusHeatmapHeight({ bodyClient: 800, contentHeight: 300 + h1, rowAreaHeight: h1, nRows: 2000 });
    expect(h2).toBe(h1);
  });
  test("caps row height for few cells and floors at the minimum", () => {
    expect(focusHeatmapHeight({ bodyClient: 2000, contentHeight: 400, rowAreaHeight: 200, nRows: 20 })).toBe(20 * MAX_FOCUS_ROW_PX);
    expect(focusHeatmapHeight({ bodyClient: 200, contentHeight: 500, rowAreaHeight: 300, nRows: 500 })).toBe(MIN_FOCUS_HEIGHT);
  });
  test("null on unmeasured input", () => {
    expect(focusHeatmapHeight({ bodyClient: NaN, contentHeight: 1, rowAreaHeight: 1 })).toBeNull();
  });
  test("rowPixels", () => {
    expect(rowPixels(500, 100)).toBe(5);
    expect(rowPixels(500, 0)).toBeNull();
  });
});
