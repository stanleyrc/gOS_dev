import React from "react";
import { Button, Tooltip } from "antd";
import { AiOutlineDownload } from "react-icons/ai";

/** Serialise an <svg> (inline styles kept, fonts set) and download it. */
export function downloadSvg(svg, name = "plot") {
  if (!svg) return;
  const clone = svg.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  if (!clone.getAttribute("width")) clone.setAttribute("width", svg.getBoundingClientRect().width);
  if (!clone.getAttribute("height")) clone.setAttribute("height", svg.getBoundingClientRect().height);
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = "text { font-family: -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; }";
  clone.insertBefore(style, clone.firstChild);
  const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.svg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Download a canvas as PNG. */
export function downloadCanvas(canvas, name = "plot") {
  if (!canvas) return;
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `${name}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Download button for a card: exports every <svg> inside `containerRef`
 * (one file each, numbered when several) and any <canvas> as PNG.
 */
export default function SvgExportButton({ containerRef, name = "plot", title = "Download as SVG / PNG" }) {
  const onClick = () => {
    const root = containerRef?.current;
    if (!root) return;
    const svgs = [...root.querySelectorAll("svg")].filter((s) => s.getBoundingClientRect().width > 40);
    svgs.forEach((s, i) => downloadSvg(s, svgs.length > 1 ? `${name}-${i + 1}` : name));
    [...root.querySelectorAll("canvas")].forEach((c, i) => downloadCanvas(c, `${name}-canvas-${i + 1}`));
  };
  return (
    <Tooltip title={title}>
      <Button size="small" icon={<AiOutlineDownload />} onClick={onClick} />
    </Tooltip>
  );
}
