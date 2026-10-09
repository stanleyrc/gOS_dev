import { useEffect, useState } from "react";
import { getAppTheme, onAppThemeChange } from "../../helpers/appTheme";
import { plotTheme } from "../../helpers/singleCell/plotTheme";

/**
 * Resolved colour tokens of the current app theme (light / dark), updated
 * when the theme changes. Pass these into SVG / canvas drawing instead of
 * hard-coded colours; add the returned object (or `.mode`) to effect deps so
 * canvases redraw on a switch.
 */
export default function usePlotTheme() {
  const [mode, setMode] = useState(getAppTheme());
  useEffect(() => onAppThemeChange(setMode), []);
  return plotTheme(mode);
}
