import React, { createContext, useContext } from "react";
import { Tooltip } from "antd";
import { f1Style, f1Tooltip } from "../../../helpers/singleCell/cladeF1View";

/** The header Clade F1 filter state ({ on, min, hidden }), provided by the cohort page so tooltips can name the link. */
export const CladeF1Context = createContext(null);
export const useCladeF1Filter = () => useContext(CladeF1Context);

/** Clade F1 value in the colour scale of the All events table (red < 0.5, green bold >= 0.8), with the explanatory tooltip. */
export default function CladeF1Chip({ value, prefix = "F1 ", style = {}, tip = null }) {
  const filter = useCladeF1Filter();
  if (!Number.isFinite(value)) return null;
  return (
    <Tooltip title={tip ? `${tip}. ${f1Tooltip(value, filter)}` : f1Tooltip(value, filter)}>
      <span style={{ ...f1Style(value), fontSize: 11, whiteSpace: "nowrap", ...style }}>{`${prefix}${value.toFixed(2)}`}</span>
    </Tooltip>
  );
}
