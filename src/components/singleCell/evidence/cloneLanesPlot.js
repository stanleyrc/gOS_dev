import React, { useState } from "react";
import { Tooltip, Typography } from "antd";
import useContainerWidth from "../useContainerWidth";
import usePlotTheme from "../usePlotTheme";
import ColorTag from "../colorTag";
import { TYPE, isDarkLike } from "../../../helpers/singleCell/plotTheme";

const { Text } = Typography;
const LABEL_W = 132;
const SUM_W = 270;
const ROW_H = 22;
const BAR_H = 14;

/**
 * Per-cell reads at one site, one row per clone in tree order (normal cells last). Each cell is a thin column:
 * red = at least one alt read, blue = reference reads only, a short grey stub = no reads at the site (dropout).
 * Bar height grows with depth (1, 2, 3+ reads). Click a cell to select it.
 */
export default function CloneLanesPlot({ lanes, cloneColors = {}, selected = new Set(), onToggle }) {
  const [ref, width] = useContainerWidth(900);
  const pt = usePlotTheme();
  const [hover, setHover] = useState(null);
  const plotW = Math.max(120, width - LABEL_W - SUM_W - 16);
  const maxN = Math.max(1, ...lanes.map((l) => l.n));
  const step = Math.min(10, plotW / maxN);
  const colW = Math.max(1, step - (step > 3 ? 1 : 0));
  const altColor = pt.danger;
  const refColor = isDarkLike(pt.mode) ? "#69b1ff" : "#1d39c4";
  const stub = isDarkLike(pt.mode) ? "#4a4a4a" : "#d0d0d0";

  return (
    <div ref={ref} style={{ width: "100%" }}>
      {lanes.map((l) => (
        <div key={l.clone} style={{ display: "flex", alignItems: "center", height: ROW_H + 4 }}>
          <div style={{ width: LABEL_W, flex: "none", overflow: "hidden" }}>
            <ColorTag color={cloneColors[l.clone]} style={{ marginRight: 0 }}>
              {l.clone} · {l.n}
            </ColorTag>
          </div>
          <svg width={plotW} height={ROW_H} style={{ flex: "none", display: "block" }}>
            <rect x={0} y={0} width={l.n * step} height={ROW_H} fill={pt.band} />
            {l.cells.map((c, i) => {
              const covered = c.dp > 0;
              const h = covered ? BAR_H * Math.min(1, 0.55 + 0.15 * c.dp) + 4 : 4;
              const fill = !covered ? stub : c.alt > 0 ? altColor : refColor;
              const sel = selected.has(c.id);
              return (
                <rect
                  key={c.id}
                  x={i * step}
                  y={ROW_H - h - 2}
                  width={colW}
                  height={h}
                  fill={fill}
                  stroke={sel ? pt.select : "none"}
                  strokeWidth={sel ? 1.5 : 0}
                  style={{ cursor: covered ? "pointer" : "default" }}
                  onMouseEnter={() => setHover({ ...c })}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => covered && onToggle && onToggle(c.id)}
                />
              );
            })}
          </svg>
          <div style={{ width: SUM_W, flex: "none", paddingLeft: 10, fontSize: TYPE.tick + 1, whiteSpace: "nowrap" }}>
            <Text style={{ fontSize: "inherit" }}>
              <b style={{ color: l.carriers ? altColor : undefined }}>{l.carriers}</b> / {l.covered} covered
            </Text>
            <Text type="secondary" style={{ fontSize: "inherit" }}>
              {" "}
              · {l.alt}/{l.dp} reads
            </Text>
          </div>
        </div>
      ))}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 6, paddingLeft: LABEL_W, fontSize: TYPE.tick + 1 }}>
        <Legend color={altColor} text="alt read(s)" />
        <Legend color={refColor} text="reference reads only (not wild type: one allele may have dropped out)" />
        <Legend color={stub} text="no reads at the site (dropout)" small />
        <Tooltip title="Columns follow the heatmap / tree order within each clone">
          <Text type="secondary" style={{ fontSize: "inherit" }}>
            cells in tree order · right: carrier / covered cells · alt / total reads
          </Text>
        </Tooltip>
      </div>
      <div style={{ minHeight: 20, paddingLeft: LABEL_W, fontSize: TYPE.tick + 1 }}>
        {hover ? (
          <Text>
            <b>{hover.id}</b> · {hover.clone} · {hover.dp ? `${hover.alt} alt / ${hover.dp} reads` : "no reads"}
            {hover.p != null ? ` · P(mutant) ${hover.p.toFixed(2)}` : ""}
            {hover.miss != null && hover.alt === 0 && hover.dp > 0 ? ` · chance a mutant cell shows no alt here ${hover.miss.toFixed(2)}` : ""}
          </Text>
        ) : (
          <Text type="secondary">Hover a cell for its reads; click to select it (selection is shared with the other tabs).</Text>
        )}
      </div>
    </div>
  );
}

function Legend({ color, text, small }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <svg width={8} height={14}>
        <rect x={1} y={small ? 10 : 0} width={6} height={small ? 4 : 14} fill={color} />
      </svg>
      <Text type="secondary" style={{ fontSize: "inherit" }}>
        {text}
      </Text>
    </span>
  );
}
