import React from "react";
import { Tooltip } from "antd";
import { columnSpan } from "../../helpers/singleCell/driverColumns";
import { junctionBreakends, junctionLabel, junctionType } from "../../helpers/singleCell/junctionFocus";

const MAX_CHARS = 30;
const LABEL_MIN_COL = 9; // px per column from which labels are written
const ANGLE = 60;
const TYPE_COLOR = { "DEL-like": "#c0504d", "DUP-like": "#3b7dd8", "INV-like": "#8e5bb5", TRA: "#d08a1f" };
const short = (s) => (s.length > MAX_CHARS ? `${s.slice(0, MAX_CHARS - 1)}…` : s);

/**
 * Column header of the Junction CN heatmap: one rotated label per visible junction (when wide
 * enough) and a bar coloured by SV class. Column x positions come from columnSpan, the same
 * mapping as the driver header and the canvas, so labels sit on their columns at any width.
 * `columns` are the visible junctions with their stats: [{ j, n, median }].
 * Click selects the carrier cells; shift-click also zooms the genome domain to the junction.
 */
export default function JunctionColumnHeader({ columns, width, pixelRatio = 1, hoverIndex = null, onClick }) {
  const n = columns.length || 1;
  const cw = width / n;
  const fs = Math.max(9, Math.min(12, cw - 2));
  const named = cw >= LABEL_MIN_COL;
  const longest = named ? Math.max(...columns.map((d) => short(junctionLabel(d.j)).length)) : 0;
  const height = named ? Math.round(Math.min(170, longest * fs * 0.52 * 0.87 + fs * 1.2 + 6)) : 0;
  const spans = columns.map((d, i) => columnSpan(i, columns.length, width, pixelRatio));
  const lean = (fs / 2) * Math.sin((ANGLE * Math.PI) / 180);
  const tip = (d) => (
    <div>
      <div>{junctionBreakends(d.j)}</div>
      <div>{`${junctionType(d.j)}${d.j.class ? ` · ${d.j.class}` : ""}`}</div>
      <div>{`${d.n} cells carry it · median junction CN ${Number.isFinite(d.median) ? d.median : "not available"}`}</div>
      <div style={{ opacity: 0.7, fontSize: 11 }}>click: select carriers; shift-click: also zoom the genome view</div>
    </div>
  );
  return (
    <div style={{ position: "relative", width, height: height + 6, marginBottom: 2 }} data-junction-header>
      {named &&
        columns.map((d, i) => (
          <Tooltip key={d.j.index} title={tip(d)}>
            <span
              role="button"
              data-junction-label={d.j.index}
              data-centre={spans[i].centre}
              onClick={(e) => onClick(d, e)}
              style={{
                position: "absolute",
                left: spans[i].centre + lean,
                bottom: 8,
                transform: `rotate(-${ANGLE}deg)`,
                transformOrigin: "left bottom",
                whiteSpace: "nowrap",
                fontSize: fs,
                lineHeight: `${fs}px`,
                cursor: "pointer",
                color: TYPE_COLOR[junctionType(d.j)],
                fontWeight: d.j.index === hoverIndex ? 700 : 400,
              }}
            >
              {short(junctionLabel(d.j))}
            </span>
          </Tooltip>
        ))}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 5 }}>
        {columns.map((d, i) => (
          <div
            key={d.j.index}
            title={junctionLabel(d.j)}
            data-junction-bar={d.j.index}
            onClick={(e) => onClick(d, e)}
            style={{
              position: "absolute",
              left: spans[i].left,
              width: Math.max(1, spans[i].width - (cw > 4 ? 1 : 0)),
              top: 0,
              bottom: 0,
              background: TYPE_COLOR[junctionType(d.j)],
              cursor: "pointer",
              opacity: d.j.index === hoverIndex ? 1 : 0.6,
            }}
          />
        ))}
      </div>
    </div>
  );
}
