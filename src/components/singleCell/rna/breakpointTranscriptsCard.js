import React, { useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { Alert, Card, Empty, Input, Select, Space, Table, Tag, Tooltip, Typography } from "antd";
import { BranchesOutlined } from "@ant-design/icons";
import HintLine from "../hintLine";
import ConfidenceToggle, { ConfidenceBadge, useFindingConfidence } from "../confidenceToggle";
import { LocusLinks } from "./breakpointRnaBlock";
import { nearbySvText, contrastText, crossText, emptyMessage, headlineCounts, readsText, visibleTranscripts } from "../../../helpers/singleCell/breakpointRna";

const { Text } = Typography;
const TIER_RANK = { consistent: 0, suggestive: 1, low: 2 };

/**
 * Breakpoint-crossing transcripts (rna/breakpoint_transcripts.json): DNA structural variants whose breakpoint is crossed by RNA
 * reads, with carriers of the SV compared to non-carriers. Shares the less-confident toggle with the splicing and fusion views.
 */
export default function BreakpointTranscriptsCard() {
  const source = useSelector((s) => s.SingleCell.rnaBreakpoint);
  const [level, setLevel] = useFindingConfidence();
  const [stratum, setStratum] = useState("all");
  const [query, setQuery] = useState("");
  const data = source?.status === "ok" ? source.data : null;
  const all = data?.transcripts || [];
  const counts = useMemo(() => headlineCounts(all, level), [all, level]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return visibleTranscripts(all, level).filter((t) => (stratum === "all" || t.stratum === stratum) && (!q || `${t.label} ${t.cls} ${t.jid}`.toLowerCase().includes(q)));
  }, [all, level, stratum, query]);
  const msg = emptyMessage(source, shown.length, all.length);
  const title = (
    <Space>
      <BranchesOutlined />
      <span>Transcripts across DNA breakpoints</span>
      {data && <Tag color="blue" data-bp-headline>{`${counts.n} of ${counts.total} SVs`}</Tag>}
      <HintLine inline text="Structural variants (DNA, tier_v2 junction calls) whose breakpoint is crossed by RNA reads in single-cell RNA. Carriers of the SV are compared with non-carriers: cells with RNA across the breakpoint out of cells with RNA. Consistent: at least 5 carrier cells with RNA across the breakpoint, carrier rate at least 5x the non-carrier rate and Fisher p < 0.05; suggestive: at least 2 carrier cells and a higher carrier than non-carrier rate; otherwise low." />
    </Space>
  );
  if (!data) {
    return (
      <Card size="small" title={title}>
        {source?.status === "error" ? <Alert type="warning" showIcon message={`Breakpoint transcripts not available (${source.error?.message || source.error})`} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyMessage(source, 0, 0)} />}
      </Card>
    );
  }
  const columns = [
    { title: "Confidence", key: "conf", width: 100, defaultSortOrder: "ascend", sorter: (a, b) => (TIER_RANK[a.confidence] ?? 3) - (TIER_RANK[b.confidence] ?? 3) || b.cross_car - a.cross_car, render: (_, t) => <ConfidenceBadge item={{ confidence: t.confidence, confidence_reason: (t.confidence_reasons || []).join("; ") }} /> },
    { title: "Transcript", key: "label", sorter: (a, b) => a.label.localeCompare(b.label), render: (_, t) => <Text strong>{t.label}</Text> },
    { title: "Class", dataIndex: "cls", sorter: (a, b) => `${a.cls}`.localeCompare(`${b.cls}`) },
    { title: "Stratum", dataIndex: "stratum", render: (v) => (v ? <Tag color={v === "amplicon" ? "purple" : "default"}>{v}</Tag> : null) },
    { title: "Carriers RNA x/y", key: "car", align: "right", sorter: (a, b) => a.cross_car - b.cross_car, render: (_, t) => crossText(t.cross_car, t.n_car_rna) },
    { title: "Non-carriers x/y", key: "non", align: "right", sorter: (a, b) => a.cross_non - b.cross_non, render: (_, t) => crossText(t.cross_non, t.n_non_rna) },
    { title: "Fold", key: "fold", align: "right", sorter: (a, b) => (a.fold ?? 1e9) - (b.fold ?? 1e9), render: (_, t) => (t.fold != null ? `${t.fold.toFixed(1)}x` : t.non_rate === 0 ? <Tooltip title="Non-carrier rate is 0">inf</Tooltip> : "n.a.") },
    { title: "Reads (car / non)", key: "reads", align: "right", render: (_, t) => readsText(t) },
    { title: "Frame", dataIndex: "frame", render: (v, t) => (v ? <Tooltip title={t.consequence || ""}><span>{v}</span></Tooltip> : "n.a.") },
    { title: "IGV", key: "igv", render: (_, t) => <LocusLinks transcript={t} /> },
  ];
  return (
    <Card size="small" title={title} data-breakpoint-card>
      <Space wrap style={{ marginBottom: 8 }}>
        <ConfidenceToggle level={level} onChange={setLevel} counts={counts.counts} label="Show less confident findings" />
        <Input.Search size="small" allowClear placeholder="Search transcript / class / SV id" style={{ width: 200 }} onSearch={setQuery} onChange={(e) => !e.target.value && setQuery("")} />
        <Select size="small" style={{ width: 130 }} value={stratum} onChange={setStratum} options={[{ value: "all", label: "all strata" }, { value: "amplicon", label: "amplicon" }, { value: "non-amplicon", label: "non-amplicon" }]} />
        <Text type="secondary">{`${counts.n} shown, ${counts.hidden} hidden by confidence, ${counts.total} SVs with RNA across the breakpoint`}</Text>
      </Space>
      {msg ? (
        <Alert type="info" showIcon message={msg} />
      ) : (
        <Table
          size="small"
          rowKey="key"
          dataSource={shown}
          columns={columns}
          pagination={{ pageSize: 10, size: "small", showSizeChanger: true, pageSizeOptions: [10, 25, 50] }}
          expandable={{ expandedRowRender: (t) => <Text type="secondary">{`${contrastText(t)}${t.consequence ? `; ${t.consequence}` : ""}${t.confidence_reasons?.length ? `; ${t.confidence_reasons.join("; ")}` : ""}${nearbySvText(t).length ? `; nearby genomic SV (DNA evidence): ${nearbySvText(t).join(", ")}` : ""}${t.added_reason ? `; ${t.added_reason}` : ""}`}</Text> }}
          scroll={{ x: "max-content" }}
        />
      )}
    </Card>
  );
}
