import React from "react";
import { Tag, Typography } from "antd";
import { HIT_LABEL, MIN_HIT_CELLS, STATE_LABEL, hitOverlap } from "../../../helpers/singleCell/twoHit";
import { TYPE } from "../../../helpers/singleCell/plotTheme";

const { Text } = Typography;
const STATE_COLOR = { biallelic: "purple", homdel: "blue", monoallelic: "default", none: "default" };

/** Drawer block: the tumour-suppressor two-hit call of an entry (twoHit.js): every hit with cells / VAF, overlap, data source. */
export default function TwoHitBlock({ call }) {
  if (!call) return null;
  const ov = hitOverlap(call);
  return (
    <div style={{ marginBottom: 10 }} data-two-hit-block>
      <div style={{ marginBottom: 4 }}>
        <Text strong>{`${call.gene} hits: `}</Text>
        <Tag color={STATE_COLOR[call.state]}>{STATE_LABEL[call.state]}</Tag>
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: TYPE.label }}>
        {call.hits.map((h, i) => (
          <li key={`${h.kind}-${i}`}>
            <b>{h.kind === "snv" ? `${HIT_LABEL.snv}: ${h.text}` : HIT_LABEL[h.kind] || h.kind}</b>
            {` · ${h.n}/${call.tumorN} tumour cells (${Math.round((h.fraction || 0) * 100)}%)${h.n < MIN_HIT_CELLS ? ", too few to count" : ""}`}
            {h.vaf != null ? ` · VAF ${(h.vaf * 100).toFixed(1)}%` : ""}
            <Text type="secondary">{` · ${h.source}`}</Text>
          </li>
        ))}
      </ul>
      {call.snvCells > 0 && call.lossIds.size > 0 && (
        <div style={{ fontSize: TYPE.label }}>{`SNV carriers with the loss too: ${ov.both} of ${call.snvCells} (SNV only ${ov.snvOnly}, loss only ${ov.lossOnly}); dropout hides some SNV reads, so overlap is a lower bound.`}</div>
      )}
      {call.vafSuggestsLoh && <div style={{ fontSize: TYPE.label }}>The SNV VAF is near 1, which is consistent with LOH of the wild-type copy, but no LOH was called from the allelic CN.</div>}
      <Text type="secondary" style={{ fontSize: TYPE.label }}>{`Loss source: ${call.lossSource}.`}</Text>
    </div>
  );
}
