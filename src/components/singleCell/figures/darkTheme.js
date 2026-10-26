import { useEffect, useState } from "react";
import { isDark, isDarkLike, onAppThemeChange } from "../../../helpers/appTheme";
import { hexToRgb, packRGBA, snvWhiteNaRGB, SNV_NO_READS_BLUE } from "../../../helpers/singleCell/matrix";

/** Current app theme as a boolean (true = dark), following theme switches. */
export function useDarkTheme() {
  const [dark, setDark] = useState(isDark());
  useEffect(() => onAppThemeChange((t) => setDark(isDarkLike(t))), []);
  return dark;
}

/**
 * Packed RGBA for a covered site's VAF on a 0-250 scale. Light: the patient-view convention with blue = no reads
 * (NO_READS_LIGHT), so reference reads only (0) are white and alt VAF runs grey -> black (snvWhiteNaRGB);
 * dark: dark -> light grey over the dark no-reads background.
 */
export const vafGray = (vaf, dark) => {
  const t = Math.max(0, Math.min(250, vaf)) / 250;
  if (!dark) return packRGBA(snvWhiteNaRGB(t));
  const v = Math.round(38 + t * 200);
  return ((255 << 24) | (v << 16) | (v << 8) | v) >>> 0;
};
export const NO_READS_LIGHT = packRGBA(hexToRgb(SNV_NO_READS_BLUE));
export const NO_READS_DARK = 0xff262626;
