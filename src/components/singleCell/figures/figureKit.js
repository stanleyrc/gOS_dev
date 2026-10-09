import React from "react";
import { FONT_FAMILY } from "../../../helpers/singleCell/plotTheme";
import { formatTick, styleFontSize, styleFontWeight } from "../../../helpers/singleCell/figureStyle";

// Canvas drawing pieces shared by the Paper figures, all driven by the
// figure style (c.st) and colour tokens (c) that FigureCanvas passes to draw():
// text roles, a value axis, group bands / rules, reference lines, markers.

/** Set ctx.font / fillStyle for a text role (tick, label, group, head, caption, title). */
export function textRole(ctx, c, role, ink) {
  const st = c.st;
  const italic = role === "caption" && st.captionItalic ? "italic " : "";
  ctx.font = `${italic}${styleFontWeight(st, role)} ${styleFontSize(st, role)}px ${FONT_FAMILY}`;
  ctx.fillStyle = c[ink || { tick: st.tickInk, label: "textSecondary", group: "text", head: "textSecondary", caption: "muted", title: "text" }[role] || "text"] || c.text;
}

const crisp = (v) => Math.round(v) + 0.5;

/**
 * Horizontal value axis. ticks: [{ v, x }] (x already scaled). `y` is the
 * baseline; labels go above it when at === "top", below otherwise. Grid lines
 * (style permitting) run from gridFrom to gridTo.
 */
export function drawXAxis(ctx, c, { ticks, x0, x1, y, at = "top", title, gridFrom, gridTo, format = formatTick, percent = false }) {
  const st = c.st;
  if (st.grid !== "none" && gridFrom != null && gridTo != null) {
    ctx.strokeStyle = c.grid;
    ctx.lineWidth = 1;
    ctx.setLineDash(st.gridDash || []);
    ticks.forEach(({ x }) => {
      ctx.beginPath();
      ctx.moveTo(crisp(x), gridFrom);
      ctx.lineTo(crisp(x), gridTo);
      ctx.stroke();
    });
    ctx.setLineDash([]);
  }
  const dir = at === "top" ? -1 : 1;
  ctx.strokeStyle = c[st.axisInk] || c.axis;
  ctx.lineWidth = st.axisWidth;
  if (st.axisLine) {
    ctx.beginPath();
    ctx.moveTo(x0, crisp(y));
    ctx.lineTo(x1, crisp(y));
    ctx.stroke();
  }
  if (st.tickLen > 0) {
    ticks.forEach(({ x }) => {
      ctx.beginPath();
      ctx.moveTo(crisp(x), y);
      ctx.lineTo(crisp(x), y + dir * st.tickLen);
      ctx.stroke();
    });
  }
  ctx.lineWidth = 1;
  textRole(ctx, c, "tick");
  ctx.textAlign = "center";
  ctx.textBaseline = at === "top" ? "bottom" : "top";
  const gap = st.tickLen + 2;
  ticks.forEach(({ v, x, label }) => ctx.fillText(label ?? format(v, { percent }), x, y + dir * gap));
  if (title) {
    textRole(ctx, c, "head");
    const th = styleFontSize(st, "tick") + gap + 3;
    ctx.fillText(title, (x0 + x1) / 2, y + dir * th);
  }
  ctx.textBaseline = "middle";
}

/** Height an axis with `title` needs on its label side. */
export function axisDepth(c, title) {
  const st = c?.st;
  if (!st) return title ? 34 : 18;
  return st.tickLen + 2 + styleFontSize(st, "tick") + (title ? styleFontSize(st, "head") + 5 : 0) + 2;
}

/** Group backgrounds or separators: groups [{ y0, y1 }], drawn across [x0, x1]. */
export function drawGroups(ctx, c, groups, x0, x1) {
  const st = c.st;
  groups.forEach((g, i) => {
    if (st.bands && i % 2 === 0) {
      ctx.fillStyle = c.band;
      ctx.fillRect(x0, g.y0, x1 - x0, g.y1 - g.y0);
    }
    if (st.groupRule && i > 0) {
      ctx.strokeStyle = c.borderSoft || c.grid;
      ctx.beginPath();
      ctx.moveTo(x0, crisp(g.y0));
      ctx.lineTo(x1, crisp(g.y0));
      ctx.stroke();
    }
  });
}

/** Vertical reference line (e.g. z = 1.96) with an optional small label at the top. */
export function drawRefLine(ctx, c, x, y0, y1, label) {
  const st = c.st;
  ctx.strokeStyle = c[st.refInk] || c.muted;
  ctx.setLineDash(st.refDash || []);
  ctx.beginPath();
  ctx.moveTo(crisp(x), y0);
  ctx.lineTo(crisp(x), y1);
  ctx.stroke();
  ctx.setLineDash([]);
  if (label) {
    textRole(ctx, c, "caption", st.refInk);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(label, x + 3, y0 + 1);
    ctx.textBaseline = "middle";
  }
}

/** A marker: shape "circle" | "square" | "diamond", haloed with the panel colour. */
export function drawMarker(ctx, c, x, y, color, shape = "circle", r = c.st.markerR) {
  ctx.beginPath();
  if (shape === "square") ctx.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7);
  else if (shape === "diamond") {
    ctx.moveTo(x, y - r * 1.15);
    ctx.lineTo(x + r * 1.15, y);
    ctx.lineTo(x, y + r * 1.15);
    ctx.lineTo(x - r * 1.15, y);
    ctx.closePath();
  } else ctx.arc(x, y, r, 0, 2 * Math.PI);
  ctx.fillStyle = color;
  ctx.fill();
  if (c.st.markerHalo > 0) {
    ctx.lineWidth = c.st.markerHalo;
    ctx.strokeStyle = c.panel;
    ctx.stroke();
    ctx.lineWidth = 1;
  }
}

/** A horizontal bar with the style's corner radius. */
export function drawBar(ctx, c, x, y, w, h, color) {
  ctx.fillStyle = color;
  const r = Math.min(c.st.barRadius, h / 2, Math.max(0, w) / 2);
  if (r <= 0 || w <= 0) {
    ctx.fillRect(x, y, Math.max(0, w), h);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.fill();
}

/**
 * Compact legend under a figure: small swatches / markers, muted labels,
 * optional group title. items: [{ key, color, label, shape }].
 */
export function FigureLegend({ items, title, style }) {
  return (
    <div className="sc-fig-legend" style={style}>
      {title && <span className="sc-fig-legend-title">{title}</span>}
      {items.map(({ key, color, label, shape = "circle" }) => (
        <span key={key} className="sc-fig-legend-item">
          <svg width={10} height={10} aria-hidden="true" style={{ flex: "none" }}>
            {shape === "square" ? <rect x={1} y={1} width={8} height={8} fill={color} /> : shape === "bar" ? <rect x={0} y={2} width={10} height={6} rx={1} fill={color} /> : <circle cx={5} cy={5} r={4} fill={color} />}
          </svg>
          {label}
        </span>
      ))}
    </div>
  );
}
