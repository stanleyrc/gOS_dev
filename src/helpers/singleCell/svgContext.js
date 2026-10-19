// A recording stand-in for CanvasRenderingContext2D that writes SVG, so the
// canvas-drawn Paper figure panels export as vector files (text stays text,
// lines and marks stay paths; prebuilt heatmap bitmaps are embedded as images,
// as in the manuscript PDFs). Covers the subset of the canvas API the figure
// panels use. d3-free; DOM only for measuring text and encoding bitmaps.

const esc = (s) => `${s}`.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (v) => {
  const x = Math.round(Number(v) * 100) / 100;
  return Number.isFinite(x) ? `${x}` : "0";
};

/** Split a CSS colour into an SVG paint and opacity (rgba() -> rgb() + opacity, which Illustrator reads). */
export function svgPaint(color) {
  const s = `${color ?? ""}`.trim();
  const m = /^rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/i.exec(s);
  if (m) return { paint: `rgb(${Math.round(m[1])},${Math.round(m[2])},${Math.round(m[3])})`, opacity: Number(m[4]) };
  const h = /^#([0-9a-f]{8})$/i.exec(s);
  if (h) return { paint: `#${h[1].slice(0, 6)}`, opacity: parseInt(h[1].slice(6), 16) / 255 };
  if (!s || s === "transparent") return { paint: "none", opacity: 1 };
  return { paint: s, opacity: 1 };
}

/** Parse a canvas font string: "italic 600 11.5px Helvetica, Arial" -> { style, weight, size, family }. */
export function parseFont(font) {
  const m = /^\s*(italic\s+|oblique\s+)?(?:(normal|bold|\d{3})\s+)?([\d.]+)px\s+(.+)$/i.exec(`${font ?? ""}`);
  if (!m) return { style: "normal", weight: "400", size: 10, family: "sans-serif" };
  return { style: m[1] ? "italic" : "normal", weight: m[2] === "bold" ? "700" : m[2] || "400", size: Number(m[3]), family: m[4].trim() };
}

const ANCHOR = { left: "start", start: "start", center: "middle", right: "end", end: "end" };
const BASELINE = { top: "text-before-edge", hanging: "text-before-edge", middle: "central", bottom: "text-after-edge", ideographic: "text-after-edge", alphabetic: "auto" };

const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const IDENTITY = [1, 0, 0, 1, 0, 0];

let measurer = null;
function measureWidth(font, text) {
  if (measurer === null) {
    try {
      measurer = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : false;
    } catch (e) {
      measurer = false;
    }
  }
  if (measurer) {
    measurer.font = font;
    return measurer.measureText(text).width;
  }
  return `${text}`.length * parseFont(font).size * 0.55;
}

/** Default bitmap encoder: a canvas / image (cropped to sx, sy, sw, sh) as a PNG data URL, or null. */
function defaultImageUrl(img, sx, sy, sw, sh) {
  if (typeof document === "undefined" || !img) return null;
  try {
    const full = sx === 0 && sy === 0 && sw === img.width && sh === img.height;
    if (full && typeof img.toDataURL === "function") return img.toDataURL("image/png");
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(sw));
    cv.height = Math.max(1, Math.round(sh));
    const c = cv.getContext("2d");
    c.imageSmoothingEnabled = false;
    c.drawImage(img, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    return cv.toDataURL("image/png");
  } catch (e) {
    return null;
  }
}

export default class SvgContext {
  constructor(width, height, { imageUrl = defaultImageUrl, background = null } = {}) {
    this.width = width;
    this.height = height;
    this.canvas = { width, height };
    this.imageUrl = imageUrl;
    this.background = background;
    this.out = [];
    this.defs = [];
    this.ids = 0;
    this.stack = [];
    this.path = [];
    this.cur = null; // current point (local coordinates)
    this.start = null;
    Object.assign(this, {
      fillStyle: "#000000",
      strokeStyle: "#000000",
      lineWidth: 1,
      font: "10px sans-serif",
      textAlign: "start",
      textBaseline: "alphabetic",
      globalAlpha: 1,
      lineJoin: "miter",
      lineCap: "butt",
      imageSmoothingEnabled: true,
    });
    this.dash = [];
    this.m = IDENTITY.slice();
    this.clipId = null;
  }

