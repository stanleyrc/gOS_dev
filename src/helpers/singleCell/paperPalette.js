// The manuscript figures' palettes and type (srctools inst/paper_figures
// figlib.R, fig3_lib.R, fig4.R, fig5_lib.R, 2026-10-19 rebuild), for the
// "Paper" figure style of the gOS Paper figures view. d3-free.

export const PAPER_FONT = "Helvetica, 'Helvetica Neue', Arial, 'Liberation Sans', sans-serif";

export const PAPER_STATE = { AC: "#D4912A", MES: "#D62728", NPC: "#2C4AA8", OPC: "#1F9E4A", Normal: "#9E9E9E", NA: "#555555" };

export const PAPER_AMP = {
  MYCN: "#EBA51E",
  EGFR: "#1FA39B",
  CDK4: "#D62728",
  MDM2: "#D46BA9",
  PDGFRA: "#5B8DD6",
  MAP3K1: "#5F8F2E",
  RRAS2: "#B97A3C",
  SOX5: "#A8A21E",
  FOXO1: "#3F7F9F",
  "BRAF+EZH2+KMT2C": "#8C5A3C",
};
export const PAPER_COMBO = "#9B86BD";

// ecEGFR variants (Fig 4)
export const PAPER_EGFR = { long: "#2B6CA3", variant: "#8E3FA0", short: "#5BC8F0", shorter: "#2E9E3E", scar: "#D0262B", lost: "#B5172B", retained: "#1E6B34" };

// Clades: generic order (Fig 4: Clade 1 / Clade 2) and the named MGH303 clades (Fig 5)
export const PAPER_CLADE_SEQ = ["#3F51B5", "#3AA6A0", "#C4883A", "#8C2D6B", "#6B8E23"];
export const PAPER_CLADE_NAMED = { EC1: "#88171C", EC2: "#CF1E25", EC3: "#CD7256", CI: "#553E90", Normal: "#797B7C", Unassigned: "#C8C8C8" };
// display labels the paper uses for gOS clones (committee mapping 2026-10-12)
export const PAPER_CLADE_LABELS = {
  MGH303: { "Clone 1": "EC1", Clone1: "EC1", "Clone 2": "EC2", Clone2: "EC2", "Clone 3": "EC3", Clone3: "EC3", "Clone 4": "CI", Clone4: "CI" },
};

const NORMAL_RE = /^(normal|diploid)/i;

/** Clone id -> clade number (Clone1 / Clone 2 / clade_3 -> 1 / 2 / 3), else null. */
export function cloneNumber(clone) {
  const m = /(\d+)\s*$/.exec(`${clone ?? ""}`);
  return m ? Number(m[1]) : null;
}

/** The paper's label for a clone of a patient ("Clone 1" -> "Clade 1", MGH303 "Clone 4" -> "CI"). */
export function paperCladeLabel(patient, clone) {
  const s = `${clone ?? ""}`;
  const named = PAPER_CLADE_LABELS[patient]?.[s];
  if (named) return named;
  if (!s || NORMAL_RE.test(s)) return "Normal";
  const k = cloneNumber(s);
  return k != null ? `Clade ${k}` : s;
}

/**
 * Paper colours for a patient's clones: { clone: hex }. Named clades (EC1..CI)
 * use the Fig 5 colours, numbered ones the Fig 4 sequence, normal cells grey.
 */
export function paperCloneColors(patient, clones) {
  const out = {};
  const numbered = [...new Set(clones.map((c) => `${c}`))].filter((c) => !NORMAL_RE.test(c) && !PAPER_CLADE_NAMED[paperCladeLabel(patient, c)]);
  numbered.sort((a, b) => (cloneNumber(a) ?? 1e9) - (cloneNumber(b) ?? 1e9) || a.localeCompare(b));
  clones.forEach((c) => {
    const s = `${c}`;
    const lab = paperCladeLabel(patient, s);
    if (PAPER_CLADE_NAMED[lab]) out[s] = PAPER_CLADE_NAMED[lab];
    else if (NORMAL_RE.test(s)) out[s] = PAPER_CLADE_NAMED.Normal;
    else out[s] = PAPER_CLADE_SEQ[numbered.indexOf(s) % PAPER_CLADE_SEQ.length];
  });
  return out;
}

/** Paper colour of a cell state label ("AC", "AC-like", "MES1" ...), null when unknown. */
export function paperStateColor(state) {
  const s = `${state ?? ""}`.replace(/-like$/i, "").replace(/\d+$/, "");
  const key = Object.keys(PAPER_STATE).find((k) => k.toLowerCase() === s.toLowerCase());
  return key ? PAPER_STATE[key] : null;
}

