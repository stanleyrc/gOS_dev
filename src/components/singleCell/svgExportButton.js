import React from "react";
import { Dropdown, Tooltip } from "antd";
import { AiOutlineDownload } from "react-icons/ai";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Clone of an <svg> with namespaces, explicit size and a font rule, ready to serialise. */
function prepareSvg(svg) {
  const clone = svg.cloneNode(true);
  clone.setAttribute("xmlns", SVG_NS);
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  const rect = svg.getBoundingClientRect();
  if (!clone.getAttribute("width")) clone.setAttribute("width", rect.width);
  if (!clone.getAttribute("height")) clone.setAttribute("height", rect.height);
  // Colours set by the theme's CSS (dark mode re-tints fixed fills) live
  // only in computed styles: bake them in so the file matches the screen.
  const src = svg.querySelectorAll("*");
  const dst = clone.querySelectorAll("*");
  for (let i = 0; i < src.length && i < dst.length; i += 1) {
    const cs = window.getComputedStyle(src[i]);
    if (dst[i].hasAttribute("fill") && cs.fill) dst[i].setAttribute("fill", cs.fill);
    if (dst[i].hasAttribute("stroke") && cs.stroke) dst[i].setAttribute("stroke", cs.stroke);
  }
  const style = document.createElementNS(SVG_NS, "style");
  style.textContent = "text { font-family: -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; }";
  clone.insertBefore(style, clone.firstChild);
  return clone;
}

const trigger = (href, filename) => {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
};

/** Serialise an <svg> (inline styles kept, fonts set) and download it. */
export function downloadSvg(svg, name = "plot") {
  if (!svg) return;
  const blob = new Blob([new XMLSerializer().serializeToString(prepareSvg(svg))], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  trigger(url, `${name}.svg`);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Rasterise an <svg> to PNG. `scale` multiplies the on-screen size; `widthPx`
 * instead fixes the output width (e.g. a journal column at 300 dpi). The
 * background is the page background unless `transparent`.
 */
export function downloadSvgAsPng(svg, name = "plot", { scale = 2, widthPx = null, transparent = false } = {}) {
  if (!svg) return;
  const rect = svg.getBoundingClientRect();
  const w = Number(svg.getAttribute("width")) || rect.width;
  const h = Number(svg.getAttribute("height")) || rect.height;
  const factor = widthPx ? widthPx / w : scale;
  const clone = prepareSvg(svg);
  clone.setAttribute("width", w);
  clone.setAttribute("height", h);
  if (!clone.getAttribute("viewBox")) clone.setAttribute("viewBox", `0 0 ${w} ${h}`);
  const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * factor);
    canvas.height = Math.round(h * factor);
    const ctx = canvas.getContext("2d");
    if (!transparent) {
      ctx.fillStyle = getComputedStyle(document.body).backgroundColor || "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    trigger(canvas.toDataURL("image/png"), `${name}.png`);
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

/** Download a canvas as PNG. */
export function downloadCanvas(canvas, name = "plot") {
  if (!canvas) return;
  trigger(canvas.toDataURL("image/png"), `${name}.png`);
}

// mm at 300 dpi
const MM_300 = (mm) => Math.round((mm / 25.4) * 300);
const PRESETS = [
  { key: "svg", label: "SVG (vector)" },
  { key: "png2", label: "PNG ×2", png: { scale: 2 } },
  { key: "png4", label: "PNG ×4", png: { scale: 4 } },
  { key: "col1", label: "PNG single column (89 mm, 300 dpi)", png: { widthPx: MM_300(89) } },
  { key: "col2", label: "PNG double column (183 mm, 300 dpi)", png: { widthPx: MM_300(183) } },
  { key: "pngt", label: "PNG ×3, transparent", png: { scale: 3, transparent: true } },
];

/**
 * Download menu for a card: exports every <svg> inside `containerRef` (one
 * file each, numbered when several) as SVG or PNG at a preset size, and any
 * <canvas> as PNG. The button itself exports SVG.
 */
export default function SvgExportButton({ containerRef, name = "plot", title = "Download figure" }) {
  const run = (key) => {
    const root = containerRef?.current;
    if (!root) return;
    const preset = PRESETS.find((p) => p.key === key) || PRESETS[0];
    const svgs = [...root.querySelectorAll("svg")].filter((s) => s.getBoundingClientRect().width > 40);
    svgs.forEach((s, i) => {
      const file = svgs.length > 1 ? `${name}-${i + 1}` : name;
      if (preset.png) downloadSvgAsPng(s, file, preset.png);
      else downloadSvg(s, file);
    });
    [...root.querySelectorAll("canvas")].forEach((c, i) => downloadCanvas(c, `${name}-canvas-${i + 1}`));
  };
  return (
    <Tooltip title={title}>
      <Dropdown.Button size="small" trigger={["click"]} onClick={() => run("svg")} menu={{ items: PRESETS.map((p) => ({ key: p.key, label: p.label })), onClick: ({ key }) => run(key) }}>
        <AiOutlineDownload />
      </Dropdown.Button>
    </Tooltip>
  );
}
