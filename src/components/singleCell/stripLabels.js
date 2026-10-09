import React from "react";

// a compact header: long field names are cut with an ellipsis (full name on hover)
export const STRIP_LABEL_MAX = 60;
export const STRIP_LABEL_MIN = 24;

/** Label font size for a strip column width: 10-12 px. */
export function stripLabelFont(columnWidth) {
  return Math.max(10, Math.min(12, columnWidth - 2));
}

/**
 * Header height that fits the longest label (approx. 0.58 em per
 * character), clamped to [STRIP_LABEL_MIN, max].
 */
export function stripLabelHeight(labels, fontSize, max = STRIP_LABEL_MAX) {
  const longest = Math.max(0, ...(labels || []).map((l) => `${l ?? ""}`.length));
  return Math.round(Math.max(STRIP_LABEL_MIN, Math.min(max, longest * fontSize * 0.58 + 6)));
}

/**
 * Names over a block of annotation strips (one narrow column each), read
 * bottom-to-top so field names fit above 9-12 px columns.
 */
export default function StripLabels({ labels, columnWidth, left = 0, height }) {
  const fontSize = stripLabelFont(columnWidth);
  const h = height ?? stripLabelHeight(labels, fontSize);
  return (
    <div className="sc-strip-labels" style={{ height: h, marginLeft: left, width: labels.length * columnWidth }}>
      {labels.map((label, k) => (
        <span
          key={`${label}-${k}`}
          className="sc-strip-label"
          style={{ left: k * columnWidth, width: columnWidth, lineHeight: `${columnWidth}px`, fontSize }}
          title={label}
        >
          {label}
        </span>
      ))}
    </div>
  );
}
