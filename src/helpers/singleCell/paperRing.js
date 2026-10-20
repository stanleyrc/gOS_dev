// d3-free geometry of the highlight rings / dots drawn over the paper figures: a mark at sidecar page point (x, y) pt, drawn at
// scales (kx, ky) px per pt, gets a box of `size` px centred exactly on it (no hand-tuned offsets, no border-box dependence).
import { toPage } from "./paperSidecar";

/** Box (px, relative to the sheet) of a ring of `size` px centred on the page point [x, y] pt. */
export function ringBox([x, y], kx, ky, size = 12) {
  return { left: x * kx - size / 2, top: y * ky - size / 2, width: size, height: size };
}

/** Centre (px) of a mark of a plot region at data (dx, dy), i.e. where the ring has to be centred. */
export function markCentre(region, dx, dy, kx, ky) {
  const [x, y] = toPage(region, dx, dy);
  return [x * kx, y * ky];
}

/** Centre of a box. */
export const boxCentre = (b) => [b.left + b.width / 2, b.top + b.height / 2];
