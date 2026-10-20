import React from "react";
import { Button, Select, Typography } from "antd";
import { controlKey, fieldRegions, highlightFieldMarks } from "../../../helpers/singleCell/paperAxes";
import { ringBox } from "../../../helpers/singleCell/paperRing";
import { paperStateColor } from "../../../helpers/singleCell/paperPalette";

const { Text } = Typography;

/**
 * Live controls of a paper-figure tab, in one compact toolbar row ABOVE the figure (never over the artwork): one group per
 * panel letter (Fig 1e: patient; a panel of one patient's rows: open any patient in the patient view; plots with patient /
 * gene / clade marks: highlight). controls: figureControls output; values: control key -> chosen value; label: figure label ("Fig 3").
 * live: { status, patients: [{ patient, count }], matched, cells } of the state-score controls for the chosen value.
 */
export default function PanelControls({ controls, values, onChange, label, live, optionsOf, onSelectCells, onClear, onFocusPanel }) {
  const byPanel = new Map();
  controls.forEach((c) => byPanel.set(c.panel.toLowerCase(), [...(byPanel.get(c.panel.toLowerCase()) || []), c]));
  return (
    <div className="sc-paperctl-bar" data-testid="paper-controls">
      {[...byPanel.entries()].map(([letter, list]) => (
        <div key={letter} className="sc-paperctl" onMouseEnter={() => onFocusPanel && onFocusPanel(letter)} onMouseLeave={() => onFocusPanel && onFocusPanel(null)}>
          <span className="sc-paperctl-letter">{`${label || ""}${letter}`}</span>
          {list.map((c) => {
            const key = controlKey(c);
            const opts = optionsOf(c);
            const value = values[key] ?? (c.type === "patient-view" ? c.default : null);
            const isLive = c.source === "state_scores";
            return (
              <div key={key} className="sc-paperctl-row">
                <Text style={{ fontSize: 11 }}>{c.label || (c.type === "patient-view" ? "Open patient" : c.type === "gene" ? "Gene" : c.type === "clade" ? "Clade" : "Patient")}</Text>
                <Select
                  size="small"
                  showSearch
                  allowClear={c.type !== "patient-view"}
                  value={value ?? undefined}
                  placeholder={c.type === "patient-view" ? "patient view" : "all"}
                  style={{ width: 128 }}
                  options={opts.map((o) => ({ value: o.value, label: o.label }))}
                  onChange={(v) => onChange(c, v ?? null)}
                  getPopupContainer={() => document.body}
                />
                {isLive && value && live && live.status === "ok" && (
                  <Button size="small" type="primary" onClick={() => onSelectCells(live.cells, value, `${value} cells of the state quadrant`)} disabled={!live.cells.length}>
                    {`Select ${live.cells.length}`}
                  </Button>
                )}
                {value && c.type !== "patient-view" && (
                  <Button size="small" type="text" onClick={() => onClear(c)}>
                    reset
                  </Button>
                )}
                {isLive && value && live && live.status === "loading" && <Text type="secondary" style={{ fontSize: 11 }}>loading…</Text>}
                {isLive && value && live && live.status === "none" && <Text type="secondary" style={{ fontSize: 11 }}>not available (rna/state_scores.json missing)</Text>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * Overlays of the active controls at scales kx, ky: a wash over the plot areas of the panel (everything else dims) and
 * the chosen patient's / gene's / clade's marks drawn over it, from the sidecar's marks or, for state-score controls,
 * the live cells matched to the static plot.
 */
export function controlOverlays({ controls, values, sidecar, live, kx, ky, keyp }) {
  const out = [];
  controls.forEach((c) => {
    const value = values[controlKey(c)];
    if (!value || c.type === "patient-view") return;
    const kp = `${keyp}c${c.panel}${c.type}`;
    if (c.source === "state_scores") {
      if (!live?.region || !live.cells) return;
      const r = live.region;
      out.push(<div key={`${kp}w`} className="sc-paperctl-wash" style={{ left: r.x * kx, top: r.y * ky, width: r.w * kx, height: r.h * ky }} />);
      live.cells.forEach((cell, i) => out.push(<div key={`${kp}p${i}`} className="sc-paperctl-dot" title={`${cell.cell} · ${cell.state || ""}`} style={{ left: cell.page[0] * kx, top: cell.page[1] * ky, background: paperStateColor(cell.state) || "#444" }} />));
      return;
    }
    fieldRegions(sidecar, c.panel, c.field).forEach((r) => out.push(<div key={`${kp}w${r.id}`} className="sc-paperctl-wash" style={{ left: r.x * kx, top: r.y * ky, width: r.w * kx, height: r.h * ky }} />));
    const h = highlightFieldMarks(sidecar, c.panel, c.field, value);
    h.points.forEach(([x, y], i) => out.push(<div key={`${kp}p${i}`} className="sc-paperctl-dot is-ring" style={ringBox([x, y], kx, ky, 9)} />));
    h.rects.forEach((r, i) => out.push(<div key={`${kp}r${i}`} className="sc-paperctl-rect" style={{ left: r.x * kx, top: r.y * ky, width: Math.max(2, r.w * kx), height: Math.max(2, r.h * ky) }} />));
  });
  return out;
}
