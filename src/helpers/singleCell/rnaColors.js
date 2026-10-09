// Colour ramps for the RNA fusion / splicing views (d3-free, so the helpers
// using them stay unit-testable). Inputs are clamped to [0, 1].

const READS_STOPS = ["#fdd49e", "#fc8d59", "#e34a33", "#b30000", "#7f0000"]; // OrRd
const PSI_STOPS = ["#f7fbff", "#c6dbef", "#6baed6", "#2171b5", "#08306b"]; // Blues

const hex = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
const toHex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

/** Piecewise-linear interpolation through hex stops. */
export function ramp(stops, t) {
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)) * (stops.length - 1);
  const k = Math.min(stops.length - 2, Math.floor(x));
  const a = hex(stops[k]);
  const b = hex(stops[k + 1]);
  const f = x - k;
  return toHex(a.map((v, i) => v + (b[i] - v) * f));
}

/** Read support (1 .. max reads, square-root scaled) as an orange-red ramp. */
export const readsColor = (reads, max) => ramp(READS_STOPS, max > 1 ? Math.sqrt((reads - 1) / (max - 1)) : 1);
/** Junction usage (PSI 0..1) as a blue ramp. */
export const psiColor = (p) => ramp(PSI_STOPS, p);
/** Text colour readable on a PSI cell. */
export const psiTextColor = (p) => (Number.isFinite(p) && p > 0.55 ? "#ffffff" : "#262626");
export const NO_RNA_COLOR = "rgba(0,0,0,0.04)";
export const NO_READS_COLOR = "rgba(0,0,0,0.14)";
export const ALT_COLOR = "#d6604d";
export const REF_COLOR = "#4393c3";
/** One colour per junction of a cluster, the same in every group / patient panel. */
export const JUNCTION_COLORS = ["#4E79A7", "#F28E2B", "#59A14F", "#E15759", "#76B7B2", "#B07AA1", "#EDC948", "#FF9DA7", "#9C755F", "#BAB0AC"];
export const junctionColor = (j) => JUNCTION_COLORS[j % JUNCTION_COLORS.length];
