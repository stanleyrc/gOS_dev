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

describe("sea skins", () => {
  beforeEach(() => window.localStorage.clear());

  it("stores sea / lagoon / deep sea; sea and deep sea use the dark paths, lagoon the light ones", () => {
    setAppTheme("sea");
    expect(getAppTheme()).toBe("sea");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-skin")).toBe("sea");
    expect(currentMode()).toBe("sea");
    setAppTheme("lagoon");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(currentMode()).toBe("lagoon");
    setAppTheme("deepsea");
    expect(currentMode()).toBe("deepsea");
    expect(document.documentElement.style.getPropertyValue("--sc-page")).toBe("#061620");
  });

  it("reads ?theme= from the URL", () => {
    const { themeFromUrl } = require("./appTheme");
    expect(themeFromUrl("?theme=sea&x=1")).toBe("sea");
    expect(themeFromUrl("?theme=bogus")).toBeNull();
    expect(themeFromUrl("")).toBeNull();
  });
});
