// Categorical colour themes for the single-cell views (clones, violin
// groups, UMAP fields, signatures, saved groups). Wes Anderson palettes
// follow karthik/wesanderson; "tableau" is the original default.

export const THEMES = {
  tableau: {
    label: "Tableau (default)",
    colors: ["#4E79A7", "#F28E2B", "#59A14F", "#E15759", "#B07AA1", "#76B7B2", "#EDC948", "#FF9DA7", "#9C755F", "#BAB0AC", "#1B9E77", "#D95F02", "#7570B3", "#E7298A", "#66A61E", "#E6AB02"],
  },
  zissou: {
    label: "Zissou (Life Aquatic)",
    colors: ["#3B9AB2", "#E1AF00", "#F21A00", "#78B7C5", "#EBCC2A", "#9A8822", "#5BBCD6", "#F98400", "#00A08A", "#FF0000"],
  },
  darjeeling: {
    label: "Darjeeling Limited",
    colors: ["#FF0000", "#00A08A", "#F2AD00", "#F98400", "#5BBCD6", "#ECCBAE", "#046C9A", "#D69C4E", "#ABDDDE", "#000000"],
  },
  budapest: {
    label: "Grand Budapest",
    colors: ["#F1BB7B", "#FD6467", "#5B1A18", "#D67236", "#E6A0C4", "#C6CDF7", "#D8A499", "#7294D4"],
  },
  tenenbaums: {
    label: "Royal Tenenbaums",
    colors: ["#899DA4", "#C93312", "#FAEFD1", "#DC863B", "#9A8822", "#F5CDB4", "#F8AFA8", "#FDDDA0", "#74A089"],
  },
  fox: {
    label: "Fantastic Mr. Fox",
    colors: ["#DD8D29", "#E2D200", "#46ACC8", "#E58601", "#B40F20", "#F1BB7B", "#FD6467", "#5B1A18"],
  },
  moonrise: {
    label: "Moonrise Kingdom",
    colors: ["#F3DF6C", "#CEAB07", "#D5D5D3", "#24281A", "#798E87", "#C27D38", "#CCC591", "#29211F", "#85D4E3", "#F4B5BD", "#9C964A", "#CDC08C", "#FAD77B"],
  },
  bottlerocket: {
    label: "Bottle Rocket",
    colors: ["#A42820", "#5F5647", "#9B110E", "#3F5151", "#4E2A1E", "#550307", "#0C1707", "#FAD510", "#CB2314", "#273046", "#354823", "#1E1E1E"],
  },
  cavalcanti: {
    label: "Cavalcanti",
    colors: ["#D8B70A", "#02401B", "#A2A475", "#81A88D", "#972D15"],
  },
  isleofdogs: {
    label: "Isle of Dogs",
    colors: ["#9986A5", "#79402E", "#CCBA72", "#0F0D0E", "#D9D0D3", "#8D8680", "#EAD3BF", "#AA9486", "#B6854D", "#39312F", "#1C1718"],
  },
};

export const DEFAULT_THEME = "tableau";
export const NORMAL_CLONE_COLOR = "#9E9E9E";

export const themePalette = (theme) => (THEMES[theme] || THEMES[DEFAULT_THEME]).colors;

/** Colour for the k-th category of a theme (wraps). */
export const themeColor = (theme, k) => {
  const p = themePalette(theme);
  return p[((k % p.length) + p.length) % p.length];
};

/**
 * Recolour clone ids with a theme in their existing order; "Normal" stays
 * grey. `fixed` (clone -> colour from the dataset metadata) wins when the
 * theme is the default, so curated colours survive until a theme is chosen.
 */
export function cloneColorsForTheme(cloneIds, theme, fixed = {}) {
  const out = {};
  let k = 0;
  cloneIds.forEach((id) => {
    if (/^normal$/i.test(id)) {
      out[id] = NORMAL_CLONE_COLOR;
      return;
    }
    out[id] = theme === DEFAULT_THEME && fixed[id] ? fixed[id] : themeColor(theme, k);
    k += 1;
  });
  return out;
}