  // ---- state
  save() {
    const { fillStyle, strokeStyle, lineWidth, font, textAlign, textBaseline, globalAlpha, lineJoin, lineCap, dash, m, clipId } = this;
    this.stack.push({ fillStyle, strokeStyle, lineWidth, font, textAlign, textBaseline, globalAlpha, lineJoin, lineCap, dash: dash.slice(), m: m.slice(), clipId });
  }

  restore() {
    const s = this.stack.pop();
    if (s) Object.assign(this, s);
  }

  setLineDash(d) {
    this.dash = Array.isArray(d) ? d.slice() : [];
  }

  getLineDash() {
    return this.dash.slice();
  }

  // ---- transforms
  setTransform(a = 1, b = 0, c = 0, d = 1, e = 0, f = 0) {
    this.m = typeof a === "object" ? [a.a, a.b, a.c, a.d, a.e, a.f] : [a, b, c, d, e, f];
  }

  resetTransform() {
    this.m = IDENTITY.slice();
  }

  transform(a, b, c, d, e, f) {
    this.m = mul(this.m, [a, b, c, d, e, f]);
  }

  translate(x, y) {
    this.transform(1, 0, 0, 1, x, y);
  }

  scale(x, y) {
    this.transform(x, 0, 0, y, 0, 0);
  }

