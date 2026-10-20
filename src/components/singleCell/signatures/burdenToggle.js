import React from "react";
import { useDispatch, useSelector } from "react-redux";
import { Segmented, Tooltip } from "antd";
import singleCellActions from "../../../redux/singleCell/actions";
import { BURDEN_COUNT, BURDEN_PERCENT, burdenMode } from "../../../helpers/singleCell/signatureBurden";

const TIP =
  "Burden: bar length = mutations attributed to each signature (exposure fraction x SNVs in the set), with the percentage as a label. Percent: every bar full width (exposure share), with the count as a label. Both numbers are always in the labels and tooltips.";

/** Controlled "Burden (count) | Percent" switch; value / onChange given = local state (cohort views). */
export function BurdenSegmented({ value, onChange, size = "small" }) {
  return (
    <Tooltip title={TIP}>
      <Segmented
        size={size}
        value={value}
        onChange={onChange}
        options={[{ value: BURDEN_COUNT, label: "Burden (count)" }, { value: BURDEN_PERCENT, label: "Percent" }]}
      />
    </Tooltip>
  );
}

/** Patient-page scale shared by all signature cards (redux layout.sigScale). */
export function useBurdenMode() {
  const layout = useSelector((s) => s.SingleCell?.layout);
  return burdenMode(layout);
}

export default function BurdenToggle({ size = "small" }) {
  const dispatch = useDispatch();
  const mode = useBurdenMode();
  return <BurdenSegmented size={size} value={mode} onChange={(v) => dispatch(singleCellActions.updateLayout({ sigScale: v }))} />;
}
