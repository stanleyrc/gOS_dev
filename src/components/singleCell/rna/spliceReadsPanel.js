import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Segmented, Space, Tag, Typography } from "antd";
import { CloseOutlined } from "@ant-design/icons";
import CellIgvPanel from "../cellIgvPanel";
import { READS_DEFAULT_CONTROLS, READS_DEFAULT_USING, READS_MAX_USING, spliceReadsView } from "../../../helpers/singleCell/spliceEventTable";

const { Text } = Typography;
const k = "components.single-cell.splicing";

/**
 * Raw reads behind a splice event: IGV (per-cell RNA slices from rna/splice_reads) centred on the event's
 * junction (both ends side by side), cells using the junction first (most reads) and a control cell that
 * covers the same cluster without using it. Says which cells are shown and why; without a slice for the
 * event: "reads not available". Spliced reads are drawn by igv.js as blocks joined by a thin line; the
 * pooled sashimi (arcs) of the event's cluster is opened with onSashimi.
 */
export default function SpliceReadsPanel({ event, spliceReads = {}, patientId = null, onSashimi, onClose }) {
  const { t } = useTranslation("common");
  const [all, setAll] = useState(false);
  const r = useMemo(
    () => spliceReadsView(event, { spliceReads, patientId, nUsing: all ? READS_MAX_USING : READS_DEFAULT_USING, nControl: all ? 2 : READS_DEFAULT_CONTROLS }),
    [event, spliceReads, patientId, all]
  );
  if (!event) return null;
  const head = (
    <Space wrap>
      <Text strong>{t(`${k}.reads-title`, { gene: event.gene })}</Text>
      <Text type="secondary" style={{ fontSize: 12.5 }}>{event.summary}</Text>
      {event.clusterId && onSashimi && (
        <Button size="small" onClick={() => onSashimi(event)}>
          {t(`${k}.ev-open-sashimi`)}
        </Button>
      )}
      {onClose && <Button size="small" type="text" icon={<CloseOutlined />} onClick={onClose} />}
    </Space>
  );
  if (!r.available) {
    return (
      <Space direction="vertical" size={6} style={{ width: "100%" }} data-testid="splice-reads-none">
        {head}
        <Alert type="info" showIcon message={t(`${k}.reads-none`)} />
      </Space>
    );
  }
  return (
    <Space direction="vertical" size={6} style={{ width: "100%" }} data-testid="splice-reads">
      {head}
      <Space wrap size={6}>
        <Text type="secondary" style={{ fontSize: 12.5 }}>
          {t(`${k}.reads-shown`, { using: r.nUsing, control: r.nControl })}
        </Text>
        {(r.totalUsing > READS_DEFAULT_USING || r.totalControl > READS_DEFAULT_CONTROLS) && (
          <Segmented
            size="small"
            value={all ? "all" : "few"}
            onChange={(v) => setAll(v === "all")}
            options={[
              { value: "few", label: t(`${k}.reads-few`) },
              { value: "all", label: t(`${k}.reads-all`) },
            ]}
          />
        )}
      </Space>
      <div>
        {r.shown.map((c) => (
          <Tag key={c.id} color={c.role === "control" ? "default" : "blue"} bordered={false} style={{ marginBottom: 2 }}>
            {c.role === "control" ? t(`${k}.reads-tag-control`, { id: c.id, n: c.n }) : t(`${k}.reads-tag-using`, { id: c.id, k: c.k, n: c.n })}
          </Tag>
        ))}
      </div>
      {r.nControl === 0 && <Text type="secondary" style={{ fontSize: 12 }}>{t(`${k}.reads-no-control`)}</Text>}
      <CellIgvPanel view={r.view} embedded />
      <Text type="secondary" style={{ fontSize: 12 }}>{t(`${k}.reads-note`)}</Text>
    </Space>
  );
}
