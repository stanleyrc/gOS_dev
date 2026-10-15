// Light / dark / cyberpunk theme for the whole app: stored in this browser, exposed on
// <html data-theme> for CSS, and read by App for the antd algorithm.

import { cssVars, isDarkLike, svgRemapCss } from "./singleCell/plotTheme";

export { isDarkLike };

export const THEME_STORAGE_KEY = "gos-theme";
const listeners = new Set();

export function getAppTheme() {
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY);
    return v === "dark" || v === "cyberpunk" ? v : "light";
  } catch (error) {
    return "light";
  }
}

export function applyAppTheme(theme) {
  // cyberpunk reuses every dark code path: <html data-theme> stays "dark" and
  // data-skin carries the real mode for the neon overrides
  document.documentElement.setAttribute("data-theme", isDarkLike(theme) ? "dark" : "light");
  document.documentElement.setAttribute("data-skin", theme);
  document.documentElement.style.colorScheme = isDarkLike(theme) ? "dark" : "light";
  // colour / type tokens for CSS (var(--sc-text) etc.); plots read the same
  // values from helpers/singleCell/plotTheme
  const vars = cssVars(theme);
  Object.keys(vars).forEach((k) => document.documentElement.style.setProperty(k, vars[k]));
  // dark re-tint of the light colours SVG plots write as attributes (once)
  if (!document.getElementById("sc-svg-remap")) {
    const style = document.createElement("style");
    style.id = "sc-svg-remap";
    style.textContent = svgRemapCss();
    document.head.appendChild(style);
  }
}

export function setAppTheme(theme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (error) {
    // storage unavailable: still apply for this page
  }
  applyAppTheme(theme);
  listeners.forEach((fn) => fn(theme));
}

export function onAppThemeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const isDark = () => isDarkLike(getAppTheme());
