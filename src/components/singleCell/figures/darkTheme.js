import { useEffect, useState } from "react";
import { isDark, onAppThemeChange } from "../../../helpers/appTheme";

/** Current app theme as a boolean (true = dark), following theme switches. */
export function useDarkTheme() {
  const [dark, setDark] = useState(isDark());
  useEffect(() => onAppThemeChange((t) => setDark(t === "dark")), []);
  return dark;
}

/** Packed RGBA grey for a VAF on a 0-250 scale: white -> black (light), dark -> light (dark). */
export const vafGray = (vaf, dark) => {
  const t = Math.min(250, vaf) / 250;
  const v = Math.round(dark ? 38 + t * 200 : 255 - t * 235);
  return ((255 << 24) | (v << 16) | (v << 8) | v) >>> 0;
};
export const NO_READS_LIGHT = 0xffffffff;
export const NO_READS_DARK = 0xff262626;