/** Paper colour of an amplicon gene set ("EGFR", "CDK4+MDM2"): single genes their own colour, combinations lavender. */
export function paperAmpColor(key) {
  const k = `${key ?? ""}`.replace(/^ec/, "").replace(/[†]$/, "");
  return PAPER_AMP[k] || (k.includes("+") ? PAPER_COMBO : "#888888");
}

/** ecEGFR variant colour from a walk / group label (long, short, shorter, var), null otherwise. */
export function paperEgfrColor(label) {
  const s = `${label ?? ""}`.toLowerCase();
  if (!/egfr/.test(s)) return null;
  if (/shorter/.test(s)) return PAPER_EGFR.shorter;
  if (/var\d|_var/.test(s)) return PAPER_EGFR.variant;
  if (/short|^s/.test(s) || /\bsegfr/.test(s)) return PAPER_EGFR.short;
  if (/long|^w|wegfr/.test(s)) return PAPER_EGFR.long;
  return null;
}

const hexRgb = (h) => {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Piecewise-linear colour ramp: stops ascending, colours hex. Returns v -> [r, g, b] (clamped). */
export function ramp(stops, colors) {
  const rgb = colors.map(hexRgb);
  return (v) => {
    const x = Number(v);
    if (!Number.isFinite(x) || x <= stops[0]) return rgb[0].slice();
    const last = stops.length - 1;
    if (x >= stops[last]) return rgb[last].slice();
    let k = 0;
    while (x > stops[k + 1]) k += 1;
    const t = (x - stops[k]) / (stops[k + 1] - stops[k]);
    return rgb[k].map((c, i) => Math.round(c + t * (rgb[k + 1][i] - c)));
  };
}

export const rgbHex = ([r, g, b]) => `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase()}`;
/** Packed little-endian RGBA (ImageData via Uint32Array), opaque. */
export const rgbPacked = ([r, g, b]) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;

// total CN heatmap (Fig 4 CN_COLS): blue loss, purple-lavender baseline, orange-red gain, black at 100
export const PAPER_CN_STOPS = [0, 1, 2, 5, 20, 50, 100];
export const PAPER_CN_COLORS = ["#2C3E9C", "#A08BD0", "#FBE2B3", "#F7A13A", "#E3261C", "#930B0B", "#000000"];
// MGH303 chr12 heatmap (Fig 5 CN_CN): lavender baseline over 1-2.5
export const PAPER_CN5_STOPS = [0, 0.5, 1, 2.5, 3.5, 5, 10, 20, 50, 100];
export const PAPER_CN5_COLORS = ["#3C4CA8", "#726AB9", "#9F7FC7", "#9F7FC7", "#FDD99E", "#F7950F", "#EF3220", "#ED1C24", "#BE1D24", "#88171C"];
// amplicon copies 0-100 (Fig 5 AMP_CN)
export const PAPER_AMPCN_STOPS = [0, 2, 5, 13, 24, 34, 45, 66, 100];
export const PAPER_AMPCN_COLORS = ["#FFFFFF", "#FDE1B1", "#FBBA51", "#F78D10", "#F46A16", "#F1481C", "#EE2822", "#D51E25", "#88171C"];

export const paperCnRgb = ramp(PAPER_CN_STOPS, PAPER_CN_COLORS);
export const paperAmpCnRgb = ramp(PAPER_AMPCN_STOPS, PAPER_AMPCN_COLORS);
/** VAF 0-1: white -> black. */
export const paperVafRgb = ramp([0, 1], ["#FFFFFF", "#000000"]);

const CN_PACKED = new Uint32Array(257);
let cnPackedReady = false;
/** Packed RGBA of the paper CN ramp (0.5-CN steps to 128, cached), white for NaN. */
export function paperCnPacked(cn) {
  if (!cnPackedReady) {
    for (let k = 0; k < 256; k += 1) CN_PACKED[k] = rgbPacked(paperCnRgb(k * 0.5));
    CN_PACKED[256] = rgbPacked([255, 255, 255]);
    cnPackedReady = true;
  }
  const x = Number(cn);
  if (!Number.isFinite(x)) return CN_PACKED[256];
  return CN_PACKED[Math.max(0, Math.min(255, Math.round(x * 2)))];
}
export const paperCnCss = (cn) => rgbHex(paperCnRgb(cn));

// patient colours (figlib.R PAT_COL), in the cohort order
export const PAPER_PATIENT = { BWH69: "#8C1D1D", BWH70: "#B07A2B", BWH75: "#2E7D4F", MGH285: "#1B8F7A", MGH301: "#1F6F9F", MGH302: "#5A55A8", MGH303: "#B03A9A", MGH304: "#C0508E", MGH305: "#7A7A7A" };
// Fig 1d truncal-SNV strip
export const PAPER_TRUNCAL_COLORS = ["#3B2F8F", "#8E3B9F", "#D7307A", "#F0201A"];
