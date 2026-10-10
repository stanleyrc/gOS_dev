import React from "react";
import { Tag } from "antd";

/**
 * A quiet, theme-aware tag for labels that carry no data colour (gene names,
 * patient ids, counts): hairline border, secondary ink, no fill. Use it
 * instead of coloured antd Tags for minor labels; keep colour for data
 * (alteration class, clone, cell state) only.
 */
export default function NeutralTag({ style, strong = false, ...rest }) {
  return (
    <Tag
      bordered
      style={{
        background: "transparent",
        borderColor: "var(--sc-border)",
        color: strong ? "var(--sc-text)" : "var(--sc-text-secondary)",
        fontWeight: strong ? 600 : 400,
        marginInlineEnd: 4,
        ...style,
      }}
      {...rest}
    />
  );
}

/** A small colour swatch + neutral text: keeps a data colour (alteration class, state) without a filled pill. */
export function DataSwatch({ color, children, style }) {
  return (
    <span style={{ whiteSpace: "nowrap", ...style }}>
      <span aria-hidden style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: color, marginRight: 6, verticalAlign: "baseline" }} />
      {children}
    </span>
  );
}
