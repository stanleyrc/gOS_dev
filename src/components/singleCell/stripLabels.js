import React from "react";

/**
 * Names over a block of annotation strips (one narrow column each), read
 * bottom-to-top so long field names fit above 9-12 px columns.
 */
export default function StripLabels({ labels, columnWidth, left = 0, height = 64 }) {
  return (
    <div className="sc-strip-labels" style={{ height, marginLeft: left, width: labels.length * columnWidth }}>
      {labels.map((label, k) => (
        <span
          key={`${label}-${k}`}
          className="sc-strip-label"
          style={{ left: k * columnWidth, width: columnWidth, lineHeight: `${columnWidth}px` }}
          title={label}
        >
          {label}
        </span>
      ))}
    </div>
  );
}
