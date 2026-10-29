import { counterText, isTypingTarget, navAction, neighbourKey, stepIndex } from "./figureNav";

const keys = ["paperfig1", "paperfig3", "paperfig4"];
describe("figureNav", () => {
  test("stepIndex wraps", () => {
    expect(stepIndex(0, 3, -1)).toBe(2);
    expect(stepIndex(2, 3, 1)).toBe(0);
    expect(stepIndex(1, 3, 1)).toBe(2);
    expect(stepIndex(0, 0, 1)).toBe(-1);
    expect(stepIndex(-1, 3, 1)).toBe(0);
  });
  test("neighbourKey", () => {
    expect(neighbourKey(keys, "paperfig1", 1)).toBe("paperfig3");
    expect(neighbourKey(keys, "paperfig1", -1)).toBe("paperfig4");
    expect(neighbourKey(keys, "nope", 1)).toBeNull();
  });
  test("counterText", () => {
    expect(counterText(keys, "paperfig3")).toBe("2 / 3");
    expect(counterText(keys, "x")).toBe("");
  });
  test("navAction filters", () => {
    const ev = (o) => ({ key: "ArrowRight", target: { tagName: "DIV" }, ...o });
    expect(navAction(ev({}))).toBe("next");
    expect(navAction(ev({ key: "ArrowLeft" }))).toBe("prev");
    expect(navAction(ev({ target: { tagName: "INPUT", value: "EGF" } }))).toBeNull();
    expect(navAction(ev({ target: { tagName: "INPUT", value: "" } }))).toBe("next");
    expect(navAction(ev({ target: { tagName: "SELECT" } }))).toBeNull();
    expect(navAction(ev({ metaKey: true }))).toBeNull();
    expect(navAction(ev({}), { blocked: true })).toBeNull();
    expect(navAction(ev({ key: "Escape" }), { canClose: true })).toBe("close");
    expect(navAction(ev({ key: "Escape" }))).toBeNull();
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });
});

describe("framedFocus", () => {
  const { framedFocus } = require("./figureNav");
  test("iframe focus detected", () => {
    const f = { tagName: "IFRAME" };
    expect(framedFocus({ activeElement: f })).toBe(f);
    expect(framedFocus({ activeElement: { tagName: "embed" } })).toBeTruthy();
    expect(framedFocus({ activeElement: { tagName: "BODY" } })).toBeNull();
    expect(framedFocus(null)).toBeNull();
  });
});

test("radio inputs are not typing targets", () => {
  expect(isTypingTarget({ tagName: "INPUT", type: "radio", value: "original" })).toBe(false);
  expect(isTypingTarget({ tagName: "INPUT", type: "text", value: "abc" })).toBe(true);
});
