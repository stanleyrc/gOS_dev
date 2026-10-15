import { applyAppTheme, getAppTheme, setAppTheme, THEME_STORAGE_KEY } from "./appTheme";
import { currentMode } from "./singleCell/plotTheme";

describe("app theme modes", () => {
  beforeEach(() => window.localStorage.clear());

  it("stores and restores cyberpunk, unknown values fall back to light", () => {
    setAppTheme("cyberpunk");
    expect(getAppTheme()).toBe("cyberpunk");
    window.localStorage.setItem(THEME_STORAGE_KEY, "bogus");
    expect(getAppTheme()).toBe("light");
  });

  it("cyberpunk keeps data-theme=dark and sets data-skin", () => {
    applyAppTheme("cyberpunk");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-skin")).toBe("cyberpunk");
    expect(currentMode()).toBe("cyberpunk");
    applyAppTheme("dark");
    expect(currentMode()).toBe("dark");
    applyAppTheme("light");
    expect(currentMode()).toBe("light");
  });
});
