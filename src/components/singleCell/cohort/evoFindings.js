import React from "react";
import { Typography } from "antd";
import { TYPE } from "../../../helpers/singleCell/plotTheme";
import usePlotTheme from "../usePlotTheme";

const { Text } = Typography;

/** Bold every number-like token ("3/4", "0.012", "85%") so the counts stand out. */
function emphasise(text) {
  const parts = `${text}`.split(/(\d+\/\d+|\d+(?:\.\d+)?%?|p < 0\.001)/g);
  return parts.map((p, k) => (k % 2 ? <strong key={k}>{p}</strong> : <React.Fragment key={k}>{p}</React.Fragment>));
}

/**
 * Headline findings of a cohort view, numbered and clickable: clicking one
 * shows its supporting trees and cells below (the caller's `onSelect`).
 */
export default function EvoFindings({ findings = [], selected = null, onSelect, title = "Headline findings" }) {
  const theme = usePlotTheme();
  if (!findings.length) return null;
  return (
    <div style={{ border: `1px solid ${theme.border}`, borderRadius: 6, padding: "8px 10px", background: theme.panel }}>
      <Text strong style={{ fontSize: TYPE.title }}>{title}</Text>
      <ol style={{ margin: "6px 0 0", paddingLeft: 0, listStyle: "none" }}>
        {findings.map((f, k) => {
          const on = selected === k;
          return (
            <li key={k}>
              <button
                type="button"
                onClick={() => onSelect && onSelect(on ? null : k)}
                style={{
                  display: "flex",
                  gap: 8,
                  width: "100%",
                  textAlign: "left",
                  border: "none",
                  borderLeft: `3px solid ${on ? theme.accent : "transparent"}`,
                  background: on ? theme.selectFill : "transparent",
                  padding: "4px 8px",
                  cursor: "pointer",
                  color: theme.text,
                  fontSize: TYPE.body,
                  lineHeight: 1.45,
                  borderRadius: 3,
                }}
                title="Show the supporting trees and cells"
              >
                <span style={{ color: theme.muted, minWidth: 16 }}>{k + 1}.</span>
                <span>
                  {emphasise(f.text)}
                  {f.stat && <span style={{ color: theme.muted }}>{` ${f.stat}`}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
