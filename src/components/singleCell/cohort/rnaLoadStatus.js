import React from "react";
import { Alert, Progress, Space, Tag, Typography } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { idList, problemLines, progressText, provisionalLabel, resultNote } from "../../../helpers/singleCell/loadingState";

const { Text } = Typography;

/**
 * Status strip for a Transcriptome view: progress bar with "Loading 4 of 9 patients / 812 of 2,116 cells…",
 * the patients still pending, and one line per patient that failed or has no data (naming the file).
 * `progress` comes from loadProgress() in helpers/singleCell/loadingState.
 */
export default function RnaLoadStatus({ progress, unit = "patients", style }) {
  if (!progress || !progress.total) return null;
  const issues = problemLines(progress);
  if (progress.complete && !issues.length) return null;
  return (
    <div className="sc-load-status" style={{ marginBottom: 8, ...style }}>
      {progress.partial && (
        <Space wrap size={8} data-testid="load-progress">
          <LoadingOutlined />
          <Text strong>{progressText(progress, unit)}</Text>
          <Progress percent={progress.pct} size="small" style={{ width: 200 }} />
          {progress.pending.length > 0 && <Text type="secondary">{`waiting for ${idList(progress.pending)}`}</Text>}
        </Space>
      )}
      {issues.length > 0 && (
        <Alert
          type={progress.failed.length ? "warning" : "info"}
          showIcon
          style={{ marginTop: progress.partial ? 6 : 0, padding: "4px 10px" }}
          message={progress.failed.length ? `${progress.failed.length} file(s) failed to load` : `${progress.none.length} patient(s) not available`}
          description={<div style={{ fontSize: 12 }}>{issues.map((l) => <div key={l}>{l}</div>)}</div>}
        />
      )}
    </div>
  );
}

/** Tag placed next to a statistic that was computed from partial data. */
export function ProvisionalTag({ progress }) {
  const label = provisionalLabel(progress);
  if (!label) return null;
  return <Tag color="orange" style={{ marginInlineEnd: 4 }}>{label}</Tag>;
}

/** Tag plus re-run hint under a result the user computed on demand from partial data. */
export function ResultNote({ ran, usableNow, total }) {
  const n = resultNote(ran, usableNow, total);
  if (!n) return null;
  return (
    <span data-testid="result-provisional">
      <Tag color="orange" style={{ marginInlineEnd: 4 }}>{n.text}</Tag>
      {n.rerun && <Text type="secondary" style={{ fontSize: 12 }}>{n.rerunText}</Text>}
    </span>
  );
}
