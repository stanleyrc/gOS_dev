// Zoom / pan maths for 2-D embedding plots. A view is { k, x, y }: a screen
// position is data * k + (x, y), where "data" is the plot's base layout in
// pixels. d3-free so jest can run it.

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 40;

export const identityView = () => ({ k: 1, x: 0, y: 0 });

export const isIdentity = (view) => view.k === 1 && view.x === 0 && view.y === 0;

/** Data (base layout) point -> screen point. */
export const toScreen = (view, px, py) => [px * view.k + view.x, py * view.k + view.y];

/** Screen point -> data (base layout) point. */
export const toData = (view, sx, sy) => [(sx - view.x) / view.k, (sy - view.y) / view.k];

/**
 * Keep the plot box covered: with k >= 1 the content may not leave a gap at
 * any edge (translation limited to [w(1-k), 0] and [h(1-k), 0]).
 */
export function clampView(view, width, height) {
  const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.k));
  const lim = (size) => [size * (1 - k), 0];
  const [xlo, xhi] = lim(width);
  const [ylo, yhi] = lim(height);
  return { k, x: Math.min(xhi, Math.max(xlo, view.x)), y: Math.min(yhi, Math.max(ylo, view.y)) };
}

/** Multiply the zoom by `factor` keeping the data under screen point (sx, sy) fixed. */
export function zoomAt(view, sx, sy, factor, width, height) {
  const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.k * factor));
  const f = k / view.k;
  return clampView({ k, x: sx - (sx - view.x) * f, y: sy - (sy - view.y) * f }, width, height);
}

/** Zoom factor of one wheel event (deltaMode 1 = lines); ctrl (pinch) zooms faster. */
export function wheelFactor(deltaY, { deltaMode = 0, ctrl = false } = {}) {
  const px = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  const rate = ctrl ? 0.01 : 0.0018;
  return Math.exp(-Math.max(-400, Math.min(400, px)) * rate);
}

export function panBy(view, dx, dy, width, height) {
  return clampView({ k: view.k, x: view.x + dx, y: view.y + dy }, width, height);
}

/** Point radius at zoom k: grows with sqrt(k), capped so dense plots stay readable. */
export function zoomRadius(base, k, maxFactor = 3) {
  return base * Math.min(maxFactor, Math.max(1, Math.sqrt(k)));
}

/** View that fits the screen box [x0,y0,x1,y1] into the plot (for box-zoom). */
export function viewForBox(box, width, height) {
  const w = Math.max(1e-6, Math.abs(box[2] - box[0]));
  const h = Math.max(1e-6, Math.abs(box[3] - box[1]));
  const k = Math.min(MAX_ZOOM, Math.min(width / w, height / h));
  const cx = (box[0] + box[2]) / 2;
  const cy = (box[1] + box[3]) / 2;
  return clampView({ k, x: width / 2 - cx * k, y: height / 2 - cy * k }, width, height);
}
