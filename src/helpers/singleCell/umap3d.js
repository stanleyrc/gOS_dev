// 3-D embedding view maths: normalise a point cloud, orbit rotation,
// perspective-free (orthographic) projection and picking. d3-free.

/** Centre the cloud and scale its largest half-extent to 1. Returns { xyz: Float32Array, scale, center }. */
export function normalizeCloud(points) {
  const n = points.length;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  points.forEach((p) => {
    [p.x, p.y, p.z].forEach((v, a) => {
      if (v < lo[a]) lo[a] = v;
      if (v > hi[a]) hi[a] = v;
    });
  });
  const center = lo.map((l, a) => (l + hi[a]) / 2);
  const half = Math.max(1e-9, ...lo.map((l, a) => (hi[a] - l) / 2));
  const xyz = new Float32Array(n * 3);
  points.forEach((p, i) => {
    xyz[3 * i] = (p.x - center[0]) / half;
    xyz[3 * i + 1] = (p.y - center[1]) / half;
    xyz[3 * i + 2] = (p.z - center[2]) / half;
  });
  return { xyz, scale: half, center };
}

export const defaultView3d = () => ({ yaw: 0.6, pitch: -0.35, zoom: 1, panX: 0, panY: 0 });

const MAX_PITCH = Math.PI / 2 - 0.02;
export const MIN_Z3 = 0.4;
export const MAX_Z3 = 20;

/** Drag by (dx, dy) pixels rotates about the vertical (yaw) and horizontal (pitch) axes. */
export function orbit(view, dx, dy, speed = 0.008) {
  return {
    ...view,
    yaw: view.yaw + dx * speed,
    pitch: Math.max(-MAX_PITCH, Math.min(MAX_PITCH, view.pitch + dy * speed)),
  };
}

export function zoom3d(view, factor) {
  return { ...view, zoom: Math.max(MIN_Z3, Math.min(MAX_Z3, view.zoom * factor)) };
}

/** Row-major 3x3 rotation: yaw about y, then pitch about x. */
export function rotationMatrix(yaw, pitch) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  return [
    [cy, 0, sy],
    [sy * sp, cp, -cy * sp],
    [-sy * cp, sp, cy * cp],
  ];
}

/** Pixels per normalised unit for a plot box (the unit cube's diagonal fits). */
export const baseScale = (width, height) => 0.42 * Math.min(width, height);

/**
 * Orthographic projection of one normalised point: screen x, y (y down), and
 * depth (larger = nearer the viewer).
 */
export function projectPoint(view, x, y, z, width, height) {
  const R = rotationMatrix(view.yaw, view.pitch);
  const s = baseScale(width, height) * view.zoom;
  const rx = R[0][0] * x + R[0][1] * y + R[0][2] * z;
  const ry = R[1][0] * x + R[1][1] * y + R[1][2] * z;
  const rz = R[2][0] * x + R[2][1] * y + R[2][2] * z;
  return { sx: width / 2 + view.panX + rx * s, sy: height / 2 + view.panY - ry * s, depth: rz };
}

/** Project all points of a normalised xyz array; returns { sx, sy, depth } Float32Arrays. */
export function projectAll(view, xyz, width, height) {
  const n = xyz.length / 3;
  const sx = new Float32Array(n);
  const sy = new Float32Array(n);
  const depth = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const p = projectPoint(view, xyz[3 * i], xyz[3 * i + 1], xyz[3 * i + 2], width, height);
    sx[i] = p.sx;
    sy[i] = p.sy;
    depth[i] = p.depth;
  }
  return { sx, sy, depth };
}

/** Index of the projected point nearest (mx, my) within `radius` px, ties to the nearer one; -1 if none. */
export function pickPoint(proj, mx, my, radius = 8, skip = null) {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < proj.sx.length; i += 1) {
    if (skip && skip(i)) continue;
    const d = Math.hypot(proj.sx[i] - mx, proj.sy[i] - my);
    if (d > radius) continue;
    if (best < 0 || d < bestD - 0.5 || (d <= bestD + 0.5 && proj.depth[i] > proj.depth[best])) {
      best = i;
      bestD = d;
    }
  }
  return best;
}

/** CSS colour string (#rgb, #rrggbb, rgb(), rgba()) -> [r, g, b] in 0..1; null when unparseable. */
export function parseColor(css) {
  if (typeof css !== "string") return null;
  const s = css.trim();
  let m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) return [...m[1]].map((h) => parseInt(h + h, 16) / 255);
  m = /^#([0-9a-f]{6})/i.exec(s);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  m = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/i.exec(s);
  if (m) return [m[1], m[2], m[3]].map((v) => Math.min(255, Number(v)) / 255);
  return null;
}

/** Join 3-D coordinates (cells of umap3d.json) to ids; returns Map(rna_id -> {x,y,z}) of finite rows. */
export function indexUmap3d(data) {
  const map = new Map();
  (data?.cells || []).forEach((c) => {
    if (Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.z)) map.set(`${c.rna_id}`, { x: c.x, y: c.y, z: c.z });
  });
  return map;
}
