// Text colour for a label drawn on a coloured background (clone / patient
// tags): white on dark and mid tones, near-black on light ones (peach,
// light blue, yellow), where white text is hard to read.

/** [r, g, b] (0-255) of "#rgb", "#rrggbb" or "rgb(a)(r, g, b…)"; null when unparsable. */
export function parseColor(color) {
  const s = `${color || ""}`.trim();
  let m = s.match(/^#([0-9a-f]{3})$/i);
  if (m) return m[1].split("").map((c) => parseInt(c + c, 16));
  m = s.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (m) return [m[1], m[2], m[3]].map(Number);
  return null;
}

/** WCAG relative luminance (0 black - 1 white). */
export function luminance([r, g, b]) {
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export const INK_ON_LIGHT = "rgba(0, 0, 0, 0.85)";
export const INK_ON_DARK = "#fff";

/** Readable text colour on `background`; white unless white would fall below ~2.5:1. */
export function readableInk(background) {
  const rgb = parseColor(background);
  if (!rgb) return INK_ON_DARK;
  return luminance(rgb) > 0.37 ? INK_ON_LIGHT : INK_ON_DARK;
}
