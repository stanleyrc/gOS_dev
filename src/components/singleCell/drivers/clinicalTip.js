import React from "react";
import { clinicalBadge, clinicalHighlights, clinicalTooltipLines, clinvarLine, gnomadLine, hasClinical, recessiveNote } from "../../../helpers/singleCell/clinicalEvents";
import { HIGHLIGHT_BG } from "./driverColors";

const Line = ({ line }) =>
  line ? (
    <div>
      {line.text}
      {line.link && (
        <>
          {" "}
          <a href={line.link} target="_blank" rel="noopener noreferrer" onClick={(ev) => ev.stopPropagation()}>link</a>
        </>
      )}
    </div>
  ) : null;

/** Clinical-assay block of a driver tooltip / drawer: report line, single-cell status, ClinVar, gnomAD, highlight tags. */
export default function ClinicalTip({ event }) {
  if (!hasClinical(event)) return null;
  const [report, cells] = clinicalTooltipLines(event);
  const tags = clinicalHighlights(event);
  const note = recessiveNote(event);
  return (
    <div style={{ marginTop: 4 }} data-clinical-tip>
      <div style={{ fontWeight: 600 }}>
        {clinicalBadge(event)}
        {tags.map((t) => (
          <span key={t} style={{ marginLeft: 6, padding: "0 4px", background: HIGHLIGHT_BG, color: "#262626", borderRadius: 2 }}>{t}</span>
        ))}
      </div>
      <div>{report}</div>
      <div>{cells}</div>
      <Line line={clinvarLine(event)} />
      <Line line={gnomadLine(event)} />
      {note && <div>{note}</div>}
    </div>
  );
}
