import React from "react";
import { Tooltip } from "antd";
import { classLabel } from "../../../helpers/singleCell/driverLayer";
import { columnSpan } from "../../../helpers/singleCell/driverColumns";
import { SIGNATURE_METHOD_HINT } from "../../../helpers/singleCell/siteSignature";
import { CLASS_TEXT } from "./driverColors";

const MAX_CHARS = 26;
const LABEL_MIN_COL = 9; // px per column from which names are written
const short = (s) => (s.length > MAX_CHARS ? `${s.slice(0, MAX_CHARS - 1)}…` : s);
const DriverTip = ({ d, sig }) => (
  <div>
    <div>{`${d.label} · ${classLabel(d.entry)} · ${d.n} cells${d.upstreamOnly ? " · upstream of gene only" : ""}${d.members.length > 1 ? ` · same CN pattern: ${d.genes.join(", ")}` : ""}`}</div>
    {sig && <div style={{ marginTop: 4 }}>{`Signature: ${sig}`}</div>}
    {sig && <div style={{ opacity: 0.7, fontSize: 11 }}>{SIGNATURE_METHOD_HINT()}</div>}
  </div>
);
const ANGLE = 60; // labels lean 60 degrees up to the right

/**
 * Column header of the Drivers layer: one rotated name per visible driver (when the
 * columns are wide enough), a bar coloured by event class under it; hover for the
 * details, click for the driver drawer. Column x positions come from columnSpan, the
 * same mapping the heatmap canvas uses, so each name sits on its column at any width,
 * zoom or pixel ratio. `entries` are the visible columns only (re-flows on zoom).
 */
export default function DriverColumnHeader({ sigText = null, entries, width, pixelRatio = 1, hoverKey, openKey, onOpen }) {
  const n = entries.length || 1;
  const cw = width / n;
  const fs = Math.max(9, Math.min(12, cw - 2));
  const named = cw >= LABEL_MIN_COL;
  const longest = named ? Math.max(...entries.map((d) => short(d.label).length)) : 0;
  const height = named ? Math.round(Math.min(150, longest * fs * 0.52 * 0.87 + fs * 1.2 + 6)) : 0;
  const spans = entries.map((d, i) => columnSpan(i, entries.length, width, pixelRatio));
  // the text's mid-line starts at (column centre, bottom): rotate about the bottom-left corner and
  // shift right by half the line height measured across the lean
  const lean = (fs / 2) * Math.sin((ANGLE * Math.PI) / 180);
  return (
    <div style={{ position: "relative", width, height: height + 6, marginBottom: 2 }} data-driver-header>
      {named &&
        entries.map((d, i) => (
          <Tooltip key={d.key} title={<DriverTip d={d} sig={sigText ? sigText(d.entry) : null} />}>
            <span
              role="button"
              data-driver-label={d.key}
              data-centre={spans[i].centre}
              onClick={() => onOpen(d.key)}
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
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 5 }}>
        {entries.map((d, i) => (
          <div
            key={d.key}
            title={d.label}
            data-driver-bar={d.key}
            onClick={() => onOpen(d.key)}
            style={{
              position: "absolute",
              left: spans[i].left,
              width: Math.max(1, spans[i].width - (cw > 4 ? 1 : 0)),
              top: 0,
              bottom: 0,
              background: CLASS_TEXT[d.cls],
              cursor: "pointer",
              opacity: d.key === hoverKey || d.key === openKey ? 1 : 0.55,
            }}
          />
        ))}
      </div>
    </div>
  );
}
