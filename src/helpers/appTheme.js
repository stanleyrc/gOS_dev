// Light / dark theme for the whole app: stored in this browser, exposed on
// <html data-theme> for CSS, and read by App for the antd algorithm.

export const THEME_STORAGE_KEY = "gos-theme";
const listeners = new Set();

export function getAppTheme() {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch (error) {
    return "light";
  }
}

export function applyAppTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme;
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

export const isDark = () => getAppTheme() === "dark";
