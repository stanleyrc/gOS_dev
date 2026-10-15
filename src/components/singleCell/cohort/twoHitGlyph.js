import React from "react";
import { Switch, Typography } from "antd";
import { INK, TYPE } from "../../../helpers/singleCell/plotTheme";

const { Text } = Typography;

// Oncoprint glyph of a biallelic tumour-suppressor call (helpers/singleCell/twoHit.js): the cell is split,
// left half = SNV / indel (green), right half = loss of the other copy (amber: LOH / deletion), "2x" badge.
export const TWO_HIT_COLORS = { snv: "#1B9E77", loss: "#E6A100" };

export function TwoHitCell({ x, y, w, h, opacity = 1, label = null }) {
  const half = (w - 4) / 2;
  const fg = label != null ? "#fff" : "#fff";
  return (
    <g pointerEvents="none" data-two-hit>
      <rect x={x + 2} y={y + 2} width={half} height={h - 4} fill={TWO_HIT_COLORS.snv} fillOpacity={opacity} rx={2} />
      <rect x={x + 2 + half} y={y + 2} width={half} height={h - 4} fill={TWO_HIT_COLORS.loss} fillOpacity={opacity} rx={2} />
      <line x1={x + 2 + half} x2={x + 2 + half} y1={y + 2} y2={y + h - 2} stroke="#fff" strokeWidth={1} />
      <text x={x + 2 + half / 2} y={y + h / 2} dy="0.35em" textAnchor="middle" fontSize={TYPE.micro} fontWeight={700} fill={fg}>2×</text>
      {label != null && (
        <text x={x + 2 + half * 1.5} y={y + h / 2} dy="0.35em" textAnchor="middle" fontSize={TYPE.micro} fill="#262626">{label}</text>
      )}
    </g>
  );
}

/** Legend entry + the "biallelic only" filter switch. */
export function TwoHitLegend({ style }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, ...style }}>
      <svg width={26} height={14} aria-hidden="true">
        <rect x={0} y={0} width={13} height={14} fill={TWO_HIT_COLORS.snv} />
        <rect x={13} y={0} width={13} height={14} fill={TWO_HIT_COLORS.loss} />
        <text x={6.5} y={10.5} textAnchor="middle" fontSize={8} fontWeight={700} fill="#fff">2×</text>
      </svg>
      <Text style={{ fontSize: TYPE.label, color: INK.textSecondary }}>
        Biallelic tumour suppressor: SNV / indel (left) + LOH or deletion of the other copy (right), in the same cells
      </Text>
    </span>
  );
}

export function BiallelicSwitch({ checked, onChange, disabled, note }) {
  return (
    <span title={note}>
      <Switch size="small" checked={checked} onChange={onChange} disabled={disabled} />
      <Text style={{ marginLeft: 4 }}>Biallelic only</Text>
    </span>
  );
}
