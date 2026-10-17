import React from "react";
import { Tag, Tooltip, Typography } from "antd";
import { driverHref, linkClick } from "../../../helpers/singleCell/driverLink";
import { summaryEvent, summaryTitle } from "../../../helpers/singleCell/tsgHits";

const { Text } = Typography;

/**
 * "TSG hits" badge row: one badge per tumour suppressor with two or more hits ("TP53 ×2 (biallelic, 98%)"), each linking to the driver in
 * the patient's Drivers layer. `tsg` is the result of useTsgBadges.
 */
export default function TsgBadgeRow({ patient, tsg, label = "TSG hits", inline = false }) {
  const head = inline ? null : <div style={{ fontSize: 12, color: "var(--sc-muted, #8c8c8c)", textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</div>;
  if (!tsg || tsg.status === "loading") return null;
  if (tsg.status === "none") {
    return (
      <div data-tsg-badges>
        {head}
        <Text type="secondary" style={{ fontSize: 13 }}>not available (filtered.events.json)</Text>
      </div>
    );
  }
  return (
    <div data-tsg-badges>
      {head}
      {tsg.badges.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
          {tsg.badges.map((s) => (
            <Tooltip key={s.gene} title={<div style={{ whiteSpace: "pre-line", maxWidth: 440 }}>{`${summaryTitle(s)}\nClick to open in ${patient} (Drivers layer).`}</div>}>
              <a href={driverHref(patient, summaryEvent(s))} onClick={linkClick}>
                <Tag color={s.state === "biallelic" ? "green" : "gold"} style={{ margin: 0, fontSize: 13, cursor: "pointer" }}>{s.badge}</Tag>
              </a>
            </Tooltip>
          ))}
        </div>
      ) : (
        <Text type="secondary" style={{ fontSize: 13 }}>{`no tumour suppressor with two hits${tsg.hasLoss ? "" : " (allelic LOH not available)"}`}</Text>
      )}
    </div>
  );
}