  rotate(a) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    this.transform(c, s, -s, c, 0, 0);
  }

  // ---- paths (kept in local coordinates; elements carry the matrix)
  beginPath() {
    this.path = [];
    this.cur = null;
    this.start = null;
  }

  moveTo(x, y) {
    this.path.push(`M${num(x)} ${num(y)}`);
    this.cur = [x, y];
    this.start = [x, y];
  }

  lineTo(x, y) {
    if (!this.cur) return this.moveTo(x, y);
    this.path.push(`L${num(x)} ${num(y)}`);
    this.cur = [x, y];
    return undefined;
  }

  closePath() {
    if (!this.path.length) return;
    this.path.push("Z");
    if (this.start) this.cur = this.start.slice();
  }

  rect(x, y, w, h) {
    this.moveTo(x, y);
    this.path.push(`h${num(w)}v${num(h)}h${num(-w)}Z`);
    this.cur = [x, y];
  }

  quadraticCurveTo(cx, cy, x, y) {
    if (!this.cur) this.moveTo(cx, cy);
    this.path.push(`Q${num(cx)} ${num(cy)} ${num(x)} ${num(y)}`);
    this.cur = [x, y];
  }

  bezierCurveTo(c1x, c1y, c2x, c2y, x, y) {
    if (!this.cur) this.moveTo(c1x, c1y);
    this.path.push(`C${num(c1x)} ${num(c1y)} ${num(c2x)} ${num(c2y)} ${num(x)} ${num(y)}`);
    this.cur = [x, y];
  }

  ellipse(x, y, rx, ry, rot, a0, a1, ccw = false) {
    const pt = (a) => {
      const c = Math.cos(rot);
      const s = Math.sin(rot);
      const px = rx * Math.cos(a);
      const py = ry * Math.sin(a);
      return [x + px * c - py * s, y + px * s + py * c];
    };
    let d = a1 - a0;
    const TAU = 2 * Math.PI;
    const full = Math.abs(d) >= TAU - 1e-9;
    if (!full) {
      if (!ccw) d = ((d % TAU) + TAU) % TAU;
      else d = -((((a0 - a1) % TAU) + TAU) % TAU);
    }
    const p0 = pt(a0);
    if (this.cur) this.lineTo(p0[0], p0[1]);
    else this.moveTo(p0[0], p0[1]);
    const rdeg = num((rot * 180) / Math.PI);
    const sweep = ccw ? 0 : 1;
    if (full) {
      const mid = pt(a0 + (ccw ? -Math.PI : Math.PI));
      this.path.push(`A${num(rx)} ${num(ry)} ${rdeg} 0 ${sweep} ${num(mid[0])} ${num(mid[1])}`);
      this.path.push(`A${num(rx)} ${num(ry)} ${rdeg} 0 ${sweep} ${num(p0[0])} ${num(p0[1])}`);
      this.cur = p0;
      return;
    }
    const p1 = pt(a0 + d);
    this.path.push(`A${num(rx)} ${num(ry)} ${rdeg} ${Math.abs(d) > Math.PI ? 1 : 0} ${sweep} ${num(p1[0])} ${num(p1[1])}`);
    this.cur = p1;
  }

  arc(x, y, r, a0, a1, ccw = false) {
    this.ellipse(x, y, r, r, 0, a0, a1, ccw);
  }

  arcTo(x1, y1, x2, y2, r) {
    const p0 = this.cur || [x1, y1];
    const v1 = [p0[0] - x1, p0[1] - y1];
    const v2 = [x2 - x1, y2 - y1];
    const l1 = Math.hypot(...v1);
    const l2 = Math.hypot(...v2);
    if (!(l1 > 0 && l2 > 0 && r > 0)) return this.lineTo(x1, y1);
    const u1 = [v1[0] / l1, v1[1] / l1];
    const u2 = [v2[0] / l2, v2[1] / l2];
    const cos = Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1]));
    const theta = Math.acos(cos);
    if (theta < 1e-6 || Math.abs(Math.PI - theta) < 1e-6) return this.lineTo(x1, y1);
    const dist = r / Math.tan(theta / 2);
    const t1 = [x1 + u1[0] * dist, y1 + u1[1] * dist];
    const t2 = [x1 + u2[0] * dist, y1 + u2[1] * dist];
    const cross = u1[0] * u2[1] - u1[1] * u2[0];
    this.lineTo(t1[0], t1[1]);
    this.path.push(`A${num(r)} ${num(r)} 0 0 ${cross > 0 ? 0 : 1} ${num(t2[0])} ${num(t2[1])}`);
    this.cur = t2;
    return undefined;
  }

  clip() {
    if (!this.path.length) return;
    const id = `clip${(this.ids += 1)}`;
    const inner = this.clipId ? ` clip-path="url(#${this.clipId})"` : "";
    this.defs.push(`<clipPath id="${id}"${inner}><path d="${this.path.join("")}"${this.mAttr()}/></clipPath>`);
    this.clipId = id;
  }

  // ---- painting
  mAttr() {
    const m = this.m;
    if (m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0) return "";
    if (m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1) return ` transform="translate(${num(m[4])} ${num(m[5])})"`;
    return ` transform="matrix(${m.map((v) => Math.round(v * 1e4) / 1e4).join(" ")})"`;
  }

  paintAttr(kind) {
    const style = kind === "fill" ? this.fillStyle : this.strokeStyle;
    let paint;
    let opacity = 1;
    if (style && typeof style === "object" && style.svgId) paint = `url(#${style.svgId})`;
    else ({ paint, opacity } = svgPaint(style));
    const a = opacity * this.globalAlpha;
    const op = a < 1 ? ` ${kind}-opacity="${num(a)}"` : "";
    if (kind === "fill") return ` fill="${paint}"${op}`;
    const dash = this.dash.length ? ` stroke-dasharray="${this.dash.map(num).join(" ")}"` : "";
    const join = this.lineJoin !== "miter" ? ` stroke-linejoin="${this.lineJoin}"` : "";
    const cap = this.lineCap !== "butt" ? ` stroke-linecap="${this.lineCap}"` : "";
    return ` fill="none" stroke="${paint}" stroke-width="${num(this.lineWidth)}"${op}${dash}${join}${cap}`;
  }

  emit(el) {
    this.out.push(this.clipId ? `<g clip-path="url(#${this.clipId})">${el}</g>` : el);
  }

  fill() {
    if (this.path.length) this.emit(`<path d="${this.path.join("")}"${this.paintAttr("fill")}${this.mAttr()}/>`);
  }

  stroke() {
    if (this.path.length) this.emit(`<path d="${this.path.join("")}"${this.paintAttr("stroke")}${this.mAttr()}/>`);
  }

  fillRect(x, y, w, h) {
    if (!(w && h)) return;
    const [rx, rw] = w < 0 ? [x + w, -w] : [x, w];
    const [ry, rh] = h < 0 ? [y + h, -h] : [y, h];
    this.emit(`<rect x="${num(rx)}" y="${num(ry)}" width="${num(rw)}" height="${num(rh)}"${this.paintAttr("fill")}${this.mAttr()}/>`);
  }

  strokeRect(x, y, w, h) {
    this.emit(`<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}"${this.paintAttr("stroke")}${this.mAttr()}/>`);
  }

  clearRect() {}

  measureText(text) {
    return { width: measureWidth(this.font, text) };
  }

  textAttrs() {
    const f = parseFont(this.font);
    const anchor = ANCHOR[this.textAlign] || "start";
    const base = BASELINE[this.textBaseline] || "auto";
    return ` font-family="${esc(f.family)}" font-size="${num(f.size)}"${f.weight !== "400" ? ` font-weight="${f.weight}"` : ""}${f.style !== "normal" ? ` font-style="${f.style}"` : ""}${anchor !== "start" ? ` text-anchor="${anchor}"` : ""}${base !== "auto" ? ` dominant-baseline="${base}"` : ""}`;
  }

  fillText(text, x, y) {
    if (text === null || text === undefined || `${text}` === "") return;
    this.emit(`<text x="${num(x)}" y="${num(y)}"${this.textAttrs()}${this.paintAttr("fill")}${this.mAttr()} xml:space="preserve">${esc(text)}</text>`);
  }

  strokeText(text, x, y) {
    this.emit(`<text x="${num(x)}" y="${num(y)}"${this.textAttrs()}${this.paintAttr("stroke")}${this.mAttr()}>${esc(text)}</text>`);
  }

  createLinearGradient(x0, y0, x1, y1) {
    const id = `grad${(this.ids += 1)}`;
    const stops = [];
    const ctx = this;
    const g = {
      svgId: id,
      addColorStop(o, color) {
        const { paint, opacity } = svgPaint(color);
        stops.push(`<stop offset="${num(o)}" stop-color="${paint}"${opacity < 1 ? ` stop-opacity="${num(opacity)}"` : ""}/>`);
      },
      toString: () => `url(#${id})`,
    };
    // defs are serialised at the end, so stops added after creation are kept
    this.defs.push({ render: () => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${num(x0)}" y1="${num(y0)}" x2="${num(x1)}" y2="${num(y1)}"${ctx.mAttr().replace("transform", "gradientTransform")}>${stops.join("")}</linearGradient>` });
    return g;
  }

  createImageData(w, h) {
    return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  }

  putImageData(img, dx, dy) {
    if (typeof document === "undefined") return;
    try {
      const cv = document.createElement("canvas");
      cv.width = img.width;
      cv.height = img.height;
      const c = cv.getContext("2d");
      const id = c.createImageData(img.width, img.height);
      id.data.set(img.data);
      c.putImageData(id, 0, 0);
      const m = this.m;
      this.m = IDENTITY.slice();
      this.drawImage(cv, dx, dy);
      this.m = m;
    } catch (e) {
      // no bitmap support (tests)
    }
  }

  drawImage(img, ...a) {
    if (!img) return;
    const iw = img.width || 0;
    const ih = img.height || 0;
    let [sx, sy, sw, sh, dx, dy, dw, dh] = [0, 0, iw, ih, 0, 0, iw, ih];
    if (a.length === 2) [dx, dy] = a;
    else if (a.length === 4) [dx, dy, dw, dh] = a;
    else if (a.length >= 8) [sx, sy, sw, sh, dx, dy, dw, dh] = a;
    const url = this.imageUrl(img, sx, sy, sw, sh);
    if (!url) return;
    const op = this.globalAlpha < 1 ? ` opacity="${num(this.globalAlpha)}"` : "";
    this.emit(`<image x="${num(dx)}" y="${num(dy)}" width="${num(dw)}" height="${num(dh)}" preserveAspectRatio="none" image-rendering="optimizeSpeed" style="image-rendering:pixelated" href="${url}" xlink:href="${url}"${op}${this.mAttr()}/>`);
  }

  /**
   * The recorded drawing as an SVG document. `pt` (default 0.75) sets the
   * printed size: CSS px x 0.75 = points, so the file opens at the figure's
   * size on screen in Illustrator / Inkscape.
   */
  toSvg({ pt = 0.75, title = "" } = {}) {
    const defs = this.defs.map((d) => (typeof d === "string" ? d : d.render())).join("");
    const bg = this.background ? `<rect width="${num(this.width)}" height="${num(this.height)}" fill="${this.background}"/>` : "";
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="${num(this.width * pt)}pt" height="${num(this.height * pt)}pt" viewBox="0 0 ${num(this.width)} ${num(this.height)}">` +
      `${title ? `<title>${esc(title)}</title>` : ""}${defs ? `<defs>${defs}</defs>` : ""}${bg}${this.out.join("")}</svg>`
    );
  }
}
