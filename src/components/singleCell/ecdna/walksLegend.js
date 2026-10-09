import React from "react";
import { useTranslation } from "react-i18next";
import { INK } from "../../../helpers/singleCell/plotTheme";

const Glyph = ({ children }) => (
  <svg width={30} height={14} style={{ display: "block", flex: "none" }} aria-hidden>
    {children}
  </svg>
);

/** Key to the walk plot's marks, and the gestures it understands. */
export default function WalksLegend() {
  const { t } = useTranslation("common");
  const k = (key) => t(`components.single-cell.ecdna.${key}`);
  const item = { display: "inline-flex", alignItems: "center", gap: 5 };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 18px", fontSize: 12, color: INK.muted, marginTop: 6, paddingTop: 6, borderTop: `1px solid var(--sc-border-soft, ${INK.borderSoft})` }}>
      <span style={item}>
        <Glyph>
          <polygon points="2,3 22,3 28,7 22,11 2,11" fill={INK.faint} stroke={INK.axis} strokeWidth={0.8} />
        </Glyph>
        {k("legend-segment")}
      </span>
      <span style={item}>
        <Glyph>
          <rect x={1} y={8} width={8} height={5} fill={INK.faint} />
          <rect x={21} y={8} width={8} height={5} fill={INK.faint} />
          <path d="M8,8 C8,1 22,1 22,8" fill="none" stroke={INK.danger} strokeWidth={1.6} />
        </Glyph>
        {k("legend-alt")}
      </span>
      <span style={item}>
        <Glyph>
          <rect x={2} y={8} width={20} height={5} fill={INK.faint} />
          <line x1={20} x2={20} y1={8} y2={4} stroke={INK.danger} strokeWidth={1.4} />
          <circle cx={20} cy={3} r={2.5} fill={INK.faint} stroke={INK.danger} />
        </Glyph>
        {k("legend-anchor")}
      </span>
      <span style={item}>
        <Glyph>
          <rect x={1} y={5} width={8} height={5} fill={INK.faint} />
          <line x1={9} x2={21} y1={7.5} y2={7.5} stroke={INK.axis} strokeDasharray="2 2" />
          <rect x={21} y={5} width={8} height={5} fill={INK.faint} />
        </Glyph>
        {k("legend-gap")}
      </span>
      <span style={{ marginLeft: "auto" }}>{k("legend-gestures")}</span>
    </div>
  );
}
