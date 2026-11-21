import React, { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Checkbox, Tag, Tooltip, Typography } from "antd";
import singleCellActions from "../../redux/singleCell/actions";
import { hasSPhaseCalls, isSPhaseCell, withSPhaseRule, withSPhaseSearch } from "../../helpers/singleCell/precompute";

const { Text } = Typography;
const NONE = [];

function writeUrl(on) {
  try {
    const search = withSPhaseSearch(window.location.search, on);
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${search}${window.location.hash}`);
  } catch (error) {
    // URL not writable: the setting still applies
  }
}

/**
 * Single-Cell toolbar toggle: hide S-phase cells (precompute S-phase step or the s_phase cell attribute) from the
 * heatmap, tree and every other view. It is the "S-phase cells" rule of the global cell filter (QC tab), mirrored
 * in ?hidesphase=1. Renders nothing when no cell carries an S-phase call.
 */
export default function HideSPhaseControl() {
  const dispatch = useDispatch();
  const cells = useSelector((s) => s.SingleCell.cells);
  const rules = useSelector((s) => s.SingleCell.layout.qcExcludeRules) || NONE;
  const available = useMemo(() => hasSPhaseCalls(cells), [cells]);
  const nS = useMemo(() => cells.filter(isSPhaseCell).length, [cells]);
  if (!available) return null;
  const hide = rules.includes("s_phase");
  const setHide = (on) => {
    dispatch(singleCellActions.updateLayout({ qcExcludeRules: withSPhaseRule(rules, on) }));
    writeUrl(on);
  };
  return (
    <span className="sc-hide-s-phase" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <Tooltip title="Hide the cells called S-phase (s_phase = TRUE) from every view; cells without a call (NA) stay. Same as the S-phase rule of the cell filter in the QC tab.">
        <Checkbox checked={hide} onChange={(e) => setHide(e.target.checked)}>
          Hide S-phase cells
        </Checkbox>
      </Tooltip>
      {hide ? (
        <Tag color={nS ? "orange" : "default"} style={{ marginInlineEnd: 0 }}>
          {nS} of {cells.length} hidden
        </Tag>
      ) : (
        <Text type="secondary">{nS} S-phase</Text>
      )}
    </span>
  );
}
