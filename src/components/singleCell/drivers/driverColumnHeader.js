import React from "react";
import { Tooltip } from "antd";
import { classLabel } from "../../../helpers/singleCell/driverLayer";
import { CLASS_TEXT } from "./driverColors";

const MAX_CHARS = 26;
const LABEL_MIN_COL = 9; // px per column from which names are written
const short = (s) => (s.length > MAX_CHARS ? `${s.slice(0, MAX_CHARS - 1)}…` : s);

/**
 * Column header of the Drivers layer: one rotated name per driver (when the
 * columns are wide enough), a bar coloured by event class under it; hover for
 * the details, click for the driver drawer.
 */
export default function DriverColumnHeader({ entries, width, hoverKey, openKey, onOpen }) {
  const n = entries.length || 1;
  const cw = width / n;
  const fs = Math.max(9, Math.min(11, cw - 2));
  const named = cw >= LABEL_MIN_COL;
  const longest = named ? Math.max(...entries.map((d) => short(d.label).length)) : 0;
  const height = named ? Math.round(Math.min(150, longest * fs * 0.52 * 0.87 + fs * 1.2 + 6)) : 0;
  return (
    <div style={{ position: "relative", width, height: height + 6, marginBottom: 2 }}>
      {named &&
        entries.map((d, i) => (
          <Tooltip key={d.key} title={`${d.label} · ${classLabel(d)} · ${d.n} cells${d.upstreamOnly ? " · upstream of gene only" : ""}`}>
            <span
              role="button"
              onClick={() => onOpen(d.key)}
              style={{
                position: "absolute",
                left: i * cw + cw / 2 - fs / 2 + 2,
                bottom: 8,
                transform: "rotate(-60deg)",
                transformOrigin: "left bottom",
                whiteSpace: "nowrap",
                fontSize: fs,
                lineHeight: `${fs}px`,
                cursor: "pointer",
                color: CLASS_TEXT[d.cls],
                fontWeight: d.key === hoverKey || d.key === openKey ? 700 : 400,
                textDecoration: d.key === openKey ? "underline" : "none",
                opacity: d.upstreamOnly ? 0.65 : 1,
              }}
            >
              {short(d.label)}
            </span>
          </Tooltip>
        ))}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 5, display: "flex" }}>
        {entries.map((d) => (
          <div
            key={d.key}
            title={d.label}
            onClick={() => onOpen(d.key)}
            style={{ flex: "1 1 0", minWidth: 0, background: CLASS_TEXT[d.cls], cursor: "pointer", opacity: d.key === hoverKey || d.key === openKey ? 1 : 0.55, borderRight: cw > 4 ? "1px solid var(--sc-panel, #fff)" : "none" }}
          />
        ))}
      </div>
    </div>
  );
}
