import React from "react";
import { Alert, Button, Typography } from "antd";
import { ExperimentOutlined } from "@ant-design/icons";
import { holdsOrNot, sortNovel } from "../../../helpers/singleCell/portrait";
import useCohortExport from "./useCohortExport";

const { Text } = Typography;

/** Overview card: which canonical GBM features hold, which do not, and the best-supported novel items; links to the Portraits view. */
export default function PortraitHeadlineCard({ dataset, onView }) {
  const { status, data } = useCohortExport(dataset, "portrait.json");
  if (status === "loading") return null;
  if (!data) return <Alert type="info" showIcon message="Patient portraits: not available (_cohort/portrait.json not exported; srctools gos_sc_portrait.py)" />;
  const { holds, mixed, fails } = holdsOrNot(data.matrix, data.neftel_links);
  const novel = sortNovel(data.novel).filter((n) => n.status !== "exploratory").slice(0, 4);
  return (
    <Alert
      type="info"
      showIcon
      icon={<ExperimentOutlined />}
      message={<Text strong>Canonical GBM biology vs novel</Text>}
      description={
        <div>
          {holds.length > 0 && <div><Text strong>Holds: </Text>{holds.map((f) => `${f.label} (${f.tally.text})`).join("; ")}.</div>}
          {mixed.length > 0 && <div><Text strong>Mixed: </Text>{mixed.map((f) => `${f.label} (${f.tally.text})`).join("; ")}.</div>}
          {fails.length > 0 && <div><Text strong>Does not hold: </Text>{fails.map((f) => `${f.label} (${f.tally.text})`).join("; ")}.</div>}
          {novel.length > 0 && <div><Text strong>Novel: </Text>{novel.map((n) => n.title).join("; ")}.</div>}
          {onView && (
            <Button size="small" type="link" style={{ paddingLeft: 0 }} onClick={() => onView("portrait")}>
              Open the patient portraits and the full matrix
            </Button>
          )}
        </div>
      }
    />
  );
}
