import React, { useCallback, useEffect, useState } from "react";
import { Checkbox, Segmented, Space, Tag, Tooltip, Typography } from "antd";
import {
  CONFIDENCE_COLOR,
  CONFIDENCE_HELP,
  CONFIDENCE_LABEL,
  DEFAULT_CONFIDENCE_LEVEL,
  SPLICE_CONFIDENCE_PARAM,
  confidenceFromSearch,
  confidenceSummary,
  confidenceTooltip,
  tierOf,
  withConfidence,
} from "../../helpers/singleCell/findingConfidence";

const { Text } = Typography;
const EVENT = "gos:finding-confidence";

const readLevel = (param) => {
  try {
    return confidenceFromSearch(window.location.search, param);
  } catch (e) {
    return DEFAULT_CONFIDENCE_LEVEL;
  }
};

/**
 * [level, setLevel]: the least confident tier shown, kept in the URL (`param`, default spliceconf=suggestive | low) and
 * shared by every view using the same parameter (findings strip, tab label, splicing card, cohort panel).
 */
export function useFindingConfidence(param = SPLICE_CONFIDENCE_PARAM) {
  const [level, setState] = useState(() => readLevel(param));
  useEffect(() => {
    const sync = (e) => {
      if (!e?.detail || e.detail.param === param) setState(readLevel(param));
    };
    window.addEventListener(EVENT, sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("popstate", sync);
    };
  }, [param]);
  const set = useCallback(
    (next) => {
      try {
        window.history.replaceState(window.history.state, "", `${window.location.pathname}${withConfidence(window.location.search, next, param)}${window.location.hash}`);
      } catch (e) {
        // URL not writable: the level still applies to this view
      }
      setState(next);
      try {
        window.dispatchEvent(new CustomEvent(EVENT, { detail: { param } }));
      } catch (e) {
        // no CustomEvent (old browser): other views update on their next render
      }
    },
    [param]
  );
  return [level, set];
}

/** Tier tag with the reason on hover. Nothing for untiered items. */
export function ConfidenceBadge({ item, style }) {
  const tier = tierOf(item?.confidence);
  if (!tier) return null;
  return (
    <Tooltip title={confidenceTooltip(item)}>
      <Tag color={CONFIDENCE_COLOR[tier]} bordered={tier !== "consistent"} style={{ fontSize: 11, marginInlineEnd: 4, ...(style || {}) }} data-confidence={tier}>
        {CONFIDENCE_LABEL[tier]}
      </Tag>
    </Tooltip>
  );
}

/**
 * "Show less confident findings" checkbox; when on, a choice of how far down (suggestive, or suggestive + low).
 * counts ({ consistent, suggestive, low }) give the shown / hidden line.
 */
export default function ConfidenceToggle({ level, onChange, counts = null, label = "Show less confident findings" }) {
  const on = level !== DEFAULT_CONFIDENCE_LEVEL;
  const n = (t) => (counts ? ` (${counts[t] || 0})` : "");
  return (
    <Space wrap size={6} data-testid="confidence-toggle">
      <Tooltip title={`Default: ${CONFIDENCE_HELP.consistent}`}>
        <Checkbox checked={on} onChange={(e) => onChange(e.target.checked ? "suggestive" : DEFAULT_CONFIDENCE_LEVEL)}>
          {label}
        </Checkbox>
      </Tooltip>
      {on && (
        <Segmented
          size="small"
          value={level}
          onChange={onChange}
          options={[
            { value: "suggestive", label: <Tooltip title={CONFIDENCE_HELP.suggestive}>{`+ suggestive${n("suggestive")}`}</Tooltip> },
            { value: "low", label: <Tooltip title={CONFIDENCE_HELP.low}>{`+ suggestive + low${n("low")}`}</Tooltip> },
          ]}
        />
      )}
      {counts && (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {confidenceSummary(counts, level)}
        </Text>
      )}
    </Space>
  );
}
